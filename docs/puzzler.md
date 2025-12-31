# 拼图游戏 Puzzler 技术文档

## 概述

Puzzler 是一个基于 React 的拼图游戏，支持桌面端和移动端的拖拽操作，具有图库管理功能。游戏将图片分割成多个图块，玩家通过拖拽图块完成拼图。

## 已实现功能

### 1. 核心游戏功能

#### 1.1 游戏初始化
- **随机图片选择**：从 manifest 中获取可用图片列表，随机选择一张图片
- **图块生成**：根据难度配置（easy/medium/hard）将图片分割成对应数量的图块
- **位置打乱**：使用 Fisher-Yates 洗牌算法随机打乱图块位置
- **动态网格布局**：根据难度配置动态设置 CSS Grid 的行列数

#### 1.2 难度系统
- **三种难度级别**：
  - Easy: 5 行 × 9 列 = 45 块
  - Medium: 7 行 × 12 列 = 84 块
  - Hard: 9 行 × 16 列 = 144 块
- **动态配置**：通过 `DIFFICULTY_CONFIGS` 配置，CSS 布局自动适应
- **难度切换**：游戏开始前可以切换难度

#### 1.3 图块分组（Group）机制
- **自动检测相邻图块**：检测已正确放置的相邻图块，自动形成 group
- **Group 拖拽**：支持拖拽整个 group，而不是单个图块
- **Group 边界处理**：group 内的图块移除内部边界，形成连续视觉效果
- **Group 状态管理**：维护所有 group 的映射关系，支持快速查找

#### 1.4 拖拽交互

**桌面端（鼠标拖拽）**：
- 支持单个图块拖拽
- 支持 group 整体拖拽
- 拖拽预览效果（高亮目标位置）
- 拖拽图像自定义（显示整个 group）

**移动端（触摸拖拽）**：
- 完整的触摸事件支持（touchstart/touchmove/touchend/touchcancel）
- 触摸位置到网格坐标的转换
- 触摸拖拽预览效果（绿色边框高亮）
- 防止页面滚动和默认触摸行为
- 全局触摸事件监听，防止状态卡住

#### 1.5 胜利检测
- 实时检测所有图块是否都在正确位置
- 胜利后显示庆祝动画和"再来一局"按钮

### 2. 图库管理功能

#### 2.1 Manifest 系统
- **数据结构**：
  ```typescript
  {
    version: number;        // 版本号，用于并发控制
    lastUpdate: number;     // 最后更新时间戳
    maxImageId: number;     // 最大图片 ID
    disabledImageIds: number[]; // 禁用的图片 ID 列表
  }
  ```
- **版本控制**：所有 manifest 更新都进行版本校验，防止并发冲突
- **自动更新**：更新 manifest 时自动递增版本号和更新时间戳

#### 2.2 图片管理
- **分页显示**：图库管理页面支持分页浏览所有图片
- **禁用/启用**：管理员可以标记图片为禁用状态
- **图片上传**：
  - 支持选择本地图片文件
  - 支持粘贴图片 URL（自动抓取网络图片）
  - 自动检查宽高比（需接近 16:9，允许 20% 误差）
  - 自动处理为 1600×900 像素（使用 Canvas cover 模式）
  - 自动保存为 `<maxImageId + 1>.jpg` 并更新 manifest

#### 2.3 权限控制
- 图库管理入口仅管理员可见
- 所有图库管理 API 都需要管理员权限

### 3. 用户体验优化

#### 3.1 视觉反馈
- 拖拽中的图块高亮显示
- 目标位置预览（绿色边框 + 脉冲动画）
- Group 悬停效果
- 胜利动画

#### 3.2 错误处理
- Manifest 加载失败时显示错误信息和重试按钮
- 图片上传失败时显示详细错误信息
- 版本冲突时自动刷新并提示

#### 3.3 响应式设计
- 支持桌面端和移动端
- 自适应布局
- 触摸优化（禁用默认触摸行为）

## 关键技术点

### 1. CSS Grid 布局

**动态网格配置**：
```typescript
style={{
  gridTemplateColumns: `repeat(${config.cols}, 1fr)`,
  gridTemplateRows: `repeat(${config.rows}, 1fr)`,
  aspectRatio: `${config.cols} / ${config.rows}`,
}}
```

**关键 CSS 属性**：
- `display: grid`：使用 CSS Grid 布局
- `gap: 2px`：图块之间的间距
- `overflow: hidden`：隐藏超出部分，制造"窗口"效果
- `border-radius`：圆角处理，group 内图块移除内部边界

### 2. 图块定位算法

**背景图片定位**：
```css
background-image: url(...);
background-size: calc(100% * ${cols}) calc(100% * ${rows});
background-position: calc(-100% * ${col} / ${cols}) calc(-100% * ${row} / ${rows});
```

通过 `background-position` 和 `background-size` 实现图块显示图片的对应部分。

### 3. Group 检测算法

