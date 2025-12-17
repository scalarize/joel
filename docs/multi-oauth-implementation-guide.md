# 多 OAuth 提供商实现指南

## 快速开始

本文档提供将 Joel 从单一 Google OAuth 迁移到多 OAuth 提供商支持的详细步骤。

## 实现步骤

### 步骤 1：数据库迁移

1. **备份数据库**
   ```bash
   # 导出当前数据库
   wrangler d1 execute joel_db --remote --command "SELECT * FROM users" > backup.json
   ```

2. **执行迁移脚本**
   ```bash
   # 查看迁移脚本
   cat api/migration-multi-oauth.sql
   
   # 执行迁移（注意：SQLite 不支持直接修改主键，需要应用层协助）
   # 建议使用应用层脚本进行迁移
   ```

3. **应用层迁移脚本示例**（Node.js）
   ```typescript
   // migrate-to-multi-oauth.ts
   import { randomUUID } from 'crypto';
   
   async function migrateUsers(db: D1Database) {
     // 1. 获取所有现有用户
     const users = await db.prepare('SELECT * FROM users').all();
     
     // 2. 为每个用户生成新的 UUID
     for (const oldUser of users.results) {
       const newUserId = randomUUID();
       const googleUserId = oldUser.id; // 旧的 id 是 Google user ID
       
       // 3. 创建新用户记录（临时表）
       await db.prepare(`
         INSERT INTO users_new (id, email, name, picture, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
       `).bind(
         newUserId,
         oldUser.email,
         oldUser.name,
         oldUser.picture,
         oldUser.created_at,
         oldUser.updated_at
       ).run();
       
       // 4. 创建 OAuth 账号记录
       await db.prepare(`
         INSERT INTO oauth_accounts 
         (id, user_id, provider, provider_user_id, email, name, picture, created_at, updated_at)
         VALUES (?, ?, 'google', ?, ?, ?, ?, ?, ?)
       `).bind(
         randomUUID(),
         newUserId,
         googleUserId,
         oldUser.email,
         oldUser.name,
         oldUser.picture,
         oldUser.created_at,
         oldUser.updated_at
       ).run();
     }
     
     // 5. 替换旧表（谨慎操作！）
     // await db.prepare('DROP TABLE users').run();
     // await db.prepare('ALTER TABLE users_new RENAME TO users').run();
   }
   ```

### 步骤 2：更新数据库 Schema

1. **更新 `api/src/db/schema.ts`**
   - 参考 `api/src/db/multi-oauth-schema.ts.example`
   - 实现 `findOrCreateUserByEmail()` 函数
   - 实现 `findOrCreateOAuthAccount()` 函数
   - 更新 `User` 接口（id 改为 UUID）

2. **更新 `api/schema.sql`**
   - 使用新的表结构（包含 `oauth_accounts` 表）

### 步骤 3：更新 OAuth Callback 处理

更新 `api/src/index.ts` 中的 `handleGoogleCallback` 函数：

```typescript
async function handleGoogleCallback(request: Request, env: Env): Promise<Response> {
	// ... 前面的验证逻辑保持不变 ...

	try {
		// 交换授权码获取访问令牌
		const tokenResponse = await exchangeCodeForToken(
			code, 
			env.GOOGLE_CLIENT_ID, 
			env.GOOGLE_CLIENT_SECRET, 
			redirectUri
		);

		// 获取用户信息
		const googleUser = await getUserInfo(tokenResponse.access_token);

		// 使用新的多 OAuth 函数
		const { user, oauthAccount, isNewUser } = await findOrCreateOAuthAccount(
			env.DB,
			'google',
			{
				provider_user_id: googleUser.id,
				email: googleUser.email,
				name: googleUser.name,
				picture: googleUser.picture,
				access_token: tokenResponse.access_token,
				refresh_token: tokenResponse.refresh_token,
				token_expires_at: tokenResponse.expires_in 
					? new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString()
					: undefined,
			}
		);

		// 创建会话（使用新的 user.id，UUID）
		const isProduction = request.url.startsWith('https://');
		const sessionCookie = setSessionCookie(
			{
				userId: user.id,  // 现在是 UUID，不再是 Google user ID
				email: user.email,
				name: user.name,
			},
			isProduction
		);

		// ... 后续重定向逻辑保持不变 ...
	}
}
```

### 步骤 4：添加新的 OAuth 提供商（示例：GitHub）

1. **创建 GitHub OAuth 模块**
   ```typescript
   // api/src/auth/github.ts
   export interface GitHubUserInfo {
     id: number;
     login: string;
     email: string;
     name: string;
     avatar_url: string;
   }
   
   export function generateGitHubAuthUrl(
     clientId: string,
     redirectUri: string,
     state: string
   ): string {
     const params = new URLSearchParams({
       client_id: clientId,
       redirect_uri: redirectUri,
       state: state,
       scope: 'user:email',
     });
     return `https://github.com/login/oauth/authorize?${params}`;
   }
   
   export async function exchangeGitHubCodeForToken(
     code: string,
     clientId: string,
     clientSecret: string,
     redirectUri: string
   ): Promise<{ access_token: string }> {
     const response = await fetch('https://github.com/login/oauth/access_token', {
       method: 'POST',
       headers: {
         'Accept': 'application/json',
         'Content-Type': 'application/json',
       },
       body: JSON.stringify({
         client_id: clientId,
         client_secret: clientSecret,
         code,
         redirect_uri: redirectUri,
       }),
     });
     
     if (!response.ok) {
       throw new Error('Failed to exchange GitHub code for token');
     }
     
     return await response.json();
   }
   
   export async function getGitHubUserInfo(
     accessToken: string
   ): Promise<GitHubUserInfo> {
     const response = await fetch('https://api.github.com/user', {
       headers: {
         'Authorization': `token ${accessToken}`,
         'Accept': 'application/vnd.github.v3+json',
       },
     });
     
     if (!response.ok) {
       throw new Error('Failed to get GitHub user info');
     }
     
     return await response.json();
   }
   ```

2. **添加 GitHub OAuth 路由**
   ```typescript
   // 在 api/src/index.ts 中添加
   if (path === '/api/auth/github' && request.method === 'GET') {
     return handleGitHubAuth(request, env);
   }
   
   if (path === '/api/auth/github/callback' && request.method === 'GET') {
     return handleGitHubCallback(request, env);
   }
   ```

3. **实现 GitHub OAuth 处理函数**
   ```typescript
   async function handleGitHubAuth(request: Request, env: Env): Promise<Response> {
     // 类似 handleGoogleAuth，但使用 GitHub OAuth
   }
   
   async function handleGitHubCallback(request: Request, env: Env): Promise<Response> {
     // 类似 handleGoogleCallback，但：
     // 1. 使用 GitHub OAuth 函数
     // 2. 调用 findOrCreateOAuthAccount(env.DB, 'github', {...})
   }
   ```

### 步骤 5：更新前端

1. **添加多个登录选项**
   ```tsx
   // web/src/App.tsx
   function LoginPrompt({ onLogin }: { onLogin: (provider: string) => void }) {
     return (
       <div className="login-prompt">
         <div className="login-card">
           <h2>欢迎使用 Joel</h2>
           <p>请选择登录方式</p>
           <div className="oauth-buttons">
             <button onClick={() => onLogin('google')} className="oauth-btn google">
               使用 Google 登录
             </button>
             <button onClick={() => onLogin('github')} className="oauth-btn github">
               使用 GitHub 登录
             </button>
           </div>
         </div>
       </div>
     );
   }
   ```

2. **更新登录处理**
   ```typescript
   const handleLogin = (provider: string) => {
     window.location.href = `/api/auth/${provider}`;
   };
   ```

### 步骤 6：测试

1. **测试场景 1：新用户首次登录**
   - 使用 Google 登录 → 应该创建新用户和 OAuth 账号

2. **测试场景 2：同一用户用不同 OAuth 登录**
   - 使用 Google 登录（email: user@example.com）
   - 登出
   - 使用 GitHub 登录（相同 email: user@example.com）
   - 应该关联到同一个用户

3. **测试场景 3：再次使用已关联的 OAuth 登录**
   - 使用 Google 登录
   - 登出
   - 再次使用 Google 登录
   - 应该更新 token，但用户 ID 不变

## 注意事项

1. **向后兼容**：确保现有用户迁移后仍可正常登录
2. **Session 兼容**：如果 Session 中存储的是旧的 Google user ID，需要处理兼容性
3. **Token 加密**：OAuth token 应该加密存储（可以使用 Cloudflare Workers 的加密 API）
4. **邮箱验证**：优先使用已验证的邮箱进行用户关联

## 常见问题

### Q: 如果用户在不同 OAuth 提供商使用不同邮箱怎么办？
A: 系统会创建两个独立的用户。未来可以实现手动关联功能，允许用户手动将多个 OAuth 账号关联到同一个账户。

### Q: 如何确保数据迁移的安全性？
A: 
1. 先备份数据库
2. 在测试环境验证迁移脚本
3. 分批次迁移（如果用户量大）
4. 验证数据完整性后再删除旧表

### Q: Session 中存储的是旧的 Google user ID，如何处理？
A: 可以在 Session 验证时检查：
- 如果是旧的格式（不是 UUID），查找对应的 OAuth 账号，获取新的 user.id
- 更新 Session 为新的 user.id

## 下一步

- [ ] 实现 GitHub OAuth 支持
- [ ] 实现 Microsoft OAuth 支持
- [ ] 添加用户设置页面，显示关联的 OAuth 账号
- [ ] 实现 OAuth 账号解绑功能
- [ ] 实现 Token 自动刷新机制

