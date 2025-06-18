const express = require('express');
const cors = require('cors');
const axios = require('axios');
const LRU = require('lru-cache');
const { PassThrough } = require('stream');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
app.use(cors());

// 全局 CORS 设置
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    next();
});

// LRU 缓存（最多 100 个 ts 文件，保留 5 分钟）
const tsCache = new LRU({
    max: 100,
    ttl: 1000 * 60 * 5
});

// 请求统计
const stats = {
    totalRequests: 0,
    m3u8Requests: 0,
    tsRequests: 0,
    otherRequests: 0,
    lastRequests: []
};

// 请求日志
app.use((req, res, next) => {
    const target = req.query.target || 'N/A';
    const logEntry = {
        time: new Date().toISOString(),
        method: req.method,
        ip: req.ip,
        path: req.originalUrl,
        target
    };

    stats.lastRequests.unshift(logEntry);
    if (stats.lastRequests.length > 10) stats.lastRequests.pop();

    stats.totalRequests++;
    if (req.originalUrl.includes('.m3u8')) stats.m3u8Requests++;
    else if (req.path.startsWith('/ts')) stats.tsRequests++;
    else stats.otherRequests++;

    console.log(`[${logEntry.time}] ${logEntry.method} ${logEntry.path} from ${logEntry.ip}`);
    next();
});

const decodeTsUrl = url => decodeURIComponent(url);

// 预加载 ts 段
const prefetchTsSegments = (tsUrls, count = 5) => {
    tsUrls.slice(0, count).forEach(tsUrl => {
        const realUrl = decodeTsUrl(tsUrl);
        if (tsCache.has(realUrl)) return;

        axios.get(realUrl, {
            responseType: 'arraybuffer',
            headers: {
                Referer: realUrl,
                'User-Agent': 'Mozilla/5.0'
            }
        }).then(response => {
            tsCache.set(realUrl, {
                buffer: response.data,
                headers: response.headers
            });
            console.log(`✅ Cached (prefetch): ${realUrl}`);
        }).catch(err => {
            console.warn(`⚠️ Prefetch failed for ${realUrl}: ${err.message}`);
        });
    });
};

// ts 缓存代理接口（优化为边下边缓存边返回）
app.use('/ts', async (req, res) => {
    const rawUrl = req.query.target;
    if (!rawUrl) return res.status(400).send('Missing ts URL');

    const tsUrl = decodeTsUrl(rawUrl);
    const cached = tsCache.get(tsUrl);

    if (cached) {
        console.log(`🚀 Cache hit: ${tsUrl}`);
        Object.entries(cached.headers).forEach(([key, value]) => {
            res.setHeader(key, value);
        });
        return res.send(Buffer.from(cached.buffer));
    }

    console.log(`🌐 Fetch from origin (streaming): ${tsUrl}`);

    try {
        const response = await axios({
            method: 'get',
            url: tsUrl,
            responseType: 'stream',
            headers: {
                Referer: tsUrl,
                'User-Agent': req.headers['user-agent'] || '',
            }
        });

        res.set(response.headers);

        const chunks = [];
        const cacheStream = new PassThrough();

        response.data.on('data', chunk => {
            chunks.push(chunk);
        });

        response.data.on('end', () => {
            const fullBuffer = Buffer.concat(chunks);
            tsCache.set(tsUrl, {
                buffer: fullBuffer,
                headers: response.headers
            });
            console.log(`✅ Cached (streamed): ${tsUrl}`);
        });

        response.data.pipe(cacheStream);
        cacheStream.pipe(res);

    } catch (err) {
        res.status(500).send('TS proxy error: ' + err.message);
    }
});

// m3u8 代理主入口
app.get('/', async (req, res, next) => {
    const target = req.query.target;
    if (!target) return res.status(400).send('Missing target parameter');

    if (target.endsWith('.m3u8')) {
        try {
            const response = await axios.get(target, {
                headers: {
                    Referer: target,
                    'User-Agent': req.headers['user-agent'] || '',
                }
            });

            const content = response.data;
            const baseUrl = target.substring(0, target.lastIndexOf('/') + 1);
            const tsUrls = [];

            // 替换 ts 路径
            const modifiedM3U8 = content.replace(/^(?!#)(.+\.ts(\?.*)?)/gm, (match, p1) => {
                const tsFullUrl = p1.startsWith('http') ? p1 : baseUrl + p1;
                tsUrls.push(tsFullUrl);
                return `/ts?target=${encodeURIComponent(tsFullUrl)}`;
            });

            const isLive = !content.includes('#EXT-X-ENDLIST');
            const prefetchCount = isLive ? 2 : 5;
            prefetchTsSegments(tsUrls, prefetchCount);

            res.set('Content-Type', 'application/vnd.apple.mpegurl');
            res.send(modifiedM3U8);
        } catch (err) {
            return res.status(500).send('M3U8 proxy error: ' + err.message);
        }
    } else {
        // 其他资源转发
        const proxy = createProxyMiddleware({
            target,
            changeOrigin: true,
            secure: false,
            selfHandleResponse: false,
            pathRewrite: () => '',
            onProxyReq(proxyReq, req, res) {
                proxyReq.setHeader('Referer', target);
                proxyReq.setHeader('User-Agent', req.headers['user-agent'] || '');
            },
            onProxyRes(proxyRes) {
                proxyRes.headers['Access-Control-Allow-Origin'] = '*';
                proxyRes.headers['Access-Control-Allow-Headers'] = '*';
            }
        });
        return proxy(req, res, next);
    }
});

// 访问 /stats 查看使用情况
app.get('/stats', (req, res) => {
    res.json(stats);
});

// 启动服务
const PORT = 9000;
app.listen(PORT, () => {
    console.log(`✅ Proxy server running: http://localhost:${PORT}/?target=http://your.m3u8/url`);
});
