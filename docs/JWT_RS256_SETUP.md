# JWT RS256 配置指南

## 概述

Joel 项目已迁移到 RS256 非对称加密 JWT，子站可以从 JWT Payload 中直接获取用户信息和权限，减少对主站 `/api/me` 接口的依赖。

## 主站配置

### 1. 添加 RSA 私钥到 Workers Secrets

```bash
cd api
wrangler secret put JWT_RSA_PRIVATE_KEY
# 然后粘贴 .secrets/jwt_private_key.pem 的完整内容（包括 BEGIN 和 END 行）
```

### 2. 配置权限版本号

在 Cloudflare Dashboard 或 `wrangler.toml` 中配置：

```bash
# 方法 1：使用 wrangler.toml（不推荐，会暴露在代码中）
# 在 wrangler.toml 中添加：
[vars]
PERM_VERSION = "1"

# 方法 2：使用 Cloudflare Dashboard（推荐）
# Workers & Pages > joel-api > Settings > Variables
# 添加变量：PERM_VERSION，值为 "1"
```

**注意**：
- 初始值设置为 `"1"`
- 权限变更后需要手动递增此值并重新部署
- 子站需要同步更新 `MIN_PERM_VERSION` 环境变量

## 子站配置

### 1. 配置最低权限版本号

在子站的环境变量中配置：

```bash
# 方法 1：使用 wrangler.toml
[vars]
MIN_PERM_VERSION = "1"
JWT_PUBLIC_KEY_URL = "https://joel.scalarize.org/.well-known/jwks.json"

# 方法 2：使用 Cloudflare Dashboard
# Workers & Pages > [子站名称] > Settings > Variables
# 添加变量：
# - MIN_PERM_VERSION: "1"
# - JWT_PUBLIC_KEY_URL: "https://joel.scalarize.org/.well-known/jwks.json"
```

**注意**：
- `MIN_PERM_VERSION` 必须设置，否则旧 JWT 可能失效
- 当主站权限变更并更新 `PERM_VERSION` 后，子站需要同步更新 `MIN_PERM_VERSION`

## 权限版本号升级流程

### 场景：主站权限变更（授予/撤销权限）

1. **主站操作**：
   - 通过 API 授予/撤销权限
   - 查看日志，获取建议的新 `PERM_VERSION` 值
   - 在 Cloudflare Dashboard 中更新 `PERM_VERSION` 环境变量
   - 重新部署主站

2. **通知子站**：
   - 通过文档/通知告知子站新的 `PERM_VERSION` 值
   - 子站更新 `MIN_PERM_VERSION` 环境变量
   - 子站重新部署

3. **效果**：
   - 旧 JWT（permVersion < MIN_PERM_VERSION）自动失效
   - 用户需要重新登录获取新 JWT

## 公钥 API

主站提供公钥 API，子站可以获取公钥用于验证 JWT：

**端点**: `GET /.well-known/jwks.json`

**响应格式**:
```json
{
  "keys": [
    {
      "kty": "RSA",
      "use": "sig",
      "kid": "key-1",
      "alg": "RS256",
      "n": "...",
      "e": "AQAB"
    }
  ]
}
```

**缓存策略**: 响应包含 `Cache-Control: public, max-age=3600`，建议子站缓存 1 小时。

## JWT Payload 结构

```typescript
interface JWTPayload {
  // 标准字段
  iss: string;        // "joel.scalarize.org"
  sub: string;        // userId
  aud: string[];      // ["gd.scalarize.org", "discover.scalarize.org"]
  exp: number;        // 过期时间（Unix timestamp）
  iat: number;        // 签发时间（Unix timestamp）
  
  // 用户信息
  userId: string;     // 用户 ID
  username: string;   // 用户名
  email: string;      // 邮箱
  
  // 权限信息
  permissions: {
    profile: boolean;   // 所有人可访问
    favor: boolean;     // 需要授权或管理员
    gd: boolean;        // 需要授权或管理员
    discover: boolean;  // 需要授权或管理员
    admin: boolean;     // 仅管理员
  };
  
  // 权限版本号
  permVersion: number; // 权限版本号
}
```

## 验证清单

- [ ] 主站已添加 `JWT_RSA_PRIVATE_KEY` Secret
- [ ] 主站已配置 `PERM_VERSION` 环境变量（初始值 "1"）
- [ ] 主站公钥 API `/.well-known/jwks.json` 可访问
- [ ] 子站已配置 `MIN_PERM_VERSION` 环境变量
- [ ] 子站已配置 `JWT_PUBLIC_KEY_URL` 环境变量
- [ ] 子站已实现 JWT 验证逻辑（RS256）
- [ ] 测试：主站登录后，子站可以验证 JWT 并获取用户信息

## 故障排查

### 问题 1：JWT 验证失败

- 检查主站 `JWT_RSA_PRIVATE_KEY` 是否正确配置
- 检查子站 `JWT_PUBLIC_KEY_URL` 是否正确
- 检查子站公钥缓存是否过期

### 问题 2：权限版本号过低

- 检查主站 `PERM_VERSION` 是否已更新
- 检查子站 `MIN_PERM_VERSION` 是否已同步更新
- 检查用户是否需要重新登录

### 问题 3：权限信息不正确

- 检查 JWT Payload 中的 `permissions` 字段
- 检查用户是否在权限变更后重新登录
- 检查数据库中的权限配置

## 参考资源

- [JWT 规范 (RFC 7519)](https://tools.ietf.org/html/rfc7519)
- [JWKS 规范 (RFC 7517)](https://tools.ietf.org/html/rfc7517)
- [Cloudflare Workers Web Crypto API](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/)

