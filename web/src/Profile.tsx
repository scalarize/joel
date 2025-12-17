import { useState, useEffect } from 'react';
import './Profile.css';
import ImagePicker from './ImagePicker';

interface ProfileData {
	id: string;
	email: string;
	name: string;
	picture: string | null;
}

export default function Profile() {
	const [profile, setProfile] = useState<ProfileData | null>(null);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState(false);

	// 表单状态
	const [displayName, setDisplayName] = useState('');
	const [displayPicture, setDisplayPicture] = useState('');

	useEffect(() => {
		loadProfile();
	}, []);

	const loadProfile = async () => {
		try {
			console.log('[Profile] 加载用户 Profile');
			setLoading(true);
			setError(null);

			const response = await fetch('/api/profile', {
				credentials: 'include',
			});

			if (!response.ok) {
				if (response.status === 401) {
					// 未登录，重定向到首页
					window.location.href = '/';
					return;
				}
				throw new Error(`HTTP ${response.status}`);
			}

			const data: ProfileData = await response.json();
			console.log('[Profile] Profile 加载成功');
			setProfile(data);
			setDisplayName(data.name);
			setDisplayPicture(data.picture || '');
		} catch (err) {
			console.error('[Profile] 加载失败:', err);
			setError('加载 Profile 失败，请刷新页面重试');
		} finally {
			setLoading(false);
		}
	};

	const handleSave = async () => {
		if (!profile) return;

		try {
			console.log('[Profile] 保存 Profile');
			setSaving(true);
			setError(null);
			setSuccess(false);

			const response = await fetch('/api/profile', {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
				},
				credentials: 'include',
				body: JSON.stringify({
					name: displayName.trim(),
					picture: displayPicture.trim() || null,
				}),
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				throw new Error(errorData.message || `HTTP ${response.status}`);
			}

			const data = await response.json();
			console.log('[Profile] Profile 保存成功');
			setProfile(data.user);
			setSuccess(true);

			// 3 秒后清除成功提示
			setTimeout(() => setSuccess(false), 3000);
		} catch (err) {
			console.error('[Profile] 保存失败:', err);
			setError(err instanceof Error ? err.message : '保存失败，请重试');
		} finally {
			setSaving(false);
		}
	};

	const handleReset = () => {
		if (!profile) return;
		setDisplayName(profile.name);
		setDisplayPicture(profile.picture || '');
		setError(null);
		setSuccess(false);
	};

	if (loading) {
		return (
			<div className="profile-container">
				<div className="loading">加载中...</div>
			</div>
		);
	}

	if (!profile) {
		return (
			<div className="profile-container">
				<div className="error">无法加载 Profile 信息</div>
			</div>
		);
	}

	const hasChanges =
		displayName !== profile.name ||
		displayPicture !== (profile.picture || '');

	return (
		<div className="profile-container">
			<div className="profile-header">
				<h1>个人资料</h1>
				<a href="/" className="back-link">
					← 返回首页
				</a>
			</div>

			<div className="profile-content">
				<div className="profile-section">
					<h2>当前显示信息</h2>
					<div className="current-info">
						<div className="avatar-preview">
							<img
								src={profile.picture || 'https://via.placeholder.com/150?text=No+Avatar'}
								alt={profile.name}
								onError={(e) => {
									(e.target as HTMLImageElement).src =
										'https://via.placeholder.com/150?text=Invalid+Image';
								}}
							/>
						</div>
						<div className="info-text">
							<p className="info-label">显示名称</p>
							<p className="info-value">{profile.name}</p>
							<p className="info-label">邮箱</p>
							<p className="info-value">{profile.email}</p>
						</div>
					</div>
				</div>

				<div className="profile-section">
					<h2>编辑资料</h2>
					<p className="section-description">
						修改显示名称和头像。如需恢复 OAuth 账号的原始信息，可以重新登录。
					</p>

					{error && <div className="alert alert-error">{error}</div>}
					{success && <div className="alert alert-success">保存成功！</div>}

					<div className="form-group">
						<label htmlFor="name">显示名称 *</label>
						<input
							id="name"
							type="text"
							value={displayName}
							onChange={(e) => setDisplayName(e.target.value)}
							placeholder="请输入显示名称"
							maxLength={100}
							required
						/>
						<p className="form-hint">显示名称不能为空，最多 100 个字符</p>
					</div>

					<ImagePicker
						value={displayPicture}
						onChange={setDisplayPicture}
						label="头像"
					/>

					<div className="form-actions">
						<button
							type="button"
							onClick={handleReset}
							disabled={!hasChanges || saving}
							className="btn btn-secondary"
						>
							重置
						</button>
						<button
							type="button"
							onClick={handleSave}
							disabled={!hasChanges || saving}
							className="btn btn-primary"
						>
							{saving ? '保存中...' : '保存'}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

