# stat-track

Unofficial stats site for the Hockey Super League **2019 Major** division, built from the league's published game sheets on [hockeysuperleague.ca](https://hockeysuperleague.ca/division/0/37783/masterschedule).

## How it works

```
league .ics calendar ──► scripts/scrape.mjs ──► data/schedule.json
league game pages    ──►                    ──► data/games/<id>.json
                                                     │
                         scripts/build.mjs  ◄────────┘
                                │
                                ▼
                     site/data/stats.json ──► site/ (static HTML + JS)
```

- **Game discovery** — the division's calendar feed lists every game in the season with its ID and final score.
- **Game stats** — each game page is server-rendered HTML with the timeline, box score and goalie lines. Parsed with cheerio.
- **Scraping is incremental** — only new final games (plus anything played in the last 2 days, to catch stat corrections) are fetched.
- **Site** — plain HTML/CSS/JS, no build step. Reads `site/data/stats.json`.
- **Automation** — `.github/workflows/update.yml` runs every 2 hours, commits new data, and deploys `site/` to GitHub Pages.

## Run locally

```bash
npm install
node scripts/scrape.mjs     # --all to re-fetch everything
node scripts/build.mjs
python -m http.server 8765 --directory site
```

## What's published vs. kept

These are 7-year-olds, so the public site shows **team-level** penalty minutes and save % only.
Individual penalty minutes, penalty names, and individual goalie stats are still scraped and kept
in `data/games/*.json` (for private questions), but `scripts/build.mjs` strips them from
`site/data/stats.json`. Team save % excludes games where the sheet records fewer shots than goals.

## Configuration

`scripts/config.mjs` holds the season, division and "my team" IDs. To track another division, change `divisionId` / `divisionName` (IDs are in the league site's URLs).

## Known data quirks (from the league's own reports)

- Goalie minutes are inconsistent between games; team shots come from each sheet's Shots table instead, and a few sheets omit it.
- Occasional impossible clock times (e.g. `06:86`).
- The league's standings PIM sometimes includes penalties not shown on the game sheets.
- Game recaps on the league site are auto-written and sometimes contradict the box score; they're ignored.

Each game's warnings are stored in `data/games/<id>.json` and shown on the game page.
