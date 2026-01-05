# 扩展 jsnes Mapper 支持指南

## 概述

jsnes 的 mapper 实现在 `node_modules/jsnes/src/mappers.js` 文件中。要添加新的 mapper 支持，需要了解以下内容：

### 当前支持的 Mapper

根据 `mappers.js` 文件，jsnes 目前支持以下 mapper：
- Mapper 0: Direct Access (NoMapper)
- Mapper 1: Nintendo MMC1
- Mapper 2: UNROM
- Mapper 3: CNROM
- Mapper 4: Nintendo MMC3
- Mapper 5: Nintendo MMC5 (部分实现)
- Mapper 7: AOROM
- Mapper 11: Color Dreams
- Mapper 34: BNROM, NINA-01
- Mapper 38
- Mapper 66: GxROM
- Mapper 94: UN1ROM
- Mapper 140
- Mapper 180

## 扩展方案

### 方案 1: Fork jsnes 并添加 mapper（推荐用于长期维护）

**步骤：**

1. **Fork jsnes 仓库**
   ```bash
   # Fork https://github.com/bfirsh/jsnes
   # 然后克隆你的 fork
   git clone https://github.com/YOUR_USERNAME/jsnes.git
   ```

2. **添加新的 mapper 实现**
   
   在 `src/mappers.js` 文件中添加新的 mapper，例如添加 Mapper 9 (MMC2)：

   ```javascript
   /**
    * Mapper 009 (MMC2)
    * @description http://wiki.nesdev.com/w/index.php/INES_Mapper_009
    * @example Punch-Out!!
    * @constructor
    */
   Mappers[9] = function (nes) {
     this.nes = nes;
   };

   Mappers[9].prototype = new Mappers[0]();

   Mappers[9].prototype.reset = function () {
     Mappers[0].prototype.reset.apply(this);
     // 初始化 mapper 9 特定的状态
     this.latch0FD = 0xFD;
     this.latch0FE = 0xFE;
     this.latch1FD = 0xFD;
     this.latch1FE = 0xFE;
   };

   Mappers[9].prototype.write = function (address, value) {
     if (address < 0x8000) {
       Mappers[0].prototype.write.apply(this, arguments);
       return;
     }

     // MMC2 的寄存器写入逻辑
     switch (address) {
       case 0xA000:
         // PRG ROM bank select
         this.loadRomBank(value & 0x0F, 0x8000);
         break;
       case 0xB000:
       case 0xB001:
       case 0xB002:
       case 0xB003:
       case 0xC000:
       case 0xC001:
       case 0xC002:
       case 0xC003:
         // CHR ROM bank select
         // 实现 CHR ROM 切换逻辑
         break;
       case 0xD000:
         // Mirroring
         if (value & 0x01) {
           this.nes.ppu.setMirroring(this.nes.rom.HORIZONTAL_MIRRORING);
         } else {
           this.nes.ppu.setMirroring(this.nes.rom.VERTICAL_MIRRORING);
         }
         break;
     }
   };

   Mappers[9].prototype.latchAccess = function (address) {
     // MMC2 的 latch 访问逻辑
     // 当 PPU 访问特定地址时触发
     if (address === 0x0FD0) {
       this.load1kVromBank(this.latch0FD, 0x0000);
     } else if (address === 0x0FE0) {
       this.load1kVromBank(this.latch0FE, 0x0000);
     } else if (address === 0x1FD0) {
       this.load1kVromBank(this.latch1FD, 0x1000);
     } else if (address === 0x1FE0) {
       this.load1kVromBank(this.latch1FE, 0x1000);
     }
   };

   Mappers[9].prototype.loadROM = function () {
     if (!this.nes.rom.valid) {
       throw new Error("MMC2: Invalid ROM! Unable to load.");
     }

     // 加载 PRG-ROM
     this.loadRomBank(0, 0x8000);
     this.loadRomBank(this.nes.rom.romCount - 1, 0xC000);

     // 加载 CHR-ROM
     this.loadCHRROM();

     // 触发重置中断
     this.nes.cpu.requestIrq(this.nes.cpu.IRQ_RESET);
   };
   ```

3. **更新 rom.js 中的 mapper 名称**
   
   在 `src/rom.js` 的 `mapperName` 数组中添加 mapper 名称：
   ```javascript
   this.mapperName[9] = "Nintendo MMC2";
   ```

4. **构建和测试**
   ```bash
   npm install
   npm run build
   npm test
   ```

5. **发布到 npm（可选）**
   ```bash
   npm publish
   ```

6. **在项目中使用**
   
   在 `web/package.json` 中使用你的 fork：
   ```json
   {
     "dependencies": {
       "jsnes": "git+https://github.com/YOUR_USERNAME/jsnes.git"
     }
   }
   ```

### 方案 2: 运行时扩展 mapper（快速方案）

创建一个包装器文件，在运行时扩展 jsnes 的 mapper 支持：

**创建文件：`web/src/jsnes-mapper-extensions.js`**

