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
	const [dragStartCell, setDragStartCell] = useState<Position | null>(null);
	// 触摸事件相关状态
	const [touchDraggingPiece, setTouchDraggingPiece] = useState<number | null>(null);
	const [touchStartCell, setTouchStartCell] = useState<Position | null>(null);
	const [touchStartPosition, setTouchStartPosition] = useState<{ x: number; y: number } | null>(null);
	const [touchCurrentCell, setTouchCurrentCell] = useState<Position | null>(null); // 当前触摸位置对应的 cell，用于显示拖动预览
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
		// 清理触摸相关状态
		setTouchDraggingPiece(null);
		setTouchStartCell(null);
		setTouchStartPosition(null);
		setTouchCurrentCell(null);
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
	 * 获取所有 groups 及其 bounding boxes
	 */
	const getAllGroups = useCallback((): Map<
		string,
		{ pieces: number[]; boundingBox: { minRow: number; maxRow: number; minCol: number; maxCol: number } }
	> => {
		const groupsMap = new Map<
			string,
			{ pieces: number[]; boundingBox: { minRow: number; maxRow: number; minCol: number; maxCol: number } }
		>();
		const processedPieces = new Set<number>();

		pieces.forEach((piece) => {
			if (processedPieces.has(piece.id)) return;

			const group = getGroupedPieces(piece.id);

			// 如果只有一个 piece，不是 group，跳过
			if (group.length === 1) return;

			// 标记所有 pieces 为已处理
			group.forEach((id) => processedPieces.add(id));

			// 计算 bounding box
			const groupPieces = pieces.filter((p) => group.includes(p.id));
			const minRow = Math.min(...groupPieces.map((p) => p.position.row));
			const maxRow = Math.max(...groupPieces.map((p) => p.position.row));
			const minCol = Math.min(...groupPieces.map((p) => p.position.col));
			const maxCol = Math.max(...groupPieces.map((p) => p.position.col));

			// 使用最小的 piece id 作为 group id
			const groupId = `group-${Math.min(...group)}`;

			groupsMap.set(groupId, {
				pieces: group,
				boundingBox: { minRow, maxRow, minCol, maxCol },
			});
		});

		return groupsMap;
	}, [pieces, getGroupedPieces]);

	/**
	 * 检查 piece 是否属于某个 group
	 */
	const getPieceGroupId = useCallback(
		(pieceId: number): string | null => {
			const allGroups = getAllGroups();
			for (const [groupId, group] of allGroups.entries()) {
				if (group.pieces.includes(pieceId)) {
					return groupId;
				}
			}
			return null;
		},
		[getAllGroups]
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
	 * 处理 bounding box 拖拽开始
	 */
	const handleBoundingBoxDragStart = useCallback(
		(e: React.DragEvent, groupId: string) => {
			if (!puzzleAreaRef.current) {
				e.preventDefault();
				return;
			}

			const allGroups = getAllGroups();
			const group = allGroups.get(groupId);
			if (!group) {
				e.preventDefault();
				return;
			}

			const rect = puzzleAreaRef.current.getBoundingClientRect();
			const config = DIFFICULTY_CONFIGS[difficulty];
			const cellWidth = rect.width / config.cols;
			const cellHeight = rect.height / config.rows;

			// 计算拖拽开始时的 cell 位置（鼠标位置）
			const mouseX = e.clientX - rect.left;
			const mouseY = e.clientY - rect.top;
			const startCol = Math.floor(mouseX / cellWidth);
			const startRow = Math.floor(mouseY / cellHeight);

			// 检查点击位置是否真的属于 group 内的某个 piece
			const clickPosition = `${startRow},${startCol}`;
			const groupPiecesPositions = new Set<string>();
			group.pieces.forEach((pieceId) => {
				const piece = pieces.find((p) => p.id === pieceId);
				if (piece) {
					groupPiecesPositions.add(`${piece.position.row},${piece.position.col}`);
				}
			});

			// 如果点击位置不属于 group 内的任何 piece，阻止拖拽
			if (!groupPiecesPositions.has(clickPosition)) {
				console.log('[Puzzler] handleBoundingBoxDragStart: 点击位置不在 group 的实际 pieces 上，阻止拖拽');
				e.preventDefault();
				return;
			}

			e.dataTransfer.effectAllowed = 'move';

			// 创建自定义拖拽图像：显示整个 group
			// 找到 bounding box 对应的 DOM 元素（e.currentTarget 是触发事件的 piece，其父元素是 bounding box）
			const boundingBoxElement = (e.currentTarget as HTMLElement).parentElement;
			if (boundingBoxElement && boundingBoxElement.classList.contains('puzzler-bounding-box')) {
				// 创建一个临时元素来克隆整个 bounding box 的内容
				const dragImage = boundingBoxElement.cloneNode(true) as HTMLElement;
				dragImage.style.position = 'absolute';
				dragImage.style.top = '-9999px';
				dragImage.style.left = '-9999px';
				dragImage.style.opacity = '0.8';
				dragImage.style.pointerEvents = 'none';
				dragImage.style.width = `${boundingBoxElement.getBoundingClientRect().width}px`;
				dragImage.style.height = `${boundingBoxElement.getBoundingClientRect().height}px`;
				document.body.appendChild(dragImage);

				// 计算鼠标相对于 bounding box 的偏移
				const boundingBoxRect = boundingBoxElement.getBoundingClientRect();
				const offsetX = e.clientX - boundingBoxRect.left;
				const offsetY = e.clientY - boundingBoxRect.top;

				// 设置拖拽图像
				e.dataTransfer.setDragImage(dragImage, offsetX, offsetY);

				// 在拖拽结束后清理临时元素
				setTimeout(() => {
					if (document.body.contains(dragImage)) {
						document.body.removeChild(dragImage);
					}
				}, 0);
			}

			console.log('[Puzzler] Drag Start:', {
				groupId,
				mouseCell: { row: startRow, col: startCol },
				boundingBox: group.boundingBox,
				groupPieces: group.pieces.map((id) => {
					const p = pieces.find((pp) => pp.id === id);
					return p ? { id, pos: p.position } : null;
				}),
			});

			setDragStartCell({ row: startRow, col: startCol });

			if (group.pieces.length > 0) {
				// 使用第一个 piece 作为 draggingPiece（用于视觉反馈）
				setDraggingPiece(group.pieces[0]);
			}

			if (!gameStarted) {
				setGameStarted(true);
			}
		},
		[getAllGroups, pieces, difficulty, gameStarted]
	);

	/**
	 * 处理单个 piece 拖拽开始（仅用于非 grouped pieces）
	 */
	const handleDragStart = useCallback(
		(e: React.DragEvent, pieceId: number) => {
			// 如果这个 piece 属于某个 group，不允许拖拽
			console.log('[Puzzler] handleDragStart', pieceId);
			const groupId = getPieceGroupId(pieceId);
			if (groupId) {
				console.log('[Puzzler] handleDragStart rejected coz in group', groupId);
				e.preventDefault();
				return;
			}

			e.dataTransfer.effectAllowed = 'move';
			setDraggingPiece(pieceId);
			console.log('[Puzzler] handleDragStart: draggingPiece set to', pieceId);

			if (!gameStarted) {
				console.log('[Puzzler] handleDragStart: gameStarted set to true');
				setGameStarted(true);
			}
		},
		[getPieceGroupId, gameStarted]
	);

	/**
	 * 处理 bounding box drop
	 */
	const handleBoundingBoxDrop = useCallback(
		(e: React.DragEvent, groupId: string) => {
			e.preventDefault();
			console.log('[Puzzler] handleBoundingBoxDrop', groupId, dragStartCell);

			if (!puzzleAreaRef.current || !dragStartCell) {
				console.log('[Puzzler] handleBoundingBoxDrop', 'puzzleAreaRef.current or dragStartCell not found');
				setDraggingPiece(null);
				setDragStartCell(null);
				return;
			}

			const allGroups = getAllGroups();
			const group = allGroups.get(groupId);
			if (!group) {
				console.log('[Puzzler] handleBoundingBoxDrop', 'group not found');
				setDraggingPiece(null);
				setDragStartCell(null);
				return;
			}

			const rect = puzzleAreaRef.current.getBoundingClientRect();
			const config = DIFFICULTY_CONFIGS[difficulty];
			const cellWidth = rect.width / config.cols;
			const cellHeight = rect.height / config.rows;

			// 计算 drop 时的 cell 位置（鼠标位置）
			const mouseX = e.clientX - rect.left;
			const mouseY = e.clientY - rect.top;
			const dropCol = Math.floor(mouseX / cellWidth);
			const dropRow = Math.floor(mouseY / cellHeight);

			// 检查边界
			if (dropRow < 0 || dropRow >= config.rows || dropCol < 0 || dropCol >= config.cols) {
				console.log('[Puzzler] Drop 超出边界，拒绝');
				setDraggingPiece(null);
				setDragStartCell(null);
				return;
			}

			// 计算偏移量：drop 位置相对于鼠标点击位置的偏移
			const rowOffset = dropRow - dragStartCell.row;
			const colOffset = dropCol - dragStartCell.col;
			if (rowOffset === 0 && colOffset === 0) {
				console.log('[Puzzler] Drop: no actual moving, ignore');
				setDraggingPiece(null);
				setDragStartCell(null);
				return;
			}

			console.log('[Puzzler] Drop:', {
				groupId,
				dropCell: { row: dropRow, col: dropCol },
				startCell: dragStartCell,
				offset: { row: rowOffset, col: colOffset },
			});

			// 计算 group pieces 移动前的位置集合
			const groupPiecesBefore = new Set<string>();
			group.pieces.forEach((pieceId) => {
				const piece = pieces.find((p) => p.id === pieceId);
				if (piece) {
					groupPiecesBefore.add(`${piece.position.row},${piece.position.col}`);
				}
			});

			console.log('[Puzzler] Group pieces before:', Array.from(groupPiecesBefore));

			// 计算 group pieces 移动后的位置集合
			const groupPiecesAfter = new Set<string>();
			group.pieces.forEach((pieceId) => {
				const piece = pieces.find((p) => p.id === pieceId);
				if (piece) {
					const newRow = piece.position.row + rowOffset;
					const newCol = piece.position.col + colOffset;

					// 检查边界
					if (newRow < 0 || newRow >= config.rows || newCol < 0 || newCol >= config.cols) {
						console.log('[Puzzler] Group 移动后超出边界，拒绝');
						setDraggingPiece(null);
						setDragStartCell(null);
						return;
					}

					groupPiecesAfter.add(`${newRow},${newCol}`);
					console.log(`[Puzzler] Piece ${pieceId}: ${piece.position.row},${piece.position.col} -> ${newRow},${newCol}`);
				}
			});

			console.log('[Puzzler] Group pieces after:', Array.from(groupPiecesAfter));

			// 计算空出来的位置（移动前的位置 - 移动后的位置）
			const emptyPositions: Position[] = [];
			groupPiecesBefore.forEach((posStr) => {
				if (!groupPiecesAfter.has(posStr)) {
					const [row, col] = posStr.split(',').map(Number);
					emptyPositions.push({ row, col });
				}
			});

			console.log('[Puzzler] Empty positions:', emptyPositions);

			// 计算被挤占的 pieces（移动后的位置上的非 group pieces）
			const displacedPieces: Piece[] = [];
			groupPiecesAfter.forEach((posStr) => {
				if (!groupPiecesBefore.has(posStr)) {
					const [row, col] = posStr.split(',').map(Number);
					const piece = pieces.find((p) => p.position.row === row && p.position.col === col && !group.pieces.includes(p.id));
					if (piece) {
						displacedPieces.push(piece);
						console.log(`[Puzzler] Displaced piece ${piece.id} at ${row},${col}`);
					}
				}
			});

			console.log(
				'[Puzzler] Displaced pieces:',
				displacedPieces.map((p) => ({ id: p.id, pos: p.position }))
			);

			// 验证合法性：被挤占的 pieces 数量必须等于空出来的位置数量
			if (displacedPieces.length !== emptyPositions.length) {
				console.log('[Puzzler] 被挤占的 pieces 数量与空位置数量不匹配，拒绝 drop');
				setDraggingPiece(null);
				setDragStartCell(null);
				return;
			}

			// 排序：从左到右、从上到下
			displacedPieces.sort((a, b) => {
				if (a.position.row !== b.position.row) {
					return a.position.row - b.position.row;
				}
				return a.position.col - b.position.col;
			});

			emptyPositions.sort((a, b) => {
				if (a.row !== b.row) {
					return a.row - b.row;
				}
				return a.col - b.col;
			});

			// 执行移动
			setPieces((prevPieces) => {
				console.log(
					'[Puzzler] 开始执行移动，当前所有 pieces:',
					prevPieces.map((p) => ({ id: p.id, pos: p.position }))
				);
				console.log('[Puzzler] Group pieces IDs:', group.pieces);

				const updated = prevPieces.map((p) => {
					// 1. 移动 group 内的 pieces
					if (group.pieces.includes(p.id)) {
						const newRow = p.position.row + rowOffset;
						const newCol = p.position.col + colOffset;
						console.log(`[Puzzler] Moving group piece ${p.id}: ${p.position.row},${p.position.col} -> ${newRow},${newCol}`);
						return { ...p, position: { row: newRow, col: newCol } };
					}

					// 2. 移动被挤占的 pieces 到空位置
					const displacedIndex = displacedPieces.findIndex((dp) => dp.id === p.id);
					if (displacedIndex !== -1) {
						const targetPos = emptyPositions[displacedIndex];
						console.log(
							`[Puzzler] Moving displaced piece ${p.id}: ${p.position.row},${p.position.col} -> ${targetPos.row},${targetPos.col}`
						);
						return { ...p, position: { row: targetPos.row, col: targetPos.col } };
					}

					return p;
				});

				console.log(
					'[Puzzler] 移动完成，更新后的所有 pieces:',
					updated.map((p) => ({ id: p.id, pos: p.position }))
				);

				// 检查是否胜利
				const allCorrect = updated.every((p) => p.position.row === p.originalPosition.row && p.position.col === p.originalPosition.col);

				if (allCorrect) {
					setGameWon(true);
					console.log('[Puzzler] 游戏胜利！');
				}

				return updated;
			});

			setDraggingPiece(null);
			setDragStartCell(null);
		},
		[getAllGroups, pieces, dragStartCell, difficulty]
	);

	/**
	 * 处理 bounding box 拖拽结束（取消拖拽时清理状态）
	 */
	const handleBoundingBoxDragEnd = useCallback(() => {
		setDraggingPiece(null);
		setDragStartCell(null);
	}, []);

	/**
	 * 处理拖拽结束
	 */
	const handleDragEnd = useCallback(() => {
		console.log('[Puzzler] handleDragEnd: draggingPiece set to null');
		setDraggingPiece(null);
	}, []);

	/**
	 * 处理放置
	 */
	const handleDrop = useCallback(
		(e: React.DragEvent, targetPieceId: number) => {
			e.preventDefault();
			console.log('[Puzzler] handleDrop', targetPieceId);

			// 如果正在拖拽一个 group，应该由 handleBoundingBoxDrop 处理
			// 检查 dragStartCell 是否存在，如果存在说明正在拖拽 group
			if (dragStartCell !== null) {
				console.log('[Puzzler] handleDrop: 检测到正在拖拽 group，忽略单个 piece 的 drop');
				return;
			}

			if (draggingPiece === null || draggingPiece === targetPieceId) {
				console.log('[Puzzler] handleDrop: draggingPiece is null or draggingPiece === targetPieceId，忽略', draggingPiece, targetPieceId);
				return;
			}

			swapPieces(draggingPiece, targetPieceId);
			setDraggingPiece(null);
		},
		[draggingPiece, dragStartCell, swapPieces]
	);

	/**
	 * 处理拖拽悬停
	 */
	const handleDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.dataTransfer.dropEffect = 'move';
	}, []);

	/**
	 * 根据触摸位置获取对应的 cell 位置
	 */
	const getCellFromTouch = useCallback(
		(touch: { clientX: number; clientY: number }): Position | null => {
			if (!puzzleAreaRef.current) return null;

			const rect = puzzleAreaRef.current.getBoundingClientRect();
			const config = DIFFICULTY_CONFIGS[difficulty];
			const cellWidth = rect.width / config.cols;
			const cellHeight = rect.height / config.rows;

			const x = touch.clientX - rect.left;
			const y = touch.clientY - rect.top;

			const col = Math.floor(x / cellWidth);
			const row = Math.floor(y / cellHeight);

			// 检查边界
			if (row < 0 || row >= config.rows || col < 0 || col >= config.cols) {
				return null;
			}

			return { row, col };
		},
		[difficulty]
	);

	/**
	 * 根据 cell 位置获取对应的 piece
	 */
	const getPieceAtCell = useCallback(
		(cell: Position): Piece | null => {
			return pieces.find((p) => p.position.row === cell.row && p.position.col === cell.col) || null;
		},
		[pieces]
	);

	/**
	 * 处理触摸开始
	 */
	const handleTouchStart = useCallback(
		(e: React.TouchEvent) => {
			console.log('[Puzzler] 触摸开始');
			const touch = e.touches[0];
			if (!touch) return;

			const cell = getCellFromTouch(touch);
			if (!cell) {
				console.log('[Puzzler] 触摸位置无效');
				return;
			}

			const piece = getPieceAtCell(cell);
			if (!piece) {
				console.log('[Puzzler] 触摸位置没有拼图块');
				return;
			}

			// 检查是否属于某个 group
			const groupId = getPieceGroupId(piece.id);
			if (groupId) {
				// 处理 group 的触摸拖动
				const allGroups = getAllGroups();
				const group = allGroups.get(groupId);
				if (!group) return;

				// 检查触摸位置是否真的属于 group 内的某个 piece
				const touchPosition = `${cell.row},${cell.col}`;
				const groupPiecesPositions = new Set<string>();
				group.pieces.forEach((pieceId) => {
					const p = pieces.find((pp) => pp.id === pieceId);
					if (p) {
						groupPiecesPositions.add(`${p.position.row},${p.position.col}`);
					}
				});

				if (!groupPiecesPositions.has(touchPosition)) {
					console.log('[Puzzler] 触摸位置不在 group 的实际 pieces 上，忽略');
					return;
				}

				setTouchStartCell(cell);
				setTouchStartPosition({ x: touch.clientX, y: touch.clientY });
				if (group.pieces.length > 0) {
					setTouchDraggingPiece(group.pieces[0]);
				}

				if (!gameStarted) {
					setGameStarted(true);
				}

				console.log('[Puzzler] 触摸开始 - Group:', groupId, 'Cell:', cell);
			} else {
				// 处理单个 piece 的触摸拖动
				setTouchStartCell(cell);
				setTouchStartPosition({ x: touch.clientX, y: touch.clientY });
				setTouchDraggingPiece(piece.id);

				if (!gameStarted) {
					setGameStarted(true);
				}

				console.log('[Puzzler] 触摸开始 - Piece:', piece.id, 'Cell:', cell);
			}
		},
		[getCellFromTouch, getPieceAtCell, getPieceGroupId, getAllGroups, pieces, gameStarted]
	);

	/**
	 * 处理触摸移动
	 */
	const handleTouchMove = useCallback(
		(e: React.TouchEvent) => {
			if (touchDraggingPiece === null || touchStartPosition === null) {
				// 如果状态不一致，清理所有触摸状态
				setTouchDraggingPiece(null);
				setTouchStartCell(null);
				setTouchStartPosition(null);
				setTouchCurrentCell(null);
				return;
			}

			const touch = e.touches[0];
			if (!touch) return;

			// 防止页面滚动
			e.preventDefault();

			// 计算当前触摸位置对应的 cell，用于显示拖动预览
			const currentCell = getCellFromTouch(touch);
			setTouchCurrentCell(currentCell);

			console.log('[Puzzler] 触摸移动，当前位置:', currentCell);
		},
		[touchDraggingPiece, touchStartPosition, getCellFromTouch]
	);

	/**
	 * 处理触摸结束
	 */
	const handleTouchEnd = useCallback(
		(e: React.TouchEvent) => {
			console.log('[Puzzler] 触摸结束');

			// 使用 clearTouchState 确保状态被清理
			const cleanup = () => {
				setTouchDraggingPiece(null);
				setTouchStartCell(null);
				setTouchStartPosition(null);
				setTouchCurrentCell(null);
			};

			if (touchDraggingPiece === null || touchStartCell === null || touchStartPosition === null) {
				// 清理状态
				cleanup();
				return;
			}

			const touch = e.changedTouches[0];
			if (!touch) {
				// 清理状态
				cleanup();
				return;
			}

			const endCell = getCellFromTouch(touch);
			if (!endCell) {
				console.log('[Puzzler] 触摸结束位置无效');
				// 清理状态
				cleanup();
				return;
			}

			// 检查是否属于某个 group
			const piece = getPieceAtCell(touchStartCell);
			if (!piece) {
				// 清理状态
				cleanup();
				return;
			}

			const groupId = getPieceGroupId(piece.id);
			if (groupId) {
				// 处理 group 的触摸拖动结束
				const allGroups = getAllGroups();
				const group = allGroups.get(groupId);
				if (!group) {
					// 清理状态
					cleanup();
					return;
				}

				// 计算偏移量
				const rowOffset = endCell.row - touchStartCell.row;
				const colOffset = endCell.col - touchStartCell.col;

				if (rowOffset === 0 && colOffset === 0) {
					console.log('[Puzzler] 触摸拖动：没有实际移动，忽略');
					// 清理状态
					cleanup();
					return;
				}

				// 使用与 handleBoundingBoxDrop 相同的逻辑处理 group 移动
				const config = DIFFICULTY_CONFIGS[difficulty];

				// 计算 group pieces 移动前的位置集合
				const groupPiecesBefore = new Set<string>();
				group.pieces.forEach((pieceId) => {
					const p = pieces.find((pp) => pp.id === pieceId);
					if (p) {
						groupPiecesBefore.add(`${p.position.row},${p.position.col}`);
					}
				});

				// 计算 group pieces 移动后的位置集合
				const groupPiecesAfter = new Set<string>();
				group.pieces.forEach((pieceId) => {
					const p = pieces.find((pp) => pp.id === pieceId);
					if (p) {
						const newRow = p.position.row + rowOffset;
						const newCol = p.position.col + colOffset;

						// 检查边界
						if (newRow < 0 || newRow >= config.rows || newCol < 0 || newCol >= config.cols) {
							console.log('[Puzzler] Group 移动后超出边界，拒绝');
							// 清理状态
							cleanup();
							return;
						}

						groupPiecesAfter.add(`${newRow},${newCol}`);
					}
				});

				// 计算空出来的位置
				const emptyPositions: Position[] = [];
				groupPiecesBefore.forEach((posStr) => {
					if (!groupPiecesAfter.has(posStr)) {
						const [row, col] = posStr.split(',').map(Number);
						emptyPositions.push({ row, col });
					}
				});

				// 计算被挤占的 pieces
				const displacedPieces: Piece[] = [];
				groupPiecesAfter.forEach((posStr) => {
					if (!groupPiecesBefore.has(posStr)) {
						const [row, col] = posStr.split(',').map(Number);
						const p = pieces.find((pp) => pp.position.row === row && pp.position.col === col && !group.pieces.includes(pp.id));
						if (p) {
							displacedPieces.push(p);
						}
					}
				});

				// 验证合法性
				if (displacedPieces.length !== emptyPositions.length) {
					console.log('[Puzzler] 被挤占的 pieces 数量与空位置数量不匹配，拒绝');
					// 清理状态
					cleanup();
					return;
				}

				// 排序
				displacedPieces.sort((a, b) => {
					if (a.position.row !== b.position.row) {
						return a.position.row - b.position.row;
					}
					return a.position.col - b.position.col;
				});

				emptyPositions.sort((a, b) => {
					if (a.row !== b.row) {
						return a.row - b.row;
					}
					return a.col - b.col;
				});

				// 执行移动
				setPieces((prevPieces) => {
					const updated = prevPieces.map((p) => {
						// 1. 移动 group 内的 pieces
						if (group.pieces.includes(p.id)) {
							const newRow = p.position.row + rowOffset;
							const newCol = p.position.col + colOffset;
							return { ...p, position: { row: newRow, col: newCol } };
						}

						// 2. 移动被挤占的 pieces 到空位置
						const displacedIndex = displacedPieces.findIndex((dp) => dp.id === p.id);
						if (displacedIndex !== -1) {
							const targetPos = emptyPositions[displacedIndex];
							return { ...p, position: { row: targetPos.row, col: targetPos.col } };
						}

						return p;
					});

					// 检查是否胜利
					const allCorrect = updated.every((p) => p.position.row === p.originalPosition.row && p.position.col === p.originalPosition.col);

					if (allCorrect) {
						setGameWon(true);
						console.log('[Puzzler] 游戏胜利！');
					}

					return updated;
				});

				console.log('[Puzzler] 触摸拖动完成 - Group:', groupId);
			} else {
				// 处理单个 piece 的触摸拖动结束
				const endPiece = getPieceAtCell(endCell);
				if (!endPiece || endPiece.id === touchDraggingPiece) {
					console.log('[Puzzler] 触摸拖动：目标位置无效或相同，忽略');
					// 清理状态
					cleanup();
					return;
				}

				// 交换两个拼图块
				swapPieces(touchDraggingPiece, endPiece.id);
				console.log('[Puzzler] 触摸拖动完成 - 交换:', touchDraggingPiece, '和', endPiece.id);
			}

			// 清理状态
			cleanup();
		},
		[
			touchDraggingPiece,
			touchStartCell,
			touchStartPosition,
			getCellFromTouch,
			getPieceAtCell,
			getPieceGroupId,
			getAllGroups,
			pieces,
			difficulty,
			swapPieces,
		]
	);

	/**
	 * 清理所有触摸状态
	 */
	const clearTouchState = useCallback(() => {
		console.log('[Puzzler] 清理触摸状态');
		setTouchDraggingPiece(null);
		setTouchStartCell(null);
		setTouchStartPosition(null);
		setTouchCurrentCell(null);
	}, []);

	/**
	 * 处理触摸取消
	 */
	const handleTouchCancel = useCallback(() => {
		console.log('[Puzzler] 触摸取消');
		clearTouchState();
	}, [clearTouchState]);

	// 初始化游戏
	useEffect(() => {
		initNewGame();
	}, []);

	// 添加全局触摸取消处理，防止状态卡住
	useEffect(() => {
		const handleGlobalTouchEnd = () => {
			// 如果触摸结束但还有触摸状态，清理它
			if (touchDraggingPiece !== null) {
				console.log('[Puzzler] 检测到全局触摸结束，清理触摸状态');
				clearTouchState();
			}
		};

		const handleGlobalTouchCancel = () => {
			// 如果触摸取消但还有触摸状态，清理它
			if (touchDraggingPiece !== null) {
				console.log('[Puzzler] 检测到全局触摸取消，清理触摸状态');
				clearTouchState();
			}
		};

		// 监听全局触摸事件
		document.addEventListener('touchend', handleGlobalTouchEnd, { passive: true });
		document.addEventListener('touchcancel', handleGlobalTouchCancel, { passive: true });

		return () => {
			document.removeEventListener('touchend', handleGlobalTouchEnd);
			document.removeEventListener('touchcancel', handleGlobalTouchCancel);
		};
	}, [touchDraggingPiece, clearTouchState]);

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
				<div
					className="puzzler-area"
					ref={puzzleAreaRef}
					data-difficulty={difficulty}
					onDragOver={(e) => {
						e.preventDefault();
						e.dataTransfer.dropEffect = 'move';
					}}
					onDrop={(e) => {
						e.preventDefault();
						// 如果正在拖拽 group（dragStartCell 不为 null），尝试找到对应的 group 并处理 drop
						if (dragStartCell !== null) {
							const rect = puzzleAreaRef.current?.getBoundingClientRect();
							if (!rect) return;

							// 找到被拖拽的 group（通过 dragStartCell 找到对应的 piece，再找到该 piece 所属的 group）
							const allGroups = getAllGroups();
							const draggedGroup = Array.from(allGroups.entries()).find(([_, group]) => {
								return group.pieces.some((pieceId) => {
									const piece = pieces.find((p) => p.id === pieceId);
									return piece && piece.position.row === dragStartCell.row && piece.position.col === dragStartCell.col;
								});
							});

							if (draggedGroup && draggedGroup[1].pieces.length > 1) {
								e.stopPropagation();
								handleBoundingBoxDrop(e, draggedGroup[0]);
								return;
							}
						}
					}}
					onTouchStart={handleTouchStart}
					onTouchMove={handleTouchMove}
					onTouchEnd={handleTouchEnd}
					onTouchCancel={handleTouchCancel}
				>
					{/* 渲染 bounding boxes（包含 grouped pieces） */}
					{Array.from(getAllGroups().entries()).map(
						([groupId, group]: [
							string,
							{ pieces: number[]; boundingBox: { minRow: number; maxRow: number; minCol: number; maxCol: number } }
						]) => {
							const boundingBoxRows = group.boundingBox.maxRow - group.boundingBox.minRow + 1;
							const boundingBoxCols = group.boundingBox.maxCol - group.boundingBox.minCol + 1;

							return (
								<div
									key={groupId}
									className="puzzler-bounding-box"
									data-group-id={groupId}
									style={{
										gridRow: `${group.boundingBox.minRow + 1} / span ${boundingBoxRows}`,
										gridColumn: `${group.boundingBox.minCol + 1} / span ${boundingBoxCols}`,
										pointerEvents: 'none', // 默认让事件穿透，只在内部 group pieces 位置接收事件
									}}
									onMouseLeave={(e) => {
										// 当鼠标离开整个 bounding box 时，检查是否真的离开了 group
										const relatedTarget = e.relatedTarget as HTMLElement;
										if (!relatedTarget || !relatedTarget.closest(`[data-group-id="${groupId}"]`)) {
											// 使用 setTimeout 延迟清除，避免快速移动时闪烁
											setTimeout(() => {
												// 再次检查鼠标是否真的离开了 group
												const activeElement = document.elementFromPoint(e.clientX, e.clientY);
												if (activeElement) {
													const stillInGroup = activeElement.closest(`[data-group-id="${groupId}"]`);
													if (!stillInGroup) {
														setHoveredPiece(null);
													}
												} else {
													setHoveredPiece(null);
												}
											}, 10);
										}
									}}
								>
									{/* 在 bounding box 内渲染所有 grouped pieces */}
									{group.pieces.map((pieceId) => {
										const piece = pieces.find((p) => p.id === pieceId);
										if (!piece) return null;

										// 计算 piece 在 bounding box 内的相对位置
										const relativeRow = piece.position.row - group.boundingBox.minRow;
										const relativeCol = piece.position.col - group.boundingBox.minCol;

										// 计算背景图片位置
										const bgPosX = (piece.originalPosition.col / (config.cols - 1)) * 100;
										const bgPosY = (piece.originalPosition.row / (config.rows - 1)) * 100;

										const innerStyle: React.CSSProperties = {
											width: '100%',
											height: '100%',
											backgroundImage: `url(${imageUrl})`,
											backgroundSize: `${config.cols * 100}% ${config.rows * 100}%`,
											backgroundPosition: `${bgPosX}% ${bgPosY}%`,
											backgroundRepeat: 'no-repeat',
										};

										// 计算 piece 在 bounding box 内的百分比位置
										const cellWidthPercent = 100 / boundingBoxCols;
										const cellHeightPercent = 100 / boundingBoxRows;

										// 检查相邻的 grouped piece 是否也在同一个 group 中
										// 用于判断哪些边界应该隐藏（内部边界）
										const checkAdjacentInGroup = (direction: 'top' | 'right' | 'bottom' | 'left'): boolean => {
											let adjacentRow = piece.position.row;
											let adjacentCol = piece.position.col;

											if (direction === 'top') adjacentRow--;
											else if (direction === 'bottom') adjacentRow++;
											else if (direction === 'left') adjacentCol--;
											else if (direction === 'right') adjacentCol++;

											const adjacentPiece = pieces.find((p) => p.position.row === adjacentRow && p.position.col === adjacentCol);
											return adjacentPiece !== undefined && group.pieces.includes(adjacentPiece.id);
										};

										const isGroupedTop = checkAdjacentInGroup('top');
										const isGroupedRight = checkAdjacentInGroup('right');
										const isGroupedBottom = checkAdjacentInGroup('bottom');
										const isGroupedLeft = checkAdjacentInGroup('left');

										// 检查当前 piece 是否在 hovered group 中
										const isInHoveredGroup = hoveredPiece !== null && group.pieces.includes(hoveredPiece);

										// 检查当前 piece 是否在 dragging group 中
										const isInDraggingGroup = dragStartCell !== null && draggingPiece !== null && group.pieces.includes(draggingPiece);

										// 检查当前 piece 是否在触摸拖动的 group 中
										const isInTouchDraggingGroup =
											touchStartCell !== null && touchDraggingPiece !== null && group.pieces.includes(touchDraggingPiece);

										// 检查当前 piece 是否正在被触摸拖动
										const isTouchDragging = touchDraggingPiece === pieceId || isInTouchDraggingGroup;

										// 检查当前 cell 是否是触摸拖动预览位置（对于 bounding box 内的 piece，需要检查整个 group）
										const isTouchPreviewCell =
											touchCurrentCell !== null &&
											touchDraggingPiece !== null &&
											piece.position.row === touchCurrentCell.row &&
											piece.position.col === touchCurrentCell.col &&
											!group.pieces.includes(touchDraggingPiece) &&
											!isInTouchDraggingGroup;

										return (
											<div
												key={pieceId}
												className={`puzzler-piece puzzler-piece-in-bounding-box ${isInHoveredGroup ? 'puzzler-piece-hovered' : ''} ${
													isInDraggingGroup || isTouchDragging ? 'puzzler-piece-dragging' : ''
												} ${isTouchPreviewCell ? 'puzzler-piece-touch-preview' : ''} ${isGroupedTop ? 'puzzler-piece-grouped-top' : ''} ${
													isGroupedRight ? 'puzzler-piece-grouped-right' : ''
												} ${isGroupedBottom ? 'puzzler-piece-grouped-bottom' : ''} ${isGroupedLeft ? 'puzzler-piece-grouped-left' : ''}`}
												style={{
													position: 'absolute',
													left: `${relativeCol * cellWidthPercent}%`,
													top: `${relativeRow * cellHeightPercent}%`,
													width: `${cellWidthPercent}%`,
													height: `${cellHeightPercent}%`,
													pointerEvents: 'auto', // 在 group pieces 位置接收鼠标事件
													zIndex: 1, // 确保在 bounding box 之上
												}}
												draggable
												onDragStart={(e) => handleBoundingBoxDragStart(e, groupId)}
												onDragEnd={handleBoundingBoxDragEnd}
												onDrop={(e) => {
													e.preventDefault();

													// 检查是否正在拖拽单个 piece（不是 group）
													// 如果 dragStartCell === null 且 draggingPiece !== null，说明是单个 piece 的拖拽
													if (dragStartCell === null && draggingPiece !== null) {
														// 单个 piece 的拖拽，找到 drop 位置的 piece 并交换
														const dropPiece = pieces.find((p) => p.id === pieceId);
														if (dropPiece && draggingPiece !== dropPiece.id) {
															console.log('[Puzzler] 单个 piece drop 到 group 内的 piece，执行交换');
															// 让事件冒泡，或者直接调用 handleDrop
															// 但这里我们需要找到 dropPiece 的 id
															handleDrop(e, dropPiece.id);
														}
														// 不阻止冒泡，让单个 piece 的 drop 逻辑处理
														return;
													}

													// 如果是 group 的拖拽，找到被拖拽的 group 并处理 drop
													if (dragStartCell !== null) {
														// 找到被拖拽的 group（通过 dragStartCell 找到对应的 piece，再找到该 piece 所属的 group）
														const allGroups = getAllGroups();
														const draggedGroup = Array.from(allGroups.entries()).find(([_, group]) => {
															return group.pieces.some((pieceId) => {
																const piece = pieces.find((p) => p.id === pieceId);
																return piece && piece.position.row === dragStartCell.row && piece.position.col === dragStartCell.col;
															});
														});

														// 如果找到了被拖拽的 group，处理 drop（handleBoundingBoxDrop 会检查边界和有效性）
														if (draggedGroup) {
															e.stopPropagation();
															handleBoundingBoxDrop(e, draggedGroup[0]);
														} else {
															// 没找到被拖拽的 group，让事件冒泡到 puzzler-area 处理
															console.log('[Puzzler] 未找到被拖拽的 group，让事件冒泡');
															return;
														}
													}
												}}
												onDragOver={(e) => {
													e.preventDefault();

													// 检查是否正在拖拽单个 piece
													if (dragStartCell === null && draggingPiece !== null) {
														// 单个 piece 的拖拽，允许 drop
														e.dataTransfer.dropEffect = 'move';
														// 不阻止冒泡，让单个 piece 的 dragOver 逻辑处理
														return;
													}

													// 如果是 group 的拖拽，阻止冒泡并设置 dropEffect
													e.stopPropagation();
													e.dataTransfer.dropEffect = 'move';
												}}
												onMouseEnter={() => {
													// 当 hover 到 group 内的任意 piece 时，设置 hoveredPiece 为该 group 的第一个 piece
													// 这样所有 group 内的 pieces 都会显示 hover 效果
													if (group.pieces.length > 0) {
														setHoveredPiece(group.pieces[0]);
													}
												}}
												onMouseLeave={(e) => {
													// 检查鼠标是否移动到了 group 内的另一个 piece 上
													// 如果移动到 group 内的另一个 piece，不清除 hover
													const relatedTarget = e.relatedTarget as HTMLElement;
													if (relatedTarget) {
														// 检查 relatedTarget 是否是同一个 bounding box 内的 piece
														const boundingBox = relatedTarget.closest('.puzzler-bounding-box');
														if (boundingBox && boundingBox.getAttribute('data-group-id') === groupId) {
															// 鼠标移动到了同一个 group 内的另一个 piece，不清除 hover
															return;
														}
														// 检查 relatedTarget 是否是同一个 group 内的另一个 piece（通过检查其父元素）
														const pieceElement = relatedTarget.closest('.puzzler-piece-in-bounding-box');
														if (pieceElement && pieceElement.parentElement?.getAttribute('data-group-id') === groupId) {
															// 鼠标移动到了同一个 group 内的另一个 piece，不清除 hover
															return;
														}
													}
													// 使用 setTimeout 延迟清除，避免快速移动时闪烁
													setTimeout(() => {
														// 再次检查鼠标是否真的离开了 group
														const activeElement = document.elementFromPoint(e.clientX, e.clientY);
														if (activeElement) {
															const stillInGroup = activeElement.closest(`[data-group-id="${groupId}"]`);
															if (!stillInGroup) {
																setHoveredPiece(null);
															}
														} else {
															setHoveredPiece(null);
														}
													}, 10);
												}}
											>
												<div className="puzzler-piece-inner" style={innerStyle} />
											</div>
										);
									})}
								</div>
							);
						}
					)}

					{pieces.map((piece) => {
						const pieceGroupId = getPieceGroupId(piece.id);
						const isGrouped = pieceGroupId !== null;

						// 如果这个 piece 属于某个 group，不在原位置渲染（已在 bounding box 内渲染）
						if (isGrouped) {
							return null;
						}

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

						// 检查当前 piece 是否在 dragging group 中（用于移除内部边界的 border-radius）
						const isInDraggingGroup =
							dragStartCell !== null && draggingPiece !== null && getGroupedPieces(draggingPiece).includes(piece.id);

						// 检查当前 piece 是否在触摸拖动的 group 中
						const isInTouchDraggingGroup =
							touchStartCell !== null && touchDraggingPiece !== null && getGroupedPieces(touchDraggingPiece).includes(piece.id);

						// 检查当前 piece 是否正在被触摸拖动
						const isTouchDragging = touchDraggingPiece === piece.id || isInTouchDraggingGroup;

						// 检查当前 cell 是否是触摸拖动预览位置
						const isTouchPreviewCell =
							touchCurrentCell !== null &&
							touchDraggingPiece !== null &&
							piece.position.row === touchCurrentCell.row &&
							piece.position.col === touchCurrentCell.col &&
							piece.id !== touchDraggingPiece &&
							!isInTouchDraggingGroup;

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
								className={`puzzler-piece ${
									draggingPiece === piece.id || isInDraggingGroup || isTouchDragging ? 'puzzler-piece-dragging' : ''
								} ${isInHoveredGroup ? 'puzzler-piece-hovered' : ''} ${isTouchPreviewCell ? 'puzzler-piece-touch-preview' : ''} ${
									isGroupedTop ? 'puzzler-piece-grouped-top' : ''
								} ${isGroupedRight ? 'puzzler-piece-grouped-right' : ''} ${isGroupedBottom ? 'puzzler-piece-grouped-bottom' : ''} ${
									isGroupedLeft ? 'puzzler-piece-grouped-left' : ''
								}`}
								style={tileStyle}
								draggable={!isGrouped}
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
