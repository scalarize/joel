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

export default function Game2048() {
	const [grid, setGrid] = useState<Cell[][]>(() => initializeGame(4));
	const [gridSize, setGridSize] = useState<GridSize>(4);
	const [gameStarted, setGameStarted] = useState(false);
	const [gameOver, setGameOver] = useState(false);
	const [achievedTargets, setAchievedTargets] = useState<Set<number>>(new Set());
	const [currentTarget, setCurrentTarget] = useState<number | null>(null);
	const [isAnimating, setIsAnimating] = useState(false);
	const gameAreaRef = useRef<HTMLDivElement>(null);
	const touchStartRef = useRef<{ x: number; y: number } | null>(null);

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
	 * 开始新游戏
	 */
	const startNewGame = useCallback(() => {
		console.log('[2048] 开始新游戏');
		setGrid(initializeGame(gridSize));
		setGameStarted(false);
		setGameOver(false);
		setAchievedTargets(new Set());
		setCurrentTarget(null);
	}, [gridSize]);

	/**
	 * 处理移动
	 */
	const handleMove = useCallback(
		(direction: Direction) => {
			if (isAnimating || gameOver) {
				return;
			}

			console.log(`[2048] 移动方向: ${direction}`);

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
		[isAnimating, gameOver, gameStarted, achievedTargets]
	);

	/**
	 * 处理键盘事件
	 */
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
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
	}, [handleMove, isAnimating]);

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
		[handleMove]
	);

	/**
	 * 关闭目标达成提示
	 */
	const closeTargetModal = useCallback(() => {
		setCurrentTarget(null);
	}, []);

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
					<button onClick={() => handleMove('up')} className="game2048-direction-btn" disabled={isAnimating || gameOver}>
						↑
					</button>
					<div className="game2048-controls-horizontal">
						<button onClick={() => handleMove('left')} className="game2048-direction-btn" disabled={isAnimating || gameOver}>
							←
						</button>
						<button onClick={() => handleMove('down')} className="game2048-direction-btn" disabled={isAnimating || gameOver}>
							↓
						</button>
						<button onClick={() => handleMove('right')} className="game2048-direction-btn" disabled={isAnimating || gameOver}>
							→
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
