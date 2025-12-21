# Joel 项目文档

> **提示**：如需实现多 OAuth 提供商支持，请参考本文档索引，按照文档顺序阅读和实现。

## 架构设计文档

### 当前架构
- **单一 Google OAuth 认证**
- 用户 ID = Google user ID
- 简单直接，适合当前需求

### 未来扩展设计

#### 多 OAuth 提供商支持

**实现顺序建议**：
1. 📄 **[架构设计文档](./multi-oauth-architecture.md)** - 先阅读，了解整体设计思路和数据库结构
2. 📄 **[架构说明](./architecture-notes.md)** - 了解当前架构的限制和迁移注意事项
3. 📄 **[实现指南](./multi-oauth-implementation-guide.md)** - 按照步骤实现，包含代码示例和测试场景

#### 关键设计要点
1. **用户身份分离**：`users` 表（主用户） + `oauth_accounts` 表（OAuth 账号）
2. **Email 匹配策略**：通过 email 自动关联同一用户的不同 OAuth 账号
3. **向后兼容**：保持现有 API 不变，最小化迁移成本

## 文档说明

### 何时参考这些文档

- ✅ **现在不需要**：当前架构已满足单一 Google OAuth 需求
- ✅ **未来扩展时**：需要支持多个 OAuth 提供商时参考
- ✅ **架构决策时**：了解当前设计的限制和扩展方向

### 文档有效性

所有文档基于当前代码结构设计，**未来仍然有效**：
- 数据库设计思路不变
- 用户关联策略不变
- 迁移方案仍然适用

### 保留建议

建议保留以下文档（已全部保留在 `docs/` 目录）：
1. ✅ `multi-oauth-architecture.md` - 核心设计思路和数据库设计
2. ✅ `multi-oauth-implementation-guide.md` - 实现指南（包含代码示例）
3. ✅ `architecture-notes.md` - 架构说明和注意事项

**未来实现时**：只需提示 AI 助手参考 `docs/README.md` 中的文档索引，按照文档顺序实现即可。

## 快速参考

### 当前架构特点
- 简单：用户 ID = OAuth ID
- 高效：直接通过 ID 查询，无需关联
- 清晰：逻辑直观，易于维护

### 未来扩展路径
1. 执行数据库迁移（创建 `oauth_accounts` 表）
2. 更新用户 ID 为 UUID
3. 实现用户关联逻辑
4. 添加新的 OAuth 提供商支持

详见各文档的详细说明。

## 基础设施与运维文档

### 反向代理架构

- 📄 **[Linode 反向代理架构与运维文档](./linode-reverse-proxy.md)** - Linode 节点 nginx 反向代理的搭建、配置和运维说明
  - Linode 节点 nginx 搭建和配置
  - Certbot SSL 证书申请和自动续期
  - Aliyun DNS 解析配置
  - Cloudflare Workers 域名支持配置
  - 日常运维操作和故障排查

### Cloudflare 配置

- 📄 **[Cloudflare 环境变量配置](./CF_ENV_SETUP.md)** - Cloudflare Workers 环境变量配置指南
- 📄 **[Cloudflare 全栈初始化](./CF_FULLSTACK_INIT.md)** - Cloudflare Workers 和 Pages 的初始化步骤

### 其他文档

- 📄 **[OAuth 账号关联策略](./oauth-account-linking-strategy.md)** - OAuth 账号关联的设计策略

