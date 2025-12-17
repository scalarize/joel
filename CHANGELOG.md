# 更新日志

## 前后端分离改造

### API 路由变更

**重要：OAuth 路径已迁移到 `/api/` 前缀下**

- ✅ `/auth/google` → `/api/auth/google`
- ✅ `/auth/google/callback` → `/api/auth/google/callback`
- ✅ `/logout` → `/api/logout`

**兼容性：** 旧路径会自动 301 重定向到新路径，但建议尽快更新所有引用。

### Google OAuth 配置更新

**需要在 Google Cloud Console 中更新授权重定向 URI：**

1. 访问 [Google Cloud Console](https://console.cloud.google.com/)
2. 进入 **API 和凭据** > **凭据**
3. 找到你的 OAuth 2.0 客户端 ID
4. 更新 **授权重定向 URI**：
   - 旧：`https://joel.scalarize.org/auth/google/callback`
   - **新：** `https://joel.scalarize.org/api/auth/google/callback`

### Pages 前端功能

- ✅ Dashboard 工作台页面
- ✅ 右上角用户信息显示
- ✅ 登录/登出功能
- ✅ 功能模块卡片（书签收藏、GD开发、系统管理）
- ✅ 使用 `/api/me` 进行身份校验

### 环境变量

确保在生产环境设置：

```bash
FRONTEND_URL=https://joel.scalarize.org
```

这样 OAuth 回调成功后会自动重定向到 Pages 前端。

