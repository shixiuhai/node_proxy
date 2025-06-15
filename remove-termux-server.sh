#!/data/data/com.termux/files/usr/bin/bash

# =======================================
# Termux Node Server 卸载脚本
# =======================================

PROJECT_DIR="$HOME/node_proxy"
BASHRC_FILE="$HOME/.bashrc"
STARTUP_LINE="bash $PROJECT_DIR/setup-termux-server.sh # auto-start node"

echo "🛑 [1/3] 停止运行中的服务..."
pkill -f "node server.js"

echo "🗑️ [2/3] 删除项目目录..."
rm -rf "$PROJECT_DIR"

echo "🧹 [3/3] 清理自启动配置..."
# 从.bashrc中移除启动行
if [ -f "$BASHRC_FILE" ]; then
    grep -v "$STARTUP_LINE" "$BASHRC_FILE" > "$BASHRC_FILE.tmp"
    mv "$BASHRC_FILE.tmp" "$BASHRC_FILE"
fi

echo "✅ 卸载完成！"
