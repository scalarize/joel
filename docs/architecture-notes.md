# 架构设计说明与未来扩展预留

## 当前架构概述

Joel 目前采用单一 Google OAuth 认证架构：

- `users` 表：`id` 字段直接使用 Google user ID
- Session 中存储 `userId`（即 Google user ID）
- OAuth 处理逻辑模块化在 `auth/google.ts`

## 未来扩展：多 OAuth 支持

### 当前架构的限制

1. **用户 ID 设计**

   - ❌ `users.id` 直接使用 Google user ID
   - ✅ 未来需要改为内部 UUID，通过 `oauth_accounts` 表关联

2. **用户关联**

   - ✅ 已有 `getUserByEmail()` 函数，可用于邮箱匹配
   - ✅ `email` 字段已有 UNIQUE 约束，便于识别同一用户

3. **OAuth 处理**
   - ✅ OAuth 逻辑已模块化（`auth/google.ts`），便于扩展
   - ✅ Callback 处理逻辑清晰，易于抽象

### 最小化预留建议

#### 1. 保持现有函数结构（已满足）

当前代码已经具备良好的扩展性：

- ✅ `getUserByEmail()` - 可用于多 OAuth 的邮箱匹配
- ✅ `getUserById()` - 查询逻辑独立，未来只需改 ID 格式
- ✅ OAuth 模块化 - `auth/google.ts` 可复制为 `auth/github.ts` 等

#### 2. 添加架构说明注释（建议添加）

在关键位置添加注释，说明当前设计的选择和未来扩展方向：

```typescript
// api/src/db/schema.ts
export interface User {
	id: string; // 当前：Google user ID；未来：内部 UUID（需迁移）
	email: string; // 用于多 OAuth 账号关联的关键字段
	// ...
}
```

#### 3. 保持数据库 Schema 的灵活性（已满足）

- ✅ `email` 字段有 UNIQUE 约束，便于识别同一用户
- ✅ 表结构简单，未来添加 `oauth_accounts` 表不影响现有数据

## 未来迁移时的注意事项

### 数据迁移

1. **用户 ID 迁移**

   - 当前：`users.id = Google user ID`
   - 未来：`users.id = UUID`，`oauth_accounts.provider_user_id = Google user ID`
   - 需要：应用层脚本迁移现有数据

2. **Session 兼容**
   - 当前 Session 存储的是 Google user ID
   - 迁移后需要处理旧 Session：
     - 方案 A：强制重新登录（简单但用户体验差）
     - 方案 B：Session 验证时检查格式，如果是旧格式则查找对应的新 user.id（推荐）

### 代码迁移

1. **OAuth Callback 处理**

   - 当前：`handleGoogleCallback()` 直接调用 `upsertUser()`
   - 未来：改为调用 `findOrCreateOAuthAccount()` + `findOrCreateUserByEmail()`

2. **用户查询**
   - 当前：`getUserById(session.userId)` - 直接查询
   - 未来：保持不变，但 `userId` 格式从 Google ID 变为 UUID

## 文档保留建议

### 必须保留的文档

1. ✅ **`docs/multi-oauth-architecture.md`**

   - 核心设计思路和数据库设计
   - 用户关联策略说明
   - 迁移方案概述

2. ✅ **`docs/multi-oauth-implementation-guide.md`**

   - 分步实现指南
   - 代码示例和测试场景
   - 常见问题解答

### 可选保留的文档

- 实现代码示例：`docs/multi-oauth-implementation-guide.md` 中已包含足够的代码示例
- 迁移脚本：实际迁移时需要根据具体情况编写应用层脚本，无需提前准备

## 当前架构的优势

1. **简单清晰**：单一 OAuth 提供商，逻辑直接
2. **易于理解**：用户 ID = OAuth ID，直观
3. **性能良好**：无需关联查询，直接通过 ID 查找
4. **扩展性好**：OAuth 逻辑已模块化，便于添加新提供商

## 何时考虑迁移

建议在以下情况考虑迁移到多 OAuth 支持：

1. ✅ 用户明确需要多个 OAuth 提供商登录
2. ✅ 需要将同一用户的不同 OAuth 账号关联
3. ✅ 用户量达到一定规模，需要更灵活的认证方案

**当前建议**：保持现有架构，专注于核心功能开发。

## 总结

- ✅ **当前架构合理**：适合单一 OAuth 场景，代码清晰
- ✅ **扩展性良好**：已有必要的函数和模块化设计
- ✅ **迁移路径清晰**：文档已详细说明迁移方案
- ✅ **无需立即改动**：保持现状，未来按需迁移
