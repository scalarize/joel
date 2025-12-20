# Cloudflare 全栈应用初始化指南

## 概述
本文档提供从零开始初始化一个完整的 Cloudflare 全栈应用的标准操作流程。项目结构采用前后端分离模式：
- **后端**：Cloudflare Worker (使用 Hono 框架)
- **前端**：Cloudflare Pages (使用 Vite + React + TypeScript)

## 第一阶段：环境准备与项目创建

### 1.1 创建项目根目录
```bash
# 创建项目目录并进入
mkdir your-project-name && cd your-project-name
```

### 1.2 初始化 Git 仓库（本地版本控制）
```bash
# 初始化本地Git仓库
git init

# 创建基础目录结构
mkdir -p api/src web/src
```

## 第二阶段：后端 API Worker 初始化

### 2.1 进入 API 目录并初始化 Node.js 项目

```bash
cd api
```

### 2.2 初始化 npm 项目
```bash
npm init -y
```

### 2.3 安装依赖包
```bash
# 安装生产依赖
npm install hono

# 安装开发依赖
npm install -D wrangler @cloudflare/workers-types typescript
```

### 2.4 创建 TypeScript 配置文件
创建文件 `api/tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "types": ["@cloudflare/workers-types"],
    "jsx": "react-jsx",
    "jsxImportSource": "hono/jsx"
  }
}
```

### 2.5 创建 Worker 主入口文件
创建文件 `api/src/index.ts`：
```typescript
import { Hono } from 'hono'

// 环境变量类型定义（根据实际绑定扩展）
export interface Env {
  // 示例：D1 数据库绑定
  // DB: D1Database

  // 示例：R2 存储桶绑定
  // ASSETS: R2Bucket

  // 示例：环境变量
  // SERVICE_NAME: string
}

const app = new Hono<{ Bindings: Env }>()

// 健康检查端点
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'api-worker',
    timestamp: new Date().toISOString()
  })
})

// 业务路由将在此添加
// app.get('/api/resource', (c) => { ... })
// app.post('/api/resource', (c) => { ... })

export default app
```

### 2.6 创建 Wrangler 配置文件

