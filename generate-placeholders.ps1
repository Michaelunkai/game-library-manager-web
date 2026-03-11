$gamesList = @(
    @{filename="againstthestorm"; title="Against the Storm"},
    @{filename="bladechimera"; title="Blade Chimera"},
    @{filename="burdenofcommand"; title="Burden of Command"},
    @{filename="campfirewithcat"; title="Campfire with Cat"},
    @{filename="castlevanialordsofshadow2"; title="Castlevania Lords of Shadow 2"},
    @{filename="codevein"; title="Code Vein"},
    @{filename="coralisland"; title="Coral Island"},
    @{filename="demontides"; title="Demon Tides"},
    @{filename="dishonored"; title="Dishonored"},
    @{filename="dynastywarriorsorigins"; title="Dynasty Warriors Origins"},
    @{filename="foregone"; title="Foregone"},
    @{filename="godeater3"; title="God Eater 3"},
    @{filename="goodbyevolcanohigh"; title="Goodbye Volcano High"},
    @{filename="gori"; title="Gori"},
    @{filename="gothic2"; title="Gothic 2"},
    @{filename="gothic3"; title="Gothic 3"},
    @{filename="greakmemoriesofazur"; title="Greak Memories of Azur"},
    @{filename="greedfall"; title="Greedfall"},
    @{filename="griftlands"; title="Griftlands"},
    @{filename="grimdawn"; title="Grim Dawn"},
    @{filename="grounded"; title="Grounded"},
    @{filename="growsongoftheevertree"; title="Grow Song of the Evertree"},
    @{filename="gunfirereborn"; title="Gunfire Reborn"},
    @{filename="hackersimulator"; title="Hacker Simulator"},
    @{filename="hades2"; title="Hades 2"},
    @{filename="hadesii"; title="Hades II"},
    @{filename="halothemasterchiefcollection"; title="Halo Master Chief Collection"},
    @{filename="hammerwatchii"; title="Hammerwatch II"},
    @{filename="haroldhalibut"; title="Harold Halibut"},
    @{filename="harrypotter"; title="Harry Potter"},
    @{filename="haveanicedeath"; title="Have a Nice Death"},
    @{filename="heaveho"; title="Heave Ho"},
    @{filename="hellblade2"; title="Hellblade 2"},
    @{filename="hellbladesenuasacrifice"; title="Hellblade Senua's Sacrifice"},
    @{filename="helldivers"; title="Helldivers"},
    @{filename="hellpoint"; title="Hellpoint"},
    @{filename="highlandsong"; title="Highland Song"},
    @{filename="highonlife2"; title="High On Life 2"},
    @{filename="hoa"; title="Hoa"},
    @{filename="hollowknightsilksong"; title="Hollow Knight Silksong"},
    @{filename="honeyijoinedacult"; title="Honey I Joined a Cult"},
    @{filename="hotwheels"; title="Hot Wheels"},
    @{filename="houseflipper"; title="House Flipper"},
    @{filename="howimetyourmother"; title="How I Met Your Mother"},
    @{filename="humanfallflat"; title="Human Fall Flat"},
    @{filename="hypercharge"; title="HYPERCHARGE"},
    @{filename="immortalsfenyxrising"; title="Immortals Fenyx Rising"},
    @{filename="immortalsofaveum"; title="Immortals of Aveum"},
    @{filename="inzoi"; title="inZOI"},
    @{filename="indika"; title="Indika"}
)

Add-Type -AssemblyName System.Drawing

$width = 460
$height = 215
$bgColor = [System.Drawing.Color]::FromArgb(31, 41, 55)
$textColor = [System.Drawing.Color]::FromArgb(99, 102, 241)

foreach ($game in $gamesList) {
    $bitmap = New-Object System.Drawing.Bitmap($width, $height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    
    $graphics.Clear($bgColor)
    
    $font = New-Object System.Drawing.Font("Arial", 16, [System.Drawing.FontStyle]::Bold)
    $brush = New-Object System.Drawing.SolidBrush($textColor)
    
    $stringFormat = New-Object System.Drawing.StringFormat
    $stringFormat.Alignment = [System.Drawing.StringAlignment]::Center
    $stringFormat.LineAlignment = [System.Drawing.StringAlignment]::Center
    
    $rect = New-Object System.Drawing.Rectangle(0, 0, $width, $height)
    $graphics.DrawString($game.title, $font, $brush, $rect, $stringFormat)
    
    $outputPath = "public\images\$($game.filename).png"
    $bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    
    Write-Output "Created: $outputPath"
    
    $graphics.Dispose()
    $bitmap.Dispose()
}

Write-Output "`n✅ Generated $($gamesList.Count) placeholder images!"
