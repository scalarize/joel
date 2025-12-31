import { useEffect, useState } from 'react';
import './App.css';
import Profile from './Profile';
import Admin from './Admin';
import MiniGames from './MiniGames';
import Puzzler from './Puzzler';
import PuzzlerGallery from './PuzzlerGallery';
import { MODULES } from './modules';

/**
 * 获取 API 基础 URL
 * 根据当前域名判断使用 .org 还是 .cn
 */
function getApiBaseUrl(): string {
	const hostname = window.location.hostname;
	if (hostname === 'joel.scalarize.cn' || hostname.includes('.scalarize.cn')) {
		return 'https://api.joel.scalarize.cn';
	}
	return 'https://api.joel.scalarize.org';
}

/**
 * 构建完整的 API URL
 */
function getApiUrl(path: string): string {
	const baseUrl = getApiBaseUrl();
	// 确保 path 以 / 开头
	const normalizedPath = path.startsWith('/') ? path : `/${path}`;
	return `${baseUrl}${normalizedPath}`;
}

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
	const [modulePermissions, setModulePermissions] = useState<Record<string, boolean> | null>(null);

	// 简化 host 判断，直接使用 window.location.hostname
	const isCnHost = window.location.hostname === 'joel.scalarize.cn';

	useEffect(() => {
		const initializeAuth = async () => {
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
				// 验证 token 是否已存储
				const storedToken = localStorage.getItem('jwt_token');
				console.log('[前端] Token 存储验证:', storedToken ? `已存储 (${storedToken.substring(0, 20)}...)` : '未存储');
				// 清除 URL 中的 token 参数
				url.searchParams.delete('token');
				window.history.replaceState({}, '', url.toString());
				console.log('[前端] Token 已存储，准备验证登录状态');
			}

			// 验证登录状态（会使用 localStorage 中的 token）
			// 在调用前再次确认 token 是否存在
			const tokenBeforeCheck = localStorage.getItem('jwt_token');
			console.log(
				'[前端] 调用 checkAuth 前，localStorage 中的 token:',
				tokenBeforeCheck ? `存在 (${tokenBeforeCheck.substring(0, 20)}...)` : '不存在'
			);
			await checkAuth();
		};

		initializeAuth();
	}, []);

	// 检查登录成功后是否有 redirect 参数需要处理
	useEffect(() => {
		if (user && !loading) {
			const url = new URL(window.location.href);
			const redirectParam = url.searchParams.get('redirect');

			// 如果用户已登录且有 redirect 参数，跳转到 SSO 处理
			if (redirectParam && window.location.pathname !== '/sso') {
				console.log('[前端] 检测到 redirect 参数，跳转到 SSO 处理');
				const ssoUrl = new URL('/sso', window.location.origin);
				ssoUrl.searchParams.set('redirect', redirectParam);
				window.location.href = ssoUrl.toString();
			}
		}
	}, [user, loading]);

	const loadModulePermissions = async () => {
		try {
			const token = localStorage.getItem('jwt_token');
			const headers: HeadersInit = {
				'Content-Type': 'application/json',
			};
			if (token) {
				headers['Authorization'] = `Bearer ${token}`;
			}

			const response = await fetch(getApiUrl('/api/profile/modules'), {
				headers,
			});
			if (response.ok) {
				const data = await response.json();
				setModulePermissions(data.modules);
				console.log('[前端] 模块权限:', data.modules);
			} else {
				console.warn('[前端] 获取模块权限失败');
			}
		} catch (error) {
			console.error('[前端] 获取模块权限失败:', error);
		}
	};

	const checkAuth = async () => {
		try {
			console.log('[前端] 开始检查登录状态');
			// 从 localStorage 获取 token（如果有）
			const token = localStorage.getItem('jwt_token');
			console.log('[前端] checkAuth 中读取的 token:', token ? `存在 (${token.substring(0, 20)}...)` : '不存在');

			// 构建 headers 对象
			const headers: HeadersInit = {
				'Content-Type': 'application/json',
			};

			if (token) {
				headers['Authorization'] = `Bearer ${token}`;
				console.log('[前端] 使用 JWT token 进行认证，Authorization header 已设置');
				console.log('[前端] Authorization header 值:', `Bearer ${token.substring(0, 20)}...`);
			} else {
				console.log('[前端] 未找到 JWT token，不设置 Authorization header');
			}

			const apiUrl = getApiUrl('/api/me');

			const response = await fetch(apiUrl, {
				credentials: 'include',
				headers,
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}

			const data: ApiResponse = await response.json();
			console.log('[前端] 登录状态:', data.authenticated ? '已登录' : '未登录');

			if (data.authenticated && data.user) {
				console.log('[前端] 用户已登录:', data.user.email);
				setUser(data.user);
				// 加载用户模块权限
				loadModulePermissions();
			} else {
				console.log('[前端] 用户未登录');
				setUser(null);
				setModulePermissions(null);
				// 如果未认证，清除 token
				if (token) {
					console.log('[前端] 认证失败，清除 token');
					localStorage.removeItem('jwt_token');
				}
			}
		} catch (error) {
			console.error('[前端] 检查登录状态失败:', error);
			setUser(null);
			setModulePermissions(null);
			// 清除可能无效的 token
			localStorage.removeItem('jwt_token');
		} finally {
			setLoading(false);
		}
	};

	const handleLogin = async () => {
		console.log('[前端] 开始 Google 登录流程');
		try {
			// 调用 API 获取授权 URL
			const response = await fetch(getApiUrl('/api/auth/google'), {
				method: 'GET',
				credentials: 'include',
			});

			if (!response.ok) {
				const errorText = await response.text();
				console.error('[前端] 获取授权 URL 失败:', errorText);
				alert('登录失败，请重试');
				return;
			}

			const data = await response.json();
			console.log('[前端] 获取到授权 URL，重定向到 Google 授权页面');

			// 重定向到 Google 授权页面
			if (data.authUrl) {
				window.location.href = data.authUrl;
			} else {
				console.error('[前端] 响应中缺少 authUrl');
				alert('登录失败，请重试');
			}
		} catch (error) {
			console.error('[前端] 登录流程失败:', error);
			alert('登录失败，请重试');
		}
	};

	const handleLogout = async () => {
		console.log('[前端] 开始登出流程');

		try {
			// 获取 JWT token（如果有）
			const token = localStorage.getItem('jwt_token');
			const headers: HeadersInit = {
				'Content-Type': 'application/json',
			};
			if (token) {
				headers['Authorization'] = `Bearer ${token}`;
			}

			// 异步调用登出 API
			const response = await fetch(getApiUrl('/api/logout'), {
				method: 'GET',
				headers,
				credentials: 'include',
			});

			console.log('[前端] 登出 API 响应状态:', response.status);

			// 解析 JSON 响应
			if (response.ok) {
				const data = await response.json();
				console.log('[前端] 登出成功:', data.message);
			} else {
				console.warn('[前端] 登出 API 返回非成功状态:', response.status);
			}
		} catch (error) {
			console.error('[前端] 登出 API 调用失败:', error);
			// API 调用失败不影响退出流程，继续清除本地状态
		}

		// 清除本地状态
		setUser(null);
		setModulePermissions(null);
		localStorage.removeItem('jwt_token');
		console.log('[前端] 已清除本地状态');

		// 更新 URL 并刷新状态，避免重复重定向
		const currentUrl = new URL(window.location.href);
		currentUrl.pathname = '/';
		currentUrl.search = ''; // 清除所有查询参数
		window.history.replaceState({}, '', currentUrl.toString());

		// 重新检查认证状态（会显示登录页面）
		setLoading(true);
		await checkAuth();
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

	// 处理 Google OAuth 回调路由
	if (path === '/auth/google/callback') {
		return <GoogleCallbackHandler />;
	}

	// 处理 SSO 路由
	if (path === '/sso') {
		return <SSOHandler user={user} />;
	}

	// 如果用户需要修改密码，强制显示修改密码界面（除非已经在修改密码页面）
	if (user && user.mustChangePassword && path !== '/change-password') {
		return (
			<div className="app">
				<Header user={user} onLogout={handleLogout} />
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
			<Header user={user} onLogout={handleLogout} />
			<main className="main-content">
				{path === '/profile' ? (
					user ? (
						<Profile />
					) : (
						<LoginPrompt onLogin={handleLogin} isCnHost={isCnHost} />
					)
				) : path === '/mini-games' ? (
					user ? (
						<MiniGames />
					) : (
						<LoginPrompt onLogin={handleLogin} isCnHost={isCnHost} />
					)
				) : path === '/mini-games/puzzler' ? (
					<Puzzler />
				) : path === '/mini-games/puzzler/gallery' ? (
					<PuzzlerGallery />
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
					<Dashboard user={user} isCnHost={isCnHost} modulePermissions={modulePermissions} />
				) : (
					<LoginPrompt onLogin={handleLogin} isCnHost={isCnHost} />
				)}
			</main>
		</div>
	);
}

function Header({ user, onLogout }: { user: User | null; onLogout: () => void }) {
	return (
		<header className="header">
			<div className="header-content">
				<a href="/" className="logo">
					<img src="/joel.png" alt="Joel" className="logo-icon" />
					<h1>Joel center</h1>
				</a>
				<div className="user-section">
					{user ? (
						<div className="user-info">
							<a href="/profile" className="user-link">
								{user.picture ? (
									<img src={user.picture} alt={user.name} className="user-avatar" />
								) : (
									<div className="user-avatar-placeholder">{user.name.charAt(0).toUpperCase()}</div>
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
						''
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
			const response = await fetch(getApiUrl('/api/auth/login'), {
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
				<h2>welcome to Joel center</h2>
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

function Dashboard({
	user,
	isCnHost,
	modulePermissions,
}: {
	user: User | null;
	isCnHost: boolean;
	modulePermissions: Record<string, boolean> | null;
}) {
	const modules = MODULES.map((module) => ({
		...module,
		url: replaceDomainInUrl(module.url, isCnHost),
	}));

	// 根据用户权限过滤模块
	const visibleModules = modules.filter((module) => {
		// 管理员自动拥有所有模块的访问权限
		if (user?.isAdmin === true) {
			return true;
		}

		// profile 模块所有人可访问
		if (module.id === 'profile') {
			return true;
		}

		// admin 模块只有管理员可访问
		if (module.id === 'admin') {
			return false; // 非管理员不能访问
		}

		// mini-games 模块所有已登录用户可访问（不需要检查授权）
		if (module.id === 'mini-games') {
			return true;
		}

		// favor、gd、discover 需要检查授权
		if (modulePermissions && modulePermissions[module.id] === true) {
			return true;
		}

		return false;
	});

	// 处理模块点击事件
	const handleModuleClick = async (e: React.MouseEvent<HTMLAnchorElement>, module: (typeof visibleModules)[0]) => {
		// 对于 gd 和 discover 模块，需要生成 access_token
		if (module.id === 'gd' || module.id === 'discover') {
			e.preventDefault();

			const jwtToken = localStorage.getItem('jwt_token');
			if (!jwtToken) {
				console.warn(`[Dashboard] 用户未登录，无法访问模块 ${module.id}`);
				alert('请先登录');
				return;
			}

			try {
				console.log(`[Dashboard] 为模块 ${module.id} 生成 access_token`);
				// 调用 API 生成一次性 access_token
				const response = await fetch(getApiUrl('/api/access/generate'), {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${jwtToken}`,
					},
					credentials: 'include',
				});

				if (response.ok) {
					const data = await response.json();
					if (data.accessToken) {
						// 构建带 access_token 的 URL
						const url = new URL(module.url);
						url.searchParams.set('token', data.accessToken);
						console.log(`[Dashboard] 成功生成 access_token，跳转到 ${url.toString()}`);
						// 跳转到带 access_token 的 URL
						window.location.href = url.toString();
					} else {
						console.error(`[Dashboard] API 响应中缺少 accessToken`);
						alert('生成 access_token 失败，请重试');
					}
				} else {
					console.error(`[Dashboard] 生成 access_token 失败: ${response.status}`);
					alert('生成 access_token 失败，请重试');
				}
			} catch (error) {
				console.error(`[Dashboard] 生成 access_token 失败:`, error);
				alert('生成 access_token 失败，请重试');
			}
		}
		// 其他模块直接跳转，不阻止默认行为
	};

	return (
		<div className="dashboard">
			<h2 className="dashboard-title">modules</h2>
			<div className="modules-grid">
				{visibleModules.map((module) => (
					<a
						key={module.id}
						href={module.url}
						className="module-card"
						target={module.external ? '_blank' : undefined}
						rel={module.external ? 'noopener noreferrer' : undefined}
						onClick={(e) => handleModuleClick(e, module)}
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

			const response = await fetch(getApiUrl('/api/profile/change-password'), {
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

/**
 * Google OAuth 回调处理器
 * 接收 Google 回调，调用 API 处理，然后重定向
 */
function GoogleCallbackHandler() {
	const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'banned'>('loading');
	const [message, setMessage] = useState<string>('正在处理登录...');

	useEffect(() => {
		const handleCallback = async () => {
			try {
				console.log('[Google Callback] 处理 Google OAuth 回调');

				// 获取 URL 参数
				const url = new URL(window.location.href);
				const code = url.searchParams.get('code');
				const state = url.searchParams.get('state');
				const error = url.searchParams.get('error');

				// 检查是否有错误
				if (error) {
					console.error('[Google Callback] OAuth 错误:', error);
					setStatus('error');
					setMessage(`登录失败: ${error}`);
					setTimeout(() => {
						window.location.href = '/';
					}, 3000);
					return;
				}

				// 验证必要参数
				if (!code || !state) {
					console.error('[Google Callback] 缺少必要参数');
					setStatus('error');
					setMessage('登录失败: 缺少必要参数');
					setTimeout(() => {
						window.location.href = '/';
					}, 3000);
					return;
				}

				// 构建 API 请求 URL，包含所有查询参数
				const apiUrl = new URL(getApiUrl('/api/auth/google/callback'));
				url.searchParams.forEach((value, key) => {
					apiUrl.searchParams.set(key, value);
				});

				console.log('[Google Callback] 调用 API 处理回调:', apiUrl.toString());

				// 调用 API 处理回调（使用 GET 方法，因为 Google 回调是 GET 请求）
				const response = await fetch(apiUrl.toString(), {
					method: 'GET',
					credentials: 'include',
				});

				console.log('[Google Callback] API 响应状态:', response.status);

				// 解析 JSON 响应
				const data = await response.json();

				if (!response.ok) {
					console.error('[Google Callback] API 返回错误:', data);

					// 检查是否是封禁错误
					if (data.error === 'banned') {
						setStatus('banned');
						setMessage(data.message || '账号已被封禁，无法登录系统');
					} else {
						setStatus('error');
						setMessage(data.message || '登录失败，请重试');
					}

					setTimeout(() => {
						window.location.href = '/';
					}, 3000);
					return;
				}

				// 检查响应是否成功
				if (data.success && data.token) {
					console.log('[Google Callback] 登录成功，存储 JWT token');
					localStorage.setItem('jwt_token', data.token);

					// 清除 URL 中的参数
					const cleanUrl = new URL(window.location.origin);
					window.history.replaceState({}, '', cleanUrl.toString());

					setStatus('success');
					setMessage('登录成功，正在跳转...');

					// 刷新页面以触发 checkAuth
					setTimeout(() => {
						window.location.href = '/';
					}, 1000);
				} else {
					console.error('[Google Callback] API 响应格式错误:', data);
					setStatus('error');
					setMessage('登录失败: 响应格式错误');
					setTimeout(() => {
						window.location.href = '/';
					}, 3000);
				}
			} catch (error) {
				console.error('[Google Callback] 处理失败:', error);
				setStatus('error');
				setMessage('登录失败，请重试');
				setTimeout(() => {
					window.location.href = '/';
				}, 3000);
			}
		};

		handleCallback();
	}, []);

	return (
		<div className="app">
			<div className="loading">
				{status === 'loading' && <div>正在处理登录...</div>}
				{status === 'success' && <div>{message}</div>}
				{status === 'error' && (
					<div>
						<div style={{ color: '#d32f2f', marginBottom: '1rem' }}>{message}</div>
						<div style={{ fontSize: '14px', color: '#666' }}>3 秒后自动跳转到首页</div>
					</div>
				)}
				{status === 'banned' && (
					<div>
						<div style={{ color: '#d32f2f', marginBottom: '1rem' }}>{message}</div>
						<div style={{ fontSize: '14px', color: '#666' }}>3 秒后自动跳转到首页</div>
					</div>
				)}
			</div>
		</div>
	);
}

/**
 * SSO 处理器 - 用于跨域 JWT token 传递
 * 1. 若已登录，将 localStorage 里的 jwt token 传过去
 * 2. redirect url 必须是 allowedDomain (*.scalarize.org 或 *.scalarize.cn)
 * 3. 若未登录，自动跳到登录页
 */
function SSOHandler({ user }: { user: User | null }) {
	useEffect(() => {
		const handleSSO = async () => {
			const url = new URL(window.location.href);
			const redirectParam = url.searchParams.get('redirect');

			// 检查是否有 redirect 参数
			if (!redirectParam) {
				console.error('[SSO] 缺少 redirect 参数');
				alert('缺少 redirect 参数');
				window.location.href = '/';
				return;
			}

			// 验证 redirect URL 是否来自允许的域名
			let redirectUrl: URL;
			try {
				redirectUrl = new URL(redirectParam);
			} catch (error) {
				console.error('[SSO] redirect 参数格式无效');
				alert('redirect 参数格式无效');
				window.location.href = '/';
				return;
			}

			// 验证域名：必须是 *.scalarize.org 或 *.scalarize.cn
			const isAllowedDomain =
				redirectUrl.hostname.endsWith('.scalarize.org') ||
				redirectUrl.hostname === 'scalarize.org' ||
				redirectUrl.hostname.endsWith('.scalarize.cn') ||
				redirectUrl.hostname === 'scalarize.cn';

			if (!isAllowedDomain) {
				console.error(`[SSO] redirect URL 域名不允许: ${redirectUrl.hostname}`);
				alert('redirect URL 域名不允许');
				window.location.href = '/';
				return;
			}

			// 检查用户是否已登录
			if (!user) {
				console.log('[SSO] 用户未登录，重定向到登录页面');
				// 未登录，重定向到登录页面（前端页面），并传递 redirect 参数
				const loginUrl = new URL('/', window.location.origin);
				loginUrl.searchParams.set('redirect', redirectParam);
				window.location.href = loginUrl.toString();
				return;
			}

			// 用户已登录，生成一次性 access_token
			const jwtToken = localStorage.getItem('jwt_token');
			if (!jwtToken) {
				console.warn('[SSO] 用户已登录但 localStorage 中没有 JWT token，重定向到登录页面');
				// 没有 token，重定向到登录页面
				const loginUrl = new URL('/', window.location.origin);
				loginUrl.searchParams.set('redirect', redirectParam);
				window.location.href = loginUrl.toString();
				return;
			}

			// 调用 API 生成一次性 access_token
			try {
				const response = await fetch(getApiUrl('/api/access/generate'), {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${jwtToken}`,
					},
					credentials: 'include',
				});

				if (response.ok) {
					const data = await response.json();
					if (data.accessToken) {
						// 将 access_token 添加到 redirect URL 的参数中
						redirectUrl.searchParams.set('token', data.accessToken);
						console.log('[SSO] 成功生成 access_token');
					} else {
						console.error('[SSO] API 响应中缺少 accessToken');
						alert('生成 access_token 失败，请重试');
						window.location.href = '/';
						return;
					}
				} else {
					console.error('[SSO] 生成 access_token 失败:', response.status);
					alert('生成 access_token 失败，请重试');
					window.location.href = '/';
					return;
				}
			} catch (error) {
				console.error('[SSO] 生成 access_token 失败:', error);
				alert('生成 access_token 失败，请重试');
				window.location.href = '/';
				return;
			}

			console.log(`[SSO] 重定向到 ${redirectUrl.toString()}`);
			window.location.href = redirectUrl.toString();
		};

		handleSSO();
	}, [user]);

	return (
		<div className="app">
			<div className="loading">正在跳转...</div>
		</div>
	);
}

export default App;