创建文件 `api/wrangler.jsonc`：

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/cloudflare/workers-sdk/main/packages/wrangler/config-schema.json",
  "name": "your-project-api",
  "compatibility_date": "2024-12-01",
  "main": "src/index.ts",
  "routes": [
    {
      "pattern": "your-subdomain.yourdomain.com/api/*"
    }
  ],
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "your-project-db",
      "database_id": "YOUR_D1_DATABASE_ID_HERE" // 需替换为实际ID
    }
  ],
  "r2_buckets": [
    {
      "binding": "ASSETS",
      "bucket_name": "your-project-assets"
    }
  ],
  "vars": {
    "SERVICE_NAME": "Your Project Service"
  },
  "observability": {
    "enabled": true
  }
}
```

**配置说明**：

- name: Worker 名称，在 Cloudflare 仪表盘中显示
- routes: 自定义域名路由规则，按实际需求修改
- d1_databases: D1 数据库绑定，创建数据库后需替换 database_id
- r2_buckets: R2 存储桶绑定
- vars: 环境变量，可在代码中通过 env.VAR_NAME 访问



## 第三阶段：前端 Pages 初始化

### 3.1 进入 Web 目录

```bash
# 从 api 目录返回项目根目录，进入 web 目录
cd ../web
```



### 3.2 使用 Vite 创建 React + TypeScript 项目

```bash
npm create vite@latest . -- --template react-ts
```



### 3.3 安装依赖


```bash
npm install
```



### 3.4 配置开发服务器代理

编辑文件 `web/vite.config.ts`：


```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // 将所有 /api 开头的请求代理到本地 Worker 开发服务器
      '/api': {
        target: 'http://localhost:8787', // Worker 开发服务器默认端口
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  }
})
```



**代理配置说明**：

- 本地开发时，前端对 `/api/xxx` 的请求会自动转发到 Worker 开发服务器
- 生产环境部署后，通过路由规则（`your-subdomain.yourdomain.com/api/*`）直接访问 Worker

### 3.5 修改前端入口文件（可选）

更新 `web/src/App.tsx`，添加 API 测试功能：


```tsx
import { useState, useEffect } from 'react'

function App() {
  const [healthStatus, setHealthStatus] = useState<string>('检查中...')

  useEffect(() => {
    fetch('/api/health')
      .then(res => res.json())
      .then(data => setHealthStatus(JSON.stringify(data, null, 2)))
      .catch(err => setHealthStatus(`错误: ${err.message}`))
  }, [])

  return (
    <div>
      <h1>你的项目前端</h1>
      <div>
        <h2>API 健康状态:</h2>
        <pre>{healthStatus}</pre>
      </div>
    </div>
  )
}

export default App
```



## 第四阶段：Cloudflare 资源创建

### 4.1 创建 D1 数据库

1. 登录 [Cloudflare 控制台](https://dash.cloudflare.com/)
2. 进入 **Workers & Pages > D1**
3. 点击 **Create database**
4. 填写配置：
   - **Name**: `your-project-db`（与 `wrangler.jsonc` 中的 `database_name` 一致）
   - **Region**: 选择离你最近的区域（如 APAC）
5. 创建后，进入数据库详情页，复制 **Database ID**
6. 更新 `api/wrangler.jsonc` 中的 `database_id` 字段

### 4.2 创建 R2 存储桶

1. 在 Cloudflare 控制台，进入 **R2 > Buckets**
2. 点击 **Create bucket**
3. 填写配置：
   - **Bucket name**: `your-project-assets`（与 `wrangler.jsonc` 中的 `bucket_name` 一致）
4. 点击创建（无需其他配置）

### 4.3 创建自定义域名（可选）

1. 确保你的域名已托管在 Cloudflare
2. 在 DNS 设置中添加记录：
   - **Type**: CNAME 或 A
   - **Name**: `your-subdomain`（你希望使用的子域名）
   - **Target**: （由 Pages 和 Worker 部署后自动配置）

## 第五阶段：本地开发与测试

### 5.1 启动后端开发服务器


```bash
# 在 api 目录下
cd api
npx wrangler dev
```



### 5.2 测试 API 端点


```bash
# 在新终端窗口中测试健康检查
curl http://localhost:8787/health
# 预期响应: {"status":"ok","service":"api-worker","timestamp":"..."}
```



### 5.3 启动前端开发服务器



```bash
# 在 web 目录下（新终端窗口）
cd web
npm run dev
```



### 5.4 访问前端应用

1. 打开浏览器访问 `http://localhost:5173`
2. 页面应显示 API 健康状态信息
3. 前端对 `/api/health` 的请求已通过代理转发到 Worker

## 第六阶段：部署到生产环境

### 6.1 部署 Worker



```bash
# 在 api 目录下
cd api

# 登录 Cloudflare（首次需要）
npx wrangler login

# 部署到生产环境
npx wrangler deploy
```



### 6.2 部署 Pages

bash

```
# 在 web 目录下
cd web

# 构建前端项目
npm run build

# 部署到 Cloudflare Pages
npx wrangler pages deploy ./dist --project-name=your-project-frontend
```



### 6.3 配置 Pages 自定义域名

1. 在 Cloudflare 控制台，进入 **Workers & Pages > Pages**
2. 选择你的 Pages 项目
3. 进入 **Settings > Custom domains**
4. 点击 **Set up a custom domain**
5. 输入你的完整域名（如 `your-subdomain.yourdomain.com`）

## 第七阶段：项目管理与维护

### 7.1 常用命令参考

bash

```
# 后端开发
npx wrangler dev           # 启动本地开发服务器
npx wrangler deploy        # 部署到生产环境
npx wrangler tail          # 查看实时日志
npx wrangler d1 execute DB --file=./schema.sql  # 执行 SQL 文件

# 前端开发
npm run dev                # 启动开发服务器
npm run build              # 构建生产版本
npm run preview            # 预览构建结果

# 项目管理
git add .                  # 添加所有文件到暂存区
git commit -m "描述"       # 提交更改
```



### 7.2 项目结构总览

text

```
your-project-name/
├── api/                   # 后端 Worker 项目
│   ├── src/
│   │   └── index.ts      # 主入口文件
│   ├── package.json
│   ├── tsconfig.json
│   └── wrangler.jsonc    # 核心配置文件
└── web/                  # 前端 Pages 项目
    ├── src/              # 前端源代码
    ├── public/           # 静态资源
    ├── index.html
    ├── package.json
    ├── tsconfig.json
    └── vite.config.ts    # 构建与代理配置
```



## 附录

### A. 故障排除

| 问题                | 可能原因                 | 解决方案                                 |
| :------------------ | :----------------------- | :--------------------------------------- |
| `wrangler dev` 失败 | 未登录或 Token 过期      | 运行 `npx wrangler login`                |
| 数据库连接失败      | `database_id` 错误       | 检查控制台中的数据库 ID                  |
| 代理不工作          | vite 配置错误            | 检查 `vite.config.ts` 代理设置           |
| 路由冲突            | 多个 Worker 使用相同路由 | 检查所有项目的 `wrangler.jsonc` 路由配置 |

### B. 安全建议

1. 将 `wrangler.jsonc` 中的敏感信息（如数据库 ID）通过环境变量管理
2. 为不同环境（开发、生产）使用不同的 D1 数据库和 R2 存储桶
3. 定期轮换 API Token 和密钥
4. 在 `wrangler.jsonc` 中配置 `observability.enabled: true` 以启用监控

### C. 扩展功能

1. **数据库迁移**：使用 `wrangler d1 migrations` 管理数据库版本
2. **环境配置**：创建 `wrangler.dev.jsonc` 用于开发环境特定配置
3. **CI/CD**：配置 GitHub Actions 或 GitLab CI 自动化部署
4. **监控告警**：在 Cloudflare 仪表盘设置用量告警

------

## 文档更新记录

| 版本 | 更新日期   | 更新内容                   |
| :--- | :--------- | :------------------------- |
| 1.0  | 2025-12-17 | 初始版本创建               |
| 1.1  | 2025-12-17 | 添加故障排除和扩展功能章节 |
