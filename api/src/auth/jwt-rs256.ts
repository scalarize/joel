/**
 * RS256 JWT 实现
 * 使用 RSA 私钥签名，公钥验证（适用于 Cloudflare Workers）
 */

import { isAdminEmail } from '../admin/auth';
import { getUserModulePermissions } from '../db/schema';

export interface JWTPayload {
	// 标准字段（JWT 规范）
	iss: string; // Issuer: "joel.scalarize.org"
	sub: string; // Subject: userId
	aud: string[]; // Audience: ["gd.scalarize.org", "discover.scalarize.org"]
	exp: number; // Expiration time (Unix timestamp)
	iat: number; // Issued at (Unix timestamp)

	// 用户信息字段
	userId: string; // 用户 ID
	username: string; // 用户名（对应数据库 name 字段）
	email: string; // 邮箱

	// 权限信息
	permissions: {
		profile: boolean; // 所有人可访问，始终为 true
		favor: boolean; // 需要授权或管理员
		gd: boolean; // 需要授权或管理员
		discover: boolean; // 需要授权或管理员
		admin: boolean; // 仅管理员
	};

	// 权限版本号
	permVersion: number; // 权限版本号（从环境变量读取）
}

const JWT_EXPIRES_IN = 60 * 60 * 24 * 7; // 7 天

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
 * 标准 Base64 解码（用于 PEM 格式）
 */
function base64Decode(base64: string): Uint8Array {
	// PEM 格式使用标准 base64，需要处理填充
	const padding = '='.repeat((4 - (base64.length % 4)) % 4);
	const base64Padded = base64 + padding;
	const binaryString = atob(base64Padded);
	return new Uint8Array(binaryString.split('').map((char) => char.charCodeAt(0)));
}

/**
 * 从环境变量获取权限版本号
 */
function getPermVersion(env: { PERM_VERSION?: string }): number {
	const version = env.PERM_VERSION;
	if (!version) {
		console.warn('[JWT] PERM_VERSION 未设置，使用默认值 1');
		return 1;
	}
	return Number(version);
}

/**
 * 从环境变量获取 RSA 私钥并导入为 CryptoKey
 */
async function getRSAPrivateKey(env: { JWT_RSA_PRIVATE_KEY?: string }): Promise<CryptoKey> {
	if (!env.JWT_RSA_PRIVATE_KEY) {
		throw new Error('JWT_RSA_PRIVATE_KEY 环境变量未设置');
	}

	// 解析 PEM 格式私钥
	const pem = env.JWT_RSA_PRIVATE_KEY;
	const pemHeader = '-----BEGIN PRIVATE KEY-----';
	const pemFooter = '-----END PRIVATE KEY-----';
	
	if (!pem.includes(pemHeader) || !pem.includes(pemFooter)) {
		throw new Error('JWT_RSA_PRIVATE_KEY 格式错误，应为 PEM 格式');
	}

	const pemContents = pem
		.replace(pemHeader, '')
		.replace(pemFooter, '')
		.replace(/\s/g, ''); // 移除所有空白字符（包括换行符、空格等）

	// PEM 格式使用标准 base64，不是 base64url
	const binaryDer = base64Decode(pemContents);

	// 导入私钥
	try {
		const privateKey = await crypto.subtle.importKey(
			'pkcs8',
			binaryDer,
			{
				name: 'RSASSA-PKCS1-v1_5',
				hash: 'SHA-256',
			},
			false,
			['sign']
		);
		return privateKey;
	} catch (error) {
		console.error('[JWT] 导入 RSA 私钥失败:', error);
		throw new Error('导入 RSA 私钥失败，请检查密钥格式');
	}
}

/**
 * 构建 JWT Payload（包含权限信息）
 */
