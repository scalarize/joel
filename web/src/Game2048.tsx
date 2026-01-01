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
		.map(() =>
			Array(size)
				.fill(null)
				.map(() => ({ value: 0, id: generateId() }))
		);
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
			.map(() =>
				Array(size)
					.fill(null)
					.map(() => ({ value: 0, id: generateId() }))
			);

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
function moveLeft(grid: Cell[][]): { grid: Cell[][]; moved: boolean; score: number } {
	const size = grid.length;
	const newGrid: Cell[][] = Array(size)
		.fill(null)
		.map(() =>
			Array(size)
				.fill(null)
				.map(() => ({ value: 0, id: generateId() }))
		);
	let moved = false;
	let score = 0;

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
				const mergedValue = line[i].value * 2;
				merged.push({
					value: mergedValue,
					id: generateId(),
					merged: true,
				});
				// 合并产生的分数 = 合并后的数字值
				score += mergedValue;
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

	return { grid: newGrid, moved, score };
}

/**
 * 移动网格
 */
function moveGrid(grid: Cell[][], direction: Direction): { grid: Cell[][]; moved: boolean; score: number } {
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
	const { grid: movedGrid, moved, score } = moveLeft(rotated);

	// 旋转回来
	let result = movedGrid;
	for (let i = 0; i < (4 - rotateTimes) % 4; i++) {
		result = rotateGrid(result, 1);
	}

	return { grid: result, moved, score };
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

	return hasAnyMovePossible(grid);
}

