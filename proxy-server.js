const http = require('http');
const net = require('net');
const url = require('url');
const httpProxy = require('http-proxy');

const PORT = 8888;

// 创建 HTTP 代理服务器
const proxy = httpProxy.createProxyServer({});

// 处理 HTTP 请求（如 GET/POST）
const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url);
  const target = `${parsed.protocol}//${parsed.host}`;

  console.log(`[HTTP] ${req.method} ${req.url}`);

  // 添加防检测 headers
  req.headers['user-agent'] = getRandomUA();
  req.headers['referer'] = parsed.protocol + '//' + parsed.host;

  proxy.web(req, res, { target, changeOrigin: true }, (err) => {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Proxy Error: ' + err.message);
  });
});

// 处理 HTTPS 请求（CONNECT 隧道）
server.on('connect', (req, clientSocket, head) => {
  const [host, port] = req.url.split(':');
  console.log(`[HTTPS] CONNECT ${host}:${port}`);

  const serverSocket = net.connect(port, host, () => {
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    serverSocket.write(head);
    serverSocket.pipe(clientSocket);
    clientSocket.pipe(serverSocket);
  });

  serverSocket.on('error', (err) => {
    console.error('[CONNECT ERROR]', err.message);
  });
});

server.listen(PORT, () => {
  console.log(`🔥 高级 HTTP 代理服务运行中：localhost:${PORT}`);
});

function getRandomUA() {
  const uaList = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/114 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
    'Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 Chrome/89.0 Mobile Safari/537.36'
  ];
  return uaList[Math.floor(Math.random() * uaList.length)];
}
