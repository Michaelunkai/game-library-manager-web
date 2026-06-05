const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(PUBLIC, 'data');
const IMAGES = path.join(PUBLIC, 'images');
const RAWG_KEY = 'c542e67aec3a4340908f9de9e86038af';

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const writeJson = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const nonGamePatterns = [
  /^hermes-/i,
  /^mmenu_/i,
  /^111\d$/,
  /^prox/i,
  /^win(?:dows|serv|11|dow)/i,
  /^ubuntu/i,
  /^godofwarragnarokpart\d+$/i,
  /^(linux|credentials|obsidion|codex|Desktop|hermes|mymainahk|isos|MacriumReflect|Webinars|whisperprox|whisper)$/i,
  /^(gamesaves|profile|installed|install|creds|study|claudecode|windowsapps|wsl|speedtest|test-push|asus|cache|developerwincontainer|win11recovery|nodev2430winx64|myapps|vscode|compressedinstall|compressedinstalled|Backuppers|apk|kubernetes|audiobooks|jellyfin|FTPserver|audioh|autosubs|Projects|epub2tts|CrimesCSV|windowapps|speach2text|plex|mining|linkedinassets|titleratings|ipynb|gameinfocsv|ec2|llama3\.1|typescript|windows11prox|metasploitble|gns3|systembackup|python|meidcat|kuma|code|gitkraken|vmware|portainer|vidtrans|wordlists|packets|mariadb|redis|nginx|wordpress)$/i,
];

const nonGameCategories = new Set([
  'mybackup',
  'win11maintaince',
  '3th_party_tools',
  'gamedownloaders',
  'oporationsystems',
  'bulkgames',
  'tvshows',
  'music',
]);

