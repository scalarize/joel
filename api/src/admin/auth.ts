/**
 * 管理员权限检查
 */

import { getSessionFromRequest } from '../auth/session';
import { getUserById } from '../db/schema';

/**
 * 管理员邮箱（硬编码，未来可改为从数据库或环境变量读取）
 */
const ADMIN_EMAIL = 'scalarize@gmail.com';

/**
 * 检查当前用户是否为管理员
 * @returns 如果是管理员，返回用户对象；否则返回 null
 */
export async function checkAdminAccess(
	request: Request,
	db: D1Database
): Promise<{ id: string; email: string; name: string } | null> {
	console.log('[管理员] 检查管理员权限');

	const session = getSessionFromRequest(request);
	if (!session) {
		console.log('[管理员] 用户未登录');
		return null;
	}

	const user = await getUserById(db, session.userId);
	if (!user) {
		console.log('[管理员] 数据库未找到用户');
		return null;
	}

	if (user.email !== ADMIN_EMAIL) {
		console.log(`[管理员] 用户 ${user.email} 不是管理员`);
		return null;
	}

	console.log(`[管理员] 管理员 ${user.email} 访问通过`);
	return {
		id: user.id,
		email: user.email,
		name: user.name,
	};
}

