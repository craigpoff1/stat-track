# CLAUDE.md — stat-track

Briefing for Claude sessions working on this repo. Read README.md for the product/architecture
overview; this file is the working knowledge: conventions, decisions, and traps.

## Who / what
- Owner: Craig (parent; product background, not a line-by-line coder). Son Elias plays for
  **Stars Hockey Academy** (HSL 2019 Major, team id `402384`). The coach and team parents use the site.
- Site: https://craigpoff1.github.io/stat-track/ — password-protected (`SITE_PASSWORD` secret).
- Repo: github.com/craigpoff1/stat-track (public). Deploys from `main` via `.github/workflows/update.yml`.

## Workflow rules
- **The nightly bot commits `data/`** ("Update game data"). Always `git pull --rebase` before pushing;
  commit first if you have changes (`pull --rebase` refuses with a dirty tree). Never force-push.
- If a rebase conflicts on a `data/` file, regenerate it (`node scripts/events.mjs` / `scrape.mjs`)
  rather than hand-merging JSON.
- Pushing to `main` with changes under `site/`, `scripts/`, `test/` or the workflow triggers a deploy.
  Watch it: `gh run watch $(gh run list --branch main --event push --limit 1 --json databaseId -q '.[0].databaseId')`.
- Run `npm test` before pushing. Other Claude sessions may push to `main` too — rebase, don't clobber.
- Owner-facing changes ship the same session; explain what changed in plain language.

## Code map (site/app.js — one IIFE, hash router)
- **Views** return HTML strings; DOM work after render goes in `after(() => …)` hooks.
- Helpers: `panel()`, `sortable()` (FLIP-animated sortable tables), `mount()` (resize-aware SVG
  charts), `gameCards()`, `weekendGroups()`, `leaderRows()`, `hero()`, `tn()`/`teamLink()`/`logo()`.
- **Escaping:** everything scraped goes through `esc()`. Tooltips must use `tip(title, body)` — it
  double-escapes (attribute + innerHTML). Never write `data-tip="…"` by hand.
- **Data:** `S` = decrypted stats.json. `teamById` also holds tournament teams (`eventId`, `href`) and
  external-league teams (`ext`, e.g. `hpl:148550`). `gameById` holds league + tournament games.
- **Datasets:** read league-or-tournament-inclusive data through `D()` (`D().games`, `D().players`,
  `D().skaters`, `D().playerOf(id)`, `D().periodsOf(team)`). Standings/records/results/weekends/firsts
  must keep using league-only data (`S.games`, `S.teams`, `t.results`).
- Team/league separation: Team section = selected team only; League tabs = league-wide; Tournaments =
  its own section. Ask before mixing.

## Build (scripts/build.mjs)
- HSL aggregation → standings, players, goalies (validated by `checkGoalieSheet`, shared with events),
  then events (per-event teams/games/players, ids namespaced `"<event>:<id>"`), team links (roster
  overlap ≥60%, name fallback), player identity (exact name, else # + last name; unresolved →
  `identityReview`, confirmed in `identity.config.mjs`), then encryption.
- No `SITE_PASSWORD` locally → plain `site/data/stats.json`; CI without it fails on purpose.
- `parseGame(…, { lenientTeamIds: true })` only for tournament sheets; HSL stays strict so a league
  layout change fails the run instead of publishing hollow data.

## Traps we've hit (read these)
- **Shell heredocs mangle backslashes** on this Windows/Git Bash setup: `\d`, `\b`, `\n` inside
  `node - <<'EOF'` patch scripts arrive wrong (even with a quoted delimiter; `\b` became a literal
  backspace once). For any edit containing regex or escapes, use the Edit tool, or build the
  character with `String.fromCharCode(92)`. After patching, `node --check` and grep for `$'\b'`.
- **The Claude Browser pane is usually hidden**: `requestAnimationFrame` doesn't fire, CSS
  transitions freeze, screenshots come back stale or cropped. Verify with DOM measurements
  (`getBoundingClientRect`, scrollWidth checks at 375px) instead of screenshots; to test animations,
  temporarily replace `requestAnimationFrame` with a `setTimeout` shim in the page.
- Local preview: `.claude/launch.json` defines `site` (python http.server on 8765, serves `site/`).
  After edits, `fetch('app.js',{cache:'reload'})` then reload, or the browser keeps the old file.
- GitHub scheduled runs can start hours late; `gh workflow run update.yml` for an immediate update.
- RAMP tournament calendars keep placeholder names ("Seed 1 vs Seed 4") after games are played —
  real teams come from the game sheets; `events.mjs` remembers which games were playoffs.
- Kreezee (HPL) roster API returns contact/birthday/address fields — the adapter whitelists
  name/number/goalie only. Never widen that.

## Decisions log (owner)
- Primetime theme; dark; jersey colours: home **white**, away **Stars green #006847**.
- Team-level and individual PIM/goalie stats shown (site is password-gated).
- Goalie validation rules: GA must equal opponent score; shots ±25%/3 of shots table; blank minutes
  for a lone goalie = full game; minutes over game length count as entered (flagged); under = excluded.
- Rolling windows are "last 4 games" (≈ one showcase weekend). Standings keep "L5".
- Updates run nightly (games happen on weekdays too) + Monday catch-up.
- Tournaments: owner names events; "Include tournament games" toggle **off by default everywhere**;
  Stars' tournaments shown as a separate team-page section.
- Weekend recap tone rules: first name + last initial, opponents by team only, no negative framing,
  goalies thanked never graded, no penalties by name, every scorer + goalies mentioned.

## Backlog
See `docs/ideas.md` → "Status" for what's built and what's queued.