const overrides = {
  staroceanthedivineforce: { query: 'STAR OCEAN THE DIVINE FORCE', time: 35 },
  onepieceodyssey: { query: 'ONE PIECE ODYSSEY', time: 34 },
  trinitytrigger: { query: 'Trinity Trigger', time: 22 },
  theknightling: { query: 'The Knightling', time: 12 },
  thevagrant: { query: 'The Vagrant', time: 8 },
  kaku: { query: 'KAKU: Ancient Seal', time: 22 },
  RuffyandtheRiverside: { query: 'Ruffy and the Riverside', time: 8 },
  erebanshadowlegacy: { query: 'Ereban: Shadow Legacy', time: 6 },
  TalesofGracesfRemastered: { query: 'Tales of Graces f Remastered', time: 43 },
  SakunaOfRiceandRuin: { query: 'Sakuna: Of Rice and Ruin', time: 30 },
  SANDLAND: { query: 'SAND LAND', time: 25 },
  HARVESTELLA: { query: 'HARVESTELLA', time: 58 },
  thefirstberserkerkhazan: { query: 'The First Berserker: Khazan', time: 30 },
  legobatmanlegacyofthedarkknight: { query: 'LEGO Batman: Legacy of the Dark Knight', time: 12 },
  soulhackers2: { query: 'Soul Hackers 2', time: 32 },
  thelongdark: { query: 'The Long Dark', time: 22 },
  legacyofkaindefianceremastered: { query: 'Legacy of Kain: Soul Reaver 1 & 2 Remastered', time: 10 },
  pascalswagerdefinitiveedition: { query: "Pascal's Wager: Definitive Edition", time: 20 },
  deathsgambitafterlifedeathsgambitAfterlife: { query: "Death's Gambit: Afterlife", time: 13 },
  shinobiartofvengeance: { query: 'SHINOBI: Art of Vengeance', time: 10 },
  Kristala: { query: 'Kristala', time: 14 },
  goodnightuniverse: { query: 'Goodnight Universe', time: 6 },
  '007firstlight': { query: '007 First Light', time: 12 },
  chronosbeforetheashes: { query: 'Chronos: Before the Ashes', time: 10 },
  thepalebeyond: { query: 'The Pale Beyond', time: 10 },
  echoesoftheend: { query: 'Echoes of the End', time: 10 },
  bladeofdarkness: { query: 'Blade of Darkness', time: 14 },
  whilewewaithere: { query: 'While We Wait Here', time: 2 },
  strayedlights: { query: 'Strayed Lights', time: 6 },
  wanteddead: { query: 'Wanted: Dead', time: 8 },
  thecouncil: { query: 'The Council', time: 14 },
  batoralosthaven: { query: 'Batora: Lost Haven', time: 11 },
  CrusaderKings3: { query: 'Crusader Kings III', time: 70 },
  hellpie: { query: 'Hell Pie', time: 8 },
  marsupilamihoobadventure: { query: 'Marsupilami: Hoobadventure', time: 5 },
  amongtrees: { query: 'Among Trees', time: 7 },
  REPLACED: { query: 'REPLACED', time: 7 },
  'black-myth-wukong': { query: 'Black Myth: Wukong', time: 39 },
  'life-is-strange-reunion': { query: 'Life is Strange Remastered Collection', time: 14 },
  'crimson-desert': { query: 'Crimson Desert', time: 30 },
  'stellar-blade': { query: 'Stellar Blade', time: 22 },
  'like-a-dragon-pirate-yakuza-in-hawaii': { query: 'Like a Dragon: Pirate Yakuza in Hawaii', time: 18 },
  'edge-of-eternity': { query: 'Edge Of Eternity', time: 40 },
  pragmata: { query: 'PRAGMATA', time: 10 },
  mixtape: { query: 'Mixtape', time: 5 },
  'mouse-p-i-for-hire': { query: 'MOUSE: P.I. For Hire', time: 7 },
  doomthedarkages: { query: 'DOOM: The Dark Ages', time: 16 },
  caribbeanlegendageofpirates: { query: 'Caribbean Legend', time: 30 },
  sculplings: { query: 'Sculplings', time: 10 },
  theratline: { query: 'The Ratline', time: 6 },
  theartisanofglimmith: { query: 'The Artisan of Glimmith', time: 8 },
  silenceofthesiren: { query: 'Silence of the Siren', time: 25 },
  dragonkinthebanished: { query: 'Dragonkin: The Banished', time: 25 },
  formulalegends: { query: 'Formula Legends', time: 20 },
  sengokudynasty: { query: 'Sengoku Dynasty', time: 35 },
  fortsolis: { query: 'Fort Solis', time: 4 },
  grindsurvivors: { query: 'Grind Survivors', time: 15 },
  deadlinedelivery: { query: 'Deadline Delivery', time: 6 },
  ashrust: { query: 'Ash & Rust', time: 10 },
  kunitsugami: { query: 'Kunitsu-Gami: Path of the Goddess', time: 12 },
  scorn: { query: 'Scorn', time: 5 },
  starshiptroopersultimatebugwar: { query: 'Starship Troopers: Ultimate Bug War', time: 10 },
  stillwakesthedeep: { query: 'Still Wakes the Deep', time: 6 },
  cornershopnightshift: { query: 'Corner Shop: Night Shift', time: 4 },
  tombraideriiiiremastered: { query: 'Tomb Raider IV-VI Remastered', time: 18 },
  hereticsfork: { query: "Heretic's Fork", time: 12 },
  royalrevoltsurvivors: { query: 'Royal Revolt Survivors', time: 12 },
  thekingiswatching: { query: 'The King is Watching', time: 8 },
  dicewithdeath: { query: 'Dice With Death', time: 8 },
  magicraft: { query: 'Magicraft', time: 14 },
  kaijucrackingcorporation: { query: 'Kaiju Cracking Corporation', time: 10 },
  ninjagaiden4: { query: 'NINJA GAIDEN 4', time: 12 },
  redfactionguerrillaremarstered: { query: 'Red Faction Guerrilla Re-Mars-tered', time: 13 },
  RedFactionGuerrillaReMarstered: { query: 'Red Faction Guerrilla Re-Mars-tered', time: 13 },
  RedFactionguerrillaReMarstered: { query: 'Red Faction Guerrilla Re-Mars-tered', time: 13 },
  AgainsttheStorm: { query: 'Against the Storm', time: 30 },
  dishonored: { query: 'Dishonored', time: 12 },
  thedarkpicturesanthologyhouseofashes: { query: 'The Dark Pictures Anthology: House of Ashes', time: 6 },
  kirbythecompletecollection: { query: 'Kirby and the Forgotten Land', time: 10 },
  kirbyandtheforgottenland: { query: 'Kirby and the Forgotten Land', time: 10 },
  untildawn: { query: 'Until Dawn', time: 8 },
  supermariogalaxy1and2: { query: 'Super Mario Galaxy', time: 14 },
  supermarioodyssey: { query: 'Super Mario Odyssey', time: 13 },
  supermario3dworldbowsersfury: { query: "Super Mario 3D World + Bowser's Fury", time: 14 },
  jackal: { query: 'Jackal', time: 1 },
  romeoisadeadman: { query: 'ROMEO IS A DEAD MAN', time: 8 },
  kirbysreturntodreamlanddeluxe: { query: "Kirby's Return to Dream Land Deluxe", time: 8 },
  myheroacademiaallsjustice: { query: "MY HERO ACADEMIA: All's Justice", time: 8 },
  styxbladesofgreed: { query: 'Styx: Blades of Greed', time: 12 },
  burdenofcommand: { query: 'Burden of Command', time: 20 },
  maichildofagesstormsoftime: { query: 'Mai: Child of Ages', time: 8 },
  minicozyroomlofi: { query: 'Mini Cozy Room: Lo-Fi', time: 4 },
  demontides: { query: 'Demon Tides', time: 8 },
  placidplasticdeckaquietquest: { query: 'Placid Plastic Deck: A Quiet Quest', time: 4 },
  towerborne: { query: 'Towerborne', time: 12 },
  strangerofparadisefinalfantasyorigin: { query: 'STRANGER OF PARADISE FINAL FANTASY ORIGIN', time: 25 },
  taintedgrailthefallofavalon: { query: 'Tainted Grail: The Fall of Avalon', time: 40 },
  dynastywarriorsorigins: { query: 'DYNASTY WARRIORS: ORIGINS', time: 28 },
  godeater3: { query: 'GOD EATER 3', time: 28 },
  coralisland: { query: 'Coral Island', time: 75 },
  shewas98: { query: 'She Was 98', time: 2 },
  thelastcitadel: { query: 'The Last Citadel', time: 8 },
  bladechimera: { query: 'BLADE CHIMERA', time: 12 },
  theslaveriantrucker: { query: 'The Slaverian Trucker', time: 20 },
  screaminghead: { query: 'Screaming Head', time: 4 },
  inmost: { query: 'INMOST', time: 4 },
  campfirewithcat: { query: 'Campfire with Cat', time: 4 },
  foregone: { query: 'Foregone', time: 5 },
  youstay: { query: 'You Stay', time: 2 },
  grimdawn: { query: 'Grim Dawn', time: 25 },
  castlevanialordsofshadow2: { query: 'Castlevania: Lords of Shadow 2', time: 14 },
  princeofpersiathelostcrown: { query: 'Prince of Persia The Lost Crown', time: 16 },
  hifirush: { query: 'Hi-Fi RUSH', time: 11 },
  mewgenics: { query: 'Mewgenics', time: 15 },
  dustborn: { query: 'Dustborn', time: 10 },
  ultros: { query: 'Ultros', time: 10 },
  spiritfall: { query: 'Spiritfall', time: 12 },
  therogueprinceofpersia: { query: 'The Rogue Prince of Persia', time: 12 },
  sammaxsavetheworldremastered: { query: 'Sam & Max Save the World Remastered', time: 10 },
  deadrising4: { query: 'Dead Rising 4', time: 10 },
  DeadRising4: { query: 'Dead Rising 4', time: 10 },
  Cuphead: { query: 'Cuphead', time: 11 },
  cuphead: { query: 'Cuphead', time: 11 },
  MindsEye: { query: "MindsEye", time: 12 },
  DuneImperium: { query: 'Dune: Imperium', time: 10 },
  DarkDevotion: { query: 'Dark Devotion', time: 12 },
  moonscars: { query: 'Moonscars', time: 10 },
  PhantomFury: { query: 'Phantom Fury', time: 6 },
  ValiantHeartsCominghome: { query: 'Valiant Hearts: Coming Home', time: 3 },
  ValiantHeartsComingHome: { query: 'Valiant Hearts: Coming Home', time: 3 },
  ThankGoodnessYoureHere: { query: "Thank Goodness You're Here!", time: 3 },
  '1000xRESIST': { query: '1000xRESIST', time: 11 },
  BluePrince: { query: 'Blue Prince', time: 16 },
  SouthofMidnight: { query: 'South of Midnight', time: 12 },
  CrimeBossRockayCity: { query: 'Crime Boss: Rockay City', time: 12 },
  SyberiaTheWorldBefore: { query: 'Syberia: The World Before', time: 12 },
  BurnoutParadiseRemastered: { query: 'Burnout Paradise Remastered', time: 12 },
  Obduction: { query: 'Obduction', time: 10 },
  LEGOHarryPotter57: { query: 'LEGO Harry Potter: Years 5-7', time: 12 },
  TheLifeAndSufferingOfSirBrante: { query: 'The Life and Suffering of Sir Brante', time: 12 },
  FullMetalFuries: { query: 'Full Metal Furies', time: 13 },
  RiverCityGirls2: { query: 'River City Girls 2', time: 10 },
  DragonBallSparkingZERO: { query: 'DRAGON BALL: Sparking! ZERO', time: 10 },
  Sable: { query: 'Sable', time: 8 },
  LostRecordsBloomRage: { query: 'Lost Records: Bloom & Rage', time: 12 },
  LifeisStrangeDoubleExposure: { query: 'Life is Strange: Double Exposure', time: 14 },
  Griftlands: { query: 'Griftlands', time: 12 },
  Balatro: { query: 'Balatro', time: 10 },
  TheWildatHeart: { query: 'The Wild at Heart', time: 12 },
  MyfriendlyNeighborhood: { query: 'My Friendly Neighborhood', time: 8 },
  JourneytothesavagePlanet: { query: 'Journey to the Savage Planet', time: 8 },
  Creaks: { query: 'Creaks', time: 4 },
  harrypotter: { query: 'Harry Potter and the Deathly Hallows', time: 8 },
  scarsabove: { query: 'Scars Above', time: 8 },
  dredge: { query: 'DREDGE', time: 10 },
  catherine: { query: 'Catherine Classic', time: 12 },
  bioshock2: { query: 'BioShock 2 Remastered', time: 11 },
  Islets: { query: 'Islets', time: 8 },
  evilwest: { query: 'Evil West', time: 11 },
  sherlockholmestheawakened: { query: 'Sherlock Holmes The Awakened', time: 10 },
  frostpunk: { query: 'Frostpunk', time: 11 },
  notforbroadcast: { query: 'Not For Broadcast', time: 8 },
  deathmustdie: { query: 'Death Must Die', time: 15 },
  robocoproguecity: { query: 'RoboCop: Rogue City', time: 11 },
  metroredux: { query: 'Metro Redux', time: 18 },
  blacktail: { query: 'BLACKTAIL', time: 12 },
  skaterxl: { query: 'Skater XL', time: 8 },
  trine5: { query: 'Trine 5: A Clockwork Conspiracy', time: 12 },
  darksidersgenesis: { query: 'Darksiders Genesis', time: 15 },
  neonabyss: { query: 'Neon Abyss', time: 12 },
  prisonsimulator: { query: 'Prison Simulator', time: 12 },
  theascent: { query: 'The Ascent', time: 12 },
  Witchfire: { query: 'Witchfire', time: 15 },
  eternalcylinder: { query: 'The Eternal Cylinder', time: 8 },
  beyond2souls: { query: 'Beyond: Two Souls', time: 10 },
  sackboy: { query: 'Sackboy: A Big Adventure', time: 10 },
  hotwheels: { query: 'HOT WHEELS UNLEASHED', time: 9 },
  riftapart: { query: 'Ratchet & Clank: Rift Apart', time: 11 },
  haveanicedeath: { query: 'Have a Nice Death', time: 12 },
  rage2: { query: 'RAGE 2', time: 11 },
  residentevilvillage: { query: 'Resident Evil Village', time: 10 },
  batmantts: { query: 'Batman: The Telltale Series', time: 9 },
  batmantew: { query: 'Batman: The Enemy Within', time: 10 },
  ftl: { query: 'FTL: Faster Than Light', time: 12 },
};

