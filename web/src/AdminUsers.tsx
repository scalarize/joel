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
	const [showInviteModal, setShowInviteModal] = useState(false);
	const [inviteEmail, setInviteEmail] = useState('');
	const [inviteName, setInviteName] = useState('');
	const [inviteLoading, setInviteLoading] = useState(false);
	const [inviteError, setInviteError] = useState<string | null>(null);
	const [inviteSuccess, setInviteSuccess] = useState<{ email: string; password: string } | null>(null);

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

	const handleInviteUser = async (e: React.FormEvent) => {
		e.preventDefault();
		setInviteError(null);
		setInviteSuccess(null);
		setInviteLoading(true);

		try {
			const response = await fetch('/api/admin/invite-user', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				credentials: 'include',
				body: JSON.stringify({
					email: inviteEmail.trim(),
					name: inviteName.trim(),
				}),
			});

			const data = await response.json();

			if (!response.ok) {
				setInviteError(data.message || '邀请失败');
				setInviteLoading(false);
				return;
			}

			// 邀请成功，显示密码
			setInviteSuccess({
				email: data.user.email,
				password: data.password,
			});
			setInviteEmail('');
			setInviteName('');
			setInviteLoading(false);
			
			// 刷新用户列表
			loadUsers();
		} catch (err) {
			console.error('[AdminUsers] 邀请用户失败:', err);
			setInviteError('邀请失败，请稍后重试');
			setInviteLoading(false);
		}
	};

	const handleCloseInviteModal = () => {
		setShowInviteModal(false);
		setInviteEmail('');
		setInviteName('');
		setInviteError(null);
		setInviteSuccess(null);
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
				<div className="admin-header-actions">
					<button onClick={() => setShowInviteModal(true)} className="admin-invite-btn">
						➕ 邀请用户
					</button>
					<button onClick={loadUsers} className="admin-refresh-btn">
						刷新
					</button>
				</div>
			</div>

			{/* 邀请用户模态框 */}
			{showInviteModal && (
				<div className="admin-modal-overlay" onClick={handleCloseInviteModal}>
					<div className="admin-modal" onClick={(e) => e.stopPropagation()}>
						<div className="admin-modal-header">
							<h3>邀请用户</h3>
							<button className="admin-modal-close" onClick={handleCloseInviteModal}>
								×
							</button>
						</div>
						<div className="admin-modal-content">
							{inviteSuccess ? (
								<div className="admin-invite-success">
									<p className="admin-invite-success-title">✅ 邀请成功！</p>
									<p className="admin-invite-success-text">请将以下信息告知用户：</p>
									<div className="admin-invite-info">
										<div className="admin-invite-info-item">
											<label>邮箱：</label>
											<code>{inviteSuccess.email}</code>
										</div>
										<div className="admin-invite-info-item">
											<label>临时密码：</label>
											<code className="admin-invite-password">{inviteSuccess.password}</code>
										</div>
									</div>
									<p className="admin-invite-warning">
										⚠️ 注意：用户首次登录后必须修改密码才能正常使用
									</p>
									<button onClick={handleCloseInviteModal} className="admin-modal-btn">
										关闭
									</button>
								</div>
							) : (
								<form onSubmit={handleInviteUser}>
									{inviteError && <div className="admin-invite-error">{inviteError}</div>}
									<div className="admin-form-group">
										<label htmlFor="invite-email">邮箱 *</label>
										<input
											id="invite-email"
											type="email"
											value={inviteEmail}
											onChange={(e) => setInviteEmail(e.target.value)}
											required
											disabled={inviteLoading}
											placeholder="user@example.com"
										/>
									</div>
									<div className="admin-form-group">
										<label htmlFor="invite-name">姓名 *</label>
										<input
											id="invite-name"
											type="text"
											value={inviteName}
											onChange={(e) => setInviteName(e.target.value)}
											required
											disabled={inviteLoading}
											placeholder="用户姓名"
											maxLength={100}
										/>
									</div>
									<div className="admin-modal-actions">
										<button type="button" onClick={handleCloseInviteModal} className="admin-modal-btn-secondary" disabled={inviteLoading}>
											取消
										</button>
										<button type="submit" className="admin-modal-btn-primary" disabled={inviteLoading}>
											{inviteLoading ? '邀请中...' : '邀请'}
										</button>
									</div>
								</form>
							)}
						</div>
					</div>
				</div>
			)}

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
