const express = require('express');
const axios = require('axios');

const app = express();
const port = 3000;

// 代理下载 mp4 接口： /proxy?url=https://example.com/video.mp4
app.get('/proxy', async (req, res) => {
  const targetUrl = req.query.url;

  if (!targetUrl || !targetUrl.startsWith('http')) {
    return res.status(400).send('Invalid URL');
  }

  try {
    // 以 stream 方式转发 mp4 内容
    const response = await axios({
      url: targetUrl,
      method: 'GET',
      responseType: 'stream',
      headers: {
        // 模拟浏览器 UA，防止一些平台拒绝请求
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/114.0.0.0 Safari/537.36',
        'Referer': targetUrl, // 一些平台会校验来源
      },
    });

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', 'attachment; filename=video.mp4');
    response.data.pipe(res); // 直接管道输出
  } catch (error) {
    console.error('下载失败:', error.message);
    res.status(500).send('下载失败: ' + error.message);
  }
});

app.listen(port, () => {
  console.log(`代理服务启动：http://localhost:${port}/proxy?url=...`);
});