function keyFor(id) {
  return id.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function formatFallbackName(id) {
  return id
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase()) || id;
}

function isNonGame(id) {
  return nonGamePatterns.some((pattern) => pattern.test(id));
}

function isNonGameEntry(game) {
  return nonGameCategories.has(game.category || '') || isNonGame(game.id);
}

function findExistingImageForId(id) {
  const base = id.toLowerCase();
  for (const ext of ['.jpg', '.png', '.svg']) {
    const relative = `images/${base}${ext}`;
    if (fs.existsSync(path.join(PUBLIC, relative))) return relative;
  }
  return null;
}

function getExistingSteamMap() {
  const source = fs.readFileSync(path.join(PUBLIC, 'app.js'), 'utf8');
  const match = source.match(/getKnownSteamAppIds\(\) \{\s*return \{([\s\S]*?)\n\s*};\s*\n\s*}/);
  if (!match) return {};
  const result = {};
  const re = /'([^']+)'\s*:\s*'([^']+)'/g;
  let item;
  while ((item = re.exec(match[1]))) result[item[1]] = item[2];
  return result;
}

function getExistingKnownTimes() {
  const source = fs.readFileSync(path.join(PUBLIC, 'app.js'), 'utf8');
  const match = source.match(/getKnownGameTimes\(\) \{\s*return \{([\s\S]*?)\n\s*};\s*\n\s*}/);
  if (!match) return {};
  const result = {};
  const re = /'([^']+)'\s*:\s*([0-9.]+)/g;
  let item;
  while ((item = re.exec(match[1]))) result[item[1]] = Number(item[2]);
  return result;
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'game-library-metadata-enricher' } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json();
}

