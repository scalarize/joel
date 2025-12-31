/**
 * 拼图游戏图库管理
 * 路径：/mini-games/puzzler/gallery
 */

import { useState, useEffect, useCallback } from 'react';
import './Puzzler.css';

/**
 * Manifest 接口
 */
interface PuzzlerManifest {
	version: number;
	lastUpdate: number;
	maxImageId: number;
	disabledImageIds: number[];
}

/**
 * 获取 API 基础 URL
 */
function getApiBaseUrl(): string {
	const hostname = window.location.hostname;
	if (hostname === 'joel.scalarize.cn' || hostname.includes('.scalarize.cn')) {
		return 'https://api.joel.scalarize.cn';
	}
	return 'https://api.joel.scalarize.org';
}

/**
 * 获取 R2 公开 URL
 */
function getR2PublicUrl(): string {
	const hostname = window.location.hostname;
	if (hostname === 'joel.scalarize.cn' || hostname.includes('.scalarize.cn')) {
		return 'https://assets.joel.scalarize.cn';
	}
	return 'https://assets.joel.scalarize.org';
}

const IMAGES_PER_PAGE = 20;

export default function PuzzlerGallery() {
	const [manifest, setManifest] = useState<PuzzlerManifest | null>(null);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [currentPage, setCurrentPage] = useState(1);

	/**
	 * 获取带有 JWT token 的请求 headers
	 */
	function getAuthHeaders(): HeadersInit {
		const headers: HeadersInit = {
			'Content-Type': 'application/json',
		};
		const token = localStorage.getItem('jwt_token');
		if (token) {
			headers['Authorization'] = `Bearer ${token}`;
		}
		return headers;
	}

	/**
	 * 加载 manifest（从 API 获取）
	 */
	const loadManifest = useCallback(async () => {
		console.log('[Gallery] 开始加载 manifest');
		setLoading(true);
		setError(null);
		try {
			const apiUrl = `${getApiBaseUrl()}/api/mini-games/puzzler/manifest`;
			const response = await fetch(apiUrl, {
				headers: getAuthHeaders(),
			});
			if (!response.ok) {
				throw new Error(`加载 manifest 失败: ${response.statusText}`);
			}
			const data: PuzzlerManifest = await response.json();
			console.log('[Gallery] Manifest 加载成功:', data);
			setManifest(data);
		} catch (err) {
			console.error('[Gallery] Manifest 加载失败:', err);
			setError(err instanceof Error ? err.message : '加载失败');
		} finally {
			setLoading(false);
		}
	}, []);

	/**
	 * 切换图片禁用状态
	 */
	const toggleImageDisabled = useCallback(
		async (imageId: number) => {
			if (!manifest || saving) return;

			setSaving(true);
			setError(null);

			try {
				// 更新禁用列表
				const newDisabledIds = manifest.disabledImageIds.includes(imageId)
					? manifest.disabledImageIds.filter((id) => id !== imageId)
					: [...manifest.disabledImageIds, imageId].sort((a, b) => a - b);

				// 发送更新请求
				const apiUrl = `${getApiBaseUrl()}/api/mini-games/puzzler/manifest`;
				const response = await fetch(apiUrl, {
					method: 'PUT',
					headers: {
						'Content-Type': 'application/json',
					},
					credentials: 'include',
					body: JSON.stringify({
						version: manifest.version,
						disabledImageIds: newDisabledIds,
					}),
				});

				if (!response.ok) {
					const errorData = await response.json();
					if (response.status === 409) {
						// 版本冲突，重新加载
						await loadManifest();
						throw new Error('版本已更新，请刷新后重试');
					}
					throw new Error(errorData.message || `更新失败: ${response.statusText}`);
				}

				const updatedManifest: PuzzlerManifest = await response.json();
				console.log('[Gallery] Manifest 更新成功:', updatedManifest);
				setManifest(updatedManifest);
			} catch (err) {
				console.error('[Gallery] Manifest 更新失败:', err);
				setError(err instanceof Error ? err.message : '更新失败');
			} finally {
				setSaving(false);
			}
		},
		[manifest, saving, loadManifest]
	);

	// 初始化：加载 manifest
	useEffect(() => {
		loadManifest();
	}, [loadManifest]);

	if (loading) {
		return (
			<div className="puzzler-gallery">
				<div className="puzzler-gallery-loading">加载中...</div>
			</div>
		);
	}

	if (!manifest) {
		return (
			<div className="puzzler-gallery">
				<div className="puzzler-gallery-error">加载失败，请刷新页面重试</div>
			</div>
		);
	}

	// 计算分页
	const totalImages = manifest.maxImageId;
	const totalPages = Math.ceil(totalImages / IMAGES_PER_PAGE);
	const startId = (currentPage - 1) * IMAGES_PER_PAGE + 1;
	const endId = Math.min(currentPage * IMAGES_PER_PAGE, totalImages);

	// 生成当前页的图片 ID 列表
	const imageIds: number[] = [];
	for (let i = startId; i <= endId; i++) {
		imageIds.push(i);
	}

	const r2Url = getR2PublicUrl();

	return (
		<div className="puzzler-gallery">
			<div className="puzzler-gallery-header">
				<h2>拼图游戏图库管理</h2>
				<div className="puzzler-gallery-info">
					<span>总图片数: {totalImages}</span>
					<span>已禁用: {manifest.disabledImageIds.length}</span>
					<span>最后更新: {new Date(manifest.lastUpdate).toLocaleString('zh-CN')}</span>
				</div>
			</div>

			{error && (
				<div className="puzzler-gallery-error" style={{ marginBottom: '16px', padding: '12px', background: '#fee', color: '#c00', borderRadius: '4px' }}>
					{error}
				</div>
			)}

			<div className="puzzler-gallery-content">
				<div className="puzzler-gallery-grid">
					{imageIds.map((imageId) => {
						const isDisabled = manifest.disabledImageIds.includes(imageId);
						const imageUrl = `${r2Url}/mini-games/puzzler/images/${imageId}.jpg`;

						return (
							<div
								key={imageId}
								className={`puzzler-gallery-item ${isDisabled ? 'puzzler-gallery-item-disabled' : ''}`}
							>
								<div className="puzzler-gallery-item-image">
									<img src={imageUrl} alt={`图片 ${imageId}`} loading="lazy" />
									{isDisabled && <div className="puzzler-gallery-item-overlay">已禁用</div>}
								</div>
								<div className="puzzler-gallery-item-info">
									<span className="puzzler-gallery-item-id">ID: {imageId}</span>
									<button
										className={`puzzler-gallery-item-toggle ${isDisabled ? 'puzzler-gallery-item-toggle-enable' : 'puzzler-gallery-item-toggle-disable'}`}
										onClick={() => toggleImageDisabled(imageId)}
										disabled={saving}
									>
										{isDisabled ? '启用' : '禁用'}
									</button>
								</div>
							</div>
						);
					})}
				</div>
			</div>

			{totalPages > 1 && (
				<div className="puzzler-gallery-pagination">
					<button
						className="puzzler-btn puzzler-btn-secondary"
						onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
						disabled={currentPage === 1}
					>
						上一页
					</button>
					<span className="puzzler-gallery-pagination-info">
						第 {currentPage} / {totalPages} 页
					</span>
					<button
						className="puzzler-btn puzzler-btn-secondary"
						onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
						disabled={currentPage === totalPages}
					>
						下一页
					</button>
				</div>
			)}

			<div className="puzzler-gallery-footer">
				<button className="puzzler-btn puzzler-btn-primary" onClick={() => (window.location.href = '/mini-games/puzzler')}>
					返回游戏
				</button>
			</div>
		</div>
	);
}

