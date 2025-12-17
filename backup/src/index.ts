export interface Env {
	DB: D1Database;
	BACKUP_BUCKET: R2Bucket;
}

/**
 * 备份保留策略：保留最近 N 天的备份
 */
const BACKUP_RETENTION_DAYS = 30;

/**
 * 生成备份文件名（包含日期和时间戳，避免冲突）
 */
function generateBackupKey(compressed: boolean = true): string {
	const now = new Date();
	const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
	const timeStr = now.toISOString().split('T')[1].split('.')[0].replace(/:/g, '-'); // HH-MM-SS
	const ext = compressed ? 'sql.gz' : 'sql';
	return `backups/d1-backup-${dateStr}T${timeStr}Z.${ext}`;
}

/**
 * 通过 SQL 查询导出数据库（替代 dump() 方法）
 */
async function exportDatabaseAsSQL(db: D1Database): Promise<string> {
	const sql: string[] = [];

	// 1. 获取所有表名
	const tablesResult = await db
		.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' and name NOT like '_%'")
		.all<{ name: string }>();

	if (!tablesResult.results || tablesResult.results.length === 0) {
		return '-- 数据库为空\n';
	}

	// 2. 对每个表导出数据
	for (const table of tablesResult.results) {
		const tableName = table.name;

		// 获取表结构
		const schemaResult = await db
			.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`)
			.bind(tableName)
			.first<{ sql: string }>();

		if (schemaResult?.sql) {
			sql.push(`-- Table: ${tableName}`);
			sql.push(schemaResult.sql + ';');
			sql.push('');
		}

		// 导出数据
		const dataResult = await db.prepare(`SELECT * FROM ${tableName}`).all();

		if (dataResult.results && dataResult.results.length > 0) {
			sql.push(`-- Data for table: ${tableName}`);

			for (const row of dataResult.results) {
				const columns = Object.keys(row);
				const values = columns.map((col) => {
					const value = row[col];
					if (value === null) return 'NULL';
					if (typeof value === 'string') {
						// 转义单引号
						return `'${value.replace(/'/g, "''")}'`;
					}
					return String(value);
				});

				sql.push(`INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${values.join(', ')});`);
			}
			sql.push('');
		}
	}

	return sql.join('\n');
}

/**
 * 压缩 ArrayBuffer 数据（使用 gzip）
 */
async function compressData(data: ArrayBuffer): Promise<ArrayBuffer> {
	const stream = new CompressionStream('gzip');
	const writer = stream.writable.getWriter();
	const reader = stream.readable.getReader();

	// 写入数据（需要转换为 Uint8Array）
	writer.write(new Uint8Array(data));
	writer.close();

	// 读取压缩后的数据
	const chunks: Uint8Array[] = [];
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value);
	}

	// 合并所有 chunks
	const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
	const result = new Uint8Array(totalLength);
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.length;
	}

	return result.buffer;
}

/**
 * 清理旧备份（保留最近 N 天的备份）
 */
async function cleanupOldBackups(bucket: R2Bucket, retentionDays: number): Promise<void> {
	try {
		const cutoffDate = new Date();
		cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
		const cutoffPrefix = `backups/d1-backup-${cutoffDate.toISOString().split('T')[0]}`;

		// 列出所有备份文件（包括 .sql 和 .sql.gz）
		const listResult = await bucket.list({
			prefix: 'backups/d1-backup-',
		});

		const keysToDelete: string[] = [];

		for (const object of listResult.objects) {
			// 跳过失败日志文件
			if (object.key.includes('failed-')) {
				continue;
			}
			// 如果文件日期早于保留期限，标记为删除
			if (object.key < cutoffPrefix) {
				keysToDelete.push(object.key);
			}
		}

		// 批量删除旧备份
		if (keysToDelete.length > 0) {
			await bucket.delete(keysToDelete);
			console.log(`[Backup] 删除了 ${keysToDelete.length} 个旧备份文件`);
		}
	} catch (error) {
		// 清理失败不应该影响备份流程，只记录错误
		console.error('[Backup] 清理旧备份失败:', error);
	}
}

export default {
	async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
		const startTime = Date.now();
		let backupKey = '';

		try {
			console.log('[Backup] 开始备份 D1 数据库...');

			// 1. 生成备份文件名（压缩格式）
			backupKey = generateBackupKey(true);
			console.log(`[Backup] 备份文件: ${backupKey}`);

			// 2. 从 D1 导出数据库（使用 SQL 查询方式，因为 dump() 已废弃）
			console.log('[Backup] 正在导出数据库...');
			const sqlDump = await exportDatabaseAsSQL(env.DB);

			if (!sqlDump || sqlDump.length === 0) {
				throw new Error('数据库导出为空');
			}

			// 将 SQL 字符串转换为 ArrayBuffer
			const encoder = new TextEncoder();
			const dump = encoder.encode(sqlDump).buffer;

			const originalSizeMB = (dump.byteLength / (1024 * 1024)).toFixed(2);
			console.log(`[Backup] 数据库导出成功，原始大小: ${originalSizeMB} MB`);

			// 3. 压缩备份数据
			console.log('[Backup] 正在压缩备份...');
			const compressedDump = await compressData(dump);
			const compressedSizeMB = (compressedDump.byteLength / (1024 * 1024)).toFixed(2);
			const compressionRatio = ((1 - compressedDump.byteLength / dump.byteLength) * 100).toFixed(1);
			console.log(`[Backup] 压缩完成，压缩后大小: ${compressedSizeMB} MB (压缩率: ${compressionRatio}%)`);

			// 4. 将压缩后的 SQL 转储上传到 R2 存储桶
			console.log('[Backup] 正在上传到 R2...');
			const uploadResult = await env.BACKUP_BUCKET.put(backupKey, compressedDump, {
				httpMetadata: {
					contentType: 'application/gzip',
					contentEncoding: 'gzip',
				},
				customMetadata: {
					'backup-date': new Date().toISOString(),
					'database-name': 'joel-db',
					'original-size-bytes': dump.byteLength.toString(),
					'compressed-size-bytes': compressedDump.byteLength.toString(),
					'compression-ratio': compressionRatio,
					'scheduled-event-id': event.scheduledTime.toString(),
				},
			});

			if (!uploadResult) {
				throw new Error('R2 上传返回 null');
			}

			const duration = ((Date.now() - startTime) / 1000).toFixed(2);
			console.log(
				`[Backup] 备份成功完成: ${backupKey} (原始: ${originalSizeMB} MB, 压缩后: ${compressedSizeMB} MB, 压缩率: ${compressionRatio}%, 耗时: ${duration}s)`
			);

			// 5. 清理旧备份（异步执行，不阻塞）
			ctx.waitUntil(cleanupOldBackups(env.BACKUP_BUCKET, BACKUP_RETENTION_DAYS));
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			console.error(`[Backup] 备份失败: ${errorMessage}`, error);

			// 记录失败的备份信息
			if (backupKey) {
				try {
					const logContent = JSON.stringify(
						{
							error: errorMessage,
							timestamp: new Date().toISOString(),
							backupKey,
						},
						null,
						2
					);
					await env.BACKUP_BUCKET.put(`backups/failed-${Date.now()}.log`, logContent, {
						httpMetadata: {
							contentType: 'application/json',
						},
					});
				} catch (logError) {
					console.error('[Backup] 记录失败日志也失败了:', logError);
				}
			}

			// 重新抛出错误，让 Cloudflare 记录到日志
			throw error;
		}
	},
};