async function findSteamApp(query, knownAppId) {
  if (knownAppId) return { id: knownAppId, name: query, source: 'known-steam-map' };
  const url = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(query)}&l=en&cc=US`;
  const data = await fetchJson(url);
  const items = (data.items || []).filter((item) => item.type === 'app');
  const filtered = items.filter((item) => !/\b(soundtrack|upgrade|pack|dlc|demo|artbook|cosplay)\b/i.test(item.name));
  const chosen = filtered[0] || items[0];
  return chosen ? { id: String(chosen.id), name: chosen.name, source: 'steam-search' } : null;
}

async function getSteamDetails(appid) {
  const data = await fetchJson(`https://store.steampowered.com/api/appdetails?appids=${appid}&cc=US&l=en`);
  const entry = data[String(appid)];
  return entry && entry.success ? entry.data : null;
}

async function getRawgDetails(query) {
  const search = await fetchJson(`https://api.rawg.io/api/games?key=${RAWG_KEY}&search=${encodeURIComponent(query)}&page_size=5`);
  const match = (search.results || [])[0];
  if (!match) return null;
  const detail = await fetchJson(`https://api.rawg.io/api/games/${match.id}?key=${RAWG_KEY}`);
  return { search: match, detail };
}

async function downloadFile(url, outputPath) {
  const response = await fetch(url, { headers: { 'User-Agent': 'game-library-metadata-enricher' } });
  if (!response.ok) return false;
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 5000) return false;
  fs.writeFileSync(outputPath, buffer);
  return true;
}

