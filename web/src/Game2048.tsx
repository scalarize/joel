/**
 * 2048 游戏
 * 路径：/mini-games/2048/
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import './Game2048.css';

// 从 Game2048Logic.ts 导入所有游戏逻辑函数和类型
// 注意：只导入在此文件中直接使用的函数，其他函数（如 evaluateGrid, shuffleArray 等）
// 会被 aiDecideMove 等函数内部使用，由模块系统自动处理依赖
import type { Direction, GridSize, Cell } from './Game2048Logic';
import {
	generateId, // 用于 restoreGridFromState
	addRandomTile, // 用于添加新方块
	initializeGame, // 用于初始化游戏
	moveGrid, // 用于移动网格
	canMove, // 用于检查是否可以移动
	aiDecideMove, // 用于 AI 决策（内部会使用其他函数）
} from './Game2048Logic';

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
 * 游戏状态接口（用于保存和恢复）
 */
interface GameState {
	grid: number[][]; // 只保存数字值，不保存 id 等临时属性
	gridSize: GridSize;
	gameStarted: boolean;
	score: number;
	achievedTargets: number[]; // Set 转为数组
	moveCount: number;
}

const STORAGE_KEY = 'game2048_state';
const SAVE_INTERVAL = 5; // 每 5 步保存一次

/**
 * 保存游戏状态到 localStorage
 */
function saveGameState(
	grid: Cell[][],
	gridSize: GridSize,
	gameStarted: boolean,
	score: number,
	achievedTargets: Set<number>,
	moveCount: number
): void {
	try {
		// 只保存数字值，不保存临时属性
		const gridValues: number[][] = grid.map((row) => row.map((cell) => cell.value));

		const state: GameState = {
			grid: gridValues,
			gridSize,
			gameStarted,
			score,
			achievedTargets: Array.from(achievedTargets),
			moveCount,
		};

		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
		console.log(`[2048] 游戏状态已保存 (步数: ${moveCount})`);
	} catch (error) {
		console.error('[2048] 保存游戏状态失败:', error);
	}
}

/**
 * 从 localStorage 恢复游戏状态
 */
function loadGameState(): GameState | null {
	try {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (!saved) {
			return null;
		}

		const state: GameState = JSON.parse(saved);
		console.log('[2048] 检测到保存的游戏状态，准备恢复');
		return state;
	} catch (error) {
		console.error('[2048] 恢复游戏状态失败:', error);
		return null;
	}
}

/**
 * 清除保存的游戏状态
 */
function clearGameState(): void {
	try {
		localStorage.removeItem(STORAGE_KEY);
		console.log('[2048] 已清除保存的游戏状态');
	} catch (error) {
		console.error('[2048] 清除游戏状态失败:', error);
	}
}

/**
 * 将保存的网格值转换为 Cell 数组
 */
function restoreGridFromState(gridValues: number[][]): Cell[][] {
	return gridValues.map((row) =>
		row.map((value) => ({
			value,
			id: generateId(),
		}))
	);
}

