const https = require('https');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Cache-Control, Pragma',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Cache-Control': 'no-cache, no-store, must-revalidate',
  'Pragma': 'no-cache',
  'Content-Type': 'application/json'
};

function fetchJson(url, timeoutMs = 8000) {
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
          reject(new Error(`Docker Hub HTTP ${res.statusCode}`));
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
  const baseUrl = `https://hub.docker.com/v2/repositories/${encodeURIComponent(dockerUser)}/${encodeURIComponent(repoName)}/tags`;

  try {
    const firstPage = await fetchJson(`${baseUrl}?page=1&page_size=${pageSize}`);
    const totalCount = firstPage.count || 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const pageResults = new Map([[1, firstPage.results || []]]);

    if (totalPages > 1) {
      const pageNumbers = [];
      for (let page = 2; page <= totalPages; page++) pageNumbers.push(page);

      const results = await Promise.all(pageNumbers.map(async (page) => {
        const data = await fetchJson(`${baseUrl}?page=${page}&page_size=${pageSize}`);
        return { page, results: data.results || [] };
      }));

      for (const page of results) {
        pageResults.set(page.page, page.results);
      }
    }

    const tags = [];
    for (let page = 1; page <= totalPages; page++) {
      tags.push(...(pageResults.get(page) || []).map(normalizeTag));
    }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: tags.length === totalCount,
        source: 'docker-hub',
        dockerUser,
        repoName,
        count: totalCount,
        fetched: tags.length,
        totalPages,
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
