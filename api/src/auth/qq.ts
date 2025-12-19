/**
 * QQ OAuth 2.0 认证工具函数
 * 
 * QQ 开放平台文档：https://wiki.open.qq.com/wiki/website/使用Authorization_Code获取Access_Token
 */

export interface QQUserInfo {
	openid: string; // QQ 用户唯一标识
	nickname?: string; // 昵称
	figureurl?: string; // 头像 URL（30x30）
	figureurl_1?: string; // 头像 URL（50x50）
	figureurl_2?: string; // 头像 URL（100x100）
	figureurl_qq_1?: string; // QQ 头像 URL（40x40）
	figureurl_qq_2?: string; // QQ 头像 URL（100x100）
	gender?: string; // 性别："男" 或 "女"
	email?: string; // 邮箱（需要申请权限，可能为空）
}

export interface QQTokenResponse {
	access_token: string;
	expires_in: number;
	refresh_token?: string;
}

/**
 * 生成 QQ OAuth 授权 URL
 */
export function generateAuthUrl(
	appId: string,
	redirectUri: string,
	state: string
): string {
	const params = new URLSearchParams({
		response_type: 'code',
		client_id: appId,
		redirect_uri: redirectUri,
		state: state,
		scope: 'get_user_info', // 获取用户信息权限
	});

	const authUrl = `https://graph.qq.com/oauth2.0/authorize?${params.toString()}`;
	console.log(`[QQ OAuth] 生成授权 URL，state: ${state.substring(0, 8)}...`);
	return authUrl;
}

/**
 * 使用授权码交换访问令牌
 */
export async function exchangeCodeForToken(
	code: string,
	appId: string,
	appKey: string,
	redirectUri: string
): Promise<QQTokenResponse> {
	console.log(`[QQ OAuth] 开始交换 token，code: ${code.substring(0, 8)}...`);

	const params = new URLSearchParams({
		grant_type: 'authorization_code',
		client_id: appId,
		client_secret: appKey,
		code: code,
		redirect_uri: redirectUri,
	});

	const response = await fetch(`https://graph.qq.com/oauth2.0/token?${params.toString()}`, {
		method: 'GET',
	});

	if (!response.ok) {
		const errorText = await response.text();
		console.error(`[QQ OAuth] Token 交换失败: ${response.status} ${errorText}`);
		throw new Error(`Token 交换失败: ${response.status}`);
	}

	// QQ OAuth 返回的是 URL 编码格式的字符串，例如：access_token=xxx&expires_in=7776000&refresh_token=xxx
	const responseText = await response.text();
	const tokenData: Record<string, string> = {};
	
	for (const pair of responseText.split('&')) {
		const [key, value] = pair.split('=');
		if (key && value) {
			tokenData[key] = decodeURIComponent(value);
		}
	}

	// 检查是否有错误
	if (tokenData.error) {
		console.error(`[QQ OAuth] Token 交换失败: ${tokenData.error} - ${tokenData.error_description || ''}`);
		throw new Error(`Token 交换失败: ${tokenData.error}`);
	}

	if (!tokenData.access_token) {
		console.error(`[QQ OAuth] Token 交换失败: 未返回 access_token`);
		throw new Error(`Token 交换失败: 未返回 access_token`);
	}

	console.log(`[QQ OAuth] Token 交换成功`);
	return {
		access_token: tokenData.access_token,
		expires_in: parseInt(tokenData.expires_in || '0', 10),
		refresh_token: tokenData.refresh_token,
	};
}

/**
 * 使用访问令牌获取 OpenID
 * QQ OAuth 需要先获取 OpenID，然后才能获取用户信息
 */
export async function getOpenID(accessToken: string): Promise<string> {
	console.log(`[QQ OAuth] 开始获取 OpenID`);

	const response = await fetch(`https://graph.qq.com/oauth2.0/me?access_token=${accessToken}`, {
		method: 'GET',
	});

	if (!response.ok) {
		const errorText = await response.text();
		console.error(`[QQ OAuth] 获取 OpenID 失败: ${response.status} ${errorText}`);
		throw new Error(`获取 OpenID 失败: ${response.status}`);
	}

	// QQ OAuth 返回的是 JSONP 格式，例如：callback({"client_id":"xxx","openid":"xxx"});
	const responseText = await response.text();
	
	// 提取 JSON 部分
	const jsonMatch = responseText.match(/callback\((.+)\)/);
	if (!jsonMatch) {
		console.error(`[QQ OAuth] 获取 OpenID 失败: 响应格式不正确`);
		throw new Error(`获取 OpenID 失败: 响应格式不正确`);
	}

	const data = JSON.parse(jsonMatch[1]);
	
	if (data.error) {
		console.error(`[QQ OAuth] 获取 OpenID 失败: ${data.error} - ${data.error_description || ''}`);
		throw new Error(`获取 OpenID 失败: ${data.error}`);
	}

	if (!data.openid) {
		console.error(`[QQ OAuth] 获取 OpenID 失败: 未返回 openid`);
		throw new Error(`获取 OpenID 失败: 未返回 openid`);
	}

	console.log(`[QQ OAuth] 获取 OpenID 成功: ${data.openid}`);
	return data.openid;
}

/**
 * 使用访问令牌和 OpenID 获取用户信息
 */
export async function getUserInfo(
	accessToken: string,
	openId: string,
	appId: string
): Promise<QQUserInfo> {
	console.log(`[QQ OAuth] 开始获取用户信息`);

	const params = new URLSearchParams({
		access_token: accessToken,
		oauth_consumer_key: appId,
		openid: openId,
	});

	const response = await fetch(`https://graph.qq.com/user/get_user_info?${params.toString()}`, {
		method: 'GET',
	});

	if (!response.ok) {
		const errorText = await response.text();
		console.error(`[QQ OAuth] 获取用户信息失败: ${response.status} ${errorText}`);
		throw new Error(`获取用户信息失败: ${response.status}`);
	}

	const userInfo: QQUserInfo = await response.json();
	
	if (userInfo.openid !== openId) {
		// 确保返回的 openid 与请求的一致
		userInfo.openid = openId;
	}

	console.log(`[QQ OAuth] 获取用户信息成功: ${userInfo.nickname || '未知'}`);
	
	if (!userInfo.email) {
		console.log(`[QQ OAuth] 用户邮箱为空，将使用 QQ号@qq.com 补全`);
	}

	return userInfo;
}

/**
 * QQ 邮箱补全函数
 * 如果 QQ OAuth 无法获取邮箱，使用 QQ号@qq.com 补全
 */
export function normalizeQQEmail(openId: string, emailFromAPI: string | null | undefined): string {
	// 如果 API 返回了邮箱，直接使用
	if (emailFromAPI && emailFromAPI.trim()) {
		return emailFromAPI.trim();
	}
	
	// 否则使用 QQ OpenID + @qq.com 补全
	// QQ OpenID 是字符串格式的数字，例如 "123456789"
	return `${openId}@qq.com`;
}


