/**
 * Cloudflare Analytics API 调用
 * 用于获取 D1、R2、Workers、KV 的用量数据（按日期分组）
 */

// GraphQL 响应类型定义
interface CloudflareAnalyticsResponse {
	data?: {
		viewer?: {
			accounts?: Array<{
				d1Queries?: Array<{
					dimensions?: { date?: string };
					sum?: {
						rowsRead?: number;
						rowsWritten?: number;
						queryDurationMs?: number;
					};
				}>;
				r2Operation?: Array<{
					dimensions?: { date?: string };
					sum?: {
						requests?: number;
						responseBytes?: number;
					};
				}>;
				r2Storage?: Array<{
					dimensions?: { date?: string };
					max?: {
						objectCount?: number;
						uploadCount?: number;
						payloadSize?: number;
					};
				}>;
				worker?: Array<{
					dimensions?: { date?: string };
					sum?: {
						requests?: number;
						subrequests?: number;
					};
				}>;
				kvStorage?: Array<{
					dimensions?: { date?: string };
					max?: {
						keyCount?: number;
						byteCount?: number;
					};
				}>;
				kvQuery?: Array<{
					dimensions?: { date?: string };
					sum?: {
						requests?: number;
						objectBytes?: number;
					};
				}>;
			}>;
		};
	};
	errors?: Array<{
		message: string;
	}>;
}

// 按日期分组的数据点
export interface DateDataPoint {
	date: string; // YYYY-MM-DD 格式
	value: number;
}

// 用量指标数据结构（按日期分组，用于折线图）
export interface UsageMetrics {
	d1: {
		rowsRead: DateDataPoint[];
		rowsWritten: DateDataPoint[];
		queryDurationMs: DateDataPoint[];
	};
	r2: {
		requests: DateDataPoint[];
		responseBytes: DateDataPoint[];
		objectCount: DateDataPoint[];
		payloadSize: DateDataPoint[];
	};
	workers: {
		requests: DateDataPoint[];
		subrequests: DateDataPoint[];
	};
	kv: {
		keyCount: DateDataPoint[];
		byteCount: DateDataPoint[];
		requests: DateDataPoint[];
		objectBytes: DateDataPoint[];
	};
}

/**
 * 获取 Cloudflare 用量数据（按日期分组）
 * @param accountId Cloudflare 账户 ID
 * @param apiToken Cloudflare API Token
 * @param startDate 开始日期（YYYY-MM-DD 格式）
 * @param endDate 结束日期（YYYY-MM-DD 格式）
 */
