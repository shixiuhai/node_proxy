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

## 使用说明

### 本地访问
服务启动后默认监听 `http://localhost:9000`

代理流媒体URL示例：
```bash
# 代理m3u8文件
http://localhost:9000/?target=http://example.com/stream.m3u8

# 代理flv文件
http://localhost:9000/?target=http://example.com/stream.flv

# 代理mp4文件
http://localhost:9000/?target=http://example.com/stream.mp4
```

### 容器访问
如果使用Docker运行，确保映射9000端口：
```bash
docker run -p 9000:9000 your-image-name
```
访问方式与本地相同，将localhost替换为容器IP或主机名

### 状态统计
查看代理服务统计信息：
```bash
http://localhost:9000/stats
```
