// Fetch the season schedule, then any final games we don't have (or whose score changed).
//   node scripts/scrape.mjs            incremental
//   node scripts/scrape.mjs --all      re-fetch every final game
//   node scripts/scrape.mjs --recent=3 also re-fetch games played in the last 3 days (catches stat corrections)
import fs from 'node:fs/promises';
import path from 'node:path';
import { config, scheduleIcsUrl, gameUrl } from './config.mjs';
import { parseSchedule, parseGame } from './parse.mjs';

const DATA = path.resolve('data');
const GAMES = path.join(DATA, 'games');
const DELAY_MS = 800; // be polite to the league site
const UA = 'stat-track/1.0 (parent-run stats page; contact via GitHub)';

const args = process.argv.slice(2);
const refetchAll = args.includes('--all');
const recentDays = Number((args.find((a) => a.startsWith('--recent=')) || '--recent=2').split('=')[1]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
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
let fetched = 0, failed = 0;
for (const g of schedule.filter((g) => g.final)) {
  const file = path.join(GAMES, `${g.id}.json`);
  const have = await readJson(file);
  const stale = !have
    || have.home.score !== g.homeScore || have.away.score !== g.awayScore
    || g.start.slice(0, 10) >= cutoff;
  if (!refetchAll && !stale) continue;
  try {
    const game = parseGame(await get(gameUrl(g.id)), g.id, config);
    if (!game.skaters.length) throw new Error('no box score found on page');
    game.start = g.start;
    game.gameNumber = g.gameNumber;
    await fs.writeFile(file, JSON.stringify(game, null, 1));
    fetched++;
    const w = game.warnings.length ? `  ⚠ ${game.warnings.join('; ')}` : '';
    console.log(`  ${g.id} ${game.home.name} ${game.home.score}-${game.away.score} ${game.away.name}${w}`);
  } catch (err) {
    failed++;
    console.error(`  ${g.id} FAILED: ${err.message}`);
  }
  await sleep(DELAY_MS);
}
console.log(`fetched ${fetched} game(s)${failed ? `, ${failed} failed` : ''}`);
if (failed && !fetched) process.exitCode = 1;
