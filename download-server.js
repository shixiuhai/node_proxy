const http = require('http');
const https = require('https');
const url = require('url');

const PORT = 8888;

const UA_LIST = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/114 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/114 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
  'Mozilla/5.0 (Linux; Android 10; Pixel 4) AppleWebKit/537.36 Chrome/114 Mobile Safari/537.36',
];

function getRandomUserAgent() {
  return UA_LIST[Math.floor(Math.random() * UA_LIST.length)];
}

const server = http.createServer((req, res) => {
  console.log(`[${new Date().toISOString()}] Incoming request: ${req.method} ${req.url}`);

  // CORS 支持
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const reqUrl = url.parse(req.url, true);

  if (reqUrl.pathname !== '/proxy') {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
    return;
  }

  const targetUrl = reqUrl.query.url;
  const customReferer = reqUrl.query.referer;
  const customCookie = reqUrl.query.cookie;

  if (!targetUrl) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Missing url query parameter');
    return;
  }

  let parsedTarget;
  try {
    parsedTarget = new URL(targetUrl);
  } catch (err) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Invalid target url');
    return;
  }

  const headers = {
    'User-Agent': getRandomUserAgent(),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Encoding': 'identity',
    'Accept-Language': 'en-US,en;q=0.9',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'DNT': '1',
    'Sec-Fetch-Site': 'cross-site',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-User': '?1',
    'Sec-Fetch-Dest': 'document',
    'Referer': customReferer || parsedTarget.origin + '/', // 可传入模拟 Referer
    'Cookie': customCookie || '',                          // 可传入模拟 Cookie
  };

  // 支持转发 Range 请求（视频需要）
  if (req.headers['range']) {
    headers['Range'] = req.headers['range'];
  }

  const options = {
    protocol: parsedTarget.protocol,
    hostname: parsedTarget.hostname,
    port: parsedTarget.port || (parsedTarget.protocol === 'https:' ? 443 : 80),
    path: parsedTarget.pathname + parsedTarget.search,
    method: 'GET',
    headers,
    timeout: 10000, // 10秒超时
  };

  const proxyModule = parsedTarget.protocol === 'https:' ? https : http;

  const proxyReq = proxyModule.request(options, proxyRes => {
    console.log(`[${new Date().toISOString()}] Proxy response ${proxyRes.statusCode} from ${targetUrl}`);

    // 过滤压缩头，防止客户端无法解码
    const filteredHeaders = { ...proxyRes.headers };
    delete filteredHeaders['content-encoding'];
    delete filteredHeaders['transfer-encoding'];

    res.writeHead(proxyRes.statusCode, filteredHeaders);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', err => {
    console.error(`[${new Date().toISOString()}] Proxy error: ${err.message}`);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Proxy error: ' + err.message);
  });

  proxyReq.end();
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🛡 Proxy server running at http://0.0.0.0:${PORT}/proxy`);
});
