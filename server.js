const express = require('express');
const axios = require('axios');
const LRU = require('lru-cache');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { Readable } = require('stream');
const { URL } = require('url');

const app = express();

// 全局 CORS 头
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    next();
});

// 缓存配置
const tsCache = new LRU({
    max: 100,
    ttl: 1000 * 30 // 默认点播30秒
});

const keyCache = new LRU({
    max: 50,
    ttl: 1000 * 60 * 10 // 默认密钥10分钟
});

// 请求锁
const fetchingSet = new Set();
const keyFetchingSet = new Set();

// 增强版UA池
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0'
];

const getRandomUA = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

// 增强URL解析安全性
const getBrowserHeaders = (url) => {
    try {
        const parsed = new URL(url);
        return {
            'Accept': '*/*',
            'Accept-Encoding': 'identity;q=1, *;q=0',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Connection': 'keep-alive',
            'Host': parsed.host,
            'Origin': parsed.origin,
            'Referer': url,
            'Sec-Fetch-Dest': 'video',
            'Sec-Fetch-Mode': 'no-cors',
            'Sec-Fetch-Site': 'cross-site',
            'Pragma': 'no-cache',
            'Cache-Control': 'no-cache',
            'User-Agent': getRandomUA()
        };
    } catch (e) {
        return { 'User-Agent': getRandomUA() };
    }
};

// URL拼接辅助函数 (增强错误处理)
const absoluteUrl = (relativeUrl, baseUrl) => {
    if (!relativeUrl) return '';
    try {
        // 已经是绝对URL
        if (/^https?:\/\//i.test(relativeUrl)) return relativeUrl;
        
        // 处理协议相对URL (//example.com/path)
        if (relativeUrl.startsWith('//')) {
            const base = new URL(baseUrl);
            return `${base.protocol}${relativeUrl}`;
        }
        
        // 处理绝对路径 (/path)
        if (relativeUrl.startsWith('/')) {
            const base = new URL(baseUrl);
            return `${base.origin}${relativeUrl}`;
        }
        
        // 相对路径
        return new URL(relativeUrl, baseUrl).href;
    } catch (e) {
        console.error(`URL拼接错误: base=${baseUrl}, relative=${relativeUrl}`, e);
        return relativeUrl;
    }
};

// 日志统计 (增加响应时间统计)
const stats = {
    totalRequests: 0,
    m3u8Requests: 0,
    tsRequests: 0,
    keyRequests: 0,
    otherRequests: 0,
    lastRequests: [],
    responseTimes: {
        ts: { count: 0, total: 0, avg: 0 },
        key: { count: 0, total: 0, avg: 0 },
        m3u8: { count: 0, total: 0, avg: 0 }
    }
};

app.use((req, res, next) => {
    const start = Date.now();
    const target = req.query.target || 'N/A';
    const logEntry = {
        time: new Date().toISOString(),
        method: req.method,
        ip: req.ip,
        path: req.originalUrl,
        target
    };

    res.on('finish', () => {
        const duration = Date.now() - start;
        logEntry.duration = duration;
        
        // 更新响应时间统计
        if (req.path.startsWith('/ts')) {
            stats.responseTimes.ts.count++;
            stats.responseTimes.ts.total += duration;
            stats.responseTimes.ts.avg = Math.round(stats.responseTimes.ts.total / stats.responseTimes.ts.count);
        } else if (req.path.startsWith('/key')) {
            stats.responseTimes.key.count++;
            stats.responseTimes.key.total += duration;
            stats.responseTimes.key.avg = Math.round(stats.responseTimes.key.total / stats.responseTimes.key.count);
        } else if (req.originalUrl.includes('.m3u8')) {
            stats.responseTimes.m3u8.count++;
            stats.responseTimes.m3u8.total += duration;
            stats.responseTimes.m3u8.avg = Math.round(stats.responseTimes.m3u8.total / stats.responseTimes.m3u8.count);
        }
    });

    stats.lastRequests.unshift(logEntry);
    if (stats.lastRequests.length > 10) stats.lastRequests.pop();

    stats.totalRequests++;
    if (req.originalUrl.includes('.m3u8')) {
        stats.m3u8Requests++;
    } else if (req.path.startsWith('/ts')) {
        stats.tsRequests++;
    } else if (req.path.startsWith('/key')) {
        stats.keyRequests++;
    } else {
        stats.otherRequests++;
    }

    console.log(`[${logEntry.time}] ${logEntry.method} ${logEntry.path} from ${logEntry.ip}`);
    next();
});

const decodeTsUrl = url => decodeURIComponent(url);

// 带重试的请求函数 (增加Jitter)
const fetchWithRetry = async (url, maxRetries = 3) => {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                headers: getBrowserHeaders(url),
                timeout: 10000,
                proxy: false
            });
            return response;
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            
            // 指数退避 + Jitter
            const baseDelay = 300;
            const jitter = Math.random() * 100;
            const delay = baseDelay * Math.pow(2, i) + jitter;
            
            console.warn(`↺ Retry ${i + 1}/${maxRetries} for ${url} in ${Math.round(delay)}ms`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
};

