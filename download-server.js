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

  // 支持跨域预检请求
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

  const options = {
    protocol: parsedTarget.protocol,
    hostname: parsedTarget.hostname,
    port: parsedTarget.port || (parsedTarget.protocol === 'https:' ? 443 : 80),
    path: parsedTarget.pathname + parsedTarget.search,
    method: 'GET',
    headers: {
      'User-Agent': getRandomUserAgent(),
      'Accept': '*/*',
      'Accept-Encoding': 'identity', // 不使用gzip，方便直接传输
      'Connection': 'close',
      // 你也可以在这里加 Referer、Cookie 等头
    },
  };

  const proxyModule = parsedTarget.protocol === 'https:' ? https : http;

  const proxyReq = proxyModule.request(options, proxyRes => {
    console.log(`[${new Date().toISOString()}] Proxy response status: ${proxyRes.statusCode} for ${targetUrl}`);

    // 过滤掉压缩编码头，防止客户端解压异常
    const headers = { ...proxyRes.headers };
    delete headers['content-encoding'];
    delete headers['transfer-encoding'];

    res.writeHead(proxyRes.statusCode, headers);

    proxyRes.pipe(res);
  });

  proxyReq.on('error', err => {
    console.error(`[${new Date().toISOString()}] Proxy request error: ${err.message}`);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Proxy request error');
  });

  proxyReq.end();
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Proxy server running at http://0.0.0.0:${PORT}`);
});
