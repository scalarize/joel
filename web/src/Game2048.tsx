/**
 * 2048 游戏
 * 路径：/mini-games/2048/
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import './Game2048.css';

type Direction = 'up' | 'down' | 'left' | 'right';
type GridSize = 4 | 5 | 6;

interface Cell {
	value: number;
	id: string; // 用于动画追踪
	merged?: boolean; // 标记是否刚合并
	newCell?: boolean; // 标记是否新生成的
}

/**
 * 生成唯一ID
 */
function generateId(): string {
	return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 创建空网格
 */
function createEmptyGrid(size: GridSize): Cell[][] {
	return Array(size)
		.fill(null)
		.map(() => Array(size).fill(null).map(() => ({ value: 0, id: generateId() })));
}

/**
 * 在随机空位置添加新数字（2或4，90%概率是2）
 */
function addRandomTile(grid: Cell[][]): Cell[][] {
	const emptyCells: { row: number; col: number }[] = [];
	for (let row = 0; row < grid.length; row++) {
		for (let col = 0; col < grid[row].length; col++) {
			if (grid[row][col].value === 0) {
				emptyCells.push({ row, col });
			}
		}
	}

	if (emptyCells.length === 0) {
		return grid;
	}

	const randomCell = emptyCells[Math.floor(Math.random() * emptyCells.length)];
	const newValue = Math.random() < 0.9 ? 2 : 4;

	const newGrid = grid.map((row) => row.map((cell) => ({ ...cell })));
	newGrid[randomCell.row][randomCell.col] = {
		value: newValue,
		id: generateId(),
		newCell: true,
	};

	return newGrid;
}

/**
 * 初始化游戏（添加两个随机数字）
 */
function initializeGame(size: GridSize): Cell[][] {
	let grid = createEmptyGrid(size);
	grid = addRandomTile(grid);
	grid = addRandomTile(grid);
	return grid;
}

/**
 * 旋转网格（用于统一处理方向）
 */
function rotateGrid(grid: Cell[][], times: number): Cell[][] {
	let rotated = grid.map((row) => row.map((cell) => ({ ...cell })));
	for (let i = 0; i < times; i++) {
		const size = rotated.length;
		const newGrid: Cell[][] = Array(size)
			.fill(null)
			.map(() => Array(size).fill(null).map(() => ({ value: 0, id: generateId() })));

		for (let row = 0; row < size; row++) {
			for (let col = 0; col < size; col++) {
				newGrid[col][size - 1 - row] = { ...rotated[row][col] };
			}
		}
		rotated = newGrid;
	}
	return rotated;
}

/**
 * 向左移动并合并
 */
function moveLeft(grid: Cell[][]): { grid: Cell[][]; moved: boolean } {
	const size = grid.length;
	const newGrid: Cell[][] = Array(size)
		.fill(null)
		.map(() => Array(size).fill(null).map(() => ({ value: 0, id: generateId() })));
	let moved = false;

	for (let row = 0; row < size; row++) {
		const line: Cell[] = [];
		// 收集非零数字
		for (let col = 0; col < size; col++) {
			if (grid[row][col].value !== 0) {
				line.push({ ...grid[row][col] });
			}
		}

		// 合并相同数字
		const merged: Cell[] = [];
		for (let i = 0; i < line.length; i++) {
			if (i < line.length - 1 && line[i].value === line[i + 1].value) {
				merged.push({
					value: line[i].value * 2,
					id: generateId(),
					merged: true,
				});
				i++; // 跳过下一个，因为已经合并
				moved = true;
			} else {
				merged.push({ ...line[i] });
			}
		}

		// 检查是否有移动
		if (merged.length !== line.length || merged.some((cell, idx) => cell.value !== grid[row][idx].value)) {
			moved = true;
		}

		// 填充到新网格
		for (let col = 0; col < merged.length; col++) {
			newGrid[row][col] = merged[col];
		}
	}

	return { grid: newGrid, moved };
}

/**
 * 移动网格
 */
function moveGrid(grid: Cell[][], direction: Direction): { grid: Cell[][]; moved: boolean } {
	let rotated = grid;
	let rotateTimes = 0;

	// 统一转换为向左移动
	switch (direction) {
		case 'right':
			rotated = rotateGrid(grid, 2);
			rotateTimes = 2;
			break;
		case 'up':
			rotated = rotateGrid(grid, 3);
			rotateTimes = 3; // 修复：应该等于实际旋转次数
			break;
		case 'down':
			rotated = rotateGrid(grid, 1);
			rotateTimes = 1; // 修复：应该等于实际旋转次数
			break;
		case 'left':
		default:
			rotated = grid;
			rotateTimes = 0;
			break;
	}

	// 向左移动
	const { grid: movedGrid, moved } = moveLeft(rotated);

	// 旋转回来
	let result = movedGrid;
	for (let i = 0; i < (4 - rotateTimes) % 4; i++) {
		result = rotateGrid(result, 1);
	}

	return { grid: result, moved };
}

/**
 * 检查是否还有可移动的空间
 */
function canMove(grid: Cell[][]): boolean {
	const size = grid.length;

	// 检查是否有空格
	for (let row = 0; row < size; row++) {
		for (let col = 0; col < size; col++) {
			if (grid[row][col].value === 0) {
				return true;
			}
		}
	}

	// 检查是否有相邻的相同数字
	for (let row = 0; row < size; row++) {
		for (let col = 0; col < size; col++) {
			const current = grid[row][col].value;
			if (
				(row > 0 && grid[row - 1][col].value === current) ||
				(row < size - 1 && grid[row + 1][col].value === current) ||
				(col > 0 && grid[row][col - 1].value === current) ||
				(col < size - 1 && grid[row][col + 1].value === current)
			) {
				return true;
			}
		}
	}

	return false;
}

/**
 * 获取所有目标值（2048, 4096, 8192...）
 */
function getTargets(): number[] {
	const targets: number[] = [];
	for (let n = 11; n <= 20; n++) {
		// 2^11 = 2048, 2^12 = 4096, ... 2^20 = 1048576
		targets.push(Math.pow(2, n));
	}
	return targets;
}

/**
 * 检查是否达到某个目标
 */
function checkTarget(grid: Cell[][], achievedTargets: Set<number>): number | null {
	const targets = getTargets();
	for (let row = 0; row < grid.length; row++) {
		for (let col = 0; col < grid[row].length; col++) {
			const value = grid[row][col].value;
			if (targets.includes(value) && !achievedTargets.has(value)) {
				return value;
			}
		}
	}
	return null;
}

/**
 * AI 评估函数：评估当前游戏状态的分数
 * 目前实现：返回空位的数量
 */
function evaluateGrid(grid: Cell[][]): number {
	let emptyCount = 0;
	for (let row = 0; row < grid.length; row++) {
		for (let col = 0; col < grid[row].length; col++) {
			if (grid[row][col].value === 0) {
				emptyCount++;
			}
		}
	}
	return emptyCount;
}

/**
 * AI 决策函数：测试四个方向，返回分数最高的方向
 */
function aiDecideMove(grid: Cell[][]): Direction | null {
	const directions: Direction[] = ['up', 'down', 'left', 'right'];
	let bestDirection: Direction | null = null;
	let bestScore = -1;

	for (const direction of directions) {
		const { grid: newGrid, moved } = moveGrid(grid, direction);
		if (moved) {
			// 模拟添加新数字（添加一个随机数字）
			const withNewTile = addRandomTile(newGrid);
			const score = evaluateGrid(withNewTile);
			if (score > bestScore) {
				bestScore = score;
				bestDirection = direction;
			}
		}
	}

	return bestDirection;
}

export default function Game2048() {
	const [grid, setGrid] = useState<Cell[][]>(() => initializeGame(4));
	const [gridSize, setGridSize] = useState<GridSize>(4);
	const [gameStarted, setGameStarted] = useState(false);
	const [gameOver, setGameOver] = useState(false);
	const [achievedTargets, setAchievedTargets] = useState<Set<number>>(new Set());
	const [currentTarget, setCurrentTarget] = useState<number | null>(null);
	const [isAnimating, setIsAnimating] = useState(false);
	const [isAiMode, setIsAiMode] = useState(false);
	const [aiActiveDirection, setAiActiveDirection] = useState<Direction | null>(null);
	const [aiInterval, setAiInterval] = useState<number>(1); // AI 执行间隔（秒）
	const gameAreaRef = useRef<HTMLDivElement>(null);
	const touchStartRef = useRef<{ x: number; y: number } | null>(null);
	const aiIntervalRef = useRef<NodeJS.Timeout | null>(null);

	// 合法的间隔时间（秒）
	const VALID_INTERVALS = [0.1, 0.2, 0.5, 1, 2, 3];
	const MIN_INTERVAL = 0.1;
	const MAX_INTERVAL = 3;

	/**
	 * 切换布局大小
	 */
	const switchGridSize = useCallback(() => {
		if (gameStarted) {
			console.log('[2048] 游戏已开始，无法切换布局');
			return;
		}

		const sizes: GridSize[] = [4, 5, 6];
		const currentIndex = sizes.indexOf(gridSize);
		const nextIndex = (currentIndex + 1) % sizes.length;
		const nextSize = sizes[nextIndex];

		console.log(`[2048] 切换布局: ${gridSize}x${gridSize} -> ${nextSize}x${nextSize}`);
		setGridSize(nextSize);
		setGrid(initializeGame(nextSize));
		setGameOver(false);
		setAchievedTargets(new Set());
		setCurrentTarget(null);
	}, [gridSize, gameStarted]);

	/**
	 * 停止 AI 模式
	 */
	const stopAiMode = useCallback(() => {
		console.log('[2048] 停止 AI 模式');
		setIsAiMode(false);
		setAiActiveDirection(null);
		if (aiIntervalRef.current) {
			clearInterval(aiIntervalRef.current);
			aiIntervalRef.current = null;
		}
	}, []);

	/**
	 * 启动 AI 模式
	 */
	const startAiMode = useCallback(() => {
		console.log('[2048] 启动 AI 模式');
		// 重置间隔为默认值 1
		setAiInterval(1);
		setIsAiMode(true);
	}, []);

	/**
	 * 加快 AI 执行速度
	 */
	const speedUpAi = useCallback(() => {
		const currentIndex = VALID_INTERVALS.indexOf(aiInterval);
		if (currentIndex > 0) {
			const newInterval = VALID_INTERVALS[currentIndex - 1];
			console.log(`[2048] AI 间隔调整: ${aiInterval}秒 -> ${newInterval}秒`);
			setAiInterval(newInterval);
		}
	}, [aiInterval]);

	/**
	 * 减慢 AI 执行速度
	 */
	const slowDownAi = useCallback(() => {
		const currentIndex = VALID_INTERVALS.indexOf(aiInterval);
		if (currentIndex < VALID_INTERVALS.length - 1) {
			const newInterval = VALID_INTERVALS[currentIndex + 1];
			console.log(`[2048] AI 间隔调整: ${aiInterval}秒 -> ${newInterval}秒`);
			setAiInterval(newInterval);
		}
	}, [aiInterval]);

	/**
	 * 开始新游戏
	 */
	const startNewGame = useCallback(() => {
		console.log('[2048] 开始新游戏');
		// 如果 AI 模式正在运行，先停止
		if (isAiMode) {
			stopAiMode();
		}
		setGrid(initializeGame(gridSize));
		setGameStarted(false);
		setGameOver(false);
		setAchievedTargets(new Set());
		setCurrentTarget(null);
	}, [gridSize, isAiMode, stopAiMode]);

	/**
	 * 处理移动
	 */
	const handleMove = useCallback(
		(direction: Direction, isAiMove: boolean = false) => {
			// AI 模式下，只有 AI 可以移动
			if (!isAiMove && isAiMode) {
				console.log('[2048] AI 模式下，用户操作被禁用');
				return;
			}

			if (isAnimating || gameOver) {
				return;
			}

			console.log(`[2048] 移动方向: ${direction}${isAiMove ? ' (AI)' : ''}`);

			setGrid((prevGrid) => {
				const { grid: newGrid, moved } = moveGrid(prevGrid, direction);

				if (!moved) {
					console.log('[2048] 无法移动');
					return prevGrid;
				}

				// 标记游戏已开始
				if (!gameStarted) {
					setGameStarted(true);
				}

				// 添加新数字
				const withNewTile = addRandomTile(newGrid);

				// 清除动画标记（延迟清除，让动画先播放）
				setTimeout(() => {
					setGrid((prevGrid) =>
						prevGrid.map((row) =>
							row.map((cell) => {
								const newCell = { ...cell };
								delete newCell.merged;
								delete newCell.newCell;
								return newCell;
							})
						)
					);
				}, 300);

				// 检查是否达到目标
				const newTarget = checkTarget(withNewTile, achievedTargets);
				if (newTarget) {
					console.log(`[2048] 达成目标: ${newTarget}`);
					setAchievedTargets((prev) => new Set([...prev, newTarget]));
					setCurrentTarget(newTarget);
				}

				// 检查游戏是否结束
				setTimeout(() => {
					if (!canMove(withNewTile)) {
						console.log('[2048] 游戏结束');
						setGameOver(true);
					}
				}, 300); // 等待动画完成

				return withNewTile;
			});

			// 设置动画状态
			setIsAnimating(true);
			setTimeout(() => {
				setIsAnimating(false);
			}, 200);
		},
		[isAnimating, gameOver, gameStarted, achievedTargets, isAiMode]
	);

	/**
	 * 处理键盘事件
	 */
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// AI 模式下禁用键盘操作
			if (isAiMode) {
				return;
			}

			if (isAnimating) {
				return;
			}

			switch (e.key) {
				case 'ArrowUp':
					e.preventDefault();
					handleMove('up');
					break;
				case 'ArrowDown':
					e.preventDefault();
					handleMove('down');
					break;
				case 'ArrowLeft':
					e.preventDefault();
					handleMove('left');
					break;
				case 'ArrowRight':
					e.preventDefault();
					handleMove('right');
					break;
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => {
			window.removeEventListener('keydown', handleKeyDown);
		};
	}, [handleMove, isAnimating, isAiMode]);

	/**
	 * 处理触摸事件
	 */
	const handleTouchStart = useCallback((e: React.TouchEvent) => {
		const touch = e.touches[0];
		if (touch) {
			touchStartRef.current = { x: touch.clientX, y: touch.clientY };
		}
	}, []);

	const handleTouchEnd = useCallback(
		(e: React.TouchEvent) => {
			// AI 模式下禁用触摸操作
			if (isAiMode) {
				touchStartRef.current = null;
				return;
			}

			if (!touchStartRef.current) {
				return;
			}

			const touch = e.changedTouches[0];
			if (!touch) {
				return;
			}

			const deltaX = touch.clientX - touchStartRef.current.x;
			const deltaY = touch.clientY - touchStartRef.current.y;
			const minSwipeDistance = 30;

			if (Math.abs(deltaX) > Math.abs(deltaY)) {
				// 水平滑动
				if (Math.abs(deltaX) > minSwipeDistance) {
					if (deltaX > 0) {
						handleMove('right');
					} else {
						handleMove('left');
					}
				}
			} else {
				// 垂直滑动
				if (Math.abs(deltaY) > minSwipeDistance) {
					if (deltaY > 0) {
						handleMove('down');
					} else {
						handleMove('up');
					}
				}
			}

			touchStartRef.current = null;
		},
		[handleMove, isAiMode]
	);

	/**
	 * 关闭目标达成提示
	 */
	const closeTargetModal = useCallback(() => {
		setCurrentTarget(null);
	}, []);

	/**
	 * AI 执行移动（内部函数，直接操作状态）
	 */
	const aiExecuteMove = useCallback(() => {
		if (!isAiMode || gameOver || isAnimating) {
			return;
		}

		setGrid((prevGrid) => {
			// AI 决策
			const direction = aiDecideMove(prevGrid);
			if (!direction) {
				console.log('[2048] AI 无法找到有效移动，退出 AI 模式');
				stopAiMode();
				return prevGrid;
			}

			console.log(`[2048] AI 决策: ${direction}`);

			// 显示按钮按下状态
			setAiActiveDirection(direction);

			// 执行移动
			const { grid: newGrid, moved } = moveGrid(prevGrid, direction);

			if (!moved) {
				console.log('[2048] AI 移动失败');
				setAiActiveDirection(null);
				return prevGrid;
			}

			// 标记游戏已开始
			if (!gameStarted) {
				setGameStarted(true);
			}

			// 添加新数字
			const withNewTile = addRandomTile(newGrid);

			// 清除动画标记
			setTimeout(() => {
				setGrid((prevGrid) =>
					prevGrid.map((row) =>
						row.map((cell) => {
							const newCell = { ...cell };
							delete newCell.merged;
							delete newCell.newCell;
							return newCell;
						})
					)
				);
				setAiActiveDirection(null);
			}, 300);

			// 检查是否达到目标
			const newTarget = checkTarget(withNewTile, achievedTargets);
			if (newTarget) {
				console.log(`[2048] AI 达成目标: ${newTarget}`);
				setAchievedTargets((prev) => new Set([...prev, newTarget]));
				setCurrentTarget(newTarget);
			}

			// 检查游戏是否结束
			setTimeout(() => {
				if (!canMove(withNewTile)) {
					console.log('[2048] AI 游戏结束');
					setGameOver(true);
				}
			}, 300);

			// 设置动画状态
			setIsAnimating(true);
			setTimeout(() => {
				setIsAnimating(false);
			}, 200);

			return withNewTile;
		});
	}, [isAiMode, gameOver, isAnimating, gameStarted, achievedTargets, stopAiMode]);

	/**
	 * AI 自动执行逻辑
	 */
	useEffect(() => {
		if (!isAiMode) {
			// 清理定时器
			if (aiIntervalRef.current) {
				clearInterval(aiIntervalRef.current);
				aiIntervalRef.current = null;
			}
			setAiActiveDirection(null);
			return;
		}

		// 如果游戏结束，自动退出 AI 模式
		if (gameOver) {
			console.log('[2048] 游戏结束，自动退出 AI 模式');
			stopAiMode();
			return;
		}

		// 如果正在显示目标达成提示，等待3秒后自动关闭
		if (currentTarget) {
			const timer = setTimeout(() => {
				console.log('[2048] AI 模式：自动关闭目标达成提示');
				closeTargetModal();
			}, 3000);
			return () => clearTimeout(timer);
		}

		// 如果正在动画中，不执行 AI 移动
		if (isAnimating) {
			return;
		}

		// 设置定时器，使用动态间隔时间
		aiIntervalRef.current = setInterval(() => {
			aiExecuteMove();
		}, aiInterval * 1000); // 转换为毫秒

		return () => {
			if (aiIntervalRef.current) {
				clearInterval(aiIntervalRef.current);
				aiIntervalRef.current = null;
			}
		};
	}, [isAiMode, gameOver, currentTarget, isAnimating, stopAiMode, closeTargetModal, aiExecuteMove, aiInterval]);

	return (
		<div className="game2048">
			<div className="game2048-header">
				<h2>2048</h2>
				<div className="game2048-controls">
					<button onClick={startNewGame} className="game2048-btn game2048-btn-primary">
						新游戏
					</button>
					<button
						onClick={switchGridSize}
						disabled={gameStarted}
						className="game2048-btn game2048-btn-secondary"
						title={gameStarted ? '游戏开始后无法切换布局' : '切换布局'}
					>
						布局: {gridSize}x{gridSize}
					</button>
				</div>
			</div>

			{gameOver && (
				<div className="game2048-game-over">
					<div className="game2048-game-over-content">
						<h3>游戏结束</h3>
						<p>无法继续移动</p>
						<button onClick={startNewGame} className="game2048-btn game2048-btn-primary">
							再来一局
						</button>
					</div>
				</div>
			)}

			{currentTarget && (
				<div className="game2048-target-modal" onClick={closeTargetModal}>
					<div className="game2048-target-content" onClick={(e) => e.stopPropagation()}>
						<h3>🎉 恭喜！</h3>
						<p>您达成了目标：{currentTarget}</p>
						<button onClick={closeTargetModal} className="game2048-btn game2048-btn-primary">
							继续游戏
						</button>
					</div>
				</div>
			)}

			<div className="game2048-container">
				<div
					className="game2048-board"
					ref={gameAreaRef}
					onTouchStart={handleTouchStart}
					onTouchEnd={handleTouchEnd}
					style={{
						gridTemplateColumns: `repeat(${gridSize}, 1fr)`,
						gridTemplateRows: `repeat(${gridSize}, 1fr)`,
					}}
				>
					{grid.map((row, rowIndex) =>
						row.map((cell, colIndex) => (
							<div key={`${rowIndex}-${colIndex}`} className="game2048-cell">
								{cell.value !== 0 && (
									<div
										className={`game2048-tile game2048-tile-${cell.value} ${cell.merged ? 'game2048-tile-merged' : ''} ${cell.newCell ? 'game2048-tile-new' : ''}`}
										key={cell.id}
									>
										{cell.value}
									</div>
								)}
							</div>
						))
					)}
				</div>

				<div className="game2048-controls-panel">
					<button
						onClick={() => handleMove('up')}
						className={`game2048-direction-btn ${aiActiveDirection === 'up' ? 'game2048-direction-btn-active' : ''}`}
						disabled={isAnimating || gameOver || isAiMode}
					>
						↑
					</button>
					<div className="game2048-controls-horizontal">
						<button
							onClick={() => handleMove('left')}
							className={`game2048-direction-btn ${aiActiveDirection === 'left' ? 'game2048-direction-btn-active' : ''}`}
							disabled={isAnimating || gameOver || isAiMode}
						>
							←
						</button>
						<button
							onClick={() => handleMove('down')}
							className={`game2048-direction-btn ${aiActiveDirection === 'down' ? 'game2048-direction-btn-active' : ''}`}
							disabled={isAnimating || gameOver || isAiMode}
						>
							↓
						</button>
						<button
							onClick={() => handleMove('right')}
							className={`game2048-direction-btn ${aiActiveDirection === 'right' ? 'game2048-direction-btn-active' : ''}`}
							disabled={isAnimating || gameOver || isAiMode}
						>
							→
						</button>
					</div>
					<button
						onClick={isAiMode ? stopAiMode : startAiMode}
						className="game2048-btn game2048-btn-ai"
						disabled={gameOver}
					>
						{isAiMode ? '停止 AI 模式' : '让 AI 玩'}
					</button>
					{isAiMode && (
						<div className="game2048-ai-speed-controls">
							<button
								onClick={speedUpAi}
								className="game2048-btn game2048-btn-speed"
								disabled={aiInterval <= MIN_INTERVAL}
								title={`当前间隔: ${aiInterval}秒`}
							>
								快一点
							</button>
							<button
								onClick={slowDownAi}
								className="game2048-btn game2048-btn-speed"
								disabled={aiInterval >= MAX_INTERVAL}
								title={`当前间隔: ${aiInterval}秒`}
							>
								慢一点
							</button>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