// 预取TS片段 (增加并发控制)
const MAX_CONCURRENT_PREFETCH = 5;
let activePrefetches = 0;

const prefetchTsSegments = (tsUrls, isLive = false) => {
    const prefetchCount = isLive ? 3 : 5;
    
    tsUrls.slice(0, prefetchCount).forEach(tsUrl => {
        const realUrl = decodeTsUrl(tsUrl);
        if (tsCache.has(realUrl)) return;
        if (fetchingSet.has(realUrl)) return;

        // 并发控制
        if (activePrefetches >= MAX_CONCURRENT_PREFETCH) {
            console.log(`⏸️ Prefetch paused (concurrency limit): ${realUrl}`);
            return;
        }

        fetchingSet.add(realUrl);
        activePrefetches++;

        fetchWithRetry(realUrl)
            .then(response => {
                tsCache.set(realUrl, {
                    buffer: response.data,
                    headers: response.headers
                }, {
                    ttl: isLive ? 5000 : 30000
                });
                console.log(`✅ Pre-cached (${isLive ? 'LIVE' : 'VOD'}): ${realUrl}`);
            })
            .catch(err => {
                console.warn(`⚠️ Prefetch failed for ${realUrl}: ${err.code || err.message}`);
            })
            .finally(() => {
                fetchingSet.delete(realUrl);
                activePrefetches--;
            });
    });
};

// TS代理接口 (优化等待队列)
const tsWaiters = new Map();

app.use('/ts', async (req, res) => {
    const start = Date.now();
    const rawUrl = req.query.target;
    if (!rawUrl) return res.status(400).send('Missing ts URL');
    
    const tsUrl = decodeTsUrl(rawUrl);

    // 尝试从缓存获取
    const cached = tsCache.get(tsUrl);
    if (cached) {
        console.log(`🚀 Cache hit: ${tsUrl} (${cached.buffer.length} bytes)`);
        Object.entries(cached.headers).forEach(([key, value]) => {
            if (!['content-encoding', 'transfer-encoding', 'content-length'].includes(key.toLowerCase())) {
                res.setHeader(key, value);
            }
        });
        res.setHeader('X-Cache-Status', 'HIT');
        return Readable.from(cached.buffer).pipe(res);
    }

    // 检查是否正在请求
    if (fetchingSet.has(tsUrl)) {
        console.log(`⏳ Waiting for pending request: ${tsUrl}`);
        res.setHeader('X-Cache-Status', 'WAITING');
        
        return new Promise(resolve => {
            if (!tsWaiters.has(tsUrl)) {
                tsWaiters.set(tsUrl, []);
            }
            
            const cleanup = () => {
                const index = tsWaiters.get(tsUrl).indexOf(resolve);
                if (index !== -1) {
                    tsWaiters.get(tsUrl).splice(index, 1);
                }
                if (tsWaiters.get(tsUrl).length === 0) {
                    tsWaiters.delete(tsUrl);
                }
            };
            
            // 5秒超时
            const timeout = setTimeout(() => {
                cleanup();
                console.error(`⌛ Timeout waiting for ${tsUrl}`);
                res.status(504).send('Upstream response timeout');
            }, 5000);
            
            tsWaiters.get(tsUrl).push(() => {
                clearTimeout(timeout);
                const cachedData = tsCache.get(tsUrl);
                if (cachedData) {
                    Object.entries(cachedData.headers).forEach(([key, value]) => {
                        if (!['content-encoding', 'transfer-encoding', 'content-length'].includes(key.toLowerCase())) {
                            res.setHeader(key, value);
                        }
                    });
                    Readable.from(cachedData.buffer).pipe(res);
                } else {
                    res.status(504).send('Upstream response timeout');
                }
                cleanup();
                resolve();
            });
        });
    }

    console.log(`🌐 Fetching from origin: ${tsUrl}`);
    fetchingSet.add(tsUrl);
    res.setHeader('X-Cache-Status', 'MISS');

    try {
        const response = await fetchWithRetry(tsUrl);
        const data = response.data;
        const duration = Date.now() - start;
        
        // 缓存并响应
        tsCache.set(tsUrl, {
            buffer: data,
            headers: response.headers
        });
        
        Object.entries(response.headers).forEach(([key, value]) => {
            if (!['content-encoding', 'transfer-encoding', 'content-length'].includes(key.toLowerCase())) {
                res.setHeader(key, value);
            }
        });
        
        // 通知等待中的请求
        if (tsWaiters.has(tsUrl)) {
            tsWaiters.get(tsUrl).forEach(waiter => waiter());
            tsWaiters.delete(tsUrl);
        }
        
        Readable.from(data).pipe(res);
        console.log(`✅ Fetched & cached: ${tsUrl} (${data.length} bytes, ${duration}ms)`);
    } catch (err) {
        console.error(`❌ TS fetch failed: ${tsUrl}`, err.message);
        res.status(502).send('Upstream error: ' + (err.code || err.message));
        
        // 通知等待中的请求
        if (tsWaiters.has(tsUrl)) {
            tsWaiters.get(tsUrl).forEach(waiter => waiter());
            tsWaiters.delete(tsUrl);
        }
    } finally {
        fetchingSet.delete(tsUrl);
    }
});

