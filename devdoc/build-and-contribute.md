# Build & Contribute / 构建与贡献

## Development / 开发

```bash
# Install dependencies
bun install

# Run in dev mode
bun start

# Run with watch (auto-restart on changes)
bun dev

# Type check
npx tsc --noEmit
```

## Contribute & Pull Request / 贡献与拉取请求
允许使用 AI 生成代码。推荐 Claude Opus 与 ChatGPT Codex & Deepseek V4，必须经过交叉验证与人工验证才可进行提交。

## Build / 构建

```bash
bun run build
```

This runs `scripts/build.ts` which:

1. **Bumps version** — reads `package.json`, increments patch (1.0.2 → 1.0.3), writes back
2. **Creates output dir** — `dist/1.0.3/`
3. **Bundles JS** — `bun build` → `warfire-rises.js` (1.8 MB, ~130 modules)
4. **Copies yoga.wasm** — required by Ink's layout engine
5. **Copies langs/** — both `.txt` language files
6. **Creates wrapper** — shell script `warfire-rises` with `#!/bin/sh`

### Output Structure / 输出结构

```
dist/1.0.3/
  warfire-rises        # Shell wrapper (executable)
  warfire-rises.js     # JS bundle
  yoga.wasm            # Ink layout engine (87 KB)
  langs/
    en-us.txt
    zh-cn.txt
```

### Running the Built Game / 运行构建后的游戏

```bash
./dist/1.0.3/warfire-rises
```

## Adding a New Country / 添加新国家

1. Add to `src/game/countries.ts`:

```ts
{
  ...BASE, id: "AUS", name: "Australia", flag: "🇦🇺",
  government: "democracy", power: "regional",
  economy: 65, military: 40, stability: 75, nuclear: false,
  treasury: 5000, population: 26,
  description: "country.AUS.desc",
  allies: ["USA", "GBR"], enemies: [],
  relations: { USA: 80, GBR: 70, CHN: -20, /* ... */ },
}
```

2. Add descriptions to both language files:

```
# langs/en-us.txt
country.AUS.name: Australia
country.AUS.desc: Pacific ally with strong mineral exports and strategic geography.

# langs/zh-cn.txt
country.AUS.name: 澳大利亚
country.AUS.desc: 拥有强大矿产出口和战略地理位置的太平洋盟友。
```

3. Add relations in other countries (every country pair needs a relation value).

## Adding a New Event / 添加新事件

1. Add template to `EVENT_POOL` in `src/game/events.ts`:

```ts
{ key: "event.my_new_event", type: "military", severity: "medium", wcChange: 3, weight: 6 },
```

2. Add titles/descriptions to both language files:

```
# langs/en-us.txt
event.my_new_event.title: My New Event Title {A}
event.my_new_event.desc: {A} does something to {B}.

# langs/zh-cn.txt
event.my_new_event.title: 我的新事件 {A}
event.my_new_event.desc: {A} 对 {B} 做了某事。
```

Use `{A}` and `{B}` as placeholders — they get replaced with country names at runtime.

## Adding a New Command / 添加新命令

1. Add to `COMMANDS` array in `src/game/commands.ts`:

```ts
{
  name: "mycommand", aliases: ["mc"], category: "system",
  description: "cmd.mycommand.desc", usage: "cmd.mycommand.usage",
  execute: (state, args) => {
    return { success: true, message: "Hello from my command!" };
  },
},
```

2. Add sub-commands to the `subCmds` map if needed.

3. Add translation keys to both language files.

4. If the command mutates state and needs UI refresh, return a marker and handle it in `App.tsx` `handleCommand()`.

## Adding a New Language / 添加新语言

See [i18n.md](./i18n.md).

## TypeScript Rules / TypeScript 规则

- Strict mode enabled
- No implicit `any`
- `noUnusedLocals` is relaxed via `as` casts for intentional unused variables
- All imports use `.ts` / `.tsx` extensions (required by `--target bun` bundler)

## Common Issues / 常见问题

### "Raw mode is not supported"

Ink requires a real TTY. Run the game in a terminal, not a pipe or IDE output panel.

### "Cannot find module './yoga.wasm'"

The `yoga.wasm` file must be in the same directory as the JS bundle. The build script handles this automatically.

### Hook order warnings

All React hooks (`useState`, `useRef`, `useInput`, `useStdout`) must be called in the same order on every render. Never put hooks after conditional returns.

### Translations showing keys instead of text

If you see raw keys like `title.fetching` instead of translated text, the language files weren't loaded. Check that `langs/` is in the correct location relative to the executable.