async function downloadSteamCover(appid, outputPath) {
  const urls = [
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_600x900_2x.jpg`,
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`,
    `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/library_600x900_2x.jpg`,
    `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`,
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`,
  ];
  for (const url of urls) {
    if (await downloadFile(url, outputPath)) return url;
  }
  return null;
}

async function createNonGameImage(game, outputPath) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#1d4ed8"/><stop offset="1" stop-color="#0f172a"/></linearGradient></defs><rect width="600" height="900" fill="url(#g)"/><rect x="62" y="90" width="476" height="560" rx="38" fill="rgba(255,255,255,.08)" stroke="rgba(255,255,255,.22)" stroke-width="4"/><text x="300" y="245" text-anchor="middle" font-family="Segoe UI,Arial,sans-serif" font-size="74" fill="#fff">Docker</text><text x="300" y="340" text-anchor="middle" font-family="Segoe UI,Arial,sans-serif" font-size="42" fill="#bfdbfe">System Tag</text><text x="300" y="510" text-anchor="middle" font-family="Segoe UI,Arial,sans-serif" font-size="34" fill="#e0f2fe">${escapeXml(game.name).slice(0, 28)}</text><text x="300" y="760" text-anchor="middle" font-family="Segoe UI,Arial,sans-serif" font-size="28" fill="#93c5fd">Non-game backup/utility image</text></svg>`;
  fs.writeFileSync(outputPath, svg, 'utf8');
  return 'system-tag-svg';
}

function escapeXml(value) {
  return value.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}

function cleanDescription(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function enrichGame(game, context) {
  const id = game.id;
  const override = overrides[id] || overrides[keyFor(id)] || {};

  if (isNonGameEntry(game)) {
    const outputPath = path.join(IMAGES, `${id.toLowerCase()}.svg`);
    const localImage = `images/${id.toLowerCase()}.svg`;
    game.name = override.query || game.name || formatFallbackName(id);
    game.category = game.category || 'mybackup';
    game.time = 0;
    context.times[id] = 0;
    await createNonGameImage(game, outputPath);
    game.image = localImage;
    const detail = `${game.name} is a non-game Docker/system tag, not a playable game. Category: ${game.category}. Time to beat: 0 hours. Size: ${context.sizes[id] ?? 0} GB Docker image.`;
    game.description = detail;
    game.details = detail;
    return { id, status: 'non-game', image: localImage };
  }

  const outputPath = path.join(IMAGES, `${id.toLowerCase()}.jpg`);
  const localImage = `images/${id.toLowerCase()}.jpg`;
  const recoveredImage = findExistingImageForId(id);
  if (recoveredImage && (!String(game.image || '').startsWith('images/') || !fs.existsSync(path.join(PUBLIC, game.image)))) {
    game.image = recoveredImage;
  }
  const existingImagePath = String(game.image || '').startsWith('images/') ? path.join(PUBLIC, game.image) : null;
  const hasExistingImage = !!existingImagePath && fs.existsSync(existingImagePath);

  const query = override.query || game.name || formatFallbackName(id);
  let steam = null;
  let steamDetails = null;
  let rawg = null;
  const knownAppId = context.steamMap[keyFor(id)];

  try {
    steam = await findSteamApp(query, knownAppId);
    if (steam) steamDetails = await getSteamDetails(steam.id);
  } catch (error) {
    context.warnings.push({ id, source: 'steam', error: error.message });
  }

  let imageSource = null;
  if (steam) {
    imageSource = await downloadSteamCover(steam.id, outputPath);
  }

  try {
    rawg = await getRawgDetails(query);
  } catch (error) {
    context.warnings.push({ id, source: 'rawg', error: error.message });
  }

  if (!imageSource && rawg?.detail?.background_image) {
    imageSource = await downloadFile(rawg.detail.background_image, outputPath) ? rawg.detail.background_image : null;
  }

  if (!imageSource && !hasExistingImage) {
    return { id, status: 'unresolved-image', query };
  }

  const knownTime = context.knownTimes[keyFor(id)];
  const rawgTime = rawg?.detail?.playtime || rawg?.search?.playtime || null;
  const nextTime = override.time ?? knownTime ?? (rawgTime && rawgTime > 0 ? rawgTime : game.time);
  game.time = nextTime;
  context.times[id] = nextTime;

  const sourceName = steamDetails?.name || steam?.name || rawg?.detail?.name || override.query || game.name || formatFallbackName(id);
  game.name = sourceName;
  game.image = localImage;

  const sourceDescription = cleanDescription(steamDetails?.short_description || rawg?.detail?.description_raw || '');
  const timeText = nextTime != null && nextTime !== '' ? `~${nextTime} hours` : 'time-to-beat unavailable';
  const sizeText = context.sizes[id] != null ? `${context.sizes[id]} GB Docker image` : 'Docker image size unavailable';
  const detailParts = [
    sourceDescription || `${sourceName} is a playable game from Docker tag ${id}.`,
    `Category: ${game.category || 'uncategorized'}.`,
    `Time to beat: ${timeText}.`,
    `Size: ${sizeText}.`,
    steam ? `Cover/details source: Steam app ${steam.id}.` : rawg ? 'Cover/details source: RAWG.' : 'Details source: curated local metadata.',
  ];
  game.description = detailParts.join(' ');
  game.details = game.description;

  if (imageSource) game.image = localImage;
  return { id, status: imageSource ? 'enriched' : 'enriched-existing-image', query, name: sourceName, image: game.image, source: imageSource || 'existing-local-image', steamAppId: steam?.id || null, time: nextTime };
}

async function main() {
  fs.mkdirSync(IMAGES, { recursive: true });
  const games = readJson(path.join(DATA, 'games.json'));
  const times = readJson(path.join(DATA, 'times.json'));
  const sizes = readJson(path.join(DATA, 'image-sizes.json'));
  const dates = readJson(path.join(DATA, 'dates-added.json'));
  const isGenericDetails = (game) => /is available from Docker tag /.test(String(game.details || game.description || ''));
  const isMisclassifiedNonGame = (game) => isNonGameEntry(game) && !String(game.details || game.description || '').includes('non-game Docker/system tag');
  const hasMissingImageFile = (game) => {
    const image = String(game.image || '');
    return image.startsWith('images/') && !fs.existsSync(path.join(PUBLIC, image));
  };
  const generated = games.filter((game) => String(game.image || '').startsWith('data:image') || isGenericDetails(game) || hasMissingImageFile(game) || isMisclassifiedNonGame(game));
  const context = {
    times,
    sizes,
    dates,
    steamMap: getExistingSteamMap(),
    knownTimes: getExistingKnownTimes(),
    warnings: [],
  };

  const results = [];
  let nextIndex = 0;
  const concurrency = Math.min(8, Math.max(1, Number(process.env.ENRICH_CONCURRENCY || 6)));
  async function worker() {
    while (nextIndex < generated.length) {
      const index = nextIndex++;
      const game = generated[index];
      const result = await enrichGame(game, context);
      results[index] = result;
      console.log(`[${index + 1}/${generated.length}] ${game.id}: ${result.status}`);
      await sleep(100);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  writeJson(path.join(DATA, 'games.json'), games);
  writeJson(path.join(DATA, 'times.json'), Object.fromEntries(Object.keys(times).sort((a, b) => a.localeCompare(b)).map((key) => [key, times[key]])));

  const unresolved = results.filter((item) => item.status === 'unresolved-image');
  const report = {
    totalTargetsAtStart: generated.length,
    enriched: results.filter((item) => item.status === 'enriched' || item.status === 'enriched-existing-image').length,
    nonGame: results.filter((item) => item.status === 'non-game').length,
    unresolved: unresolved.length,
    unresolvedItems: unresolved,
    warnings: context.warnings,
    results,
  };
  fs.writeFileSync(path.join(ROOT, 'metadata-enrichment-report.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify({ total: generated.length, enriched: report.enriched, nonGame: report.nonGame, unresolved: report.unresolved }, null, 2));
  if (unresolved.length > 0) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
