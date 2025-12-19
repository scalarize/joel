# OAuth 账号关联策略讨论

## 问题背景

在实现多 OAuth 架构时，需要解决如何将同一用户的不同 OAuth 账号（Google、QQ）关联到同一个用户记录。

## 核心决策

**采用手动关联为主的方案**，原因：
1. QQ 邮箱（QQ号@qq.com）与 Google 邮箱（Gmail 等）几乎不可能相同
2. 自动关联通过邮箱匹配基本不可能成功
3. 需要支持用户合并功能（将不同 OAuth 账号合并到同一用户）

## QQ OAuth 邮箱处理策略

### QQ 邮箱自动补全

**策略：** 如果 QQ OAuth 无法获取邮箱，使用 `QQ号@qq.com` 自动补全

**实现逻辑：**
```typescript
function normalizeQQEmail(qqOpenId: string, emailFromAPI: string | null): string {
  // 如果 API 返回了邮箱，直接使用
  if (emailFromAPI) {
    return emailFromAPI;
  }
  
  // 否则使用 QQ 号 + @qq.com 补全
  // 注意：QQ OpenID 是字符串格式的数字，例如 "123456789"
  return `${qqOpenId}@qq.com`;
}
```

**优点：**
- ✅ 确保每个 OAuth 账号都有邮箱（便于数据库设计）
- ✅ 邮箱格式统一，便于识别 QQ 账号
- ✅ 不影响手动关联功能

**注意：**
- QQ 号@qq.com 仅用于标识，不用于自动关联
- 实际关联通过手动操作完成

### 实际场景分析

| 场景 | Google 邮箱 | QQ 邮箱 | 关联方式 |
|------|------------|---------|---------|
| 场景1 | user@gmail.com | 123456789@qq.com | ❌ 自动关联失败 → 手动关联 |
| 场景2 | user@gmail.com | null → 123456789@qq.com | ❌ 自动关联失败 → 手动关联 |
| 场景3 | user@gmail.com | user@gmail.com（相同） | ✅ 自动关联成功（罕见情况） |

**结论：** 由于 QQ 邮箱和 Google 邮箱几乎不可能相同，**自动关联基本不会成功，需要以手动关联为主**。

## 关联策略设计

### 策略：手动关联为主 + 自动关联为辅

**核心思想：**
- **主要方式**：手动关联（用户在设置页面操作）
- **辅助方式**：自动关联（仅当邮箱完全相同时，虽然这种情况很少见）
- **QQ 邮箱补全**：如果 QQ 无法获取邮箱，使用 `QQ号@qq.com` 自动补全

### 自动关联（辅助，罕见情况）

**流程：**
```
用户登录（Google/QQ）
  ↓
获取 OAuth 用户信息（包括 email）
  ↓
检查 email 是否为空？
  ├─ 是 → QQ 邮箱补全（QQ号@qq.com）
  └─ 否 → 查找是否存在相同 email 的用户？
      ├─ 是 → 自动关联到现有用户（罕见）
      └─ 否 → 创建新用户
```

**适用场景：**
- 用户在不同 OAuth 使用**完全相同**的邮箱（罕见）
- 例如：Google 账号是 `user@example.com`，QQ 账号也绑定了 `user@example.com`

### 手动关联（主要方式）

**流程：**
```
用户登录（Google/QQ）
  ↓
创建新用户（如果不存在）
  ↓
用户进入"账号设置"页面
  ↓
查看已关联的 OAuth 账号列表
  ├─ Google: ✅ 已关联（如果通过 Google 登录）
  └─ QQ: ❌ 未关联
  ↓
点击"添加 QQ 账号"或"添加 Google 账号"
  ↓
跳转到对应 OAuth 授权页面
  ↓
授权成功后，关联新 OAuth 账号到当前用户
  ↓
可选：如果检测到该 OAuth 账号已关联到其他用户，提示用户合并
```

**优点：**
- ✅ 不依赖邮箱匹配，适用于所有情况
- ✅ 用户可控，明确知道账号关联
- ✅ 支持用户合并（将不同 OAuth 账号合并到同一用户）
- ✅ 可以关联不同邮箱的账号

**缺点：**
- ❌ 需要用户手动操作
- ❌ 增加用户操作步骤

**适用场景：**
- **主要场景**：QQ 邮箱和 Google 邮箱不同（99% 的情况）
- 用户想要合并多个 OAuth 账号到同一用户

**完整流程：**

