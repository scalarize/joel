-- 创建用户模块授权表
-- 用于管理用户对各个子模块的访问权限

CREATE TABLE IF NOT EXISTS user_module_permissions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    module_id TEXT NOT NULL,
    granted_at TEXT NOT NULL,
    granted_by TEXT, -- 授权管理员 ID（可选）
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, module_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_user_module_permissions_user_id ON user_module_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_module_permissions_module_id ON user_module_permissions(module_id);

-- 为所有现有用户添加 gd 模块的授权
INSERT INTO user_module_permissions (id, user_id, module_id, granted_at, created_at, updated_at)
SELECT 
    lower(hex(randomblob(16))) as id,
    id as user_id,
    'gd' as module_id,
    datetime('now') as granted_at,
    datetime('now') as created_at,
    datetime('now') as updated_at
FROM users
WHERE NOT EXISTS (
    SELECT 1 FROM user_module_permissions 
    WHERE user_module_permissions.user_id = users.id 
    AND user_module_permissions.module_id = 'gd'
);




