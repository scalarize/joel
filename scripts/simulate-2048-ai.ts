/// <reference types="node" />

/**
 * 2048 AI 模拟脚本
 * 快速模拟多次 AI 游戏，统计得分和最高数字
 *
 * 使用方法：
 *   npx tsx scripts/simulate-2048-ai.ts [运行次数] [网格大小]
 *
 * 例如：
 *   npx tsx scripts/simulate-2048-ai.ts 100 4
 *
 * 注意：此脚本依赖于 web/src/Game2048Logic.ts 中导出的游戏逻辑函数，
 * 避免了代码重复，确保游戏逻辑的一致性。Game2048Logic.ts 是纯逻辑文件，
 * 不包含 React 或 CSS 依赖，可以在 Node.js 环境中直接使用。
 */

// 从 Game2048Logic.ts 导入所有需要的类型和函数
import type { Direction, GridSize, Cell } from '../web/src/Game2048Logic';
import { initializeGame, addRandomTile, moveGrid, canMove, aiDecideMove } from '../web/src/Game2048Logic';

interface SimulationResult {
	score: number;
	maxTile: number;
	moveCount: number;
}

/**
 * 获取网格中的最大数字
 */
function getMaxTile(grid: Cell[][]): number {
	return grid.flat().reduce((max, cell) => Math.max(max, cell.value), 0);
}

/**
 * 运行一次完整的 AI 游戏模拟
 */
function simulateSingleGame(gridSize: GridSize = 4, gameIndex: number, totalGames: number): SimulationResult {
	let grid = initializeGame(gridSize);
	let score = 0;
	let moveCount = 0;
	const step = Math.max(1, Math.floor(totalGames / 10));

	process.stdout.write(`\r[${gameIndex}/${totalGames}] 进行中...`);

	while (canMove(grid)) {
		const direction = aiDecideMove(grid);
		if (!direction) {
			break;
		}

		const { grid: newGrid, moved, score: moveScore } = moveGrid(grid, direction);
		if (!moved) {
			break;
		}

		score += moveScore;
		moveCount++;
		grid = addRandomTile(newGrid);
	}

	const maxTile = getMaxTile(grid);
	if (gameIndex % step === 0) {
		process.stdout.write(`\r[${gameIndex}/${totalGames}] 完成 - 步数: ${moveCount}, 得分: ${score.toLocaleString()}, 最高块: ${maxTile}\n`);
	}

	return {
		score,
		maxTile,
		moveCount,
	};
}

/**
 * 运行多次模拟并统计结果
 */
function runSimulations(count: number, gridSize: GridSize = 4): void {
	console.log(`\n========== 2048 AI 模拟开始 ==========`);
	console.log(`模拟次数: ${count}`);
	console.log(`网格大小: ${gridSize}x${gridSize}\n`);

	const results: SimulationResult[] = [];
	const startTime = Date.now();

	for (let i = 0; i < count; i++) {
		const result = simulateSingleGame(gridSize, i + 1, count);
		results.push(result);
	}

	const endTime = Date.now();
	const duration = ((endTime - startTime) / 1000).toFixed(2);

	// 统计结果
	const scores = results.map((r) => r.score);
	const maxTiles = results.map((r) => r.maxTile);
	const moveCounts = results.map((r) => r.moveCount);

	const maxScore = Math.max(...scores);
	const minScore = Math.min(...scores);
	const avgScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;

	const maxTileValue = Math.max(...maxTiles);
	const maxTileCounts = new Map<number, number>();
	maxTiles.forEach((tile) => {
		maxTileCounts.set(tile, (maxTileCounts.get(tile) || 0) + 1);
	});
	const avgMaxTile = maxTiles.reduce((sum, t) => sum + t, 0) / maxTiles.length;

	const avgMoveCount = moveCounts.reduce((sum, m) => sum + m, 0) / moveCounts.length;

	// 输出统计结果
	console.log(`\n========== 模拟结果统计 ==========`);
	console.log(`总耗时: ${duration} 秒`);
	console.log(`平均每次耗时: ${(parseFloat(duration) / count).toFixed(2)} 秒`);
	console.log(`\n--- 得分统计 ---`);
	console.log(`  最高得分: ${maxScore.toLocaleString()}`);
	console.log(`  最低得分: ${minScore.toLocaleString()}`);
	console.log(`  平均得分: ${avgScore.toFixed(2).toLocaleString()}`);
	console.log(`\n--- 最高块统计 ---`);
	console.log(`  最高数字: ${maxTileValue}`);
	console.log(`  平均最高数字: ${avgMaxTile.toFixed(2)}`);
	console.log(`\n--- 达到各最高数字的次数 ---`);
	const sortedTiles = Array.from(maxTileCounts.entries())
		.sort((a, b) => b[0] - a[0])
		.slice(0, 10); // 只显示前10个
	for (const [tile, count] of sortedTiles) {
		const percentage = ((count / results.length) * 100).toFixed(1);
		console.log(`  ${tile}: ${count} 次 (${percentage}%)`);
	}
	console.log(`\n--- 其他统计 ---`);
	console.log(`  平均步数: ${avgMoveCount.toFixed(2)}`);
	console.log(`=====================================\n`);
}

// 主函数
function main() {
	const args = process.argv.slice(2);
	const count = args[0] ? parseInt(args[0], 10) : 10;
	const gridSize = (args[1] ? parseInt(args[1], 10) : 4) as GridSize;

	if (isNaN(count) || count <= 0) {
		console.error('错误: 运行次数必须是正整数');
		console.log('使用方法: npx tsx scripts/simulate-2048-ai.ts [运行次数] [网格大小]');
		console.log('例如: npx tsx scripts/simulate-2048-ai.ts 100 4');
		process.exit(1);
	}

	if (![4, 5, 6].includes(gridSize)) {
		console.error('错误: 网格大小必须是 4、5 或 6');
		process.exit(1);
	}

	runSimulations(count, gridSize);
}

main();
