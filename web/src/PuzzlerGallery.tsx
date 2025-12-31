/**
 * 拼图游戏图库管理
 * 路径：/mini-games/puzzler/gallery
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
	const [uploading, setUploading] = useState(false);
	const [uploadMode, setUploadMode] = useState<'file' | 'url' | null>(null);
	const [uploadUrl, setUploadUrl] = useState('');
	const [viewingImageId, setViewingImageId] = useState<number | null>(null);
	const [filter, setFilter] = useState<'all' | 'available'>('all');
	const fileInputRef = useRef<HTMLInputElement>(null);

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

	// 图片处理配置（参考 scripts/init-puzzler-images.js）
	const TARGET_WIDTH = 1600;
	const TARGET_HEIGHT = 900;
	const TARGET_ASPECT_RATIO = 16 / 9; // 1.777...
	const ASPECT_TOLERANCE = 0.28; // 允许的宽高比误差（28%）

	/**
	 * 检查宽高比是否接近 16:9
	 */
	const isAspectRatioClose = useCallback((aspectRatio: number): boolean => {
		const diff = Math.abs(aspectRatio - TARGET_ASPECT_RATIO);
		return diff <= ASPECT_TOLERANCE;
	}, []);

	/**
	 * 处理图片：检查宽高比并 resize 到 1600x900
	 */
	const processImage = useCallback(
		async (imageFile: File | string): Promise<Blob> => {
			return new Promise((resolve, reject) => {
				const img = new Image();
				img.crossOrigin = 'anonymous';

				img.onload = () => {
					const { width, height } = img;
					const aspectRatio = width / height;

					// 检查宽高比
					if (!isAspectRatioClose(aspectRatio)) {
						reject(new Error(`图片宽高比不符合要求: ${aspectRatio.toFixed(2)}，需要接近 16:9 (${TARGET_ASPECT_RATIO.toFixed(2)})`));
						return;
					}

					// 创建 Canvas，使用 cover 模式（保持宽高比，裁剪多余部分）
					const canvas = document.createElement('canvas');
					canvas.width = TARGET_WIDTH;
					canvas.height = TARGET_HEIGHT;
					const ctx = canvas.getContext('2d');
					if (!ctx) {
						reject(new Error('无法创建 Canvas 上下文'));
						return;
					}

					// 计算缩放和裁剪参数（cover 模式）
					const scale = Math.max(TARGET_WIDTH / width, TARGET_HEIGHT / height);
					const scaledWidth = width * scale;
					const scaledHeight = height * scale;
					const x = (TARGET_WIDTH - scaledWidth) / 2;
					const y = (TARGET_HEIGHT - scaledHeight) / 2;

					// 绘制图片（居中裁剪）
					ctx.drawImage(img, x, y, scaledWidth, scaledHeight);

					// 转换为 JPEG Blob
					canvas.toBlob(
						(blob) => {
							if (blob) {
								resolve(blob);
							} else {
								reject(new Error('图片处理失败'));
							}
						},
						'image/jpeg',
						0.85 // quality: 85
					);
				};

				img.onerror = () => {
					reject(new Error('图片加载失败'));
				};

				// 设置图片源
				if (typeof imageFile === 'string') {
					img.src = imageFile;
				} else {
					const reader = new FileReader();
					reader.onload = (e) => {
						img.src = e.target?.result as string;
					};
					reader.onerror = () => {
						reject(new Error('读取文件失败'));
					};
					reader.readAsDataURL(imageFile);
				}
			});
		},
		[isAspectRatioClose]
	);

	/**
	 * 上传图片
	 */
	const handleUpload = useCallback(
		async (imageBlob: Blob) => {
			if (!manifest || uploading) return;

			setUploading(true);
			setError(null);

			try {
				// 创建 FormData
				const formData = new FormData();
				formData.append('image', imageBlob, 'image.jpg');
				formData.append('version', manifest.version.toString());

				// 发送上传请求（注意：FormData 不需要手动设置 Content-Type）
				const apiUrl = `${getApiBaseUrl()}/api/mini-games/puzzler/upload`;
				const token = localStorage.getItem('jwt_token');
				const headers: HeadersInit = {};
				if (token) {
					headers['Authorization'] = `Bearer ${token}`;
				}

				const response = await fetch(apiUrl, {
					method: 'POST',
					headers: headers,
					body: formData,
				});

				if (!response.ok) {
					const errorData = await response.json();
					if (response.status === 409) {
						// 版本冲突，重新加载
						await loadManifest();
						throw new Error('版本已更新，请刷新后重试');
					}
					throw new Error(errorData.message || `上传失败: ${response.statusText}`);
				}

				const data = await response.json();
				console.log('[Gallery] 图片上传成功:', data);
				setManifest(data.manifest);
				setUploadMode(null);
				setUploadUrl('');
			} catch (err) {
				console.error('[Gallery] 图片上传失败:', err);
				setError(err instanceof Error ? err.message : '上传失败');
			} finally {
				setUploading(false);
			}
		},
		[manifest, uploading, loadManifest]
	);

	/**
	 * 处理文件选择
	 */
	const handleFileSelect = useCallback(
		async (e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (!file) return;

			try {
				console.log('[Gallery] 开始处理图片:', file.name);
				const processedBlob = await processImage(file);
				await handleUpload(processedBlob);
			} catch (err) {
				console.error('[Gallery] 图片处理失败:', err);
				setError(err instanceof Error ? err.message : '图片处理失败');
			} finally {
				// 清空文件输入
				if (fileInputRef.current) {
					fileInputRef.current.value = '';
				}
			}
		},
		[processImage, handleUpload]
	);

	/**
	 * 处理 URL 上传
	 */
	const handleUrlUpload = useCallback(
		async () => {
			if (!uploadUrl.trim()) {
				setError('请输入图片 URL');
				return;
			}

			try {
				console.log('[Gallery] 开始处理图片 URL:', uploadUrl);
				const processedBlob = await processImage(uploadUrl);
				await handleUpload(processedBlob);
			} catch (err) {
				console.error('[Gallery] 图片处理失败:', err);
				setError(err instanceof Error ? err.message : '图片处理失败');
			}
		},
		[uploadUrl, processImage, handleUpload]
	);

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
					headers: getAuthHeaders(),
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

	// ESC 键关闭浮层
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && viewingImageId !== null) {
				setViewingImageId(null);
			}
		};
		window.addEventListener('keydown', handleKeyDown);
		return () => {
			window.removeEventListener('keydown', handleKeyDown);
		};
	}, [viewingImageId]);

	// 当 filter 改变时，重置到第一页
	useEffect(() => {
		setCurrentPage(1);
	}, [filter]);

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

	// 生成所有图片 ID 列表（倒序）
	const allImageIds: number[] = [];
	for (let i = manifest.maxImageId; i >= 1; i--) {
		allImageIds.push(i);
	}

	// 根据 filter 过滤图片
	const filteredImageIds = allImageIds.filter((id) => {
		if (filter === 'available') {
			return !manifest.disabledImageIds.includes(id);
		}
		return true; // 'all' 模式显示所有图片
	});

	// 计算分页
	const totalImages = filteredImageIds.length;
	const totalPages = Math.ceil(totalImages / IMAGES_PER_PAGE);
	const startIndex = (currentPage - 1) * IMAGES_PER_PAGE;
	const endIndex = Math.min(startIndex + IMAGES_PER_PAGE, totalImages);
	const imageIds = filteredImageIds.slice(startIndex, endIndex);

	const r2Url = getR2PublicUrl();

	return (
		<div className="puzzler-gallery">
			<div className="puzzler-gallery-header">
				<h2>拼图游戏图库管理</h2>
				<div className="puzzler-gallery-info">
					<span>总图片数: {manifest.maxImageId}</span>
					<span>已禁用: {manifest.disabledImageIds.length}</span>
					<span>最后更新: {new Date(manifest.lastUpdate).toLocaleString('zh-CN')}</span>
				</div>
			</div>

			{error && (
				<div className="puzzler-gallery-error" style={{ marginBottom: '16px', padding: '12px', background: '#fee', color: '#c00', borderRadius: '4px' }}>
					{error}
				</div>
			)}

			{/* 过滤器和上传区域 */}
			<div style={{ marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
				{/* 过滤器 */}
				<div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
					<span style={{ fontSize: '14px', color: '#666' }}>筛选：</span>
					<button
						className={`puzzler-btn ${filter === 'all' ? 'puzzler-btn-primary' : 'puzzler-btn-secondary'}`}
						onClick={() => setFilter('all')}
					>
						全部
					</button>
					<button
						className={`puzzler-btn ${filter === 'available' ? 'puzzler-btn-primary' : 'puzzler-btn-secondary'}`}
						onClick={() => setFilter('available')}
					>
						可用
					</button>
					<span style={{ fontSize: '14px', color: '#666', marginLeft: '8px' }}>
						({filter === 'all' ? manifest.maxImageId : filteredImageIds.length} 张)
					</span>
				</div>

				{/* 上传区域 */}
				<div className="puzzler-gallery-upload" style={{ padding: '16px', background: '#f5f5f5', borderRadius: '8px' }}>
				<div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '12px' }}>
					<button
						className="puzzler-btn puzzler-btn-secondary"
						onClick={() => {
							setUploadMode(uploadMode === 'file' ? null : 'file');
							setUploadUrl('');
						}}
						disabled={uploading || saving}
					>
						{uploadMode === 'file' ? '取消' : '选择本地图片'}
					</button>
					<button
						className="puzzler-btn puzzler-btn-secondary"
						onClick={() => {
							setUploadMode(uploadMode === 'url' ? null : 'url');
							if (fileInputRef.current) fileInputRef.current.value = '';
						}}
						disabled={uploading || saving}
					>
						{uploadMode === 'url' ? '取消' : '粘贴 URL'}
					</button>
				</div>

				{uploadMode === 'file' && (
					<div>
						<input
							ref={fileInputRef}
							type="file"
							accept="image/*"
							onChange={handleFileSelect}
							disabled={uploading}
							style={{ marginBottom: '8px' }}
						/>
						<div style={{ fontSize: '12px', color: '#666' }}>
							提示：图片宽高比需接近 16:9，将自动调整为 1600x900
						</div>
					</div>
				)}

				{uploadMode === 'url' && (
					<div>
						<div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
							<input
								type="text"
								value={uploadUrl}
								onChange={(e) => setUploadUrl(e.target.value)}
								placeholder="输入图片 URL"
								disabled={uploading}
								style={{ flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
							/>
							<button
								className="puzzler-btn puzzler-btn-primary"
								onClick={handleUrlUpload}
								disabled={uploading || !uploadUrl.trim()}
							>
								{uploading ? '上传中...' : '上传'}
							</button>
						</div>
						<div style={{ fontSize: '12px', color: '#666' }}>
							提示：图片宽高比需接近 16:9，将自动调整为 1600x900
						</div>
					</div>
				)}
				</div>
			</div>

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
								<div
									className="puzzler-gallery-item-image"
									onClick={() => setViewingImageId(imageId)}
									style={{ cursor: 'pointer' }}
								>
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

			{/* 图片查看浮层 */}
			{viewingImageId !== null && (
				<div
					className="puzzler-gallery-viewer"
					onClick={(e) => {
						// 点击浮层背景（非图片）时关闭
						if (e.target === e.currentTarget) {
							setViewingImageId(null);
						}
					}}
				>
					<div className="puzzler-gallery-viewer-content">
						<button
							className="puzzler-gallery-viewer-close"
							onClick={() => setViewingImageId(null)}
							title="关闭 (ESC)"
						>
							×
						</button>
						<img
							src={`${r2Url}/mini-games/puzzler/images/${viewingImageId}.jpg`}
							alt={`图片 ${viewingImageId}`}
							onClick={(e) => e.stopPropagation()}
						/>
						<div className="puzzler-gallery-viewer-info">
							<span>ID: {viewingImageId}</span>
							{manifest.disabledImageIds.includes(viewingImageId) && <span style={{ color: '#c00' }}>（已禁用）</span>}
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

