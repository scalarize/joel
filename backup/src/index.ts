export interface Env {
  DB: D1Database; // 对应 wrangler.jsonc 中的 d1_databases.binding
  BACKUP_BUCKET: R2Bucket; // 对应 wrangler.jsonc 中的 r2_buckets.binding
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    // 1. 生成备份文件名，包含日期以便区分
    const backupKey = `backups/d1-backup-${new Date().toISOString().split('T')[0]}.sql`;

    // 2. 从 D1 创建数据库转储 (SQL格式)
    const dump = await env.DB.dump();

    // 3. 将 SQL 转储上传到 R2 存储桶
    await env.BACKUP_BUCKET.put(backupKey, dump, {
      httpMetadata: {
        contentType: 'application/sql',
      },
      customMetadata: {
        'backup-date': new Date().toISOString(),
        'database-name': 'joel-portal-db'
      }
    });

    // 4. (可选) 这里可以添加通知逻辑，如发送邮件或写入日志
    console.log(`Backup successfully uploaded to ${backupKey}`);
  },
};
