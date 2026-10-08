// Fetch the season schedule, then any final games we don't have (or whose score changed).
//   node scripts/scrape.mjs            incremental
//   node scripts/scrape.mjs --all      re-fetch every final game
//   node scripts/scrape.mjs --recent=3 also re-fetch games played in the last 3 days (catches stat corrections)
import fs from 'node:fs/promises';
import path from 'node:path';
import { config, scheduleIcsUrl, gameUrl } from './config.mjs';
import { parseSchedule, parseGame } from './parse.mjs';

const DATA = path.resolve(config.dataDir); // per division (DIVISION=<slug>, see config.mjs)
const GAMES = path.join(DATA, 'games');
const DELAY_MS = 800; // be polite to the league site
const UA = 'stat-track/1.0 (parent-run stats page; https://github.com/craigpoff1/stat-track)';
const RECENT_REFETCH_HOURS = 12; // re-check recent games for stat corrections at most this often

const args = process.argv.slice(2);
const refetchAll = args.includes('--all');
const recentDays = Number((args.find((a) => a.startsWith('--recent=')) || '--recent=2').split('=')[1]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (attempt >= 3) throw new Error(`${url}: ${err.message}`);
      await sleep(2000 * attempt);
    }
  }
}

async function readJson(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return null; }
}

await fs.mkdir(GAMES, { recursive: true });

const schedule = parseSchedule(await get(scheduleIcsUrl()), config.divisionName);
if (!schedule.length) throw new Error('Schedule came back empty — did the calendar URL or format change?');
await fs.writeFile(path.join(DATA, 'schedule.json'), JSON.stringify(schedule, null, 1));
console.log(`schedule: ${schedule.length} games, ${schedule.filter((g) => g.final).length} final`);

const cutoff = new Date(Date.now() - recentDays * 864e5).toISOString().slice(0, 10);
const failuresFile = path.join(DATA, 'failures.json');
const failures = (await readJson(failuresFile)) || {}; // id -> { firstSeen, lastError }
let fetched = 0, failed = 0, structural = 0;
for (const g of schedule.filter((g) => g.final)) {
  const file = path.join(GAMES, `${g.id}.json`);
  const have = await readJson(file);
  const recentAndDue = g.start.slice(0, 10) >= cutoff
    && (!have?.fetchedAt || Date.now() - Date.parse(have.fetchedAt) > RECENT_REFETCH_HOURS * 36e5);
  const stale = !have
    || have.home.score !== g.homeScore || have.away.score !== g.awayScore
    || recentAndDue;
  if (!refetchAll && !stale) continue;
  try {
    const game = parseGame(await get(gameUrl(g.id)), g.id, config);
    if (!game.skaters.length) throw new Error('no box score found on page');
    game.start = g.start;
    game.gameNumber = g.gameNumber;
    game.fetchedAt = new Date().toISOString();
    await fs.writeFile(file, JSON.stringify(game, null, 1));
    delete failures[g.id];
    fetched++;
    const w = game.warnings.length ? `  ⚠ ${game.warnings.join('; ')}` : '';
    console.log(`  ${g.id} ${game.home.name} ${game.home.score}-${game.away.score} ${game.away.name}${w}`);
  } catch (err) {
    failed++;
    if (/structure not recognized/.test(err.message)) structural++;
    failures[g.id] = { firstSeen: failures[g.id]?.firstSeen || new Date().toISOString(), lastError: err.message };
    console.error(`  ${g.id} FAILED: ${err.message}`);
  }
  await sleep(DELAY_MS);
}
await fs.writeFile(failuresFile, JSON.stringify(failures, null, 1));
console.log(`fetched ${fetched} game(s)${failed ? `, ${failed} failed` : ''}`);
// One odd game (forfeit, late game sheet) is recorded and shown on the site as score-only.
// Fail the run — and skip the deploy, keeping the last good site — only when the league
// site itself looks changed.
if (structural >= 2 || (failed >= 3 && !fetched)) {
  console.error('Multiple games failed to parse — the league site layout may have changed.');
  process.exitCode = 1;
}
