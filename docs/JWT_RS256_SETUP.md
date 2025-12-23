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

## 用户头像 API

主站提供用户头像 API，子站可以通过用户 ID 获取用户头像：

**端点**: `GET /user/avatar/<user_id>`

**特性**：
- 无需身份校验（但受 CORS 限制，只允许主站和子站域名访问）
- 如果用户设置了头像，返回实际头像图片
- 如果用户未设置头像，返回 SVG 默认头像（显示用户名首字母）
- 支持 R2 存储的头像和外部 URL 头像

**使用示例**：

```html
<!-- HTML 中使用 -->
<img src="https://api.joel.scalarize.org/user/avatar/109385921962088699279" alt="User Avatar">
```

```typescript
// TypeScript/JavaScript 中使用
const avatarUrl = `https://api.joel.scalarize.org/user/avatar/${payload.userId}`;

// 在 React/Vue 等框架中
<img src={avatarUrl} alt={payload.username} />
```

**响应格式**：
- 成功：返回图片内容（Content-Type: `image/jpeg`, `image/png`, `image/svg+xml` 等）
- 用户不存在：返回 404
- 缓存策略：
  - R2 存储的头像：使用 R2 的缓存设置（通常 1 年）
  - 外部 URL 头像：缓存 1 小时
  - 默认头像（SVG）：缓存 1 天

**注意**：
- 头像 URL 可以直接在 `<img>` 标签中使用，无需额外的认证
- 浏览器会自动处理缓存
- 如果用户更新了头像，新的头像会立即生效（R2 存储）或根据缓存策略更新

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
  
  // 注意：picture（头像）字段不在 JWT Payload 中
  // 子站应使用 /user/avatar/<user_id> API 获取用户头像
  
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

## 子站实现示例

### 1. JWT Payload 类型定义

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
  
  // 注意：picture（头像）字段不在 JWT Payload 中
  // 子站应使用 /user/avatar/<user_id> API 获取用户头像
  
  // 权限信息
  permissions: {
    profile: boolean;
    favor: boolean;
    gd: boolean;
    discover: boolean;
    admin: boolean;
  };
  
  // 权限版本号
  permVersion: number;
}
```

### 2. 公钥获取和缓存

```typescript
// 公钥缓存（建议缓存 1 小时）
let cachedPublicKey: CryptoKey | null = null;
let cacheExpiry: number = 0;

async function getPublicKey(env: { JWT_PUBLIC_KEY_URL?: string }): Promise<CryptoKey> {
  const now = Date.now();
  
  // 如果缓存有效，直接返回
  if (cachedPublicKey && now < cacheExpiry) {
    return cachedPublicKey;
  }
  
  // 从主站获取 JWKS
  const jwksUrl = env.JWT_PUBLIC_KEY_URL || 'https://joel.scalarize.org/.well-known/jwks.json';
  const response = await fetch(jwksUrl);
  const jwks = await response.json();
  
  // 获取第一个 key（当前只有一个 key）
  const key = jwks.keys[0];
  
  // 导入公钥
  const publicKey = await crypto.subtle.importKey(
    'jwk',
    {
      kty: key.kty,
      use: key.use,
      kid: key.kid,
      alg: key.alg,
      n: key.n,
      e: key.e,
    },
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['verify']
  );
  
  // 缓存公钥（1 小时）
  cachedPublicKey = publicKey;
  cacheExpiry = now + 60 * 60 * 1000;
  
  return publicKey;
}
```

### 3. Base64URL 解码工具

```typescript
function base64UrlDecode(base64: string): Uint8Array {
  const base64Normalized = base64.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (base64Normalized.length % 4)) % 4);
  const base64Padded = base64Normalized + padding;
  const binaryString = atob(base64Padded);
  return new Uint8Array(binaryString.split('').map((char) => char.charCodeAt(0)));
}
```

### 4. JWT 验证函数