**递归查找相邻图块**：
```typescript
const getGroupedPieces = (pieceId: number): number[] => {
  // 1. 检查图块是否在正确位置
  // 2. 递归查找四个方向的相邻图块
  // 3. 检查相邻图块是否也在正确位置
  // 4. 返回所有相邻且已正确放置的图块 ID 列表
}
```

**Group 边界处理**：
- 通过 CSS 类名（`puzzler-piece-grouped-top/right/bottom/left`）移除内部边界的 `border-radius`
- 确保 group 内图块视觉上连续

### 4. 拖拽事件处理

**桌面端**：
- `onDragStart`：设置拖拽数据，创建自定义拖拽图像
- `onDragOver`：阻止默认行为，设置 `dropEffect`
- `onDrop`：处理放置逻辑，交换图块位置
- `onDragEnd`：清理拖拽状态

**移动端**：
- `onTouchStart`：记录触摸起始位置和当前图块
- `onTouchMove`：计算触摸位置对应的网格坐标，更新预览
- `onTouchEnd`：执行图块交换，清理状态
- 全局 `touchend`/`touchcancel` 监听：防止状态卡住

### 5. 图片处理（前端）

**Canvas API 处理**：
```typescript
// 1. 加载图片（File 或 URL）
// 2. 检查宽高比（16:9，允许 20% 误差）
// 3. 创建 Canvas，使用 cover 模式
// 4. 计算缩放和裁剪参数
// 5. 绘制图片（居中裁剪）
// 6. 转换为 JPEG Blob（quality: 85）
```

**关键参数**：
- `TARGET_WIDTH: 1600`
- `TARGET_HEIGHT: 900`
- `TARGET_ASPECT_RATIO: 16 / 9`
- `ASPECT_TOLERANCE: 0.2`（20% 误差）

### 6. Manifest 更新机制

**统一的更新函数**：
```typescript
async function updateManifest(
  env: Env,
  updater: (current: PuzzlerManifest) => PuzzlerManifest,
  expectedVersion: number
): Promise<{ success: boolean; manifest?: PuzzlerManifest; ... }>
```

**更新流程**：
1. 读取最新 manifest
2. 检查版本号是否匹配
3. 使用 updater 函数更新 manifest
4. 自动递增版本号和更新时间戳
5. 写入 R2 存储

**并发控制**：
- 版本号校验防止并发更新冲突
- 返回 409 Conflict 状态码，前端自动刷新

### 7. 状态管理

**React Hooks 使用**：
- `useState`：管理游戏状态、图块位置、拖拽状态等
- `useRef`：保存 DOM 引用（puzzleAreaRef）
- `useCallback`：优化函数引用，避免不必要的重渲染
- `useEffect`：处理副作用（加载 manifest、全局事件监听）

**关键状态**：
- `pieces`：所有图块的位置信息
- `draggingPiece`：当前拖拽的图块 ID
- `touchDraggingPiece`：触摸拖拽的图块 ID
- `hoveredPiece`：悬停的图块 ID（用于 group 高亮）
- `manifest`：图片 manifest 数据

### 8. API 接口

**主要接口**：
- `GET /api/mini-games/puzzler/manifest`：获取 manifest
- `PUT /api/mini-games/puzzler/manifest`：更新 manifest（仅管理员）
- `POST /api/mini-games/puzzler/upload`：上传图片（仅管理员）

**认证**：
- 使用 JWT token（Bearer Token）
- 管理员权限检查（`isAdminEmail`）

## 文件结构

```
web/src/
  ├── Puzzler.tsx          # 主游戏组件
  ├── Puzzler.css          # 游戏样式
  └── PuzzlerGallery.tsx   # 图库管理组件

api/src/
  └── index.ts             # API 接口实现
    ├── handlePuzzlerGetManifest
    ├── handlePuzzlerUpdateManifest
    ├── handlePuzzlerUploadImage
    └── updateManifest     # 统一的 manifest 更新函数
```

## 配置说明

### 难度配置

```typescript
const DIFFICULTY_CONFIGS: Record<Difficulty, DifficultyConfig> = {
  easy: { rows: 5, cols: 9, label: '易' },
  medium: { rows: 7, cols: 12, label: '中' },
  hard: { rows: 9, cols: 16, label: '难' },
};
```

修改配置后，CSS 布局会自动适应（通过内联样式动态设置）。

### 图片配置

- 图片尺寸：1600×900 像素
- 宽高比：16:9
- 格式：JPEG
- 质量：85%
- 存储路径：`mini-games/puzzler/images/{id}.jpg`

## 技术栈

- **前端框架**：React + TypeScript
- **样式**：CSS（Grid 布局、Flexbox）
- **图片处理**：Canvas API
- **后端**：Cloudflare Workers
- **存储**：Cloudflare R2
- **认证**：JWT (RS256)

## 未来可能的改进

1. 添加游戏计时功能
2. 添加移动步数统计
3. 添加排行榜功能
4. 支持自定义图片上传（非管理员）
5. 添加更多难度级别
6. 优化移动端性能（大量图块时的渲染优化）

