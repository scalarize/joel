/**
 * HTML 模板
 */

export const loginTemplate = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>登录 - Joel</title>
	<style>
		* {
			margin: 0;
			padding: 0;
			box-sizing: border-box;
		}

		body {
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
			background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
			min-height: 100vh;
			display: flex;
			align-items: center;
			justify-content: center;
			padding: 20px;
		}

		.container {
			background: white;
			border-radius: 12px;
			box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
			padding: 40px;
			max-width: 400px;
			width: 100%;
			text-align: center;
		}

		h1 {
			color: #333;
			margin-bottom: 10px;
			font-size: 28px;
		}

		p {
			color: #666;
			margin-bottom: 30px;
			font-size: 14px;
		}

		.google-btn {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			background: white;
			border: 1px solid #dadce0;
			border-radius: 4px;
			color: #3c4043;
			cursor: pointer;
			font-size: 14px;
			font-weight: 500;
			height: 40px;
			padding: 0 24px;
			text-decoration: none;
			transition: box-shadow 0.2s;
			width: 100%;
		}

		.google-btn:hover {
			box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
		}

		.google-btn:active {
			box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
		}

		.google-icon {
			width: 18px;
			height: 18px;
			margin-right: 12px;
		}
	</style>
</head>
<body>
	<div class="container">
		<h1>欢迎使用 Joel</h1>
		<p>请使用 Google 账号登录</p>
		<a href="/auth/google" class="google-btn">
			<svg class="google-icon" viewBox="0 0 24 24">
				<path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
				<path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
				<path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
				<path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
			</svg>
			使用 Google 登录
		</a>
	</div>
</body>
</html>`;

export function getUserTemplate(name: string, email: string, picture?: string): string {
	const pictureHtml = picture
		? `<img src="${escapeHtml(picture)}" alt="${escapeHtml(name)}" class="user-avatar">`
		: '';

	return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>用户信息 - Joel</title>
	<style>
		* {
			margin: 0;
			padding: 0;
			box-sizing: border-box;
		}

		body {
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
			background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
			min-height: 100vh;
			display: flex;
			align-items: center;
			justify-content: center;
			padding: 20px;
		}

		.container {
			background: white;
			border-radius: 12px;
			box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
			padding: 40px;
			max-width: 500px;
			width: 100%;
		}

		h1 {
			color: #333;
			margin-bottom: 30px;
			font-size: 28px;
			text-align: center;
		}

		.user-info {
			text-align: center;
			margin-bottom: 30px;
		}

		.user-avatar {
			width: 100px;
			height: 100px;
			border-radius: 50%;
			margin: 0 auto 20px;
			display: block;
			border: 3px solid #667eea;
		}

		.user-name {
			font-size: 24px;
			color: #333;
			margin-bottom: 10px;
		}

		.user-email {
			font-size: 16px;
			color: #666;
			margin-bottom: 20px;
		}

		.logout-btn {
			display: inline-block;
			background: #dc3545;
			color: white;
			border: none;
			border-radius: 4px;
			padding: 12px 24px;
			font-size: 14px;
			font-weight: 500;
			cursor: pointer;
			text-decoration: none;
			transition: background 0.2s;
			width: 100%;
			text-align: center;
		}

		.logout-btn:hover {
			background: #c82333;
		}
	</style>
</head>
<body>
	<div class="container">
		<h1>欢迎回来</h1>
		<div class="user-info">
			${pictureHtml}
			<div class="user-name">${escapeHtml(name)}</div>
			<div class="user-email">${escapeHtml(email)}</div>
		</div>
		<a href="/logout" class="logout-btn">退出登录</a>
	</div>
</body>
</html>`;
}

