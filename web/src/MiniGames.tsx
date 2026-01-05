/**
 * 小游戏入口集合模块
 */

// 不使用 react-router，直接使用 window.location

interface Game {
	id: string;
	title: string;
	description: string;
	icon: string;
	path: string;
}

const GAMES: Game[] = [
	{
		id: 'puzzler',
		title: '拼图游戏',
		description: '拖动图块完成拼图',
		icon: '🧩',
		path: '/mini-games/puzzler',
	},
	{
		id: '2048',
		title: '2048',
		description: '滑动合并数字，挑战更高目标',
		icon: '🔢',
		path: '/mini-games/2048',
	},
	{
		id: 'nes',
		title: 'NES 模拟器',
		description: '上传并运行 NES 游戏',
		icon: '🎮',
		path: '/mini-games/nes',
	},
];

export default function MiniGames() {
	const handleGameClick = (path: string) => {
		window.location.href = path;
	};

	return (
		<div className="mini-games">
			<h2>小游戏集合</h2>
			<div className="mini-games-content">
				<div className="mini-games-grid">
					{GAMES.map((game) => (
						<div key={game.id} className="mini-game-card" onClick={() => handleGameClick(game.path)}>
							<div className="mini-game-icon">{game.icon}</div>
							<h3 className="mini-game-title">{game.title}</h3>
							<p className="mini-game-description">{game.description}</p>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