#### 登录时流程（自动关联为辅）

```
用户使用 Google 登录
  ↓
获取 Google 用户信息（email: user@gmail.com）
  ↓
查找是否存在相同 email 的用户？
  ├─ 是 → 自动关联 Google 账号到现有用户（罕见）
  └─ 否 → 创建新用户 + Google 账号

用户使用 QQ 登录
  ↓
获取 QQ 用户信息
  ├─ 有 email → 查找是否存在相同 email 的用户？
  │   ├─ 是 → 自动关联 QQ 账号到现有用户（罕见）
  │   └─ 否 → 创建新用户 + QQ 账号
  └─ 无 email → QQ 邮箱补全（QQ号@qq.com）→ 创建新用户 + QQ 账号
```

#### 手动关联流程（主要方式）

```
用户已登录（例如：通过 Google）
  ↓
进入"账号设置"页面
  ↓
查看已关联的 OAuth 账号列表
  ├─ Google: ✅ 已关联
  └─ QQ: ❌ 未关联
  ↓
点击"添加 QQ 账号"
  ↓
跳转到 QQ OAuth 授权
  ↓
授权成功后，检查该 QQ 账号是否已关联到其他用户？
  ├─ 是 → 提示用户合并账号
  │   ├─ 用户确认 → 合并账号（将 QQ 账号关联到当前用户）
  │   └─ 用户取消 → 取消关联
  └─ 否 → 直接关联 QQ 账号到当前用户
```

#### 用户合并流程

```
用户 A：通过 Google 登录（user@gmail.com）
用户 B：通过 QQ 登录（123456789@qq.com）
  ↓
用户 A 在设置页面点击"添加 QQ 账号"
  ↓
授权 QQ 账号（123456789）
  ↓
系统检测到该 QQ 账号已关联到用户 B
  ↓
提示用户 A："检测到该 QQ 账号已关联到其他账号，是否合并？"
  ├─ 用户确认合并
  │   ↓
  │   1. 将 QQ 账号从用户 B 解绑
  │   2. 将 QQ 账号关联到用户 A
  │   3. 可选：合并用户 B 的其他数据到用户 A
  │   4. 删除用户 B（如果用户 B 没有其他 OAuth 账号）
  └─ 用户取消
      ↓
      取消关联，保持现状
```

## 推荐方案：手动关联为主 + 自动关联为辅

### 实施步骤

#### Phase 1：基础架构（登录时自动关联 + QQ 邮箱补全）

1. **QQ 邮箱补全逻辑**
   ```typescript
   function normalizeQQEmail(qqOpenId: string, emailFromAPI: string | null): string {
     // 如果 API 返回了邮箱，直接使用
     if (emailFromAPI && emailFromAPI.trim()) {
       return emailFromAPI.trim();
     }
     
     // 否则使用 QQ 号 + @qq.com 补全
     // QQ OpenID 是字符串格式的数字，例如 "123456789"
     return `${qqOpenId}@qq.com`;
   }
   ```

2. **实现 Email 自动匹配逻辑（辅助）**
   ```typescript
   async function findOrCreateUserByEmail(
     db: D1Database,
     email: string,
     oauthData: OAuthUserData
   ): Promise<{ user: User; isNewUser: boolean; linkedMethod: 'auto' | 'manual' }> {
     // 查找是否存在相同 email 的用户
     const existingUser = await getUserByEmail(db, email);
     if (existingUser) {
       // 检查该 OAuth 账号是否已关联到其他用户
       const existingOAuth = await getOAuthAccountByProvider(
         db,
         oauthData.provider,
         oauthData.provider_user_id
       );
       
       if (existingOAuth && existingOAuth.user_id !== existingUser.id) {
         // OAuth 账号已关联到其他用户，需要手动合并
         // 这里先创建新用户，后续通过手动关联合并
         console.log(`[OAuth] ${oauthData.provider} 账号已关联到其他用户，需要手动合并`);
         return createNewUser(db, oauthData);
       }
       
       // 关联 OAuth 账号到现有用户（自动关联）
       await linkOAuthAccount(db, existingUser.id, oauthData, 'auto');
       return { user: existingUser, isNewUser: false, linkedMethod: 'auto' };
     }
     
     // 创建新用户
     return { ...createNewUser(db, oauthData), linkedMethod: 'manual' };
   }
   ```

