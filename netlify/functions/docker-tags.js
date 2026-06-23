const https = require('https');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Cache-Control, Pragma',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Cache-Control': 'no-cache, no-store, must-revalidate',
  'Pragma': 'no-cache',
  'Content-Type': 'application/json'
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchJson(url, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'game-library-netlify-docker-sync'
      }
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const error = new Error(`Docker Hub HTTP ${res.statusCode}`);
          error.statusCode = res.statusCode;
          error.retryAfter = Number(res.headers['retry-after'] || 0);
          reject(error);
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(new Error(`Invalid Docker Hub JSON: ${error.message}`));
        }
      });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Docker Hub request timed out after ${timeoutMs}ms`));
    });
    req.on('error', reject);
  });
}

async function fetchJsonWithRetry(url, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fetchJson(url);
    } catch (error) {
      lastError = error;
      const retryable = error.statusCode === 429 || error.statusCode >= 500 || /timed out|ECONNRESET|ETIMEDOUT/i.test(error.message);
      if (!retryable || attempt === attempts) break;
      const retryAfterMs = error.retryAfter ? error.retryAfter * 1000 : 0;
      const backoffMs = Math.max(retryAfterMs, 350 * attempt);
      await sleep(backoffMs);
    }
  }
  throw lastError;
}

function normalizeTag(tag) {
  return {
    name: tag.name,
    last_updated: tag.last_updated || null,
    full_size: tag.full_size || 0,
    digest: tag.digest || null,
    images: Array.isArray(tag.images) ? tag.images.length : 0
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

  const dockerUser = event.queryStringParameters?.user || 'michadockermisha';
  const repoName = event.queryStringParameters?.repo || 'backup';
  const pageSize = Math.min(parseInt(event.queryStringParameters?.page_size || '100', 10), 100);
  const summaryOnly = ['1', 'true', 'yes'].includes(String(event.queryStringParameters?.summary || '').toLowerCase());
  const baseUrl = `https://hub.docker.com/v2/repositories/${encodeURIComponent(dockerUser)}/${encodeURIComponent(repoName)}/tags`;

  try {
    const firstPage = await fetchJsonWithRetry(`${baseUrl}?page=1&page_size=${pageSize}`);
    const totalCount = firstPage.count || 0;
    const latestTag = firstPage.results?.[0] ? normalizeTag(firstPage.results[0]) : null;

    if (summaryOnly) {
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          success: true,
          source: 'docker-hub',
          dockerUser,
          repoName,
          count: totalCount,
          fetched: latestTag ? 1 : 0,
          totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
          latestTag,
          fetchedAt: new Date().toISOString()
        })
      };
    }

    const tags = [];
    const seenNames = new Set();
    let nextUrl = `${baseUrl}?page=1&page_size=${pageSize}`;
    let page = 0;
    let lastReportedCount = totalCount;

    while (nextUrl) {
      page++;
      const data = page === 1 ? firstPage : await fetchJsonWithRetry(nextUrl);
      if (typeof data.count === 'number') lastReportedCount = data.count;

      for (const rawTag of data.results || []) {
        if (!rawTag?.name || seenNames.has(rawTag.name)) continue;
        seenNames.add(rawTag.name);
        tags.push(normalizeTag(rawTag));
      }

      nextUrl = data.next || null;
      if (nextUrl) await sleep(75);
    }

    const complete = tags.length >= lastReportedCount || tags.length >= totalCount;

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: complete,
        source: 'docker-hub',
        dockerUser,
        repoName,
        count: tags.length,
        dockerHubReportedCount: lastReportedCount,
        fetched: tags.length,
        totalPages: page,
        tags,
        fetchedAt: new Date().toISOString()
      })
    };
  } catch (error) {
    return {
      statusCode: 502,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: false,
        source: 'docker-hub',
        dockerUser,
        repoName,
        error: error.message
      })
    };
  }
};
