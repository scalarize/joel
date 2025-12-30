/**
 * 拼图游戏 Puzzler
 * 路径：/mini-games/puzzler/
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import './Puzzler.css';

/**
 * 获取 R2 公开 URL（从环境变量或配置中获取）
 * 这里需要从 API 获取或使用配置
 */
function getR2PublicUrl(): string {
	// TODO: 从 API 获取或使用配置
	// 暂时使用环境变量或默认值
	const hostname = window.location.hostname;
	if (hostname === 'joel.scalarize.cn' || hostname.includes('.scalarize.cn')) {
		return 'https://assets.joel.scalarize.cn';
	}
	return 'https://assets.joel.scalarize.org';
}

/**
 * 难度级别
 */
type Difficulty = 'easy' | 'medium' | 'hard';

interface DifficultyConfig {
	rows: number;
	cols: number;
	label: string;
}

const DIFFICULTY_CONFIGS: Record<Difficulty, DifficultyConfig> = {
	easy: { rows: 5, cols: 6, label: '易' }, // 6x5 = 30 块
	medium: { rows: 6, cols: 8, label: '中' }, // 8x6 = 48 块
	hard: { rows: 9, cols: 10, label: '难' }, // 10x9 = 90 块
};

/**
 * 图块位置
 */
interface Position {
	row: number;
	col: number;
}

/**
 * 图块信息
 */
interface Piece {
	id: number; // 原始位置 ID（0-based）
	position: Position; // 当前在拼图区域的位置
	originalPosition: Position; // 原始正确位置
}

/**
 * 图片总数（硬编码）
 */
const TOTAL_IMAGES = 10;

