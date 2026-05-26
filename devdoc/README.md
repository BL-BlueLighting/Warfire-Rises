# WARFIRE RISES — Developer Documentation / 开发者文档

## Attention / 注意
- 多语言文件里 strings.csv 是 deprecated 的，懒得删。
- 整个项目中大部分都是 ds 写的，游戏玩法我给的，vibe coding 实践属于是。

## Index / 目录

| Document 文档 | Content 内容 |
|----------|--------|
| [architecture.md](./architecture.md) | Project structure, component tree, state design, tech stack / 项目结构、组件树、状态设计、技术栈 |
| [game-systems.md](./game-systems.md) | Attitude, force, war, AI, events, save, commands / 态度、迫使值、战争、AI、事件、存档、命令 |
| [i18n.md](./i18n.md) | Translation system, adding languages, key conventions / 翻译系统、添加语言、键命名规范 |
| [build-and-contribute.md](./build-and-contribute.md) | Build process, adding countries/events/commands / 构建流程、添加国家/事件/命令 |

## Quick Links / 快速链接

- **Entry point 入口**: `src/index.tsx`
- **All types 所有类型**: `src/types.ts`
- **Translation keys 翻译键**: `langs/en-us.txt` (407+ keys)
- **Build script 构建脚本**: `scripts/build.ts`
- **Current version 当前版本**: `package.json` → `version`

## Key Files / 核心文件

```
src/App.tsx              # Game loop, phase routing, I18nContext provider
src/game/commands.ts     # All 16 commands with sub-commands and categorized help
src/game/war.ts          # War declaration, battle resolution, status display
src/game/ai.ts           # AI for 11 non-player countries
src/game/save.ts         # Base64 serialization with item:key format
src/i18n/index.ts        # Translation loader, t() function, language switching
src/components/Title.tsx  # Country selection with keyboard navigation
```
