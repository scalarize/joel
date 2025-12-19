import { useEffect, useState } from 'react';
import './App.css';
import Profile from './Profile';
import Admin from './Admin';

interface User {
	id: string;
	email: string;
	name: string;
	picture: string | null;
}

interface ApiResponse {
	authenticated: boolean;
	user: User | null;
}

function App() {
	const [user, setUser] = useState<User | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		checkAuth();
	}, []);

	const checkAuth = async () => {
		try {
			console.log('[前端] 开始检查登录状态');
			const response = await fetch('/api/me', {
				credentials: 'include',
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}

			const data: ApiResponse = await response.json();
			console.log('[前端] 登录状态:', data.authenticated ? '已登录' : '未登录');

			if (data.authenticated && data.user) {
				setUser(data.user);
			} else {
				setUser(null);
			}
		} catch (error) {
			console.error('[前端] 检查登录状态失败:', error);
			setUser(null);
		} finally {
			setLoading(false);
		}
	};

	const handleLogin = () => {
		console.log('[前端] 跳转到 Google 登录');
		window.location.href = '/api/auth/google';
	};

	const handleLogout = () => {
		console.log('[前端] 登出');
		window.location.href = '/api/logout';
	};

	if (loading) {
		return (
			<div className="app">
				<div className="loading">加载中...</div>
			</div>
		);
	}

	// 简单的路由处理
	const path = window.location.pathname;

	return (
		<div className="app">
			<Header user={user} onLogin={handleLogin} onLogout={handleLogout} />
			<main className="main-content">
				{path === '/profile' ? (
					user ? (
						<Profile />
					) : (
						<LoginPrompt onLogin={handleLogin} />
					)
				) : path === '/admin' ? (
					user ? (
						<Admin />
					) : (
						<LoginPrompt onLogin={handleLogin} />
					)
				) : user ? (
					<Dashboard />
				) : (
					<LoginPrompt onLogin={handleLogin} />
				)}
			</main>
		</div>
	);
}

function Header({
	user,
	onLogin,
	onLogout,
}: {
	user: User | null;
	onLogin: () => void;
	onLogout: () => void;
}) {
	return (
		<header className="header">
			<div className="header-content">
				<a href="/" className="logo">
					<h1>Joel</h1>
				</a>
				<div className="user-section">
					{user ? (
						<div className="user-info">
							<a href="/profile" className="user-link">
								{user.picture && (
									<img src={user.picture} alt={user.name} className="user-avatar" />
								)}
								<div className="user-details">
									<span className="user-name">{user.name}</span>
									<span className="user-email">{user.email}</span>
								</div>
							</a>
							<button onClick={onLogout} className="logout-btn">
								退出
							</button>
						</div>
					) : (
						<button onClick={onLogin} className="login-btn">
							登录
						</button>
					)}
				</div>
			</div>
		</header>
	);
}

function LoginPrompt({ onLogin }: { onLogin: () => void }) {
	return (
		<div className="login-prompt">
			<div className="login-card">
				<h2>欢迎使用 Joel</h2>
				<p>请使用 Google 账号登录以访问功能模块</p>
				<button onClick={onLogin} className="google-login-btn">
					<svg className="google-icon" viewBox="0 0 24 24">
						<path
							fill="#4285F4"
							d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
						/>
						<path
							fill="#34A853"
							d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
						/>
						<path
							fill="#FBBC05"
							d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
						/>
						<path
							fill="#EA4335"
							d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
						/>
					</svg>
					使用 Google 登录
				</button>
			</div>
		</div>
	);
}

function Dashboard() {
	const modules = [
		{
			id: 'profile',
			title: '个人资料',
			description: '管理显示名称和头像',
			url: '/profile',
			icon: '👤',
			external: false,
		},
		{
			id: 'favor',
			title: '书签收藏',
			description: '收藏和管理常用链接',
			url: '/favor',
			icon: '🔖',
			external: false,
		},
		{
			id: 'gd',
			title: 'GD 开发',
			description: 'GD 相关开发工具和资源',
			url: 'http://gd.scalarize.org/',
			icon: '⚙️',
			external: true,
		},
		{
			id: 'admin',
			title: '系统管理',
			description: '系统配置和管理入口',
			url: '/admin',
			icon: '⚙️',
			external: false,
		},
	];

	return (
		<div className="dashboard">
			<h2 className="dashboard-title">功能工作台</h2>
			<div className="modules-grid">
				{modules.map((module) => (
					<a
						key={module.id}
						href={module.url}
						className="module-card"
						target={module.external ? '_blank' : undefined}
						rel={module.external ? 'noopener noreferrer' : undefined}
					>
						<div className="module-icon">{module.icon}</div>
						<h3 className="module-title">{module.title}</h3>
						<p className="module-description">{module.description}</p>
					</a>
				))}
			</div>
		</div>
	);
}

export default App;
