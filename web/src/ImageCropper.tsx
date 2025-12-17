import { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import './ImageCropper.css';

interface ImageCropperProps {
	imageSrc: string;
	onCropComplete: (croppedImageBlob: Blob) => void;
	onCancel: () => void;
	aspect?: number;
	cropShape?: 'rect' | 'round';
}

export default function ImageCropper({
	imageSrc,
	onCropComplete,
	onCancel,
	aspect = 1,
	cropShape = 'round',
}: ImageCropperProps) {
	const [crop, setCrop] = useState({ x: 0, y: 0 });
	const [zoom, setZoom] = useState(1);
	const [croppedAreaPixels, setCroppedAreaPixels] = useState<{
		x: number;
		y: number;
		width: number;
		height: number;
	} | null>(null);

	const onCropChange = useCallback((crop: { x: number; y: number }) => {
		setCrop(crop);
	}, []);

	const onZoomChange = useCallback((zoom: number) => {
		setZoom(zoom);
	}, []);

	const onCropCompleteCallback = useCallback(
		(
			_croppedArea: { x: number; y: number; width: number; height: number },
			croppedAreaPixels: { x: number; y: number; width: number; height: number }
		) => {
			setCroppedAreaPixels(croppedAreaPixels);
		},
		[]
	);

	const createImage = (url: string): Promise<HTMLImageElement> =>
		new Promise((resolve, reject) => {
			const image = new Image();
			image.addEventListener('load', () => resolve(image));
			image.addEventListener('error', (error) => reject(error));
			image.src = url;
		});

	const getCroppedImg = async (
		imageSrc: string,
		pixelCrop: { x: number; y: number; width: number; height: number }
	): Promise<Blob> => {
		const image = await createImage(imageSrc);
		const canvas = document.createElement('canvas');
		const ctx = canvas.getContext('2d');

		if (!ctx) {
			throw new Error('无法创建 canvas 上下文');
		}

		// 设置 canvas 尺寸
		canvas.width = pixelCrop.width;
		canvas.height = pixelCrop.height;

		// 如果是圆形裁剪，创建圆形路径
		if (cropShape === 'round') {
			ctx.beginPath();
			ctx.arc(
				canvas.width / 2,
				canvas.height / 2,
				Math.min(canvas.width, canvas.height) / 2,
				0,
				2 * Math.PI
			);
			ctx.clip();
		}

		// 绘制裁剪后的图片
		ctx.drawImage(
			image,
			pixelCrop.x,
			pixelCrop.y,
			pixelCrop.width,
			pixelCrop.height,
			0,
			0,
			pixelCrop.width,
			pixelCrop.height
		);

		return new Promise((resolve, reject) => {
			canvas.toBlob(
				(blob) => {
					if (!blob) {
						reject(new Error('Canvas 转换失败'));
						return;
					}
					resolve(blob);
				},
				'image/jpeg',
				0.9
			);
		});
	};

	const handleConfirm = async () => {
		if (!croppedAreaPixels) {
			return;
		}

		try {
			const croppedImageBlob = await getCroppedImg(imageSrc, croppedAreaPixels);
			onCropComplete(croppedImageBlob);
		} catch (error) {
			console.error('[ImageCropper] 裁剪失败:', error);
			alert('图片裁剪失败，请重试');
		}
	};

	return (
		<div className="image-cropper-overlay">
			<div className="image-cropper-container">
				<div className="image-cropper-header">
					<h3>裁剪图片</h3>
					<p className="cropper-hint">拖动图片调整位置，双指缩放调整大小</p>
				</div>
				<div className="image-cropper-content">
					<div className="crop-container">
						<Cropper
							image={imageSrc}
							crop={crop}
							zoom={zoom}
							aspect={aspect}
							cropShape={cropShape}
							onCropChange={onCropChange}
							onZoomChange={onZoomChange}
							onCropComplete={onCropCompleteCallback}
							showGrid={false}
							restrictPosition={true}
							minZoom={1}
							maxZoom={3}
						/>
					</div>
					<div className="zoom-controls">
						<label htmlFor="zoom-slider">缩放</label>
						<input
							id="zoom-slider"
							type="range"
							min={1}
							max={3}
							step={0.1}
							value={zoom}
							onChange={(e) => setZoom(Number(e.target.value))}
							className="zoom-slider"
						/>
						<span className="zoom-value">{Math.round(zoom * 100)}%</span>
					</div>
				</div>
				<div className="image-cropper-actions">
					<button type="button" className="btn btn-secondary" onClick={onCancel}>
						取消
					</button>
					<button
						type="button"
						className="btn btn-primary"
						onClick={handleConfirm}
						disabled={!croppedAreaPixels}
					>
						确认
					</button>
				</div>
			</div>
		</div>
	);
}

