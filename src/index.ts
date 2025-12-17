/**
 * Joel - Cloudflare Worker 主入口
 * 支持 Google OAuth 登录和用户信息管理
 */

import { generateAuthUrl, generateState, exchangeCodeForToken, getUserInfo } from './auth/google';
import { setSessionCookie, getSessionFromRequest, clearSessionCookie } from './auth/session';
import { upsertUser, getUserById } from './db/schema';
import { loginTemplate, getUserTemplate } from './templates';

interface Env {
	DB: D1Database;
	GOOGLE_CLIENT_ID: string;
	GOOGLE_CLIENT_SECRET: string;
	BASE_URL?: string;
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		const path = url.pathname;

		console.log(`[请求] ${request.method} ${path}`);

		try {
			// 根路径 - 显示登录页面或用户信息
			if (path === '/') {
				return handleIndex(request, env);
			}

			// Google OAuth 授权入口
			if (path === '/auth/google') {
				return handleGoogleAuth(request, env);
			}

			// Google OAuth Callback
			if (path === '/auth/google/callback') {
				return handleGoogleCallback(request, env);
			}

			// 登出
			if (path === '/logout') {
				return handleLogout(request, env);
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

	// 显示用户信息页面
	console.log(`[首页] 显示用户信息页面`);
	const html = getUserTemplate(user.name, user.email, user.picture || undefined);

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

	// 生成 state 参数（用于 CSRF 防护）
	const state = generateState();
	console.log(`[OAuth] 生成 state: ${state.substring(0, 8)}...`);

	// 构建回调 URL
	const baseUrl = env.BASE_URL || new URL(request.url).origin;
	const redirectUri = `${baseUrl}/auth/google/callback`;

	// 生成授权 URL
	const authUrl = generateAuthUrl(env.GOOGLE_CLIENT_ID, redirectUri, state);

	// 将 state 存储到 Cookie（实际应用中应该使用 KV 或加密存储）
	const stateCookie = `oauth_state=${state}; Path=/; Max-Age=600; HttpOnly; SameSite=Lax`;

	console.log(`[OAuth] 重定向到 Google 授权页面`);
	return new Response(null, {
		status: 302,
		headers: {
			Location: authUrl,
			'Set-Cookie': stateCookie,
		},
	});
}

/**
 * 处理 Google OAuth Callback
 */
async function handleGoogleCallback(request: Request, env: Env): Promise<Response> {
	console.log(`[Callback] 处理 OAuth 回调`);

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

	const storedState = cookies['oauth_state'];
	if (!storedState || storedState !== state) {
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
	const redirectUri = `${baseUrl}/auth/google/callback`;

	try {
		// 交换授权码获取访问令牌
		console.log(`[Callback] 交换授权码获取 token`);
		const tokenResponse = await exchangeCodeForToken(
			code,
			env.GOOGLE_CLIENT_ID,
			env.GOOGLE_CLIENT_SECRET,
			redirectUri
		);

		// 获取用户信息
		console.log(`[Callback] 获取用户信息`);
		const googleUser = await getUserInfo(tokenResponse.access_token);

		// 验证邮箱
		if (!googleUser.verified_email) {
			console.warn(`[Callback] 用户邮箱未验证: ${googleUser.email}`);
		}

		// 存储用户信息到数据库
		console.log(`[Callback] 存储用户信息到数据库`);
		const user = await upsertUser(env.DB, {
			id: googleUser.id,
			email: googleUser.email,
			name: googleUser.name,
			picture: googleUser.picture,
		});

		// 创建会话
		const isProduction = request.url.startsWith('https://');
		const sessionCookie = setSessionCookie(
			{
				userId: user.id,
				email: user.email,
				name: user.name,
			},
			isProduction
		);

		// 清除 state cookie
		const clearStateCookie = 'oauth_state=; Path=/; Max-Age=0';

		console.log(`[Callback] 登录成功，重定向到首页`);
		// 重定向到首页
		const headers = new Headers();
		headers.set('Location', '/');
		// 注意：Set-Cookie 不能用逗号拼接，需要多次 append
		headers.append('Set-Cookie', sessionCookie);
		headers.append('Set-Cookie', clearStateCookie);

		return new Response(null, {
			status: 302,
			headers,
		});
	} catch (error) {
		console.error(`[Callback] 处理失败:`, error);
		return new Response(
			`OAuth 回调处理失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
			{ status: 500 }
		);
	}
}

/**
 * 处理登出
 */
async function handleLogout(request: Request, env: Env): Promise<Response> {
	console.log(`[登出] 处理登出请求`);

	const isProduction = request.url.startsWith('https://');
	const clearCookie = clearSessionCookie(isProduction);

	console.log(`[登出] 清除会话，重定向到首页`);
	return new Response(null, {
		status: 302,
		headers: {
			Location: '/',
			'Set-Cookie': clearCookie,
		},
	});
}