export async function buildJWTPayload(
	userId: string,
	email: string,
	name: string,
	db: D1Database,
	env: { PERM_VERSION?: string }
): Promise<JWTPayload> {
	const isAdmin = isAdminEmail(email);
	const permissions = await getUserModulePermissions(db, userId);

	// 构建权限对象
	const permObj: Record<string, boolean> = {
		profile: true, // 所有人可访问
		admin: isAdmin,
	};

	// 管理员自动拥有所有模块权限
	if (isAdmin) {
		permObj.favor = true;
		permObj.gd = true;
		permObj.discover = true;
	} else {
		// 检查显式授权
		permObj.favor = permissions.some((p) => p.module_id === 'favor');
		permObj.gd = permissions.some((p) => p.module_id === 'gd');
		permObj.discover = permissions.some((p) => p.module_id === 'discover');
	}

	const permVersion = getPermVersion(env);
	const now = Math.floor(Date.now() / 1000);

	return {
		iss: 'joel.scalarize.org',
		sub: userId,
		aud: ['gd.scalarize.org', 'discover.scalarize.org'],
		exp: now + JWT_EXPIRES_IN,
		iat: now,
		userId,
		username: name,
		email,
		permissions: permObj as JWTPayload['permissions'],
		permVersion,
	};
}

/**
 * 生成 RS256 JWT Token
 */
