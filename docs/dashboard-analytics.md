# Dashboard 仪表盘设计文档

## 概述

Joel 项目的 Dashboard 仪表盘用于监控 Cloudflare 平台的资源使用情况，包括 D1 数据库、R2 对象存储和 Workers 计算资源的用量数据。通过可视化的方式展示各项指标的时间趋势，帮助管理员了解系统资源消耗情况，及时发现异常和优化机会。

## 1. 监控项和仪表盘主要指标

### 1.1 D1 数据库监控

**主要指标**：

- **读取行数** (`rowsRead`): 每日 D1 数据库读取操作的总行数
- **写入行数** (`rowsWritten`): 每日 D1 数据库写入操作的总行数
- **查询耗时** (`queryDurationMs`): 每日 D1 数据库查询的总耗时（毫秒）

**展示方式**：

- 汇总统计：显示日期范围内的总读取行数、总写入行数、总查询耗时
- 折线图 1：行读写统计（读取和写入行数的时间趋势对比）
- 折线图 2：查询耗时趋势（查询耗时的时间趋势）

### 1.2 R2 存储监控

**主要指标**：

- **请求数** (`requests`): 每日 R2 存储的 API 请求总数
- **响应流量** (`responseBytes`): 每日 R2 存储响应的总字节数
- **对象数** (`objectCount`): 每日 R2 存储中的最大对象数量
- **存储容量** (`payloadSize`): 每日 R2 存储的最大存储容量（字节）

**展示方式**：

- 汇总统计：显示日期范围内的总请求数、总响应流量、最大对象数、最大存储容量
- 折线图 1：请求数趋势（API 请求数的时间趋势）
- 折线图 2：存储容量趋势（存储大小和对象数的双 Y 轴对比图）

### 1.3 Workers 监控

**主要指标**：

- **请求数** (`requests`): 每日 Workers 的总请求数
- **子请求数** (`subrequests`): 每日 Workers 发起的子请求总数（如调用其他 API、访问 D1/R2 等）

**展示方式**：

- 汇总统计：显示日期范围内的总请求数、总子请求数
- 折线图：请求统计（请求数和子请求数的时间趋势对比）

## 2. 指标含义和监控思路

### 2.1 D1 数据库指标

#### 2.1.1 读取行数 (`rowsRead`)

**含义**：

- 统计所有 SELECT 查询操作读取的数据行数总和
- 反映数据库的读取负载和查询频率

**监控思路**：

- **正常情况**：读取行数应该与业务活跃度成正比，呈现相对稳定的趋势
- **异常情况**：
  - 突然激增：可能存在 N+1 查询问题、缺少索引导致全表扫描、或遭受攻击
  - 持续下降：可能表示业务量下降或存在查询缓存失效问题
- **优化建议**：
  - 如果读取行数过高，考虑添加数据库索引、优化查询语句、引入缓存机制
  - 监控读取行数与写入行数的比例，评估读写负载是否均衡

#### 2.1.2 写入行数 (`rowsWritten`)

**含义**：

- 统计所有 INSERT、UPDATE、DELETE 操作写入的数据行数总和
- 反映数据库的写入负载和数据变更频率

**监控思路**：

- **正常情况**：写入行数应该与业务操作（如用户注册、数据更新）相关，呈现相对稳定的趋势
- **异常情况**：
  - 突然激增：可能存在批量导入、数据迁移、或异常的数据写入逻辑
  - 持续下降：可能表示业务量下降或存在写入阻塞问题
- **优化建议**：
  - 如果写入行数过高，考虑批量操作优化、异步处理、或分库分表
  - 监控写入行数与读取行数的比例，评估数据库的读写模式

#### 2.1.3 查询耗时 (`queryDurationMs`)

**含义**：

- 统计所有数据库查询的总耗时（毫秒）
- 反映数据库查询的性能和响应速度

**监控思路**：

- **正常情况**：查询耗时应该保持相对稳定，与查询复杂度相关
- **异常情况**：
  - 突然增加：可能存在慢查询、数据库负载过高、或网络延迟问题
  - 持续高位：可能表示数据库性能瓶颈、缺少索引、或查询语句需要优化
