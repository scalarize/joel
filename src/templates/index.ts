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