export default function Puzzler() {
	const [difficulty, setDifficulty] = useState<Difficulty>('easy');
	const [currentImage, setCurrentImage] = useState<number>(1);
	const [pieces, setPieces] = useState<Piece[]>([]);
	const [gameStarted, setGameStarted] = useState(false);
	const [gameWon, setGameWon] = useState(false);
	const [draggingPiece, setDraggingPiece] = useState<number | null>(null);
	const [hoveredPiece, setHoveredPiece] = useState<number | null>(null);
	const puzzleAreaRef = useRef<HTMLDivElement>(null);

	/**
	 * 获取图片 URL
	 */
	const getImageUrl = useCallback((imageNum: number): string => {
		const r2Url = getR2PublicUrl();
		return `${r2Url}/mini-games/puzzler/images/${imageNum}.jpg`;
	}, []);

	/**
	 * 初始化新游戏
	 */
	const initNewGame = useCallback(() => {
		console.log('[Puzzler] 初始化新游戏');

		// 随机选择图片
		const randomImage = Math.floor(Math.random() * TOTAL_IMAGES) + 1;
		setCurrentImage(randomImage);

		const config = DIFFICULTY_CONFIGS[difficulty];
		const totalPieces = config.rows * config.cols;

		// 创建图块
		const newPieces: Piece[] = [];
		for (let i = 0; i < totalPieces; i++) {
			const row = Math.floor(i / config.cols);
			const col = i % config.cols;
			newPieces.push({
				id: i,
				position: { row, col },
				originalPosition: { row, col },
			});
		}

		// 随机打乱位置
		const shuffled = [...newPieces];
		for (let i = shuffled.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[shuffled[i].position, shuffled[j].position] = [shuffled[j].position, shuffled[i].position];
		}

		setPieces(shuffled);
		setGameStarted(false);
		setGameWon(false);
		setDraggingPiece(null);
	}, [difficulty]);

	/**
	 * 切换难度
	 */
	const switchDifficulty = useCallback(() => {
		if (gameStarted) {
			console.log('[Puzzler] 游戏已开始，无法切换难度');
			return;
		}

		const difficulties: Difficulty[] = ['easy', 'medium', 'hard'];
		const currentIndex = difficulties.indexOf(difficulty);
		const nextIndex = (currentIndex + 1) % difficulties.length;
		const nextDifficulty = difficulties[nextIndex];

		console.log(`[Puzzler] 切换难度: ${difficulty} -> ${nextDifficulty}`);
		setDifficulty(nextDifficulty);
		// 难度切换后重新初始化（保持当前图片）
		const config = DIFFICULTY_CONFIGS[nextDifficulty];
		const totalPieces = config.rows * config.cols;

		const newPieces: Piece[] = [];
		for (let i = 0; i < totalPieces; i++) {
			const row = Math.floor(i / config.cols);
			const col = i % config.cols;
			newPieces.push({
				id: i,
				position: { row, col },
				originalPosition: { row, col },
			});
		}

		// 随机打乱
		const shuffled = [...newPieces];
		for (let i = shuffled.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[shuffled[i].position, shuffled[j].position] = [shuffled[j].position, shuffled[i].position];
		}

		setPieces(shuffled);
	}, [difficulty, gameStarted]);

	/**
	 * 获取图块所属的 group（所有相邻且 grouped 的图块）
	 */
	const getGroupedPieces = useCallback(
		(pieceId: number): number[] => {
			const piece = pieces.find((p) => p.id === pieceId);
			if (!piece) return [pieceId];

			const group: number[] = [pieceId];
			const visited = new Set<number>([pieceId]);

			const addAdjacentGrouped = (p: Piece) => {
				// 检查四个方向的相邻图块
				const directions = [
					{ row: p.position.row - 1, col: p.position.col },
					{ row: p.position.row + 1, col: p.position.col },
					{ row: p.position.row, col: p.position.col - 1 },
					{ row: p.position.row, col: p.position.col + 1 },
				];

				for (const dir of directions) {
					const adjacentPiece = pieces.find((ap) => ap.position.row === dir.row && ap.position.col === dir.col);

					if (adjacentPiece && !visited.has(adjacentPiece.id)) {
						// 检查当前位置的相对关系
						const currentRowDiff = p.position.row - adjacentPiece.position.row;
						const currentColDiff = p.position.col - adjacentPiece.position.col;

						// 检查原始位置的相对关系
						const originalRowDiff = p.originalPosition.row - adjacentPiece.originalPosition.row;
						const originalColDiff = p.originalPosition.col - adjacentPiece.originalPosition.col;

						// 如果当前位置的相对关系与原始位置的相对关系一致，则标记为 grouped
						if (currentRowDiff === originalRowDiff && currentColDiff === originalColDiff) {
							visited.add(adjacentPiece.id);
							group.push(adjacentPiece.id);
							addAdjacentGrouped(adjacentPiece); // 递归查找
						}
					}
				}
			};

			addAdjacentGrouped(piece);
			return group;
		},
		[pieces]
	);

	/**
	 * 交换两个图块的位置
	 */
	const swapPieces = useCallback(
		(pieceId1: number, pieceId2: number) => {
			setPieces((prevPieces) => {
				const piece1 = prevPieces.find((p) => p.id === pieceId1);
				const piece2 = prevPieces.find((p) => p.id === pieceId2);

				if (!piece1 || !piece2 || piece1.id === piece2.id) {
					return prevPieces;
				}

				// 简单交换位置
				const updated = prevPieces.map((p) => {
					if (p.id === pieceId1) {
						return { ...p, position: piece2.position };
					}
					if (p.id === pieceId2) {
						return { ...p, position: piece1.position };
					}
					return p;
				});

				// 检查是否胜利（所有图块都在正确位置）
				const allCorrect = updated.every((p) => p.position.row === p.originalPosition.row && p.position.col === p.originalPosition.col);

				if (allCorrect) {
					setGameWon(true);
					console.log('[Puzzler] 游戏胜利！');
				}

				return updated;
			});

			if (!gameStarted) {
				setGameStarted(true);
			}
		},
		[gameStarted]
	);

	/**
	 * 处理拖拽开始
	 */
	const handleDragStart = useCallback((e: React.DragEvent, pieceId: number) => {
		e.dataTransfer.effectAllowed = 'move';
		setDraggingPiece(pieceId);
	}, []);

	/**
	 * 处理拖拽结束
	 */
	const handleDragEnd = useCallback(() => {
		setDraggingPiece(null);
	}, []);

	/**
	 * 处理放置
	 */
	const handleDrop = useCallback(
		(e: React.DragEvent, targetPieceId: number) => {
			e.preventDefault();

			if (draggingPiece === null || draggingPiece === targetPieceId) {
				return;
			}

			swapPieces(draggingPiece, targetPieceId);
			setDraggingPiece(null);
		},
		[draggingPiece, swapPieces]
	);

	/**
	 * 处理拖拽悬停
	 */
	const handleDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.dataTransfer.dropEffect = 'move';
	}, []);

	// 初始化游戏
	useEffect(() => {
		initNewGame();
	}, []);

	const config = DIFFICULTY_CONFIGS[difficulty];
	const imageUrl = getImageUrl(currentImage);

	return (
		<div className="puzzler">
			<div className="puzzler-header">
				<h2>拼图游戏 Puzzler</h2>
				<div className="puzzler-controls">
					<button onClick={initNewGame} className="puzzler-btn puzzler-btn-primary">
						新游戏
					</button>
					<button
						onClick={switchDifficulty}
						disabled={gameStarted}
						className="puzzler-btn puzzler-btn-secondary"
						title={gameStarted ? '游戏开始后无法切换难度' : '切换难度'}
					>
						难度: {config.label}
					</button>
				</div>
			</div>

			{gameWon && (
				<div
					className="puzzler-win-message"
					onClick={(e) => {
						// 点击弹窗外部区域关闭弹窗
						if (e.target === e.currentTarget) {
							setGameWon(false);
						}
					}}
				>
					<div className="puzzler-win-content" onClick={(e) => e.stopPropagation()}>
						<h3>🎉 恭喜完成拼图！</h3>
						<button onClick={initNewGame} className="puzzler-btn puzzler-btn-primary">
							再来一局
						</button>
					</div>
				</div>
			)}

			<div className="puzzler-container">
				<div className="puzzler-area" ref={puzzleAreaRef} data-difficulty={difficulty}>
					{pieces.map((piece) => {
						// 确保每个图块都有有效的位置
						if (
							piece.position.row < 0 ||
							piece.position.col < 0 ||
							piece.position.row >= config.rows ||
							piece.position.col >= config.cols
						) {
							console.warn(`[Puzzler] 图块 ${piece.id} 位置无效:`, piece.position);
							return null;
						}

						// 计算背景图片位置（基于原始位置）
						// 使用双层结构：外层负责网格定位，内层负责背景展示
						// 内层尺寸为 cols * 100% x rows * 100%，不受 gap 影响
						// backgroundPosition: 使用百分比定位
						// 第 col 列的起始位置是 (col / cols) * 100%
						// 第 row 行的起始位置是 (row / rows) * 100%
						const bgPosX = (piece.originalPosition.col / (config.cols - 1)) * 100;
						const bgPosY = (piece.originalPosition.row / (config.rows - 1)) * 100;

						const tileStyle: React.CSSProperties = {
							gridRow: piece.position.row + 1,
							gridColumn: piece.position.col + 1,
						};

						// 检查相邻图块是否与当前图块的相对位置符合原始相对关系
						const checkAdjacentGrouped = (direction: 'top' | 'right' | 'bottom' | 'left'): boolean => {
							let adjacentRow = piece.position.row;
							let adjacentCol = piece.position.col;

							if (direction === 'top') adjacentRow--;
							else if (direction === 'bottom') adjacentRow++;
							else if (direction === 'left') adjacentCol--;
							else if (direction === 'right') adjacentCol++;

							const adjacentPiece = pieces.find((p) => p.position.row === adjacentRow && p.position.col === adjacentCol);

							if (!adjacentPiece) return false;

							// 检查当前位置的相对关系
							const currentRowDiff = piece.position.row - adjacentPiece.position.row;
							const currentColDiff = piece.position.col - adjacentPiece.position.col;

							// 检查原始位置的相对关系
							const originalRowDiff = piece.originalPosition.row - adjacentPiece.originalPosition.row;
							const originalColDiff = piece.originalPosition.col - adjacentPiece.originalPosition.col;

							// 如果当前位置的相对关系与原始位置的相对关系一致，则标记为 grouped
							return currentRowDiff === originalRowDiff && currentColDiff === originalColDiff;
						};

						const isGroupedTop = checkAdjacentGrouped('top');
						const isGroupedRight = checkAdjacentGrouped('right');
						const isGroupedBottom = checkAdjacentGrouped('bottom');
						const isGroupedLeft = checkAdjacentGrouped('left');

						// 检查当前图块是否在 hovered group 中
						const isInHoveredGroup = hoveredPiece !== null && getGroupedPieces(hoveredPiece).includes(piece.id);

						// 检查相邻的 grouped piece 是否也在 hovered group 中
						// 如果是，则隐藏相邻的边
						const isAdjacentInHoveredGroup = (direction: 'top' | 'right' | 'bottom' | 'left'): boolean => {
							if (!isInHoveredGroup) return false;

							let adjacentRow = piece.position.row;
							let adjacentCol = piece.position.col;

							if (direction === 'top') adjacentRow--;
							else if (direction === 'bottom') adjacentRow++;
							else if (direction === 'left') adjacentCol--;
							else if (direction === 'right') adjacentCol++;

							const adjacentPiece = pieces.find((p) => p.position.row === adjacentRow && p.position.col === adjacentCol);

							if (!adjacentPiece) return false;

							// 检查相邻图块是否也在 hovered group 中
							return hoveredPiece !== null && getGroupedPieces(hoveredPiece).includes(adjacentPiece.id);
						};

						const isGroupedTopInHovered = isAdjacentInHoveredGroup('top');
						const isGroupedRightInHovered = isAdjacentInHoveredGroup('right');
						const isGroupedBottomInHovered = isAdjacentInHoveredGroup('bottom');
						const isGroupedLeftInHovered = isAdjacentInHoveredGroup('left');

						const innerStyle: React.CSSProperties = {
							width: '100%',
							height: '100%',
							backgroundImage: `url(${imageUrl})`,
							backgroundSize: `${config.cols * 100}% ${config.rows * 100}%`,
							backgroundPosition: `${bgPosX}% ${bgPosY}%`,
							backgroundRepeat: 'no-repeat',
						};

						// 通过负 margin 来移除 grouped 图块之间的 gap
						if (isGroupedTop) tileStyle.marginTop = '-2px';
						if (isGroupedRight) tileStyle.marginRight = '-2px';
						if (isGroupedBottom) tileStyle.marginBottom = '-2px';
						if (isGroupedLeft) tileStyle.marginLeft = '-2px';

						return (
							<div
								key={piece.id}
								className={`puzzler-piece ${draggingPiece === piece.id ? 'puzzler-piece-dragging' : ''} ${
									isInHoveredGroup ? 'puzzler-piece-hovered' : ''
								} ${isGroupedTopInHovered ? 'puzzler-piece-grouped-top' : ''} ${
									isGroupedRightInHovered ? 'puzzler-piece-grouped-right' : ''
								} ${isGroupedBottomInHovered ? 'puzzler-piece-grouped-bottom' : ''} ${
									isGroupedLeftInHovered ? 'puzzler-piece-grouped-left' : ''
								}`}
								style={tileStyle}
								draggable
								onDragStart={(e) => handleDragStart(e, piece.id)}
								onDragEnd={handleDragEnd}
								onDrop={(e) => handleDrop(e, piece.id)}
								onDragOver={handleDragOver}
								onMouseEnter={() => setHoveredPiece(piece.id)}
								onMouseLeave={() => setHoveredPiece(null)}
							>
								<div className="puzzler-piece-inner" style={innerStyle} />
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
}
