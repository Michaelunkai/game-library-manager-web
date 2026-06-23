const ALLOWED_IMAGE_HOSTS = new Set([
  'cdn.cloudflare.steamstatic.com',
  'shared.cloudflare.steamstatic.com',
  'shared.akamai.steamstatic.com',
  'shared.fastly.steamstatic.com',
  'cdn.akamai.steamstatic.com',
  'steamcdn-a.akamaihd.net',
  'media.rawg.io',
  'images.igdb.com'
]);

const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800'
};

exports.handler = async (event) => {
  try {
    const rawUrl = event.queryStringParameters?.url;
    if (!rawUrl) {
      return { statusCode: 400, headers: HEADERS, body: 'Missing url' };
    }

    let url;
    try {
      url = new URL(rawUrl);
    } catch {
      return { statusCode: 400, headers: HEADERS, body: 'Invalid url' };
    }

    if (!['http:', 'https:'].includes(url.protocol) || !ALLOWED_IMAGE_HOSTS.has(url.hostname)) {
      return { statusCode: 403, headers: HEADERS, body: 'Image host is not allowed' };
    }

    const response = await fetch(url.toString(), {
      headers: {
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'User-Agent': 'GameLibraryImageProxy/1.0'
      },
      redirect: 'follow'
    });

    if (!response.ok) {
      return { statusCode: response.status, headers: HEADERS, body: `Image fetch failed: ${response.status}` };
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    if (!contentType.toLowerCase().startsWith('image/')) {
      return { statusCode: 415, headers: HEADERS, body: 'URL did not return an image' };
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    return {
      statusCode: 200,
      headers: {
        ...HEADERS,
        'Content-Type': contentType,
        'Content-Length': String(buffer.length)
      },
      body: buffer.toString('base64'),
      isBase64Encoded: true
    };
  } catch (error) {
    return {
      statusCode: 502,
      headers: HEADERS,
      body: `Image proxy error: ${error.message}`
    };
  }
};
