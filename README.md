# stat-track

Unofficial, password-protected stats site for the **Hockey Super League (HSL) 2019 Major** division,
built for one team's families and coaches (Stars Hockey Academy). It scrapes the league's published
game sheets, adds analytics the league doesn't offer, and folds in non-season tournaments.

- **Live site:** https://craigpoff1.github.io/stat-track/ (team password required)
- **Source data:** [hockeysuperleague.ca](https://hockeysuperleague.ca/division/0/37783/masterschedule) (RAMP InterActive)
- **Hosting:** GitHub Pages, updated by GitHub Actions — nothing runs locally

## How it works

```
HSL calendar (.ics) + game pages ──► scripts/scrape.mjs ──► data/schedule.json, data/games/<id>.json
Tournament sites (RAMP) + HPL (Kreezee) ──► scripts/events.mjs ──► data/events/<event>/…, data/leagues/<league>.json
                                                    │
                                   scripts/build.mjs  (aggregate, validate, link identities, encrypt)
                                                    │
                                   site/data/stats.enc.json ──► site/ (static HTML/CSS/JS, decrypts in browser)
```

| Piece | What it does |
|---|---|
| `scripts/scrape.mjs` | HSL: reads the division calendar, fetches new/changed final game pages (incremental; re-checks recent games for stat corrections). Fails loudly if the league's page layout changes. |
| `scripts/parse.mjs` | Parsers for RAMP calendars and game sheets (header, scoring + shots by period, timeline, box score, goalies). Shared by HSL and RAMP tournament sites. |
| `scripts/events.mjs` | Tournaments + external leagues (see below). Never fails the overall update. |
| `scripts/build.mjs` | Standings, player/goalie/team stats, goalie-sheet validation, tournament standings, team/player identity linking, encryption. |
| `scripts/config.mjs` | HSL season / division / "my team" ids. |
| `scripts/events.config.mjs` | Tracked tournaments and external opponent leagues. |
| `scripts/identity.config.mjs` | Confirmed tournament-player → league-player links for cases auto-matching couldn't decide. |
| `site/` | `index.html`, `app.js` (all views, hash-routed, no framework), `style.css` ("Primetime" broadcast theme). |
| `.github/workflows/update.yml` | Nightly ~10 PM Mountain + Monday-morning catch-up: test → scrape → events → build → commit data → deploy Pages. |

## The site

**Team** (the selected team; switcher in the top bar, Stars by default)
- **Team page** (`#/`): banner, last game (animated game-flow replay), up next, weekend recap with firsts,
  team scoring, season progression, when goals happen, by period, linemates network, roster, goalies,
  results (grouped by weekend), tournaments entered, by-weekend, head-to-head.
- **Scout** (`#/scout/<team>`): live scouting report for any team — keys to the game (rule-based, with
  evidence), snapshot, history vs us, common opponents, who to key on, goalies, timing, discipline,
  game script, shots. Rolling "last 4 games" windows.

**Events**
- **Tournaments** (`#/tournaments`): non-season events. Played events get standings, playoffs,
  scoring, game pages; upcoming events get opponent scouting (incl. external-league teams).

**League** — Standings, Leaders (skaters + goalies), Weekends, Schedule (grouped by weekend).

**Everywhere:** global search (`/` or Ctrl/Cmd+K), player and game pages, home/away badges in jersey
colours (home white, away green), and an **Include tournament games** toggle in the top bar (off by
default; 🏆 on phones; ⓘ explains it) that adds tournament games to standings (marked "not the official
league table"), team records, results and head-to-head, player and goalie stats, leaders, team analytics
and scouting. Weekend recaps and firsts stay league-only.

## Policies (owner decisions)

- **Team vs league separation:** team pages show only that team; league tabs show league-wide data.
  Agreed exceptions: highlighting the selected team in league tables, small rank annotations, and
  "Following" (any team) on Leaders.
- **Privacy:** the site is password-protected, so individual penalty minutes and goalie stats are
  shown. Never publish unencrypted stats (CI refuses). External rosters keep name / number / goalie
  only — never contact, birthday or address fields.
- **Kids:** analytics are about teams and growth; no player-vs-player comparisons, no goalie shaming.
- **Tournaments** never count toward league standings or records. Events are added only when the
  owner names them.

## Operating it

```bash
npm install
npm test                         # parser, crypto and tournament regression tests
node scripts/scrape.mjs          # HSL (--all re-fetches every game)
node scripts/events.mjs          # tournaments + external leagues (--all re-fetches event sheets)
node scripts/build.mjs           # no SITE_PASSWORD → plain site/data/stats.json for local dev
DIVISION=2018 node scripts/scrape.mjs && DIVISION=2018 node scripts/build.mjs   # 2018 Major gallery
python -m http.server 8765 --directory site
```

- **2018 Major gallery** (`/2018/`): a simple standings + scoring-leaders page for the 2018 Major
  division with a team filter, linked from the main site's footer. Same password; updated nightly.

- **Manual update:** `gh workflow run update.yml` (add `-f refetch_all=true` for a full HSL re-fetch),
  or Actions tab → *Update stats and deploy* → *Run workflow*.
- **Password:** repository secret `SITE_PASSWORD` (set via GitHub Settings → Secrets → Actions).
  Changing it signs every device out. Devices store the derived key, never the password.
- **Add a tournament:** add an entry to `scripts/events.config.mjs` (RAMP sites: calendar URL from
  the event's "Download calendar" link + division id). Teams link to their home league by roster.
- **Identity review:** if the build prints `identity review: N …`, confirm those players and record
  them in `scripts/identity.config.mjs`.
- **Off-season:** GitHub disables scheduled workflows after 60 days without commits — re-enable in
  the Actions tab.
- **Repo visibility:** the repo is public; `data/` holds raw game files (also public on the league
  sites). Making it private needs GitHub Pro to keep Pages.

## Data quality (from the source sheets)

Game sheets are entered by volunteers. Known issues, all handled and shown on the site:
- Goalie lines often don't add up (goals against ≠ score, blank minutes, shots vs shots table).
  Bad lines are shown but left out of save % / GAA; a ⓘ icon explains each adjustment.
- Occasional impossible clock times (e.g. `06:86`) — excluded from timing analytics.
- Some sheets have no shots table; some tournament sheets have one team's box score empty.
- League standings PIM can include penalties not on the sheets. League AI recaps are ignored.
- HPL (Kreezee) publishes only scores and rosters — no scorers, shots, penalties or goalie stats.
