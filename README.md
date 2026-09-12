<div align="center">
    <h1>WARFIRE RISES</h1>
    <i><h2>战火升腾</h2></i>
    <p>A geopolitical world simulation with a Hearts of Iron IV style map,<br/>rebuilt as a Tauri desktop game.</p>
</div>

## What this is

A rewrite of the terminal edition of *Warfire Rises*. The original was a React + Ink
CLI app where you played through a text console. This edition keeps the simulation
engine but replaces the console with a **HOI4-style map and control panels**: you
click nations on a real world map, and drive diplomacy, economy, military and war
from side panels instead of typed commands.

The world is generated from live data at the start of each campaign — real exchange
rates and real news headlines distilled into world keywords — and then simulated
forward, one day at a time, with 11 AI nations acting independently.

## Running it

```bash
npm install
npm run tauri:dev      # desktop app (Tauri)
npm run dev            # browser only, http://localhost:1420
```

Build a distributable:

```bash
npm run tauri:build    # → src-tauri/target/release/bundle/
```

> **⚠ Note on the install path.** This affects *this working copy only*. It sits
> in a directory whose name contains a colon (`RE: Warfire Rises`), and on Linux
> a colon is the `PATH` separator, which breaks two things:
>
> 1. **`npm run`** can no longer find `node_modules/.bin`. The scripts in
>    `package.json` therefore call `./node_modules/.bin/<tool>` directly.
> 2. **Cargo cannot build at all** — it constructs `LD_LIBRARY_PATH` from the
>    target directory and rejects the path outright:
>    `error: failed to join paths from $LD_LIBRARY_PATH together … path segment contains separator ':'`.
>    `src-tauri/.cargo/config.toml` works around this by redirecting build
>    output to `~/.cache/warfire-rises-target`.
>
> **The clean fix is to move this project to a directory without a colon.** Once
> you do, delete `src-tauri/.cargo/config.toml` and you can simplify the
> `package.json` scripts back to plain `vite` / `tsc` / `tauri`.
>
> **Nothing of this is committed.** `src-tauri/.cargo/` is git-ignored precisely
> because it holds an absolute path that only makes sense on one machine — a
> fresh clone builds normally, and CI never sees it.

## Known limitations

- **World news keywords fall back to a static list in the browser/webview.**
  `open.er-api.com` (exchange rates) sends CORS headers and works live, but
  `news.google.com/rss` does not, so the browser fetch is blocked. The CLI
  edition did this fetch server-side in Bun, where CORS does not apply. To
  restore live headlines, move the fetch into a Rust command (it would need an
  HTTP client such as `reqwest`).

## Controls

