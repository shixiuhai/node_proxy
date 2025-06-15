#!/data/data/com.termux/files/usr/bin/bash

# =======================================
# Termux Node Server Setup + Auto-Resurrect (优化版)
# Author: ChatGPT (OpenAI)
# =======================================

REPO_URL="https://gitee.com/shixiuhai/node_proxy.git"  # ← 替换为你的仓库地址
PROJECT_DIR="$HOME/node_proxy"
NODE_CMD="node server.js"
LOG_FILE="$PROJECT_DIR/server.log"
BASHRC_FILE="$HOME/.bashrc"
STARTUP_LINE="bash $PROJECT_DIR/setup-termux-server.sh # auto-start node"

echo "📦 正在检查项目目录..."

# 尝试直接运行服务（如果目录存在）
if [ -d "$PROJECT_DIR" ]; then
    echo "✅ 项目目录已存在，尝试运行服务..."

    cd "$PROJECT_DIR" || exit 1

    if ! pgrep -f "$NODE_CMD" > /dev/null; then
        echo "⏳ 正在启动 Node 服务..."
        nohup $NODE_CMD > $LOG_FILE 2>&1 &

        sleep 3
        if pgrep -f "$NODE_CMD" > /dev/null; then
            echo "✅ 服务启动成功（跳过重新安装）"
        else
            echo "⚠ 启动失败，执行完整安装流程..."
            goto_install="true"
        fi
    else
        echo "✔ Node.js 服务已经运行。"
    fi
else
    echo "📁 项目目录不存在，准备安装..."
    goto_install="true"
fi

# 如果需要重新安装
if [ "$goto_install" = "true" ]; then
    echo "🔧 开始完整环境设置..."

    # 更新 Termux 环境
    pkg update -y && pkg upgrade -y

    # 安装依赖
    pkg install -y git nodejs

    # 获取代码
    rm -rf "$PROJECT_DIR"
    git clone "$REPO_URL" "$PROJECT_DIR"
    cd "$PROJECT_DIR" || exit 1

    # 安装 Node 依赖
    npm install

    # 启动服务
    nohup $NODE_CMD > $LOG_FILE 2>&1 &
    echo "✅ 全新部署并启动完成。日志：$LOG_FILE"
fi

# 添加自启动指令到 .bashrc
if ! grep -Fxq "$STARTUP_LINE" "$BASHRC_FILE"; then
    echo "$STARTUP_LINE" >> "$BASHRC_FILE"
    echo "✅ 已添加自启动命令到 .bashrc"
else
    echo "ℹ 已存在 .bashrc 自启动命令"
fi
