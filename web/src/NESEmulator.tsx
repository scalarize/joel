/**
 * NES 模拟器
 * 路径：/mini-games/nes
 */

import { useEffect, useRef, useState } from 'react';
import './NESEmulator.css';

// 动态导入 jsnes（如果未安装，会在运行时提示）
// 注意：需要在 web/package.json 中添加 "jsnes": "^0.1.0" 依赖
let NES: any = null;
let Controller: any = null;

// NES 手柄按钮常量（如果 Controller 不可用，使用这些数字常量）
const BUTTON_A = 0x01;
const BUTTON_B = 0x02;
const BUTTON_SELECT = 0x04;
const BUTTON_START = 0x08;
const BUTTON_UP = 0x10;
const BUTTON_DOWN = 0x20;
const BUTTON_LEFT = 0x40;
const BUTTON_RIGHT = 0x80;

/**
 * 键盘映射配置
 * 统一管理键盘按键到 NES 手柄按钮的映射关系
 */
interface KeyMapping {
	key: string; // 键盘按键（小写）
	button: string; // NES 按钮名称（用于获取 Controller 常量）
	label: string; // 显示标签
	description: string; // 说明文字
}

const KEY_MAPPINGS: KeyMapping[] = [
	{
		key: 'w',
		button: 'BUTTON_UP',
		label: 'W',
		description: '上',
	},
	{
		key: 's',
		button: 'BUTTON_DOWN',
		label: 'S',
		description: '下',
	},
	{
		key: 'a',
		button: 'BUTTON_LEFT',
		label: 'A',
		description: '左',
	},
	{
		key: 'd',
		button: 'BUTTON_RIGHT',
		label: 'D',
		description: '右',
	},
	{
		key: 'j',
		button: 'BUTTON_A',
		label: 'J',
		description: 'A 键',
	},
	{
		key: 'k',
		button: 'BUTTON_B',
		label: 'K',
		description: 'B 键',
	},
	{
		key: 'enter',
		button: 'BUTTON_START',
		label: 'Enter',
		description: 'Start',
	},
	{
		key: 'shift',
		button: 'BUTTON_SELECT',
		label: 'Shift',
		description: 'Select',
	},
];

// 尝试动态导入 jsnes
const loadJSNES = async () => {
	try {
		// @ts-ignore - jsnes 可能没有类型定义
		const jsnes = await import('jsnes');
		NES = jsnes.NES || jsnes.default?.NES || jsnes.default || jsnes;
		// Controller 常量通常在模块顶层，如果不存在则使用数字常量
		Controller = jsnes.Controller || jsnes.default?.Controller || (jsnes.default && jsnes.default.Controller);
		// 如果 Controller 不存在，创建一个包含常量的对象
		if (!Controller) {
			Controller = {
				BUTTON_A,
				BUTTON_B,
				BUTTON_SELECT,
				BUTTON_START,
				BUTTON_UP,
				BUTTON_DOWN,
				BUTTON_LEFT,
				BUTTON_RIGHT,
			};
		}
		return true;
	} catch (e) {
		console.warn('[NES] jsnes 库未安装，请运行: npm install jsnes');
		return false;
	}
};

interface NESEmulatorState {
	romLoaded: boolean;
	isRunning: boolean;
	error: string | null;
	romName: string | null;
	romData: string | null; // 保存 ROM 数据以便重置时重新加载
}

