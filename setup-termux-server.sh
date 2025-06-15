#!/data/data/com.termux/files/usr/bin/bash

# =======================================
# Termux Node Server Setup + Auto-Resurrect (稳定版)
# Author: ChatGPT (OpenAI)
# =======================================

REPO_URL="https://gitee.com/shixiuhai/node_proxy.git"  # ← 替换为你的仓库地址
PROJECT_DIR="$HOME/node_proxy"
NODE_CMD="node server.js"
LOG_FILE="$PROJECT_DIR/server.log"
BASHRC_FILE="$HOME/.bashrc"
STARTUP_LINE="bash $PROJECT_DIR/setup-termux-server.sh # auto-start node"

echo "📦 [1/6] 正在检查项目目录..."

# 尝试直接运行服务（如果目录存在）
goto_install="false"
if [ -d "$PROJECT_DIR" ]; then
    echo "✅ 项目目录已存在，尝试运行服务..."

    cd "$PROJECT_DIR" || exit 1

    if ! pgrep -f "$NODE_CMD" > /dev/null; then
        echo "⏳ 尝试启动 Node 服务..."
        nohup $NODE_CMD > "$LOG_FILE" 2>&1 &
        sleep 3
        if pgrep -f "$NODE_CMD" > /dev/null; then
            echo "✅ 服务启动成功（跳过重新安装）"
        else
            echo "⚠️ 启动失败，准备重新安装环境..."
            goto_install="true"
        fi
    else
        echo "✔ Node.js 服务已在运行中。"
    fi
else
    echo "📁 项目目录不存在，准备拉取代码并安装..."
    goto_install="true"
fi

# === 如服务失败或目录不存在，执行完整安装流程 ===
if [ "$goto_install" = "true" ]; then
    echo "🔧 [2/6] 开始环境设置..."

    # 更新 Termux 环境
    pkg update -y && pkg upgrade -y

    # 安装依赖
    pkg install -y git nodejs

    # 获取最新代码
    rm -rf "$PROJECT_DIR"
    git clone "$REPO_URL" "$PROJECT_DIR"
    cd "$PROJECT_DIR" || exit 1

    # 安装 Node.js 依赖
    echo "📦 [3/6] 正在安装依赖..."
    npm install

    # 启动服务
    echo "🚀 [4/6] 启动 Node 服务..."
    nohup $NODE_CMD > "$LOG_FILE" 2>&1 &
    echo "✅ 服务已启动，日志文件: $LOG_FILE"
fi

# === 添加自启动逻辑 ===
echo "🧩 [5/6] 配置 .bashrc 自动重启..."

# === 安全写入 .bashrc ===
if [ ! -f "$BASHRC_FILE" ]; then
    echo "📄 .bashrc 不存在，创建中..."
    if echo "# Auto-start setup" > "$BASHRC_FILE"; then
        echo "✅ 成功创建 .bashrc"
    else
        echo "❌ 无法创建 .bashrc，请检查 Termux 权限或磁盘空间！"
        exit 1
    fi
fi

# 避免重复写入启动命令
if grep -Fxq "$STARTUP_LINE" "$BASHRC_FILE"; then
    echo "ℹ️  .bashrc 已包含启动命令，跳过追加。"
else
    echo "$STARTUP_LINE" >> "$BASHRC_FILE"
    echo "✅ 启动命令已追加到 .bashrc"
fi


echo "🎉 [6/6] 所有操作完成！服务状态："
pgrep -fl "$NODE_CMD" || echo "⚠️ 服务未运行，请手动检查日志：$LOG_FILE"
