const express = require('express');
const axios = require('axios');
const morgan = require('morgan');

const app = express();
const port = 8080;

// 日志
app.use(morgan('combined'));

// 下载代理接口：GET /proxy?url=https://xx.com/file
app.get('/proxy', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl || !targetUrl.startsWith('http')) {
    return res.status(400).send('Missing or invalid url');
  }

  try {
    const response = await axios({
      method: 'GET',
      url: targetUrl,
      responseType: 'stream',
      timeout: 15000,
      headers: {
        // 模拟浏览器访问，防止被识别为爬虫
        'User-Agent': getRandomUA(),
        'Referer': extractReferer(targetUrl),
        'Accept': '*/*',
        'Connection': 'keep-alive'
      },
      validateStatus: () => true, // 不抛出异常
    });

    // 透传部分 headers
    res.setHeader('Content-Type', response.headers['content-type'] || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename=download_${Date.now()}`);
    res.setHeader('Cache-Control', 'no-cache');

    response.data.pipe(res);
  } catch (err) {
    console.error('下载失败:', err.message);
    res.status(500).send('下载失败: ' + err.message);
  }
});

function getRandomUA() {
  const uaList = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/114.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/15.0 Safari/605.1.15',
    'Mozilla/5.0 (Linux; Android 10; SM-G975F) AppleWebKit/537.36 Chrome/89.0.4389.105 Mobile Safari/537.36'
  ];
  return uaList[Math.floor(Math.random() * uaList.length)];
}

function extractReferer(url) {
  try {
    const { origin } = new URL(url);
    return origin;
  } catch {
    return '';
  }
}

app.listen(port, () => {
  console.log(`CDN 下载代理服务运行于 http://localhost:${port}/proxy?url=...`);
});
