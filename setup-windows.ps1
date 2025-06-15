# =======================================
# Windows Node Server Setup + Auto-Start (PowerShell版)
# =======================================

$REPO_URL = "https://gitee.com/shixiuhai/node_proxy.git"  # ← 替换为你的仓库地址
$PROJECT_DIR = "$env:USERPROFILE\node_proxy"
$NODE_CMD = "node server.js"
$LOG_FILE = "$PROJECT_DIR\server.log"
$STARTUP_SCRIPT = "$PROJECT_DIR\start-server.ps1"

# 1. 检查项目目录
Write-Host "📦 [1/6] 正在检查项目目录..."

if (Test-Path $PROJECT_DIR) {
    Write-Host "✅ 项目目录已存在，尝试运行服务..."
    
    Set-Location $PROJECT_DIR
    
    # 检查是否已有服务在运行
    $process = Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*server.js*" }
    
    if ($null -eq $process) {
        Write-Host "⏳ 尝试启动 Node 服务..."
        Start-Process -NoNewWindow -FilePath "node" -ArgumentList "server.js" -RedirectStandardOutput $LOG_FILE -RedirectStandardError $LOG_FILE
        Start-Sleep -Seconds 3
        
        $process = Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*server.js*" }
        if ($null -ne $process) {
            Write-Host "✅ 服务启动成功（跳过重新安装）"
            $installNeeded = $false
        } else {
            Write-Host "⚠️ 启动失败，准备重新安装环境..."
            $installNeeded = $true
        }
    } else {
        Write-Host "✔ Node.js 服务已在运行中。"
        $installNeeded = $false
    }
} else {
    Write-Host "📁 项目目录不存在，准备拉取代码并安装..."
    $installNeeded = $true
}

# 2. 如服务失败或目录不存在，执行完整安装流程
if ($installNeeded) {
    Write-Host "🔧 [2/6] 开始环境设置..."
    
    # 检查并安装Node.js
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Host "⚠️ Node.js未安装，请先安装Node.js"
        Write-Host "请访问 https://nodejs.org/ 下载安装"
        exit 1
    }
    
    # 检查并安装Git
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        Write-Host "⚠️ Git未安装，请先安装Git"
        Write-Host "请访问 https://git-scm.com/ 下载安装"
        exit 1
    }
    
    # 获取最新代码
    Remove-Item -Recurse -Force $PROJECT_DIR -ErrorAction SilentlyContinue
    git clone $REPO_URL $PROJECT_DIR
    Set-Location $PROJECT_DIR
    
    # 安装Node.js依赖
    Write-Host "📦 [3/6] 正在安装依赖..."
    npm install
    
    # 启动服务
    Write-Host "🚀 [4/6] 启动 Node 服务..."
    Start-Process -NoNewWindow -FilePath "node" -ArgumentList "server.js" -RedirectStandardOutput $LOG_FILE -RedirectStandardError $LOG_FILE
    Write-Host "✅ 服务已启动，日志文件: $LOG_FILE"
}

# 3. 创建启动脚本
Write-Host "📝 [5/6] 创建启动脚本..."
@"
Set-Location `"$PROJECT_DIR`"
Start-Process -NoNewWindow -FilePath "node" -ArgumentList "server.js" -RedirectStandardOutput `"$LOG_FILE`" -RedirectStandardError `"$LOG_FILE`"
"@ | Out-File -FilePath $STARTUP_SCRIPT -Encoding utf8

# 4. 配置自启动
Write-Host "🧩 [6/6] 配置开机自启动..."

$wscript = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\start-server.vbs"
@"
Set WshShell = CreateObject("WScript.Shell") 
WshShell.Run "powershell.exe -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$STARTUP_SCRIPT`"", 0
"@ | Out-File -FilePath $wscript -Encoding ascii

Write-Host "🎉 所有操作完成！服务状态："
Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*server.js*" } | 
    Select-Object Id, ProcessName, Path | Format-Table -AutoSize

if (-not $?) {
    Write-Host "⚠️ 服务未运行，请手动检查日志：$LOG_FILE"
}
