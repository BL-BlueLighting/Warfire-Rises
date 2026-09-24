# Third-party notices

WARFIRE RISES is licensed under the **GNU Lesser General Public License v3.0**
(see [LICENSE](./LICENSE)). It bundles and derives from the following works,
which remain under their own licences.

## Embedded fonts

The game ships subset and re-encoded copies of these faces in `public/fonts/`
so the interface looks the same on a machine that has none of them installed.
All were subset with `pyftsubset` to the characters the game can print, and
converted to WOFF2 — that is the only modification made to them.

| File | Face | Licence | Required notice |
|---|---|---|---|
| `flags-emoji.woff2` | Twemoji Color Font (`TwitterColorEmoji-SVGinOT`) | MIT (font build) + **CC BY 4.0** (Twemoji artwork) | Copyright © Brad Erickson; graphics © Twitter, Inc. and contributors |
| `body-cjk.woff2` | Noto Sans CJK SC | SIL Open Font License 1.1 | © The Noto Project Authors |
| `display.woff2`, `display-bold.woff2` | Barlow Condensed | SIL Open Font License 1.1 | © The Barlow Project Authors |
| `mono.woff2` | JetBrains Mono | SIL Open Font License 1.1 | © JetBrains s.r.o. |

The Twemoji artwork is used under **CC BY 4.0**, which requires attribution and
an indication of changes. Both are satisfied above: the artwork is credited to
the Twemoji project and the modifications are stated (subset, WOFF2 re-encode,
no redrawing).

Full licence texts:
- Twemoji Color Font: <https://github.com/13rac1/twemoji-color-font>
- Twemoji graphics: <https://github.com/jdecked/twemoji> (CC BY 4.0)
- Noto: <https://fonts.google.com/noto>
- Barlow: <https://fonts.google.com/specimen/Barlow+Condensed>
- JetBrains Mono: <https://www.jetbrains.com/lp/mono/>
- SIL Open Font License 1.1: <https://scripts.sil.org/OFL>

## Map data

| Source | Used for | Licence |
|---|---|---|
| [Natural Earth](https://www.naturalearthdata.com/) | Country outlines (`world-atlas`, 110 m), administrative regions (10 m), populated places | **Public domain** |
| [world-atlas](https://github.com/topojson/world-atlas) | TopoJSON packaging of the Natural Earth outlines | ISC |
| [Twemoji](https://github.com/jdecked/twemoji) | The twelve national flags in `public/flags/` | **CC BY 4.0** |

| [historical-basemaps](https://github.com/aourednik/historical-basemaps) | The historical borders behind the 1938 / 1945 / 1994 / 2000 scenarios (`public/eras/`) | **GPL-3.0** |

The region dataset in `src/map/data/` is generated from Natural Earth's
`ne_10m_admin_1_states_provinces_lakes`; it is trimmed to the twelve playable
nations, stripped of interior rings and simplified. The city dataset is
similarly derived from `ne_10m_populated_places`. `src/map/data/eraRegions.json`
is generated from the historical borders above by `scripts/build-eras.mjs`.

The 1942 scenario (`ww2-fight`) is a *derivation*: that dataset has no year
between 1938 and 1945, so its borders are the 1938 ones with the annexations and
overseas conquests of the intervening years applied — Germany's absorption of
Austria, the Czech lands and Poland, the Soviet annexation of the Baltic states,
and Japan's southern operation together with the Chinese coast it held. It
carries the same licence as the borders it is built from.

**The historical borders are GPL-3.0, and that is why this project is GPL-3.0
rather than LGPL-3.0.** The scenarios are not optional extras bolted onto the
side: they ship in the same binary and are loaded by the same map, so the
combined work is distributed under the GPL. Anything derived from those borders
— the scenarios in `public/eras/`, the province ownership in `eraRegions.json`
— carries the same licence. Everything the project wrote itself remains
available under the GPL, which is a superset of the LGPL terms it was under
before.

## Icon

The application icon derives from *Monster Friend 2* by
[Haley Wakamatsu](https://www.behance.net/gallery/100106185/Monster-Friend-2).
