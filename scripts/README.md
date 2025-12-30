# 脚本说明

## init-puzzler-images.js

初始化拼图游戏图片库的脚本。

### 功能

1. 通过 Google Custom Search API 搜索「古风美景」图片
2. 筛选接近 16:9 比例的图片
3. 将图片裁剪并调整到 1600x900 像素
4. 上传到 R2 存储桶的 `mini-games/puzzler/images/` 目录

### 前置要求

1. **安装依赖**：
   ```bash
   npm install sharp
   ```
   
   注意：这些依赖需要安装在项目根目录，不是 `api/` 或 `web/` 目录。

2. **安装并登录 wrangler**：
   ```bash
   # 全局安装（推荐）
   npm install -g wrangler
   
   # 或本地安装
   npm install wrangler
   
   # 登录 Cloudflare
   wrangler login
   ```
   
   注意：wrangler 用于上传文件到 R2，需要先登录。

3. **配置 Google Custom Search API**：
   - 访问 https://developers.google.com/custom-search/v1/overview
   - 创建 API Key
   - 创建 Custom Search Engine (CSE)
   - 在 CSE 设置中启用「图片搜索」

4. **配置 R2**：
   - 确保 `api/wrangler.jsonc` 中配置了 R2 bucket `joel-assets`
   - 使用 wrangler 命令行上传，无需配置 API Token

### 获取配置信息

#### 1. Google Custom Search Engine ID (GOOGLE_CSE_ID)

**步骤**：
1. 访问 https://programmablesearchengine.google.com/controlpanel/create
2. 填写信息：
   - **搜索引擎名称**：任意（如 "Puzzler Images"）
   - **要搜索的网站**：输入 `*`（表示搜索整个网络）
3. 点击"创建"
4. 创建后，在控制台可以看到 **Search engine ID**（这就是 `GOOGLE_CSE_ID`）
5. 在设置中启用"图片搜索"选项

#### 2. Wrangler 配置

**步骤**：
1. 安装 wrangler（如果还没有）：
   ```bash
   npm install -g wrangler
   ```

2. 登录 Cloudflare：
   ```bash
   wrangler login
   ```

3. 确保 `api/wrangler.jsonc` 中配置了 R2 bucket：
   ```jsonc
   "r2_buckets": [
     {
       "binding": "ASSETS",
       "bucket_name": "joel-assets"
     }
   ]
   ```

**注意**：使用 wrangler 命令行上传，无需配置 R2 API Token。

### 使用方法

**方式一：使用环境变量文件（推荐）**

1. 复制示例文件：
   ```bash
   cp scripts/.env.example scripts/.env
   ```

2. 编辑 `scripts/.env`，填入你的配置信息

3. 运行脚本（需要先安装 `dotenv`）：
   ```bash
   npm install dotenv
   node -r dotenv/config scripts/init-puzzler-images.js dotenv_config_path=scripts/.env
   ```

**方式二：直接设置环境变量**

```bash
export GOOGLE_API_KEY="your-google-api-key"
export GOOGLE_CSE_ID="your-custom-search-engine-id"

node scripts/init-puzzler-images.js
```

**方式三：直接在脚本中配置（不推荐，仅用于测试）**

直接修改 `scripts/init-puzzler-images.js` 中的 `CONFIG` 对象（**注意：不要提交包含敏感信息的代码**）

### 配置说明

脚本中的配置可以通过环境变量或直接修改 `CONFIG` 对象：

- `GOOGLE_API_KEY`: Google Custom Search API Key
- `GOOGLE_CSE_ID`: Custom Search Engine ID
- `TARGET_WIDTH`: 目标宽度（默认 1600）
- `TARGET_HEIGHT`: 目标高度（默认 900）
- `NUM_IMAGES`: 需要下载的图片数量（默认 10）

### 工作流程

1. **启动时检查**：检查 `temp-images/` 目录中已有的处理好的图片
2. **智能补全**：
   - 如果已有足够的图片（≥10 张），跳过搜索和下载
   - 如果图片不足，只搜索和下载缺少的数量
3. **保留临时文件**：处理好的图片保存在 `temp-images/` 目录，不会自动清理
4. **上传到 R2**：使用 wrangler 命令行将所有处理好的图片上传到 R2

### 注意事项

1. Google Custom Search API 有免费配额限制（每天 100 次请求）
2. 临时图片会保留在 `temp-images/` 目录，下次运行时会自动使用
3. 如果图片宽高比不符合要求，会自动跳过
4. 上传的图片会覆盖已存在的同名文件（1.jpg ~ 10.jpg）
5. 确保已登录 wrangler：`wrangler login`

