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
- **Automation** — `.github/workflows/update.yml` runs nightly (~10 PM Mountain) plus a Monday-morning catch-up, commits new data, and deploys `site/` to GitHub Pages.

## Run locally

```bash
npm install
node scripts/scrape.mjs     # --all to re-fetch everything
node scripts/build.mjs
python -m http.server 8765 --directory site
```

## What's published

The site is password-protected (see below), so the encrypted stats include individual penalty
minutes, named penalties and goalie stats. Goalie lines are checked against each game sheet
(goals against vs the score, shots vs the shots table, minutes); lines that don't add up are shown
but left out of save % / GAA, with per-game notes on the site.

## Password

The published stats file is encrypted (AES-256-GCM, key from PBKDF2-SHA256 with 600k rounds). The
site asks for the team password and decrypts in the browser; "Remember this device" stores the
derived key (not the password) in localStorage. The Action reads the password from the
`SITE_PASSWORD` repository secret and refuses to publish unencrypted if it's missing.

- Set or change the password: `gh secret set SITE_PASSWORD`, then run the workflow. Changing it
  signs every device out.
- Local dev without a password writes plain `site/data/stats.json`; with `SITE_PASSWORD=...` it
  writes `stats.enc.json` like CI.
- This hides the stats, not the page shell (HTML/JS/CSS stay public). Keep the repo private too,
  since `data/` holds the raw scraped game files.

## Configuration

`scripts/config.mjs` holds the season, division and "my team" IDs. To track another division, change `divisionId` / `divisionName` (IDs are in the league site's URLs).

## Known data quirks (from the league's own reports)

- Goalie minutes are inconsistent between games; team shots come from each sheet's Shots table instead, and a few sheets omit it.
- Occasional impossible clock times (e.g. `06:86`).
- The league's standings PIM sometimes includes penalties not shown on the game sheets.
- Game recaps on the league site are auto-written and sometimes contradict the box score; they're ignored.

Each game's warnings are stored in `data/games/<id>.json` and shown on the game page.
