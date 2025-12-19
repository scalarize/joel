/**
 * 管理员后台 - 用户列表子模块
 */

import { useEffect, useState } from 'react';
import './Admin.css';

interface User {
	id: string;
	email: string;
	name: string;
	picture?: string;
	last_login_at?: string;
	created_at: string;
	updated_at: string;
}

export default function AdminUsers() {
	const [users, setUsers] = useState<User[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		loadUsers();
	}, []);

	const loadUsers = async () => {
		try {
			setLoading(true);
			setError(null);

			const response = await fetch('/api/admin/users', {
				credentials: 'include',
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.message || `HTTP ${response.status}`);
			}

			const data: { users: User[] } = await response.json();
			setUsers(data.users);
		} catch (err) {
			console.error('[AdminUsers] 加载用户列表失败:', err);
			setError(err instanceof Error ? err.message : '加载失败');
		} finally {
			setLoading(false);
		}
	};

	const formatDate = (dateString?: string): string => {
		if (!dateString) return '从未登录';
		try {
			const date = new Date(dateString);
			return date.toLocaleString('zh-CN', {
				year: 'numeric',
				month: '2-digit',
				day: '2-digit',
				hour: '2-digit',
				minute: '2-digit',
			});
		} catch {
			return '无效日期';
		}
	};

	if (loading) {
		return <div className="admin-loading">加载中...</div>;
	}

	if (error) {
		return (
			<div className="admin-error">
				<p>❌ 加载失败</p>
				<p className="admin-error-detail">{error}</p>
				<button onClick={loadUsers} className="admin-retry-btn">
					重试
				</button>
			</div>
		);
	}

	return (
		<div>
			<div className="admin-header">
				<h2>用户列表</h2>
				<button onClick={loadUsers} className="admin-refresh-btn">
					刷新
				</button>
			</div>

			<div className="admin-users-table-container">
				<table className="admin-users-table">
					<thead>
						<tr>
							<th>头像</th>
							<th>姓名</th>
							<th>邮箱</th>
							<th>最后登录</th>
							<th>注册时间</th>
						</tr>
					</thead>
					<tbody>
						{users.length === 0 ? (
							<tr>
								<td colSpan={5} className="admin-users-empty">
									暂无用户
								</td>
							</tr>
						) : (
							users.map((user) => (
								<tr key={user.id}>
									<td>
										{user.picture ? (
											<img src={user.picture} alt={user.name} className="admin-user-avatar" />
										) : (
											<div className="admin-user-avatar-placeholder">{user.name.charAt(0)}</div>
										)}
									</td>
									<td>{user.name}</td>
									<td>{user.email}</td>
									<td>{formatDate(user.last_login_at)}</td>
									<td>{formatDate(user.created_at)}</td>
								</tr>
							))
						)}
					</tbody>
				</table>
			</div>
		</div>
	);
}

