// Fetch tournament ("event") data and opponent-league background data.
//   node scripts/events.mjs          incremental
//   node scripts/events.mjs --all    re-fetch every final event game sheet
// Writes data/events/<event>/{schedule.json,games/<id>.json} and data/leagues/<league>.json.
// Never fails the overall update — a broken source keeps its last saved copy.
import fs from 'node:fs/promises';
import path from 'node:path';
import { events, externalLeagues } from './events.config.mjs';
import { parseSchedule, parseGame } from './parse.mjs';

const UA = 'stat-track/1.0 (parent-run stats page; https://github.com/craigpoff1/stat-track)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const refetchAll = process.argv.includes('--all');
const readJson = async (f) => { try { return JSON.parse(await fs.readFile(f, 'utf8')); } catch { return null; } };

async function get(url, as = 'text') {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return as === 'json' ? await res.json() : await res.text();
    } catch (err) {
      if (attempt >= 3) throw new Error(`${url}: ${err.message}`);
      await sleep(1500 * attempt);
    }
  }
}

// ---------------------------------------------------------------- RAMP tournament sites
const PLACEHOLDER = /\b(seed|winner|loser|sf|semi|final|tbd|tba|high|low)\b/i;
async function rampEvent(ev) {
  const dir = path.resolve('data/events', ev.id), gdir = path.join(dir, 'games');
  await fs.mkdir(gdir, { recursive: true });
  const prev = (await readJson(path.join(dir, 'schedule.json'))) || [];
  const prevById = new Map(prev.map((g) => [g.id, g]));
  const schedule = parseSchedule(await get(ev.calendar), ev.divisionName).map((g) => {
    const before = prevById.get(g.id);
    // playoff games are posted as "Seed 1 vs Seed 4" until the round robin ends; remember that
    const playoff = before?.playoff || PLACEHOLDER.test(`${g.home} ${g.away}`);
    return { ...g, playoff };
  });
  if (!schedule.length) throw new Error('empty schedule');
  await fs.writeFile(path.join(dir, 'schedule.json'), JSON.stringify(schedule, null, 1));
  let fetched = 0;
  for (const g of schedule.filter((x) => x.final)) {
    const file = path.join(gdir, `${g.id}.json`), have = await readJson(file);
    const stale = !have || have.home.score !== g.homeScore || have.away.score !== g.awayScore
      || Date.now() - Date.parse(have.fetchedAt || 0) < 3 * 864e5 && Date.now() - Date.parse(have.fetchedAt || 0) > 6 * 36e5;
    if (!refetchAll && !stale) continue;
    try {
      const game = parseGame(await get(`${ev.base}/division/0/${ev.divisionId}/game/view/${g.id}`), g.id, { lenientTeamIds: true });
      Object.assign(game, { start: g.start, gameNumber: g.gameNumber, playoff: g.playoff, fetchedAt: new Date().toISOString() });
      await fs.writeFile(file, JSON.stringify(game, null, 1));
      fetched++;
    } catch (err) { console.error(`  ${ev.name} game ${g.id}: ${err.message}`); }
    await sleep(700);
  }
  console.log(`${ev.name}: ${schedule.length} games (${schedule.filter((x) => x.final).length} final), fetched ${fetched}`);
}

// ---------------------------------------------------------------- Kreezee leagues (HPL)
async function kreezee(src) {
  const api = `${src.base}/api/v2/solutions/${src.solutionId}`;
  const schedule = await get(`${api}/seasons/${src.seasonId}/schedule?startDate=${src.seasonStart}%2000:00:00&endDate=${src.seasonEnd}%2023:59:59`, 'json');
  if (!Array.isArray(schedule)) throw new Error('schedule is not a list — has the feed changed?');
  const div = schedule.filter((g) => g.LocalDivisionId === src.divisionId || g.VisitorDivisionId === src.divisionId);
  if (!div.length) throw new Error(`no games for division ${src.divisionId}`);
  const teams = new Map();
  const addTeam = (id, name, logo) => { if (!teams.has(id)) teams.set(id, { id: `${src.id}:${id}`, sourceId: id, name, logo: logo || null }); };
  const games = div.map((g) => {
    addTeam(g.LocalTeamId, g.LocalTeamName, g.LocalTeamAvatar);
    addTeam(g.VisitorTeamId, g.VisitorTeamName, g.VisitorTeamAvatar);
    const final = !!g.Final && g.StatusId === 3;
    return {
      id: `${src.id}:${g.Id}`, start: `${g.Date.slice(0, 10)}T${g.StartTime || '00:00:00'}`,
      rink: [g.SportCenterName, g.Note].filter(Boolean).join(' · ') || null,
      home: `${src.id}:${g.LocalTeamId}`, away: `${src.id}:${g.VisitorTeamId}`,
      final, homeScore: final ? g.LocalResult : null, awayScore: final ? g.VisitorResult : null,
      url: `${src.base}/scores/game-${g.Id}`,
    };
  }).sort((a, b) => a.start.localeCompare(b.start));
  for (const t of teams.values()) {
    await sleep(400);
    const lineup = await get(`${api}/teams/${t.sourceId}/lineup/active`, 'json').catch(() => []);
    // whitelist — the feed also carries contact/birthday/address fields that must never be stored
    t.roster = (Array.isArray(lineup) ? lineup : []).flatMap((cat) => (cat.Players || []).map((p) => ({
      name: [p.FirstName, p.LastName].filter(Boolean).join(' ').trim() || p.Name || null,
      number: p.Number || null,
      goalie: /goal|gardien/i.test(`${p.Position || ''} ${cat.Name || ''}`),
    }))).filter((p) => p.name).sort((a, b) => (Number(a.number) || 999) - (Number(b.number) || 999));
    t.url = `${src.base}/teams/${t.sourceId}`;
    delete t.sourceId;
  }
  const out = {
    source: { id: src.id, league: src.league, region: src.region, division: src.divisionName, url: src.base, platform: 'Kreezee' },
    fetchedAt: new Date().toISOString(), detail: 'scores-only', teams: [...teams.values()], games,
  };
  await fs.mkdir(path.resolve('data/leagues'), { recursive: true });
  await fs.writeFile(path.resolve('data/leagues', `${src.id}.json`), JSON.stringify(out, null, 1));
  console.log(`${src.league} ${src.divisionName}: ${out.teams.length} teams, ${games.length} games (${games.filter((g) => g.final).length} final)`);
}

let failed = 0;
for (const lg of externalLeagues) {
  try { if (lg.adapter === 'kreezee') await kreezee(lg); } catch (err) { failed++; console.error(`${lg.league}: FAILED — ${err.message}`); }
}
for (const ev of events.filter((e) => e.platform === 'ramp')) {
  try { await rampEvent(ev); } catch (err) { failed++; console.error(`${ev.name}: FAILED — ${err.message}`); }
}
if (failed) console.error(`${failed} event/league source(s) failed — last saved copies kept`);
