# =======================================
# Windows Node Server 卸载脚本
# =======================================

$PROJECT_DIR = "$env:USERPROFILE\node_proxy"
$STARTUP_SCRIPT = "$PROJECT_DIR\start-server.ps1"
$WSCRIPT = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\start-server.vbs"

Write-Host "🛑 [1/3] 停止运行中的服务..."
Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*server.js*" } | Stop-Process -Force

Write-Host "🗑️ [2/3] 删除项目目录..."
Remove-Item -Recurse -Force $PROJECT_DIR -ErrorAction SilentlyContinue

Write-Host "🧹 [3/3] 清理自启动配置..."
Remove-Item $WSCRIPT -ErrorAction SilentlyContinue
Remove-Item $STARTUP_SCRIPT -ErrorAction SilentlyContinue

Write-Host "✅ 卸载完成！"
