# Joel 项目开发计划

## 待开发功能

### 🔐 中心化身份校验依赖优化（去除子站对 /api/me 的重依赖）

- **状态**: 规划中
- **优先级**: 高
- **描述**: 优化子站（gd/discover）的身份验证机制，减少对主站 `/api/me` 接口的依赖，提升性能和可用性

#### 背景与问题

当前架构中，子站（`gd.scalarize.org`、`discover.scalarize.org`）需要频繁调用主站的 `/api/me` 接口来：

1. 验证 JWT token 的有效性
2. 获取用户基本信息（userId, email, name, picture）
3. 检查模块权限（gd/discover）

这种设计存在以下问题：

- **性能瓶颈**：每次验证都需要网络请求，增加延迟
- **单点故障**：主站故障会影响所有子站的身份验证
- **不必要的数据库查询**：每次验证都要查询数据库获取用户信息
- **网络开销**：跨域请求增加带宽消耗

#### 技术方案：使用非对称加密 JWT（RS256）

##### 1. 架构设计

**主站（签发者 - Issuer）**：

- 生成一对 RSA 密钥（私钥用于签发，公钥用于验证）
- 登录和 SSO 兑换时，使用私钥签发 JWT（算法 RS256）
- 提供公开的公钥 API，供子站获取

**子站（验证者 - Verifier）**：

- 通过安全途径（公开 API）获取主站的公钥
- 验证 API 收到 JWT 时，使用公钥自行验证签名
- 验证通过后，直接从 JWT Payload 中读取基础信息（userId, email, name）
- 如需详细信息（picture, isAdmin, mustChangePassword）或模块权限，再按需调用 `/api/me` 或其他信息接口

##### 2. JWT Payload 设计

```typescript
interface JWTPayload {
	// 标准字段
	iss: string; // Issuer: "joel.scalarize.org"
	sub: string; // Subject: userId
	aud: string[]; // Audience: ["gd.scalarize.org", "discover.scalarize.org"]
	exp: number; // Expiration time
	iat: number; // Issued at
	jti: string; // JWT ID (用于撤销检查)

	// 自定义字段（基础信息，减少对 /api/me 的依赖）
	userId: string;
	email: string;
	name: string;

	// 可选字段（按需包含，减少 token 大小）
	picture?: string;
	isAdmin?: boolean;

	// 模块权限（可选，用于快速权限检查）
	permissions?: {
		gd?: boolean;
		discover?: boolean;
		favor?: boolean;
	};
}
```

##### 3. 公钥 API 设计

**端点**: `GET /api/auth/public-key` 或 `GET /.well-known/jwks.json`

**响应格式** (JWKS - JSON Web Key Set):

```json
{
	"keys": [
		{
			"kty": "RSA",
			"use": "sig",
			"kid": "key-id-1",
			"alg": "RS256",
			"n": "base64url-encoded-modulus",
			"e": "base64url-encoded-exponent"
		}
	]
}
```

**特性**：

- 支持密钥轮换（多个 key，通过 `kid` 标识）
- 缓存友好（子站可缓存公钥，定期刷新）
- 标准格式（符合 JWKS 规范）

##### 4. 实施步骤

**阶段 1：密钥生成与管理**

- [ ] 在主站生成 RSA 密钥对（2048 位或 4096 位）
- [ ] 将私钥存储在环境变量或 Cloudflare Workers Secrets
- [ ] 实现密钥轮换机制（支持多个密钥，通过 `kid` 标识）
- [ ] 实现公钥 API (`/api/auth/public-key` 或 `/.well-known/jwks.json`)

**阶段 2：JWT 签发改造** ✅ **已完成**

- [x] 创建 `api/src/auth/jwt-rs256.ts`：
  - [x] 实现 `generateJWT` 使用 RS256 算法
  - [x] 使用 RSA 私钥签名
  - [x] 在 Payload 中包含基础信息（userId, username, email）
  - [x] 包含完整模块权限信息（profile, favor, gd, discover, admin）
  - [x] 包含权限版本号（permVersion）
- [x] 更新所有 JWT 签发点：
  - [x] `handlePasswordLogin`
  - [x] `handleGoogleCallback`
  - [x] `handleApiAccess` (access_token 兑换)
  - [x] `handleApiGenerateAccessToken` (SSO)
- [x] 删除旧的 HS256 实现（`api/src/auth/jwt.ts`）
- [x] 更新所有 JWT 验证点使用新的 RS256 实现

