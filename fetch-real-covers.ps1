$placeholders = @(
    "againstthestorm", "bladechimera", "burdenofcommand", "campfirewithcat",
    "codevein", "coralisland", "demontides", "dishonored", "flatoutheroes",
    "foregone", "godeater3", "grimdawn", "hifirush", "inmost", "jackal",
    "minicozyroomlofi", "nioh3", "romeoisadeadman", "screaminghead",
    "shewas98", "thelastcitadel", "theouterworlds2", "theslaveriantrucker",
    "towerborne", "trialsofmana", "untildawn", "youstay"
)

# Load game names
$games = Get-Content "public\data\games.json" | ConvertFrom-Json
$gameNames = @{}
foreach($g in $games) {
    $gameNames[$g.id.ToLower()] = $g.name
}

Write-Output "Games needing real covers:"
foreach($id in $placeholders) {
    $name = $gameNames[$id]
    if($name) {
        Write-Output "$id -> $name"
    }
}
