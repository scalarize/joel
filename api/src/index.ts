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
import { generateJWT, verifyJWT, getJWTFromRequest } from './auth/jwt';
import { hashPassword, verifyPassword, validatePasswordStrength, generateRandomPassword } from './auth/password';
import {
	User,
	upsertUser,
	getUserById,
	getUserByEmail,
	updateUserProfile,
	getAllUsers,
	findOrCreateUserByEmail,
	getOAuthAccountByProvider,
	getOAuthAccountsByUserId,
	linkOAuthAccount,
	unlinkOAuthAccount,
	updateOAuthAccountUserId,
	deleteUser,
	updateUserPassword,
	inviteUser,
} from './db/schema';
import { updateUserLastLogoutKV, getUserLastLogoutKV } from './auth/session-kv';
import { loginTemplate, getDashboardTemplate } from './templates';
import { checkAdminAccess, isAdminEmail } from './admin/auth';
import { getCloudflareUsage } from './admin/analytics';

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
	 * JWT Secret（用于生成和验证 JWT token）
	 * 生产环境必须配置，建议使用随机字符串
	 */
	JWT_SECRET?: string;
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		const path = url.pathname;

		console.log(`[请求] ${request.method} ${path}`);

		try {
			// API 路由（预留给前后端分离的前端调用）
			if (path.startsWith('/api/')) {
				// 处理预检请求
				if (request.method === 'OPTIONS') {
					return handleApiOptions(request, env);
				}

				if (path === '/api/ping' && request.method === 'GET') {
					return handleApiPing(request, env);
				}

				if (path === '/api/host-info' && request.method === 'GET') {
					return handleApiHostInfo(request, env);
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

				// 管理员 API：封禁/解封用户
				if (path === '/api/admin/ban-user' && request.method === 'POST') {
					return handleAdminBanUser(request, env);
				}

				// 修改密码 API
				if (path === '/api/profile/change-password' && request.method === 'POST') {
					return handleApiChangePassword(request, env);
				}

				return handleApiNotFound(request, env);
			}

			// 根路径 - 显示登录页面或用户信息（保留兼容性，实际由 Pages 处理）
			if (path === '/') {
				return handleIndex(request, env);
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

	// 构建回调 URL
	const baseUrl = env.BASE_URL || new URL(request.url).origin;
	const redirectUri = `${baseUrl}/api/auth/google/callback`;

	// 生成授权 URL
	const authUrl = generateGoogleAuthUrl(env.GOOGLE_CLIENT_ID, redirectUri, state);

	// 将 state 和 redirect 组合编码到 state 参数中（避免使用 Cookie）
	// 格式：{randomState}|{base64EncodedRedirect}
	let finalState = state;
	if (redirect) {
		// 验证 redirect URL 是否为同源或允许的域名（安全考虑）
		try {
			const redirectUrl = new URL(redirect, baseUrl);
			// 只允许 scalarize.org 域名下的跳转
			if (redirectUrl.hostname.endsWith('.scalarize.org') || redirectUrl.hostname === 'scalarize.org') {
				const encodedRedirect = btoa(redirect);
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

	const headers = new Headers();
	headers.set('Location', finalAuthUrl);
	headers.append('Set-Cookie', stateCookie);

	console.log(`[OAuth] 重定向到 Google 授权页面`);
	return new Response(null, {
		status: 302,
		headers,
	});
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
		return new Response(`OAuth 错误: ${error}`, { status: 400 });
	}

	// 验证必要参数
	if (!code || !state) {
		console.error(`[Callback] 缺少必要参数: code=${!!code}, state=${!!state}`);
		return new Response('缺少必要参数', { status: 400 });
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
			redirectFromState = atob(stateParts[1]);
			console.log(`[Callback] 从 state 参数中提取到 redirect URL: ${redirectFromState}`);
		} catch (error) {
			console.warn(`[Callback] 解析 state 中的 redirect URL 失败:`, error);
		}
	}

	const storedState = cookies['oauth_state'];
	if (!storedState || storedState !== randomState) {
		console.error(`[Callback] State 验证失败`);
		return new Response('State 验证失败', { status: 400 });
	}

	console.log(`[Callback] State 验证成功`);

	// 验证环境变量
	if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
		console.error(`[Callback] Google OAuth 配置不完整`);
		return new Response('Google OAuth 未配置', { status: 500 });
	}

	// 构建回调 URL
	const baseUrl = env.BASE_URL || new URL(request.url).origin;
	const redirectUri = `${baseUrl}/api/auth/google/callback`;

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
			const frontendUrl = env.FRONTEND_URL || '/';
			return new Response(
				`<!DOCTYPE html>
<html>
<head>
	<meta charset="UTF-8">
	<title>账号已被封禁</title>
</head>
<body>
	<h1>账号已被封禁</h1>
	<p>您的账号已被封禁，无法登录系统。</p>
	<p><a href="${frontendUrl}">返回首页</a></p>
</body>
</html>`,
				{
					status: 403,
					headers: {
						'Content-Type': 'text/html; charset=utf-8',
					},
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
		const jwtToken = await generateJWT(user.id, user.email, user.name, env);
		console.log(`[Callback] JWT token 生成成功`);

		// 创建会话 Cookie（兼容旧版本）
		const sessionCookie = setSessionCookie(
			{
				userId: user.id,
				email: user.email,
				name: user.name,
			},
			isProduction
		);

		// 清除 state cookie
		const clearStateCookie = `oauth_state=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${isProduction ? '; Secure' : ''}`;

		console.log(`[Callback] 登录成功，准备重定向到前端页面`);

		// 计算登录成功后重定向目标：
		// 1. 优先使用 state 参数中编码的 redirect URL（登录前要访问的页面）
		// 2. 如果配置了 FRONTEND_URL，则重定向到前端根路径
		// 3. 否则退回到当前 Worker 的根路径（兼容旧行为）
		let targetUrl = env.FRONTEND_URL || '/';

		// 优先使用 state 参数中编码的 redirect URL
		if (redirectFromState) {
			try {
				// 验证 redirect URL 是否为同源或允许的域名（安全考虑）
				const redirectUrl = new URL(redirectFromState, new URL(request.url).origin);
				if (redirectUrl.hostname.endsWith('.scalarize.org') || redirectUrl.hostname === 'scalarize.org') {
					targetUrl = redirectFromState;
					console.log(`[Callback] 使用 state 中的跳转目标: ${targetUrl}`);
				} else {
					console.warn(`[Callback] state 中的跳转目标域名不允许: ${redirectUrl.hostname}`);
				}
			} catch (error) {
				console.warn(`[Callback] state 中的跳转目标 URL 格式无效: ${redirectFromState}`, error);
			}
		}

		// 将 JWT token 添加到 URL 参数中
		// 如果 targetUrl 是相对路径，需要使用 baseUrl 作为基础
		const targetUrlObj = new URL(targetUrl, baseUrl);
		targetUrlObj.searchParams.set('token', jwtToken);
		const finalTargetUrl = targetUrlObj.toString();

		console.log(`[Callback] 重定向目标: ${finalTargetUrl}`);

		// 重定向到目标页面
		const headers = new Headers();
		headers.set('Location', finalTargetUrl);
		// 注意：Set-Cookie 不能用逗号拼接，需要多次 append
		headers.append('Set-Cookie', sessionCookie);
		headers.append('Set-Cookie', clearStateCookie);

		return new Response(null, {
			status: 302,
			headers,
		});
	} catch (error) {
		console.error(`[Callback] 处理失败:`, error);
		return new Response(`OAuth 回调处理失败: ${error instanceof Error ? error.message : 'Unknown error'}`, { status: 500 });
	}
}

/**
 * 处理登出
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

	// 获取重定向目标（清除 URL 中的 token 参数）
	const url = new URL(request.url);
	const redirectParam = url.searchParams.get('redirect');
	let targetUrl = '/';

	if (redirectParam) {
		try {
			const redirectUrl = new URL(redirectParam, new URL(request.url).origin);
			// 只允许 scalarize.org 域名下的跳转
			if (redirectUrl.hostname.endsWith('.scalarize.org') || redirectUrl.hostname === 'scalarize.org') {
				// 清除 redirect URL 中的 token 参数
				redirectUrl.searchParams.delete('token');
				targetUrl = redirectUrl.pathname + redirectUrl.search;
				console.log(`[登出] 重定向到指定页面: ${targetUrl}`);
			}
		} catch (error) {
			console.warn(`[登出] 重定向 URL 格式无效: ${redirectParam}`);
		}
	}

	// 在重定向 URL 中添加 logout=1 参数，让前端知道这是退出后的重定向
	const redirectUrl = new URL(targetUrl, new URL(request.url).origin);
	redirectUrl.searchParams.set('logout', '1');
	const finalTargetUrl = redirectUrl.pathname + redirectUrl.search;

	console.log(`[登出] 清除会话，重定向到: ${finalTargetUrl}`);
	return new Response(null, {
		status: 302,
		headers: {
			Location: finalTargetUrl,
			'Set-Cookie': clearCookie,
		},
	});
}

/**
 * API: Ping 健康检查
 */
function handleApiPing(request: Request, env: Env): Response {
	console.log('[API] /api/ping 请求');
	return jsonWithCors(request, env, { message: 'pong' }, 200);
}

/**
 * 获取请求的 host 信息
 * 判断是否为 cnHost（joel.scalarize.cn）
 * 支持反向代理：优先从 X-Forwarded-Host 或 X-Original-Host 获取真实 host
 */
function getHostInfo(request: Request): { host: string; isCnHost: boolean; domainSuffix: string } {
	// 优先从反向代理的请求头获取真实 host
	// X-Forwarded-Host 是常见的反向代理头部
	// X-Original-Host 是 Cloudflare 等使用的头部
	const forwardedHost = request.headers.get('X-Forwarded-Host') || request.headers.get('X-Original-Host') || request.headers.get('Host');

	let host: string;
	if (forwardedHost) {
		// X-Forwarded-Host 可能包含端口，需要提取 hostname
		host = forwardedHost.split(':')[0];
	} else {
		// 回退到从 URL 获取
		const url = new URL(request.url);
		host = url.hostname;
	}

	const isCnHost = host === 'joel.scalarize.cn';
	const domainSuffix = isCnHost ? 'scalarize.cn' : 'scalarize.org';

	console.log(`[Host] 检测到 host: ${host}, isCnHost: ${isCnHost}, domainSuffix: ${domainSuffix}`);
	console.log(
		`[Host] X-Forwarded-Host: ${request.headers.get('X-Forwarded-Host')}, X-Original-Host: ${request.headers.get(
			'X-Original-Host'
		)}, Host: ${request.headers.get('Host')}`
	);

	return { host, isCnHost, domainSuffix };
}

/**
 * API: 返回 host 信息（给前端使用）
 */
function handleApiHostInfo(request: Request, env: Env): Response {
	console.log('[API] /api/host-info 请求');
	const hostInfo = getHostInfo(request);
	return jsonWithCors(request, env, hostInfo, 200);
}

/**
 * API: 返回当前登录用户信息（给前端 Pages 使用）
 */
async function handleApiMe(request: Request, env: Env): Promise<Response> {
	console.log('[API] /api/me 请求');

	// 优先尝试从 JWT token 获取用户信息
	const jwtToken = getJWTFromRequest(request);
	if (jwtToken) {
		console.log('[API] /api/me 检测到 JWT token');
		const payload = await verifyJWT(jwtToken, env, env.USER_SESSION);
		if (payload) {
			// 从数据库获取完整用户信息
			const user = await getUserById(env.DB, payload.userId);
			if (user) {
				const isAdmin = isAdminEmail(user.email);
				const mustChangePassword = user.password_must_change === 1;
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
			} else {
				console.warn(`[API] /api/me JWT token 有效但数据库未找到用户: ${payload.userId}`);
			}
		} else {
			console.log('[API] /api/me JWT token 验证失败');
		}
	}

	// 回退到 Cookie 会话验证（兼容旧版本）
	const session = getSessionFromRequest(request);
	if (session) {
		console.log('[API] /api/me 使用 Cookie 会话验证');
		// 从数据库获取完整用户信息
		const user = await getUserById(env.DB, session.userId);
		if (user) {
			const isAdmin = isAdminEmail(user.email);
			const mustChangePassword = user.password_must_change === 1;
			console.log(
				`[API] /api/me Cookie 会话验证成功，返回用户信息: ${user.email}, 管理员: ${isAdmin}, 需要修改密码: ${mustChangePassword}`
			);
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
		} else {
			console.warn(`[API] /api/me Cookie 会话存在但数据库未找到用户: ${session.userId}`);
		}
	}

	console.log('[API] /api/me 用户未登录');
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

/**
 * API: 获取用户 Profile（包含原始和自定义信息）
 */
async function handleApiGetProfile(request: Request, env: Env): Promise<Response> {
	console.log('[API] /api/profile GET 请求');

	const session = getSessionFromRequest(request);
	if (!session) {
		console.log('[API] /api/profile 用户未登录');
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

	const user = await getUserById(env.DB, session.userId);
	if (!user) {
		console.warn(`[API] /api/profile 数据库未找到用户: ${session.userId}`);
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

	console.log(`[API] /api/profile 返回用户 Profile: ${user.email}`);
	return jsonWithCors(
		request,
		env,
		{
			id: user.id,
			email: user.email,
			name: user.name,
			picture: user.picture ?? null,
		},
		200
	);
}

/**
 * API: 更新用户 Profile
 */
async function handleApiUpdateProfile(request: Request, env: Env): Promise<Response> {
	console.log('[API] /api/profile PUT 请求');

	const session = getSessionFromRequest(request);
	if (!session) {
		console.log('[API] /api/profile 用户未登录');
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
			picture?: string;
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

		if (picture !== undefined && typeof picture !== 'string') {
			return jsonWithCors(
				request,
				env,
				{
					error: 'Bad Request',
					message: 'picture 必须是字符串',
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

		console.log(`[API] /api/profile 更新用户 Profile: ${session.userId}`);
		const updatedUser = await updateUserProfile(env.DB, session.userId, {
			name: name !== undefined ? name.trim() : undefined,
			picture: picture === '' ? null : picture,
		});

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

	const session = getSessionFromRequest(request);
	if (!session) {
		console.log('[API] /api/upload/image 用户未登录');
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
		const fileName = `avatars/${session.userId}/${timestamp}-${random}.${ext}`;

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

	// 检查管理员权限
	const admin = await checkAdminAccess(request, env.DB);
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

	// 检查管理员权限
	const admin = await checkAdminAccess(request, env.DB);
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
		// 允许 scalarize.org 的所有子域名（包括 joel.scalarize.org 和 gd.scalarize.org）
		if (origin.endsWith('.scalarize.org') || origin === 'https://scalarize.org') {
			allowedOrigin = origin;
		}
		// 允许 scalarize.cn 的所有子域名（包括 joel.scalarize.cn 和 gd.scalarize.cn）
		// 用于支持 gd.scalarize.cn 通过 JWT bearer token 访问 joel.scalarize.cn 的 API
		else if (origin.endsWith('.scalarize.cn') || origin === 'https://scalarize.cn') {
			allowedOrigin = origin;
		}
		// 开发环境：允许 localhost
		else if (origin.startsWith('http://localhost:') || origin.startsWith('https://localhost:')) {
			allowedOrigin = origin;
		}
		// 如果配置了前端地址，也允许该地址（用于特殊情况）
		else if (env.FRONTEND_URL) {
			try {
				const frontendOrigin = new URL(env.FRONTEND_URL).origin;
				if (origin === frontendOrigin) {
					allowedOrigin = origin;
				}
			} catch (error) {
				console.error('[CORS] 解析 FRONTEND_URL 失败:', error);
			}
		}
	}

	if (allowedOrigin) {
		headers.set('Access-Control-Allow-Origin', allowedOrigin);
		headers.set('Vary', 'Origin');
		headers.set('Access-Control-Allow-Credentials', 'true');
	}

	headers.set('Access-Control-Allow-Headers', request.headers.get('Access-Control-Request-Headers') || 'Content-Type, Authorization');
	headers.set('Access-Control-Allow-Methods', 'GET,HEAD,POST,PUT,DELETE,OPTIONS');

	return headers;
}

/**
 * API: 获取用户关联的所有 OAuth 账号
 */
async function handleApiGetOAuthAccounts(request: Request, env: Env): Promise<Response> {
	console.log('[API] /api/profile/oauth-accounts GET 请求');

	const session = getSessionFromRequest(request);
	if (!session) {
		console.log('[API] /api/profile/oauth-accounts 用户未登录');
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
		const accounts = await getOAuthAccountsByUserId(env.DB, session.userId);
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

	const session = getSessionFromRequest(request);
	if (!session) {
		console.log('[API] /api/profile/link-oauth 用户未登录');
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
		const existingAccounts = await getOAuthAccountsByUserId(env.DB, session.userId);
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
		const linkState = `${state}|link|${session.userId}`; // 格式：{randomState}|link|{userId}

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

	const session = getSessionFromRequest(request);
	if (!session) {
		console.log('[API] /api/profile/merge-accounts 用户未登录');
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
			await updateOAuthAccountUserId(env.DB, oauthAccount.id, session.userId);
		}

		// 删除源用户（由于外键 CASCADE，关联的 oauth_accounts 会自动删除）
		await deleteUser(env.DB, source_user_id);

		console.log(`[API] /api/profile/merge-accounts 账号合并成功: ${source_user_id} -> ${session.userId}`);

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

	const session = getSessionFromRequest(request);
	if (!session) {
		console.log('[API] /api/profile/unlink-oauth 用户未登录');
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
		await unlinkOAuthAccount(env.DB, session.userId, provider);

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
		const jwtToken = await generateJWT(user.id, user.email, user.name, env);

		// 创建会话 Cookie
		const isProduction = request.url.startsWith('https://');
		const sessionCookie = setSessionCookie(
			{
				userId: user.id,
				email: user.email,
				name: user.name,
			},
			isProduction
		);

		console.log('[API] /api/auth/login 登录成功');

		// 检查是否需要修改密码
		const mustChangePassword = user.password_must_change === 1;
		if (mustChangePassword) {
			console.log('[API] /api/auth/login 用户需要修改密码');
		}

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
			200,
			{
				'Set-Cookie': sessionCookie,
			}
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

	// 检查管理员权限
	const admin = await checkAdminAccess(request, env.DB);
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

	const session = getSessionFromRequest(request);
	if (!session) {
		console.log('[API] /api/profile/change-password 用户未登录');
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

		// 获取用户信息
		const user = await getUserById(env.DB, session.userId);
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

		// 检查用户是否有密码
		if (!user.password_hash) {
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
		const isValid = await verifyPassword(currentPassword, user.password_hash);
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
		const isSamePassword = await verifyPassword(newPassword, user.password_hash);
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
		await updateUserPassword(env.DB, user.id, newPasswordHash, false);

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

	// 检查管理员权限
	const admin = await checkAdminAccess(request, env.DB);
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

	// 检查管理员权限
	const admin = await checkAdminAccess(request, env.DB);
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

		// 不能封禁自己
		const session = getSessionFromRequest(request);
		if (session && session.userId === userId && banned) {
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