function hasAnyMovePossible(grid: Cell[][]): boolean {
	const size = grid.length;

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
 * 计算空位数量
 */
function countEmptyTiles(grid: Cell[][]): number {
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
 * 统一的定向聚集奖励函数
 * 奖励大数字们不仅彼此靠近，并且集体朝向目标角落聚集。
 * @param grid 4x4游戏网格
 * @param targetCorner 目标角落的坐标，默认为左上角 [0, 0]
 * @param topN 考虑的最大数字数量
 * @returns 奖励分数（正数），越符合“定向聚集”，奖励越高
 */
function getDirectedClusterBonus(grid: Cell[][], targetCorner: [number, number] = [0, 0], topN: number = 4): number {
	const [targetRow, targetCol] = targetCorner;
	const tiles: { value: number; row: number; col: number }[] = [];

	// 1. 收集所有非空单元格
	for (let r = 0; r < grid.length; r++) {
		for (let c = 0; c < grid[r].length; c++) {
			const val = grid[r][c].value;
			if (val !== 0) {
				tiles.push({ value: val, row: r, col: c });
			}
		}
	}

	// 2. 按值排序，取前 topN 个
	tiles.sort((a, b) => b.value - a.value);
	const clusterTiles = tiles.slice(0, Math.min(topN, tiles.length));

	if (clusterTiles.length < 2) {
		return 15; // 基础奖励，鼓励继续游戏
	}

	// 3. 计算【集群内聚度】惩罚：集群内部两两距离和
	let internalDispersion = 0;
	for (let i = 0; i < clusterTiles.length; i++) {
		for (let j = i + 1; j < clusterTiles.length; j++) {
			internalDispersion += Math.abs(clusterTiles[i].row - clusterTiles[j].row) + Math.abs(clusterTiles[i].col - clusterTiles[j].col);
		}
	}

	// 4. 计算【集群方位度】惩罚：集群平均位置到目标角落的距离
	let avgRow = 0,
		avgCol = 0;
	let totalValue = 0;
	// 按值加权平均，让大数在计算平均位置时更有话语权
	for (const tile of clusterTiles) {
		avgRow += tile.row * tile.value;
		avgCol += tile.col * tile.value;
		totalValue += tile.value;
	}
	avgRow /= totalValue;
	avgCol /= totalValue;

	const distanceToTarget = Math.abs(avgRow - targetRow) + Math.abs(avgCol - targetCol);

	// 5. 综合计算总惩罚
	// 权重系数是调参关键：CLUSTER_WEIGHT 控制内聚重要性，TARGET_WEIGHT 控制方位重要性
	const CLUSTER_WEIGHT = 1; // 对内聚的重视程度
	const TARGET_WEIGHT = 3; // 对朝向目标的重视程度（建议 > 1）
	const totalPenalty = internalDispersion * CLUSTER_WEIGHT + distanceToTarget * TARGET_WEIGHT;

	// 6. 将总惩罚转换为奖励（惩罚越小，奖励越高）
	const BASE = 200;
	const bonus = BASE / (totalPenalty + 1);
	return bonus;
}

/**
 * 计算当前网格的"平滑度惩罚"分数
 * 惩罚值越高，表示棋盘越不平滑，局面越差
 */
function getSmoothnessPenalty(grid: Cell[][]): number {
	let penalty = 0;
	const size = grid.length;

	// 1. 计算水平方向（行内）的相邻差异
	for (let row = 0; row < size; row++) {
		for (let col = 0; col < size - 1; col++) {
			const current = grid[row][col].value;
			const right = grid[row][col + 1].value;
			if (current !== 0 && right !== 0) {
				// 使用log2使得"4与8"和"32与64"的差异度相同
				penalty += Math.abs(Math.log2(current) - Math.log2(right));
			}
		}
	}

	// 2. 计算垂直方向（列内）的相邻差异
	for (let col = 0; col < size; col++) {
		for (let row = 0; row < size - 1; row++) {
			const current = grid[row][col].value;
			const down = grid[row + 1][col].value;
			if (current !== 0 && down !== 0) {
				penalty += Math.abs(Math.log2(current) - Math.log2(down));
			}
		}
	}

	return penalty;
}

/**
 * 比较两个网格是否相同（仅比较值）
 */
function gridsEqual(grid1: Cell[][], grid2: Cell[][]): boolean {
	if (grid1.length !== grid2.length) {
		return false;
	}
	for (let row = 0; row < grid1.length; row++) {
		if (grid1[row].length !== grid2[row].length) {
			return false;
		}
		for (let col = 0; col < grid1[row].length; col++) {
			if (grid1[row][col].value !== grid2[row][col].value) {
				return false;
			}
		}
	}
	return true;
}

/**
 * 计算一次移动后，新产生的合并所带来的奖励分数
 */
function getImmediateMergeBonus(oldGrid: Cell[][], newGrid: Cell[][]): number {
	// 如果没有变化（无效移动），奖励为0
	if (gridsEqual(oldGrid, newGrid)) {
		return 0;
	}

	let bonus = 0;
	const size = newGrid.length;

	// 关键逻辑：只在"新网格"中寻找相邻的相等格子
	for (let row = 0; row < size; row++) {
		for (let col = 0; col < size; col++) {
			const current = newGrid[row][col].value;
			if (current === 0) continue; // 跳过空格

			// 检查右侧邻居（避免重复计算，每对只算一次）
			if (col < size - 1 && newGrid[row][col + 1].value === current) {
				// 奖励与合并产生的数值成正比
				bonus += current; // 例如，合并两个4得到8，奖励+4+4=8
				col++; // 跳过已匹配的这对格子的下一个，防止重复计算
			}
		}
	}

	// 检查垂直方向（列内）的相邻相等格子
	for (let col = 0; col < size; col++) {
		for (let row = 0; row < size; row++) {
			const current = newGrid[row][col].value;
			if (current === 0) continue; // 跳过空格

			// 检查下方邻居
			if (row < size - 1 && newGrid[row + 1][col].value === current) {
				bonus += current;
				row++; // 跳过已匹配的这对格子的下一个，防止重复计算
			}
		}
	}

	return bonus;
}

/**
 * AI 评估函数：评估当前游戏状态的分数
 * 综合多个因素：
 * 1. 空位数量（越多越好）
 * 2. 最大数字聚角惩罚（大数远离左上角会被惩罚）
 * 3. 平滑度惩罚（相邻数字差异大会被惩罚）
 */
function evaluateGrid(grid: Cell[][]): number {
	const CLUSTERED_WEIGHT = 100;
	const SMOOTHNESS_WEIGHT = -5;
	const EMPTY_WEIGHT = 20;

	// 1. 【战略层】大数聚集度（高权重）：替代“聚角惩罚”，驱动长期布局
	const closenessBonus = getDirectedClusterBonus(grid) * CLUSTERED_WEIGHT; // 高，如 100

	// 2. 【战术层】棋盘有序性（中权重）：保证合并流畅
	const smoothnessPenalty = getSmoothnessPenalty(grid) * SMOOTHNESS_WEIGHT; // 中，如 -5

	// 3. 【资源层】操作空间（低权重）：必要但不可过度
	const emptyCount = countEmptyTiles(grid) * EMPTY_WEIGHT; // 低，从 100 降至 20-30

	// 4. 【攻击层】即时机会（中高权重）：鼓励积极合并
	// （注：此部分在 aiDecideMove 中与方向相关，不在此函数内）

	const score = closenessBonus + emptyCount - smoothnessPenalty;
	return score;
}

/**
 * AI 决策函数：测试四个方向，返回分数最高的方向
 */
function aiDecideMove(grid: Cell[][]): Direction | null {
	const MERGE_WEIGHT = 10;

	// === 第一优先级：安全合并最大数的机会 ===
	const maxTile = grid.flat().reduce((max, cell) => Math.max(max, cell.value), 0);
	const safeMaxMergeMoves: Direction[] = [];

	const directions: Direction[] = shuffleArray(['up', 'down', 'left', 'right']);
	let bestDirection: Direction | null = null;
	let bestScore = -Infinity;

	// 没有移动的惩罚值
	const NO_MOVE_PENALTY = -10000;

	for (const direction of directions) {
		const { grid: newGrid, moved } = moveGrid(grid, direction);
		if (!moved) continue;

		const newMaxTile = newGrid.flat().reduce((max, cell) => Math.max(max, cell.value), 0);
		if (newMaxTile > maxTile && hasAnyMovePossible(newGrid)) {
			safeMaxMergeMoves.push(direction);
		}

		// === 唯一的、绝对的风险检查 ===
		if (!hasAnyMovePossible(newGrid)) {
			// 此移动将导致“听天由命”的局面，给予重罚
			if (NO_MOVE_PENALTY > bestScore) {
				bestScore = NO_MOVE_PENALTY;
				bestDirection = direction; // 记录这个“最不坏”的坏方向
			}
			continue;
		}

		// === 正常评估：只基于我们100%可控的 newGrid ===
		// 计算即时合并奖励
		const mergeBonus = getImmediateMergeBonus(grid, newGrid);
		const evalScore = evaluateGrid(newGrid);
		const finalScore = evalScore + mergeBonus * MERGE_WEIGHT;

		if (finalScore > bestScore) {
			bestScore = finalScore;
			bestDirection = direction;
		}
	}

	if (safeMaxMergeMoves.length > 0) {
		return safeMaxMergeMoves[Math.floor(Math.random() * safeMaxMergeMoves.length)];
	}

	return bestDirection;
}

function shuffleArray<T>(array: T[]): T[] {
	const shuffled = [...array]; // 创建副本，避免修改原数组
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1)); // 生成 [0, i] 的随机索引
		[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; // 交换元素
	}
	return shuffled;
}

