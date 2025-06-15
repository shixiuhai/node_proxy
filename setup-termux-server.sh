#!/data/data/com.termux/files/usr/bin/bash

# =======================================
# Termux Node Server Setup + Auto-Resurrect
# Author: ChatGPT (OpenAI)
# =======================================

REPO_URL="git clone https://gitee.com/shixiuhai/node_proxy.git"  # ← 替换为你的仓库地址
PROJECT_DIR="$HOME/node_proxy"
NODE_CMD="node server.js"
LOG_FILE="server.log"

# === 1. 更新 Termux 环境 ===
pkg update -y && pkg upgrade -y

# === 2. 安装依赖工具 ===
pkg install -y git nodejs

# === 3. 拉取服务代码 ===
if [ -d "$PROJECT_DIR" ]; then
    cd "$PROJECT_DIR" && git pull
else
    git clone "$REPO_URL" "$PROJECT_DIR"
    cd "$PROJECT_DIR"
fi

# === 4. 安装 node 依赖 ===
npm install

# === 5. 启动 node 服务（带重生） ===
if pgrep -f "$NODE_CMD" > /dev/null; then
    echo "✔ Node.js 服务已运行。"
else
    echo "⏳ 启动 Node 服务中..."
    nohup $NODE_CMD > $LOG_FILE 2>&1 &
    echo "✅ 启动成功，日志输出到 $LOG_FILE"
fi

# === 6. 设置自动重启（.bashrc） ===
BASHRC_FILE="$HOME/.bashrc"
STARTUP_LINE="bash $PROJECT_DIR/setup-termux-server.sh # auto-start node"

if ! grep -Fxq "$STARTUP_LINE" "$BASHRC_FILE"; then
    echo "$STARTUP_LINE" >> "$BASHRC_FILE"
    echo "✅ 添加到 .bashrc 实现自动重启。"
else
    echo "⚠ .bashrc 中已有启动命令。"
fi