- **优化建议**：
  - 如果查询耗时过高，考虑添加索引、优化查询语句、升级数据库配置
  - 结合读取行数分析，评估查询效率（平均每行读取耗时）

### 2.2 R2 存储指标

#### 2.2.1 请求数 (`requests`)

**含义**：

- 统计所有 R2 存储 API 请求的总数（包括 GET、PUT、DELETE、LIST 等操作）
- 反映对象存储的使用频率和访问模式

**监控思路**：

- **正常情况**：请求数应该与业务活跃度相关，呈现相对稳定的趋势
- **异常情况**：
  - 突然激增：可能存在大量文件上传/下载、CDN 缓存失效、或遭受攻击
  - 持续下降：可能表示业务量下降或存在访问阻塞问题
- **优化建议**：
  - 如果请求数过高，考虑使用 CDN 缓存、批量操作优化、或限制访问频率
  - 监控请求类型分布，评估是否需要优化存储策略

#### 2.2.2 响应流量 (`responseBytes`)

**含义**：

- 统计所有 R2 存储响应的总字节数（主要是 GET 请求返回的数据）
- 反映对象存储的数据传输量和带宽消耗

**监控思路**：

- **正常情况**：响应流量应该与文件访问频率和文件大小相关
- **异常情况**：
  - 突然激增：可能存在大量文件下载、大文件访问、或 CDN 缓存失效
  - 持续高位：可能表示带宽成本过高，需要优化文件大小或使用 CDN
- **优化建议**：
  - 如果响应流量过高，考虑使用 CDN 缓存、图片压缩、或限制大文件访问
  - 结合请求数分析，评估平均每次请求的流量（评估文件大小是否合理）

#### 2.2.3 对象数 (`objectCount`)

**含义**：

- 统计 R2 存储中的最大对象数量（每日快照）
- 反映对象存储的文件数量和存储规模

**监控思路**：

- **正常情况**：对象数应该随着业务增长而逐步增加，呈现相对稳定的增长趋势
- **异常情况**：
  - 突然激增：可能存在大量文件上传、数据迁移、或异常的文件生成逻辑
  - 持续下降：可能表示文件清理、数据迁移、或存在文件丢失问题
- **优化建议**：
  - 如果对象数过高，考虑文件清理策略、归档策略、或分桶存储
  - 监控对象数与存储容量的关系，评估平均文件大小

#### 2.2.4 存储容量 (`payloadSize`)

**含义**：

- 统计 R2 存储的最大存储容量（字节，每日快照）
- 反映对象存储的存储空间占用和成本

**监控思路**：

- **正常情况**：存储容量应该随着业务增长而逐步增加，呈现相对稳定的增长趋势
- **异常情况**：
  - 突然激增：可能存在大量大文件上传、数据迁移、或异常的文件生成逻辑
  - 持续高位：可能表示存储成本过高，需要优化文件大小或清理策略
- **优化建议**：
  - 如果存储容量过高，考虑文件压缩、清理策略、或归档策略
  - 结合对象数分析，评估平均文件大小（评估是否需要优化文件大小）

### 2.3 Workers 指标

#### 2.3.1 请求数 (`requests`)

**含义**：

- 统计所有 Workers 的总请求数（包括 HTTP 请求、Cron 触发等）
- 反映 Workers 的使用频率和负载情况

**监控思路**：

- **正常情况**：请求数应该与业务活跃度相关，呈现相对稳定的趋势
- **异常情况**：
  - 突然激增：可能存在流量激增、攻击、或异常的业务逻辑触发
  - 持续下降：可能表示业务量下降或存在请求阻塞问题
- **优化建议**：
  - 如果请求数过高，考虑限流策略、缓存机制、或优化业务逻辑
  - 监控请求数与子请求数的比例，评估 Workers 的复杂度

#### 2.3.2 子请求数 (`subrequests`)

**含义**：

