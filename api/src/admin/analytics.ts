/**
 * Cloudflare Analytics API 调用
 * 用于获取 D1、R2、Workers 的用量数据
 */

interface CloudflareAnalyticsResponse {
	data?: {
		viewer?: {
			accounts?: Array<{
				d1Queries?: Array<{
					sum?: {
						readQueries?: number;
						writeQueries?: number;
						rowsRead?: number;
						rowsWritten?: number;
					};
				}>;
				d1Storage?: Array<{
					sum?: {
						bytesStored?: number;
					};
				}>;
				r2Operations?: Array<{
					dimensions?: {
						actionType?: string;
					};
					sum?: {
						requests?: number;
					};
				}>;
				r2Storage?: Array<{
					sum?: {
						bytesStored?: number;
					};
				}>;
				workersInvocations?: Array<{
					sum?: {
						requests?: number;
						cpuTime?: number;
					};
				}>;
			}>;
		};
	};
	errors?: Array<{
		message: string;
	}>;
}

export interface UsageMetrics {
	d1: {
		queries: number;
		rowsRead: number;
		rowsWritten: number;
		storageBytes: number;
	};
	r2: {
		storageBytes: number;
		classAOperations: number; // 写入操作
		classBOperations: number; // 读取操作
	};
	workers: {
		requests: number;
		cpuTimeMs: number;
	};
}

/**
 * 获取 Cloudflare 用量数据
 * @param accountId Cloudflare 账户 ID
 * @param apiToken Cloudflare API Token
 * @param startTime 开始时间（ISO 8601 格式）
 * @param endTime 结束时间（ISO 8601 格式）
 */
export async function getCloudflareUsage(
	accountId: string,
	apiToken: string,
	startTime: string,
	endTime: string
): Promise<UsageMetrics> {
	console.log(`[Analytics] 获取 Cloudflare 用量数据: ${accountId}`);

	// 将 ISO 8601 时间戳转换为日期格式 (YYYY-MM-DD)
	const startDate = new Date(startTime).toISOString().split('T')[0];
	const endDate = new Date(endTime).toISOString().split('T')[0];

	const graphqlQuery = `query GetUsage($accountId: String!, $startDate: Date!, $endDate: Date!) {
  viewer {
    accounts(filter: { accountTag: $accountId }) {
      d1Queries: d1QueriesAdaptiveGroups(
        filter: { date_geq: $startDate, date_leq: $endDate }
        limit: 10000
      ) {
        sum {
          readQueries
          writeQueries
          rowsRead
          rowsWritten
        }
      }
      d1Storage: d1StorageAdaptiveGroups(
        filter: { date_geq: $startDate, date_leq: $endDate }
        limit: 10000
      ) {
        sum {
          bytesStored
        }
      }
      r2Operations: r2OperationsAdaptiveGroups(
        filter: { date_geq: $startDate, date_leq: $endDate }
        limit: 10000
      ) {
        dimensions {
          actionType
        }
        sum {
          requests
        }
      }
      r2Storage: r2StorageAdaptiveGroups(
        filter: { date_geq: $startDate, date_leq: $endDate }
        limit: 10000
      ) {
        sum {
          bytesStored
        }
      }
      workersInvocations: workersInvocationsAdaptiveGroups(
        filter: { date_geq: $startDate, date_leq: $endDate }
        limit: 10000
      ) {
        sum {
          requests
          cpuTime
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

		// 聚合 D1 查询数据
		const d1Queries = account.d1Queries || [];
		const d1QueriesSum = d1Queries.reduce(
			(acc, group) => {
				const sum = group.sum || {};
				return {
					readQueries: (acc.readQueries || 0) + (sum.readQueries || 0),
					writeQueries: (acc.writeQueries || 0) + (sum.writeQueries || 0),
					rowsRead: (acc.rowsRead || 0) + (sum.rowsRead || 0),
					rowsWritten: (acc.rowsWritten || 0) + (sum.rowsWritten || 0),
				};
			},
			{ readQueries: 0, writeQueries: 0, rowsRead: 0, rowsWritten: 0 }
		);

		// 聚合 D1 存储数据
		const d1Storage = account.d1Storage || [];
		const d1StorageSum = d1Storage.reduce(
			(acc, group) => (acc + (group.sum?.bytesStored || 0)),
			0
		);

		// 聚合 R2 操作数据（A类：写入，B类：读取）
		const r2Operations = account.r2Operations || [];
		let classAOperations = 0;
		let classBOperations = 0;
		for (const group of r2Operations) {
			const actionType = group.dimensions?.actionType || '';
			const requests = group.sum?.requests || 0;
			// A类操作：PutObject, CreateMultipartUpload, UploadPart, CompleteMultipartUpload, CopyObject, ListMultipartUploads
			if (actionType.includes('Put') || actionType.includes('Create') || actionType.includes('Upload') || actionType.includes('Copy')) {
				classAOperations += requests;
			} else {
				// B类操作：GetObject, HeadObject, ListObjects, ListObjectsV2, ListBucket, GetBucketLocation
				classBOperations += requests;
			}
		}

		// 聚合 R2 存储数据
		const r2Storage = account.r2Storage || [];
		const r2StorageSum = r2Storage.reduce(
			(acc, group) => (acc + (group.sum?.bytesStored || 0)),
			0
		);

		// 聚合 Workers 调用数据
		const workersInvocations = account.workersInvocations || [];
		const workersSum = workersInvocations.reduce(
			(acc, group) => {
				const sum = group.sum || {};
				return {
					requests: (acc.requests || 0) + (sum.requests || 0),
					cpuTime: (acc.cpuTime || 0) + (sum.cpuTime || 0),
				};
			},
			{ requests: 0, cpuTime: 0 }
		);

		const metrics: UsageMetrics = {
			d1: {
				queries: (d1QueriesSum.readQueries || 0) + (d1QueriesSum.writeQueries || 0),
				rowsRead: d1QueriesSum.rowsRead || 0,
				rowsWritten: d1QueriesSum.rowsWritten || 0,
				storageBytes: d1StorageSum,
			},
			r2: {
				storageBytes: r2StorageSum,
				classAOperations,
				classBOperations,
			},
			workers: {
				requests: workersSum.requests || 0,
				cpuTimeMs: workersSum.cpuTime || 0,
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
			queries: 0,
			rowsRead: 0,
			rowsWritten: 0,
			storageBytes: 0,
		},
		r2: {
			storageBytes: 0,
			classAOperations: 0,
			classBOperations: 0,
		},
		workers: {
			requests: 0,
			cpuTimeMs: 0,
		},
	};
}

