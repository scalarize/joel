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
	password_hash?: string; // 密码哈希（可选，用户可以通过 OAuth 或密码登录）
	password_must_change?: number; // 是否需要修改密码（0 或 1，邀请用户时设置为 1）
	is_banned?: number; // 是否被封禁（0 或 1，1 表示已封禁）
	last_login_at?: string; // 最后登录时间
	created_at: string;
	updated_at: string;
}

export interface OAuthAccount {
	id: string;
	user_id: string;
	provider: 'google' | 'password';
	provider_user_id: string;
	email: string | null;
	name: string | null;
	picture: string | null;
	access_token: string | null;
	refresh_token: string | null;
	token_expires_at: string | null;
	linked_at: string;
	linked_method: 'auto' | 'manual';
	created_at: string;
	updated_at: string;
}

export interface UserModulePermission {
	id: string;
	user_id: string;
	module_id: string; // 'profile' | 'favor' | 'gd' | 'admin'
	granted_at: string;
	granted_by: string | null; // 授权管理员 ID
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
	last_login_at TEXT,
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_last_login_at ON users(last_login_at);
`;

/**
 * 创建或更新用户信息
 * 注意：对于已存在的用户，不会覆盖用户自定义的 name 和 picture
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

	// 先检查用户是否存在
	const existingUser = await getUserById(db, user.id);

	if (existingUser) {
		// 用户已存在，只更新 email（如果需要），保留用户自定义的 name 和 picture
		console.log(`[数据库] 用户已存在，保留自定义字段，仅更新 email`);
		console.log(`[数据库] 保留的 name: ${existingUser.name}, picture: ${existingUser.picture || 'null'}`);
		console.log(`[数据库] OAuth 返回的 name: ${user.name}, picture: ${user.picture || 'null'}`);

		const result = await db
			.prepare(
				`
			UPDATE users 
			SET email = ?, updated_at = ?
			WHERE id = ?
			RETURNING *
		`
			)
			.bind(user.email, now, user.id)
			.first<User>();

		if (!result) {
			throw new Error(`[数据库] 更新用户失败: ${user.email}`);
		}

		console.log(`[数据库] 用户更新成功（保留自定义字段）: ${user.email}`);
		console.log(`[数据库] 更新后的 name: ${result.name}, picture: ${result.picture || 'null'}`);
		return result;
	} else {
		// 新用户，创建时设置所有字段
		console.log(`[数据库] 创建新用户`);
		const result = await db
			.prepare(
				`
			INSERT INTO users (id, email, name, picture, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?)
			RETURNING *
		`
			)
			.bind(user.id, user.email, user.name, user.picture || null, now, now)
			.first<User>();

		if (!result) {
			throw new Error(`[数据库] 创建用户失败: ${user.email}`);
		}

		console.log(`[数据库] 用户创建成功: ${user.email}`);
		return result;
	}
}

/**
 * 根据 ID 查询用户
 */
export async function getUserById(db: D1Database, userId: string): Promise<User | null> {
	console.log(`[数据库] 查询用户: ${userId}`);
	const result = await db.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first<User>();

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
export async function getUserByEmail(db: D1Database, email: string): Promise<User | null> {
	console.log(`[数据库] 根据邮箱查询用户: ${email}`);
	const result = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<User>();

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
	const result = await db
		.prepare(sql)
		.bind(...values)
		.first<User>();

	if (!result) {
		throw new Error(`[数据库] 更新用户 Profile 失败: ${userId}`);
	}

	console.log(`[数据库] 用户 Profile 更新成功: ${userId}`);
	return result;
}

/**
 * 获取所有用户列表（按最后登录时间排序，从未登录的用户排在最后）
 */
export async function getAllUsers(db: D1Database): Promise<User[]> {
	console.log(`[数据库] 查询所有用户列表`);

	try {
		// SQLite 不支持 NULLS LAST，使用 CASE 语句处理
		const result = await db
			.prepare(
				`
				SELECT * FROM users 
				ORDER BY 
					CASE WHEN last_login_at IS NULL THEN 1 ELSE 0 END,
					last_login_at DESC,
					created_at DESC
			`
			)
			.all<User>();

		const users = result.results || [];
		console.log(`[数据库] 找到 ${users.length} 个用户`);
		return users;
	} catch (error) {
		// 如果 last_login_at 字段不存在，回退到按 created_at 排序
		console.warn(`[数据库] 查询用户列表时出错，可能是 last_login_at 字段不存在，使用回退查询:`, error);
		const result = await db.prepare('SELECT * FROM users ORDER BY created_at DESC').all<User>();

		const users = result.results || [];
		console.log(`[数据库] 使用回退查询找到 ${users.length} 个用户`);
		return users;
	}
}

/**
 * 根据 OAuth 提供商和提供商用户 ID 查询 OAuth 账号
 */
export async function getOAuthAccountByProvider(
	db: D1Database,
	provider: 'google' | 'password',
	providerUserId: string
): Promise<OAuthAccount | null> {
	console.log(`[数据库] 查询 OAuth 账号: ${provider}/${providerUserId}`);
	const result = await db
		.prepare('SELECT * FROM oauth_accounts WHERE provider = ? AND provider_user_id = ?')
		.bind(provider, providerUserId)
		.first<OAuthAccount>();

	if (result) {
		console.log(`[数据库] 找到 OAuth 账号，关联到用户: ${result.user_id}`);
	} else {
		console.log(`[数据库] 未找到 OAuth 账号: ${provider}/${providerUserId}`);
	}

	return result || null;
}

/**
 * 根据用户 ID 查询所有关联的 OAuth 账号
 */
export async function getOAuthAccountsByUserId(db: D1Database, userId: string): Promise<OAuthAccount[]> {
	console.log(`[数据库] 查询用户的所有 OAuth 账号: ${userId}`);
	const result = await db
		.prepare('SELECT * FROM oauth_accounts WHERE user_id = ? ORDER BY linked_at DESC')
		.bind(userId)
		.all<OAuthAccount>();

	const accounts = result.results || [];
	console.log(`[数据库] 找到 ${accounts.length} 个 OAuth 账号`);
	return accounts;
}

/**
 * 关联 OAuth 账号到用户
 */
export async function linkOAuthAccount(
	db: D1Database,
	userId: string,
	oauthData: {
		provider: 'google' | 'password';
		provider_user_id: string;
		email: string | null;
		name: string | null;
		picture: string | null;
		access_token?: string | null;
		refresh_token?: string | null;
		token_expires_at?: string | null;
	},
	linkedMethod: 'auto' | 'manual' = 'auto'
): Promise<OAuthAccount> {
	console.log(`[数据库] 关联 OAuth 账号到用户: ${userId}, 提供商: ${oauthData.provider}`);

	const now = new Date().toISOString();
	const oauthAccountId = crypto.randomUUID();

	// 检查是否已存在该 OAuth 账号
	const existing = await getOAuthAccountByProvider(db, oauthData.provider, oauthData.provider_user_id);
	if (existing) {
		// 更新现有 OAuth 账号
		console.log(`[数据库] OAuth 账号已存在，更新信息`);
		const result = await db
			.prepare(
				`
				UPDATE oauth_accounts 
				SET user_id = ?, email = ?, name = ?, picture = ?, 
				    access_token = ?, refresh_token = ?, token_expires_at = ?,
				    linked_method = ?, updated_at = ?
				WHERE provider = ? AND provider_user_id = ?
				RETURNING *
			`
			)
			.bind(
				userId,
				oauthData.email,
				oauthData.name,
				oauthData.picture,
				oauthData.access_token || null,
				oauthData.refresh_token || null,
				oauthData.token_expires_at || null,
				linkedMethod,
				now,
				oauthData.provider,
				oauthData.provider_user_id
			)
			.first<OAuthAccount>();

		if (!result) {
			throw new Error(`[数据库] 更新 OAuth 账号失败`);
		}

		console.log(`[数据库] OAuth 账号更新成功`);
		return result;
	}

	// 创建新的 OAuth 账号记录
	const result = await db
		.prepare(
			`
			INSERT INTO oauth_accounts 
			(id, user_id, provider, provider_user_id, email, name, picture,
			 access_token, refresh_token, token_expires_at, linked_at, linked_method, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			RETURNING *
		`
		)
		.bind(
			oauthAccountId,
			userId,
			oauthData.provider,
			oauthData.provider_user_id,
			oauthData.email,
			oauthData.name,
			oauthData.picture,
			oauthData.access_token || null,
			oauthData.refresh_token || null,
			oauthData.token_expires_at || null,
			now,
			linkedMethod,
			now,
			now
		)
		.first<OAuthAccount>();

	if (!result) {
		throw new Error(`[数据库] 创建 OAuth 账号失败`);
	}

	console.log(`[数据库] OAuth 账号创建成功`);
	return result;
}

/**
 * 通过邮箱查找或创建用户（支持自动关联）
 * 如果找到相同邮箱的用户，将 OAuth 账号关联到该用户
 * 如果找不到，创建新用户
 */
export async function findOrCreateUserByEmail(
	db: D1Database,
	email: string,
	oauthData: {
		provider: 'google' | 'password';
		provider_user_id: string;
		name: string;
		picture?: string | null;
		access_token?: string | null;
		refresh_token?: string | null;
		token_expires_at?: string | null;
	}
): Promise<{ user: User; isNewUser: boolean; linkedMethod: 'auto' | 'manual' }> {
	console.log(`[数据库] 通过邮箱查找或创建用户: ${email}`);

	// 检查该 OAuth 账号是否已关联到其他用户
	const existingOAuth = await getOAuthAccountByProvider(db, oauthData.provider, oauthData.provider_user_id);
	if (existingOAuth) {
		// OAuth 账号已存在，返回关联的用户
		const user = await getUserById(db, existingOAuth.user_id);
		if (!user) {
			throw new Error(`[数据库] OAuth 账号关联的用户不存在: ${existingOAuth.user_id}`);
		}
		console.log(`[数据库] OAuth 账号已关联到用户: ${user.id}`);
		return { user, isNewUser: false, linkedMethod: existingOAuth.linked_method };
	}

	// 查找是否存在相同邮箱的用户
	const existingUser = await getUserByEmail(db, email);
	if (existingUser) {
		// 找到相同邮箱的用户，自动关联 OAuth 账号
		console.log(`[数据库] 找到相同邮箱的用户，自动关联 OAuth 账号`);
		await linkOAuthAccount(
			db,
			existingUser.id,
			{
				provider: oauthData.provider,
				provider_user_id: oauthData.provider_user_id,
				email: email,
				name: oauthData.name,
				picture: oauthData.picture,
				access_token: oauthData.access_token,
				refresh_token: oauthData.refresh_token,
				token_expires_at: oauthData.token_expires_at,
			},
			'auto'
		);
		return { user: existingUser, isNewUser: false, linkedMethod: 'auto' };
	}

	// 未找到相同邮箱的用户，创建新用户
	// 注意：当前架构下，users.id 仍然使用 provider_user_id（向后兼容）
	// 未来可以改为 UUID
	console.log(`[数据库] 未找到相同邮箱的用户，创建新用户`);
	const newUser = await upsertUser(db, {
		id: oauthData.provider_user_id, // 暂时使用 provider_user_id
		email: email,
		name: oauthData.name,
		picture: oauthData.picture || undefined,
	});

	// 创建 OAuth 账号记录
	await linkOAuthAccount(
		db,
		newUser.id,
		{
			provider: oauthData.provider,
			provider_user_id: oauthData.provider_user_id,
			email: email,
			name: oauthData.name,
			picture: oauthData.picture,
			access_token: oauthData.access_token,
			refresh_token: oauthData.refresh_token,
			token_expires_at: oauthData.token_expires_at,
		},
		'manual'
	);

	return { user: newUser, isNewUser: true, linkedMethod: 'manual' };
}

/**
 * 解绑 OAuth 账号
 * 注意：需要确保用户至少保留一个 OAuth 账号
 */
export async function unlinkOAuthAccount(db: D1Database, userId: string, provider: 'google' | 'password'): Promise<void> {
	console.log(`[数据库] 解绑 OAuth 账号: ${userId}/${provider}`);

	// 检查用户是否还有其他 OAuth 账号
	const accounts = await getOAuthAccountsByUserId(db, userId);
	if (accounts.length <= 1) {
		throw new Error(`[数据库] 无法解绑最后一个 OAuth 账号`);
	}

	// 删除 OAuth 账号记录
	await db.prepare('DELETE FROM oauth_accounts WHERE user_id = ? AND provider = ?').bind(userId, provider).run();

	console.log(`[数据库] OAuth 账号解绑成功`);
}

/**
 * 更新 OAuth 账号的 user_id（用于账号合并）
 */
export async function updateOAuthAccountUserId(db: D1Database, oauthAccountId: string, newUserId: string): Promise<void> {
	console.log(`[数据库] 更新 OAuth 账号的 user_id: ${oauthAccountId} -> ${newUserId}`);

	const now = new Date().toISOString();
	await db.prepare('UPDATE oauth_accounts SET user_id = ?, updated_at = ? WHERE id = ?').bind(newUserId, now, oauthAccountId).run();

	console.log(`[数据库] OAuth 账号 user_id 更新成功`);
}

/**
 * 删除用户（用于账号合并）
 * 注意：由于外键 CASCADE，关联的 oauth_accounts 会自动删除
 */
export async function deleteUser(db: D1Database, userId: string): Promise<void> {
	console.log(`[数据库] 删除用户: ${userId}`);

	await db.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();

	console.log(`[数据库] 用户删除成功`);
}

/**
 * 更新用户密码
 */
export async function updateUserPassword(db: D1Database, userId: string, passwordHash: string, mustChange: boolean = false): Promise<void> {
	console.log(`[数据库] 更新用户密码: ${userId}, 必须修改: ${mustChange}`);

	const now = new Date().toISOString();
	await db
		.prepare('UPDATE users SET password_hash = ?, password_must_change = ?, updated_at = ? WHERE id = ?')
		.bind(passwordHash, mustChange ? 1 : 0, now, userId)
		.run();

	console.log(`[数据库] 用户密码更新成功`);
}

/**
 * 邀请用户（创建用户并设置临时密码）
 * 注意：如果用户已存在，只更新密码和 must_change 标志
 */
export async function inviteUser(db: D1Database, email: string, name: string, passwordHash: string): Promise<User> {
	console.log(`[数据库] 邀请用户: ${email}`);

	const now = new Date().toISOString();

	// 检查用户是否已存在
	const existingUser = await getUserByEmail(db, email);
	if (existingUser) {
		// 用户已存在，更新密码并设置必须修改标志
		console.log(`[数据库] 用户已存在，更新密码和 must_change 标志`);
		await updateUserPassword(db, existingUser.id, passwordHash, true);

		// 更新用户信息
		await db
			.prepare('UPDATE users SET name = ?, password_must_change = 1, updated_at = ? WHERE id = ?')
			.bind(name, now, existingUser.id)
			.run();

		// 返回更新后的用户
		const updatedUser = await getUserById(db, existingUser.id);
		if (!updatedUser) {
			throw new Error(`[数据库] 更新用户失败: ${email}`);
		}
		return updatedUser;
	}

	// 创建新用户
	let userId: string;
	let attempts = 0;
	do {
		userId = crypto.randomUUID();
		const existing = await getUserById(db, userId);
		if (!existing) {
			break;
		}
		attempts++;
		if (attempts > 10) {
			throw new Error('[数据库] 生成用户 ID 失败，重试次数过多');
		}
	} while (true);

	const result = await db
		.prepare(
			`
			INSERT INTO users (id, email, name, password_hash, password_must_change, created_at, updated_at)
			VALUES (?, ?, ?, ?, 1, ?, ?)
			RETURNING *
		`
		)
		.bind(userId, email, name, passwordHash, now, now)
		.first<User>();

	if (!result) {
		throw new Error(`[数据库] 邀请用户失败: ${email}`);
	}

	console.log(`[数据库] 用户邀请成功: ${email}`);
	return result;
}

/**
 * 获取用户的所有模块授权
 */
export async function getUserModulePermissions(db: D1Database, userId: string): Promise<UserModulePermission[]> {
	console.log(`[数据库] 查询用户模块授权: ${userId}`);
	const result = await db.prepare('SELECT * FROM user_module_permissions WHERE user_id = ?').bind(userId).all<UserModulePermission>();

	return result.results || [];
}

/**
 * 检查用户是否有某个模块的访问权限
 * profile 模块所有人可访问，admin 模块只有管理员可访问
 * 管理员自动拥有所有模块的访问权限
 */
export async function hasModulePermission(db: D1Database, userId: string, moduleId: string, isAdmin: boolean): Promise<boolean> {
	// 管理员自动拥有所有模块的访问权限
	if (isAdmin) {
		return true;
	}

	// profile 模块所有人可访问
	if (moduleId === 'profile') {
		return true;
	}

	// admin 模块只有管理员可访问
	if (moduleId === 'admin') {
		return false; // 非管理员不能访问
	}

	// mini-games 模块所有人可访问（包括未登录用户，不需要检查授权）
	if (moduleId === 'mini-games') {
		return true;
	}

	// 需要权限授权的模块需要检查授权（使用全局配置）
	const { isPermissionRequiredModule } = await import('../modules');
	if (isPermissionRequiredModule(moduleId)) {
		const result = await db
			.prepare('SELECT 1 FROM user_module_permissions WHERE user_id = ? AND module_id = ?')
			.bind(userId, moduleId)
			.first();

		return !!result;
	}

	// 未知模块默认不允许访问
	return false;
}

/**
 * 授予用户模块权限
 */
export async function grantModulePermission(
	db: D1Database,
	userId: string,
	moduleId: string,
	grantedBy: string | null = null
): Promise<UserModulePermission> {
	console.log(`[数据库] 授予用户模块权限: ${userId} -> ${moduleId}`);

	const now = new Date().toISOString();
	const id = crypto.randomUUID();

	const result = await db
		.prepare(
			`
			INSERT INTO user_module_permissions (id, user_id, module_id, granted_at, granted_by, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(user_id, module_id) DO UPDATE SET
				granted_at = ?,
				granted_by = ?,
				updated_at = ?
			RETURNING *
		`
		)
		.bind(id, userId, moduleId, now, grantedBy, now, now, now, grantedBy, now)
		.first<UserModulePermission>();

	if (!result) {
		throw new Error(`[数据库] 授予用户模块权限失败: ${userId} -> ${moduleId}`);
	}

	console.log(`[数据库] 用户模块权限授予成功: ${userId} -> ${moduleId}`);
	return result;
}

/**
 * 撤销用户模块权限
 */
export async function revokeModulePermission(db: D1Database, userId: string, moduleId: string): Promise<void> {
	console.log(`[数据库] 撤销用户模块权限: ${userId} -> ${moduleId}`);

	await db.prepare('DELETE FROM user_module_permissions WHERE user_id = ? AND module_id = ?').bind(userId, moduleId).run();

	console.log(`[数据库] 用户模块权限撤销成功: ${userId} -> ${moduleId}`);
}

/**
 * 获取所有用户的模块权限（用于管理员界面）
 */
export async function getAllUserModulePermissions(db: D1Database): Promise<UserModulePermission[]> {
	console.log(`[数据库] 查询所有用户模块权限`);
	const result = await db.prepare('SELECT * FROM user_module_permissions ORDER BY user_id, module_id').all<UserModulePermission>();

	return result.results || [];
}
