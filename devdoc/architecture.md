# Architecture / 架构

## Tech Stack / 技术栈

| Layer 层 | Technology 技术 |
|-----------|----------|
| Runtime 运行时 | [Bun](https://bun.sh) 1.3+ |
| UI Framework UI框架 | [Ink 4](https://github.com/vadimdemedes/ink) (React for CLI) |
| Language 语言 | TypeScript 5.5+ (strict mode) |
| Layout 布局引擎 | Yoga (WASM, bundled with Ink) |
| Package Manager 包管理器 | Bun |

## Directory Structure / 目录结构

```
src/
  index.tsx              # Entry — clear screen, load langs, render App
  App.tsx                # Root component, game loop, phase routing
  types.ts               # All TypeScript types and enums
  i18n/
    index.ts             # Translation loader, t() function, React context
  game/
    state.ts             # GameState CRUD, relations, force, collapse
    countries.ts         # 12 country definitions with base stats
    events.ts            # 24 event templates, daily generation engine
    commands.ts          # 16 commands with sub-commands
    war.ts               # War declaration, battles, retreat
    ai.ts                # AI actions for 11 non-player countries
    save.ts              # Base64 serialization / deserialization
    worldData.ts         # Live exchange rates, news headline fetch
  components/
    Title.tsx            # Country selection screen
    Sidebar.tsx          # Stats panel (right side)
    EventLog.tsx         # Event display (unused, kept for reference)
    CommandInput.tsx     # Text input with cursor movement
    StatusBar.tsx        # Bottom help bar
    GameOver.tsx         # TFR / TNO ending screens

langs/
  en-us.txt              # English translations (key: value per line)
  zh-cn.txt              # Chinese translations

scripts/
  build.ts               # Full build: bump version, bundle, copy assets

dist/<version>/          # Build output per version
  warfire-rises          # Shell wrapper
  warfire-rises.js       # Bundled JS
  yoga.wasm              # Ink layout engine
  langs/                 # Copied language files
```

## Component Tree / 组件树

```
<App>                         # Phase router + I18nContext.Provider
  ├─ phase=title    → <Title>           # Country picker
  ├─ phase=loading  → <Box>             # Fetching spinner
  ├─ phase=playing  → <Box row>
  │                     <Box main>
  │                       <Output area>  # Scrollable text (or WarView)
  │                       <CommandInput> # ▶ prompt
  │                     <Sidebar>        # Stats panel
  │                   <StatusBar>        # help | next | world | Ctrl+C
  └─ phase=gameover → <GameOver>        # Ending stats
```

## State Architecture / 状态架构

Game state is stored in a **mutable ref** (`useRef<GameState>`) with a `tick` counter to trigger re-renders. All game logic mutates `stateRef.current` directly, then calls `rerender()`. This avoids the overhead of immutable state updates for a deeply nested game object.

游戏状态存储在可变 ref 中，用 `tick` 触发重渲染。所有游戏逻辑直接修改 `stateRef.current`，然后调用 `rerender()`。

```ts
const stateRef = useRef<GameState>(null);
const [, setTick] = useState(0);
const rerender = () => setTick(t => t + 1);
```

React hooks (useInput, useStdout) are called **before** any conditional returns to avoid Rules of Hooks violations.

React hooks 必须在任何条件返回**之前**调用，以避免 Rules of Hooks 违规。

## Phase Flow / 阶段流程

```
title → loading → playing → gameover
                      ↑         |
                      └─ load ──┘
```

- **title**: Country selection with keyboard navigation / 国家选择（键盘导航）
- **loading**: Fetch exchange rates + news (5s timeout, graceful fallback) / 获取汇率+新闻（5秒超时，优雅降级）
- **playing**: Main game loop — output + command input + sidebar / 主游戏循环
- **gameover**: World Collapse at 100% → TFR or TNO ending / 世界崩坏度达100%时的结局
