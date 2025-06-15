#!/bin/bash

# =======================================
# Linux Node Server Setup + Auto-Start (通用版)
# =======================================

REPO_URL="https://gitee.com/shixiuhai/node_proxy.git"  # ← 替换为你的仓库地址
PROJECT_DIR="$HOME/node_proxy"
NODE_CMD="node server.js"
LOG_FILE="$PROJECT_DIR/server.log"
SERVICE_FILE="/etc/systemd/system/node-proxy.service"

# 检测包管理器
if command -v apt &> /dev/null; then
    PKG_MANAGER="apt"
elif command -v yum &> /dev/null; then
    PKG_MANAGER="yum"
elif command -v dnf &> /dev/null; then
    PKG_MANAGER="dnf"
else
    echo "⚠️ 无法识别的包管理器，请手动安装依赖"
    exit 1
fi

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
    
    # 安装依赖
    echo "🔄 更新系统并安装依赖..."
    sudo $PKG_MANAGER update -y
    sudo $PKG_MANAGER install -y git nodejs npm
    
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

# === 配置 systemd 服务 ===
echo "🧩 [5/6] 配置 systemd 服务..."

sudo bash -c "cat > $SERVICE_FILE" <<EOF
[Unit]
Description=Node.js Proxy Server
After=network.target

[Service]
ExecStart=/usr/bin/node $PROJECT_DIR/server.js
WorkingDirectory=$PROJECT_DIR
User=$USER
Restart=always
RestartSec=10
StandardOutput=file:$LOG_FILE
StandardError=file:$LOG_FILE

[Install]
WantedBy=multi-user.target
EOF

# 启用并启动服务
sudo systemctl daemon-reload
sudo systemctl enable node-proxy
sudo systemctl start node-proxy

echo "🎉 [6/6] 所有操作完成！服务状态："
systemctl status node-proxy --no-pager || echo "⚠️ 服务未运行，请手动检查日志：$LOG_FILE"
