// 用于构造TLS指纹跳过cdn检测
const http = require('http');
const url = require('url');
const httpProxy = require('http-proxy');
const https = require('https');

const PORT = 8888;

// 1. 优化 TLS 指纹：配置全局 HTTPS Agent
const customCiphers = [
    'TLS_AES_128_GCM_SHA256',
    'TLS_AES_256_GCM_SHA384',
    'TLS_CHACHA20_POLY1305_SHA256',
    'ECDHE-ECDSA-AES128-GCM-SHA256',
    'ECDHE-RSA-AES128-GCM-SHA256',
    'ECDHE-ECDSA-AES256-GCM-SHA384',
    'ECDHE-RSA-AES256-GCM-SHA384',
    'ECDHE-ECDSA-CHACHA20-POLY1305',
    'ECDHE-RSA-CHACHA20-POLY1305',
].join(':');

const httpsAgent = new https.Agent({
  keepAlive: true,
  ciphers: customCiphers,
  honorCipherOrder: true,
  minVersion: 'TLSv1.2',
  maxVersion: 'TLSv1.3',
});

// 创建代理服务器实例
const proxy = httpProxy.createProxyServer({
    agent: httpsAgent,
    changeOrigin: true, // 必须为 true，以正确设置 Host 头
    secure: false,      // 对于自签名证书等情况很有用
});

// --- Header 伪装工具函数 (保持不变) ---
function getRandomUA() {
  const uaList = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15',
  ];
  return uaList[Math.floor(Math.random() * uaList.length)];
}

function spoofRequestHeaders(req, targetUrlObject) {
  const newUA = getRandomUA();
  const targetHost = targetUrlObject.host;

  const headersToRemove = [
    'via', 'x-forwarded-for', 'x-forwarded-proto', 'x-forwarded-host',
    'proxy-connection', 'upgrade-insecure-requests',
  ];
  headersToRemove.forEach(header => delete req.headers[header]);

  const spoofedHeaders = {
    'connection': 'keep-alive',
    'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'upgrade-insecure-requests': '1',
    'user-agent': newUA,
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'sec-fetch-site': 'none',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-user': '?1',
    'sec-fetch-dest': 'document',
    // 注意：Referer 最好由客户端传递，如果客户端不传，我们伪造一个
    'referer': req.headers['referer'] || `${targetUrlObject.protocol}//${targetHost}/`,
    'accept-encoding': 'gzip, deflate, br',
    'accept-language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
  };
  
  // 使用伪造的头覆盖客户端传来的头
  req.headers = { ...req.headers, ...spoofedHeaders };
}


// --- API 风格的代理服务器逻辑 ---

const server = http.createServer((req, res) => {
  // 解析请求，第二个参数为 true 以解析 query string
  const requestUrlParts = url.parse(req.url, true);
  
  // 1. 检查请求路径是否是我们期望的 API 端点
  if (requestUrlParts.pathname !== '/proxy') {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found: Please use the /proxy endpoint.');
    return;
  }
  
  // 2. 从查询参数中获取目标 URL
  const targetUrl = requestUrlParts.query.url;
  
  if (!targetUrl) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end("Bad Request: Missing 'url' query parameter.");
    return;
  }
  
  let targetUrlObject;
  try {
    targetUrlObject = new URL(targetUrl);
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end("Bad Request: Invalid 'url' provided.");
    return;
  }

  const { protocol, hostname, port, pathname, search } = targetUrlObject;

  // 3. 验证协议
  if (protocol !== 'http:' && protocol !== 'https:') {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Bad Request: Only http and https protocols are supported.');
    return;
  }

  console.log(`[API PROXY] ${req.method} -> ${targetUrl}`);

  // 4. 应用深度头部伪装
  spoofRequestHeaders(req, targetUrlObject);

  // 5. 关键：修改 req.url，让 http-proxy 请求正确的路径
  // http-proxy 会使用 req.url 作为目标服务器上的路径
  req.url = `${pathname}${search}`;
  
  // 6. 设置代理目标并执行代理
  const target = `${protocol}//${hostname}${port ? ':' + port : ''}`;
  
  proxy.web(req, res, { target }, (err) => {
    console.error(`[Proxy Error] for target ${targetUrl}: ${err.message}`);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('Proxy Error: ' + err.message);
    }
  });
});

// 清理 http-proxy 自动添加的头
proxy.on('proxyReq', (proxyReq) => {
    proxyReq.removeHeader('x-forwarded-for');
    proxyReq.removeHeader('x-forwarded-proto');
    proxyReq.removeHeader('x-forwarded-host');
    proxyReq.removeHeader('via');
});

// 已不再需要 server.on('connect', ...)

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🔥 API 风格的反检测代理服务运行中`);
  console.log(`🔥 使用方法: http://<Your_IP>:${PORT}/proxy?url=<TARGET_URL>`);
});
