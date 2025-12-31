/**
 * 模块全局配置
 * 统一管理所有模块的 ID 和权限相关配置
 */

/**
 * 所有模块 ID 列表
 */
export const MODULE_IDS = ['profile', 'favor', 'gd', 'discover', 'mini-games', 'admin'] as const;

/**
 * 需要权限授权的模块 ID 列表（不包括 profile、admin 和 mini-games）
 * - profile 模块：所有人可访问
 * - admin 模块：只有管理员可访问
 * - mini-games 模块：所有已登录用户可访问
 * - 其他模块：需要管理员授予权限
 */
export const PERMISSION_REQUIRED_MODULE_IDS = ['favor', 'gd', 'discover'] as const;

/**
 * 模块 ID 类型
 */
export type ModuleId = (typeof MODULE_IDS)[number];

/**
 * 需要权限的模块 ID 类型
 */
export type PermissionRequiredModuleId = (typeof PERMISSION_REQUIRED_MODULE_IDS)[number];

/**
 * 检查模块 ID 是否有效
 */
export function isValidModuleId(moduleId: string): moduleId is ModuleId {
	return MODULE_IDS.includes(moduleId as ModuleId);
}

/**
 * 检查模块 ID 是否需要权限授权
 */
export function isPermissionRequiredModule(moduleId: string): moduleId is PermissionRequiredModuleId {
	return PERMISSION_REQUIRED_MODULE_IDS.includes(moduleId as PermissionRequiredModuleId);
}

/**
 * 获取所有模块 ID 列表
 */
export function getAllModuleIds(): readonly string[] {
	return MODULE_IDS;
}

/**
 * 获取需要权限的模块 ID 列表
 */
export function getPermissionRequiredModuleIds(): readonly string[] {
	return PERMISSION_REQUIRED_MODULE_IDS;
}