// 密钥文件代理接口 (动态缓存策略)
app.use('/key', async (req, res) => {
    const start = Date.now();
    const rawUrl = req.query.target;
    if (!rawUrl) return res.status(400).send('Missing key URL');
    
    const keyUrl = decodeTsUrl(rawUrl);
    const isLiveKey = req.query.live === 'true';
    
    // 动态缓存策略
    const keyCacheTTL = isLiveKey ? 30000 : 600000; // 直播密钥30秒，点播10分钟

    // 尝试从缓存获取
    const cached = keyCache.get(keyUrl);
    if (cached) {
        console.log(`🔑 Cache hit (key): ${keyUrl} (${cached.buffer.length} bytes)`);
        Object.entries(cached.headers).forEach(([key, value]) => {
            if (!['content-encoding', 'transfer-encoding', 'content-length'].includes(key.toLowerCase())) {
                res.setHeader(key, value);
            }
        });
        res.setHeader('X-Cache-Status', 'HIT');
        return Readable.from(cached.buffer).pipe(res);
    }

    // 检查是否正在请求
    if (keyFetchingSet.has(keyUrl)) {
        console.log(`⏳ Waiting for pending key request: ${keyUrl}`);
        res.setHeader('X-Cache-Status', 'WAITING');
        
        return new Promise(resolve => {
            if (!tsWaiters.has(keyUrl)) {
                tsWaiters.set(keyUrl, []);
            }
            
            const cleanup = () => {
                const index = tsWaiters.get(keyUrl).indexOf(resolve);
                if (index !== -1) {
                    tsWaiters.get(keyUrl).splice(index, 1);
                }
                if (tsWaiters.get(keyUrl).length === 0) {
                    tsWaiters.delete(keyUrl);
                }
            };
            
            // 5秒超时
            const timeout = setTimeout(() => {
                cleanup();
                console.error(`⌛ Timeout waiting for key ${keyUrl}`);
                res.status(504).send('Upstream key response timeout');
            }, 5000);
            
            tsWaiters.get(keyUrl).push(() => {
                clearTimeout(timeout);
                const cachedData = keyCache.get(keyUrl);
                if (cachedData) {
                    Object.entries(cachedData.headers).forEach(([key, value]) => {
                        if (!['content-encoding', 'transfer-encoding', 'content-length'].includes(key.toLowerCase())) {
                            res.setHeader(key, value);
                        }
                    });
                    Readable.from(cachedData.buffer).pipe(res);
                } else {
                    res.status(504).send('Upstream key response timeout');
                }
                cleanup();
                resolve();
            });
        });
    }

    console.log(`🌐 Fetching key from origin: ${keyUrl}`);
    keyFetchingSet.add(keyUrl);
    res.setHeader('X-Cache-Status', 'MISS');

    try {
        const response = await fetchWithRetry(keyUrl);
        const data = response.data;
        const duration = Date.now() - start;
        
        // 缓存并响应
        keyCache.set(keyUrl, {
            buffer: data,
            headers: response.headers
        }, {
            ttl: keyCacheTTL
        });
        
        Object.entries(response.headers).forEach(([key, value]) => {
            if (!['content-encoding', 'transfer-encoding', 'content-length'].includes(key.toLowerCase())) {
                res.setHeader(key, value);
            }
        });
        
        // 通知等待中的请求
        if (tsWaiters.has(keyUrl)) {
            tsWaiters.get(keyUrl).forEach(waiter => waiter());
            tsWaiters.delete(keyUrl);
        }
        
        Readable.from(data).pipe(res);
        console.log(`✅ Fetched & cached key: ${keyUrl} (${data.length} bytes, ${duration}ms)`);
    } catch (err) {
        console.error(`❌ Key fetch failed: ${keyUrl}`, err.message);
        res.status(502).send('Key proxy error: ' + (err.code || err.message));
        
        // 通知等待中的请求
        if (tsWaiters.has(keyUrl)) {
            tsWaiters.get(keyUrl).forEach(waiter => waiter());
            tsWaiters.delete(keyUrl);
        }
    } finally {
        keyFetchingSet.delete(keyUrl);
    }
});

