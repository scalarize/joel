/**
 * 用户模块权限管理组件
 * 用于管理员界面中显示和管理用户的模块权限
 */

import { useState } from 'react';
import './Admin.css';

interface UserModulePermissionsProps {
	userId: string;
	userName: string;
	userModules: string[];
	onPermissionChange: () => void;
}

interface ModulePermissionProps {
	userId: string;
	userName: string;
	moduleId: string;
	hasPermission: boolean;
	loading: string | null;
	onGrant: (moduleId: string) => void;
	onRevoke: (moduleId: string) => void;
}

/**
 * 单个模块权限管理组件
 */
function ModulePermission({ userId, userName, moduleId, hasPermission, loading, onGrant, onRevoke }: ModulePermissionProps) {
	const isLoading = loading === `${userId}-${moduleId}`;

	return (
		<div className="admin-module-permission">
			<div className="module-icon-placeholder">{moduleId.charAt(0).toUpperCase()}</div>
			{hasPermission ? (
				<button
					onClick={() => {
						if (confirm(`确定要撤销用户 "${userName}" 的 ${moduleId} 模块权限吗？`)) {
							onRevoke(moduleId);
						}
					}}
					className="admin-revoke-module-btn"
					disabled={isLoading}
					title={`撤销 ${moduleId} 权限`}
				>
					{isLoading ? '撤销中...' : '✅ '}
				</button>
			) : (
				<button onClick={() => onGrant(moduleId)} className="admin-grant-module-btn" disabled={isLoading} title={`授予 ${moduleId} 权限`}>
					{isLoading ? '授权中...' : '❌ '}
				</button>
			)}
		</div>
	);
}

export default function UserModulePermissions({ userId, userName, userModules, onPermissionChange }: UserModulePermissionsProps) {
	const [moduleLoading, setModuleLoading] = useState<string | null>(null);

	const handleGrantModule = async (moduleId: string) => {
		setModuleLoading(`${userId}-${moduleId}`);

		try {
			const response = await fetch('/api/admin/user-modules', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				credentials: 'include',
				body: JSON.stringify({
					userId,
					moduleId,
				}),
			});

			const data = await response.json();

			if (!response.ok) {
				alert(data.message || '授予权限失败');
				setModuleLoading(null);
				return;
			}

			// 操作成功，通知父组件刷新
			onPermissionChange();
			setModuleLoading(null);
		} catch (err) {
			console.error('[UserModulePermissions] 授予模块权限失败:', err);
			alert('授予权限失败，请稍后重试');
			setModuleLoading(null);
		}
	};

	const handleRevokeModule = async (moduleId: string) => {
		setModuleLoading(`${userId}-${moduleId}`);

		try {
			const response = await fetch(`/api/admin/user-modules?userId=${userId}&moduleId=${moduleId}`, {
				method: 'DELETE',
				credentials: 'include',
			});

			const data = await response.json();

			if (!response.ok) {
				alert(data.message || '撤销权限失败');
				setModuleLoading(null);
				return;
			}

			// 操作成功，通知父组件刷新
			onPermissionChange();
			setModuleLoading(null);
		} catch (err) {
			console.error('[UserModulePermissions] 撤销模块权限失败:', err);
			alert('撤销权限失败，请稍后重试');
			setModuleLoading(null);
		}
	};

	// 模块配置
	const modules = ['favor', 'gd'];

	return (
		<div className="admin-user-modules">
			{modules.map((module) => (
				<ModulePermission
					key={module}
					userId={userId}
					userName={userName}
					moduleId={module}
					hasPermission={userModules.includes(module)}
					loading={moduleLoading}
					onGrant={handleGrantModule}
					onRevoke={handleRevokeModule}
				/>
			))}
		</div>
	);
}
