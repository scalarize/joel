/**
 * 移植自C语言2048 AI的启发式评分模块 (TypeScript版本)
 * 原代码使用64位整数 (board_t) 表示4x4网格，每4位存储一个方块的指数（0表示空，1表示2，2表示4，以此类推）。
 * @see https://github.com/nneonneo/2048-ai/
 */

// ==================== 类型定义与常量 ====================
type Board = bigint; // 使用BigInt模拟C语言的64位整数
// type Row = number;   // 16位行

const ROW_MASK = 0xffff;
const NUM_ROWS = 65536;

// 启发式评分参数（与C代码完全一致）
const SCORE_LOST_PENALTY = 200000.0;
const SCORE_MONOTONICITY_POWER = 4.0;
const SCORE_MONOTONICITY_WEIGHT = 47.0;
const SCORE_SUM_POWER = 3.5;
const SCORE_SUM_WEIGHT = 11.0;
const SCORE_MERGES_WEIGHT = 700.0;
const SCORE_EMPTY_WEIGHT = 270.0;

// 预计算表（在initTables中填充）
const heurScoreTable: Float64Array = new Float64Array(NUM_ROWS); // 原C代码使用float数组

// ==================== 工具函数 ====================
/**
 * 将行（16位）反序（用于右移/下移查表）
 */
function reverseRow(row: number): number {
	return ((row >> 12) & 0x000f) | ((row >> 4) & 0x00f0) | ((row << 4) & 0x0f00) | ((row << 12) & 0xf000);
}

/**
 * 将行展开为列（用于上下移动查表）
 */
function unpackCol(row: number): bigint {
	return BigInt(
		((row & 0x0001) << 0) |
			((row & 0x0010) << 3) |
			((row & 0x0100) << 6) |
			((row & 0x1000) << 9) |
			((row & 0x0002) << 4) |
			((row & 0x0020) << 7) |
			((row & 0x0200) << 10) |
			((row & 0x2000) << 13) |
			((row & 0x0004) << 8) |
			((row & 0x0040) << 11) |
			((row & 0x0400) << 14) |
			((row & 0x4000) << 17) |
			((row & 0x0008) << 12) |
			((row & 0x0080) << 15) |
			((row & 0x0800) << 18) |
			((row & 0x8000) << 21)
	);
}

/**
 * 转置棋盘（行列互换）
 */
function transpose(board: Board): Board {
	let a1 = board & 0xf0f00f0ff0f00f0fn;
	let a2 = board & 0x0000f0f00000f0f0n;
	let a3 = board & 0x0f0f00000f0f0000n;
	let a = a1 | (a2 << 12n) | (a3 >> 12n);
	let b1 = a & 0xff00ff0000ff00ffn;
	let b2 = a & 0x00ff00ff00000000n;
	let b3 = a & 0x00000000ff00ff00n;
	return b1 | (b2 >> 24n) | (b3 << 24n);
}

// ==================== 核心：启发式评分表预计算 ====================
/**
 * 初始化预计算表（必须在所有评分操作前调用一次）
 */
function initTables(): void {
	for (let row = 0; row < NUM_ROWS; ++row) {
		// 将16位行解码为4个方块的值（指数形式）
		const line = [(row >> 0) & 0xf, (row >> 4) & 0xf, (row >> 8) & 0xf, (row >> 12) & 0xf];

		// 计算启发式评分（与原C逻辑完全一致）
		let sum = 0;
		let empty = 0;
		let merges = 0;

		let prev = 0;
		let counter = 0;
		for (let i = 0; i < 4; ++i) {
			const rank = line[i];
			sum += Math.pow(rank, SCORE_SUM_POWER);
			if (rank === 0) {
				empty++;
			} else {
				if (prev === rank) {
					counter++;
				} else if (counter > 0) {
					merges += 1 + counter;
					counter = 0;
				}
				prev = rank;
			}
		}
		if (counter > 0) {
			merges += 1 + counter;
		}

		let monotonicityLeft = 0;
		let monotonicityRight = 0;
		for (let i = 1; i < 4; ++i) {
			if (line[i - 1] > line[i]) {
				monotonicityLeft += Math.pow(line[i - 1], SCORE_MONOTONICITY_POWER) - Math.pow(line[i], SCORE_MONOTONICITY_POWER);
			} else {
				monotonicityRight += Math.pow(line[i], SCORE_MONOTONICITY_POWER) - Math.pow(line[i - 1], SCORE_MONOTONICITY_POWER);
			}
		}

		heurScoreTable[row] =
			SCORE_LOST_PENALTY +
			SCORE_EMPTY_WEIGHT * empty +
			SCORE_MERGES_WEIGHT * merges -
			SCORE_MONOTONICITY_WEIGHT * Math.min(monotonicityLeft, monotonicityRight) -
			SCORE_SUM_WEIGHT * sum;
	}
}

// ==================== 评分函数 ====================
/**
 * 辅助函数：使用预计算表对棋盘行/列评分
 */
function scoreHelper(board: Board, table: Float64Array): number {
	return Number(
		table[Number((board >> 0n) & BigInt(ROW_MASK))] +
			table[Number((board >> 16n) & BigInt(ROW_MASK))] +
			table[Number((board >> 32n) & BigInt(ROW_MASK))] +
			table[Number((board >> 48n) & BigInt(ROW_MASK))]
	);
}

/**
 * 主启发式评分函数：对棋盘的行和列分别评分后相加
 */
export function scoreHeurBoard(board: Board): number {
	return scoreHelper(board, heurScoreTable) + scoreHelper(transpose(board), heurScoreTable);
}

// ==================== 数据转换适配器（需要你根据实际情况调整） ====================

interface Cell {
	value: number;
	id: string; // 用于动画追踪
	merged?: boolean; // 标记是否刚合并
	newCell?: boolean; // 标记是否新生成的
}

/**
 * 将你的 Cell[][] 网格转换为 64位棋盘表示 (Board)
 * 假设 Cell.value 是实际数值（如 2, 4, 8...）
 */
export function gridToBoard(grid: Cell[][]): Board {
	let board = 0n;
	for (let r = 0; r < 4; ++r) {
		for (let c = 0; c < 4; ++c) {
			const val = grid[r][c].value;
			if (val > 0) {
				// 将实际数值转换为指数：2->1, 4->2, 8->3, ...
				const exponent = Math.log2(val);
				board |= BigInt(exponent) << BigInt(4 * (r * 4 + c));
			}
		}
	}
	return board;
}

// ==================== 使用示例 ====================
// 1. 在应用启动时初始化一次
initTables();

// 2. 在你的AI决策中调用
// const board = gridToBoard(yourGrid);
// const heuristicScore = scoreHeurBoard(board);
// 可以将此分数与你现有的评估函数结合，或直接用作新的评估函数