export default function Game2048() {
	// 尝试恢复保存的游戏状态
	const savedState = loadGameState();
	const initialGrid = savedState ? restoreGridFromState(savedState.grid) : initializeGame(4);
	const initialGridSize = savedState?.gridSize ?? 4;
	const initialGameStarted = savedState?.gameStarted ?? false;
	const initialScore = savedState?.score ?? 0;
	const initialAchievedTargets = savedState ? new Set(savedState.achievedTargets) : new Set<number>();
	const initialMoveCount = savedState?.moveCount ?? 0;

	const [grid, setGrid] = useState<Cell[][]>(initialGrid);
	const [gridSize, setGridSize] = useState<GridSize>(initialGridSize);
	const [gameStarted, setGameStarted] = useState(initialGameStarted);
	const [gameOver, setGameOver] = useState(false);
	const [showGameOverModal, setShowGameOverModal] = useState(false);
	const [score, setScore] = useState(initialScore);
	const [achievedTargets, setAchievedTargets] = useState<Set<number>>(initialAchievedTargets);
	const [currentTarget, setCurrentTarget] = useState<number | null>(null);
	const [isAnimating, setIsAnimating] = useState(false);
	const [isAiMode, setIsAiMode] = useState(false);
	const [aiActiveDirection, setAiActiveDirection] = useState<Direction | null>(null);
	const [aiInterval, setAiInterval] = useState<number>(1); // AI 执行间隔（秒）
	const [moveCount, setMoveCount] = useState(initialMoveCount); // 步数计数器
	const gameAreaRef = useRef<HTMLDivElement>(null);
	const touchStartRef = useRef<{ x: number; y: number } | null>(null);
	const aiIntervalRef = useRef<number | null>(null);

	// 如果恢复了保存的状态，显示提示
	useEffect(() => {
		if (savedState) {
			console.log('[2048] 游戏状态已恢复:', {
				gridSize: savedState.gridSize,
				score: savedState.score,
				moveCount: savedState.moveCount,
			});
		}
	}, []);

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
		// 切换布局时清除保存的状态
		clearGameState();
		setGridSize(nextSize);
		setGrid(initializeGame(nextSize));
		setGameOver(false);
		setShowGameOverModal(false);
		setScore(0);
		setAchievedTargets(new Set());
		setCurrentTarget(null);
		setMoveCount(0);
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
		// 清除保存的游戏状态
		clearGameState();
		setGrid(initializeGame(gridSize));
		setGameStarted(false);
		setGameOver(false);
		setShowGameOverModal(false);
		setScore(0);
		setAchievedTargets(new Set());
		setCurrentTarget(null);
		setMoveCount(0);
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
				const { grid: newGrid, moved, score: moveScore } = moveGrid(prevGrid, direction);

				if (!moved) {
					console.log('[2048] 无法移动');
					return prevGrid;
				}

				// 增加步数
				setMoveCount((prevCount) => {
					const newCount = prevCount + 1;
					console.log(`[2048] 步数: ${newCount}`);
					return newCount;
				});

				// 累加分数
				setScore((prevScore) => {
					const newScore = prevScore + moveScore;
					console.log(`[2048] 本次移动得分: ${moveScore}, 总分: ${newScore}`);
					return newScore;
				});

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
						setShowGameOverModal(true);
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

	// 自动保存游戏状态（每 N 步保存一次）
	useEffect(() => {
		// 只有在游戏已开始且步数大于0时才保存
		if (!gameStarted || moveCount === 0) {
			return;
		}

		// 每 N 步保存一次
		if (moveCount % SAVE_INTERVAL === 0) {
			saveGameState(grid, gridSize, gameStarted, score, achievedTargets, moveCount);
		}
	}, [grid, gridSize, gameStarted, score, achievedTargets, moveCount]);

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
	 * 关闭游戏结束弹窗（但保持 gameOver 状态，让用户可以查看最终状态）
	 */
	const closeGameOverModal = useCallback(() => {
		console.log('[2048] 关闭游戏结束弹窗');
		setShowGameOverModal(false);
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
			const { grid: newGrid, moved, score: moveScore } = moveGrid(prevGrid, direction);

			if (!moved) {
				console.log('[2048] AI 移动失败');
				setAiActiveDirection(null);
				return prevGrid;
			}

			// 累加分数
			setScore((prevScore) => prevScore + moveScore);
			console.log(`[2048] AI 本次移动得分: ${moveScore}`);

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
					setShowGameOverModal(true);
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
				<div className="game2048-score">
					<div className="game2048-score-label">得分</div>
					<div className="game2048-score-value">{score.toLocaleString()}</div>
				</div>
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

			{gameOver && showGameOverModal && (
				<div className="game2048-game-over" onClick={closeGameOverModal}>
					<div className="game2048-game-over-content" onClick={(e) => e.stopPropagation()}>
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
										className={`game2048-tile game2048-tile-${cell.value} ${cell.merged ? 'game2048-tile-merged' : ''} ${
											cell.newCell ? 'game2048-tile-new' : ''
										}`}
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
					<button onClick={isAiMode ? stopAiMode : startAiMode} className="game2048-btn game2048-btn-ai" disabled={gameOver}>
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
