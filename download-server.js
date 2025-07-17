// 引入 Node.js 内置的 cluster 模块，用于多进程管理
const cluster = require('cluster');
// 引入 os 模块，用于获取 CPU 核心数等系统信息（虽然当前未使用，但可用于扩展）
const os = require('os');
// 引入 http 模块，用于创建 HTTP 服务器
const http = require('http');
// 引入 url 模块，用于解析请求中的 URL
const url = require('url');
// 引入 http-proxy 模块，用于创建反向代理
const httpProxy = require('http-proxy');
// 引入 https 模块，用于配置 HTTPS 客户端选项
const https = require('https');

// 设置代理服务器监听的端口
const PORT = 8888;

// 从环境变量中读取工作进程数量，如果没有设置则默认为 2
const WORKERS = parseInt(process.env.WORKERS) || 2;

// 判断当前是否是主进程（Primary）
if (cluster.isPrimary) {
    // 主进程日志
    console.log(`🖥️ 主进程 ${process.pid} 正在运行`);

    // 根据 WORKERS 数量 fork 多个工作进程
    for (let i = 0; i < WORKERS; i++) {
        cluster.fork();
    }

    // 监听子进程退出事件，自动重启崩溃的子进程
    cluster.on('exit', (worker, code, signal) => {
        console.log(`⚠️ 工作进程 ${worker.process.pid} 已退出，正在重启...`);
        cluster.fork(); // 重启一个新进程
    });
} else {
    // 如果是子进程（Worker），则运行代理服务器逻辑
    startProxyServer();
}

// 子进程执行的代理服务器启动函数
function startProxyServer() {
    // 自定义 TLS 加密套件（Ciphers），用于优化 TLS 指纹，模拟浏览器行为
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

    // 创建一个自定义的 HTTPS Agent，用于优化 TLS 配置
    const httpsAgent = new https.Agent({
        keepAlive: true, // 启用长连接
        ciphers: customCiphers, // 使用自定义加密套件
        honorCipherOrder: true, // 优先使用客户端指定的加密套件
        minVersion: 'TLSv1.2', // 最低 TLS 版本
        maxVersion: 'TLSv1.3', // 最高 TLS 版本
    });

    // 创建一个反向代理服务器实例
    const proxy = httpProxy.createProxyServer({
        agent: httpsAgent, // 使用自定义 HTTPS Agent
        changeOrigin: true, // 更改请求头中的 Host 字段为目标地址
        secure: false,      // 允许代理到使用自签名证书的目标服务器
    });

    // --- 工具函数：随机 User-Agent 生成器 ---
    function getRandomUA() {
        const uaList = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15',
        ];
        return uaList[Math.floor(Math.random() * uaList.length)];
    }

    // --- 工具函数：伪造请求头，模拟浏览器行为 ---
    function spoofRequestHeaders(req, targetUrlObject) {
        const newUA = getRandomUA(); // 获取一个随机 User-Agent
        const targetHost = targetUrlObject.host; // 获取目标主机名

        // 删除一些可能暴露代理身份的请求头
        const headersToRemove = [
            'via', 'x-forwarded-for', 'x-forwarded-proto', 'x-forwarded-host',
            'proxy-connection', 'upgrade-insecure-requests',
        ];
        headersToRemove.forEach(header => delete req.headers[header]);

        // 构造一组伪造的请求头，模拟浏览器行为
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
            'referer': req.headers['referer'] || `${targetUrlObject.protocol}//${targetHost}/`,
            'accept-encoding': 'gzip, deflate, br',
            'accept-language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
        };

        // 合并原始请求头与伪造的请求头
        req.headers = { ...req.headers, ...spoofedHeaders };
    }

    // 创建 HTTP 服务器
    const server = http.createServer((req, res) => {
        // 解析请求的 URL，包含查询参数
        const requestUrlParts = url.parse(req.url, true);

        // 检查请求路径是否为 /proxy，如果不是则返回 404
        if (requestUrlParts.pathname !== '/proxy') {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found: Please use the /proxy endpoint.');
            return;
        }

        // 获取目标 URL（来自查询参数）
        const targetUrl = requestUrlParts.query.url;
        if (!targetUrl) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end("Bad Request: Missing 'url' query parameter.");
            return;
        }

        // 尝试将目标 URL 转换为 URL 对象
        let targetUrlObject;
        try {
            targetUrlObject = new URL(targetUrl);
        } catch (e) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end("Bad Request: Invalid 'url' provided.");
            return;
        }

        // 解构目标 URL 的各个部分
        const { protocol, hostname, port, pathname, search } = targetUrlObject;

        // 只允许 http 和 https 协议
        if (protocol !== 'http:' && protocol !== 'https:') {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Bad Request: Only http and https protocols are supported.');
            return;
        }

        // 打印代理请求日志
        console.log(`[API PROXY] ${req.method} -> ${targetUrl}`);

        // 伪造请求头
        spoofRequestHeaders(req, targetUrlObject);

        // 重写 req.url，确保代理服务器将请求转发到正确路径
        req.url = `${pathname}${search}`;

        // 构造目标地址字符串
        const target = `${protocol}//${hostname}${port ? ':' + port : ''}`;

        // 通过 http-proxy 将请求转发到目标地址
        proxy.web(req, res, { target }, (err) => {
            console.error(`[Proxy Error] for target ${targetUrl}: ${err.message}`);
            if (!res.headersSent) {
                res.writeHead(502, { 'Content-Type': 'text/plain' });
                res.end('Proxy Error: ' + err.message);
            }
        });
    });

    // 在代理请求发出前，移除一些可能暴露代理身份的请求头
    proxy.on('proxyReq', (proxyReq) => {
        proxyReq.removeHeader('x-forwarded-for');
        proxyReq.removeHeader('x-forwarded-proto');
        proxyReq.removeHeader('x-forwarded-host');
        proxyReq.removeHeader('via');
    });

    // 启动 HTTP 服务器并监听指定端口
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`🔥 [Worker ${process.pid}] API 风格的反检测代理服务运行中`);
        console.log(`🔥 使用方法: http://<Your_IP>:${PORT}/proxy?url=<TARGET_URL>`);
    });
}