// M3U8处理增强 (支持更多格式)
app.get('/', async (req, res, next) => {
    const start = Date.now();
    const target = req.query.target;
    if (!target) return res.status(400).send('Missing target parameter');

    if (target.endsWith('.m3u8')) {
        try {
            const response = await axios.get(target, {
                headers: getBrowserHeaders(target),
                timeout: 10000,
                proxy: false
            });

            const content = response.data;
            const baseUrl = target.substring(0, target.lastIndexOf('/') + 1);
            const tsUrls = [];
            const isLive = !content.includes('#EXT-X-ENDLIST');

            // 增强M3U8处理
            const modifiedM3U8 = content
                .split('\n')
                .map(line => {
                    // 处理密钥文件
                    if (line.startsWith('#EXT-X-KEY') || line.startsWith('#EXT-X-MAP')) {
                        const uriMatch = /URI="([^"]+)"/.exec(line);
                        if (uriMatch) {
                            const uri = uriMatch[1];
                            const fullUri = absoluteUrl(uri, baseUrl);
                            
                            // 保留原始METHOD和IV参数
                            return line.replace(
                                uri, 
                                `/key?target=${encodeURIComponent(fullUri)}&live=${isLive}`
                            );
                        }
                        return line;
                    }
                    
                    // 处理分片列表
                    if (!line.startsWith('#') && line.trim() !== '') {
                        // 支持带查询参数的TS文件
                        const [path, query] = line.split('?');
                        const tsFullUrl = absoluteUrl(path, baseUrl) + (query ? `?${query}` : '');
                        tsUrls.push(tsFullUrl);
                        return `/ts?target=${encodeURIComponent(tsFullUrl)}`;
                    }
                    
                    // 处理变体播放列表
                    if (line.startsWith('#EXT-X-STREAM-INF')) {
                        const nextLine = line.split('\n')[1];
                        if (nextLine && !nextLine.startsWith('#')) {
                            const variantUrl = absoluteUrl(nextLine.trim(), baseUrl);
                            return `${line}\n${variantUrl}?target=${encodeURIComponent(variantUrl)}`;
                        }
                    }
                    
                    return line;
                })
                .join('\n');

            // 根据直播/点播调整预取
            prefetchTsSegments(tsUrls, isLive);

            res.set('Content-Type', 'application/vnd.apple.mpegurl');
            res.set('X-Processing-Time', `${Date.now() - start}ms`);
            res.send(modifiedM3U8);
            console.log(`🌀 Processed M3U8: ${target} (${content.length} bytes, ${Date.now() - start}ms)`);
        } catch (err) {
            console.error('M3U8 fetch error:', err.message);
            res.status(502).send('Upstream error: ' + (err.code || err.message));
        }
    } else {
        createProxyMiddleware({
            target,
            changeOrigin: true,
            secure: false,
            pathRewrite: { '^/': '' },
            onProxyReq: (proxyReq) => {
                Object.entries(getBrowserHeaders(target)).forEach(([key, value]) => {
                    proxyReq.setHeader(key, value);
                });
            },
            onProxyRes: (proxyRes) => {
                proxyRes.headers['access-control-allow-origin'] = '*';
            }
        })(req, res, next);
    }
});

// 缓存管理API
app.delete('/cache', (req, res) => {
    const type = req.query.type;
    let count = 0;
    
    if (!type || type === 'ts') {
        count += tsCache.size;
        tsCache.clear();
    }
    
    if (!type || type === 'key') {
        count += keyCache.size;
        keyCache.clear();
    }
    
    res.json({
        success: true,
        message: `Cleared ${count} cache entries`,
        cleared: count
    });
});

// 状态统计 (增加缓存命中率)
app.get('/stats', (req, res) => {
    const tsHitRate = stats.responseTimes.ts.count > 0 
        ? Math.round((stats.tsRequests - stats.responseTimes.ts.count) / stats.tsRequests * 100) 
        : 0;
    
    const keyHitRate = stats.responseTimes.key.count > 0 
        ? Math.round((stats.keyRequests - stats.responseTimes.key.count) / stats.keyRequests * 100) 
        : 0;
    
    res.json({
        ...stats,
        cacheSize: tsCache.size,
        keyCacheSize: keyCache.size,
        fetchingCount: fetchingSet.size,
        keyFetchingCount: keyFetchingSet.size,
        cacheHitRate: {
            ts: `${tsHitRate}%`,
            key: `${keyHitRate}%`
        }
    });
});

// 启动服务
const PORT = process.env.PORT || 9000;
app.listen(PORT, () => {
    console.log(`🚀 Proxy server running: http://localhost:${PORT}/?target=YOUR_M3U8_URL`);
    console.log(`📊 Stats endpoint: http://localhost:${PORT}/stats`);
});
