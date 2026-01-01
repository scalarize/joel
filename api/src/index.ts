/**
 * Joel - Cloudflare Worker 主入口
 * 支持 Google OAuth 登录和用户信息管理
 * 架构支持多 OAuth 提供商（预留扩展）
 */

import {
	generateAuthUrl as generateGoogleAuthUrl,
	generateState,
	exchangeCodeForToken as exchangeGoogleCodeForToken,
	getUserInfo as getGoogleUserInfo,
} from './auth/google';
import { setSessionCookie, getSessionFromRequest, clearSessionCookie } from './auth/session';
import { generateJWT, verifyJWT, getJWTFromRequest } from './auth/jwt-rs256';
import { hashPassword, verifyPassword, validatePasswordStrength, generateRandomPassword } from './auth/password';
import {
	User,
	upsertUser,
	getUserById,
	getUserByEmail,
	updateUserProfile,
	getAllUsers,
	findOrCreateUserByEmail,
	getUserModulePermissions,
	hasModulePermission,
	grantModulePermission,
	revokeModulePermission,
	getAllUserModulePermissions,
	getOAuthAccountByProvider,
	getOAuthAccountsByUserId,
	linkOAuthAccount,
	unlinkOAuthAccount,
	updateOAuthAccountUserId,
	deleteUser,
	updateUserPassword,
	inviteUser,
} from './db/schema';
import { updateUserLastLogoutKV, getUserLastLogoutKV, generateAccessToken, exchangeAccessToken } from './auth/session-kv';
import { loginTemplate, getDashboardTemplate } from './templates';
import { checkAdminAccess, isAdminEmail } from './admin/auth';
import { getUserFromRequest } from './auth/user';
import { getCloudflareUsage } from './admin/analytics';
import { getAllModuleIds, isPermissionRequiredModule, getPermissionRequiredModuleIds } from './modules';

interface Env {
	DB: D1Database;
	ASSETS: R2Bucket; // R2 bucket for storing uploaded images
	USER_SESSION: KVNamespace; // KV 存储用户会话信息（用于快速查询 last_logout_at）
	GOOGLE_CLIENT_ID: string;
	GOOGLE_CLIENT_SECRET: string;
	BASE_URL?: string;
	/**
	 * 可选：前端（Cloudflare Pages）地址，用于 CORS 及前端访问
	 * 例如：https://joel-pages.example.com
	 */
	FRONTEND_URL?: string;
	/**
	 * R2 公开访问的自定义域名
	 * 例如：https://assets.joel.scalarize.org
	 */
	R2_PUBLIC_URL?: string;
	/**
	 * Cloudflare API Token（用于获取 Analytics 数据）
	 * 需要在 Cloudflare Dashboard 创建，权限包括：Account Analytics Read
	 */
	CF_API_TOKEN?: string;
	/**
	 * Cloudflare 账户 ID
	 * 可以在 Cloudflare Dashboard 右侧边栏找到
	 */
	CF_ACCOUNT_ID?: string;
	/**
	 * RSA 私钥（PEM 格式，用于 RS256 JWT 签名）
	 * 生产环境必须配置
	 */
	JWT_RSA_PRIVATE_KEY?: string;
	/**
	 * 权限版本号（用于控制 JWT 权限信息的有效性）
	 * 权限变更时需要手动递增此值并重新部署
	 */
	PERM_VERSION?: string;
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		const path = url.pathname;

		console.log(`[请求] ${request.method} ${path}, URL: ${request.url}`);

		try {
			// 公钥 API（JWKS 格式）
			if (path === '/.well-known/jwks.json' && request.method === 'GET') {
				return handleJWKS(request, env);
			}

			// 用户头像 API（无需身份校验，但需要 CORS 控制）
			if (path.startsWith('/user/avatar/') && request.method === 'GET') {
				return handleUserAvatar(request, env);
			}

			// API 路由（预留给前后端分离的前端调用）
			if (path.startsWith('/api/')) {
				console.log(`[路由] 匹配到 API 路由: ${path}`);
				// 处理预检请求
				if (request.method === 'OPTIONS') {
					return handleApiOptions(request, env);
				}

				if (path === '/api/ping' && request.method === 'GET') {
					return handleApiPing(request, env);
				}

				if (path === '/api/me' && request.method === 'GET') {
					return handleApiMe(request, env);
				}

				if (path === '/api/profile' && request.method === 'GET') {
					return handleApiGetProfile(request, env);
				}

				if (path === '/api/profile' && request.method === 'PUT') {
					return handleApiUpdateProfile(request, env);
				}

				// 图片上传
				if (path === '/api/upload/image' && request.method === 'POST') {
					return handleImageUpload(request, env);
				}

				// Google OAuth 授权入口
				if (path === '/api/auth/google' && request.method === 'GET') {
					return handleGoogleAuth(request, env);
				}

				// Google OAuth Callback
				if (path === '/api/auth/google/callback' && request.method === 'GET') {
					return handleGoogleCallback(request, env);
				}

				// 密码登录（邀请注册制，仅允许已预设的用户登录）
				if (path === '/api/auth/login' && request.method === 'POST') {
					return handlePasswordLogin(request, env);
				}

				// 登出
				if (path === '/api/logout' && request.method === 'GET') {
					return handleLogout(request, env);
				}

				// OAuth 账号管理 API
				if (path === '/api/profile/oauth-accounts' && request.method === 'GET') {
					return handleApiGetOAuthAccounts(request, env);
				}

				if (path === '/api/profile/link-oauth' && request.method === 'POST') {
					return handleApiLinkOAuth(request, env);
				}

				if (path === '/api/profile/merge-accounts' && request.method === 'POST') {
					return handleApiMergeAccounts(request, env);
				}

				if (path === '/api/profile/unlink-oauth' && request.method === 'POST') {
					return handleApiUnlinkOAuth(request, env);
				}

				// 管理员 API：获取 Cloudflare 用量数据
				if (path === '/api/admin/analytics' && request.method === 'GET') {
					return handleAdminAnalytics(request, env);
				}

				// 管理员 API：获取用户列表
				if (path === '/api/admin/users' && request.method === 'GET') {
					return handleAdminUsers(request, env);
				}

				// 管理员 API：邀请用户
				if (path === '/api/admin/invite-user' && request.method === 'POST') {
					return handleAdminInviteUser(request, env);
				}

				// 管理员 API：重置用户密码
				if (path === '/api/admin/reset-user-password' && request.method === 'POST') {
					return handleAdminResetUserPassword(request, env);
				}

				// 用户 API：获取用户授权模块列表
				if (path === '/api/profile/modules' && request.method === 'GET') {
					return handleApiGetUserModules(request, env);
				}

				// 管理员 API：获取所有用户的模块权限
				if (path === '/api/admin/user-modules' && request.method === 'GET') {
					return handleAdminGetUserModules(request, env);
				}

				// 管理员 API：授予用户模块权限
				if (path === '/api/admin/user-modules' && request.method === 'POST') {
					return handleAdminGrantModule(request, env);
				}

				// 管理员 API：撤销用户模块权限
				if (path === '/api/admin/user-modules' && request.method === 'DELETE') {
					return handleAdminRevokeModule(request, env);
				}

				// 管理员 API：封禁/解封用户
				if (path === '/api/admin/ban-user' && request.method === 'POST') {
					return handleAdminBanUser(request, env);
				}

				// 修改密码 API
				if (path === '/api/profile/change-password' && request.method === 'POST') {
					return handleApiChangePassword(request, env);
				}

				// Access Token 交换接口：用一次性 access_token 换取 JWT token
				if (path === '/api/access' && request.method === 'GET') {
					return handleApiAccess(request, env);
				}

				// 生成 Access Token 接口：生成一次性 access_token
				if (path === '/api/access/generate' && request.method === 'POST') {
					return handleApiGenerateAccessToken(request, env);
				}

				// 拼图游戏图库 API：获取 manifest
				if (path === '/api/mini-games/puzzler/manifest' && request.method === 'GET') {
					return handlePuzzlerGetManifest(request, env);
				}

				// 拼图游戏图库 API：更新 manifest（仅管理员）
				if (path === '/api/mini-games/puzzler/manifest' && request.method === 'PUT') {
					return handlePuzzlerUpdateManifest(request, env);
				}

				// 拼图游戏图库 API：上传图片（仅管理员）
				if (path === '/api/mini-games/puzzler/upload' && request.method === 'POST') {
					return handlePuzzlerUploadImage(request, env);
				}

				console.log(`[路由] API 路由未匹配，调用 handleApiNotFound`);
				return handleApiNotFound(request, env);
			}

			// 根路径 - 显示登录页面或用户信息（保留兼容性，实际由 Pages 处理）
			if (path === '/') {
				console.log(`[路由] 匹配到根路径 /，调用 handleIndex`);
				return handleIndex(request, env);
			}

			// JWT token 传递接口（用于跨域身份验证）
			if (path === '/auth' && request.method === 'GET') {
				return handleAuth(request, env);
			}

			// 兼容旧路径（重定向到新路径）
			if (path === '/auth/google' && request.method === 'GET') {
				console.log('[兼容] 旧路径 /auth/google 重定向到 /api/auth/google');
				return new Response(null, {
					status: 301,
					headers: { Location: '/api/auth/google' },
				});
			}

			if (path === '/auth/google/callback' && request.method === 'GET') {
				console.log('[兼容] 旧路径 /auth/google/callback 重定向到 /api/auth/google/callback');
				const url = new URL(request.url);
				return new Response(null, {
					status: 301,
					headers: { Location: `/api/auth/google/callback${url.search}` },
				});
			}

			if (path === '/logout' && request.method === 'GET') {
				console.log('[兼容] 旧路径 /logout 重定向到 /api/logout');
				return new Response(null, {
					status: 301,
					headers: { Location: '/api/logout' },
				});
			}

			// 404
			return new Response('Not Found', { status: 404 });
		} catch (error) {
			console.error(`[错误] ${path}:`, error);
			return new Response(
				JSON.stringify({
					error: 'Internal Server Error',
					message: error instanceof Error ? error.message : 'Unknown error',
				}),
				{
					status: 500,
					headers: { 'Content-Type': 'application/json' },
				}
			);
		}
	},
} satisfies ExportedHandler<Env>;

/**
 * 处理根路径 - 显示登录页面或用户信息
 */
async function handleIndex(request: Request, env: Env): Promise<Response> {
	console.log(`[首页] 处理请求`);

	const session = getSessionFromRequest(request);

	// 如果未登录，显示登录页面
	if (!session) {
		console.log(`[首页] 用户未登录，显示登录页面`);
		return new Response(loginTemplate, {
			headers: { 'Content-Type': 'text/html; charset=utf-8' },
		});
	}

	// 如果已登录，从数据库获取完整用户信息
	console.log(`[首页] 用户已登录: ${session.email}`);
	const user = await getUserById(env.DB, session.userId);

	if (!user) {
		console.warn(`[首页] 数据库中没有找到用户: ${session.userId}`);
		// 清除无效会话
		const isProduction = request.url.startsWith('https://');
		return new Response(loginTemplate, {
			headers: {
				'Content-Type': 'text/html; charset=utf-8',
				'Set-Cookie': clearSessionCookie(isProduction),
			},
		});
	}

	// 显示工作台页面
	console.log(`[首页] 显示工作台页面`);
	const html = getDashboardTemplate(user.name, user.email, user.picture || undefined);

	return new Response(html, {
		headers: { 'Content-Type': 'text/html; charset=utf-8' },
	});
}

/**
 * 处理 /auth 路由 - 用于跨域 JWT token 传递
 * 当用户访问 gd.scalarize.org 或 discover.scalarize.org 时，如果未检测到登录状态，
 * 可以访问本项目的 /auth?redirect=... 来校验是否已经登录
 * 如果已登录，自动跳转到 redirect URL，并附带 JWT token
 */