export default function NESEmulator() {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const nesRef = useRef<any>(null);
	const animationFrameRef = useRef<number | null>(null);
	const [state, setState] = useState<NESEmulatorState>({
		romLoaded: false,
		isRunning: false,
		error: null,
		romName: null,
		romData: null,
	});

	// 初始化 NES 模拟器
	useEffect(() => {
		let mounted = true;

		const initNES = async () => {
			// 尝试加载 jsnes 库
			const loaded = await loadJSNES();
			if (!loaded || !mounted) {
				if (mounted) {
					setState((prev) => ({
						...prev,
						error: 'jsnes 库未安装。请运行: npm install jsnes',
					}));
				}
				return;
			}

			const canvas = canvasRef.current;
			if (!canvas || !mounted) return;

			const ctx = canvas.getContext('2d');
			if (!ctx) return;

			// 设置画布大小（NES 标准分辨率：256x240）
			canvas.width = 256;
			canvas.height = 240;
			canvas.style.width = '512px';
			canvas.style.height = '480px';
			canvas.style.imageRendering = 'pixelated';

			// 创建 NES 实例
			const nes = new NES({
				onFrame: (frameBuffer: number[]) => {
					if (!mounted) return;
					// 将 frameBuffer 渲染到 canvas
					const imageData = ctx.createImageData(256, 240);
					for (let i = 0; i < frameBuffer.length; i++) {
						const pixel = frameBuffer[i];
						imageData.data[i * 4] = (pixel >> 16) & 0xff; // R
						imageData.data[i * 4 + 1] = (pixel >> 8) & 0xff; // G
						imageData.data[i * 4 + 2] = pixel & 0xff; // B
						imageData.data[i * 4 + 3] = 0xff; // A
					}
					ctx.putImageData(imageData, 0, 0);
				},
				onAudioSample: (_left: number, _right: number) => {
					// 音频处理（可选，暂时不实现）
				},
			});

			if (mounted) {
				nesRef.current = nes;
			}
		};

		initNES();

		return () => {
			mounted = false;
			if (animationFrameRef.current) {
				cancelAnimationFrame(animationFrameRef.current);
			}
			// jsnes 不需要显式 stop，只需要停止动画循环即可
		};
	}, []);

	// 运行模拟器循环
	useEffect(() => {
		if (!state.isRunning || !nesRef.current) return;

		let lastTime = performance.now();
		const targetFPS = 60;
		const frameTime = 1000 / targetFPS;

		const runFrame = () => {
			const now = performance.now();
			const delta = now - lastTime;

			if (delta >= frameTime) {
				nesRef.current.frame();
				lastTime = now - (delta % frameTime);
			}

			animationFrameRef.current = requestAnimationFrame(runFrame);
		};

		animationFrameRef.current = requestAnimationFrame(runFrame);

		return () => {
			if (animationFrameRef.current) {
				cancelAnimationFrame(animationFrameRef.current);
			}
		};
	}, [state.isRunning]);

	// 处理文件上传
	const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (!file) return;

		// 验证文件类型
		if (!file.name.toLowerCase().endsWith('.nes')) {
			setState((prev) => ({
				...prev,
				error: '请上传 .nes 格式的文件',
			}));
			return;
		}

		const reader = new FileReader();
		reader.onload = (e) => {
			try {
				const romData = e.target?.result;
				if (!romData || !nesRef.current) {
					throw new Error('无法读取 ROM 文件');
				}

				// jsnes 的 loadROM 需要字符串格式，需要将 ArrayBuffer 转换为字符串
				let romString: string;
				if (typeof romData === 'string') {
					romString = romData;
				} else {
					// 将 ArrayBuffer 转换为字符串
					const uint8Array = new Uint8Array(romData as ArrayBuffer);
					let binaryString = '';
					for (let i = 0; i < uint8Array.length; i++) {
						binaryString += String.fromCharCode(uint8Array[i]);
					}
					romString = binaryString;
				}

				// 加载 ROM（需要字符串格式）
				nesRef.current.loadROM(romString);

				setState({
					romLoaded: true,
					isRunning: true,
					error: null,
					romName: file.name,
					romData: romString, // 保存 ROM 数据以便重置时使用
				});

				console.log('[NES] ROM 加载成功:', file.name);
			} catch (error) {
				console.error('[NES] 加载 ROM 失败:', error);
				setState((prev) => ({
					...prev,
					error: `加载 ROM 失败: ${error instanceof Error ? error.message : '未知错误'}`,
				}));
			}
		};

		reader.onerror = () => {
			setState((prev) => ({
				...prev,
				error: '读取文件失败',
			}));
		};

		// 使用 readAsArrayBuffer 读取文件，然后转换为字符串
		reader.readAsArrayBuffer(file);
	};

	// 键盘控制映射
	useEffect(() => {
		if (!nesRef.current || !state.romLoaded || !Controller) return;

		// 创建按键到按钮的映射表
		const keyToButtonMap = new Map<string, number>();
		KEY_MAPPINGS.forEach((mapping) => {
			const buttonValue = Controller[mapping.button];
			if (buttonValue !== undefined) {
				keyToButtonMap.set(mapping.key, buttonValue);
			}
		});

		// 需要阻止默认行为的按键列表
		const preventDefaultKeys = KEY_MAPPINGS.map((m) => m.key).filter((k) => k !== 'enter' && k !== 'shift');

		const handleKeyDown = (event: KeyboardEvent) => {
			const key = event.key.toLowerCase();

			// 防止页面滚动（只对方向键等需要阻止的按键）
			if (preventDefaultKeys.includes(key)) {
				event.preventDefault();
			}

			const nes = nesRef.current;
			if (!nes) return;

			// 从映射表中查找对应的按钮
			const button = keyToButtonMap.get(key);
			if (button !== undefined) {
				nes.buttonDown(1, button);
			}
		};

		const handleKeyUp = (event: KeyboardEvent) => {
			const nes = nesRef.current;
			if (!nes) return;

			const key = event.key.toLowerCase();
			const button = keyToButtonMap.get(key);
			if (button !== undefined) {
				nes.buttonUp(1, button);
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		window.addEventListener('keyup', handleKeyUp);

		return () => {
			window.removeEventListener('keydown', handleKeyDown);
			window.removeEventListener('keyup', handleKeyUp);
		};
	}, [state.romLoaded]);

	// 重置模拟器
	const handleReset = () => {
		if (!nesRef.current || !state.romLoaded || !state.romData) {
			console.warn('[NES] 无法重置：模拟器未初始化或 ROM 未加载');
			return;
		}

		try {
			// 重新加载 ROM 以实现重置
			nesRef.current.loadROM(state.romData);
			console.log('[NES] 模拟器已重置');
		} catch (error) {
			console.error('[NES] 重置失败:', error);
			setState((prev) => ({
				...prev,
				error: `重置失败: ${error instanceof Error ? error.message : '未知错误'}`,
			}));
		}
	};

	return (
		<div className="nes-emulator">
			<div className="nes-emulator-header">
				<h2>NES 模拟器</h2>
				<div className="nes-emulator-controls">
					<label className="nes-upload-btn">
						<input type="file" accept=".nes" onChange={handleFileUpload} style={{ display: 'none' }} />
						上传 ROM
					</label>
					{state.romLoaded && (
						<button onClick={handleReset} className="nes-reset-btn">
							重置
						</button>
					)}
				</div>
			</div>

			{state.error && <div className="nes-error">{state.error}</div>}

			<div className="nes-emulator-content">
				{!state.romLoaded ? (
					<div className="nes-upload-prompt">
						<p>请上传 .nes 格式的 ROM 文件开始游戏</p>
						<p className="nes-hint">提示：请确保您拥有合法的 ROM 文件</p>
					</div>
				) : (
					<div className="nes-game-info">
						<p>当前游戏: {state.romName}</p>
					</div>
				)}

				<div className="nes-canvas-container">
					<canvas ref={canvasRef} className="nes-canvas"></canvas>
				</div>

				{state.romLoaded && (
					<div className="nes-controls-info">
						<h3>操作说明</h3>
						<div className="nes-controls-grid">
							{KEY_MAPPINGS.map((mapping) => (
								<div key={mapping.button} className="nes-control-item">
									<strong>{mapping.description}</strong>
									<span className="nes-key-label">{mapping.label}</span>
								</div>
							))}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
