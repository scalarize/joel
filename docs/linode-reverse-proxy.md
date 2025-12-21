# Linode 反向代理架构与运维文档

本文档记录在 Linode 节点上搭建的 nginx 反向代理架构，用于将 `*.scalarize.cn` 域名代理到 Cloudflare Workers 服务。

## 架构概述

### 整体架构

```
用户请求
  ↓
Aliyun DNS (xx.scalarize.cn → Linode IP)
  ↓
Linode 节点 (nginx 反向代理)
  ↓
Cloudflare Workers (xx.scalarize.org)
```

### 代理域名映射

| 反向代理域名 | 目标域名 | 用途 |
|------------|---------|------|
| `joel.scalarize.cn` | `joel.scalarize.org` | Joel 前端应用 |
| `api.joel.scalarize.cn` | `api.joel.scalarize.org` | Joel API 服务 |
| `gd.scalarize.cn` | `gd.scalarize.org` | GD 应用 |
| `bwdl.fun` | `bwdl.org` | BWDL 应用 |

## 一、Linode 节点配置

### 1.1 服务器环境要求

- **操作系统**: Ubuntu/Debian
- **软件**: nginx, certbot
- **端口**: 80, 443 需要开放

### 1.2 安装 nginx

```bash
# 更新系统包
sudo apt update
sudo apt upgrade -y

# 安装 nginx
sudo apt install nginx -y

# 启动并设置开机自启
sudo systemctl start nginx
sudo systemctl enable nginx

# 验证安装
sudo nginx -v
```

### 1.3 安装 Certbot

```bash
# 安装 certbot 和 nginx 插件
sudo apt install certbot python3-certbot-nginx -y

# 验证安装
certbot --version
```

## 二、Nginx 配置

### 2.1 配置文件位置

主配置文件位于：`/etc/nginx/sites-available/scalarize-proxy`

### 2.2 配置说明

每个代理域名包含以下配置：

1. **HTTPS 服务器块** (443 端口)
   - SSL 证书配置（由 Certbot 管理）
   - 反向代理配置
   - 必要的 HTTP 头部传递

2. **HTTP 服务器块** (80 端口)
   - HTTP 到 HTTPS 的重定向
   - 由 Certbot 自动管理

### 2.3 关键配置项说明

#### 反向代理头部设置

```nginx
proxy_set_header Host api.joel.scalarize.org;  # 目标服务器的主机名
proxy_set_header X-Forwarded-Host api.joel.scalarize.cn;  # 客户端访问的域名
proxy_set_header X-Real-IP $remote_addr;  # 客户端真实 IP
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;  # 代理链中的 IP
proxy_set_header X-Forwarded-Proto $scheme;  # 协议（http/https）
proxy_set_header Upgrade $http_upgrade;  # WebSocket 支持
proxy_set_header Connection "upgrade";  # WebSocket 支持
```

#### 性能优化设置

```nginx
proxy_buffering off;  # 关闭缓冲，实时传输
proxy_read_timeout 300s;  # 读取超时 300 秒
```

#### SSL 配置

```nginx
proxy_ssl_protocols TLSv1.2 TLSv1.3;  # 支持的 TLS 版本
proxy_ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-CHACHA20-POLY1305;  # 加密套件
proxy_ssl_server_name on;  # 启用 SNI
```

### 2.4 部署配置

```bash
# 1. 创建配置文件
sudo nano /etc/nginx/sites-available/scalarize-proxy

# 2. 将配置文件内容复制到文件中（参考 docs/scalarize-proxy）

# 3. 创建符号链接启用配置
sudo ln -s /etc/nginx/sites-available/scalarize-proxy /etc/nginx/sites-enabled/

# 4. 测试配置
sudo nginx -t

# 5. 如果测试通过，重载 nginx
sudo systemctl reload nginx
```

## 三、SSL 证书管理

### 3.1 申请证书

在申请证书之前，确保：

1. **DNS 解析已配置**：域名已解析到 Linode 节点 IP
2. **防火墙开放**：80 和 443 端口已开放
3. **Nginx 配置已创建**：至少包含基本的 server 块

#### 申请单个域名证书

```bash
# 申请证书（Certbot 会自动修改 nginx 配置）
sudo certbot --nginx -d joel.scalarize.cn

# 申请多个域名证书
sudo certbot --nginx -d api.joel.scalarize.cn
```

#### 批量申请证书

```bash
# 一次性申请所有域名
sudo certbot --nginx \
  -d joel.scalarize.cn \
  -d api.joel.scalarize.cn \
  -d gd.scalarize.cn \
  -d bwdl.fun
```

### 3.2 证书自动续期

Let's Encrypt 证书有效期为 90 天，需要定期续期。

#### 检查续期状态

