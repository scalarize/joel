/**
 * 用户身份验证工具函数
 * 仅支持 JWT token 验证，不支持 Session Cookie
 */

import { getJWTFromRequest, verifyJWT } from './jwt';
import { getUserById } from '../db/schema';

/**
 * 从请求中验证 JWT token 并获取用户信息
 * @returns 如果验证成功，返回用户对象；否则返回 null
 */
export async function getUserFromRequest(
	request: Request,
	db: D1Database,
	env: { JWT_SECRET?: string; USER_SESSION?: KVNamespace }
): Promise<{ id: string; email: string; name: string; picture?: string | null } | null> {
	console.log('[用户验证] 检查 JWT token');

	// 从 JWT token 获取用户信息
	const jwtToken = getJWTFromRequest(request);
	if (!jwtToken) {
		console.log('[用户验证] 未找到 JWT token');
		return null;
	}

	console.log('[用户验证] 检测到 JWT token，开始验证');
	const payload = await verifyJWT(jwtToken, env, env.USER_SESSION);
	if (!payload) {
		console.log('[用户验证] JWT token 验证失败');
		return null;
	}

	console.log(`[用户验证] JWT token 验证成功: userId=${payload.userId}, email=${payload.email}`);

	// 从数据库获取完整用户信息
	const user = await getUserById(db, payload.userId);
	if (!user) {
		console.log(`[用户验证] 数据库未找到用户: userId=${payload.userId}`);
		return null;
	}

	console.log(`[用户验证] 用户验证成功: ${user.email}`);
	return {
		id: user.id,
		email: user.email,
		name: user.name,
		picture: user.picture ?? null,
	};
}

