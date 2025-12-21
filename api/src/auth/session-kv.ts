/**
 * 用户会话 KV 管理
 * 使用 KV 存储用户最后登出时间，以加速 JWT 失效校验
 */

const KV_KEY_PREFIX = 'user:logout:';

/**
 * 获取用户最后登出时间的 KV key
 */
function getLastLogoutKey(userId: string): string {
	return `${KV_KEY_PREFIX}${userId}`;
}

/**
 * 更新用户最后登出时间到 KV
 * @param kv KV 命名空间
 * @param userId 用户 ID
 * @param lastLogoutAt 最后登出时间（ISO 字符串）
 */
export async function updateUserLastLogoutKV(kv: KVNamespace, userId: string, lastLogoutAt: string): Promise<void> {
	const key = getLastLogoutKey(userId);
	console.log(`[KV] 更新用户最后登出时间: ${userId}`);

	// 存储到 KV，设置过期时间为 30 天（与 JWT token 过期时间一致）
	// 这样可以自动清理不再使用的数据
	await kv.put(key, lastLogoutAt, {
		expirationTtl: 60 * 60 * 24 * 30, // 30 天
	});

	console.log(`[KV] 用户最后登出时间已更新到 KV: ${userId}`);
}

/**
 * 从 KV 获取用户最后登出时间
 * @param kv KV 命名空间
 * @param userId 用户 ID
 * @returns 最后登出时间（ISO 字符串），如果不存在则返回 null
 */
export async function getUserLastLogoutKV(kv: KVNamespace, userId: string): Promise<string | null> {
	const key = getLastLogoutKey(userId);
	const value = await kv.get(key);

	if (value) {
		console.log(`[KV] 从 KV 获取到用户最后登出时间: ${userId}`);
		return value;
	}

	console.log(`[KV] KV 中未找到用户最后登出时间: ${userId}`);
	return null;
}

/**
 * 删除用户最后登出时间（用于清理）
 */
export async function deleteUserLastLogoutKV(kv: KVNamespace, userId: string): Promise<void> {
	const key = getLastLogoutKey(userId);
	await kv.delete(key);
	console.log(`[KV] 已删除用户最后登出时间: ${userId}`);
}

/**
 * Access Token 管理
 * 用于一次性 token 交换 JWT token
 */

const ACCESS_TOKEN_KEY_PREFIX = 'access_token:';

/**
 * 生成 access_token 的 KV key
 */
function getAccessTokenKey(accessToken: string): string {
	return `${ACCESS_TOKEN_KEY_PREFIX}${accessToken}`;
}

/**
 * 生成一次性 access_token
 * @param kv KV 命名空间
 * @param jwtToken JWT token
 * @returns access_token（随机字符串）
 */
export async function generateAccessToken(kv: KVNamespace, jwtToken: string): Promise<string> {
	// 生成随机 access_token（32 字节，base64 编码）
	const randomBytes = new Uint8Array(32);
	crypto.getRandomValues(randomBytes);
	const accessToken = btoa(String.fromCharCode(...randomBytes))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=/g, '');

	const key = getAccessTokenKey(accessToken);

	// 存储到 KV，设置过期时间为 30 秒
	await kv.put(key, jwtToken, {
		expirationTtl: 30, // 30 秒
	});

	console.log(`[AccessToken] 生成 access_token，30 秒后过期`);
	return accessToken;
}

/**
 * 验证并获取 access_token 对应的 JWT token
 * @param kv KV 命名空间
 * @param accessToken access_token
 * @returns JWT token，如果无效或已过期则返回 null
 */
export async function exchangeAccessToken(kv: KVNamespace, accessToken: string): Promise<string | null> {
	const key = getAccessTokenKey(accessToken);
	const jwtToken = await kv.get(key);

	if (!jwtToken) {
		console.log(`[AccessToken] access_token 无效或已过期`);
		return null;
	}

	// 获取成功后立即删除，确保一次性使用
	await kv.delete(key);
	console.log(`[AccessToken] access_token 已使用并删除`);

	return jwtToken;
}
