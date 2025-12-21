/**
 * 管理员权限检查
 * 仅支持 JWT token 验证，不支持 Session Cookie
 */

import { getJWTFromRequest, verifyJWT } from '../auth/jwt';
import { getUserById } from '../db/schema';

/**
 * 管理员邮箱（硬编码，未来可改为从数据库或环境变量读取）
 */
const ADMIN_EMAIL = 'scalarize@gmail.com';

/**
 * 检查用户邮箱是否为管理员
 * @param email 用户邮箱
 * @returns 是否为管理员
 */
export function isAdminEmail(email: string): boolean {
	if (!email) {
		console.log('[管理员] isAdminEmail: 邮箱为空');
		return false;
	}
	// 去除空格并转换为小写进行比较，避免大小写和空格问题
	const normalizedEmail = email.trim().toLowerCase();
	const normalizedAdminEmail = ADMIN_EMAIL.trim().toLowerCase();
	const isAdmin = normalizedEmail === normalizedAdminEmail;
	console.log(`[管理员] isAdminEmail: 比较 "${normalizedEmail}" 与 "${normalizedAdminEmail}" = ${isAdmin}`);
	return isAdmin;
}

/**
 * 检查当前用户是否为管理员
 * 仅支持 JWT token 验证
 * @returns 如果是管理员，返回用户对象；否则返回 null
 */
export async function checkAdminAccess(request: Request, db: D1Database, env: { JWT_SECRET?: string; USER_SESSION?: KVNamespace }): Promise<{ id: string; email: string; name: string } | null> {
	console.log('[管理员] 检查管理员权限');

	// 从 JWT token 获取用户信息
	const jwtToken = getJWTFromRequest(request);
	if (!jwtToken) {
		console.log('[管理员] 未找到 JWT token');
		return null;
	}

	console.log('[管理员] 检测到 JWT token，开始验证');
	const payload = await verifyJWT(jwtToken, env, env.USER_SESSION);
	if (!payload) {
		console.log('[管理员] JWT token 验证失败');
		return null;
	}

	console.log(`[管理员] JWT token 验证成功: userId=${payload.userId}, email=${payload.email}`);

	// 从数据库获取完整用户信息
	const user = await getUserById(db, payload.userId);
	if (!user) {
		console.log(`[管理员] 数据库未找到用户: userId=${payload.userId}`);
		return null;
	}

	console.log(`[管理员] 数据库用户信息: id=${user.id}, email="${user.email}", name=${user.name}`);

	if (!isAdminEmail(user.email)) {
		console.log(`[管理员] 用户 ${user.email} 不是管理员 (期望: ${ADMIN_EMAIL})`);
		return null;
	}

	console.log(`[管理员] 管理员 ${user.email} 访问通过`);
	return {
		id: user.id,
		email: user.email,
		name: user.name,
	};
}
