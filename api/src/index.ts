/**
 * Joel - Cloudflare Worker 主入口
 * 支持 Google OAuth 登录和用户信息管理
 */

import { generateAuthUrl, generateState, exchangeCodeForToken, getUserInfo } from './auth/google';
import { setSessionCookie, getSessionFromRequest, clearSessionCookie } from './auth/session';
import { upsertUser, getUserById, updateUserProfile } from './db/schema';
import { loginTemplate, getDashboardTemplate } from './templates';

interface Env {
	DB: D1Database;
	ASSETS: R2Bucket; // R2 bucket for storing uploaded images
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

				// 登出
				if (path === '/api/logout' && request.method === 'GET') {
					return handleLogout(request, env);
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

	// 生成 state 参数（用于 CSRF 防护）
	const state = generateState();
	console.log(`[OAuth] 生成 state: ${state.substring(0, 8)}...`);

	// 构建回调 URL
	const baseUrl = env.BASE_URL || new URL(request.url).origin;
	const redirectUri = `${baseUrl}/api/auth/google/callback`;

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
	const redirectUri = `${baseUrl}/api/auth/google/callback`;

	try {
		// 交换授权码获取访问令牌
		console.log(`[Callback] 交换授权码获取 token`);
		const tokenResponse = await exchangeCodeForToken(code, env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, redirectUri);

		// 获取用户信息
		console.log(`[Callback] 获取用户信息`);
		const googleUser = await getUserInfo(tokenResponse.access_token);

		// 验证邮箱
		if (!googleUser.verified_email) {
			console.warn(`[Callback] 用户邮箱未验证: ${googleUser.email}`);
		}

		// 存储用户信息到数据库
		// 注意：当前架构使用 Google user ID 作为主键
		// 未来扩展多 OAuth 时，需要改为通过 email 查找或创建用户，并创建 oauth_accounts 记录
		console.log(`[Callback] 存储用户信息到数据库`);
		const user = await upsertUser(env.DB, {
			id: googleUser.id, // 当前：直接使用 Google user ID
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

		console.log(`[Callback] 登录成功，准备重定向到前端页面`);

		// 计算登录成功后重定向目标：
		// 1. 如果配置了 FRONTEND_URL，则优先重定向到前端根路径
		// 2. 否则退回到当前 Worker 的根路径（兼容旧行为）
		const targetUrl = env.FRONTEND_URL || '/';
		console.log(`[Callback] 重定向目标: ${targetUrl}`);

		// 重定向到前端 / 首页
		const headers = new Headers();
		headers.set('Location', targetUrl);
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

	console.log(`[登出] 清除会话，重定向到首页`);
	return new Response(null, {
		status: 302,
		headers: {
			Location: '/',
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
 * API: 返回当前登录用户信息（给前端 Pages 使用）
 */
async function handleApiMe(request: Request, env: Env): Promise<Response> {
	console.log('[API] /api/me 请求');

	const session = getSessionFromRequest(request);

	if (!session) {
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

	// 从数据库获取完整用户信息
	const user = await getUserById(env.DB, session.userId);
	if (!user) {
		console.warn(`[API] /api/me 会话存在但数据库未找到用户: ${session.userId}`);
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

	console.log(`[API] /api/me 返回用户信息: ${user.email}`);
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
 * 带 CORS 的 JSON 响应工具函数
 */
function jsonWithCors(request: Request, env: Env, data: unknown, status: number): Response {
	const headers = getCorsHeaders(request, env);
	headers.set('Content-Type', 'application/json; charset=utf-8');
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

	// 如果配置了前端地址，则只允许该地址
	if (env.FRONTEND_URL) {
		try {
			const frontendOrigin = new URL(env.FRONTEND_URL).origin;
			if (origin && origin === frontendOrigin) {
				allowedOrigin = origin;
			}
		} catch (error) {
			console.error('[CORS] 解析 FRONTEND_URL 失败:', error);
		}
	} else {
		// 未配置时，默认只允许同源请求
		const selfOrigin = new URL(request.url).origin;
		if (origin && origin === selfOrigin) {
			allowedOrigin = origin;
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
