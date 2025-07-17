// 这个代理服务器具备以下特点：

// 支持 HTTP 和 HTTPS 请求转发；

// 优先使用 HTTP/2 以提高效率；

// 可自定义 referer 和 cookie；

// 随机 User-Agent，模拟不同设备；

// 支持 Range 请求（适用于视频、文件分段下载）；

// 具备基础的反爬特性；

// 支持跨域访问（CORS）

// 引入 Node.js 内置模块
const http = require('http');         // 创建 HTTP 服务器和请求
const https = require('https');       // 发起 HTTPS 请求
const url = require('url');           // 解析 URL
const http2 = require('http2');       // 发起 HTTP/2 请求

// 设置服务监听端口
const PORT = 8888;

// 随机 User-Agent 列表（用于模拟不同客户端，防止被目标网站反爬）
const UA_LIST = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/114 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/114 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
  'Mozilla/5.0 (Linux; Android 10; Pixel 4) AppleWebKit/537.36 Chrome/114 Mobile Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/118.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 11_0) AppleWebKit/605.1.15 Safari/605.1.15',
  'Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
  'Mozilla/5.0 (Linux; Android 11; SM-G998U) AppleWebKit/537.36 Chrome/115 Mobile Safari/537.36',
  'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/109.0',
  'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 Chrome/106 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 12_2_1) AppleWebKit/537.36 Chrome/98 Safari/537.36',
  'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 Chrome/115 Mobile Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_2 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edge/117.0.2045.31',
];

// 随机获取一个 User-Agent
function getRandomUserAgent() {
  return UA_LIST[Math.floor(Math.random() * UA_LIST.length)];
}

// 创建 HTTP 代理服务器
const server = http.createServer((req, res) => {
  console.log(`[${new Date().toISOString()}] Incoming request: ${req.method} ${req.url}`);

  // 设置 CORS 头，允许跨域访问
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 处理浏览器的预检请求（OPTIONS）
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const reqUrl = url.parse(req.url, true); // 解析 URL 和参数

  // 只允许访问 /proxy 路径
  if (reqUrl.pathname !== '/proxy') {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
    return;
  }

  // 获取 query 参数：url、referer、cookie
  const targetUrl = reqUrl.query.url;
  const customReferer = reqUrl.query.referer;
  const customCookie = reqUrl.query.cookie;

  // 没有传目标地址
  if (!targetUrl) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Missing url query parameter');
    return;
  }

  let parsedTarget;
  try {
    parsedTarget = new URL(targetUrl); // 尝试解析目标 URL
  } catch (err) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Invalid target url');
    return;
  }

  // 构造请求头（包括伪装成正常浏览器）
  const baseHeaders = {
    'User-Agent': getRandomUserAgent(),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Encoding': 'identity',  // 避免 gzip，方便中转处理
    'Accept-Language': 'en-US,en;q=0.9',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'DNT': '1',
    'Sec-Fetch-Site': 'cross-site',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-User': '?1',
    'Sec-Fetch-Dest': 'document',
    'Referer': customReferer || parsedTarget.origin + '/',
    'Cookie': customCookie || '',
  };

  // 如果请求中带有 Range（比如视频预加载），保留转发
  if (req.headers['range']) {
    baseHeaders['Range'] = req.headers['range'];
  }

  // 对 https 使用优先尝试 HTTP/2，失败则回退 HTTP/1.1
  if (parsedTarget.protocol === 'https:') {
    tryHttp2(parsedTarget, baseHeaders, res, () => {
      tryHttp1(parsedTarget, baseHeaders, res);
    });
  } else {
    tryHttp1(parsedTarget, baseHeaders, res);
  }
});

// 发起 HTTP/2 请求，如果失败则调用 fallback 回退函数
function tryHttp2(parsedTarget, headers, res, fallback) {
  const client = http2.connect(parsedTarget.origin); // 建立 HTTP/2 会话

  client.on('error', (err) => {
    console.warn(`[${new Date().toISOString()}] HTTP/2 connect error: ${err.message}`);
    client.destroy(); // 销毁连接
    fallback(); // 回退到 HTTP/1.1
  });

  // 构造 HTTP/2 请求头（必须带有 :method 和 :path）
  const reqHeaders = {
    ':method': 'GET',
    ':path': parsedTarget.pathname + parsedTarget.search,
    ...headers,
  };

  const h2Req = client.request(reqHeaders); // 发送 HTTP/2 请求

  let statusCode = 200;
  const responseHeaders = {};

  // 响应头处理
  h2Req.on('response', (headers) => {
    statusCode = headers[':status'] || 200;
    for (const [key, value] of Object.entries(headers)) {
      // 过滤掉某些不兼容的编码头
      if (![':status', 'content-encoding', 'transfer-encoding'].includes(key.toLowerCase())) {
        responseHeaders[key] = value;
      }
    }
    res.writeHead(statusCode, responseHeaders); // 转发响应头
  });

  // 数据流传输
  h2Req.on('data', (chunk) => res.write(chunk));
  h2Req.on('end', () => {
    res.end();
    client.close(); // 关闭连接
    console.log(`[${new Date().toISOString()}] HTTP/2 response ${statusCode} from ${parsedTarget.href}`);
  });

  h2Req.on('error', (err) => {
    console.error(`[${new Date().toISOString()}] HTTP/2 stream error: ${err.message}`);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Proxy error: ' + err.message);
    client.close();
  });

  h2Req.end(); // 完成请求
}

// 发起 HTTP/1.1 请求（用于 http 或 HTTP/2 失败的情况）
function tryHttp1(parsedTarget, headers, res) {
  const options = {
    protocol: parsedTarget.protocol,
    hostname: parsedTarget.hostname,
    port: parsedTarget.port || (parsedTarget.protocol === 'https:' ? 443 : 80),
    path: parsedTarget.pathname + parsedTarget.search,
    method: 'GET',
    headers,
    timeout: 10000,
  };

  // 根据协议选择模块
  const proxyModule = parsedTarget.protocol === 'https:' ? https : http;

  // 发起请求
  const proxyReq = proxyModule.request(options, proxyRes => {
    // 过滤不兼容的响应头
    const filteredHeaders = { ...proxyRes.headers };
    delete filteredHeaders['content-encoding'];
    delete filteredHeaders['transfer-encoding'];

    res.writeHead(proxyRes.statusCode, filteredHeaders); // 写入状态码和头
    proxyRes.pipe(res); // 直接转发数据流
    console.log(`[${new Date().toISOString()}] HTTP/1.1 response ${proxyRes.statusCode} from ${parsedTarget.href}`);
  });

  // 错误处理
  proxyReq.on('error', err => {
    console.error(`[${new Date().toISOString()}] HTTP/1.1 proxy error: ${err.message}`);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Proxy error: ' + err.message);
  });

  proxyReq.end(); // 发送请求
}

// 启动服务器监听
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🛡 Proxy server running at http://0.0.0.0:${PORT}/proxy`);
});