export function getDashboardTemplate(name: string, email: string, picture?: string): string {
	const safeName = escapeHtml(name);
	const safeEmail = escapeHtml(email);
	const safePicture = picture ? escapeHtml(picture) : '';

	return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Joel 工作台</title>
	<style>
		* {
			margin: 0;
			padding: 0;
			box-sizing: border-box;
		}

		body {
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
			background: #0f172a;
			min-height: 100vh;
			color: #e5e7eb;
		}

		a {
			color: inherit;
			text-decoration: none;
		}

		.layout {
			display: flex;
			flex-direction: column;
			min-height: 100vh;
		}

		.header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			padding: 12px 24px;
			border-bottom: 1px solid rgba(148, 163, 184, 0.4);
			background: rgba(15, 23, 42, 0.9);
			backdrop-filter: blur(12px);
			position: sticky;
			top: 0;
			z-index: 10;
		}

		.header-left {
			display: flex;
			align-items: center;
			gap: 10px;
		}

		.logo {
			width: 28px;
			height: 28px;
			border-radius: 8px;
			background: linear-gradient(135deg, #6366f1, #22c55e);
			display: flex;
			align-items: center;
			justify-content: center;
			font-weight: 700;
			font-size: 18px;
			color: #0b1120;
		}

		.brand-text {
			display: flex;
			flex-direction: column;
			gap: 2px;
		}

		.brand-title {
			font-size: 16px;
			font-weight: 600;
			color: #e5e7eb;
		}

		.brand-subtitle {
			font-size: 12px;
			color: #9ca3af;
		}

		.header-right {
			display: flex;
			align-items: center;
			gap: 12px;
		}

		.user-info {
			display: flex;
			align-items: center;
			gap: 10px;
		}

		.user-avatar {
			width: 32px;
			height: 32px;
			border-radius: 999px;
			border: 2px solid rgba(129, 140, 248, 0.8);
			object-fit: cover;
			background: radial-gradient(circle at 30% 30%, #f9fafb, #9ca3af);
		}

		.user-meta {
			display: flex;
			flex-direction: column;
			gap: 2px;
			text-align: right;
		}

		.user-name {
			font-size: 14px;
			font-weight: 500;
		}

		.user-email {
			font-size: 11px;
			color: #9ca3af;
		}

		.logout-link {
			font-size: 12px;
			color: #f97373;
			padding: 4px 10px;
			border-radius: 999px;
			border: 1px solid rgba(248, 113, 113, 0.5);
			transition: all 0.15s ease;
		}

		.logout-link:hover {
			background: rgba(248, 113, 113, 0.1);
			border-color: rgba(248, 113, 113, 0.8);
		}

		.main {
			flex: 1;
			padding: 24px;
			max-width: 1200px;
			margin: 0 auto;
			width: 100%;
		}

		.main-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 20px;
		}

		.main-title {
			font-size: 24px;
			font-weight: 600;
			color: #f9fafb;
		}

		.main-subtitle {
			font-size: 13px;
			color: #9ca3af;
			margin-top: 4px;
		}

		.grid {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
			gap: 16px;
		}

		.card {
			position: relative;
			background: radial-gradient(circle at top left, rgba(129, 140, 248, 0.35), transparent 55%),
			            radial-gradient(circle at bottom right, rgba(45, 212, 191, 0.4), transparent 55%),
			            #020617;
			border-radius: 16px;
			padding: 18px 18px 20px 18px;
			border: 1px solid rgba(148, 163, 184, 0.35);
			box-shadow: 0 18px 40px rgba(15, 23, 42, 0.8);
			overflow: hidden;
			display: flex;
			flex-direction: column;
			justify-content: space-between;
			transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease, background 0.2s ease;
		}

		.card::before {
			content: '';
			position: absolute;
			inset: 0;
			background: radial-gradient(circle at top, rgba(250, 250, 250, 0.12), transparent 65%);
			opacity: 0;
			transition: opacity 0.25s ease;
			pointer-events: none;
		}

		.card:hover {
			transform: translateY(-4px) scale(1.01);
			box-shadow: 0 26px 60px rgba(15, 23, 42, 0.95);
			border-color: rgba(129, 140, 248, 0.9);
		}

		.card:hover::before {
			opacity: 1;
		}

		.card-header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			margin-bottom: 10px;
			position: relative;
			z-index: 1;
		}

		.card-title {
			font-size: 16px;
			font-weight: 600;
			letter-spacing: 0.02em;
		}

		.card-tag {
			font-size: 11px;
			padding: 3px 8px;
			border-radius: 999px;
			border: 1px solid rgba(148, 163, 184, 0.8);
			color: #e5e7eb;
			background: rgba(15, 23, 42, 0.9);
		}

		.card-desc {
			font-size: 13px;
			color: #cbd5f5;
			margin-bottom: 14px;
			line-height: 1.5;
			position: relative;
			z-index: 1;
		}

		.card-footer {
			display: flex;
			align-items: center;
			justify-content: space-between;
			font-size: 12px;
			color: #a5b4fc;
			position: relative;
			z-index: 1;
		}

		.card-link {
			display: inline-flex;
			align-items: center;
			gap: 6px;
			font-weight: 500;
		}

		.card-link-icon {
			font-size: 14px;
			transition: transform 0.18s ease;
		}

		.card:hover .card-link-icon {
			transform: translateX(3px);
		}

		.card-meta {
			font-size: 11px;
			color: #9ca3af;
		}

		@media (max-width: 640px) {
			.header {
				padding: 10px 14px;
			}

			.main {
				padding: 14px;
			}

			.main-title {
				font-size: 20px;
			}
		}
	</style>