3. **OAuth Callback 处理逻辑**
   ```typescript
   async function handleOAuthCallback(
     provider: 'google' | 'qq',
     oauthUserInfo: OAuthUserInfo
   ) {
     let email: string;
     
     if (provider === 'qq') {
       // QQ 邮箱补全
       email = normalizeQQEmail(
         oauthUserInfo.id, // QQ OpenID
         oauthUserInfo.email || null
       );
       console.log(`[OAuth] QQ 邮箱补全: ${email}`);
     } else {
       // Google 直接使用返回的邮箱
       email = oauthUserInfo.email;
     }
     
     // 尝试通过邮箱查找或创建用户（自动关联）
     const { user, isNewUser, linkedMethod } = await findOrCreateUserByEmail(
       db,
       email,
       {
         provider,
         provider_user_id: oauthUserInfo.id,
         email: email,
         name: oauthUserInfo.name,
         picture: oauthUserInfo.picture,
       }
     );
     
     console.log(`[OAuth] ${provider} 登录完成，用户 ID: ${user.id}, 关联方式: ${linkedMethod}`);
     
     return user;
   }
   ```

#### Phase 2：手动关联功能（主要功能）

1. **添加 API 端点**
   - `GET /api/profile/oauth-accounts` - 获取用户关联的所有 OAuth 账号
   - `POST /api/profile/link-oauth` - 手动关联新的 OAuth 账号
     - 如果该 OAuth 账号已关联到其他用户，返回合并提示
   - `POST /api/profile/merge-accounts` - 合并账号（将 OAuth 账号从其他用户合并到当前用户）
   - `POST /api/profile/unlink-oauth` - 解绑 OAuth 账号（需至少保留一个）

2. **手动关联逻辑**
   ```typescript
   async function linkOAuthAccountManually(
     db: D1Database,
     currentUserId: string,
     provider: 'google' | 'qq',
     oauthUserInfo: OAuthUserInfo
   ): Promise<{ success: boolean; needsMerge: boolean; targetUserId?: string }> {
     // 检查该 OAuth 账号是否已关联到其他用户
     const existingOAuth = await getOAuthAccountByProvider(
       db,
       provider,
       oauthUserInfo.id
     );
     
     if (existingOAuth) {
       if (existingOAuth.user_id === currentUserId) {
         // 已关联到当前用户
         return { success: true, needsMerge: false };
       } else {
         // 已关联到其他用户，需要合并
         return {
           success: false,
           needsMerge: true,
           targetUserId: existingOAuth.user_id
         };
       }
     }
     
     // 关联到当前用户
     let email: string;
     if (provider === 'qq') {
       email = normalizeQQEmail(oauthUserInfo.id, oauthUserInfo.email || null);
     } else {
       email = oauthUserInfo.email;
     }
     
     await linkOAuthAccount(db, currentUserId, {
       provider,
       provider_user_id: oauthUserInfo.id,
       email: email,
       name: oauthUserInfo.name,
       picture: oauthUserInfo.picture,
     }, 'manual');
     
     return { success: true, needsMerge: false };
   }
   ```

3. **用户合并逻辑**
   ```typescript
   async function mergeAccounts(
     db: D1Database,
     sourceUserId: string,  // 要合并的用户（将被删除）
     targetUserId: string   // 目标用户（保留）
   ): Promise<void> {
     // 1. 将源用户的所有 OAuth 账号关联到目标用户
     const sourceOAuthAccounts = await getOAuthAccountsByUserId(db, sourceUserId);
     for (const oauthAccount of sourceOAuthAccounts) {
       await updateOAuthAccountUserId(db, oauthAccount.id, targetUserId);
     }
     
     // 2. 可选：合并其他数据（例如：用户设置、历史记录等）
     // await mergeUserData(db, sourceUserId, targetUserId);
     
     // 3. 删除源用户（如果 users 表有 CASCADE，oauth_accounts 会自动删除）
     await deleteUser(db, sourceUserId);
     
     console.log(`[合并] 用户 ${sourceUserId} 已合并到 ${targetUserId}`);
   }
   ```

4. **前端设置页面**
   - 显示已关联的 OAuth 账号列表
   - 提供"添加账号"按钮
   - 显示账号关联状态（自动关联/手动关联）
   - 合并账号确认对话框

## 边界情况处理

### 情况 1：QQ 无法获取邮箱

**处理方式：**
- ✅ 使用 `QQ号@qq.com` 自动补全
- ✅ 登录时创建新用户（因为邮箱不同，无法自动关联）
- ✅ 用户登录后，在设置页面手动关联其他 OAuth 账号