**阶段 3：子站验证实现**

- [ ] 子站实现公钥获取逻辑：
  - [ ] 从主站获取公钥（支持缓存，定期刷新）
  - [ ] 处理密钥轮换（通过 `kid` 匹配）
- [ ] 子站实现 JWT 验证逻辑：
  - [ ] 使用公钥验证签名
  - [ ] 验证标准字段（iss, exp, aud）
  - [ ] 从 Payload 提取基础信息
- [ ] 子站按需调用 `/api/me`：
  - [ ] 仅在需要详细信息时调用
  - [ ] 仅在需要权限检查时调用

**阶段 4：迁移与兼容** ✅ **已完成（一次性迁移）**

- [x] 一次性迁移到 RS256（不保留 HS256 兼容）
- [x] 删除旧的 HS256 实现和 JWT_SECRET 依赖
- [x] 更新所有相关代码使用新的 RS256 实现
- [ ] 子站实现 RS256 JWT 验证逻辑（待子站实现）
- [ ] 监控和日志记录（持续进行）

##### 5. 技术细节

**RSA 密钥生成**（Cloudflare Workers 环境）：

```typescript
// 使用 Web Crypto API 生成密钥对
const keyPair = await crypto.subtle.generateKey(
	{
		name: 'RSASSA-PKCS1-v1_5',
		modulusLength: 2048, // 或 4096
		publicExponent: new Uint8Array([1, 0, 1]), // 65537
		hash: 'SHA-256',
	},
	true, // extractable
	['sign', 'verify']
);
```

**JWT 签名**（RS256）：

```typescript
// 使用私钥签名
const signature = await crypto.subtle.sign(
	{
		name: 'RSASSA-PKCS1-v1_5',
	},
	privateKey,
	new TextEncoder().encode(`${header}.${payload}`)
);
```

**JWT 验证**（子站）：

```typescript
// 使用公钥验证签名
const isValid = await crypto.subtle.verify(
	{
		name: 'RSASSA-PKCS1-v1_5',
	},
	publicKey,
	signature,
	new TextEncoder().encode(`${header}.${payload}`)
);
```

##### 6. 优势

- **性能提升**：子站本地验证，无需网络请求
- **可用性提升**：主站故障不影响子站基础身份验证
- **安全性提升**：非对称加密，私钥不泄露
- **可扩展性**：支持密钥轮换，支持多子站
- **标准化**：符合 JWT/JWKS 标准

##### 7. 注意事项与风险

**注意事项**：

- JWT Payload 大小限制（建议不超过 4KB）
- 密钥轮换时的过渡期处理
- 公钥缓存策略（建议缓存 1 小时，定期刷新）
- 子站需要实现 JWT 验证逻辑（可能需要引入 JWT 库）

**风险**：

- 密钥泄露风险（私钥必须严格保密）
- 密钥轮换失败可能导致服务中断
- 子站实现错误可能导致安全漏洞
- 迁移期间的兼容性问题

**缓解措施**：

- 使用 Cloudflare Workers Secrets 存储私钥
- 实现完善的密钥轮换机制和回滚方案
- 子站验证逻辑需要充分测试
- 分阶段迁移，保留旧方案作为后备

##### 8. 参考资源

- [JWT 规范 (RFC 7519)](https://tools.ietf.org/html/rfc7519)
- [JWKS 规范 (RFC 7517)](https://tools.ietf.org/html/rfc7517)
- [Cloudflare Workers Web Crypto API](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/)

---

### 📚 Favor 书签收藏模块

- **状态**: 待开发
- **描述**: 从 NAS 版本迁移到 Cloudflare
- **路由**: `/favor`
- **功能规划**:
  - 基础功能：书签收藏、分类、标签、搜索
  - 🤖 **智能体扩展**：云端信息搜集智能体
    - 主动扫描互联网内容
    - 自动获取和整理信息
    - 智能推荐高价值内容

## 已完成功能

- ✅ Google OAuth 登录
- ✅ 用户 Profile 管理（名称、头像）
- ✅ 图片上传到 R2
- ✅ 管理员用量仪表盘（D1、R2、Workers 统计）
- ✅ D1 数据库定时备份到 R2
- ✅ 交叉登录认证（JWT token 传递）
- ✅ 模块权限管理（RBAC）
- ✅ Discover 模块支持
- ✅ 密码登录（邀请注册制）
- ✅ 多 OAuth 账号关联
- ✅ GD 开发模块（已迁移到子站 gd.scalarize.org）
