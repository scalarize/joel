/**
 * 数据库 Schema 定义和初始化
 */

export interface User {
	id: string; // Google user ID
	email: string;
	name: string;
	picture?: string;
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
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
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