| Input | Action |
|---|---|
| Click a nation | Select it; the right panel switches to that nation's context |
| Drag the map | Pan |
| Scroll | Zoom toward the cursor |
| **Space** | Pause / resume time |
| `1`–`5` (speed ticks) | Set game speed |
| **`** (backtick) | Toggle the command console — there is no on-screen button |
| Right-click a bubble | Dismiss it |

Clicking a nation changes what the panels operate on. With **nothing** selected the
panels act on your own nation; the action buttons apply to whoever is selected.

## Time flows

Time is continuous, not turn-based. `clock.time` is a fractional day count and
`state.day` is its floor; a render loop pumps real elapsed milliseconds into it,
multiplied by the speed tier.

| Tier | Days / real second | 1 day takes |
|---|---|---|
| Paused | 0 | — |
| 1 | 0.25 | 4 s |
| 2 | 0.5 | 2 s |
| 3 | 1 | 1 s |
| 4 | 2 | 0.5 s |
| 5 | 5 | 0.2 s |

**Everything takes time.** No action resolves instantly — each one is a task with
a start and end day, shown in the *In Progress* queue with a progress bar. Cost is
paid when you give the order; the effect lands when the timer expires. Cancelling
refunds half.

| Action | Days | Action | Days |
|---|---|---|---|
| Condemn | 3 | Infiltrate | 45 |
| Currency manipulation | 5 | Invest | 60 |
| Sanction (diplomatic) | 5 | Stimulus | 90 |
| Strike | 10 | Research | 60–180 |
| Improve relations | 10 | Construction | 120–180 |
| Drill | 20 | Recruit (per division) | 30 |
| Treaty | 30 | **Justify war goal** | 1–180 |

## Decisions (`decisions/*.warf-decision`)

National decisions are plain JSON, authored outside the code. Drop a file into
`decisions/` and press **reload from disk** in the Decisions panel — no rebuild
needed in the desktop app. Files are also bundled at build time so the browser
build works without a filesystem.

```jsonc
{
  "Country": "CHN",              // a country id, or "all" for everyone
  "Decisions": [
    {
      "Type": "Decisions",
      "Name": "持续创新",
      "Description": "(持续性国策)\n为了未来科技与国家的进步…",
      "Require": [
        { "Type": "CountryEndurance", "To": "self", "Condition": ">=", "Num": 50 }
      ],
      "Time": "inf",             // a number (capped at 180), or "inf"
      "InfinityPhases": [        // required when Time is "inf"
        {
          "Type": "Phase",
          "Get": [ { "Type": "Get", "Rewards": [["CountryEndurance", "+", 10], ["Nuke", "+", 5]] } ],
          "Content": "我们成功研发出了新一代秘密核导弹。\n科研之路仍在继续。",
          "Time": 60
        }
      ],
      "Result": [                // optional for "inf", applied on every completion
        { "Type": "Result", "Rewards": [ { "Type": "Reward", "Rewards": [["Economy", "+", 2]] } ] }
      ]
    }
  ]
}
```

**Requirements** are `{ Type, To, Condition, Num }` where `Condition` is one of
`>= <= > < == !=`, and `To` is `self`, `target`, `enemy`, or a country id.

**Rewards** are `[Attribute, Operator, Value]` with `Operator` one of
`+ - * / =`. They appear in three places: `InfinityPhases[].Get[].Rewards`,
`Result[].Rewards[].Rewards`, and — for `Require` — as `Type`.

Usable attributes: `CountryEndurance` `ArmyEndurance` `DiplomaticPoints`
`WorldCollapse` `Day` `Economy` `Military` `Stability` `PublicSupport`
`ForceValue` `Treasury` `Population` `Manpower` `Nuke` `Divisions`
`DivisionStrength` `Nuclear`, plus `Relation` (which reads your opinion of the
country named by `To`).

> `CountryEndurance`, `ArmyEndurance` and `DiplomaticPoints` live on the player's
> nation. When a decision resolves `To` to an AI country they fall back to that
> country's stability / military, so a decision written for an AI nation still
> reads sensibly instead of silently using your numbers.

Malformed files don't break the game — each one is reported in the Decisions panel
with the parse error, and the rest still load.

## Combat

Modelled on Hearts of Iron IV rather than a single dice roll. The central idea:

> **Losing organisation loses the battle; losing strength costs men.**

A division fights until its organisation (morale, cohesion, supply) is gone, then
disengages and a reserve takes its place. Strength — manpower and equipment —
only bleeds once a unit is being hit while already broken. A battle is won by
grinding the enemy's organisation down, not by killing.

| Mechanic | How it works |
|---|---|
| **Combat width** | The front fits so many divisions; each occupies 20 width against a base 80 (100 for a defender). The rest wait in reserve and rotate in as units break. |
| **Defence / breakthrough pools** | A defender's Defence — or an attacker's thinner Breakthrough — absorbs incoming fire. Attacks *under* the pool land ~10% of the time; attacks *beyond* it land ~40%. Concentrating more attack than the enemy can absorb is how a line breaks. |
| **Entrenchment** | Grows daily while a side holds, up to +30, raising the defender's pool by up to 35%. Pressing the attack burns it off. |
| **Stances** | Attacking raises output 15% but swaps your Defence pool for Breakthrough, so it costs more than it earns unless you outnumber or out-tech the defender. |
| **Tech** | Attack scales ~2.5× faster with technology than defence does. If they scaled together a battle between equals would never resolve — both pools would swallow the other's entire weight of fire. |

Battles tick **daily on their own**. `war attack` / `war defend` are orders, not
attacks: they set your stance and the fighting continues.

### Command

Divisions belong to **army groups**, each with a commander and a standing order.
Only groups set to assault or hold take the field — a group on **reserve** sits
the battle out entirely, which is how a broken formation is rested without
disbanding it.

Generals carry three 1–5 skills that feed straight into the combat pools: attack
for weight of fire, defence for absorbing it, planning for how fast a line digs
in. An uncommanded group still fights, it just dilutes the average — so leaving a
formation leaderless is a real cost. The Command panel currently shows the
generals, groups and orders, and per-group organisation bars.

### The general staff

The **邀请军事指挥家** decision (25 days) hands the army to the general staff.
It is an ordinary `.warf-decision` file — it works by setting the `AutoArmy`
attribute, which is why it needs no special-case code:

```jsonc
"Result": [{ "Type": "Result", "Rewards": [
  { "Type": "Reward", "Rewards": [["AutoArmy", "=", 1], ["ArmyEndurance", "+", 10]] }
]}]
```

Once in charge, the staff works every day: it pulls formations below 45%
organisation out of the line to refit and returns them when rested, puts the
commander with the right skill in front of each order (attack for assault,
defence for hold), spreads replacements into the thinnest group, and raises a
new division every 45 quiet days if the treasury allows.

**The player can still give orders — and the staff will object.** A manual
change opens a dialogue with the chief of staff, who says one of five lines
("首领，这样的指派不正确。您这样做会消耗我们的耐力的！"). Complying cancels the
order; insisting applies it and costs **1–23% army endurance**, unpredictably.

> The first version had a real flaw: the staff simply undid the player's order
> the next morning, which made overruling pointless. Being overruled now makes
> it stand down on dispositions for 15 days, so the decision sticks long enough
> to matter.

### Peace conferences

When a nation is conquered, its land does not change hands as one lump — the
victors sit down and divide it along its actual **administrative regions**, which
is the payoff for carrying province data.

The victor takes the chair and the largest claim budget; allies who fought
alongside them get a seat and a smaller one. Every region costs a point. AI
delegations spend their share automatically, and whatever nobody claims stays
with the defeated nation. Ownership is written to `state.regionOwner`, and the
map repaints those provinces in their new owner's colour — so the border changes
are visible on the map itself.

## Research, nukes and the army

**Every weapon needs research.** Nuclear powers begin with `nuclear_weapons`
already unlocked; everyone else must research it. Holding the technology is not
enough to *use* it — you also need a **nuclear facility** (180 days, $1500B),
which then produces one warhead every 30 days. A nuclear strike consumes a
warhead from the stockpile.

**Release authority.** The gating depends on whether you are actually fighting:

| | At peace | At war, against a belligerent |
|---|---|---|
| Warhead in stockpile | required | required |
| Nuclear technology | required | required |
| Public support > 70% | required | **waived** |
| Coercion readiness > 55% | required | **waived** |
| Attitude *irreconcilable* | required | **waived** |

Once war is joined the warhead is the argument — there is no domestic persuasion
left to do. Because the strike is then a normal wartime act, it is also offered
directly on the War panel, aimed at the enemy you are fighting. Firing on a
country you are *not* at war with still goes through the full peacetime checks,
even if you are busy elsewhere.

**Manpower** is measured in thousands and drawn from a pool capped at 1% of
population. Recruiting a division (50K manpower, $80B, 30 days) commits that
manpower permanently — it returns only when the division is disbanded. Ten
divisions is the minimum to go to war.

> **Interpretation.** You asked for "at least 500 people" before a war can start.
> I read that as 500 *thousand* troops (`WAR_MIN_MANPOWER = 500` in
> `src/game/army.ts`) so it means ten divisions. Change the constant if you meant
> it literally.

**Justifying a war goal** is now a precondition for declaring war:

```
days = 90 × (1 − |relation| / 100)   when relation < 0
days = 90 × (1 + relation / 100)     when relation ≥ 0
```

Both forms agree at 0, so the curve is continuous: 90 days at neutral, 11 days at
−88 relations, 180 at +100.

## Events and pacing

Two things had to change once time stopped being turn-based.

**Events are rare.** The CLI edition generated 1–3 world events *every day*,
which was fine when the player clicked through one day at a time. At 5
days/second that floods the screen, so `DAILY_EVENT_CHANCE = 0.08`
(`src/game/events.ts`) means most days are quiet.

**Collapse was rescaled.** With the original per-day rates, a campaign ended
**in about six seconds** at 5×. Gains now accumulate fractionally in
`worldCollapseRaw` (with `worldCollapse` as the displayed floor) and
`COLLAPSE_SCALE` in `src/game/state.ts` is the single dial for campaign length.
A campaign currently runs **~140 days** — enough for 60–180 day research and
multi-phase decisions to pay off. Tuning knobs, in order of effect:
`DAILY_EVENT_CHANCE`, `COLLAPSE_SCALE`, and the AI's `AI_WAR_CHANCE`.

**Everything notable surfaces as a bubble**, pinned to the map's bottom-right
corner: world events *and* AI actions. Each lasts 30 seconds; a right-click
dismisses it permanently (nothing is archived or re-shown). The full history
stays in the Log panel, which keeps every AI action — only the *notable* ones
(declarations of war, peace deals, sanctions) interrupt you as bubbles, because
eleven nations acting every day is a firehose, not news.

There is no bottom bar; the map fills the window and the console only opens with
a backtick.

Eleven AI nations acting every day produce a constant stream of war, peace and
sanction notices, which buries the world events worth reading. AI news is
therefore throttled to **one bubble per 5 game days** and only the most recent
notice in that window is shown. The Log panel keeps the complete record.

> **Bug fixed along the way.** The original AI re-declared the same war every
> single day — it never checked whether it was already fighting that country, so
> each day added another collapse tick. Invisible across a 30-turn campaign;
> fatal once time ran continuously. It now checks first, and only takes the
> plunge 15% of the time even when every precondition is met.

## The map

The map is real geography — Natural Earth 110m boundaries via `world-atlas`,
projected with `d3-geo` (Natural Earth I) into SVG. All ~177 nations are drawn; the
12 playable ones are interactive and coloured, the rest are inert grey terrain.

### Cities

Provincial capitals and major cities come from Natural Earth's
`ne_10m_populated_places` (18.5 MB, trimmed to 899 cities across the twelve
nations, 68 KB shipped). They are bucketed into three tiers that appear as you
close in, so a world view stays readable:

| Tier | Contents | Appears at | Count |
|---|---|---|---|
| 3 | National capitals | 1.5× | 12 |
| 2 | Major cities — province capitals and prefecture-level cities | 2.4× | 591 |
| 1 | Remaining notable cities (300k+) | 4.4× | 296 |

> **Natural Earth's ranking is not usable outside the US.** For China its
> numbers are plainly wrong: Zibo outranks Suzhou, Foshan ties with Zunyi, and
> Hechi is credited with 3.8 million people. Neither `POP_MAX` nor `SCALERANK`
> knows that Zunyi is a prefecture-level city (地级市) while Xingyi is only a
> county-level one — which is the distinction that actually decides what a
> Chinese reader calls a major city. Chinese cities therefore carry an explicit
> importance table in the build script; the other eleven nations fall back to
> cartographic rank plus population, which behaves acceptably.

Each city is a dot with its name set alongside — larger and brighter for a
capital. Names switch with the UI language (`NAME_ZH` for Chinese).

City labels collide as **text boxes**, not as a radius. A radius has to be wide
enough for the longest name, which wipes out a whole dense province at once: at
7× zoom a 40-unit radius culled Zunyi and Liupanshui while letting the more
distant Xingyi through — exactly backwards. Box collision raised the number of
labels that fit in one view from 322 to 558.

Text halos are set as a fraction of the font size, never as a fixed
`stroke-width`. Labels scale their font by 1/zoom to stay a constant size on
screen, so a fixed outline width ends up wider than the glyphs themselves past
a certain zoom, smearing the text into spikes.

### Borders

The map is drawn from **Natural Earth** (`world-atlas`), a US-published dataset,
taken as-is. Two things are corrected on top of it:

1. **Taiwan is merged into China.** Natural Earth carries Taiwan as its own
   feature (id 158), separate from China (156). Left alone, that draws Taiwan
   outside Chinese territory — and because everything outside the twelve
   playable nations is background, it would effectively present the island as a
   separate country. `TERRITORY_MERGES` in `src/map/geo.ts` folds its polygon
   into China's geometry, so it renders in China's colour and clicks through to
   China. Verified by hit-testing the island: every sample point resolves to
   `PLAYABLE:CHN`.

2. **The background is not described as a set of nations.** The grey fill is
   labelled 其他地区 / *Other territories*, not "non-participating nations".
   The game makes no claim about the statehood of anything it does not simulate.

`TERRITORY_MERGES` is a plain table — add an entry to fold any other piece of
geometry into a playable nation:

```ts
const TERRITORY_MERGES = [
  { territory: "158", into: "CHN" },   // Taiwan → China
];
```

Natural Earth also carries, among others, Kosovo, N. Cyprus, Somaliland,
W. Sahara, Palestine, Puerto Rico, the Falklands, Greenland and Antarctica as
their own features. These are left as neutral background: the legend no longer
asserts they are states, and the game takes no position on them. If you want any
of them drawn as part of a playable nation, add a row to the table above.

### Names on the map

Nations are labelled with their **flag and full name** — 🇨🇳 中国, not `CHN`. The
internal codes are an implementation detail, so they only appear when you type
`debug` in the console (`~`), which appends them: 🇨🇳 中国 (CHN).

Because the labels are now variable-width, they collide as **text boxes** rather
than by a circular radius — a radius sized for "United States" would blank out
most of Europe.

### Administrative regions

Each playable nation is subdivided into its first-order administrative regions —
Chinese provinces, US states, Russian oblasts, German Länder, and so on — drawn
as thin interior lines. Non-playable neighbours stay plain, which makes the
twelve nations read as the ones that matter.

The source is Natural Earth's `ne_10m_admin_1_states_provinces_lakes` (public
domain). It is 39 MB raw, so it is trimmed at build time:

| Step | Result |
|---|---|
| Source features | 4,596 |
| Kept (the 12 playable nations) | 676 |
| — after dropping interior rings and specks | 847 rings |
| — after Douglas–Peucker at 0.08° | 17,386 points |
| `src/map/data/admin1.json` | 278 KB |

Two details worth knowing:

- **The provinces are stored as raw lon/lat**, not pre-projected points. The
  runtime projects them with the very same d3 projection the country outlines
  use, so the two can never drift apart.
- **Each nation's provinces are clipped to that nation's own outline** via an
  SVG `clipPath`. The provinces are 10 m data and the countries are 110 m, so
  without clipping the finer province lines would spill into the sea and over
  neighbouring countries. Clipping makes the mismatch invisible.

Rendering 847 extra paths cost about half the frame budget until the static
layers were memoised — the province and backdrop geometry never changes, so
they now render once and ride along with the map transform instead of being
re-diffed on every store notification. That took the frame rate at 5× speed
from 31.6 to 54.9 fps.

Six map modes recolour every nation by a different metric:

- **Political** — relation to you, from allied to irreconcilable (the default)
- **Faction** — your allies vs. your enemies
- **Military** / **Economy** / **Stability** — strength heatmaps
- **War** — highlights active belligerents

Nations you are at war with are drawn with a hatched overlay so they read as
contested regardless of map mode.

## Game systems

Ported from the CLI edition with the simulation semantics preserved.

**Attitude** — relations run -100…100 and map to four stances: peaceful (≥50),
neutral (≥0), strained (≥-50), irreconcilable (<-50). Crossing ±75 automatically
adds or removes the nation from your allies/enemies lists.

**War** — declaring war requires, in order: a **justified war goal** against the
target, at least **500K manpower committed** to standing divisions, a mutual
attitude of *strained* or worse, public support >65%, and army endurance >79%.
Battles are dice rolls modified by military strength, morale, and a bonus derived
from the size of each side's army (capped at +15). Each side tracks morale and
losses; morale hitting zero ends the war. Phases run
`preparing → active → decisive → ended`.

**Nuclear weapons** — the only action gated on coercion readiness. Requires public
support >70%, an *irreconcilable* target, and force value >55%. Sets the target's
military, economy, stability and 70% of its population to zero, and adds +30% to
World Collapse. Guarded by a confirmation dialog.

**World Collapse** — the global pressure gauge, starting at 8%. Every event and
aggression pushes it up. It **caps at 100% and no longer ends the campaign**;
past 60% it throttles your daily regeneration of diplomatic points and army
endurance (down to 40% of normal at 100%), so a burning world is a slow squeeze
rather than a countdown.

**Resources** — diplomatic points (max 100, +8/day), army endurance (+5/day),
national endurance, and treasury. Actions spend them; they regenerate daily.

## How a campaign ends

There is exactly one way out: **your nation is conquered.**

- The world-collapse meter no longer ends anything — it is pressure, not a timer.
- War only ends a campaign when you are the **defender** and your side breaks
  (morale hits zero), or you surrender while being invaded. Losing a war *you*
  started is just a setback.
- The AI can invade you directly. When it does, the war opens as a defensive war
  and the War panel shows a red warning strip: *losing this war means the end of
  your nation*.

Being conquered is not the end of the campaign, though. The fallen nation is
looted (armed forces destroyed, economy and stability gutted, warheads seized)
and marked out of play; then you pick a successor from the nations still
standing. **The world carries over untouched** — same day, same collapse level,
same relations, same AI wars — and only your own affairs reset. You can lose
nation after nation and keep going as long as anyone is left.

## Embedded fonts

The game ships its own fonts rather than trusting the player's machine. They
live in `public/fonts/` as WOFF2 and total **~1.4 MB**.

| File | Role | Source | Size |
|---|---|---|---|
| `flags-emoji.woff2` | Country flags and UI icons | Segoe UI Emoji + Twemoji flags | 194 KB |
| `body-cjk.woff2` | Body text, Latin and CJK | Noto Sans CJK SC | 1.15 MB |
| `display.woff2` / `display-bold.woff2` | Condensed headings and buttons | Nimbus Sans Narrow | 20 KB each |
| `mono.woff2` | Figures | JetBrains Mono | 26 KB |

**Why flags need embedding.** Windows ships Segoe UI Emoji *without* country
flags — deliberately, for political reasons — so 🇺🇸 renders as the letters "US"
for every Windows player, and the top bar and nation lists lose their flags
entirely. The embedded face has Twemoji's flag set grafted in.

> The first flag font tried was a `seguiemj_*_mod` build circulating online.
> Its Chinese flag is the **1912–1928 five-colour banner**, not the five-star
> red flag, so it was discarded. The Twemoji set is correct.

The flag face is listed **first** in every font stack. It carries no Latin or
CJK glyphs, so ordinary text falls straight through to the next family and only
emoji are claimed by it.

Each face is subset with `pyftsubset` to the characters the game can print,
plus a margin: the CJK face covers ~4,500 characters rather than the 1,370 in
the repo today, because decision files are authored by the player and a subset
carved to exactly today's text would show tofu the moment they typed a new word.
Language files, decision files and the province/city datasets were all scanned
to build the character set.

Rebuild them with `python3 <build-fonts.py>` after changing the fonts; it needs
`brotli` for WOFF2, which on Arch means a venv (`pyftsubset`'s shebang pins it
to the system Python either way).

## Look

The chrome follows the game it borrows from: **flat near-black panels edged in
bright brass**, gold headings over parchment body text, no rounded corners, no
soft gradients, no drop shadows. Selected controls fill with a brass gradient;
everything else is a hairline outline. Density is high — small type, tight
padding — and the top bar carries its resource readouts abreast like a status
strip.

On top of that sits a light period wash: a paper grain over the whole board, a
lamp-lit vignette at the edges, brass corner brackets on panels, and rivets
along the top bar.

Typography uses what the machine actually has — `Nimbus Sans Narrow` /
`DejaVu Sans Condensed` for display, `Noto Sans CJK` for Chinese body text,
`JetBrains Mono` for figures. No web fonts are fetched, so it works offline.

The map palette is warmed to match, except the `neutral` relation colour, which
stays blue-grey on purpose: against all that brass it reads instantly as
"unaligned".

## Layout

```
src/
  main.tsx                 Entry; mounts App
  App.tsx                  Phase router: title → playing → gameover
  styles.css               HOI4-inspired theme
  game/                    Simulation
    types.ts               Domain types (incl. clock, tasks, divisions)
    countries.ts           12 nations + geo id mapping
    state.ts               State CRUD, relations, collapse, the clock
    events.ts              24 weighted event templates
    war.ts                 War declaration, battles, morale, retreat
    ai.ts                  Per-day AI actions for 11 nations
    actions.ts             Timed-action registry (the one action path)
    scheduler.ts           Time advance + task completion
    decisions.ts           .warf-decision parser + requirement/reward engine
    attributes.ts          Attribute namespace for decision files
    research.ts            Tech tree, buildings, warhead production
    army.ts                Manpower, divisions, recruitment
    commands.ts            Console layer (delegates to actions.ts)
    store.ts               Reactive store + render loop
    save.ts                base64 serialization; Tauri fs or localStorage
    worldData.ts           Live exchange rates + news keyword extraction
  map/
    geo.ts                 TopoJSON → GeoJSON → projected SVG paths
    colors.ts              Map-mode palettes and legends
    WorldMap.tsx           SVG map: pan, zoom, hover, select
    worldmap.css
  panels/                  Right-hand control panels
    NationPanel.tsx  DiplomacyPanel.tsx  MilitaryPanel.tsx
    EconomyPanel.tsx IntelligencePanel.tsx WarPanel.tsx
    LogPanel.tsx     PanelHost.tsx
  components/              TopBar, LeftRail, BottomBar, Console,
                           ConfirmDialog, Toasts, screens
  i18n/index.ts            `key: value` lang files, zh-cn + en-us
  langs/                   Translation data
src-tauri/                 Rust shell: window config + save/load commands
```

## Fixes carried in from the original's data

The CLI edition's `langs/*.txt` files were generated from `langs/strings.csv`
with a naive `split(",")`, which silently corrupted any entry whose English text
contained a comma. This edition repairs them from the CSV (the untruncated
source):

- **31 English strings were truncated mid-sentence** — e.g.
  `cmd.diplomacy.no_points` ended at `…(need {cost}`, dropping `, have {have})`.
  Eight of these were event descriptions (earthquakes ending at "Thousands dead",
  cyber attacks at "A massive cyber attack").
- **27 Chinese strings were English sentence fragments.** The field shift pushed
  the *tail of the English value* into the Chinese column, so a Chinese UI showed
  text like `event.tech_breakthrough.desc: reshaping global economic competition.`
  These are restored to their real translations.
- **Localised country names are now actually used.** The lang files have always
  carried `country.<ID>.name` (美国, 中国, 俄罗斯 …), but the original printed the
  English `country.name` everywhere. The panel/map/event text now goes through
  `src/game/names.ts`, so the Chinese UI reads 俄罗斯 instead of "Russia".

`langs/strings.csv` and the repair scripts are the record of what changed; the
repairs are one-way (the CSV is authoritative for any key it contains, and the
141 keys added to the `.txt` files afterwards are left untouched).

## Architecture notes

**State.** The simulation object is mutated in place and a version counter is
bumped to trigger re-renders — the same approach the CLI edition used, which suits
a deeply nested game object better than rebuilding an immutable tree every frame:

```ts
useSyncExternalStore(subscribe, getSnapshot)   // store.ts
// mutate → notify() → version++ → subscribers re-render
```

**One action path.** Panel buttons and the console both funnel through
`runAction(command)`, which executes a CLI-style command string. The original
command set is intact, so `war attack` from the console does exactly what the
ATTACK button does.

**Dual persistence.** The same bundle runs in the Tauri webview and in a plain
browser. `save.ts` detects `window.__TAURI_INTERNALS__` and uses the Rust
`save_game`/`load_game` commands, falling back to `localStorage` in a browser.

## Credits

Original terminal edition: [Warfire Rises](https://github.com/) (React + Ink).
Map data: [Natural Earth](https://www.naturalearthdata.com/) via
[world-atlas](https://github.com/topojson/world-atlas).
Icon from [Haley Wakamatsu, Monster Friend 2](https://www.behance.net/gallery/100106185/Monster-Friend-2).

## License

**GNU Lesser General Public License v3.0** — see [LICENSE](./LICENSE).

Third-party assets (fonts, map data, the icon) keep their own licences and are
credited in [NOTICE.md](./NOTICE.md). The Twemoji flags in particular are
CC BY 4.0, which requires attribution — it is in that file.