export default function Game2048() {
	const [grid, setGrid] = useState<Cell[][]>(() => initializeGame(4));
	const [gridSize, setGridSize] = useState<GridSize>(4);
	const [gameStarted, setGameStarted] = useState(false);
	const [gameOver, setGameOver] = useState(false);
	const [showGameOverModal, setShowGameOverModal] = useState(false);
	const [score, setScore] = useState(0);
	const [achievedTargets, setAchievedTargets] = useState<Set<number>>(new Set());
	const [currentTarget, setCurrentTarget] = useState<number | null>(null);
	const [isAnimating, setIsAnimating] = useState(false);
	const [isAiMode, setIsAiMode] = useState(false);
	const [aiActiveDirection, setAiActiveDirection] = useState<Direction | null>(null);
	const [aiInterval, setAiInterval] = useState<number>(1); // AI 执行间隔（秒）
	const gameAreaRef = useRef<HTMLDivElement>(null);
	const touchStartRef = useRef<{ x: number; y: number } | null>(null);
	const aiIntervalRef = useRef<number | null>(null);

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
		setShowGameOverModal(false);
		setScore(0);
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
		setShowGameOverModal(false);
		setScore(0);
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
				const { grid: newGrid, moved, score: moveScore } = moveGrid(prevGrid, direction);

				if (!moved) {
					console.log('[2048] 无法移动');
					return prevGrid;
				}

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