- 统计所有 Workers 发起的子请求总数（如调用其他 API、访问 D1/R2、调用外部服务等）
- 反映 Workers 的复杂度和依赖关系

**监控思路**：

- **正常情况**：子请求数应该与主请求数相关，呈现相对稳定的比例关系
- **异常情况**：
  - 突然激增：可能存在 N+1 查询问题、循环调用、或异常的业务逻辑
  - 比例异常：如果子请求数与请求数的比例过高，可能表示 Workers 逻辑过于复杂
- **优化建议**：
  - 如果子请求数过高，考虑批量操作、缓存机制、或优化业务逻辑
  - 监控子请求数与请求数的比例，评估 Workers 的效率和复杂度

## 3. 对应的整体 GraphQL 查询

### 3.1 GraphQL 查询结构

```graphql
query GetUsage($accountId: String!, $startDate: Date!, $endDate: Date!) {
	viewer {
		accounts(filter: { accountTag: $accountId }) {
			# D1 数据库查询统计
			d1Queries: d1QueriesAdaptiveGroups(filter: { date_geq: $startDate, date_leq: $endDate }, limit: 10000) {
				dimensions {
					date
				}
				sum {
					rowsRead # 读取行数
					rowsWritten # 写入行数
					queryDurationMs # 查询耗时（毫秒）
				}
			}

			# R2 操作统计
			r2Operation: r2OperationsAdaptiveGroups(filter: { date_geq: $startDate, date_leq: $endDate }, limit: 10000) {
				dimensions {
					date
				}
				sum {
					requests # 请求数
					responseBytes # 响应流量（字节）
				}
			}

			# R2 存储统计
			r2Storage: r2StorageAdaptiveGroups(filter: { date_geq: $startDate, date_leq: $endDate }, limit: 10000) {
				dimensions {
					date
				}
				max {
					objectCount # 对象数
					uploadCount # 上传次数（未使用）
					payloadSize # 存储容量（字节）
				}
			}

			# Workers 统计
			worker: workersInvocationsAdaptive(filter: { date_geq: $startDate, date_leq: $endDate }, limit: 10000) {
				dimensions {
					date
				}
				sum {
					requests # 请求数
					subrequests # 子请求数
				}
			}
		}
	}
}
```

### 3.2 GraphQL 查询参数

**变量**：

- `$accountId` (String!): Cloudflare 账户 ID，用于过滤特定账户的数据
- `$startDate` (Date!): 开始日期（格式：YYYY-MM-DD），查询的起始日期
- `$endDate` (Date!): 结束日期（格式：YYYY-MM-DD），查询的结束日期

**默认值**：

- `startDate`: 当前日期往前推 30 天
- `endDate`: 当前日期

### 3.3 GraphQL 查询端点

**端点**: `https://api.cloudflare.com/client/v4/graphql`

**请求方式**: POST

**请求头**:

```json
{
	"Content-Type": "application/json",
	"Authorization": "Bearer {CF_API_TOKEN}"
}
```

**请求体**:

```json
{
	"query": "{GraphQL查询字符串}",
	"variables": {
		"accountId": "{CF_ACCOUNT_ID}",
		"startDate": "YYYY-MM-DD",
		"endDate": "YYYY-MM-DD"
	}
}
```

### 3.4 GraphQL 响应结构

```typescript
interface CloudflareAnalyticsResponse {
	data?: {
		viewer?: {
			accounts?: Array<{
				// D1 查询数据
				d1Queries?: Array<{
					dimensions?: { date?: string };
					sum?: {
						rowsRead?: number;
						rowsWritten?: number;
						queryDurationMs?: number;
					};
				}>;

				// R2 操作数据
				r2Operation?: Array<{
					dimensions?: { date?: string };
					sum?: {
						requests?: number;
						responseBytes?: number;
					};
				}>;

				// R2 存储数据
				r2Storage?: Array<{
					dimensions?: { date?: string };
					max?: {
						objectCount?: number;
						uploadCount?: number;
						payloadSize?: number;
					};
				}>;

				// Workers 数据
				worker?: Array<{
					dimensions?: { date?: string };
					sum?: {
						requests?: number;
						subrequests?: number;
					};
				}>;
			}>;
		};
	};
	errors?: Array<{
		message: string;
	}>;
}
```