```bash
# 查看证书到期时间
sudo certbot certificates

# 测试续期（不实际续期）
sudo certbot renew --dry-run
```

#### 设置自动续期

Certbot 会自动创建 systemd timer，但需要确保服务已启用：

```bash
# 检查 certbot timer 状态
sudo systemctl status certbot.timer

# 启用 certbot timer（如果未启用）
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer

# 查看下次执行时间
sudo systemctl list-timers certbot.timer
```

#### 手动续期

```bash
# 手动续期所有证书
sudo certbot renew

# 续期后重载 nginx（certbot 会自动执行，但可以手动确认）
sudo systemctl reload nginx
```

### 3.3 证书文件位置

证书文件存储在 `/etc/letsencrypt/live/<域名>/` 目录下：

- `fullchain.pem`: 完整证书链
- `privkey.pem`: 私钥
- `cert.pem`: 证书
- `chain.pem`: 中间证书

## 四、Aliyun DNS 配置

### 4.1 DNS 解析配置

在 Aliyun DNS 控制台中，为每个域名添加 A 记录：

| 主机记录 | 记录类型 | 记录值 | TTL |
|---------|---------|--------|-----|
| `joel` | A | Linode 节点 IP | 600 |
| `api.joel` | A | Linode 节点 IP | 600 |
| `gd` | A | Linode 节点 IP | 600 |
| `@` (bwdl.fun) | A | Linode 节点 IP | 600 |

### 4.2 配置步骤