export async function generateJWT(
	userId: string,
	email: string,
	name: string,
	db: D1Database,
	env: { JWT_RSA_PRIVATE_KEY?: string; PERM_VERSION?: string }
): Promise<string> {
	console.log(`[JWT] 生成 RS256 JWT token: userId=${userId}, email=${email}`);

	// 构建 Payload
	const payload = await buildJWTPayload(userId, email, name, db, env);

	// Header
	const header = {
		alg: 'RS256',
		typ: 'JWT',
	};

	// 编码 Header 和 Payload
	const encodedHeader = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
	const encodedPayload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));

	// 使用 RSA 私钥签名
	const privateKey = await getRSAPrivateKey(env);
	const signatureInput = `${encodedHeader}.${encodedPayload}`;
	const signatureInputBytes = new TextEncoder().encode(signatureInput);
	
	const signature = await crypto.subtle.sign(
		{
			name: 'RSASSA-PKCS1-v1_5',
		},
		privateKey,
		signatureInputBytes
	);

	const encodedSignature = base64UrlEncode(signature);

	const token = `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
	console.log(`[JWT] RS256 JWT token 生成成功，权限版本号: ${payload.permVersion}`);
	return token;
}

/**
 * JWKS 公钥配置（从生成的密钥对导出）
 * 注意：此公钥必须与 JWT_RSA_PRIVATE_KEY 环境变量中的私钥匹配
 * 如果重新生成了密钥对，需要更新此处的公钥信息
 */
const JWKS_PUBLIC_KEY = {
	kty: 'RSA',
	use: 'sig',
	kid: 'key-1',
	alg: 'RS256',
	n: 'yCbUWpPO6xJe6sok-4Pz8AT-em6rgjjPEPhw_khz37Zy_qY8FTm6ZriJGK-c0ZgeiA-TzVzYyJxPlk58FFLdrcqOgQB1iVz9X676jBelaTrI5h9Z2m2QjGV5gQliSw69gP-NpvwbvdPtW9_r93ymt6_fVn3vME6Q79jhxgGvdU4dv1Sf0Ev2sZDUp4PYuEQegxRh1HhmYMSW9j9m5Lr2yS2os1JqQvWNdQNv_9B-uuimXpbRFr3bQ2P-UZ9hDWtmzukzBAgTVmCHliMT_41cMFEj0zw7MFbm3w8duE96mF1yO-a9b1ew0Stv1NvMrAwD0GrqvOPPKXX5SxINZtSBbw',
	e: 'AQAB',
};

/**
 * 从 JWKS 导入公钥（用于验证）
 */
async function getRSAPublicKeyFromJWKS(): Promise<CryptoKey> {
	// 将 JWK 格式转换为 CryptoKey
	const jwk: JsonWebKey = {
		kty: JWKS_PUBLIC_KEY.kty,
		use: JWKS_PUBLIC_KEY.use,
		kid: JWKS_PUBLIC_KEY.kid,
		alg: JWKS_PUBLIC_KEY.alg,
		n: JWKS_PUBLIC_KEY.n,
		e: JWKS_PUBLIC_KEY.e,
	};

	try {
		const publicKey = await crypto.subtle.importKey(
			'jwk',
			jwk,
			{
				name: 'RSASSA-PKCS1-v1_5',
				hash: 'SHA-256',
			},
			false,
			['verify']
		);
		
		return publicKey;
	} catch (error) {
		console.error('[JWT] 导入公钥失败:', error);
		throw new Error(`导入公钥失败: ${error instanceof Error ? error.message : String(error)}`);
	}
}

/**
 * 验证并解析 RS256 JWT Token
 * 注意：此函数仅用于主站验证，子站应自行实现验证逻辑
 */
export async function verifyJWT(
	token: string,
	env: { JWT_RSA_PRIVATE_KEY?: string },
	kv?: KVNamespace
): Promise<JWTPayload | null> {
	try {
		const parts = token.split('.');

		if (parts.length !== 3) {
			console.error('[JWT] Token 格式无效');
			return null;
		}

		const [encodedHeader, encodedPayload, encodedSignature] = parts;

		// 解析 Header
		const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedHeader)));
		if (header.alg !== 'RS256') {
			console.error('[JWT] Token 算法不匹配，期望 RS256');
			return null;
		}

		// 验证签名（使用公钥）
		// 注意：JWKS 中的公钥必须与 JWT_RSA_PRIVATE_KEY 环境变量中的私钥匹配
		try {
			const publicKey = await getRSAPublicKeyFromJWKS();
			const signatureInput = `${encodedHeader}.${encodedPayload}`;
			const signatureInputBytes = new TextEncoder().encode(signatureInput);
			const signature = base64UrlDecode(encodedSignature);

			const isValid = await crypto.subtle.verify(
				{
					name: 'RSASSA-PKCS1-v1_5',
				},
				publicKey,
				signature,
				signatureInputBytes
			);

			if (!isValid) {
				console.error('[JWT] Token 签名验证失败');
				return null;
			}
		} catch (error) {
			console.error('[JWT] 签名验证过程出错:', error);
			return null;
		}

		// 解析 Payload
		const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedPayload))) as JWTPayload;

		// 检查过期时间
		const now = Math.floor(Date.now() / 1000);
		if (payload.exp < now) {
			console.error('[JWT] Token 已过期');
			return null;
		}

		// 检查 token 是否有发放时间（iat）
		if (!payload.iat) {
			console.error('[JWT] Token 缺少发放时间（iat），视为失效');
			return null;
		}

		// 检查用户最后登出时间（仅使用 KV）
		if (kv && payload.userId) {
			try {
				const { getUserLastLogoutKV } = await import('./session-kv');
				const lastLogoutAt = await getUserLastLogoutKV(kv, payload.userId);

				if (lastLogoutAt) {
					console.log(`[JWT] 从 KV 获取到用户最后登出时间: ${payload.userId}`);
					// 将最后登出时间转换为 Unix 时间戳（秒）
					const lastLogoutTimestamp = Math.floor(new Date(lastLogoutAt).getTime() / 1000);

					// 如果 token 的发放时间早于最后登出时间，则视为失效
					if (payload.iat < lastLogoutTimestamp) {
						console.error(
							`[JWT] Token 发放时间（${payload.iat}）早于用户最后登出时间（${lastLogoutTimestamp}），视为失效`
						);
						return null;
					}
				}
			} catch (error) {
				console.warn('[JWT] 从 KV 读取最后登出时间失败:', error);
				// KV 读取失败不影响 token 验证，继续处理
			}
		}

		return payload;
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

