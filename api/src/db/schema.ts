/**
 * 数据库 Schema 定义和初始化
 * 
 * 架构说明：
 * - 当前：单一 Google OAuth 支持，users.id 直接使用 Google user ID
 * - 未来扩展：如需支持多 OAuth 提供商，需要：
 *   1. 将 users.id 改为内部 UUID
 *   2. 创建 oauth_accounts 表存储不同 OAuth 账号
 *   3. 通过 email 字段关联同一用户的不同 OAuth 账号
 * 详见：docs/multi-oauth-architecture.md
 */

export interface User {
	id: string; // 当前：Google user ID；未来扩展：内部 UUID（需迁移）
	email: string; // 用于多 OAuth 账号关联的关键字段（UNIQUE）
	name: string; // 显示名称（用户可自定义覆盖）
	picture?: string; // 头像 URL（用户可自定义覆盖）
	last_logout_at?: string; // 最后登出时间（用于令牌失效检查）
	created_at: string;
	updated_at: string;
}

/**
 * 初始化数据库表结构
 * 需要在首次部署时手动执行，或通过 migration 执行
 */
export const INIT_SQL = `
CREATE TABLE IF NOT EXISTS users (
	id TEXT PRIMARY KEY,
	email TEXT NOT NULL UNIQUE,
	name TEXT NOT NULL,
	picture TEXT,
	last_logout_at TEXT,
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_last_logout_at ON users(last_logout_at);
`;

/**
 * 创建或更新用户信息
 */
export async function upsertUser(
	db: D1Database,
	user: {
		id: string;
		email: string;
		name: string;
		picture?: string;
	}
): Promise<User> {
	console.log(`[数据库] 开始创建或更新用户: ${user.email}`);

	const now = new Date().toISOString();
	const result = await db
		.prepare(
			`
		INSERT INTO users (id, email, name, picture, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			email = excluded.email,
			name = excluded.name,
			picture = excluded.picture,
			updated_at = excluded.updated_at
		RETURNING *
	`
		)
		.bind(user.id, user.email, user.name, user.picture || null, now, now)
		.first<User>();

	if (!result) {
		throw new Error(`[数据库] 创建或更新用户失败: ${user.email}`);
	}

	console.log(`[数据库] 用户创建或更新成功: ${user.email}`);
	return result;
}

/**
 * 根据 ID 查询用户
 */
export async function getUserById(
	db: D1Database,
	userId: string
): Promise<User | null> {
	console.log(`[数据库] 查询用户: ${userId}`);
	const result = await db
		.prepare('SELECT * FROM users WHERE id = ?')
		.bind(userId)
		.first<User>();

	if (result) {
		console.log(`[数据库] 找到用户: ${result.email}`);
	} else {
		console.log(`[数据库] 未找到用户: ${userId}`);
	}

	return result || null;
}

/**
 * 根据邮箱查询用户
 */
export async function getUserByEmail(
	db: D1Database,
	email: string
): Promise<User | null> {
	console.log(`[数据库] 根据邮箱查询用户: ${email}`);
	const result = await db
		.prepare('SELECT * FROM users WHERE email = ?')
		.bind(email)
		.first<User>();

	if (result) {
		console.log(`[数据库] 找到用户: ${result.id}`);
	} else {
		console.log(`[数据库] 未找到用户: ${email}`);
	}

	return result || null;
}

/**
 * 更新用户 Profile（名称和头像）
 * 注意：这会直接覆盖 name 和 picture，不会保留 OAuth 原始值
 * 如果用户想恢复，可以重新登录（OAuth 会重新获取原始值）
 */
export async function updateUserProfile(
	db: D1Database,
	userId: string,
	profile: {
		name?: string | null;
		picture?: string | null;
	}
): Promise<User> {
	console.log(`[数据库] 更新用户 Profile: ${userId}`);

	const now = new Date().toISOString();
	const updates: string[] = [];
	const values: unknown[] = [];

	if (profile.name !== undefined) {
		updates.push('name = ?');
		values.push(profile.name);
	}

	if (profile.picture !== undefined) {
		updates.push('picture = ?');
		values.push(profile.picture);
	}

	if (updates.length === 0) {
		throw new Error('[数据库] 没有要更新的字段');
	}

	updates.push('updated_at = ?');
	values.push(now);
	values.push(userId);

	const sql = `UPDATE users SET ${updates.join(', ')} WHERE id = ? RETURNING *`;
	const result = await db.prepare(sql).bind(...values).first<User>();

	if (!result) {
		throw new Error(`[数据库] 更新用户 Profile 失败: ${userId}`);
	}

	console.log(`[数据库] 用户 Profile 更新成功: ${userId}`);
	return result;
}

/**
 * 更新用户最后登出时间
 */
export async function updateUserLastLogout(db: D1Database, userId: string): Promise<void> {
	console.log(`[数据库] 更新用户最后登出时间: ${userId}`);
	const now = new Date().toISOString();
	
	await db
		.prepare('UPDATE users SET last_logout_at = ?, updated_at = ? WHERE id = ?')
		.bind(now, now, userId)
		.run();
	
	console.log(`[数据库] 用户最后登出时间已更新: ${userId}`);
}

/**
 * 获取用户最后登出时间
 */
export async function getUserLastLogout(db: D1Database, userId: string): Promise<string | null> {
	const result = await db
		.prepare('SELECT last_logout_at FROM users WHERE id = ?')
		.bind(userId)
		.first<{ last_logout_at: string | null }>();
	
	return result?.last_logout_at || null;
}

