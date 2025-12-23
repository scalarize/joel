# Cloudflare 环境变量配置指南

本文档说明 joel 项目需要在 Cloudflare Workers 中配置的环境变量。

## 必需的环境变量（Secrets）

以下环境变量**必须**配置，使用 Cloudflare Secrets 存储（敏感信息）：

### 1. JWT_RSA_PRIVATE_KEY ⚠️ **必须配置**

RSA 私钥（PEM 格式），用于 RS256 JWT token 的签名。**生产环境必须配置。**

**生成方法：**
```bash
# 在项目根目录执行
cd .secrets
openssl genrsa -out jwt_private_key.pem 2048
```

**配置命令：**
```bash
cd api
cat ../.secrets/jwt_private_key.pem | wrangler secret put JWT_RSA_PRIVATE_KEY
```

**注意**：
- 私钥必须包含 `-----BEGIN PRIVATE KEY-----` 和 `-----END PRIVATE KEY-----` 标记
- 可以使用管道或重定向方式传递多行内容

### 2. GOOGLE_CLIENT_ID

Google OAuth 客户端 ID（应该已经配置）

**配置命令：**
```bash
cd api
wrangler secret put GOOGLE_CLIENT_ID
```

### 3. GOOGLE_CLIENT_SECRET

Google OAuth 客户端密钥（应该已经配置）

**配置命令：**
```bash
cd api
wrangler secret put GOOGLE_CLIENT_SECRET
```

## 可选的环境变量（Vars）

以下环境变量可以配置，用于优化功能：

### 4. BASE_URL（可选）

用于构建 OAuth 回调 URL。如果不配置，会自动从请求 URL 推断。

**示例值：**
```
https://joel.scalarize.org
```

**配置方法：**
- 在 Cloudflare Dashboard 中配置：Workers & Pages > joel-api > Settings > Variables
- 或使用 wrangler.toml（不推荐，因为会暴露在代码中）

### 5. FRONTEND_URL（可选）

前端 Pages 地址，用于登录后重定向。如果不配置，会使用默认值。

**示例值：**
```
https://joel.scalarize.org
```

**配置方法：**
- 在 Cloudflare Dashboard 中配置：Workers & Pages > joel-api > Settings > Variables

### 6. R2_PUBLIC_URL（可选）

R2 存储桶的公开访问域名，用于图片上传功能。如果不使用图片上传功能，可以不配置。

**示例值：**
```
https://assets.joel.scalarize.org
```

**配置方法：**
- 在 Cloudflare Dashboard 中配置：Workers & Pages > joel-api > Settings > Variables

### 7. CF_API_TOKEN（可选）

Cloudflare API Token，用于管理员功能获取 Analytics 数据。如果不使用管理员功能，可以不配置。

**权限要求：**
- Account Analytics Read

**配置命令：**
```bash
cd api
wrangler secret put CF_API_TOKEN
```

### 8. CF_ACCOUNT_ID（可选）

Cloudflare 账户 ID，用于管理员功能。可以在 Cloudflare Dashboard 右侧边栏找到。

**配置方法：**
- 在 Cloudflare Dashboard 中配置：Workers & Pages > joel-api > Settings > Variables

### 9. PERM_VERSION（必须配置）

权限版本号，用于控制 JWT 权限信息的有效性。权限变更时需要手动递增此值并重新部署。

**初始值：**
```
1
```

**配置方法：**
- 在 `wrangler.jsonc` 中配置（推荐）：
  ```jsonc
  "vars": {
    "PERM_VERSION": "1"
  }
  ```
- 或在 Cloudflare Dashboard 中配置：Workers & Pages > joel-api > Settings > Variables

**注意**：
- 权限变更后需要手动递增此值
- 子站需要同步更新 `MIN_PERM_VERSION` 环境变量

## 配置步骤

### 方法1：使用 Wrangler CLI（推荐）

```bash
cd ../joel/api

# 配置必需 Secrets
cat ../.secrets/jwt_private_key.pem | wrangler secret put JWT_RSA_PRIVATE_KEY
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET

# 可选：配置其他 Secrets
wrangler secret put CF_API_TOKEN
```

### 方法2：使用 Cloudflare Dashboard

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 **Workers & Pages** > **joel-api**
3. 点击 **Settings** > **Variables**
4. 在 **Environment Variables** 部分：
   - 添加普通变量（Vars）：点击 **Add variable**，输入变量名和值
   - 添加敏感变量（Secrets）：点击 **Add secret**，输入变量名和值（值会被隐藏）

## 验证配置

部署后，检查 Worker 日志，确认环境变量是否正确加载：

```bash
cd ../joel/api
wrangler tail
```

如果看到 `JWT_RSA_PRIVATE_KEY 环境变量未设置` 错误，说明 RSA 私钥未正确配置。

## 注意事项

1. **JWT_RSA_PRIVATE_KEY 安全性**：
   - 私钥必须严格保密，仅存储在 Workers Secrets 中
   - 不要将私钥提交到代码仓库
   - 私钥文件应存储在 `.secrets/` 目录（已添加到 .gitignore）

2. **环境变量优先级**：
   - Secrets（敏感信息）优先于 Vars
   - 生产环境和预览环境可以有不同的配置

3. **更新环境变量**：
   - Secrets：使用 `wrangler secret put <NAME>` 更新
   - Vars：在 Dashboard 中更新，或修改 `wrangler.jsonc` 后重新部署

4. **gd 项目**：
   - gd 项目**不需要**配置任何环境变量
   - gd 项目只是调用 joel 的 API，不涉及敏感信息

