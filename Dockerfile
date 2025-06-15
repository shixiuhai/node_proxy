# 使用Node.js官方镜像
FROM node:18.20.4

# 设置工作目录
WORKDIR /app

# 复制必要文件
COPY package.json server.js ./

# 安装生产依赖
RUN npm install --production

# 优化权限
RUN chown -R node:node /app
USER node

# 暴露端口
EXPOSE 9000

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s \
  CMD curl -f http://localhost:9000/stats || exit 1

# 启动命令
CMD ["node", "server.js"]