async function handleAuth(request: Request, env: Env): Promise<Response> {
	console.log('[Auth] 处理 /auth 请求');

	const url = new URL(request.url);
	const redirectParam = url.searchParams.get('redirect');

	// 检查是否有 redirect 参数
	if (!redirectParam) {
		console.log('[Auth] 缺少 redirect 参数，返回错误');
		return new Response('缺少 redirect 参数', { status: 400 });
	}

	// 验证 redirect URL 是否来自允许的域名
	let redirectUrl: URL;
	try {
		redirectUrl = new URL(redirectParam);
	} catch (error) {
		console.log('[Auth] redirect 参数格式无效');
		return new Response('redirect 参数格式无效', { status: 400 });
	}

	// 允许的域名列表
	const allowedHostnames = ['gd.scalarize.org', 'gd.scalarize.cn', 'discover.scalarize.org', 'discover.scalarize.cn'];

	const isAllowedHostname = allowedHostnames.some((hostname) => redirectUrl.hostname === hostname);

	if (!isAllowedHostname) {
		console.log(`[Auth] redirect URL 域名不允许: ${redirectUrl.hostname}`);
		return new Response('redirect URL 域名不允许', { status: 403 });
	}

	// 检查用户是否已登录（通过 Cookie 会话，因为这是同源请求）
	const session = getSessionFromRequest(request);
	if (!session) {
		console.log('[Auth] 用户未登录，重定向到登录页面');
		// 未登录，重定向到登录页面，登录后会自动跳转回来
		const loginUrl = new URL('/api/auth/google', request.url);
		loginUrl.searchParams.set('redirect', redirectParam);
		return new Response(null, {
			status: 302,
			headers: { Location: loginUrl.toString() },
		});
	}

	// 用户已登录，从数据库获取完整用户信息
	console.log(`[Auth] 用户已登录: ${session.email}`);
	const user = await getUserById(env.DB, session.userId);
	if (!user) {
		console.warn(`[Auth] 数据库中没有找到用户: ${session.userId}`);
		// 清除无效会话，重定向到登录页面
		const isProduction = request.url.startsWith('https://');
		const loginUrl = new URL('/api/auth/google', request.url);
		loginUrl.searchParams.set('redirect', redirectParam);
		return new Response(null, {
			status: 302,
			headers: {
				Location: loginUrl.toString(),
				'Set-Cookie': clearSessionCookie(isProduction),
			},
		});
	}

	// 检查用户是否有对应模块的权限
	const isAdmin = isAdminEmail(user.email);
	let hasPermission = false;
	let moduleId = '';

	// 根据 redirect URL 的域名判断需要检查哪个模块的权限
	if (redirectUrl.hostname.includes('gd.scalarize')) {
		moduleId = 'gd';
		hasPermission = await hasModulePermission(env.DB, user.id, 'gd', isAdmin);
	} else if (redirectUrl.hostname.includes('discover.scalarize')) {
		moduleId = 'discover';
		hasPermission = await hasModulePermission(env.DB, user.id, 'discover', isAdmin);
	}

	if (!hasPermission) {
		console.log(`[Auth] 用户 ${user.email} 没有 ${moduleId} 模块权限`);
		// 没有权限，返回错误页面或重定向到首页
		return new Response(`您没有访问 ${moduleId} 模块的权限，请联系管理员`, {
			status: 403,
			headers: { 'Content-Type': 'text/html; charset=utf-8' },
		});
	}

	// 生成 JWT token
	console.log(`[Auth] 为用户 ${user.email} 生成 JWT token`);
	const jwtToken = await generateJWT(user.id, user.email, user.name, env.DB, env);

	// 将 JWT token 添加到 redirect URL 的参数中
	redirectUrl.searchParams.set('token', jwtToken);

	console.log(`[Auth] 重定向到 ${redirectUrl.toString()}`);
	return new Response(null, {
		status: 302,
		headers: { Location: redirectUrl.toString() },
	});
}

/**
 * 安全的 Base64 编码（支持 Unicode 字符）
 * 使用 TextEncoder 将字符串转换为 UTF-8 字节，然后进行 base64 编码
 */
function safeBase64Encode(str: string): string {
	const encoder = new TextEncoder();
	const bytes = encoder.encode(str);
	// 将字节数组转换为字符串，然后使用 btoa
	// 使用循环避免展开运算符的参数数量限制
	let binaryString = '';
	for (let i = 0; i < bytes.length; i++) {
		binaryString += String.fromCharCode(bytes[i]);
	}
	return btoa(binaryString);
}

/**
 * 安全的 Base64 解码（支持 Unicode 字符）
 * 先使用 atob 解码，然后使用 TextDecoder 将 UTF-8 字节转换为字符串
 */
function safeBase64Decode(base64: string): string {
	const binaryString = atob(base64);
	const bytes = new Uint8Array(binaryString.length);
	for (let i = 0; i < binaryString.length; i++) {
		bytes[i] = binaryString.charCodeAt(i);
	}
	const decoder = new TextDecoder();
	return decoder.decode(bytes);
}

/**
 * 处理 Google OAuth 授权入口
 */
async function handleGoogleAuth(request: Request, env: Env): Promise<Response> {
	console.log(`[OAuth] 处理授权请求`);

	// 验证环境变量
	if (!env.GOOGLE_CLIENT_ID) {
		console.error(`[OAuth] GOOGLE_CLIENT_ID 未配置`);
		return new Response('Google OAuth 未配置', { status: 500 });
	}

	// 获取 redirect 参数（登录后要跳转的页面）
	const url = new URL(request.url);
	const redirect = url.searchParams.get('redirect');
	console.log(`[OAuth] 登录后跳转目标: ${redirect || '未指定'}`);

	// 生成 state 参数（用于 CSRF 防护）
	const state = generateState();
	console.log(`[OAuth] 生成 state: ${state.substring(0, 8)}...`);

	// 构建回调 URL - 使用前端路径，前端会调用 API 处理
	const baseUrl = env.BASE_URL || new URL(request.url).origin;
	// 获取前端 URL（如果是 API 域名，需要转换为前端域名）
	const frontendUrl = env.FRONTEND_URL || baseUrl.replace('api.', '').replace('api-', '');
	const redirectUri = `${frontendUrl}/auth/google/callback`;
	console.log(`[OAuth] 回调 URL: ${redirectUri}`);

	// 生成授权 URL
	const authUrl = generateGoogleAuthUrl(env.GOOGLE_CLIENT_ID, redirectUri, state);

	// 将 state 和 redirect 组合编码到 state 参数中（避免使用 Cookie）
	// 格式：{randomState}|{base64EncodedRedirect}
	let finalState = state;
	if (redirect) {
		// 验证 redirect URL 是否为同源或允许的域名（安全考虑）
		try {
			const redirectUrl = new URL(redirect, baseUrl);
			// 允许 scalarize.org 和 scalarize.cn 域名下的跳转
			const isAllowedDomain =
				redirectUrl.hostname.endsWith('.scalarize.org') ||
				redirectUrl.hostname === 'scalarize.org' ||
				redirectUrl.hostname.endsWith('.scalarize.cn') ||
				redirectUrl.hostname === 'scalarize.cn';
			if (isAllowedDomain) {
				const encodedRedirect = safeBase64Encode(redirect);
				finalState = `${state}|${encodedRedirect}`;
				console.log(`[OAuth] 将跳转目标编码到 state 参数中`);
			} else {
				console.warn(`[OAuth] 跳转目标域名不允许: ${redirectUrl.hostname}`);
			}
		} catch (error) {
			console.warn(`[OAuth] 跳转目标 URL 格式无效: ${redirect}`);
		}
	}

	// 重新生成授权 URL（使用包含 redirect 的 state）
	const finalAuthUrl = generateGoogleAuthUrl(env.GOOGLE_CLIENT_ID, redirectUri, finalState);

	// 将 state（仅随机部分）存储到 Cookie 用于验证（实际应用中应该使用 KV 或加密存储）
	const isProduction = request.url.startsWith('https://');
	const stateCookie = `oauth_state=${state}; Path=/; Max-Age=600; HttpOnly; SameSite=Lax${isProduction ? '; Secure' : ''}`;

	console.log(`[OAuth] 生成授权 URL，返回 JSON 响应`);
	// 返回 JSON 响应，包含授权 URL 和 state cookie
	return jsonWithCors(
		request,
		env,
		{
			authUrl: finalAuthUrl,
			message: '请重定向到授权 URL',
		},
		200,
		{
			'Set-Cookie': stateCookie,
		}
	);
}

/**
 * 处理 Google OAuth Callback
 */
