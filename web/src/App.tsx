import { useEffect, useState } from 'react';
import './App.css';
import Profile from './Profile';
import Admin from './Admin';

interface User {
	id: string;
	email: string;
	name: string;
	picture: string | null;
	isAdmin?: boolean;
	mustChangePassword?: boolean;
}

interface ApiResponse {
	authenticated: boolean;
	user: User | null;
}

function App() {
	const [user, setUser] = useState<User | null>(null);
	const [loading, setLoading] = useState(true);
	
	// 简化 host 判断，直接使用 window.location.hostname
	const isCnHost = window.location.hostname === 'joel.scalarize.cn';

	useEffect(() => {
		const url = new URL(window.location.href);

		// 检查是否是退出后的重定向
		const isLogout = url.searchParams.get('logout') === '1';
		if (isLogout) {
			console.log('[前端] 检测到退出后的重定向，清除 token 和用户状态');
			// 立即清除 token 和用户状态
			localStorage.removeItem('jwt_token');
			setUser(null);
			// 清除 URL 中的 logout 参数
			url.searchParams.delete('logout');
			window.history.replaceState({}, '', url.toString());
			setLoading(false);
			return;
		}

		// 检查 URL 中是否有 token 参数（登录回调）
		const token = url.searchParams.get('token');
		if (token) {
			console.log('[前端] 检测到 URL 中的 token，存储到 localStorage');
			localStorage.setItem('jwt_token', token);
			// 清除 URL 中的 token 参数
			url.searchParams.delete('token');
			window.history.replaceState({}, '', url.toString());
		}

		checkAuth();
	}, []);

	const checkAuth = async () => {
		try {
			console.log('[前端] 开始检查登录状态');
			// 从 localStorage 获取 token（如果有）
			const token = localStorage.getItem('jwt_token');
			const headers: HeadersInit = {
				'Content-Type': 'application/json',
			};
			if (token) {
				headers['Authorization'] = `Bearer ${token}`;
				console.log('[前端] 使用 JWT token 进行认证');
			}

			const response = await fetch('/api/me', {
				credentials: 'include',
				headers,
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
				// 如果未认证，清除 token
				if (token) {
					console.log('[前端] 认证失败，清除 token');
					localStorage.removeItem('jwt_token');
				}
			}
		} catch (error) {
			console.error('[前端] 检查登录状态失败:', error);
			setUser(null);
			// 清除可能无效的 token
			localStorage.removeItem('jwt_token');
		} finally {
			setLoading(false);
		}
	};

	const handleLogin = () => {
		console.log('[前端] 跳转到 Google 登录');
		window.location.href = '/api/auth/google';
	};

	const handleLogout = () => {
		console.log('[前端] 开始登出流程');
		// 立即清除用户状态和 token
		setUser(null);
		localStorage.removeItem('jwt_token');
		console.log('[前端] 已清除本地状态，跳转到退出接口');
		// 直接跳转到退出接口，让后端处理 Cookie 清除和重定向
		// 后端会在重定向 URL 中添加 logout=1 参数
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

	// 如果用户需要修改密码，强制显示修改密码界面（除非已经在修改密码页面）
	if (user && user.mustChangePassword && path !== '/change-password') {
		return (
			<div className="app">
				<Header user={user} onLogin={handleLogin} onLogout={handleLogout} />
				<main className="main-content">
					<ChangePasswordPrompt
						user={user}
						onPasswordChanged={() => {
							// 密码修改成功后，刷新用户信息
							checkAuth();
						}}
					/>
				</main>
			</div>
		);
	}

	return (
		<div className="app">
			<Header user={user} onLogin={handleLogin} onLogout={handleLogout} />
			<main className="main-content">
				{path === '/profile' ? (
					user ? (
						<Profile />
					) : (
						<LoginPrompt onLogin={handleLogin} isCnHost={isCnHost} />
					)
				) : path === '/admin' || path === '/admin/dashboard' || path === '/admin/users' ? (
					user ? (
						<Admin />
					) : (
						<LoginPrompt onLogin={handleLogin} isCnHost={isCnHost} />
					)
				) : path === '/change-password' ? (
					user ? (
						<ChangePasswordPrompt
							user={user}
							onPasswordChanged={() => {
								checkAuth();
							}}
						/>
					) : (
						<LoginPrompt onLogin={handleLogin} isCnHost={isCnHost} />
					)
				) : user ? (
					<Dashboard user={user} isCnHost={isCnHost} />
				) : (
					<LoginPrompt onLogin={handleLogin} isCnHost={isCnHost} />
				)}
			</main>
		</div>
	);
}

function Header({ user, onLogin, onLogout }: { user: User | null; onLogin: () => void; onLogout: () => void }) {
	return (
		<header className="header">
			<div className="header-content">
				<a href="/" className="logo">
					<img src="/joel.png" alt="Joel" className="logo-icon" />
					<h1>Joel 工作台</h1>
				</a>
				<div className="user-section">
					{user ? (
						<div className="user-info">
							<a href="/profile" className="user-link">
								{user.picture ? (
									<img src={user.picture} alt={user.name} className="user-avatar" />
								) : (
									<div className="user-avatar-placeholder">
										{user.name.charAt(0).toUpperCase()}
									</div>
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

function LoginPrompt({ onLogin, isCnHost }: { onLogin: () => void; isCnHost: boolean }) {
	// cnHost 只显示密码登录，不显示 Google OAuth
	const [loginMethod, setLoginMethod] = useState<'google' | 'password'>(isCnHost ? 'password' : 'google');
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	const handlePasswordLogin = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);
		setLoading(true);

		try {
			const response = await fetch('/api/auth/login', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				credentials: 'include',
				body: JSON.stringify({ email, password }),
			});

			const data = await response.json();

			if (!response.ok) {
				setError(data.message || '登录失败');
				setLoading(false);
				return;
			}

			// 登录成功，存储 token
			if (data.token) {
				localStorage.setItem('jwt_token', data.token);

				// 如果用户需要修改密码，不刷新页面，让 App 组件处理
				if (data.mustChangePassword) {
					console.log('[前端] 用户需要修改密码，等待 App 组件处理');
					setLoading(false);
					// 触发 checkAuth 来更新用户状态
					window.location.reload();
				} else {
					// 正常登录，刷新页面
					window.location.reload();
				}
			}
		} catch (err) {
			console.error('[前端] 密码登录失败:', err);
			setError('登录失败，请稍后重试');
			setLoading(false);
		}
	};

	return (
		<div className="login-prompt">
			<div className="login-card">
				<h2>欢迎使用 Joel 工作台</h2>
				{!isCnHost && (
					<div className="login-method-tabs">
						<button
							className={loginMethod === 'google' ? 'active' : ''}
							onClick={() => {
								setLoginMethod('google');
								setError(null);
							}}
						>
							Google 登录
						</button>
						<button
							className={loginMethod === 'password' ? 'active' : ''}
							onClick={() => {
								setLoginMethod('password');
								setError(null);
							}}
						>
							密码登录
						</button>
					</div>
				)}

				{loginMethod === 'google' ? (
					<>
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
					</>
				) : (
					<form onSubmit={handlePasswordLogin} className="password-login-form">
						<p>使用邮箱和密码登录（邀请注册制）</p>
						{error && <div className="login-error">{error}</div>}
						<div className="form-group">
							<label htmlFor="email">邮箱</label>
							<input
								id="email"
								type="email"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								required
								disabled={loading}
								placeholder="your@email.com"
							/>
						</div>
						<div className="form-group">
							<label htmlFor="password">密码</label>
							<input
								id="password"
								type="password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								required
								disabled={loading}
								placeholder="请输入密码"
							/>
						</div>
						<button type="submit" className="password-login-btn" disabled={loading}>
							{loading ? '登录中...' : '登录'}
						</button>
					</form>
				)}

				<div className="legal-links">
					<a href="/legal/privacy-policy.html" target="_blank" rel="noopener noreferrer">
						隐私政策
					</a>
					<span className="legal-separator">·</span>
					<a href="/legal/terms-of-service.html" target="_blank" rel="noopener noreferrer">
						服务条款
					</a>
				</div>
			</div>
		</div>
	);
}

/**
 * 根据 host 信息替换链接中的域名
 * 如果链接包含 .scalarize.org，根据 isCnHost 替换为 .scalarize.cn
 */
function replaceDomainInUrl(url: string, isCnHost: boolean): string {
	if (!isCnHost) {
		return url;
	}

	// 只处理包含 .scalarize.org 的链接
	if (url.includes('.scalarize.org')) {
		return url.replace(/\.scalarize\.org/g, '.scalarize.cn');
	}

	return url;
}

function Dashboard({ user, isCnHost }: { user: User | null; isCnHost: boolean }) {
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
			adminOnly: true,
		},
		{
			id: 'gd',
			title: 'GD 开发',
			description: 'GD 相关开发工具和资源',
			url: 'http://gd.scalarize.org/',
			icon: '⚙️',
			external: false,
		},
		{
			id: 'admin',
			title: '系统管理',
			description: '系统配置和管理入口',
			url: '/admin',
			icon: '⚙️',
			external: false,
			adminOnly: true,
		},
	].map((module) => ({
		...module,
		url: replaceDomainInUrl(module.url, isCnHost),
	}));

	// 如果不是管理员，过滤掉需要管理员权限的模块
	const visibleModules = modules.filter((module) => {
		if (module.adminOnly && !user?.isAdmin) {
			return false;
		}
		return true;
	});

	return (
		<div className="dashboard">
			<h2 className="dashboard-title">功能工作台</h2>
			<div className="modules-grid">
				{visibleModules.map((module) => (
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

/**
 * 修改密码界面（强制修改密码）
 */
function ChangePasswordPrompt({ user, onPasswordChanged }: { user: User; onPasswordChanged: () => void }) {
	const [currentPassword, setCurrentPassword] = useState('');
	const [newPassword, setNewPassword] = useState('');
	const [confirmPassword, setConfirmPassword] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [success, setSuccess] = useState(false);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);

		// 验证新密码和确认密码是否一致
		if (newPassword !== confirmPassword) {
			setError('新密码和确认密码不一致');
			return;
		}

		setLoading(true);

		try {
			const token = localStorage.getItem('jwt_token');
			const headers: HeadersInit = {
				'Content-Type': 'application/json',
			};
			if (token) {
				headers['Authorization'] = `Bearer ${token}`;
			}

			const response = await fetch('/api/profile/change-password', {
				method: 'POST',
				headers,
				credentials: 'include',
				body: JSON.stringify({
					currentPassword,
					newPassword,
				}),
			});

			const data = await response.json();

			if (!response.ok) {
				setError(data.message || '修改密码失败');
				setLoading(false);
				return;
			}

			// 修改成功
			setSuccess(true);
			setLoading(false);

			// 延迟后刷新用户信息
			setTimeout(() => {
				onPasswordChanged();
			}, 1500);
		} catch (err) {
			console.error('[前端] 修改密码失败:', err);
			setError('修改密码失败，请稍后重试');
			setLoading(false);
		}
	};

	if (success) {
		return (
			<div className="change-password-prompt">
				<div className="change-password-card">
					<div className="change-password-success">
						<p className="change-password-success-icon">✅</p>
						<p className="change-password-success-title">密码修改成功！</p>
						<p className="change-password-success-text">正在刷新页面...</p>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="change-password-prompt">
			<div className="change-password-card">
				<h2>修改密码</h2>
				{user.mustChangePassword && <div className="change-password-warning">⚠️ 您使用的是临时密码，必须修改密码后才能正常使用系统</div>}
				<form onSubmit={handleSubmit} className="change-password-form">
					{error && <div className="change-password-error">{error}</div>}
					<div className="form-group">
						<label htmlFor="current-password">当前密码 *</label>
						<input
							id="current-password"
							type="password"
							value={currentPassword}
							onChange={(e) => setCurrentPassword(e.target.value)}
							required
							disabled={loading}
							placeholder="请输入当前密码"
							autoFocus
						/>
					</div>
					<div className="form-group">
						<label htmlFor="new-password">新密码 *</label>
						<input
							id="new-password"
							type="password"
							value={newPassword}
							onChange={(e) => setNewPassword(e.target.value)}
							required
							disabled={loading}
							placeholder="至少8个字符，包含字母和数字"
						/>
						<small className="form-hint">密码长度至少8个字符，必须包含字母和数字</small>
					</div>
					<div className="form-group">
						<label htmlFor="confirm-password">确认新密码 *</label>
						<input
							id="confirm-password"
							type="password"
							value={confirmPassword}
							onChange={(e) => setConfirmPassword(e.target.value)}
							required
							disabled={loading}
							placeholder="请再次输入新密码"
						/>
					</div>
					<button type="submit" className="change-password-btn" disabled={loading}>
						{loading ? '修改中...' : '修改密码'}
					</button>
				</form>
			</div>
		</div>
	);
}

export default App;
