const https = require('https');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Cache-Control, Pragma',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Cache-Control': 'no-cache, no-store, must-revalidate',
  'Pragma': 'no-cache',
  'Content-Type': 'application/json'
};

const RAWG_KEY = 'c542e67aec3a4340908f9de9e86038af';

const KNOWN_METADATA = {
  'thefirstberserkerkhazan': { searchName: 'The First Berserker Khazan', steamAppId: '2680010', hours: 35, category: 'soulslike' },
  '007firstlight': { searchName: '007 First Light', steamAppId: '3768760', hours: 15, category: 'adventure' },
  'dragonquest1n2hd2dremake': { searchName: 'Dragon Quest I & II HD-2D Remake', steamAppId: '2893570', hours: 75, category: 'rpg' },
  'ofashnsteel': { searchName: 'Of Ash and Steel', steamAppId: '2893820', hours: 35, category: 'action' },
  'oceanhorn2': { searchName: 'Oceanhorn 2: Knights of the Lost Realm', steamAppId: '1622710', hours: 20, category: 'adventure' },
  'avatarfrontiersofpandora': { searchName: 'Avatar Frontiers of Pandora', steamAppId: '2840770', hours: 22, category: 'openworld' },
  'mafiatheoldcountry': { searchName: 'Mafia The Old Country', steamAppId: '1941540', hours: 12, category: 'storydriven' }
};

function fetchJson(url, timeoutMs = 9000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'game-library-netlify-metadata'
      }
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`Metadata HTTP ${res.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(new Error(`Invalid metadata JSON: ${error.message}`));
        }
      });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Metadata request timed out after ${timeoutMs}ms`));
    });
    req.on('error', reject);
  });
}

function normalizeKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function formatGameName(tagName) {
  return String(tagName || '')
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/(\d+)/g, ' $1 ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function steamCoverUrl(appId) {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900_2x.jpg`;
}

function estimateHours(name, category) {
  const combined = `${name || ''} ${category || ''}`.toLowerCase();
  if (/\b(rpg|jrpg|openworld|open world)\b/.test(combined)) return 40;
  if (/\b(strategy|tactics|simulation|simulator)\b/.test(combined)) return 30;
  if (/\b(soulslike|souls|action rpg)\b/.test(combined)) return 25;
  if (/\b(adventure|story|shooter)\b/.test(combined)) return 12;
  if (/\b(platform|puzzle|racing|sports|fighting)\b/.test(combined)) return 8;
  return 10;
}

async function lookupSteam(searchName) {
  const url = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(searchName)}&l=english&cc=US`;
  const data = await fetchJson(url);
  const item = Array.isArray(data.items) ? data.items[0] : null;
  if (!item?.id) return null;
  return {
    appId: String(item.id),
    name: item.name || searchName,
    image: steamCoverUrl(item.id),
    source: 'steam'
  };
}

async function lookupRawg(searchName) {
  const url = `https://api.rawg.io/api/games?key=${RAWG_KEY}&search=${encodeURIComponent(searchName)}&page_size=1`;
  const data = await fetchJson(url);
  const item = Array.isArray(data.results) ? data.results[0] : null;
  if (!item) return null;
  return {
    name: item.name || searchName,
    image: item.background_image || null,
    hours: item.playtime && item.playtime > 0 ? Math.round(item.playtime) : null,
    source: 'rawg'
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ success: false, error: 'Method not allowed' })
    };
  }

  const id = event.queryStringParameters?.id || '';
  const requestedName = event.queryStringParameters?.name || '';
  const currentCategory = event.queryStringParameters?.category || '';
  const key = normalizeKey(id || requestedName);
  const known = KNOWN_METADATA[key] || null;
  const searchName = known?.searchName || requestedName || formatGameName(id);

  try {
    let steam = null;
    let rawg = null;

    if (known?.steamAppId) {
      steam = {
        appId: known.steamAppId,
        name: known.searchName,
        image: steamCoverUrl(known.steamAppId),
        source: 'steam-known'
      };
    } else {
      try { steam = await lookupSteam(searchName); } catch (_) {}
    }

    try { rawg = await lookupRawg(searchName); } catch (_) {}

    const name = steam?.name || rawg?.name || searchName;
    const image = steam?.image || rawg?.image || null;
    const hours = known?.hours || rawg?.hours || estimateHours(name, known?.category || currentCategory);
    const category = known?.category || currentCategory || null;

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: true,
        id,
        name,
        category,
        image,
        time: hours,
        steamAppId: steam?.appId || null,
        source: {
          image: steam?.source || rawg?.source || 'generated-fallback',
          time: known?.hours ? 'known-override' : (rawg?.hours ? 'rawg-playtime' : 'genre-estimate')
        },
        fetchedAt: new Date().toISOString()
      })
    };
  } catch (error) {
    return {
      statusCode: 502,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: false,
        id,
        error: error.message
      })
    };
  }
};
