using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;

namespace GameLibrary.Native;

public sealed class JobWindow : Window
{
    private readonly LibraryStore store;
    private readonly string script;
    private readonly string[] containers;
    private readonly bool openInDefaultTerminal;
    private readonly bool wsl2;
    private readonly string scriptExtension;
    private readonly string? completionDestination;
    private readonly string[] completionGameIds;
    private readonly IReadOnlyDictionary<string, string> containerGameIds;
    private readonly HashSet<string> notifiedCompletions = new(StringComparer.Ordinal);
    private DateTime completionStartedAtUtc;
    private readonly TextBox output = new() { IsReadOnly = true, AcceptsReturn = true, TextWrapping = TextWrapping.NoWrap, VerticalScrollBarVisibility = ScrollBarVisibility.Auto, HorizontalScrollBarVisibility = ScrollBarVisibility.Auto, FontFamily = new System.Windows.Media.FontFamily("Consolas"), FontSize = 12 };
    private readonly TextBlock status = new() { Text = "Starting…", Margin = new Thickness(0, 10, 0, 0) };
    private Process? process;
    private readonly string log;
    public bool Running { get; private set; }
    internal int? LastExitCode { get; private set; }
    internal string DisplayedOutput => output.Text;
    public event Action<bool>? Completed;
    public event Func<string, Task>? GameCompleted;
    private bool cancelled;
    private bool started;
    internal static ProcessStartInfo BuildDefaultTerminalStartInfo(string path)
    {
        if (!Path.GetExtension(path).Equals(".bat", StringComparison.OrdinalIgnoreCase)) throw new ArgumentException("The default Windows terminal launcher requires a BAT script.", nameof(path));
        return new ProcessStartInfo(path) { UseShellExecute = true, WorkingDirectory = Path.GetDirectoryName(Path.GetFullPath(path))! };
    }
    public JobWindow(LibraryStore store, string script, string[] containers, bool openInDefaultTerminal = false, string scriptExtension = "ps1", string? completionDestination = null, IEnumerable<string>? completionGameIds = null)
    {
        this.store = store; this.script = script; this.containers = containers;
        this.openInDefaultTerminal = openInDefaultTerminal;
        this.wsl2 = scriptExtension.TrimStart('.').Equals("sh", StringComparison.OrdinalIgnoreCase);
        this.scriptExtension = scriptExtension.TrimStart('.').ToLowerInvariant() switch { "bat" => "bat", "sh" => "sh", _ => "ps1" };
        this.completionDestination = string.IsNullOrWhiteSpace(completionDestination) ? null : Path.GetFullPath(completionDestination);
        this.completionGameIds = completionGameIds?.Where(id => !string.IsNullOrWhiteSpace(id)).Distinct(StringComparer.Ordinal).ToArray() ?? Array.Empty<string>();
        var identityMap = new Dictionary<string, string>(StringComparer.Ordinal);
        for (int i = 0; i < Math.Min(containers.Length, this.completionGameIds.Length); i++)
            identityMap[containers[i]] = this.completionGameIds[i];
        this.containerGameIds = identityMap;
        Style = (Style)System.Windows.Application.Current.FindResource(typeof(Window));
        Title = openInDefaultTerminal ? "Game Library · Download terminal" : wsl2 ? "Game Library · WSL2 Ubuntu install" : "Game Library · Download progress";
        Width = 900; Height = 600; MinWidth = 600; MinHeight = 400;
        var grid = new DockPanel { Margin = new Thickness(18) };
        var stop = new Button { Content = "Stop this operation", Margin = new Thickness(0, 0, 0, 12), HorizontalAlignment = HorizontalAlignment.Left };
        stop.Click += async (_, _) => await Stop(); DockPanel.SetDock(stop, Dock.Top); grid.Children.Add(stop);
        DockPanel.SetDock(status, Dock.Bottom); grid.Children.Add(status); grid.Children.Add(output); Content = grid;
        Directory.CreateDirectory(Path.Combine(store.Root, "jobs"));
        log = Path.Combine(store.Root, "jobs", DateTime.Now.ToString("yyyyMMdd-HHmmss-fff") + ".log");
        Loaded += async (_, _) => await Run();
        Closing += (_, e) => { if (Running) { e.Cancel = true; status.Text = "Stop the operation before closing. Partial files will be preserved."; } };
    }
    private void Append(string? line)
    {
        if (line == null) return;
        Dispatcher.Invoke(() =>
        {
            var text = DateTime.Now.ToString("HH:mm:ss") + "  " + line + Environment.NewLine;
            File.AppendAllText(log, text);
            if (output.Text.Length > 500_000) output.Text = output.Text[^250_000..];
            output.AppendText(text); output.ScrollToEnd();
        });
    }
    private async Task Run()
    {
        if (started) return;
        started = true;
        Running = true;
        using var completionCancellation = new CancellationTokenSource();
        Task completionMonitor = Task.CompletedTask;
        try
        {
            string path = Path.ChangeExtension(log, "." + scriptExtension);
            File.WriteAllText(path, script, scriptExtension == "bat" ? new System.Text.UTF8Encoding(false) : new System.Text.UTF8Encoding(true));
            ProcessStartInfo start;
            if (openInDefaultTerminal)
            {
                // Launch the script exactly as the website does. UseShellExecute lets
                // Windows hand the .BAT to the user's configured default terminal
                // (Windows Terminal or the legacy console host) instead of hiding a
                // PowerShell child inside the WPF process.
                start = BuildDefaultTerminalStartInfo(path);
            }
            else if (wsl2)
            {
                string wslScript = DockerScripts.ToWslPath(path).Replace("'", "'\\''");
                start = new ProcessStartInfo("wsl.exe") { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
                start.ArgumentList.Add("--"); start.ArgumentList.Add("bash"); start.ArgumentList.Add("-lc");
                start.ArgumentList.Add("bash '" + wslScript + "'");
            }
            else
            {
                start = new ProcessStartInfo(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "System32", "WindowsPowerShell", "v1.0", "powershell.exe")) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
                foreach (var arg in new[] { "-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path }) start.ArgumentList.Add(arg);
            }
            process = new Process { StartInfo = start, EnableRaisingEvents = true };
            if (!openInDefaultTerminal)
            {
                process.OutputDataReceived += (_, e) => Append(e.Data); process.ErrorDataReceived += (_, e) => Append(e.Data);
            }
            completionStartedAtUtc = DateTime.UtcNow;
            process.Start();
            if (!openInDefaultTerminal) { process.BeginOutputReadLine(); process.BeginErrorReadLine(); }
            completionMonitor = MonitorCompletionsAsync(completionCancellation.Token);
            status.Text = openInDefaultTerminal ? "Running in your default terminal · " + path : wsl2 ? "Running in WSL2 Ubuntu · " + path : "Running · " + log;
            await process.WaitForExitAsync();
            // A marker can be written immediately before the child exits. Drain
            // once before cancelling the watcher so the final game is reflected
            // without waiting for a second launch or folder scan.
            await DrainCompletionsAsync();
            LastExitCode = process.ExitCode;
            status.Text = cancelled ? "Stopped. Partial files were preserved." : process.ExitCode == 0 ? "Completed successfully · " + log : "Failed · exit code " + process.ExitCode + " · " + log;
            store.Log("Download process exit=" + process.ExitCode + "; cancelled=" + cancelled); Append(status.Text);
        }
        catch (Exception ex) { status.Text = "Could not complete: " + ex.Message; Append(status.Text); }
        finally
        {
            completionCancellation.Cancel();
            try { await completionMonitor; } catch (OperationCanceledException) { }
            // WaitForExitAsync above also waits for redirected output to reach EOF.
            // Consumers can now update installed state without racing a still-running job.
            Running = false; process?.Dispose(); process = null;
            try { Completed?.Invoke(LastExitCode == 0 && !cancelled); }
            catch (Exception ex) { store.Log("Download completion handler: " + ex.Message); }
        }
    }

    private async Task MonitorCompletionsAsync(CancellationToken cancellation)
    {
        if (completionDestination == null || completionGameIds.Length == 0) return;
        while (!cancellation.IsCancellationRequested && notifiedCompletions.Count < completionGameIds.Length)
        {
            await DrainCompletionsAsync();
            if (notifiedCompletions.Count >= completionGameIds.Length) return;
            await Task.Delay(300, cancellation);
        }
    }

    private async Task DrainCompletionsAsync()
    {
        if (completionDestination == null || completionGameIds.Length == 0) return;
        foreach (string id in completionGameIds)
        {
            if (notifiedCompletions.Contains(id) || !InstalledScanner.HasFreshCompletionMarker(completionDestination, id, completionStartedAtUtc)) continue;
            notifiedCompletions.Add(id);
            try
            {
                if (GameCompleted != null) await GameCompleted(id);
            }
            catch (Exception ex)
            {
                Append("Immediate installed-state update for " + id + " failed; the final scan will retry: " + ex.Message);
            }
        }
    }
    private async Task Stop()
    {
        if (!Running) return;
        cancelled = true;
        if (process is { HasExited: false }) process.Kill(true);
        foreach (string container in containers)
        {
            if (containerGameIds.TryGetValue(container, out string? gameId)) await StopOwnedContainerAsync(container, gameId);
            else Append("Refusing to stop " + container + ": no exact game identity was supplied.");
        }
    }
    private async Task StopOwnedContainerAsync(string container, string gameId)
    {
        try
        {
            var inspectStart = new ProcessStartInfo(DockerScripts.Executable) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
            inspectStart.ArgumentList.Add("container"); inspectStart.ArgumentList.Add("inspect"); inspectStart.ArgumentList.Add(container); inspectStart.ArgumentList.Add("--format"); inspectStart.ArgumentList.Add(DockerScripts.OwnershipFormat);
            using var inspect = Process.Start(inspectStart)!;
            var inspectOutput = inspect.StandardOutput.ReadToEndAsync(); _ = inspect.StandardError.ReadToEndAsync();
            await inspect.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(20));
            if (inspect.ExitCode != 0) return; // --rm jobs commonly removed the container already.
            if (!DockerScripts.OwnershipMatches(DockerScripts.OwnershipFromLabelsJson(await inspectOutput), gameId))
            {
                Append("Refusing to stop unowned container " + container + ".");
                return;
            }
            var stopStart = new ProcessStartInfo(DockerScripts.Executable) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
            stopStart.ArgumentList.Add("stop"); stopStart.ArgumentList.Add(container);
            using var stopper = Process.Start(stopStart)!;
            var stdout = stopper.StandardOutput.ReadToEndAsync(); var stderr = stopper.StandardError.ReadToEndAsync();
            await stopper.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(20));
            Append(await stdout); if (stopper.ExitCode != 0) Append(await stderr);
        }
        catch (Exception ex) { Append("Selected container stop: " + ex.Message); }
    }
}
