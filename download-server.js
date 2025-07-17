const http = require('http');
const https = require('https');
const url = require('url');

const PORT = 8888;

function getRandomUA() {
  const uaList = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/114 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
    'Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 Chrome/89.0 Mobile Safari/537.36',
  ];
  return uaList[Math.floor(Math.random() * uaList.length)];
}

function buildHeaders(originalHeaders, targetUrl) {
  const parsed = url.parse(targetUrl);
  return {
    ...originalHeaders,
    host: parsed.host,
    'user-agent': getRandomUA(),
    referer: parsed.protocol + '//' + parsed.host,
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'accept-language': 'zh-CN,zh;q=0.9',
    connection: 'keep-alive',
  };
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const targetUrl = parsedUrl.query.url;

  if (!targetUrl) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('缺少 url 参数');
    return;
  }

  const targetParsed = url.parse(targetUrl);
  const protocol = targetParsed.protocol === 'https:' ? https : http;

  const headers = buildHeaders(req.headers, targetUrl);

  const options = {
    protocol: targetParsed.protocol,
    hostname: targetParsed.hostname,
    port: targetParsed.port || (targetParsed.protocol === 'https:' ? 443 : 80),
    method: req.method,
    path: targetParsed.path,
    headers,
  };

  const proxyReq = protocol.request(options, (proxyRes) => {
    // 透传响应头
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', (e) => {
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('代理请求错误: ' + e.message);
  });

  // 透传请求体（POST等）
  req.pipe(proxyReq, { end: true });
});

server.listen(PORT, () => {
  console.log(`🛡️ 轻量级 JS 代理服务已启动，访问 http://localhost:${PORT}/proxy?url=目标地址`);
});