export async function getCloudflareUsage(accountId: string, apiToken: string, startDate: string, endDate: string): Promise<UsageMetrics> {
	console.log(`[Analytics] 获取 Cloudflare 用量数据: ${accountId}, 日期范围: ${startDate} ~ ${endDate}`);

	const graphqlQuery = `query GetUsage($accountId: String!, $startDate: Date!, $endDate: Date!) {
  viewer {
    accounts(filter: { accountTag: $accountId }) {
      d1Queries: d1QueriesAdaptiveGroups(
        filter: { date_geq: $startDate, date_leq: $endDate }
        limit: 10000
      ) {
        dimensions { date }
        sum {
          rowsRead
          rowsWritten
          queryDurationMs
        }
      }
      r2Operation: r2OperationsAdaptiveGroups(
        filter: { date_geq: $startDate, date_leq: $endDate }
        limit: 10000
      ) {
        dimensions { date }
        sum {
          requests
          responseBytes
        }
      }
      r2Storage: r2StorageAdaptiveGroups(
        filter: { date_geq: $startDate, date_leq: $endDate }
        limit: 10000
      ) {
        dimensions { date }
        max {
          objectCount
          uploadCount
          payloadSize
        }
      }
      worker: workersInvocationsAdaptive(
        filter: { date_geq: $startDate, date_leq: $endDate }
        limit: 10000
      ) {
        dimensions { date }
        sum {
          requests
          subrequests
        }
      }
      kvStorage: kvStorageAdaptiveGroups(
        filter: { date_geq: $startDate, date_leq: $endDate }
        limit: 10000
      ) {
        dimensions { date }
        max {
          keyCount
          byteCount
        }
      }
      kvQuery: kvOperationsAdaptiveGroups(
        filter: { date_geq: $startDate, date_leq: $endDate }
        limit: 10000
      ) {
        dimensions { date }
        sum {
          requests
          objectBytes
        }
      }
    }
  }
}`;

	try {
		const response = await fetch('https://api.cloudflare.com/client/v4/graphql', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${apiToken}`,
			},
			body: JSON.stringify({
				query: graphqlQuery,
				variables: {
					accountId,
					startDate,
					endDate,
				},
			}),
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error(`[Analytics] API 请求失败: ${response.status} ${errorText}`);
			throw new Error(`Cloudflare API 请求失败: ${response.status}`);
		}

		const data: CloudflareAnalyticsResponse = await response.json();

		if (data.errors && data.errors.length > 0) {
			console.error(`[Analytics] GraphQL 错误:`, data.errors);
			throw new Error(`GraphQL 错误: ${data.errors.map((e) => e.message).join(', ')}`);
		}

		const account = data.data?.viewer?.accounts?.[0];
		if (!account) {
			console.warn(`[Analytics] 未找到账户数据`);
			return getEmptyMetrics();
		}

		// 处理 D1 数据
		const d1Queries = account.d1Queries || [];
		const d1RowsRead: DateDataPoint[] = [];
		const d1RowsWritten: DateDataPoint[] = [];
		const d1QueryDurationMs: DateDataPoint[] = [];

		for (const item of d1Queries) {
			const date = item.dimensions?.date || '';
			if (date) {
				d1RowsRead.push({ date, value: item.sum?.rowsRead || 0 });
				d1RowsWritten.push({ date, value: item.sum?.rowsWritten || 0 });
				d1QueryDurationMs.push({ date, value: item.sum?.queryDurationMs || 0 });
			}
		}

		// 处理 R2 操作数据
		const r2Operation = account.r2Operation || [];
		const r2Requests: DateDataPoint[] = [];
		const r2ResponseBytes: DateDataPoint[] = [];

		for (const item of r2Operation) {
			const date = item.dimensions?.date || '';
			if (date) {
				r2Requests.push({ date, value: item.sum?.requests || 0 });
				r2ResponseBytes.push({ date, value: item.sum?.responseBytes || 0 });
			}
		}

		// 处理 R2 存储数据
		const r2Storage = account.r2Storage || [];
		const r2ObjectCount: DateDataPoint[] = [];
		const r2PayloadSize: DateDataPoint[] = [];

		for (const item of r2Storage) {
			const date = item.dimensions?.date || '';
			if (date) {
				r2ObjectCount.push({ date, value: item.max?.objectCount || 0 });
				r2PayloadSize.push({ date, value: item.max?.payloadSize || 0 });
			}
		}

		// 处理 Workers 数据
		const worker = account.worker || [];
		const workerRequests: DateDataPoint[] = [];
		const workerSubrequests: DateDataPoint[] = [];

		for (const item of worker) {
			const date = item.dimensions?.date || '';
			if (date) {
				workerRequests.push({ date, value: item.sum?.requests || 0 });
				workerSubrequests.push({ date, value: item.sum?.subrequests || 0 });
			}
		}

		// 处理 KV 存储数据
		const kvStorage = account.kvStorage || [];
		const kvKeyCount: DateDataPoint[] = [];
		const kvByteCount: DateDataPoint[] = [];

		for (const item of kvStorage) {
			const date = item.dimensions?.date || '';
			if (date) {
				kvKeyCount.push({ date, value: item.max?.keyCount || 0 });
				kvByteCount.push({ date, value: item.max?.byteCount || 0 });
			}
		}

		// 处理 KV 操作数据
		const kvQuery = account.kvQuery || [];
		const kvRequests: DateDataPoint[] = [];
		const kvObjectBytes: DateDataPoint[] = [];

		for (const item of kvQuery) {
			const date = item.dimensions?.date || '';
			if (date) {
				kvRequests.push({ date, value: item.sum?.requests || 0 });
				kvObjectBytes.push({ date, value: item.sum?.objectBytes || 0 });
			}
		}

		// 按日期排序
		const sortByDate = (a: DateDataPoint, b: DateDataPoint) => a.date.localeCompare(b.date);
		d1RowsRead.sort(sortByDate);
		d1RowsWritten.sort(sortByDate);
		d1QueryDurationMs.sort(sortByDate);
		r2Requests.sort(sortByDate);
		r2ResponseBytes.sort(sortByDate);
		r2ObjectCount.sort(sortByDate);
		r2PayloadSize.sort(sortByDate);
		workerRequests.sort(sortByDate);
		workerSubrequests.sort(sortByDate);
		kvKeyCount.sort(sortByDate);
		kvByteCount.sort(sortByDate);
		kvRequests.sort(sortByDate);
		kvObjectBytes.sort(sortByDate);

		const metrics: UsageMetrics = {
			d1: {
				rowsRead: d1RowsRead,
				rowsWritten: d1RowsWritten,
				queryDurationMs: d1QueryDurationMs,
			},
			r2: {
				requests: r2Requests,
				responseBytes: r2ResponseBytes,
				objectCount: r2ObjectCount,
				payloadSize: r2PayloadSize,
			},
			workers: {
				requests: workerRequests,
				subrequests: workerSubrequests,
			},
			kv: {
				keyCount: kvKeyCount,
				byteCount: kvByteCount,
				requests: kvRequests,
				objectBytes: kvObjectBytes,
			},
		};

		console.log(`[Analytics] 用量数据获取成功`);
		return metrics;
	} catch (error) {
		console.error(`[Analytics] 获取用量数据失败:`, error);
		throw error;
	}
}

/**
 * 返回空的用量数据（用于错误情况）
 */
function getEmptyMetrics(): UsageMetrics {
	return {
		d1: {
			rowsRead: [],
			rowsWritten: [],
			queryDurationMs: [],
		},
		r2: {
			requests: [],
			responseBytes: [],
			objectCount: [],
			payloadSize: [],
		},
		workers: {
			requests: [],
			subrequests: [],
		},
		kv: {
			keyCount: [],
			byteCount: [],
			requests: [],
			objectBytes: [],
		},
	};
}
