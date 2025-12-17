/**
 * 会话管理工具函数
 */

const SESSION_COOKIE_NAME = 'joel_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 天

export interface SessionData {
	userId: string;
	email: string;
	name: string;
}

/**
 * 生成会话 ID
 */
function generateSessionId(): string {
	const array = new Uint8Array(32);
	crypto.getRandomValues(array);
	return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * 设置会话 Cookie
 */
export function setSessionCookie(
	sessionData: SessionData,
	isProduction: boolean = false
): string {
	const sessionId = generateSessionId();
	// 在实际应用中，应该将 sessionData 存储到 KV 或 D1，这里简化处理
	// 使用 base64 编码存储（注意：这不是最安全的方式，生产环境建议使用 KV）
	const sessionValue = btoa(JSON.stringify({ id: sessionId, ...sessionData }));

	const cookie = `${SESSION_COOKIE_NAME}=${sessionValue}; Path=/; Max-Age=${SESSION_MAX_AGE}; HttpOnly; SameSite=Lax${
		isProduction ? '; Secure' : ''
	}`;

	console.log(`[会话] 设置会话 Cookie，用户: ${sessionData.email}`);
	return cookie;
}

/**
 * 从请求中获取会话数据
 */
export function getSessionFromRequest(
	request: Request
): SessionData | null {
	const cookieHeader = request.headers.get('Cookie');
	if (!cookieHeader) {
		console.log(`[会话] 未找到 Cookie`);
		return null;
	}

	const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
		const [key, value] = cookie.trim().split('=');
		acc[key] = value;
		return acc;
	}, {} as Record<string, string>);

	const sessionValue = cookies[SESSION_COOKIE_NAME];
	if (!sessionValue) {
		console.log(`[会话] 未找到会话 Cookie`);
		return null;
	}

	try {
		const sessionData = JSON.parse(atob(sessionValue)) as SessionData & {
			id: string;
		};
		console.log(`[会话] 获取会话成功，用户: ${sessionData.email}`);
		return {
			userId: sessionData.userId,
			email: sessionData.email,
			name: sessionData.name,
		};
	} catch (error) {
		console.error(`[会话] 解析会话 Cookie 失败:`, error);
		return null;
	}
}

/**
 * 清除会话 Cookie
 */
export function clearSessionCookie(isProduction: boolean = false): string {
	const cookie = `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${
		isProduction ? '; Secure' : ''
	}`;
	console.log(`[会话] 清除会话 Cookie`);
	return cookie;
}

