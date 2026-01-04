/**
 * 2048 游戏核心逻辑
 * 包含所有游戏逻辑函数，不依赖 React 或 UI
 * 可以被 Game2048.tsx 和 simulate-2048-ai.ts 共享使用
 *
 * 导出策略：
 * - 只导出被外部直接使用的函数和类型
 * - 内部辅助函数（如 evaluateGrid, shuffleArray 等）不导出，由模块系统自动处理依赖
 */

export type Direction = 'up' | 'down' | 'left' | 'right';
export type GridSize = 4 | 5 | 6;

export interface Cell {
	value: number;
	id: string; // 用于动画追踪
	merged?: boolean; // 标记是否刚合并
	newCell?: boolean; // 标记是否新生成的
}

/**
 * 生成唯一ID
 */
export function generateId(): string {
	return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 创建空网格（内部使用）
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
export function addRandomTile(grid: Cell[][]): Cell[][] {
	const emptyCells: { cell: Cell; row: number; col: number }[] = getEmptyTiles(grid);
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
export function initializeGame(size: GridSize): Cell[][] {
	let grid = createEmptyGrid(size);
	grid = addRandomTile(grid);
	grid = addRandomTile(grid);
	return grid;
}

/**
 * 旋转网格（用于统一处理方向，内部使用）
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
 * 向左移动并合并（内部使用）
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
export function moveGrid(grid: Cell[][], direction: Direction): { grid: Cell[][]; moved: boolean; score: number } {
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
export function canMove(grid: Cell[][]): boolean {
	if (getEmptyTiles(grid).length > 0) {
		return true;
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
 * 计算空位数量（内部使用）
 */
function getEmptyTiles(grid: Cell[][]): { cell: Cell; row: number; col: number }[] {
	let emptyCells: { cell: Cell; row: number; col: number }[] = [];
	for (let row = 0; row < grid.length; row++) {
		for (let col = 0; col < grid[row].length; col++) {
			if (grid[row][col].value === 0) {
				emptyCells.push({ cell: grid[row][col], row, col });
			}
		}
	}
	return emptyCells;
}

/**
 * 统一的定向聚集奖励函数（内部使用）
 * 奖励大数字们不仅彼此靠近，并且集体朝向目标角落聚集。
 * @param grid 4x4游戏网格
 * @param targetCorner 目标角落的坐标，默认为左上角 [0, 0]
 * @param topN 考虑的最大数字数量
 * @returns 奖励分数（正数），越符合"定向聚集"，奖励越高
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
 * 计算当前网格的"平滑度惩罚"分数（内部使用）
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
 * 比较两个网格是否相同（仅比较值，内部使用）
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
 * 计算一次移动后，新产生的合并所带来的奖励分数（内部使用）
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
 * AI 评估函数：评估当前游戏状态的分数（内部使用）
 * 综合多个因素：
 * 1. 空位数量（越多越好）
 * 2. 最大数字聚角惩罚（大数远离左上角会被惩罚）
 * 3. 平滑度惩罚（相邻数字差异大会被惩罚）
 */
function evaluateGrid(grid: Cell[][], newGrid: Cell[][]): number {
	let MERGE_WEIGHT = 10; // default 10
	let CLUSTERED_WEIGHT = 100; // default 100
	let SMOOTHNESS_WEIGHT = 0; // default -5
	let EMPTY_WEIGHT = 100; // default 20

	const emptyCount = getEmptyTiles(newGrid).length;
	// 可以考虑根据剩余空间调整参数? 是的，但是不是很好用

	// 1. 计算即时合并奖励
	const mergeBonus = getImmediateMergeBonus(grid, newGrid) * MERGE_WEIGHT;

	// 2. 【战略层】大数聚集度（高权重）：替代"聚角惩罚"，驱动长期布局
	const closenessBonus = getDirectedClusterBonus(newGrid) * CLUSTERED_WEIGHT; // 高，如 100

	// 3. 【战术层】棋盘有序性（中权重）：保证合并流畅
	const smoothnessPenalty = getSmoothnessPenalty(newGrid) * SMOOTHNESS_WEIGHT; // 中，如 -5

	// 4. 【资源层】操作空间（低权重）：必要但不可过度
	const emptyBonus = emptyCount * EMPTY_WEIGHT; // 低，从 100 降至 20-30

	// 4. 【攻击层】即时机会（中高权重）：鼓励积极合并
	// （注：此部分在 aiDecideMove 中与方向相关，不在此函数内）

	const score = mergeBonus + closenessBonus + emptyBonus - smoothnessPenalty;
	return score;
}

function getTopNTiles(grid: Cell[][], n: number): { value: number; cnt: number }[] {
	let ret: { value: number; cnt: number }[] = [];
	for (const cell of grid.flat()) {
		if (cell.value === 0) continue;
		// 对 ret 作插入排序
		let inserted = false;
		for (let i = 0; i < ret.length; i++) {
			if (ret[i].value < cell.value) {
				ret.splice(i, 0, { value: cell.value, cnt: 1 });
				inserted = true;
				break;
			}
		}
		if (!inserted) {
			ret.push({ value: cell.value, cnt: 1 });
		}
	}
	return ret.slice(0, n);
}

/**
 * 优先移动方向：尝试找到一个方向，使得最大数字数量增加最多，且合并后的局面仍然有移动的可能性
 * @param grid 游戏网格
 * @param topN 考虑的最大数字数量
 * @returns 优先移动的方向，如果没有则返回 null
 */
function prioritizedMove(grid: Cell[][], topN: number): Direction | null {
	const topNTiles = getTopNTiles(grid, topN);
	const topNValue = topNTiles.reduce((sum, tile) => sum + tile.value * tile.cnt, 0);
	let safeTopNMergeMoveValue = 0;
	let safeTopNMergeMoveDirection: Direction | null = null;

	const directions: Direction[] = shuffleArray(['up', 'down', 'left', 'right']);

	for (const direction of directions) {
		const { grid: newGrid, moved } = moveGrid(grid, direction);
		if (!moved || !hasAnyMovePossible(newGrid)) continue;

		const newTopNTiles = getTopNTiles(newGrid, topN);
		const newTopNValue = newTopNTiles.reduce((sum, tile) => sum + tile.value * tile.cnt, 0);
		const valueDelta = newTopNValue - topNValue;
		if (valueDelta > safeTopNMergeMoveValue) {
			safeTopNMergeMoveValue = valueDelta;
			safeTopNMergeMoveDirection = direction;
		}
	}

	return safeTopNMergeMoveDirection;
}

/**
 * AI 决策函数：测试四个方向，返回分数最高的方向
 */
export function aiDecideMove(grid: Cell[][]): Direction | null {
	// === 第一优先级：安全合并最大数的机会 ===
	const prioritizedMoveDirection = prioritizedMove(grid, 1);
	if (prioritizedMoveDirection !== null) {
		return prioritizedMoveDirection;
	}

	const directions: Direction[] = shuffleArray(['up', 'down', 'left', 'right']);
	let bestDirection: Direction | null = null;
	let bestScore = -Infinity;

	// 没有移动的惩罚值
	const NO_MOVE_PENALTY = -10000;

	for (const direction of directions) {
		const { grid: newGrid, moved } = moveGrid(grid, direction);
		if (!moved) continue;

		// === 唯一的、绝对的风险检查 ===
		if (!hasAnyMovePossible(newGrid)) {
			// 此移动将导致"听天由命"的局面，给予重罚
			if (NO_MOVE_PENALTY > bestScore) {
				bestScore = NO_MOVE_PENALTY;
				bestDirection = direction; // 记录这个"最不坏"的坏方向
			}
			continue;
		}

		// === 正常评估：只基于我们100%可控的 newGrid ===
		const evalScore = evaluateGrid(grid, newGrid);

		if (evalScore > bestScore) {
			bestScore = evalScore;
			bestDirection = direction;
		}
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
