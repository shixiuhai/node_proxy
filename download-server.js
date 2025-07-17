const http = require('http');
const https = require('https');
const url = require('url');

const PORT = 8888;

// 常用 User-Agent 列表，避免被CDN识别为机器人
const UA_LIST = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/114 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/114 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
  'Mozilla/5.0 (Linux; Android 10; Pixel 4) AppleWebKit/537.36 Chrome/114 Mobile Safari/537.36',
];

// 随机获取User-Agent
function getRandomUserAgent() {
  return UA_LIST[Math.floor(Math.random() * UA_LIST.length)];
}

const server = http.createServer((req, res) => {
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

  // 构造请求选项
  const options = {
    protocol: parsedTarget.protocol,
    hostname: parsedTarget.hostname,
    port: parsedTarget.port || (parsedTarget.protocol === 'https:' ? 443 : 80),
    path: parsedTarget.pathname + parsedTarget.search,
    method: 'GET',
    headers: {
      'User-Agent': getRandomUserAgent(),
      'Accept': '*/*',
      'Accept-Encoding': 'identity', // 禁用gzip压缩，避免响应处理复杂
      'Connection': 'close',
      // 你可以根据需要添加更多伪装请求头，比如 Referer、Cookie 等
    },
  };

  // 选择http或https模块
  const proxyReq = (parsedTarget.protocol === 'https:' ? https : http).request(options, proxyRes => {
    // 过滤和转发响应头，避免跨域或cdn检测
    const headers = proxyRes.headers;

    // 删除或修改可能暴露代理信息的头
    delete headers['content-encoding']; // 因为关闭了gzip
    delete headers['transfer-encoding'];

    // 设置响应头
    res.writeHead(proxyRes.statusCode, headers);

    // 流式传输响应体
    proxyRes.pipe(res);
  });

  proxyReq.on('error', err => {
    console.error('Proxy request error:', err.message);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Proxy request error');
  });

  proxyReq.end();
});

server.listen(PORT, () => {
  console.log(`Proxy server running on http://localhost:${PORT}`);
});
