/**
 * Google OAuth 2.0 认证工具函数
 */

export interface GoogleUserInfo {
	id: string;
	email: string;
	verified_email: boolean;
	name: string;
	picture?: string;
	given_name?: string;
	family_name?: string;
}

export interface GoogleTokenResponse {
	access_token: string;
	expires_in: number;
	refresh_token?: string;
	scope: string;
	token_type: string;
	id_token?: string;
}

/**
 * 生成 Google OAuth 授权 URL
 */
export function generateAuthUrl(
	clientId: string,
	redirectUri: string,
	state: string
): string {
	const params = new URLSearchParams({
		client_id: clientId,
		redirect_uri: redirectUri,
		response_type: 'code',
		scope: 'openid email profile',
		access_type: 'online',
		state: state,
	});

	const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
	console.log(`[OAuth] 生成授权 URL，state: ${state.substring(0, 8)}...`);
	return authUrl;
}

/**
 * 生成随机 state 参数（用于 CSRF 防护）
 */
export function generateState(): string {
	const array = new Uint8Array(32);
	crypto.getRandomValues(array);
	return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * 使用授权码交换访问令牌
 */
export async function exchangeCodeForToken(
	code: string,
	clientId: string,
	clientSecret: string,
	redirectUri: string
): Promise<GoogleTokenResponse> {
	console.log(`[OAuth] 开始交换 token，code: ${code.substring(0, 8)}...`);

	const response = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		body: new URLSearchParams({
			code,
			client_id: clientId,
			client_secret: clientSecret,
			redirect_uri: redirectUri,
			grant_type: 'authorization_code',
		}),
	});

	if (!response.ok) {
		const errorText = await response.text();
		console.error(`[OAuth] Token 交换失败: ${response.status} ${errorText}`);
		throw new Error(`Token 交换失败: ${response.status}`);
	}

	const tokenData: GoogleTokenResponse = await response.json();
	console.log(`[OAuth] Token 交换成功`);
	return tokenData;
}

/**
 * 使用访问令牌获取用户信息
 */
export async function getUserInfo(
	accessToken: string
): Promise<GoogleUserInfo> {
	console.log(`[OAuth] 开始获取用户信息`);

	const response = await fetch(
		'https://www.googleapis.com/oauth2/v2/userinfo',
		{
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
		}
	);

	if (!response.ok) {
		const errorText = await response.text();
		console.error(`[OAuth] 获取用户信息失败: ${response.status} ${errorText}`);
		throw new Error(`获取用户信息失败: ${response.status}`);
	}

	const userInfo: GoogleUserInfo = await response.json();
	console.log(`[OAuth] 获取用户信息成功: ${userInfo.email}`);

	if (!userInfo.verified_email) {
		console.warn(`[OAuth] 用户邮箱未验证: ${userInfo.email}`);
	}

	return userInfo;
}

