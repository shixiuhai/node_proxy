# Node Proxy 流媒体代理服务

## 项目简介
一个基于Node.js的代理服务，支持m3u8、flv、mp4等流媒体格式的代理和转发。

> **验证状态**
> ✅ Termux - 已验证
> ⚠️ Linux - 待验证
> ⚠️ Windows - 待验证

## 一键安装

### Termux 环境
```bash
pkg update && pkg install -y curl && curl -sL https://gitee.com/shixiuhai/node_proxy/raw/main/setup-termux-server.sh | bash
```

### Windows 环境 (管理员权限运行)
```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force; Invoke-WebRequest -Uri "https://gitee.com/shixiuhai/node_proxy/raw/main/setup-windows.ps1" -OutFile "setup.ps1"; .\setup.ps1
```

### Linux 环境
```bash
curl -sL https://gitee.com/shixiuhai/node_proxy/raw/main/setup-linux.sh | sudo bash
```

## 一键卸载

### Termux 环境
```bash
curl -sL https://gitee.com/shixiuhai/node_proxy/raw/main/remove-termux-server.sh | bash
```

### Windows 环境 (管理员权限运行)
```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force; Invoke-WebRequest -Uri "https://gitee.com/shixiuhai/node_proxy/raw/main/remove-windows.ps1" -OutFile "remove.ps1"; .\remove.ps1
```

### Linux 环境
```bash
curl -sL https://gitee.com/shixiuhai/node_proxy/raw/main/remove-linux.sh | sudo bash
```

## 文件说明
| 文件名 | 用途 |
|--------|------|
| setup-*.sh/ps1 | 各平台安装脚本 |
| remove-*.sh/ps1 | 各平台卸载脚本 |

## 注意事项
1. Windows执行需要管理员权限
2. Linux执行需要sudo权限
3. 安装完成后服务会自动启动
4. 日志文件默认位于项目目录下的server.log
