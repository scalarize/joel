/**
 * 管理员后台 - 主入口
 * 包含导航和子模块路由
 */

import { useState, useEffect } from 'react';
import './Admin.css';
import AdminDashboard from './AdminDashboard';
import AdminUsers from './AdminUsers';

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

type AdminTab = 'dashboard' | 'users';

export default function Admin() {
	// 从 URL 路径读取当前 tab，默认为 users
	const getTabFromPath = (): AdminTab => {
		const path = window.location.pathname;
		if (path === '/admin/dashboard') {
			return 'dashboard';
		}
		if (path === '/admin/users') {
			return 'users';
		}
		// 默认 /admin 路径显示 users
		return 'users';
	};

	const [activeTab, setActiveTab] = useState<AdminTab>(getTabFromPath());
	const [unauthorized, setUnauthorized] = useState(false);

	// 监听 URL 变化
	useEffect(() => {
		const handlePopState = () => {
			setActiveTab(getTabFromPath());
		};
		window.addEventListener('popstate', handlePopState);
		return () => {
			window.removeEventListener('popstate', handlePopState);
		};
	}, []);

	// 检查权限（通过尝试加载一个 API 来验证）
	useEffect(() => {
		const checkAuth = async () => {
			try {
				const response = await fetch(getApiUrl('/api/admin/analytics?startDate=2024-01-01&endDate=2024-01-02'), {
					credentials: 'include',
				});
				if (response.status === 403) {
					setUnauthorized(true);
				}
			} catch (error) {
				console.error('[Admin] 权限检查失败:', error);
			}
		};
		checkAuth();
	}, []);

	// 切换 tab 时更新 URL
	const handleTabChange = (tab: AdminTab) => {
		setActiveTab(tab);
		const newPath = `/admin/${tab}`;
		window.history.pushState({}, '', newPath);
		console.log(`[Admin] 切换到 ${tab}，更新 URL 为 ${newPath}`);
	};

	if (unauthorized) {
		return (
			<div className="admin-container">
				<div className="admin-header">
					<h2>系统管理</h2>
				</div>
				<div className="admin-error">
					<p>⚠️ 无权限访问</p>
					<p className="admin-error-detail">您没有管理员权限，无法访问此页面。</p>
				</div>
			</div>
		);
	}

	return (
		<div className="admin-container">
			<div className="admin-header">
				<h2>系统管理</h2>
			</div>

			{/* 导航标签 */}
			<div className="admin-tabs">
				<a
					href="/admin/dashboard"
					className={`admin-tab ${activeTab === 'dashboard' ? 'active' : ''}`}
					onClick={(e) => {
						e.preventDefault();
						handleTabChange('dashboard');
					}}
				>
					📊 用量仪表盘
				</a>
				<a
					href="/admin/users"
					className={`admin-tab ${activeTab === 'users' ? 'active' : ''}`}
					onClick={(e) => {
						e.preventDefault();
						handleTabChange('users');
					}}
				>
					👥 用户列表
				</a>
			</div>

			{/* 子模块内容 */}
			<div className="admin-content">
				{activeTab === 'dashboard' && <AdminDashboard />}
				{activeTab === 'users' && <AdminUsers />}
			</div>
		</div>
	);
}