```javascript
/**
 * jsnes Mapper 扩展
 * 在运行时扩展 jsnes 的 mapper 支持
 */

export function extendJSNESMappers(jsnesModule) {
  const Mappers = jsnesModule.Mappers || jsnesModule.default?.Mappers;
  
  if (!Mappers) {
    console.warn('[NES] 无法扩展 mapper：找不到 Mappers 对象');
    return;
  }

  // 添加 Mapper 9 (MMC2) 示例
  if (!Mappers[9]) {
    Mappers[9] = function (nes) {
      this.nes = nes;
    };

    Mappers[9].prototype = new Mappers[0]();

    Mappers[9].prototype.reset = function () {
      Mappers[0].prototype.reset.apply(this);
      this.latch0FD = 0xFD;
      this.latch0FE = 0xFE;
      this.latch1FD = 0xFD;
      this.latch1FE = 0xFE;
    };

    Mappers[9].prototype.write = function (address, value) {
      if (address < 0x8000) {
        Mappers[0].prototype.write.apply(this, arguments);
        return;
      }
      // 实现 MMC2 的写入逻辑
      // ...
    };

    Mappers[9].prototype.loadROM = function () {
      if (!this.nes.rom.valid) {
        throw new Error("MMC2: Invalid ROM! Unable to load.");
      }
      // 实现加载逻辑
      // ...
    };

    console.log('[NES] Mapper 9 (MMC2) 已添加');
  }

  // 可以继续添加其他 mapper...
}

// 使用方式：在 NESEmulator.tsx 中
// import { extendJSNESMappers } from './jsnes-mapper-extensions';
// 
// const loadJSNES = async () => {
//   const jsnes = await import('jsnes');
//   extendJSNESMappers(jsnes);
//   return jsnes;
// };
```

**注意：** 这个方案的问题是 jsnes 可能没有导出 `Mappers` 对象，需要检查 jsnes 的实际导出结构。

### 方案 3: 使用 patch-package（中等方案）

使用 `patch-package` 来修改 node_modules 中的文件，并在每次安装后自动应用补丁：

1. **安装 patch-package**
   ```bash
   npm install --save-dev patch-package
   ```

2. **修改 node_modules/jsnes/src/mappers.js**
   
   添加你需要的 mapper 实现

3. **创建补丁**
   ```bash
   npx patch-package jsnes
   ```

4. **在 package.json 中添加 postinstall 脚本**
   ```json
   {
     "scripts": {
       "postinstall": "patch-package"
     }
   }
   ```

## 实现新 Mapper 的要点

### 1. 继承基础 Mapper

所有 mapper 都应该继承自 `Mappers[0]`（基础 mapper）：

```javascript
Mappers[X].prototype = new Mappers[0]();
```

### 2. 必须实现的方法

- **`reset()`**: 重置 mapper 状态
- **`write(address, value)`**: 处理 CPU 写入操作
- **`loadROM()`**: 加载 ROM 到内存
- **`load()`**: 处理 CPU 读取操作（如果需要特殊处理）

### 3. 可用的辅助方法

从基础 mapper 继承的方法：
- `loadRomBank(bank, address)`: 加载 16KB PRG-ROM bank
- `load8kRomBank(bank, address)`: 加载 8KB PRG-ROM bank
- `load32kRomBank(bank, address)`: 加载 32KB PRG-ROM bank
- `loadVromBank(bank, address)`: 加载 4KB CHR-ROM bank
- `load8kVromBank(bank, address)`: 加载 8KB CHR-ROM bank
- `load1kVromBank(bank, address)`: 加载 1KB CHR-ROM bank
- `load2kVromBank(bank, address)`: 加载 2KB CHR-ROM bank
- `loadCHRROM()`: 加载所有 CHR-ROM
- `loadBatteryRam()`: 加载电池 RAM

### 4. 参考资源

- [NES Dev Wiki - Mapper List](http://wiki.nesdev.com/w/index.php/Mapper)
- [NES Dev Wiki - iNES Format](http://wiki.nesdev.com/w/index.php/INES)
- [FCEUX Source Code](https://github.com/TASEmulators/fceux) - 可以参考 FCEUX 的实现

## 推荐的 Mapper 优先级

根据使用频率，建议优先实现以下 mapper：

1. **Mapper 9 (MMC2)**: Punch-Out!!
2. **Mapper 10 (MMC4)**: 一些任天堂游戏
3. **Mapper 16 (Bandai)**: 一些 Bandai 游戏
4. **Mapper 19 (Namco 106)**: 一些 Namco 游戏
5. **Mapper 21-25 (Konami VRC)**: 一些 Konami 游戏

## 测试新 Mapper

1. 找到使用该 mapper 的 ROM 文件
2. 在 jsnes 中加载 ROM
3. 检查是否能正常运行
4. 对比 FCEUX 或其他模拟器的行为

## 注意事项

1. **不要直接修改 node_modules**: 更新包时会丢失修改
2. **遵循 jsnes 的代码风格**: 使用相同的命名和结构
3. **添加注释**: 说明 mapper 的用途和参考文档
4. **测试**: 确保新 mapper 不会破坏现有功能