```typescript
async function verifyJWT(
  token: string,
  env: { 
    JWT_PUBLIC_KEY_URL?: string;
    MIN_PERM_VERSION?: string;
  }
): Promise<JWTPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const [encodedHeader, encodedPayload, encodedSignature] = parts;

    // 解析 Header
    const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedHeader)));
    if (header.alg !== 'RS256') {
      return null;
    }

    // 获取公钥并验证签名
    const publicKey = await getPublicKey(env);
    const signatureInput = `${encodedHeader}.${encodedPayload}`;
    const signature = base64UrlDecode(encodedSignature);

    const isValid = await crypto.subtle.verify(
      {
        name: 'RSASSA-PKCS1-v1_5',
      },
      publicKey,
      signature,
      new TextEncoder().encode(signatureInput)
    );

    if (!isValid) {
      return null;
    }

    // 解析 Payload
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedPayload))) as JWTPayload;

    // 检查过期时间
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      return null;
    }

    // 检查签发者
    if (payload.iss !== 'joel.scalarize.org') {
      return null;
    }

    // 检查受众（audience）
    const currentHost = new URL(request.url).hostname;
    if (!payload.aud.includes(currentHost)) {
      return null;
    }

    // 检查权限版本号
    const minPermVersion = Number(env.MIN_PERM_VERSION || '1');
    if (payload.permVersion < minPermVersion) {
      return null; // JWT 权限版本过低，需要重新登录
    }

    return payload;
  } catch (error) {
    console.error('[JWT] 验证失败:', error);
    return null;
  }
}
```

### 5. 使用示例

```typescript
// 从请求中获取 JWT token
function getJWTFromRequest(request: Request): string | null {
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
}

// 在请求处理中使用
async function handleRequest(request: Request, env: Env): Promise<Response> {
  const token = getJWTFromRequest(request);
  
  if (!token) {
    return new Response('Unauthorized', { status: 401 });
  }

  const payload = await verifyJWT(token, env);
  
  if (!payload) {
    return new Response('Unauthorized', { status: 401 });
  }

  // 使用 payload 中的用户信息
  const userId = payload.userId;
  const username = payload.username;
  const email = payload.email;
  const permissions = payload.permissions;

  // 获取用户头像 URL（picture 不在 JWT payload 中）
  const avatarUrl = `https://api.joel.scalarize.org/user/avatar/${userId}`;

  // 检查模块权限
  if (!permissions.gd) {
    return new Response('Forbidden', { status: 403 });
  }

  // 继续处理请求...
  // 可以在响应中包含头像 URL，或在前端直接使用 avatarUrl
}
```

## 验证清单

- [ ] 主站已添加 `JWT_RSA_PRIVATE_KEY` Secret
- [ ] 主站已配置 `PERM_VERSION` 环境变量（初始值 "1"）
- [ ] 主站公钥 API `/.well-known/jwks.json` 可访问
- [ ] 子站已配置 `MIN_PERM_VERSION` 环境变量
- [ ] 子站已配置 `JWT_PUBLIC_KEY_URL` 环境变量
- [ ] 子站已实现 JWT 验证逻辑（RS256）
- [ ] 子站已实现公钥获取和缓存逻辑
- [ ] 子站已实现 `permVersion` 检查
- [ ] 子站已实现用户头像获取（使用 `/user/avatar/<user_id>` API）
- [ ] 测试：主站登录后，子站可以验证 JWT 并获取用户信息
- [ ] 测试：子站可以正确显示用户头像（包括默认头像）

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

### 问题 4：用户头像无法显示

- 检查头像 API URL 是否正确：`https://api.joel.scalarize.org/user/avatar/<user_id>`
- 检查 CORS 设置（只允许 `*.scalarize.org` 和 `*.scalarize.cn` 域名访问）
- 如果用户未设置头像，应该显示默认头像（SVG，显示用户名首字母）
- 如果 R2 存储的头像无法显示，检查 `R2_PUBLIC_URL` 环境变量是否正确配置
- 如果外部 URL 头像无法显示，检查外部 URL 是否可访问

**常见问题**：
- **头像显示为默认头像**：这是正常的，表示用户未设置自定义头像
- **头像加载失败**：检查网络连接和 CORS 设置
- **头像不更新**：检查浏览器缓存，或清除缓存后重试

## 参考资源

- [JWT 规范 (RFC 7519)](https://tools.ietf.org/html/rfc7519)
- [JWKS 规范 (RFC 7517)](https://tools.ietf.org/html/rfc7517)
- [Cloudflare Workers Web Crypto API](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/)