### 3.5 数据聚合方式

**D1 和 R2 操作、Workers**：

- 使用 `sum` 聚合函数，按日期分组求和
- 适用于累计型指标（如总行数、总请求数、总流量）

**R2 存储**：

- 使用 `max` 聚合函数，按日期分组取最大值
- 适用于快照型指标（如最大对象数、最大存储容量）

**日期维度**：

- 所有数据按 `date` 维度分组（格式：YYYY-MM-DD）
- 每个日期对应一个数据点，用于绘制时间序列图表

### 3.6 数据限制

- **limit**: 每个查询最多返回 10000 条记录
- **日期范围**: 建议查询范围不超过 90 天，以确保数据完整性和查询性能
- **数据延迟**: Cloudflare Analytics 数据可能存在 1-2 小时的延迟

## 4. 实现细节

### 4.1 前端实现

**文件**: `web/src/AdminDashboard.tsx`

**主要功能**：

- 日期范围选择器（默认最近 30 天）
- 调用 `/api/admin/analytics` API 获取数据
- 使用 Recharts 库绘制折线图
- 数据格式化（字节、数字、时间）

**数据展示**：

- 汇总统计：显示日期范围内的总和/最大值
- 折线图：展示各项指标的时间趋势

### 4.2 后端实现

**文件**: `api/src/admin/analytics.ts`

**主要功能**：

- 构建 GraphQL 查询
- 调用 Cloudflare GraphQL API
- 解析响应数据
- 按日期排序和格式化数据

**API 端点**: `GET /api/admin/analytics?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`

**权限要求**: 需要管理员权限（通过 JWT token 验证）

**环境变量**:

- `CF_API_TOKEN`: Cloudflare API Token
- `CF_ACCOUNT_ID`: Cloudflare 账户 ID

## 5. 使用建议

### 5.1 监控频率

- **日常监控**: 建议每天查看一次，了解资源使用趋势
- **异常排查**: 当发现性能问题或异常时，可以查看历史数据对比分析
- **容量规划**: 定期（如每周）查看存储容量和对象数趋势，规划存储策略

### 5.2 告警阈值建议

**D1 数据库**：

- 查询耗时 > 1000ms：可能存在慢查询，需要优化
- 读取行数突然增加 > 50%：可能存在 N+1 查询或攻击
- 写入行数突然增加 > 50%：可能存在异常的数据写入逻辑

**R2 存储**：

- 响应流量突然增加 > 50%：可能存在大量文件下载或 CDN 缓存失效
- 存储容量增长 > 10GB/天：可能存在异常的大文件上传
- 对象数突然增加 > 50%：可能存在异常的文件生成逻辑

**Workers**：

- 请求数突然增加 > 50%：可能存在流量激增或攻击
- 子请求数与请求数比例 > 10：可能存在 N+1 查询或循环调用

### 5.3 优化建议

**D1 数据库**：

- 添加适当的数据库索引
- 优化查询语句，避免全表扫描
- 使用批量操作减少写入次数
- 引入缓存机制减少读取次数

**R2 存储**：

- 使用 CDN 缓存减少响应流量
- 压缩图片和文件减少存储容量
- 实现文件清理策略定期清理无用文件
- 使用归档策略存储低频访问文件

**Workers**：

- 优化业务逻辑减少子请求数
- 使用批量操作减少 API 调用次数
- 引入缓存机制减少重复请求
- 实现限流策略防止流量激增

## 6. 参考资源

- [Cloudflare Analytics API 文档](https://developers.cloudflare.com/analytics/graphql-api/)
- [Cloudflare D1 文档](https://developers.cloudflare.com/d1/)
- [Cloudflare R2 文档](https://developers.cloudflare.com/r2/)
- [Cloudflare Workers 文档](https://developers.cloudflare.com/workers/)
- [Recharts 文档](https://recharts.org/)
