/**
 * 模块全局配置
 * 统一管理所有模块的定义信息
 */

export interface ModuleConfig {
	id: string;
	title: string;
	description: string;
	url: string;
	icon: string;
	external: boolean;
}

/**
 * 所有模块的完整配置
 */
export const MODULES: ModuleConfig[] = [
	{
		id: 'profile',
		title: '个人资料',
		description: '管理显示名称和头像',
		url: '/profile',
		icon: '👤',
		external: false,
	},
	{
		id: 'favor',
		title: '书签收藏',
		description: '收藏和管理常用链接',
		url: '/favor',
		icon: '🔖',
		external: false,
	},
	{
		id: 'gd',
		title: 'GD 开发',
		description: 'GD 相关开发工具和资源',
		url: 'http://gd.scalarize.org/',
		icon: '⚙️',
		external: false,
	},
	{
		id: 'discover',
		title: 'Discover',
		description: 'Discover 相关工具和资源',
		url: 'http://discover.scalarize.org/',
		icon: '🔍',
		external: false,
	},
	{
		id: 'mini-games',
		title: '小游戏',
		description: '小游戏入口集合',
		url: '/mini-games',
		icon: '🎮',
		external: false,
	},
	{
		id: 'admin',
		title: '系统管理',
		description: '系统配置和管理入口',
		url: '/admin',
		icon: '⚙️',
		external: false,
	},
];

/**
 * 所有模块 ID 列表
 */
export const MODULE_IDS = MODULES.map((m) => m.id);

/**
 * 需要权限授权的模块 ID 列表（不包括 profile 和 admin）
 * profile 模块所有人可访问，admin 模块只有管理员可访问
 */
export const PERMISSION_REQUIRED_MODULE_IDS = MODULE_IDS.filter(
	(id) => id !== 'profile' && id !== 'admin'
);

/**
 * 根据模块 ID 获取模块配置
 */
export function getModuleById(id: string): ModuleConfig | undefined {
	return MODULES.find((m) => m.id === id);
}

/**
 * 获取所有模块 ID
 */
export function getAllModuleIds(): string[] {
	return MODULE_IDS;
}

/**
 * 获取需要权限的模块 ID 列表
 */
export function getPermissionRequiredModuleIds(): string[] {
	return PERMISSION_REQUIRED_MODULE_IDS;
}