### 情况 2：手动关联时，OAuth 账号已关联到其他用户

**处理方式：**
- ✅ 检测到冲突，提示用户是否合并账号
- ✅ 用户确认后，执行合并操作：
  1. 将 OAuth 账号从源用户解绑
  2. 关联到目标用户
  3. 可选：合并源用户的其他数据
  4. 删除源用户（如果源用户没有其他 OAuth 账号）

### 情况 3：用户解绑 OAuth 账号

**处理方式：**
- ✅ 确保至少保留一个可用的 OAuth 账号
- ✅ 如果只剩一个账号，不允许解绑
- ✅ 解绑后，用户仍可以使用其他已关联的账号登录
- ✅ 如果解绑后用户没有其他 OAuth 账号，删除用户记录（可选）

### 情况 4：自动关联冲突（罕见情况）

**处理方式：**
- ✅ 如果检测到 OAuth 账号已关联到其他用户，不自动关联
- ✅ 创建新用户，后续通过手动关联合并
- ✅ 记录日志，便于排查

### 情况 5：用户合并时的数据冲突

**处理方式：**
- ✅ 优先保留目标用户的数据
- ✅ 可选：合并策略（例如：保留最新的数据）
- ✅ 记录合并历史，便于追溯

## 数据库设计

### oauth_accounts 表

```sql
CREATE TABLE IF NOT EXISTS oauth_accounts (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL,
	provider TEXT NOT NULL,              -- 'google' | 'qq'
	provider_user_id TEXT NOT NULL,      -- OAuth 提供商的用户 ID
	email TEXT,                          -- OAuth 账号的邮箱（可能为空）
	name TEXT,
	picture TEXT,
	access_token TEXT,
	refresh_token TEXT,
	token_expires_at TEXT,
	linked_at TEXT NOT NULL DEFAULT (datetime('now')),  -- 关联时间
	linked_method TEXT NOT NULL DEFAULT 'auto',          -- 'auto' | 'manual'
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	updated_at TEXT NOT NULL DEFAULT (datetime('now')),
	UNIQUE(provider, provider_user_id),
	FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

**字段说明：**
- `linked_method`: 关联方式
  - `'auto'`: 自动关联（通过邮箱匹配）
  - `'manual'`: 手动关联（用户在设置页面操作）

## 实施建议

### 优先级

1. **Phase 1（必需）**：基础架构 + QQ 邮箱补全 + 自动关联（辅助）
   - 实现数据库迁移（创建 `oauth_accounts` 表）
   - 实现 QQ 邮箱补全逻辑
   - 实现自动关联逻辑（虽然很少用到）
   - 迁移现有 Google 用户数据

2. **Phase 2（必需）**：手动关联功能（主要功能）
   - 实现手动关联 API
   - 实现用户合并功能
   - 前端设置页面

3. **Phase 3（推荐）**：优化和增强
   - 账号合并确认流程优化
   - 数据合并策略
   - 关联历史记录
   - 解绑账号功能

### 已确认的决策

1. **QQ 邮箱处理**
   - ✅ 如果 QQ 无法获取邮箱，使用 `QQ号@qq.com` 自动补全
   - ✅ QQ 邮箱仅用于标识，不用于自动关联

2. **关联策略**
   - ✅ 以手动关联为主
   - ✅ 自动关联为辅（处理邮箱完全相同的情况，虽然罕见）

3. **用户合并**
   - ✅ 支持用户合并功能
   - ✅ 手动关联时检测冲突，提示用户合并
   - ✅ 合并时处理数据冲突

## 总结

**采用方案：手动关联为主 + 自动关联为辅**

**核心设计：**
- ✅ QQ 邮箱自动补全（`QQ号@qq.com`）
- ✅ 自动关联（辅助，处理邮箱完全相同的情况）
- ✅ 手动关联（主要方式，用户在设置页面操作）
- ✅ 用户合并（支持将不同 OAuth 账号合并到同一用户）

**实施顺序：**
1. Phase 1：基础架构 + QQ 邮箱补全 + 自动关联
2. Phase 2：手动关联功能 + 用户合并
3. Phase 3：优化和增强

**关键点：**
- QQ 邮箱和 Google 邮箱几乎不可能相同，所以自动关联基本不会成功
- 主要依赖手动关联，用户主动合并账号
- 需要清晰的 UI 指引，帮助用户理解如何关联账号

