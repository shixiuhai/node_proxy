#!/bin/bash

# =======================================
# Linux Node Server 卸载脚本
# =======================================

PROJECT_DIR="$HOME/node_proxy"
SERVICE_FILE="/etc/systemd/system/node-proxy.service"

echo "🛑 [1/3] 停止并禁用服务..."
sudo systemctl stop node-proxy
sudo systemctl disable node-proxy

echo "🧹 [2/3] 删除服务文件..."
sudo rm -f "$SERVICE_FILE"
sudo systemctl daemon-reload

echo "🗑️ [3/3] 删除项目目录..."
rm -rf "$PROJECT_DIR"

echo "✅ 卸载完成！"