</head>
<body>
	<div class="layout">
		<header class="header">
			<div class="header-left">
				<div class="logo">J</div>
				<div class="brand-text">
					<div class="brand-title">Joel 工作台</div>
					<div class="brand-subtitle">你的个人效率与开发工具集合</div>
				</div>
			</div>
			<div class="header-right">
				<div class="user-info">
					${safePicture
						? `<img src="${safePicture}" alt="${safeName}" class="user-avatar">`
						: `<div class="user-avatar"></div>`}
					<div class="user-meta">
						<div class="user-name">${safeName}</div>
						<div class="user-email">${safeEmail}</div>
					</div>
				</div>
				<a href="/logout" class="logout-link">退出</a>
			</div>
		</header>

		<main class="main">
			<div class="main-header">
				<div>
					<div class="main-title">功能工作台</div>
					<div class="main-subtitle">选择一个功能模块开始你的工作流程</div>
				</div>
			</div>

			<section class="grid" aria-label="功能模块列表">
				<a class="card" href="/favor">
					<div class="card-header">
						<div class="card-title">书签收藏</div>
						<div class="card-tag">收藏夹</div>
					</div>
					<div class="card-desc">
						集中管理你在开发和阅读过程中遇到的优质链接，支持分类与快速访问，
						让常用资源触手可及。
					</div>
					<div class="card-footer">
						<div class="card-link">
							<span>进入功能</span>
							<span class="card-link-icon">→</span>
						</div>
						<div class="card-meta">URL: /favor</div>
					</div>
				</a>

				<a class="card" href="/gd">
					<div class="card-header">
						<div class="card-title">GD 开发</div>
						<div class="card-tag">开发工具</div>
					</div>
					<div class="card-desc">
						面向 GD 相关的开发任务，集中接入调试入口、脚本管理与环境配置，
						帮助你更快搭建与迭代。
					</div>
					<div class="card-footer">
						<div class="card-link">
							<span>进入功能</span>
							<span class="card-link-icon">→</span>
						</div>
						<div class="card-meta">URL: /gd</div>
					</div>
				</a>

				<a class="card" href="/admin">
					<div class="card-header">
						<div class="card-title">系统管理</div>
						<div class="card-tag">管理控制台</div>
					</div>
					<div class="card-desc">
						管理系统配置、用户与权限，查看运行状态与日志，
						为后续扩展与运维预留统一入口。
					</div>
					<div class="card-footer">
						<div class="card-link">
							<span>进入功能</span>
							<span class="card-link-icon">→</span>
						</div>
						<div class="card-meta">URL: /admin</div>
					</div>
				</a>
			</section>
		</main>
	</div>
</body>
</html>`;
}

function escapeHtml(text: string): string {
	const map: Record<string, string> = {
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;',
		'"': '&quot;',
		"'": '&#039;',
	};
	return text.replace(/[&<>"']/g, (m) => map[m]);
}

