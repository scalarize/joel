/**
 * 管理员后台 - 主入口
 * 包含导航和子模块路由
 */

import { useState, useEffect } from 'react';
import './Admin.css';
import AdminDashboard from './AdminDashboard';
import AdminUsers from './AdminUsers';

type AdminTab = 'dashboard' | 'users';

export default function Admin() {
	const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
	const [unauthorized, setUnauthorized] = useState(false);

	// 检查权限（通过尝试加载一个 API 来验证）
	useEffect(() => {
		const checkAuth = async () => {
			try {
				const response = await fetch('/api/admin/analytics?startDate=2024-01-01&endDate=2024-01-02', {
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
				<button
					className={`admin-tab ${activeTab === 'dashboard' ? 'active' : ''}`}
					onClick={() => setActiveTab('dashboard')}
				>
					📊 用量仪表盘
				</button>
				<button
					className={`admin-tab ${activeTab === 'users' ? 'active' : ''}`}
					onClick={() => setActiveTab('users')}
				>
					👥 用户列表
				</button>
			</div>

			{/* 子模块内容 */}
			<div className="admin-content">
				{activeTab === 'dashboard' && <AdminDashboard />}
				{activeTab === 'users' && <AdminUsers />}
			</div>
		</div>
	);
}