async function handleGoogleCallback(request: Request, env: Env): Promise<Response> {
	console.log(`[Callback] 处理 OAuth 回调`);

	const isProduction = request.url.startsWith('https://');
	const url = new URL(request.url);
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const error = url.searchParams.get('error');

	// 检查是否有错误
	if (error) {
		console.error(`[Callback] OAuth 错误: ${error}`);
		const clearStateCookie = `oauth_state=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${isProduction ? '; Secure' : ''}`;
		return jsonWithCors(
			request,
			env,
			{
				success: false,
				error: 'oauth_error',
				message: `OAuth 错误: ${error}`,
			},
			400,
			{
				'Set-Cookie': clearStateCookie,
			}
		);
	}

	// 验证必要参数
	if (!code || !state) {
		console.error(`[Callback] 缺少必要参数: code=${!!code}, state=${!!state}`);
		const clearStateCookie = `oauth_state=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${isProduction ? '; Secure' : ''}`;
		return jsonWithCors(
			request,
			env,
			{
				success: false,
				error: 'missing_params',
				message: '缺少必要参数',
			},
			400,
			{
				'Set-Cookie': clearStateCookie,
			}
		);
	}

	// 验证 state（从 Cookie 中获取）
	const cookieHeader = request.headers.get('Cookie');
	const cookies = cookieHeader
		? cookieHeader.split(';').reduce((acc, cookie) => {
				const [key, value] = cookie.trim().split('=');
				acc[key] = value;
				return acc;
		  }, {} as Record<string, string>)
		: {};

	// 从 state 参数中提取随机部分和 redirect URL
	// 格式：{randomState}|{base64EncodedRedirect} 或 {randomState}
	const stateParts = state.split('|');
	const randomState = stateParts[0];
	let redirectFromState: string | null = null;
	if (stateParts.length > 1) {
		try {
			redirectFromState = safeBase64Decode(stateParts[1]);
			console.log(`[Callback] 从 state 参数中提取到 redirect URL: ${redirectFromState}`);
		} catch (error) {
			console.warn(`[Callback] 解析 state 中的 redirect URL 失败:`, error);
		}
	}

	const storedState = cookies['oauth_state'];
	if (!storedState || storedState !== randomState) {
		console.error(`[Callback] State 验证失败`);
		const clearStateCookie = `oauth_state=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${isProduction ? '; Secure' : ''}`;
		return jsonWithCors(
			request,
			env,
			{
				success: false,
				error: 'invalid_state',
				message: 'State 验证失败',
			},
			400,
			{
				'Set-Cookie': clearStateCookie,
			}
		);
	}

	console.log(`[Callback] State 验证成功`);

	// 验证环境变量
	if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
		console.error(`[Callback] Google OAuth 配置不完整`);
		const clearStateCookie = `oauth_state=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${isProduction ? '; Secure' : ''}`;
		return jsonWithCors(
			request,
			env,
			{
				success: false,
				error: 'config_error',
				message: 'Google OAuth 未配置',
			},
			500,
			{
				'Set-Cookie': clearStateCookie,
			}
		);
	}

	// 构建回调 URL - 必须与授权时使用的 redirect_uri 完全一致
	// 注意：这里应该使用授权时传递给 Google 的 redirect_uri，而不是实际接收回调的 URL
	const baseUrl = env.BASE_URL || new URL(request.url).origin;
	// 获取前端 URL（如果是 API 域名，需要转换为前端域名）
	const frontendUrl = env.FRONTEND_URL || baseUrl.replace('api.', '').replace('api-', '');
	const redirectUri = `${frontendUrl}/auth/google/callback`;
	console.log(`[Callback] 回调 URL（用于 token 交换）: ${redirectUri}`);
	console.log(`[Callback] 实际请求 URL: ${request.url}`);

	try {
		// 交换授权码获取访问令牌
		console.log(`[Callback] 交换授权码获取 token`);
		const tokenResponse = await exchangeGoogleCodeForToken(code, env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, redirectUri);

		// 获取用户信息
		console.log(`[Callback] 获取用户信息`);
		const googleUser = await getGoogleUserInfo(tokenResponse.access_token);

		// 验证邮箱
		if (!googleUser.verified_email) {
			console.warn(`[Callback] 用户邮箱未验证: ${googleUser.email}`);
		}

		// 使用新的多 OAuth 架构：通过邮箱查找或创建用户，并关联 OAuth 账号
		console.log(`[Callback] 使用多 OAuth 架构处理用户登录`);
		const now = new Date().toISOString();

		// 检查该 Google 账号是否已存在 OAuth 记录（用于迁移现有用户）
		const existingOAuth = await getOAuthAccountByProvider(env.DB, 'google', googleUser.id);

		let user: User;
		let isNewUser: boolean;
		let linkedMethod: 'auto' | 'manual';

		if (existingOAuth) {
			// OAuth 账号已存在，直接使用关联的用户
			const existingUser = await getUserById(env.DB, existingOAuth.user_id);
			if (!existingUser) {
				throw new Error(`[Callback] OAuth 账号关联的用户不存在: ${existingOAuth.user_id}`);
			}
			user = existingUser;
			isNewUser = false;
			linkedMethod = existingOAuth.linked_method;

			// 更新 OAuth 账号的 token 信息
			await linkOAuthAccount(
				env.DB,
				user.id,
				{
					provider: 'google',
					provider_user_id: googleUser.id,
					email: googleUser.email,
					name: googleUser.name,
					picture: googleUser.picture || null,
					access_token: tokenResponse.access_token,
					refresh_token: tokenResponse.refresh_token || null,
					token_expires_at: tokenResponse.expires_in ? new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString() : null,
				},
				linkedMethod
			);
		} else {
			// 使用新的多 OAuth 架构：通过邮箱查找或创建用户，并关联 OAuth 账号
			const result = await findOrCreateUserByEmail(env.DB, googleUser.email, {
				provider: 'google',
				provider_user_id: googleUser.id,
				name: googleUser.name,
				picture: googleUser.picture || null,
				access_token: tokenResponse.access_token,
				refresh_token: tokenResponse.refresh_token || null,
				token_expires_at: tokenResponse.expires_in ? new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString() : null,
			});
			user = result.user;
			isNewUser = result.isNewUser;
			linkedMethod = result.linkedMethod;
		}

		console.log(`[Callback] 用户处理完成，用户 ID: ${user.id}, 是否新用户: ${isNewUser}, 关联方式: ${linkedMethod}`);

		// 检查用户是否被封禁
		if (user.is_banned === 1) {
			console.log(`[Callback] 用户已被封禁: ${user.email}`);
			// 清除 state cookie
			const clearStateCookie = `oauth_state=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${isProduction ? '; Secure' : ''}`;
			return jsonWithCors(
				request,
				env,
				{
					success: false,
					error: 'banned',
					message: '账号已被封禁，无法登录系统',
				},
				403,
				{
					'Set-Cookie': clearStateCookie,
				}
			);
		}

		// 更新最后登录时间（如果字段存在）
		try {
			await env.DB.prepare('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?').bind(now, now, user.id).run();
			console.log(`[Callback] 已更新用户最后登录时间: ${user.email}`);
		} catch (error) {
			// 如果字段不存在，记录警告但不影响登录流程
			console.warn(`[Callback] 更新最后登录时间失败（可能是字段不存在）:`, error);
		}

		// 生成 JWT token
		console.log(`[Callback] 生成 JWT token`);
		const jwtToken = await generateJWT(user.id, user.email, user.name, env.DB, env);
		console.log(`[Callback] JWT token 生成成功`);

		// 清除 state cookie
		const clearStateCookie = `oauth_state=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${isProduction ? '; Secure' : ''}`;

		console.log(`[Callback] 登录成功，返回 JSON 响应`);

		// 返回 JSON 响应，包含 JWT token
		// 不再设置 Cookie，只使用 JWT token
		return jsonWithCors(
			request,
			env,
			{
				success: true,
				token: jwtToken,
				message: '登录成功',
			},
			200,
			{
				'Set-Cookie': clearStateCookie,
			}
		);
	} catch (error) {
		console.error(`[Callback] 处理失败:`, error);
		const clearStateCookie = `oauth_state=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${isProduction ? '; Secure' : ''}`;
		return jsonWithCors(
			request,
			env,
			{
				success: false,
				error: 'server_error',
				message: `OAuth 回调处理失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
			},
			500,
			{
				'Set-Cookie': clearStateCookie,
			}
		);
	}
}

/**
 * 处理登出
 * 返回 JSON 响应而不是重定向
 */
async function handleLogout(request: Request, env: Env): Promise<Response> {
	console.log(`[登出] 处理登出请求`);

	const isProduction = request.url.startsWith('https://');
	const clearCookie = clearSessionCookie(isProduction);

	// 尝试从 JWT token 或 Cookie 会话获取用户信息，更新最后登出时间
	let userId: string | null = null;

	// 优先从 JWT token 获取用户 ID
	const jwtToken = getJWTFromRequest(request);
	if (jwtToken) {
		try {
			const payload = await verifyJWT(jwtToken, env);
			if (payload && payload.userId) {
				userId = payload.userId;
				console.log(`[登出] 从 JWT token 获取用户 ID: ${userId}`);
			}
		} catch (error) {
			console.warn(`[登出] 解析 JWT token 失败:`, error);
		}
	}

	// 如果没有从 token 获取到，尝试从 Cookie 会话获取
	if (!userId) {
		const session = getSessionFromRequest(request);
		if (session) {
			userId = session.userId;
			console.log(`[登出] 从 Cookie 会话获取用户 ID: ${userId}`);
		}
	}

	// 更新用户最后登出时间到 KV
	if (userId) {
		const now = new Date().toISOString();
		try {
			await updateUserLastLogoutKV(env.USER_SESSION, userId, now);
			console.log(`[登出] 已更新用户最后登出时间到 KV: ${userId}`);
		} catch (error) {
			console.error(`[登出] 更新 KV 失败:`, error);
			// 继续执行退出流程，即使更新失败
		}
	} else {
		console.log(`[登出] 未找到用户信息，跳过更新最后登出时间`);
	}

	console.log(`[登出] 清除会话，返回 JSON 响应`);
	// 返回 JSON 响应，包含清除 Cookie 的 Set-Cookie 头
	return jsonWithCors(
		request,
		env,
		{
			success: true,
			message: '登出成功',
		},
		200,
		{
			'Set-Cookie': clearCookie,
		}
	);
}

/**
 * API: Ping 健康检查
 */
function handleApiPing(request: Request, env: Env): Response {
	console.log('[API] /api/ping 请求');
	return jsonWithCors(request, env, { message: 'pong' }, 200);
}

/**
 * API: 用一次性 access_token 换取 JWT token
 * 接收 Bearer access_token，验证后返回 JWT token
 * access_token 使用后立即失效
 */
async function handleApiAccess(request: Request, env: Env): Promise<Response> {
	console.log('[API] /api/access 请求');

	// 从 Authorization header 获取 access_token
	const authHeader = request.headers.get('Authorization');
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		console.log('[API] /api/access 未找到 Authorization header');
		return jsonWithCors(
			request,
			env,
			{
				error: 'Unauthorized',
				message: '缺少 Authorization header',
			},
			401
		);
	}

	const accessToken = authHeader.substring(7);
	console.log('[API] /api/access 获取到 access_token');

	// 从 KV 中交换 access_token 获取 JWT token
	const jwtToken = await exchangeAccessToken(env.USER_SESSION, accessToken);

	if (!jwtToken) {
		console.log('[API] /api/access access_token 无效或已过期');
		return jsonWithCors(
			request,
			env,
			{
				error: 'Unauthorized',
				message: 'access_token 无效或已过期',
			},
			401
		);
	}

	console.log('[API] /api/access 成功交换 JWT token');
	return jsonWithCors(
		request,
		env,
		{
			token: jwtToken,
			message: '成功获取 JWT token',
		},
		200
	);
}

/**
 * API: 生成一次性 access_token
 * 需要用户已登录（通过 JWT token 或 Cookie session）
 */
async function handleApiGenerateAccessToken(request: Request, env: Env): Promise<Response> {
	console.log('[API] /api/access/generate 请求');

	// 尝试从 JWT token 获取用户信息
	let jwtToken: string | null = null;
	const authHeader = request.headers.get('Authorization');
	if (authHeader && authHeader.startsWith('Bearer ')) {
		jwtToken = authHeader.substring(7);
	}

	// 如果没有 JWT token，尝试从 Cookie session 获取
	if (!jwtToken) {
		const session = getSessionFromRequest(request);
		if (session) {
			// 从 session 生成 JWT token
			const user = await getUserById(env.DB, session.userId);
			if (user) {
				jwtToken = await generateJWT(user.id, user.email, user.name, env.DB, env);
				console.log('[API] /api/access/generate 从 Cookie session 生成 JWT token');
			}
		}
	}

	// 如果仍然没有 JWT token，返回未授权
	if (!jwtToken) {
		console.log('[API] /api/access/generate 用户未登录');
		return jsonWithCors(
			request,
			env,
			{
				error: 'Unauthorized',
				message: '用户未登录',
			},
			401
		);
	}

	// 验证 JWT token 是否有效
	const payload = await verifyJWT(jwtToken, env, env.USER_SESSION);
	if (!payload) {
		console.log('[API] /api/access/generate JWT token 无效');
		return jsonWithCors(
			request,
			env,
			{
				error: 'Unauthorized',
				message: 'JWT token 无效',
			},
			401
		);
	}

	// 生成一次性 access_token
	const accessToken = await generateAccessToken(env.USER_SESSION, jwtToken);
	console.log('[API] /api/access/generate 成功生成 access_token');

	return jsonWithCors(
		request,
		env,
		{
			accessToken,
			message: '成功生成 access_token，有效期 30 秒',
		},
		200
	);
}

/**
 * API: 返回当前登录用户信息（给前端 Pages 使用）
 * 注意：此接口只支持 Bearer JWT token 验证，不支持跨域 Cookie 会话验证
 */
async function handleApiMe(request: Request, env: Env): Promise<Response> {
	console.log('[API] /api/me 请求 - Worker 已拦截');
	console.log(`[API] /api/me 完整 URL: ${request.url}`);
	console.log(`[API] /api/me 请求方法: ${request.method}`);

	// 检查请求来源，判断是否需要验证 gd 或 discover 模块权限
	const origin = request.headers.get('Origin');
	const referer = request.headers.get('Referer');
	const requestUrl = new URL(request.url);
	const requestHostname = requestUrl.hostname;

	// 添加详细日志用于调试
	console.log(
		`[API] /api/me 请求头信息 - Origin: ${origin || 'null'}, Referer: ${referer || 'null'}, Request Hostname: ${requestHostname}`
	);
	console.log(`[API] /api/me Authorization header: ${request.headers.get('Authorization') || 'null'}`);

	// 检查是否为 gd 模块请求（通过 Origin、Referer 或请求 hostname）
	const isGdRequest =
		(origin && (origin.includes('gd.scalarize.org') || origin.includes('gd.scalarize.cn'))) ||
		(referer && (referer.includes('gd.scalarize.org') || referer.includes('gd.scalarize.cn'))) ||
		(requestHostname && (requestHostname.includes('gd.scalarize.org') || requestHostname.includes('gd.scalarize.cn')));

	// 检查是否为 discover 模块请求（通过 Origin、Referer 或请求 hostname）
	const isDiscoverRequest =
		(origin && (origin.includes('discover.scalarize.org') || origin.includes('discover.scalarize.cn'))) ||
		(referer && (referer.includes('discover.scalarize.org') || referer.includes('discover.scalarize.cn'))) ||
		(requestHostname && (requestHostname.includes('discover.scalarize.org') || requestHostname.includes('discover.scalarize.cn')));

	if (isGdRequest) {
		console.log('[API] /api/me 检测到来自 gd 项目的请求，需要验证 gd 模块权限');
	}
	if (isDiscoverRequest) {
		console.log('[API] /api/me 检测到来自 discover 项目的请求，需要验证 discover 模块权限');
	}

	// 只支持 JWT token 验证（不支持跨域 Cookie）
	// 对于跨域请求（gd/discover），只允许从 Authorization header 获取 token，不允许从 URL 参数获取
	let jwtToken: string | null = null;
	if (isGdRequest || isDiscoverRequest) {
		// 跨域请求：只从 Authorization header 获取 token
		const authHeader = request.headers.get('Authorization');
		if (authHeader && authHeader.startsWith('Bearer ')) {
			jwtToken = authHeader.substring(7);
			console.log('[API] /api/me 从 Authorization header 获取 JWT token（跨域请求）');
		} else {
			console.log('[API] /api/me 跨域请求未找到 Authorization header，返回未登录状态');
			return jsonWithCors(
				request,
				env,
				{
					authenticated: false,
					user: null,
				},
				200
			);
		}
	} else {
		// 同源请求：可以从 Authorization header 或 URL 参数获取 token
		jwtToken = getJWTFromRequest(request);
	}

	if (!jwtToken) {
		console.log('[API] /api/me 未找到 JWT token，返回未登录状态');
		return jsonWithCors(
			request,
			env,
			{
				authenticated: false,
				user: null,
			},
			200
		);
	}

	console.log('[API] /api/me 检测到 JWT token，开始验证');
	const payload = await verifyJWT(jwtToken, env, env.USER_SESSION);
	if (!payload) {
		console.log('[API] /api/me JWT token 验证失败，返回未登录状态');
		return jsonWithCors(
			request,
			env,
			{
				authenticated: false,
				user: null,
			},
			200
		);
	}

	// 从数据库获取完整用户信息
	const user = await getUserById(env.DB, payload.userId);
	if (!user) {
		console.warn(`[API] /api/me JWT token 有效但数据库未找到用户: ${payload.userId}`);
		return jsonWithCors(
			request,
			env,
			{
				authenticated: false,
				user: null,
			},
			200
		);
	}

	const isAdmin = isAdminEmail(user.email);
	const mustChangePassword = user.password_must_change === 1;

	// 如果请求来自 gd 项目，检查用户是否有 gd 模块权限
	if (isGdRequest) {
		const hasGdPermission = await hasModulePermission(env.DB, user.id, 'gd', isAdmin);
		if (!hasGdPermission) {
			console.log(`[API] /api/me 用户 ${user.email} 没有 gd 模块权限，视为未登录`);
			return jsonWithCors(
				request,
				env,
				{
					authenticated: false,
					user: null,
				},
				200
			);
		}
		console.log(`[API] /api/me 用户 ${user.email} 有 gd 模块权限`);
	}

	// 如果请求来自 discover 项目，检查用户是否有 discover 模块权限
	if (isDiscoverRequest) {
		const hasDiscoverPermission = await hasModulePermission(env.DB, user.id, 'discover', isAdmin);
		if (!hasDiscoverPermission) {
			console.log(`[API] /api/me 用户 ${user.email} 没有 discover 模块权限，视为未登录`);
			return jsonWithCors(
				request,
				env,
				{
					authenticated: false,
					user: null,
				},
				200
			);
		}
		console.log(`[API] /api/me 用户 ${user.email} 有 discover 模块权限`);
	}

	console.log(`[API] /api/me JWT 验证成功，返回用户信息: ${user.email}, 管理员: ${isAdmin}, 需要修改密码: ${mustChangePassword}`);
	return jsonWithCors(
		request,
		env,
		{
			authenticated: true,
			user: {
				id: user.id,
				email: user.email,
				name: user.name,
				picture: user.picture ?? null,
				isAdmin,
				mustChangePassword,
			},
		},
		200
	);
}

/**
 * API: 获取用户 Profile（包含原始和自定义信息）
 */
async function handleApiGetProfile(request: Request, env: Env): Promise<Response> {
	console.log('[API] /api/profile GET 请求');

	// 从 JWT token 获取用户信息（仅支持 JWT token）
	const user = await getUserFromRequest(request, env.DB, env);
	if (!user) {
		// 未登录时返回空信息（用于 mini-games 等不需要登录的功能）
		console.log('[API] /api/profile 用户未登录，返回空信息');
		return jsonWithCors(
			request,
			env,
			{
				id: null,
				email: null,
				name: null,
				picture: null,
				isAdmin: false,
			},
			200
		);
	}

	// 检查是否为管理员
	const dbUser = await getUserById(env.DB, user.id);
	const isAdmin = dbUser ? isAdminEmail(dbUser.email) : false;

	console.log(`[API] /api/profile 返回用户 Profile: ${user.email}`);
	return jsonWithCors(
		request,
		env,
		{
			id: user.id,
			email: user.email,
			name: user.name,
			picture: user.picture ?? null,
			isAdmin: isAdmin,
		},
		200
	);
}

/**
 * API: 更新用户 Profile
 */
async function handleApiUpdateProfile(request: Request, env: Env): Promise<Response> {
	console.log('[API] /api/profile PUT 请求');

	// 从 JWT token 获取用户信息（仅支持 JWT token）
	const user = await getUserFromRequest(request, env.DB, env);
	if (!user) {
		console.log('[API] /api/profile PUT 用户未登录或 JWT token 无效');
		return jsonWithCors(
			request,
			env,
			{
				error: 'Unauthorized',
				message: '需要登录',
			},
			401
		);
	}

	try {
		const body = await request.json();
		const { name, picture } = body as {
			name?: string;
			picture?: string | null;
		};

		// 验证输入
		if (name !== undefined && typeof name !== 'string') {
			return jsonWithCors(
				request,
				env,
				{
					error: 'Bad Request',
					message: 'name 必须是字符串',
				},
				400
			);
		}

		// 允许 picture 为 null 或空字符串（用于删除头像）
		if (picture !== undefined && picture !== null && picture !== '' && typeof picture !== 'string') {
			return jsonWithCors(
				request,
				env,
				{
					error: 'Bad Request',
					message: 'picture 必须是字符串、null 或空字符串',
				},
				400
			);
		}

		// 验证 name 长度和必填
		if (name !== undefined) {
			if (name.trim() === '') {
				return jsonWithCors(
					request,
					env,
					{
						error: 'Bad Request',
						message: 'name 不能为空',
					},
					400
				);
			}
			if (name.length > 100) {
				return jsonWithCors(
					request,
					env,
					{
						error: 'Bad Request',
						message: 'name 长度不能超过 100 个字符',
					},
					400
				);
			}
		}

		// 验证 picture 是有效的 URL（如果提供）
		if (picture !== undefined && picture !== null && picture !== '') {
			try {
				const url = new URL(picture);
				// 只允许 http 和 https 协议
				if (url.protocol !== 'http:' && url.protocol !== 'https:') {
					throw new Error('Invalid protocol');
				}
			} catch {
				return jsonWithCors(
					request,
					env,
					{
						error: 'Bad Request',
						message: 'picture 必须是有效的 HTTP(S) URL',
					},
					400
				);
			}
		}

		console.log(`[API] /api/profile 更新用户 Profile: ${user.id}`);
		const updatedUser = await updateUserProfile(env.DB, user.id, {
			name: name !== undefined ? name.trim() : undefined,
			picture: picture === '' ? null : picture,
		});

		// 检查是否为管理员
		const isAdmin = isAdminEmail(updatedUser.email);

		console.log(`[API] /api/profile 更新成功: ${updatedUser.email}`);
		return jsonWithCors(
			request,
			env,
			{
				success: true,
				user: {
					id: updatedUser.id,
					email: updatedUser.email,
					name: updatedUser.name,
					picture: updatedUser.picture ?? null,
					isAdmin: isAdmin,
				},
			},
			200
		);
	} catch (error) {
		console.error('[API] /api/profile 更新失败:', error);
		return jsonWithCors(
			request,
			env,
			{
				error: 'Internal Server Error',
				message: error instanceof Error ? error.message : 'Unknown error',
			},
			500
		);
	}
}

/**
 * 处理图片上传
 */
async function handleImageUpload(request: Request, env: Env): Promise<Response> {
	console.log('[API] /api/upload/image POST 请求');

	// 从 JWT token 获取用户信息（仅支持 JWT token）
	const user = await getUserFromRequest(request, env.DB, env);
	if (!user) {
		console.log('[API] /api/upload/image 用户未登录或 JWT token 无效');
		return jsonWithCors(
			request,
			env,
			{
				error: 'Unauthorized',
				message: '需要登录',
			},
			401
		);
	}

	try {
		// 解析 multipart/form-data
		const formData = await request.formData();
		const file = formData.get('file') as File | null;

		if (!file) {
			return jsonWithCors(
				request,
				env,
				{
					error: 'Bad Request',
					message: '缺少文件',
				},
				400
			);
		}

		// 验证文件类型
		if (!file.type.startsWith('image/')) {
			return jsonWithCors(
				request,
				env,
				{
					error: 'Bad Request',
					message: '只支持图片文件',
				},
				400
			);
		}

		// 验证文件大小（限制为 5MB）
		const maxSize = 5 * 1024 * 1024; // 5MB
		if (file.size > maxSize) {
			return jsonWithCors(
				request,
				env,
				{
					error: 'Bad Request',
					message: '图片大小不能超过 5MB',
				},
				400
			);
		}

		// 生成唯一的文件名：avatars/{userId}/{timestamp}-{random}.{ext}
		const timestamp = Date.now();
		const random = Math.random().toString(36).substring(2, 8);
		const ext = file.name.split('.').pop() || 'jpg';
		const fileName = `avatars/${user.id}/${timestamp}-${random}.${ext}`;

		console.log(`[API] /api/upload/image 上传文件: ${fileName}`);

		// 上传到 R2
		await env.ASSETS.put(fileName, file.stream(), {
			httpMetadata: {
				contentType: file.type,
				cacheControl: 'public, max-age=31536000', // 缓存 1 年
			},
		});

		// 生成公开 URL（必须配置 R2_PUBLIC_URL）
		if (!env.R2_PUBLIC_URL) {
			return jsonWithCors(
				request,
				env,
				{
					error: 'Configuration Error',
					message: 'R2_PUBLIC_URL 未配置',
				},
				500
			);
		}
		const imageUrl = `${env.R2_PUBLIC_URL}/${fileName}`;

		console.log(`[API] /api/upload/image 上传成功: ${imageUrl}`);

		return jsonWithCors(
			request,
			env,
			{
				success: true,
				url: imageUrl,
			},
			200
		);
	} catch (error) {
		console.error('[API] /api/upload/image 上传失败:', error);
		return jsonWithCors(
			request,
			env,
			{
				error: 'Internal Server Error',
				message: error instanceof Error ? error.message : 'Unknown error',
			},
			500
		);
	}
}

/**
 * API: 处理不存在的 API 路由
 */
function handleApiNotFound(request: Request, env: Env): Response {
	console.warn(`[API] 未知 API 路由: ${request.method} ${new URL(request.url).pathname}`);
	return jsonWithCors(
		request,
		env,
		{
			error: 'Not Found',
			path: new URL(request.url).pathname,
		},
		404
	);
}

/**
 * 生成默认头像 SVG（显示用户名首字母）
 */
function generateDefaultAvatar(name: string): string {
	// 获取首字母（大写），如果为空则使用 "?"
	const initial = name && name.length > 0 ? name.charAt(0).toUpperCase() : '?';

	// 转义特殊字符（虽然首字母通常不会有问题，但为了安全）
	const escapedInitial = initial
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');

	// 生成 SVG（圆形，紫色背景，白色文字）
	// 尺寸：120x120，与 web 端的 avatar-preview-placeholder 保持一致
	const svg = `<svg width="120" height="120" xmlns="http://www.w3.org/2000/svg">
	<circle cx="60" cy="60" r="60" fill="#667eea"/>
	<text x="60" y="60" font-family="Arial, sans-serif" font-size="48" font-weight="600" fill="white" text-anchor="middle" dominant-baseline="central">${escapedInitial}</text>
</svg>`;

	return svg;
}

/**
 * 处理用户头像请求
 * 端点: GET /user/avatar/<user_id>
 * 无需身份校验，但需要 CORS 控制（只允许主站和子站引用）
 */
async function handleUserAvatar(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const pathParts = url.pathname.split('/');
	const userId = pathParts[pathParts.length - 1];

	console.log(`[Avatar] 请求用户头像: userId=${userId}`);

	if (!userId) {
		return new Response('Bad Request: Missing user_id', { status: 400 });
	}

	try {
		// 从数据库获取用户信息
		const user = await getUserById(env.DB, userId);
		if (!user) {
			console.log(`[Avatar] 用户不存在: ${userId}`);
			return new Response('User not found', { status: 404 });
		}

		// 如果用户没有设置头像，生成默认头像（SVG）
		if (!user.picture) {
			console.log(`[Avatar] 用户未设置头像，生成默认头像: ${userId}`);
			const defaultAvatar = generateDefaultAvatar(user.name);

			// 设置 CORS 头（只允许主站和子站域名）
			const corsHeaders = getCorsHeaders(request, env);
			corsHeaders.set('Content-Type', 'image/svg+xml');
			corsHeaders.set('Cache-Control', 'public, max-age=86400'); // 默认头像缓存 1 天

			return new Response(defaultAvatar, {
				headers: corsHeaders,
			});
		}

		const pictureUrl = user.picture;
		console.log(`[Avatar] 用户头像 URL: ${pictureUrl}`);

		// 检查是否是 R2 存储的头像（通过 R2_PUBLIC_URL 判断）
		if (env.R2_PUBLIC_URL && pictureUrl.startsWith(env.R2_PUBLIC_URL)) {
			// 从 R2 获取图片
			const r2Path = pictureUrl.replace(env.R2_PUBLIC_URL + '/', '');
			console.log(`[Avatar] 从 R2 获取: ${r2Path}`);

			const object = await env.ASSETS.get(r2Path);
			if (!object) {
				console.log(`[Avatar] R2 文件不存在: ${r2Path}`);
				return new Response('Avatar not found', { status: 404 });
			}

			// 获取 Content-Type
			const contentType = object.httpMetadata?.contentType || 'image/jpeg';
			const cacheControl = object.httpMetadata?.cacheControl || 'public, max-age=31536000';

			// 设置 CORS 头（只允许主站和子站域名）
			const corsHeaders = getCorsHeaders(request, env);
			corsHeaders.set('Content-Type', contentType);
			corsHeaders.set('Cache-Control', cacheControl);

			return new Response(object.body, {
				headers: corsHeaders,
			});
		} else {
			// 外部 URL，代理返回图片内容
			console.log(`[Avatar] 代理外部 URL: ${pictureUrl}`);

			try {
				const imageResponse = await fetch(pictureUrl);
				if (!imageResponse.ok) {
					console.log(`[Avatar] 外部 URL 获取失败: ${imageResponse.status}`);
					return new Response('Avatar not found', { status: 404 });
				}

				const imageData = await imageResponse.arrayBuffer();
				const contentType = imageResponse.headers.get('Content-Type') || 'image/jpeg';

				// 设置 CORS 头（只允许主站和子站域名）
				const corsHeaders = getCorsHeaders(request, env);
				corsHeaders.set('Content-Type', contentType);
				corsHeaders.set('Cache-Control', 'public, max-age=3600'); // 外部 URL 缓存 1 小时

				return new Response(imageData, {
					headers: corsHeaders,
				});
			} catch (error) {
				console.error('[Avatar] 代理外部 URL 失败:', error);
				return new Response('Failed to fetch avatar', { status: 500 });
			}
		}
	} catch (error) {
		console.error('[Avatar] 获取用户头像失败:', error);
		return new Response('Internal Server Error', { status: 500 });
	}
}

/**
 * API: 获取公钥（JWKS 格式）
 * 端点: GET /.well-known/jwks.json
 */
function handleJWKS(request: Request, env: Env): Response {
	console.log('[API] /.well-known/jwks.json 请求');

	// JWKS 格式的公钥配置
	const jwks = {
		keys: [
			{
				kty: 'RSA',
				use: 'sig',
				kid: 'key-1',
				alg: 'RS256',
				n: 'yCbUWpPO6xJe6sok-4Pz8AT-em6rgjjPEPhw_khz37Zy_qY8FTm6ZriJGK-c0ZgeiA-TzVzYyJxPlk58FFLdrcqOgQB1iVz9X676jBelaTrI5h9Z2m2QjGV5gQliSw69gP-NpvwbvdPtW9_r93ymt6_fVn3vME6Q79jhxgGvdU4dv1Sf0Ev2sZDUp4PYuEQegxRh1HhmYMSW9j9m5Lr2yS2os1JqQvWNdQNv_9B-uuimXpbRFr3bQ2P-UZ9hDWtmzukzBAgTVmCHliMT_41cMFEj0zw7MFbm3w8duE96mF1yO-a9b1ew0Stv1NvMrAwD0GrqvOPPKXX5SxINZtSBbw',
				e: 'AQAB',
			},
		],
	};

	return new Response(JSON.stringify(jwks), {
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': 'public, max-age=3600', // 缓存 1 小时
		},
	});
}

/**
 * API: 处理 CORS 预检请求
 */
function handleApiOptions(request: Request, env: Env): Response {
	console.log('[API] 处理 CORS 预检请求');
	const headers = getCorsHeaders(request, env);
	return new Response(null, {
		status: 204,
		headers,
	});
}

/**
 * API: 管理员 - 获取 Cloudflare 用量数据
 */
async function handleAdminAnalytics(request: Request, env: Env): Promise<Response> {
	console.log('[API] /api/admin/analytics 请求');

	// 检查管理员权限（仅支持 JWT token）
	const admin = await checkAdminAccess(request, env.DB, env);
	if (!admin) {
		console.log('[API] /api/admin/analytics 权限不足');
		return jsonWithCors(
			request,
			env,
			{
				error: 'Forbidden',
				message: '需要管理员权限',
			},
			403
		);
	}

	// 检查环境变量配置
	if (!env.CF_API_TOKEN || !env.CF_ACCOUNT_ID) {
		console.error('[API] /api/admin/analytics Cloudflare API 配置不完整');
		return jsonWithCors(
			request,
			env,
			{
				error: 'Configuration Error',
				message: 'Cloudflare API 配置不完整，请联系管理员',
			},
			500
		);
	}

	// 解析查询参数（日期范围，格式：YYYY-MM-DD）
	const url = new URL(request.url);
	const today = new Date().toISOString().split('T')[0];
	const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
	const startDate = url.searchParams.get('startDate') || thirtyDaysAgo; // 默认30天前
	const endDate = url.searchParams.get('endDate') || today; // 默认今天

	try {
		console.log(`[API] /api/admin/analytics 获取用量数据: ${startDate} 到 ${endDate}`);
		const metrics = await getCloudflareUsage(env.CF_ACCOUNT_ID, env.CF_API_TOKEN, startDate, endDate);

		console.log(`[API] /api/admin/analytics 返回用量数据`);
		return jsonWithCors(request, env, metrics, 200);
	} catch (error) {
		console.error(`[API] /api/admin/analytics 获取用量数据失败:`, error);
		return jsonWithCors(
			request,
			env,
			{
				error: 'Internal Server Error',
				message: error instanceof Error ? error.message : '获取用量数据失败',
			},
			500
		);
	}
}

/**
 * API: 管理员 - 获取用户列表
 */
async function handleAdminUsers(request: Request, env: Env): Promise<Response> {
	console.log('[API] /api/admin/users 请求');

	// 检查管理员权限（仅支持 JWT token）
	const admin = await checkAdminAccess(request, env.DB, env);
	if (!admin) {
		console.log('[API] /api/admin/users 权限不足');
		return jsonWithCors(
			request,
			env,
			{
				error: 'Forbidden',
				message: '需要管理员权限',
			},
			403
		);
	}

	try {
		console.log('[API] /api/admin/users 获取用户列表');
		const users = await getAllUsers(env.DB);

		console.log(`[API] /api/admin/users 返回 ${users.length} 个用户`);
		return jsonWithCors(request, env, { users }, 200);
	} catch (error) {
		console.error(`[API] /api/admin/users 获取用户列表失败:`, error);
		return jsonWithCors(
			request,
			env,
			{
				error: 'Internal Server Error',
				message: error instanceof Error ? error.message : '获取用户列表失败',
			},
			500
		);
	}
}

/**
 * 带 CORS 的 JSON 响应工具函数
 */
function jsonWithCors(request: Request, env: Env, data: unknown, status: number, extraHeaders?: Record<string, string>): Response {
	const headers = getCorsHeaders(request, env);
	headers.set('Content-Type', 'application/json; charset=utf-8');
	if (extraHeaders) {
		for (const [key, value] of Object.entries(extraHeaders)) {
			headers.append(key, value);
		}
	}
	return new Response(JSON.stringify(data), {
		status,
		headers,
	});
}

/**
 * 计算 CORS 头
 */
function getCorsHeaders(request: Request, env: Env): Headers {
	const headers = new Headers();

	const origin = request.headers.get('Origin');
	let allowedOrigin: string | null = null;

	if (origin) {
		console.log(`[CORS] 请求 Origin: ${origin}`);
		// 允许 scalarize.org 的所有子域名（包括 joel.scalarize.org 和 gd.scalarize.org）
		if (origin.endsWith('.scalarize.org') || origin === 'https://scalarize.org' || origin === 'http://scalarize.org') {
			allowedOrigin = origin;
			console.log(`[CORS] 允许 scalarize.org 域名: ${origin}`);
		}
		// 允许 scalarize.cn 的所有子域名（包括 joel.scalarize.cn 和 gd.scalarize.cn）
		// 用于支持 gd.scalarize.cn 通过 JWT bearer token 访问 joel.scalarize.cn 的 API
		else if (origin.endsWith('.scalarize.cn') || origin === 'https://scalarize.cn' || origin === 'http://scalarize.cn') {
			allowedOrigin = origin;
			console.log(`[CORS] 允许 scalarize.cn 域名: ${origin}`);
		}
		// 开发环境：允许 localhost
		else if (origin.startsWith('http://localhost:') || origin.startsWith('https://localhost:')) {
			allowedOrigin = origin;
			console.log(`[CORS] 允许 localhost: ${origin}`);
		}
		// 如果配置了前端地址，也允许该地址（用于特殊情况）
		else if (env.FRONTEND_URL) {
			try {
				const frontendOrigin = new URL(env.FRONTEND_URL).origin;
				if (origin === frontendOrigin) {
					allowedOrigin = origin;
					console.log(`[CORS] 允许 FRONTEND_URL: ${origin}`);
				}
			} catch (error) {
				console.error('[CORS] 解析 FRONTEND_URL 失败:', error);
			}
		} else {
			console.log(`[CORS] Origin 不匹配任何规则: ${origin}`);
		}
	} else {
		console.log(`[CORS] 请求没有 Origin header`);
	}

	if (allowedOrigin) {
		headers.set('Access-Control-Allow-Origin', allowedOrigin);
		headers.set('Vary', 'Origin');
		headers.set('Access-Control-Allow-Credentials', 'true');
		console.log(`[CORS] 设置 CORS headers，允许的 Origin: ${allowedOrigin}`);
	} else {
		console.log(`[CORS] 未设置 Access-Control-Allow-Origin（Origin 不匹配）`);
	}

	// 获取请求的 Access-Control-Request-Headers，如果没有则使用默认值
	const requestedHeaders = request.headers.get('Access-Control-Request-Headers');
	const allowHeaders = requestedHeaders || 'Content-Type, Authorization';
	headers.set('Access-Control-Allow-Headers', allowHeaders);
	headers.set('Access-Control-Allow-Methods', 'GET,HEAD,POST,PUT,DELETE,OPTIONS');

	console.log(`[CORS] 设置 Access-Control-Allow-Headers: ${allowHeaders}`);
	console.log(`[CORS] 设置 Access-Control-Allow-Methods: GET,HEAD,POST,PUT,DELETE,OPTIONS`);

	return headers;
}

/**
 * API: 获取用户关联的所有 OAuth 账号
 */
async function handleApiGetOAuthAccounts(request: Request, env: Env): Promise<Response> {
	console.log('[API] /api/profile/oauth-accounts GET 请求');

	// 从 JWT token 获取用户信息（仅支持 JWT token）
	const user = await getUserFromRequest(request, env.DB, env);
	if (!user) {
		console.log('[API] /api/profile/oauth-accounts 用户未登录或 JWT token 无效');
		return jsonWithCors(
			request,
			env,
			{
				error: 'Unauthorized',
				message: '需要登录',
			},
			401
		);
	}

	try {
		const accounts = await getOAuthAccountsByUserId(env.DB, user.id);
		console.log(`[API] /api/profile/oauth-accounts 返回 ${accounts.length} 个 OAuth 账号`);

		// 只返回必要的字段，不返回敏感信息（access_token 等）
		const safeAccounts = accounts.map((account) => ({
			provider: account.provider,
			email: account.email,
			name: account.name,
			picture: account.picture,
			linked_at: account.linked_at,
			linked_method: account.linked_method,
		}));

		return jsonWithCors(request, env, { accounts: safeAccounts }, 200);
	} catch (error) {
		console.error('[API] /api/profile/oauth-accounts 获取失败:', error);
		return jsonWithCors(
			request,
			env,
			{
				error: 'Internal Server Error',
				message: error instanceof Error ? error.message : '获取 OAuth 账号列表失败',
			},
			500
		);
	}
}

/**
 * API: 手动关联新的 OAuth 账号
 */
async function handleApiLinkOAuth(request: Request, env: Env): Promise<Response> {
	console.log('[API] /api/profile/link-oauth POST 请求');

	// 从 JWT token 获取用户信息（仅支持 JWT token）
	const user = await getUserFromRequest(request, env.DB, env);
	if (!user) {
		console.log('[API] /api/profile/link-oauth 用户未登录或 JWT token 无效');
		return jsonWithCors(
			request,
			env,
			{
				error: 'Unauthorized',
				message: '需要登录',
			},
			401
		);
	}

	try {
		const body = await request.json();
		const { provider } = body as { provider: 'google' | string };

		// 暂时只支持 Google，未来可以扩展其他提供商
		if (!provider || provider !== 'google') {
			return jsonWithCors(
				request,
				env,
				{
					error: 'Bad Request',
					message: '目前只支持 "google" 提供商',
				},
				400
			);
		}

		// 检查该 OAuth 是否已关联
		const existingAccounts = await getOAuthAccountsByUserId(env.DB, user.id);
		const alreadyLinked = existingAccounts.some((acc) => acc.provider === provider);
		if (alreadyLinked) {
			return jsonWithCors(
				request,
				env,
				{
					error: 'Bad Request',
					message: '该 Google 账号已关联',
				},
				400
			);
		}

		// 生成授权 URL，跳转到 OAuth 授权页面
		// 注意：这里需要在 state 中编码当前用户 ID，以便回调时知道是手动关联
		const baseUrl = env.BASE_URL || new URL(request.url).origin;
		const state = generateState();
		const linkState = `${state}|link|${user.id}`; // 格式：{randomState}|link|{userId}

		const redirectUri = `${baseUrl}/api/auth/google/callback?link=true`;
		const authUrl = generateGoogleAuthUrl(env.GOOGLE_CLIENT_ID, redirectUri, linkState);

		// 将 state 存储到 Cookie
		const isProduction = request.url.startsWith('https://');
		const stateCookie = `oauth_state=${state}; Path=/; Max-Age=600; HttpOnly; SameSite=Lax${isProduction ? '; Secure' : ''}`;

		return jsonWithCors(
			request,
			env,
			{
				auth_url: authUrl,
			},
			200,
			{
				'Set-Cookie': stateCookie,
			}
		);
	} catch (error) {
		console.error('[API] /api/profile/link-oauth 处理失败:', error);
		return jsonWithCors(
			request,
			env,
			{
				error: 'Internal Server Error',
				message: error instanceof Error ? error.message : '关联 OAuth 账号失败',
			},
			500
		);
	}
}

/**
 * API: 合并账号（将 OAuth 账号从其他用户合并到当前用户）
 */
async function handleApiMergeAccounts(request: Request, env: Env): Promise<Response> {
	console.log('[API] /api/profile/merge-accounts POST 请求');

	// 从 JWT token 获取用户信息（仅支持 JWT token）
	const user = await getUserFromRequest(request, env.DB, env);
	if (!user) {
		console.log('[API] /api/profile/merge-accounts 用户未登录或 JWT token 无效');
		return jsonWithCors(
			request,
			env,
			{
				error: 'Unauthorized',
				message: '需要登录',
			},
			401
		);
	}

	try {
		const body = await request.json();
		const { source_user_id } = body as { source_user_id: string };

		if (!source_user_id) {
			return jsonWithCors(
				request,
				env,
				{
					error: 'Bad Request',
					message: 'source_user_id 不能为空',
				},
				400
			);
		}

		// 检查源用户是否存在
		const sourceUser = await getUserById(env.DB, source_user_id);
		if (!sourceUser) {
			return jsonWithCors(
				request,
				env,
				{
					error: 'Not Found',
					message: '源用户不存在',
				},
				404
			);
		}

		// 获取源用户的所有 OAuth 账号
		const sourceOAuthAccounts = await getOAuthAccountsByUserId(env.DB, source_user_id);

		// 将源用户的所有 OAuth 账号关联到当前用户
		for (const oauthAccount of sourceOAuthAccounts) {
			await updateOAuthAccountUserId(env.DB, oauthAccount.id, user.id);
		}

		// 删除源用户（由于外键 CASCADE，关联的 oauth_accounts 会自动删除）
		await deleteUser(env.DB, source_user_id);

		console.log(`[API] /api/profile/merge-accounts 账号合并成功: ${source_user_id} -> ${user.id}`);

		return jsonWithCors(
			request,
			env,
			{
				success: true,
				message: '账号合并成功',
			},
			200
		);
	} catch (error) {
		console.error('[API] /api/profile/merge-accounts 处理失败:', error);
		return jsonWithCors(
			request,
			env,
			{
				error: 'Internal Server Error',
				message: error instanceof Error ? error.message : '合并账号失败',
			},
			500
		);
	}
}

/**
 * API: 解绑 OAuth 账号
 */
async function handleApiUnlinkOAuth(request: Request, env: Env): Promise<Response> {
	console.log('[API] /api/profile/unlink-oauth POST 请求');

	// 从 JWT token 获取用户信息（仅支持 JWT token）
	const user = await getUserFromRequest(request, env.DB, env);
	if (!user) {
		console.log('[API] /api/profile/unlink-oauth 用户未登录或 JWT token 无效');
		return jsonWithCors(
			request,
			env,
			{
				error: 'Unauthorized',
				message: '需要登录',
			},
			401
		);
	}

	try {
		const body = await request.json();
		const { provider } = body as { provider: 'google' | string };

		// 暂时只支持 Google，未来可以扩展其他提供商
		if (!provider || provider !== 'google') {
			return jsonWithCors(
				request,
				env,
				{
					error: 'Bad Request',
					message: '目前只支持 "google" 提供商',
				},
				400
			);
		}

		// 解绑 OAuth 账号（函数内部会检查是否至少保留一个账号）
		await unlinkOAuthAccount(env.DB, user.id, provider);

		console.log(`[API] /api/profile/unlink-oauth 解绑成功: ${provider}`);

		return jsonWithCors(
			request,
			env,
			{
				success: true,
				message: '解绑成功',
			},
			200
		);
	} catch (error) {
		console.error('[API] /api/profile/unlink-oauth 处理失败:', error);
		return jsonWithCors(
			request,
			env,
			{
				error: 'Internal Server Error',
				message: error instanceof Error ? error.message : '解绑 OAuth 账号失败',
			},
			500
		);
	}
}

/**
 * 处理密码登录（邀请注册制）
 * 仅允许已预设 email + password 的用户登录
 */
async function handlePasswordLogin(request: Request, env: Env): Promise<Response> {
	console.log('[API] /api/auth/login POST 请求');

	try {
		const body = await request.json();
		const { email, password } = body as { email?: string; password?: string };

		// 验证输入
		if (!email || !password) {
			return jsonWithCors(
				request,
				env,
				{
					error: 'Bad Request',
					message: 'email 和 password 都是必填项',
				},
				400
			);
		}

		// 查找用户
		const user = await getUserByEmail(env.DB, email);
		if (!user) {
			// 为了安全，不透露用户是否存在
			return jsonWithCors(
				request,
				env,
				{
					error: 'Unauthorized',
					message: '邮箱或密码错误',
				},
				401
			);
		}

		// 检查用户是否被封禁
		if (user.is_banned === 1) {
			return jsonWithCors(
				request,
				env,
				{
					error: 'Forbidden',
					message: '您的账号已被封禁，无法登录',
				},
				403
			);
		}

		// 检查用户是否有密码（邀请注册制：只有预设的用户才有密码）
		if (!user.password_hash) {
			return jsonWithCors(
				request,
				env,
				{
					error: 'Unauthorized',
					message: '该账号未设置密码，请使用 Google OAuth 登录或联系管理员',
				},
				401
			);
		}

		// 验证密码
		console.log('[API] /api/auth/login 验证密码');
		const isValid = await verifyPassword(password, user.password_hash);
		if (!isValid) {
			return jsonWithCors(
				request,
				env,
				{
					error: 'Unauthorized',
					message: '邮箱或密码错误',
				},
				401
			);
		}

		// 更新最后登录时间
		const now = new Date().toISOString();
		try {
			await env.DB.prepare('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?').bind(now, now, user.id).run();
			console.log('[API] /api/auth/login 已更新用户最后登录时间');
		} catch (error) {
			console.warn('[API] /api/auth/login 更新最后登录时间失败:', error);
		}

		// 生成 JWT token
		console.log('[API] /api/auth/login 生成 JWT token');
		const jwtToken = await generateJWT(user.id, user.email, user.name, env.DB, env);

		console.log('[API] /api/auth/login 登录成功');

		// 检查是否需要修改密码
		const mustChangePassword = user.password_must_change === 1;
		if (mustChangePassword) {
			console.log('[API] /api/auth/login 用户需要修改密码');
		}

		// 返回 JSON 响应，包含 JWT token
		// 不再设置 Cookie，只使用 JWT token
		return jsonWithCors(
			request,
			env,
			{
				success: true,
				user: {
					id: user.id,
					email: user.email,
					name: user.name,
					picture: user.picture ?? null,
				},
				token: jwtToken,
				mustChangePassword: mustChangePassword, // 标记是否需要修改密码
			},
			200
		);
	} catch (error) {
		console.error('[API] /api/auth/login 登录失败:', error);
		return jsonWithCors(
			request,
			env,
			{
				error: 'Internal Server Error',
				message: error instanceof Error ? error.message : '登录失败',
			},
			500
		);
	}
}

/**
 * API: 管理员 - 邀请用户
 */
async function handleAdminInviteUser(request: Request, env: Env): Promise<Response> {
	console.log('[API] /api/admin/invite-user POST 请求');

	// 检查管理员权限（仅支持 JWT token）
	const admin = await checkAdminAccess(request, env.DB, env);
	if (!admin) {
		console.log('[API] /api/admin/invite-user 权限不足');
		return jsonWithCors(
			request,
			env,
			{
				error: 'Forbidden',
				message: '需要管理员权限',
			},
			403
		);
	}

	try {
		const body = await request.json();
		const { email, name } = body as { email?: string; name?: string };

		// 验证输入
		if (!email || !name) {
			return jsonWithCors(
				request,
				env,
				{
					error: 'Bad Request',
					message: 'email 和 name 都是必填项',
				},
				400
			);
		}

		// 验证邮箱格式
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(email)) {
			return jsonWithCors(
				request,
				env,
				{
					error: 'Bad Request',
					message: '邮箱格式无效',
				},
				400
			);
		}

		// 验证 name 长度
		if (name.trim().length === 0 || name.length > 100) {
			return jsonWithCors(
				request,
				env,
				{
					error: 'Bad Request',
					message: 'name 不能为空且长度不能超过 100 个字符',
				},
				400
			);
		}

		// 生成随机密码
		console.log('[API] /api/admin/invite-user 生成随机密码');
		const randomPassword = generateRandomPassword();

		// 生成密码哈希
		console.log('[API] /api/admin/invite-user 生成密码哈希');
		const passwordHash = await hashPassword(randomPassword);

		// 邀请用户（创建或更新用户）
		console.log('[API] /api/admin/invite-user 邀请用户');
		const user = await inviteUser(env.DB, email, name.trim(), passwordHash);

		// 创建 OAuth 账号记录（provider='password'）
		const existingOAuth = await getOAuthAccountByProvider(env.DB, 'password', user.id);
		if (!existingOAuth) {
			await linkOAuthAccount(
				env.DB,
				user.id,
				{
					provider: 'password',
					provider_user_id: user.id,
					email: email,
					name: name.trim(),
					picture: null,
				},
				'manual'
			);
		}

		console.log('[API] /api/admin/invite-user 邀请成功');
		return jsonWithCors(
			request,
			env,
			{
				success: true,
				user: {
					id: user.id,
					email: user.email,
					name: user.name,
				},
				password: randomPassword, // 返回随机密码给管理员
				message: '用户邀请成功，请将密码告知用户',
			},
			200
		);
	} catch (error) {
		console.error('[API] /api/admin/invite-user 邀请失败:', error);
		return jsonWithCors(
			request,
			env,
			{
				error: 'Internal Server Error',
				message: error instanceof Error ? error.message : '邀请用户失败',
			},
			500
		);
	}
}

/**
 * API: 修改密码
 */
async function handleApiChangePassword(request: Request, env: Env): Promise<Response> {
	console.log('[API] /api/profile/change-password POST 请求');

	// 从 JWT token 获取用户信息（仅支持 JWT token）
	const user = await getUserFromRequest(request, env.DB, env);
	if (!user) {
		console.log('[API] /api/profile/change-password 用户未登录或 JWT token 无效');
		return jsonWithCors(
			request,
			env,
			{
				error: 'Unauthorized',
				message: '需要登录',
			},
			401
		);
	}

	try {
		const body = await request.json();
		const { currentPassword, newPassword } = body as { currentPassword?: string; newPassword?: string };

		// 验证输入
		if (!currentPassword || !newPassword) {
			return jsonWithCors(
				request,
				env,
				{
					error: 'Bad Request',
					message: 'currentPassword 和 newPassword 都是必填项',
				},
				400
			);
		}

		// 从数据库获取完整用户信息（需要密码哈希）
		const dbUser = await getUserById(env.DB, user.id);
		if (!dbUser) {
			return jsonWithCors(
				request,
				env,
				{
					error: 'Not Found',
					message: '用户不存在',
				},
				404
			);
		}

		// 检查用户是否有密码
		if (!dbUser.password_hash) {
			return jsonWithCors(
				request,
				env,
				{
					error: 'Bad Request',
					message: '该账号未设置密码',
				},
				400
			);
		}

		// 验证当前密码
		console.log('[API] /api/profile/change-password 验证当前密码');
		const isValid = await verifyPassword(currentPassword, dbUser.password_hash);
		if (!isValid) {
			return jsonWithCors(
				request,
				env,
				{
					error: 'Unauthorized',
					message: '当前密码错误',
				},
				401
			);
		}

		// 验证新密码强度
		const passwordError = validatePasswordStrength(newPassword);
		if (passwordError) {
			return jsonWithCors(
				request,
				env,
				{
					error: 'Bad Request',
					message: passwordError,
				},
				400
			);
		}

		// 检查新密码是否与当前密码相同
		const isSamePassword = await verifyPassword(newPassword, dbUser.password_hash);
		if (isSamePassword) {
			return jsonWithCors(
				request,
				env,
				{
					error: 'Bad Request',
					message: '新密码不能与当前密码相同',
				},
				400
			);
		}

		// 生成新密码哈希
		console.log('[API] /api/profile/change-password 生成新密码哈希');
		const newPasswordHash = await hashPassword(newPassword);

		// 更新密码（清除 must_change 标志）
		console.log('[API] /api/profile/change-password 更新密码');
		await updateUserPassword(env.DB, dbUser.id, newPasswordHash, false);

		console.log('[API] /api/profile/change-password 密码修改成功');
		return jsonWithCors(
			request,
			env,
			{
				success: true,
				message: '密码修改成功',
			},
			200
		);
	} catch (error) {
		console.error('[API] /api/profile/change-password 修改失败:', error);
		return jsonWithCors(
			request,
			env,
			{
				error: 'Internal Server Error',
				message: error instanceof Error ? error.message : '修改密码失败',
			},
			500
		);
	}
}

/**
 * API: 管理员 - 重置用户密码
 */
async function handleAdminResetUserPassword(request: Request, env: Env): Promise<Response> {
	console.log('[API] /api/admin/reset-user-password POST 请求');

	// 检查管理员权限（仅支持 JWT token）
	const admin = await checkAdminAccess(request, env.DB, env);
	if (!admin) {
		console.log('[API] /api/admin/reset-user-password 权限不足');
		return jsonWithCors(
			request,
			env,
			{
				error: 'Forbidden',
				message: '需要管理员权限',
			},
			403
		);
	}

	try {
		const body = await request.json();
		const { userId, newPassword } = body as { userId?: string; newPassword?: string };

		// 验证输入
		if (!userId || !newPassword) {
			return jsonWithCors(
				request,
				env,
				{
					error: 'Bad Request',
					message: 'userId 和 newPassword 都是必填项',
				},
				400
			);
		}

		// 验证新密码强度
		const passwordError = validatePasswordStrength(newPassword);
		if (passwordError) {
			return jsonWithCors(
				request,
				env,
				{
					error: 'Bad Request',
					message: passwordError,
				},
				400
			);
		}

		// 检查用户是否存在
		const user = await getUserById(env.DB, userId);
		if (!user) {
			return jsonWithCors(
				request,
				env,
				{
					error: 'Not Found',
					message: '用户不存在',
				},
				404
			);
		}

		// 生成新密码哈希
		console.log('[API] /api/admin/reset-user-password 生成新密码哈希');
		const passwordHash = await hashPassword(newPassword);

		// 更新密码（设置 must_change 标志，要求用户首次登录后修改密码）
		console.log('[API] /api/admin/reset-user-password 更新密码');
		await updateUserPassword(env.DB, userId, passwordHash, true);

		console.log('[API] /api/admin/reset-user-password 密码重置成功');
		return jsonWithCors(
			request,
			env,
			{
				success: true,
				message: '密码重置成功，用户下次登录后需要修改密码',
			},
			200
		);
	} catch (error) {
		console.error('[API] /api/admin/reset-user-password 重置失败:', error);
		return jsonWithCors(
			request,
			env,
			{
				error: 'Internal Server Error',
				message: error instanceof Error ? error.message : '重置密码失败',
			},
			500
		);
	}
}

/**
 * API: 管理员 - 封禁/解封用户
 */
async function handleAdminBanUser(request: Request, env: Env): Promise<Response> {
	console.log('[API] /api/admin/ban-user POST 请求');

	// 检查管理员权限（仅支持 JWT token）
	const admin = await checkAdminAccess(request, env.DB, env);
	if (!admin) {
		console.log('[API] /api/admin/ban-user 权限不足');
		return jsonWithCors(
			request,
			env,
			{
				error: 'Forbidden',
				message: '需要管理员权限',
			},
			403
		);
	}

	try {
		const body = await request.json();
		const { userId, banned } = body as { userId?: string; banned?: boolean };

		// 验证输入
		if (userId === undefined || banned === undefined) {
			return jsonWithCors(
				request,
				env,
				{
					error: 'Bad Request',
					message: 'userId 和 banned 都是必填项',
				},
				400
			);
		}

		// 检查用户是否存在
		const user = await getUserById(env.DB, userId);
		if (!user) {
			return jsonWithCors(
				request,
				env,
				{
					error: 'Not Found',
					message: '用户不存在',
				},
				404
			);
		}

		// 不能封禁自己（从 JWT token 获取当前用户）
		const currentUser = await getUserFromRequest(request, env.DB, env);
		if (currentUser && currentUser.id === userId && banned) {
			return jsonWithCors(
				request,
				env,
				{
					error: 'Bad Request',
					message: '不能封禁自己的账号',
				},
				400
			);
		}

		// 更新封禁状态
		const now = new Date().toISOString();
		await env.DB.prepare('UPDATE users SET is_banned = ?, updated_at = ? WHERE id = ?')
			.bind(banned ? 1 : 0, now, userId)
			.run();

		console.log(`[API] /api/admin/ban-user ${banned ? '封禁' : '解封'}用户成功: ${user.email}`);
		return jsonWithCors(
			request,
			env,
			{
				success: true,
				message: banned ? '用户已封禁' : '用户已解封',
				user: {
					id: user.id,
					email: user.email,
					name: user.name,
					is_banned: banned ? 1 : 0,
				},
			},
			200
		);
	} catch (error) {
		console.error('[API] /api/admin/ban-user 操作失败:', error);
		return jsonWithCors(
			request,
			env,
			{
				error: 'Internal Server Error',
				message: error instanceof Error ? error.message : '操作失败',
			},
			500
		);
	}
}

/**
 * API: 获取当前用户的授权模块列表
 */
async function handleApiGetUserModules(request: Request, env: Env): Promise<Response> {
	console.log('[API] /api/profile/modules 请求');

	// 从 JWT token 获取用户信息（仅支持 JWT token）
	const user = await getUserFromRequest(request, env.DB, env);
	if (!user) {
		console.log('[API] /api/profile/modules 用户未登录或 JWT token 无效');
		return jsonWithCors(
			request,
			env,
			{
				error: 'Unauthorized',
				message: '需要登录',
			},
			401
		);
	}

	// 从数据库获取完整用户信息（需要检查模块权限）
	const dbUser = await getUserById(env.DB, user.id);
	if (!dbUser) {
		return jsonWithCors(
			request,
			env,
			{
				error: 'Not Found',
				message: '用户不存在',
			},
			404
		);
	}

	const isAdmin = isAdminEmail(dbUser.email);
	const permissions = await getUserModulePermissions(env.DB, dbUser.id);

	// 构建模块权限列表（使用全局配置）
	const modules = getAllModuleIds();
	const modulePermissions: Record<string, boolean> = {};

	for (const moduleId of modules) {
		modulePermissions[moduleId] = await hasModulePermission(env.DB, user.id, moduleId, isAdmin);
	}

	console.log(`[API] /api/profile/modules 返回用户模块权限: ${user.email}`);
	return jsonWithCors(
		request,
		env,
		{
			modules: modulePermissions,
		},
		200
	);
}

/**
 * API: 管理员获取所有用户的模块权限
 */
async function handleAdminGetUserModules(request: Request, env: Env): Promise<Response> {
	console.log('[API] /api/admin/user-modules GET 请求');

	// 检查管理员权限（仅支持 JWT token）
	const admin = await checkAdminAccess(request, env.DB, env);
	if (!admin) {
		console.log('[API] /api/admin/user-modules 权限不足');
		return jsonWithCors(
			request,
			env,
			{
				error: 'Forbidden',
				message: '需要管理员权限',
			},
			403
		);
	}

	const allPermissions = await getAllUserModulePermissions(env.DB);
	const allUsers = await getAllUsers(env.DB);

	// 构建用户模块权限映射
	const userModules: Record<string, string[]> = {};
	for (const user of allUsers) {
		userModules[user.id] = [];
	}
	for (const perm of allPermissions) {
		if (!userModules[perm.user_id]) {
			userModules[perm.user_id] = [];
		}
		userModules[perm.user_id].push(perm.module_id);
	}

	console.log('[API] /api/admin/user-modules 返回所有用户模块权限');
	return jsonWithCors(
		request,
		env,
		{
			userModules,
		},
		200
	);
}

/**
 * API: 管理员授予用户模块权限
 */
async function handleAdminGrantModule(request: Request, env: Env): Promise<Response> {
	console.log('[API] /api/admin/user-modules POST 请求');

	// 检查管理员权限（仅支持 JWT token）
	const admin = await checkAdminAccess(request, env.DB, env);
	if (!admin) {
		console.log('[API] /api/admin/user-modules POST 权限不足');
		return jsonWithCors(
			request,
			env,
			{
				error: 'Forbidden',
				message: '需要管理员权限',
			},
			403
		);
	}

	try {
		const body = await request.json();
		const { userId, moduleId } = body as { userId?: string; moduleId?: string };

		if (!userId || !moduleId) {
			return jsonWithCors(
				request,
				env,
				{
					error: 'Bad Request',
					message: 'userId 和 moduleId 都是必填项',
				},
				400
			);
		}

		// 验证模块 ID（使用全局配置）
		if (!isPermissionRequiredModule(moduleId)) {
			return jsonWithCors(
				request,
				env,
				{
					error: 'Bad Request',
					message: `moduleId 必须是以下之一: ${getPermissionRequiredModuleIds().join('、')}`,
				},
				400
			);
		}

		// 验证用户是否存在
		const targetUser = await getUserById(env.DB, userId);
		if (!targetUser) {
			return jsonWithCors(
				request,
				env,
				{
					error: 'Not Found',
					message: '用户不存在',
				},
				404
			);
		}

		await grantModulePermission(env.DB, userId, moduleId, admin.id);

		// 提醒：需要手动更新 PERM_VERSION 环境变量并重新部署
		const currentPermVersion = env.PERM_VERSION || '1';
		const nextPermVersion = String(Number(currentPermVersion) + 1);
		console.log(`[权限] 权限已变更，请更新 PERM_VERSION 环境变量`);
		console.log(`[权限] 当前 PERM_VERSION: ${currentPermVersion}`);
		console.log(`[权限] 建议更新为: ${nextPermVersion}`);
		console.log(`[权限] 更新后需要重新部署主站，子站也需要更新 MIN_PERM_VERSION`);

		console.log(`[API] /api/admin/user-modules 授予权限成功: ${userId} -> ${moduleId}`);
		return jsonWithCors(
			request,
			env,
			{
				success: true,
				message: '模块权限授予成功',
				permVersionReminder: {
					current: currentPermVersion,
					recommended: nextPermVersion,
					note: '请更新 PERM_VERSION 环境变量并重新部署',
				},
			},
			200
		);
	} catch (error) {
		console.error('[API] /api/admin/user-modules 授予权限失败:', error);
		return jsonWithCors(
			request,
			env,
			{
				error: 'Internal Server Error',
				message: error instanceof Error ? error.message : '授予权限失败',
			},
			500
		);
	}
}

/**
 * API: 管理员撤销用户模块权限
 */
async function handleAdminRevokeModule(request: Request, env: Env): Promise<Response> {
	console.log('[API] /api/admin/user-modules DELETE 请求');

	// 检查管理员权限（仅支持 JWT token）
	const admin = await checkAdminAccess(request, env.DB, env);
	if (!admin) {
		console.log('[API] /api/admin/user-modules DELETE 权限不足');
		return jsonWithCors(
			request,
			env,
			{
				error: 'Forbidden',
				message: '需要管理员权限',
			},
			403
		);
	}

	try {
		const url = new URL(request.url);
		const userId = url.searchParams.get('userId');
		const moduleId = url.searchParams.get('moduleId');

		if (!userId || !moduleId) {
			return jsonWithCors(
				request,
				env,
				{
					error: 'Bad Request',
					message: 'userId 和 moduleId 都是必填项',
				},
				400
			);
		}

		// 验证模块 ID（使用全局配置）
		if (!isPermissionRequiredModule(moduleId)) {
			return jsonWithCors(
				request,
				env,
				{
					error: 'Bad Request',
					message: `moduleId 必须是以下之一: ${getPermissionRequiredModuleIds().join('、')}`,
				},
				400
			);
		}

		await revokeModulePermission(env.DB, userId, moduleId);

		// 提醒：需要手动更新 PERM_VERSION 环境变量并重新部署
		const currentPermVersion = env.PERM_VERSION || '1';
		const nextPermVersion = String(Number(currentPermVersion) + 1);
		console.log(`[权限] 权限已变更，请更新 PERM_VERSION 环境变量`);
		console.log(`[权限] 当前 PERM_VERSION: ${currentPermVersion}`);
		console.log(`[权限] 建议更新为: ${nextPermVersion}`);
		console.log(`[权限] 更新后需要重新部署主站，子站也需要更新 MIN_PERM_VERSION`);

		console.log(`[API] /api/admin/user-modules 撤销权限成功: ${userId} -> ${moduleId}`);
		return jsonWithCors(
			request,
			env,
			{
				success: true,
				message: '模块权限撤销成功',
				permVersionReminder: {
					current: currentPermVersion,
					recommended: nextPermVersion,
					note: '请更新 PERM_VERSION 环境变量并重新部署',
				},
			},
			200
		);
	} catch (error) {
		console.error('[API] /api/admin/user-modules 撤销权限失败:', error);
		return jsonWithCors(
			request,
			env,
			{
				error: 'Internal Server Error',
				message: error instanceof Error ? error.message : '撤销权限失败',
			},
			500
		);
	}
}

/**
 * 拼图游戏图库 Manifest 接口
 */
interface PuzzlerManifest {
	version: number;
	lastUpdate: number;
	maxImageId: number;
	disabledImageIds: number[];
}

const MANIFEST_KEY = 'mini-games/puzzler/images/manifest.json';

/**
 * 统一的 manifest 更新函数
 * 确保版本校验、更新 version 和 lastUpdate 的逻辑一致
 */
async function updateManifest(
	env: Env,
	updater: (current: PuzzlerManifest) => PuzzlerManifest,
	expectedVersion: number
): Promise<{ success: boolean; manifest?: PuzzlerManifest; error?: string; currentVersion?: number }> {
	try {
		// 先读取最新的 manifest，检查版本号
		const currentObject = await env.ASSETS.get(MANIFEST_KEY);
		let currentManifest: PuzzlerManifest;

		if (currentObject) {
			const manifestText = await currentObject.text();
			currentManifest = JSON.parse(manifestText);
		} else {
			// 如果 manifest 不存在，创建默认值
			currentManifest = {
				version: 1,
				lastUpdate: Date.now(),
				maxImageId: 10,
				disabledImageIds: [],
			};
		}

		// 检查版本号是否匹配
		if (currentManifest.version !== expectedVersion) {
			console.log(`[API] Manifest 版本号不匹配: 当前=${currentManifest.version}, 请求=${expectedVersion}`);
			return {
				success: false,
				error: '版本号已发生变化，请刷新后重试',
				currentVersion: currentManifest.version,
			};
		}

		// 使用 updater 函数更新 manifest
		const updatedManifest: PuzzlerManifest = {
			...updater(currentManifest),
			version: currentManifest.version + 1, // 自动递增版本号
			lastUpdate: Date.now(), // 自动更新时间戳
		};

		// 写入 R2
		await env.ASSETS.put(MANIFEST_KEY, JSON.stringify(updatedManifest, null, 2), {
			httpMetadata: {
				contentType: 'application/json',
				cacheControl: 'no-cache',
			},
		});

		console.log('[API] Manifest 更新成功，新版本:', updatedManifest.version);
		return { success: true, manifest: updatedManifest };
	} catch (error) {
		console.error('[API] Manifest 更新失败:', error);
		return {
			success: false,
			error: error instanceof Error ? error.message : '更新失败',
		};
	}
}

/**
 * API: 获取拼图游戏图库 manifest
 */
async function handlePuzzlerGetManifest(request: Request, env: Env): Promise<Response> {
	console.log('[API] /api/mini-games/puzzler/manifest GET 请求');

	try {
		// 从 R2 读取 manifest
		const object = await env.ASSETS.get(MANIFEST_KEY);

		if (!object) {
			// 如果 manifest 不存在，返回默认值
			const defaultManifest: PuzzlerManifest = {
				version: 1,
				lastUpdate: Date.now(),
				maxImageId: 10, // 默认最大图片 ID
				disabledImageIds: [],
			};

			console.log('[API] /api/mini-games/puzzler/manifest manifest 不存在，返回默认值');
			return jsonWithCors(request, env, defaultManifest, 200);
		}

		// 解析 JSON
		const manifestText = await object.text();
		const manifest: PuzzlerManifest = JSON.parse(manifestText);

		console.log('[API] /api/mini-games/puzzler/manifest 返回 manifest');
		return jsonWithCors(request, env, manifest, 200);
	} catch (error) {
		console.error('[API] /api/mini-games/puzzler/manifest 读取失败:', error);
		return jsonWithCors(
			request,
			env,
			{
				error: 'Internal Server Error',
				message: error instanceof Error ? error.message : '读取 manifest 失败',
			},
			500
		);
	}
}

/**
 * API: 更新拼图游戏图库 manifest（仅管理员）
 */
async function handlePuzzlerUpdateManifest(request: Request, env: Env): Promise<Response> {
	console.log('[API] /api/mini-games/puzzler/manifest PUT 请求');

	// 从 JWT token 获取用户信息（仅支持 JWT token）
	const user = await getUserFromRequest(request, env.DB, env);
	if (!user) {
		console.log('[API] /api/mini-games/puzzler/manifest 用户未登录或 JWT token 无效');
		return jsonWithCors(
			request,
			env,
			{
				error: 'Unauthorized',
				message: '需要登录',
			},
			401
		);
	}

	// 检查是否为管理员
	const dbUser = await getUserById(env.DB, user.id);
	if (!dbUser) {
		return jsonWithCors(
			request,
			env,
			{
				error: 'Not Found',
				message: '用户不存在',
			},
			404
		);
	}

	const isAdmin = isAdminEmail(dbUser.email);
	if (!isAdmin) {
		console.log('[API] /api/mini-games/puzzler/manifest 非管理员尝试更新 manifest');
		return jsonWithCors(
			request,
			env,
			{
				error: 'Forbidden',
				message: '仅管理员可操作',
			},
			403
		);
	}

	try {
		// 解析请求体
		const body = (await request.json()) as { version: number; disabledImageIds: number[] };
		const { version, disabledImageIds } = body;

		if (typeof version !== 'number' || !Array.isArray(disabledImageIds)) {
			return jsonWithCors(
				request,
				env,
				{
					error: 'Bad Request',
					message: '请求参数无效',
				},
				400
			);
		}

		// 使用统一的 manifest 更新函数
		const result = await updateManifest(
			env,
			(current) => ({
				...current,
				disabledImageIds: disabledImageIds,
			}),
			version
		);

		if (!result.success) {
			if (result.currentVersion !== undefined) {
				return jsonWithCors(
					request,
					env,
					{
						error: 'Conflict',
						message: result.error || '版本号已发生变化，请刷新后重试',
						currentVersion: result.currentVersion,
					},
					409
				);
			}
			return jsonWithCors(
				request,
				env,
				{
					error: 'Internal Server Error',
					message: result.error || '更新失败',
				},
				500
			);
		}

		console.log('[API] /api/mini-games/puzzler/manifest manifest 更新成功');
		return jsonWithCors(request, env, result.manifest!, 200);
	} catch (error) {
		console.error('[API] /api/mini-games/puzzler/manifest 更新失败:', error);
		return jsonWithCors(
			request,
			env,
			{
				error: 'Internal Server Error',
				message: error instanceof Error ? error.message : '更新 manifest 失败',
			},
			500
		);
	}
}

/**
 * API: 上传拼图游戏图片（仅管理员）
 */
async function handlePuzzlerUploadImage(request: Request, env: Env): Promise<Response> {
	console.log('[API] /api/mini-games/puzzler/upload POST 请求');

	// 从 JWT token 获取用户信息（仅支持 JWT token）
	const user = await getUserFromRequest(request, env.DB, env);
	if (!user) {
		console.log('[API] /api/mini-games/puzzler/upload 用户未登录或 JWT token 无效');
		return jsonWithCors(
			request,
			env,
			{
				error: 'Unauthorized',
				message: '需要登录',
			},
			401
		);
	}

	// 检查是否为管理员
	const dbUser = await getUserById(env.DB, user.id);
	if (!dbUser) {
		return jsonWithCors(
			request,
			env,
			{
				error: 'Not Found',
				message: '用户不存在',
			},
			404
		);
	}

	const isAdmin = isAdminEmail(dbUser.email);
	if (!isAdmin) {
		console.log('[API] /api/mini-games/puzzler/upload 非管理员尝试上传图片');
		return jsonWithCors(
			request,
			env,
			{
				error: 'Forbidden',
				message: '仅管理员可操作',
			},
			403
		);
	}

	try {
		// 解析 FormData
		const formData = await request.formData();
		const imageFile = formData.get('image') as File;
		const versionStr = formData.get('version') as string;

		if (!imageFile || !versionStr) {
			return jsonWithCors(
				request,
				env,
				{
					error: 'Bad Request',
					message: '缺少必要参数：image 或 version',
				},
				400
			);
		}

		const version = parseInt(versionStr, 10);
		if (isNaN(version)) {
			return jsonWithCors(
				request,
				env,
				{
					error: 'Bad Request',
					message: 'version 必须是数字',
				},
				400
			);
		}

		// 验证图片类型
		if (!imageFile.type.startsWith('image/')) {
			return jsonWithCors(
				request,
				env,
				{
					error: 'Bad Request',
					message: '文件必须是图片格式',
				},
				400
			);
		}

		// 读取图片数据
		const imageData = await imageFile.arrayBuffer();

		// 使用统一的 manifest 更新函数，增加 maxImageId
		const result = await updateManifest(
			env,
			(current) => ({
				...current,
				maxImageId: current.maxImageId + 1,
			}),
			version
		);

		if (!result.success) {
			if (result.currentVersion !== undefined) {
				return jsonWithCors(
					request,
					env,
					{
						error: 'Conflict',
						message: result.error || '版本号已发生变化，请刷新后重试',
						currentVersion: result.currentVersion,
					},
					409
				);
			}
			return jsonWithCors(
				request,
				env,
				{
					error: 'Internal Server Error',
					message: result.error || '更新 manifest 失败',
				},
				500
			);
		}

		const newImageId = result.manifest!.maxImageId;
		const imageKey = `mini-games/puzzler/images/${newImageId}.jpg`;

		// 上传图片到 R2
		await env.ASSETS.put(imageKey, imageData, {
			httpMetadata: {
				contentType: 'image/jpeg',
				cacheControl: 'public, max-age=31536000', // 缓存一年
			},
		});

		console.log(`[API] /api/mini-games/puzzler/upload 图片上传成功: ${imageKey}`);
		return jsonWithCors(
			request,
			env,
			{
				success: true,
				imageId: newImageId,
				manifest: result.manifest,
			},
			200
		);
	} catch (error) {
		console.error('[API] /api/mini-games/puzzler/upload 上传失败:', error);
		return jsonWithCors(
			request,
			env,
			{
				error: 'Internal Server Error',
				message: error instanceof Error ? error.message : '上传失败',
			},
			500
		);
	}
}
