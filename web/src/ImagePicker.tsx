import { useState, useRef } from 'react';
import './ImagePicker.css';
import ImageCropper from './ImageCropper';

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

interface ImagePickerProps {
	value: string;
	onChange: (url: string) => void;
	label?: string;
}

export default function ImagePicker({ value, onChange, label = '头像' }: ImagePickerProps) {
	const [mode, setMode] = useState<'url' | 'upload'>('url');
	const [uploading, setUploading] = useState(false);
	const [uploadError, setUploadError] = useState<string | null>(null);
	const [showCropper, setShowCropper] = useState(false);
	const [imageToCrop, setImageToCrop] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const urlInputRef = useRef<HTMLInputElement>(null);

	const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (!file) return;

		// 验证文件类型
		if (!file.type.startsWith('image/')) {
			setUploadError('请选择图片文件');
			return;
		}

		// 验证文件大小（限制为 5MB）
		if (file.size > 5 * 1024 * 1024) {
			setUploadError('图片大小不能超过 5MB');
			return;
		}

		setUploadError(null);

		// 读取文件并显示裁剪器
		const reader = new FileReader();
		reader.onload = () => {
			if (typeof reader.result === 'string') {
				setImageToCrop(reader.result);
				setShowCropper(true);
			}
		};
		reader.onerror = () => {
			setUploadError('文件读取失败，请重试');
		};
		reader.readAsDataURL(file);
	};

	const handleCropComplete = async (croppedImageBlob: Blob) => {
		setShowCropper(false);
		setUploading(true);
		setUploadError(null);

		try {
			// 上传裁剪后的图片到服务器
			const formData = new FormData();
			formData.append('file', croppedImageBlob, 'cropped-image.jpg');

			const response = await fetch(getApiUrl('/api/upload/image'), {
				method: 'POST',
				body: formData,
				credentials: 'include',
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				throw new Error(errorData.message || `上传失败: HTTP ${response.status}`);
			}

			const data = await response.json();
			if (data.success && data.url) {
				onChange(data.url);
			} else {
				throw new Error('服务器返回数据格式错误');
			}
		} catch (error) {
			console.error('[ImagePicker] 图片上传失败:', error);
			setUploadError(error instanceof Error ? error.message : '图片上传失败，请重试');
		} finally {
			setUploading(false);
			setImageToCrop(null);
		}
	};

	const handleCropCancel = () => {
		setShowCropper(false);
		setImageToCrop(null);
		if (fileInputRef.current) {
			fileInputRef.current.value = '';
		}
	};

	const handleUrlChange = (url: string) => {
		setUploadError(null);
		onChange(url);
	};

	const handleClear = () => {
		onChange('');
		if (fileInputRef.current) {
			fileInputRef.current.value = '';
		}
		if (urlInputRef.current) {
			urlInputRef.current.value = '';
		}
	};

	const handleModeSwitch = (newMode: 'url' | 'upload') => {
		setMode(newMode);
		setUploadError(null);
		if (newMode === 'upload' && fileInputRef.current) {
			fileInputRef.current.value = '';
		}
	};

	return (
		<div className="image-picker">
			<label className="image-picker-label">{label}</label>

			{/* 模式切换 */}
			<div className="image-picker-modes">
				<button
					type="button"
					className={`mode-btn ${mode === 'url' ? 'active' : ''}`}
					onClick={() => handleModeSwitch('url')}
				>
					网络地址
				</button>
				<button
					type="button"
					className={`mode-btn ${mode === 'upload' ? 'active' : ''}`}
					onClick={() => handleModeSwitch('upload')}
				>
					上传图片
				</button>
			</div>

			{/* 预览 */}
			{value && (
				<div className="image-preview">
					<img src={value} alt="预览" onError={(e) => {
						(e.target as HTMLImageElement).src = 'https://via.placeholder.com/150?text=Invalid+Image';
					}} />
					<button type="button" className="clear-btn" onClick={handleClear} title="清除">
						×
					</button>
				</div>
			)}

			{/* URL 输入模式 */}
			{mode === 'url' && (
				<div className="image-picker-input">
					<input
						ref={urlInputRef}
						type="url"
						value={value}
						onChange={(e) => handleUrlChange(e.target.value)}
						placeholder="https://example.com/avatar.jpg"
						className="url-input"
					/>
					<p className="form-hint">
						输入图片的网络地址（URL）
						{value && (
							<>
								<br />
								<a href={value} target="_blank" rel="noopener noreferrer">
									查看图片
								</a>
							</>
						)}
					</p>
				</div>
			)}

			{/* 文件上传模式 */}
			{mode === 'upload' && (
				<div className="image-picker-input">
					<input
						ref={fileInputRef}
						type="file"
						accept="image/*"
						onChange={handleFileSelect}
						className="file-input"
						disabled={uploading}
					/>
					{uploading && <div className="upload-status">处理中...</div>}
					{uploadError && <div className="upload-error">{uploadError}</div>}
					<p className="form-hint">
						支持 JPG、PNG、GIF 等图片格式，最大 5MB
						<br />
						选择图片后可进行裁剪和缩放
					</p>
				</div>
			)}

			{/* 图片裁剪器 */}
			{showCropper && imageToCrop && (
				<ImageCropper
					imageSrc={imageToCrop}
					onCropComplete={handleCropComplete}
					onCancel={handleCropCancel}
					aspect={1}
					cropShape="round"
				/>
			)}
		</div>
	);
}


