/**
 * JWT 工具函数
 * 使用 Web Crypto API 实现（适用于 Cloudflare Workers）
 */

const JWT_SECRET_KEY = 'JWT_SECRET'; // 应该从环境变量读取
const JWT_EXPIRES_IN = 60 * 60 * 24 * 7; // 7 天

export interface JWTPayload {
	userId: string;
	email: string;
	name: string;
	iat: number;
	exp: number;
}

/**
 * 从环境变量获取 JWT Secret
 */
function getJWTSecret(env: { JWT_SECRET?: string }): string {
	if (env.JWT_SECRET) {
		return env.JWT_SECRET;
	}
	// 开发环境默认值（生产环境必须配置）
	console.warn('[JWT] 使用默认 JWT_SECRET，生产环境请配置环境变量');
	return 'default-jwt-secret-change-in-production';
}

/**
 * Base64 URL 编码
 */
function base64UrlEncode(buffer: ArrayBuffer): string {
	const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
	return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Base64 URL 解码
 */
function base64UrlDecode(base64: string): Uint8Array {
	const base64Normalized = base64.replace(/-/g, '+').replace(/_/g, '/');
	const padding = '='.repeat((4 - (base64Normalized.length % 4)) % 4);
	const base64Padded = base64Normalized + padding;
	const binaryString = atob(base64Padded);
	return new Uint8Array(binaryString.split('').map((char) => char.charCodeAt(0)));
}

/**
 * 生成 JWT Token
 */
export async function generateJWT(
	userId: string,
	email: string,
	name: string,
	env: { JWT_SECRET?: string }
): Promise<string> {
	const secret = getJWTSecret(env);
	const now = Math.floor(Date.now() / 1000);

	const payload: JWTPayload = {
		userId,
		email,
		name,
		iat: now,
		exp: now + JWT_EXPIRES_IN,
	};

	// Header
	const header = {
		alg: 'HS256',
		typ: 'JWT',
	};

	// 编码 Header 和 Payload
	const encodedHeader = base64UrlEncode(
		new TextEncoder().encode(JSON.stringify(header))
	);
	const encodedPayload = base64UrlEncode(
		new TextEncoder().encode(JSON.stringify(payload))
	);

	// 创建签名
	const signatureInput = `${encodedHeader}.${encodedPayload}`;
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);

	const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signatureInput));
	const encodedSignature = base64UrlEncode(signature);

	return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}

/**
 * 验证并解析 JWT Token
 * @param token JWT token 字符串
 * @param env 环境变量（包含 JWT_SECRET）
 * @param db 数据库实例（可选，用于检查用户最后登出时间）
 */
export async function verifyJWT(
	token: string,
	env: { JWT_SECRET?: string },
	db?: D1Database
): Promise<JWTPayload | null> {
	try {
		const secret = getJWTSecret(env);
		const parts = token.split('.');

		if (parts.length !== 3) {
			console.error('[JWT] Token 格式无效');
			return null;
		}

		const [encodedHeader, encodedPayload, encodedSignature] = parts;

		// 验证签名
		const signatureInput = `${encodedHeader}.${encodedPayload}`;
		const key = await crypto.subtle.importKey(
			'raw',
			new TextEncoder().encode(secret),
			{ name: 'HMAC', hash: 'SHA-256' },
			false,
			['verify']
		);

		const signature = base64UrlDecode(encodedSignature);
		const isValid = await crypto.subtle.verify(
			'HMAC',
			key,
			signature,
			new TextEncoder().encode(signatureInput)
		);

		if (!isValid) {
			console.error('[JWT] Token 签名验证失败');
			return null;
		}

		// 解析 Payload
		const payloadJson = JSON.parse(
			new TextDecoder().decode(base64UrlDecode(encodedPayload))
		) as JWTPayload;

		// 检查过期时间
		const now = Math.floor(Date.now() / 1000);
		if (payloadJson.exp < now) {
			console.error('[JWT] Token 已过期');
			return null;
		}

		// 检查 token 是否有发放时间（iat）
		if (!payloadJson.iat) {
			console.error('[JWT] Token 缺少发放时间（iat），视为失效');
			return null;
		}

		// 如果提供了数据库，检查用户最后登出时间
		if (db && payloadJson.userId) {
			try {
				const { getUserLastLogout } = await import('../db/schema');
				const lastLogoutAt = await getUserLastLogout(db, payloadJson.userId);
				
				if (lastLogoutAt) {
					// 将最后登出时间转换为 Unix 时间戳（秒）
					const lastLogoutTimestamp = Math.floor(new Date(lastLogoutAt).getTime() / 1000);
					
					// 如果 token 的发放时间早于最后登出时间，则视为失效
					if (payloadJson.iat < lastLogoutTimestamp) {
						console.error(`[JWT] Token 发放时间（${payloadJson.iat}）早于用户最后登出时间（${lastLogoutTimestamp}），视为失效`);
						return null;
					}
				}
			} catch (error) {
				console.error('[JWT] 检查用户最后登出时间失败:', error);
				// 如果检查失败，为了安全起见，拒绝 token
				return null;
			}
		}

		return payloadJson;
	} catch (error) {
		console.error('[JWT] Token 验证失败:', error);
		return null;
	}
}

/**
 * 从请求中获取 JWT Token
 */
export function getJWTFromRequest(request: Request): string | null {
	// 优先从 Authorization header 获取
	const authHeader = request.headers.get('Authorization');
	if (authHeader && authHeader.startsWith('Bearer ')) {
		return authHeader.substring(7);
	}

	// 兼容：从 URL 参数获取（用于登录回调）
	const url = new URL(request.url);
	const token = url.searchParams.get('token');
	if (token) {
		return token;
	}

	return null;
}

