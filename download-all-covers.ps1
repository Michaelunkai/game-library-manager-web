$gamesList = @(
    "dishonored", "thedarkpicturesanthologyhouseofashes", "kirbythecompletecollection",
    "jackal", "kirbyandtheforgottenland", "kirbysreturntodreamlanddeluxe",
    "myheroacademiaallsjustice", "romeoisadeadman", "supermario3dworldbowsersfury",
    "supermariogalaxy1and2", "supermarioodyssey", "untildawn", "styxbladesofgreed",
    "burdenofcommand", "demontides", "maichildofagesstormsoftime", "minicozyroomlofi",
    "nioh3", "placidplasticdeckaquietquest", "strangerofparadisefinalfantasyorigin",
    "towerborne", "trialsofmana", "codevein", "coralisland", "dynastywarriorsorigins",
    "godeater3", "theouterworlds2", "againstthestorm", "bladechimera", "campfirewithcat",
    "castlevanialordsofshadow2", "childrenofmorta", "dawnoftheashenqueen", "foregone",
    "gothic3", "grimdawn", "hadesii", "inmost", "lostepic", "octopathtraveler",
    "pipistrelloandthecursedyoyo", "princeofpersiathelostcrown", "scottpilgrimvstheworldce",
    "screaminghead", "shewas98", "spaceinvadersdeckcommander", "thelastcitadel",
    "theslaveriantrucker", "titanquestanniversaryedition", "tunic", "youstay"
)

$outDir = "public\images"
$downloaded = 0

foreach($gameId in $gamesList) {
    $filepath = "$outDir\$gameId.png"
    
    # Google search URL
    $gameName = $gameId -replace '([a-z])([0-9])', '$1 $2' -replace '([a-z])([A-Z])', '$1 $2'
    $searchQuery = "$gameName game cover"
    
    Write-Host "[$downloaded/$($gamesList.Count)] $gameId -> searching..."
    
    # Download using wget/curl (simplified - would need actual image URL)
    # For now, mark for manual download
    Write-Host "  Manual download needed: $searchQuery"
}

Write-Host "`nTotal: $($gamesList.Count) games need covers"
