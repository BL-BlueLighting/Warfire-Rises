# Game Systems / 游戏系统

## 1. Attitude System / 态度系统

Each country pair has a mutual attitude derived from their relation score (-100 to 100).

每对国家根据关系分数（-100到100）有一个相互态度。

| Relation 关系 | Attitude 态度 | EN | 中文 |
|------------|--------|-----|------|
| ≥ 50 | `peaceful` | Peaceful Cooperation | 和平共进 |
| 0 ~ 49 | `neutral` | Middle Ground | 中规中矩 |
| -50 ~ -1 | `strained` | Difficult to Coordinate | 难以协调 |
| ≤ -51 | `irreconcilable` | Irreconcilable | 不死不休 |

**File**: `src/types.ts` — `getAttitude(relation)` function

## 2. Force / Coercion System / 迫使值系统

Each country has `forceValue` (0-100%) and `publicSupport` (0-100%).

每个国家有 `forceValue`（迫使值，0-100%）和 `publicSupport`（民众支持度，0-100%）。

| Threshold 阈值 | Effect 效果 |
|------------|--------|
| > 55% | Can execute extreme operations / 可执行极端行动 |
| > 70% support + irreconcilable | Nuclear strike allowed / 允许核打击 |

Force builds through: military drills, propaganda, war, events.
迫使值通过以下方式增长：军事演习、宣传、战争、事件。

**File**: `src/game/state.ts` — `addForce()`, `addPublicSupport()`

## 3. War System / 战争系统

### Declaration Requirements / 宣战条件

| Requirement 条件 | Threshold 阈值 |
|------------|--------|
| Mutual attitude 相互态度 | ≤ strained (难以协调) |
| Public support 民众支持 | > 65% |
| Army endurance 军队耐力 | > 79% |

### Commands / 命令

| Command | Effect |
|---------|--------|
| `war start <id>` | Declare war / 宣战 |
| `war attack` | Offensive battle (dice roll) / 进攻（掷骰） |
| `war defend` | Fortify (+10 morale, +3 stability) / 防御 |
| `war retreat` | Surrender (-20 stability, -15 NE) / 投降 |
| `war status` | View battle report / 查看战报 |

### Battle Resolution / 战斗结算

```
attackerRoll = random(0-50) + (attacker.military / 2) + (attackerMorale / 5)
defenderRoll = random(0-50) + (defender.military / 2) + (defenderMorale / 5)

attackerRoll > defenderRoll + 15 → attacker win
defenderRoll > attackerRoll + 15 → defender win
otherwise → stalemate
```

**File**: `src/game/war.ts`

## 4. AI System / AI系统

Every day, all 11 non-player countries independently take 1-2 actions:

每天，所有11个非玩家国家独立执行1-2个行动：

| Probability 概率 | Action 行动 |
|------------|--------|
| 25% | Diplomacy / 外交（改善关系或制裁） |
| 20% | Military drill / 军事演习 |
| 20% | Economic adjustment / 经济调整 |
| 15% | Propaganda / 宣传 |
| 20% | Espionage / 间谍活动 |

AI countries can also:
- Declare war on irreconcilable enemies / 对不死不休的敌人宣战
- Sign peace deals (15% chance/day) / 签署和平协议（每天15%概率）

**File**: `src/game/ai.ts` — `runAI(state)`

## 5. Event System / 事件系统

24 event templates across 6 categories:

24个事件模板，分为6类：

| Type 类型 | Count 数量 | Examples 示例 |
|------|-------|---------|
| `military` | 6 | Border skirmish, missile test, naval standoff |
| `political` | 4 | Government crisis, coup, contested election |
| `economic` | 5 | Market crash, trade war, energy crisis |
| `diplomatic` | 5 | Peace deal, alliance treaty, summit |
| `disaster` | 4 | Earthquake, pandemic, climate catastrophe |
| `crisis` | 1 | Nuclear plant emergency |

Events scale with world collapse — higher WC = more severe events.

事件随世界崩坏度升级——WC越高，事件越严重。

**File**: `src/game/events.ts`

## 6. Save System / 存档系统

Format: `item:key` pairs joined by newlines, base64 encoded.

格式：`item:key` 键值对，换行连接，base64 编码。

```
day:5
playerCountryId:USA
worldCollapse:23
countries:[{"id":"USA","economy":95,...}]
...
```

↓ base64 encode ↓

```
ZGF5OjUKcGxheWVyQ291bnRyeUlkOlVTQQp3b3JsZENvbGxhcHNlOjIz...
```

Saved to `./save.warfire` in the current directory.

保存到当前目录的 `./save.warfire`。

**File**: `src/game/save.ts`

## 7. Command Categories / 命令分类

| Category 分类 | Commands 命令 |
|----------|--------|
| `game` | help, next, status |
| `diplomacy` | diplomacy, relations |
| `military` | military, propaganda, nuclear |
| `economy` | economy |
| `war` | war |
| `intelligence` | espionage, world |
| `system` | language, save, load, clear, quit |

**File**: `src/game/commands.ts`