1. 登录 [Aliyun DNS 控制台](https://dns.console.aliyun.com/)
2. 选择对应的域名（`scalarize.cn` 或 `bwdl.fun`）
3. 点击「添加记录」
4. 填写记录信息：
   - **主机记录**: 子域名（如 `joel`、`api.joel`）
   - **记录类型**: A
   - **记录值**: Linode 节点的公网 IP
   - **TTL**: 600 秒（10 分钟）
5. 保存记录

### 4.3 DNS 解析验证

```bash
# 检查 DNS 解析是否正确
dig joel.scalarize.cn
dig api.joel.scalarize.cn
dig gd.scalarize.cn
dig bwdl.fun

# 或使用 nslookup
nslookup joel.scalarize.cn
```

## 五、Cloudflare Workers 配置

### 5.1 CORS 支持

Cloudflare Workers 需要支持来自 `*.scalarize.cn` 域名的请求。已在 `api/src/index.ts` 中实现 CORS 支持：

```typescript
// 允许 scalarize.cn 的所有子域名
if (origin.endsWith('.scalarize.cn') || origin === 'https://scalarize.cn' || origin === 'http://scalarize.cn') {
    allowedOrigin = origin;
    console.log(`[CORS] 允许 scalarize.cn 域名: ${origin}`);
}
```

### 5.2 域名路由配置

Cloudflare Workers 通过自定义域名路由到 Worker：

1. 在 Cloudflare Dashboard 中，进入 **Workers & Pages** > **joel-api**
2. 进入 **Triggers** > **Custom Domains**
3. 添加自定义域名：
   - `api.joel.scalarize.org`（目标域名，非反向代理域名）

**注意**: Workers 配置的是目标域名（`*.scalarize.org`），而不是反向代理域名（`*.scalarize.cn`）。反向代理会将请求转发到目标域名。

### 5.3 验证配置

```bash
# 测试 API 是否可访问
curl https://api.joel.scalarize.cn/health

# 测试 CORS 头部
curl -H "Origin: https://joel.scalarize.cn" \
     -H "Access-Control-Request-Method: GET" \
     -X OPTIONS \
     https://api.joel.scalarize.cn/health \
     -v
```

## 六、运维操作

### 6.1 查看 Nginx 日志

```bash
# 访问日志
sudo tail -f /var/log/nginx/access.log

# 错误日志
sudo tail -f /var/log/nginx/error.log

# 查看特定域名的日志（如果配置了独立日志）
sudo tail -f /var/log/nginx/joel.scalarize.cn.access.log
```

### 6.2 重启 Nginx

```bash
# 测试配置
sudo nginx -t

# 重载配置（不中断服务）
sudo systemctl reload nginx

# 重启服务（会短暂中断）
sudo systemctl restart nginx
```

### 6.3 检查服务状态

```bash
# 检查 nginx 状态
sudo systemctl status nginx

# 检查 certbot timer 状态
sudo systemctl status certbot.timer

# 检查端口监听
sudo netstat -tlnp | grep -E ':(80|443)'
# 或使用 ss
sudo ss -tlnp | grep -E ':(80|443)'
```

### 6.4 添加新域名代理

1. **配置 DNS 解析**（Aliyun DNS）
   - 添加 A 记录指向 Linode IP

2. **添加 Nginx 配置**
   ```bash
   sudo nano /etc/nginx/sites-available/scalarize-proxy
   # 添加新的 server 块
   ```

3. **申请 SSL 证书**
   ```bash
   sudo certbot --nginx -d new-domain.scalarize.cn
   ```

4. **测试并重载**
   ```bash
   sudo nginx -t
   sudo systemctl reload nginx
   ```

5. **验证**
   ```bash
   curl -I https://new-domain.scalarize.cn
   ```

### 6.5 故障排查

#### 问题：证书申请失败

**可能原因**:
- DNS 解析未生效
- 80 端口未开放
- 域名已绑定其他服务

**解决方法**:
```bash
# 检查 DNS 解析
dig new-domain.scalarize.cn

# 检查端口是否开放
sudo ufw status
sudo netstat -tlnp | grep :80

# 检查 nginx 是否监听 80 端口
sudo nginx -t
```

#### 问题：代理返回 502 Bad Gateway

**可能原因**:
- 目标服务器不可达
- SSL 证书验证失败
- 防火墙阻止连接

**解决方法**:
```bash
# 检查目标服务器是否可达
curl -I https://api.joel.scalarize.org

# 检查 nginx 错误日志
sudo tail -f /var/log/nginx/error.log

# 测试 SSL 连接
openssl s_client -connect api.joel.scalarize.org:443
```

#### 问题：CORS 错误

**可能原因**:
- Cloudflare Workers 未正确配置 CORS
- 请求头未正确传递

**解决方法**:
1. 检查 Cloudflare Workers 日志
2. 验证 CORS 配置代码
3. 检查 nginx 是否正确传递 Origin 头

## 七、安全建议

### 7.1 防火墙配置

```bash
# 使用 ufw 配置防火墙
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

### 7.2 Nginx 安全头

建议在 nginx 配置中添加安全头：

```nginx
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
```

### 7.3 定期更新

```bash
# 定期更新系统包
sudo apt update && sudo apt upgrade -y

# 检查证书续期
sudo certbot renew --dry-run
```

## 八、监控与告警

### 8.1 证书到期监控

建议设置监控，在证书到期前 30 天发送告警：

```bash
# 创建检查脚本
sudo nano /usr/local/bin/check-cert-expiry.sh
```

脚本内容：
```bash
#!/bin/bash
# 检查证书到期时间
CERT_EXPIRY=$(echo | openssl s_client -servername joel.scalarize.cn -connect joel.scalarize.cn:443 2>/dev/null | openssl x509 -noout -enddate | cut -d= -f2)
EXPIRY_EPOCH=$(date -d "$CERT_EXPIRY" +%s)
CURRENT_EPOCH=$(date +%s)
DAYS_UNTIL_EXPIRY=$(( ($EXPIRY_EPOCH - $CURRENT_EPOCH) / 86400 ))

if [ $DAYS_UNTIL_EXPIRY -lt 30 ]; then
    echo "警告: 证书将在 $DAYS_UNTIL_EXPIRY 天后到期"
    # 这里可以添加发送告警的逻辑
fi
```

### 8.2 Nginx 状态监控

```bash
# 检查 nginx 进程
ps aux | grep nginx

# 检查 nginx 连接数
sudo netstat -an | grep :443 | wc -l
```

## 九、配置文件备份

### 9.1 备份 Nginx 配置

```bash
# 备份配置文件
sudo cp /etc/nginx/sites-available/scalarize-proxy /etc/nginx/sites-available/scalarize-proxy.backup.$(date +%Y%m%d)

# 备份证书（注意：证书文件较大，建议只备份配置）
sudo tar -czf /root/letsencrypt-backup-$(date +%Y%m%d).tar.gz /etc/letsencrypt/
```

### 9.2 版本控制

建议将 nginx 配置文件纳入版本控制（如 Git），但**不要**提交证书私钥。

当前配置文件已保存在：`docs/scalarize-proxy`

## 十、总结

### 10.1 架构优势

1. **统一入口**: 通过 Linode 节点统一管理多个域名的反向代理
2. **SSL 终止**: 在 Linode 节点处理 SSL，减轻 Cloudflare Workers 负担
3. **灵活配置**: 可以针对不同域名进行个性化配置
4. **成本优化**: 使用 Let's Encrypt 免费证书

### 10.2 关键文件位置

- Nginx 配置: `/etc/nginx/sites-available/scalarize-proxy`
- Nginx 日志: `/var/log/nginx/`
- SSL 证书: `/etc/letsencrypt/live/<域名>/`
- Certbot 配置: `/etc/letsencrypt/`

### 10.3 定期维护任务

- [ ] 每月检查证书续期状态
- [ ] 每季度更新系统包
- [ ] 定期检查 nginx 日志
- [ ] 监控服务器资源使用情况

---

**文档版本**: 1.0  
**最后更新**: 2025-01-XX  
**维护者**: 系统管理员

