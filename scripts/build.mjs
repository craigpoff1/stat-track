// Aggregate data/games/*.json + data/schedule.json into site/data/stats.json.
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.mjs';
import { encryptJson } from './crypto.mjs';

const DATA = path.resolve('data');
const OUT = path.resolve('site/data');

const schedule = JSON.parse(await fs.readFile(path.join(DATA, 'schedule.json'), 'utf8'));
const games = [];
for (const f of await fs.readdir(path.join(DATA, 'games'))) {
  if (f.endsWith('.json')) games.push(JSON.parse(await fs.readFile(path.join(DATA, 'games', f), 'utf8')));
}
games.sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));

const regSec = config.regulationMinutes * 60;
const other = (side) => (side === 'home' ? 'away' : 'home');
// Penalties that give the other team a power play (misconducts don't).
const isPowerPlayPenalty = (e) => e.minutes != null && e.minutes > 0 && e.minutes <= 5;

// ---------------------------------------------------------------- teams
const teams = new Map();
const teamIdByName = new Map();
function team(id, name, logo) {
  if (!teams.has(id)) {
    teams.set(id, {
      id, name, logo: logo || null,
      gp: 0, w: 0, l: 0, t: 0, pts: 0, gf: 0, ga: 0, pim: 0,
      home: { w: 0, l: 0, t: 0 }, away: { w: 0, l: 0, t: 0 },
      ppg: 0, ppo: 0, ppga: 0, tsh: 0, shg: 0, shga: 0,
      sf: 0, sa: 0,
      svShots: 0, svGa: 0, // shots/GA from games that have a Shots table, for team save %
      gfByPeriod: {}, gaByPeriod: {},
      results: [], // 'W' | 'L' | 'T', chronological
    });
    teamIdByName.set(name, id);
  }
  const t = teams.get(id);
  if (logo && !t.logo) t.logo = logo;
  return t;
}

// ---------------------------------------------------------------- players
const players = new Map();
function player(row, teamId, teamName) {
  if (!players.has(row.playerId)) {
    players.set(row.playerId, {
      id: row.playerId, name: row.name, number: row.number, teamId, team: teamName,
      gp: 0, g: 0, a: 0, pts: 0, pim: 0,
      ppg: 0, ppa: 0, shg: 0, sha: 0, gwg: 0, firstGoals: 0,
      isGoalie: false, goalieGames: 0,
      log: [],
    });
  }
  const p = players.get(row.playerId);
  p.number = row.number || p.number; // keep most recent
  p.teamId = teamId; p.team = teamName;
  return p;
}

const goalies = new Map();
function goalie(row, teamId, teamName) {
  if (!goalies.has(row.playerId)) {
    goalies.set(row.playerId, {
      id: row.playerId, name: row.name, number: row.number, teamId, team: teamName,
      gp: 0, seconds: 0, ga: 0, shots: 0, saves: 0, w: 0, l: 0, t: 0, so: 0, log: [],
    });
  }
  return goalies.get(row.playerId);
}

function addResult(t, s, gf, ga, oppId, gameId, date) {
  const r = gf > ga ? 'W' : gf < ga ? 'L' : 'T';
  t.gp++; t.gf += gf; t.ga += ga;
  t[r.toLowerCase()]++; t[s][r.toLowerCase()]++;
  t.pts += r === 'W' ? 2 : r === 'T' ? 1 : 0;
  t.results.push({ gameId, date, r, gf, ga, opp: oppId, home: s === 'home' });
}

const gameSummaries = [];
const dataWarnings = [];

for (const g of games) {
  if (g.status !== 'Final' || !g.home.teamId || !g.away.teamId) {
    dataWarnings.push({ gameId: g.id, message: `skipped: status ${g.status}, teams ${g.home.teamId}/${g.away.teamId}` });
    continue;
  }
  for (const w of g.warnings) dataWarnings.push({ gameId: g.id, message: w });
  const date = g.start.slice(0, 10);
  const side = {
    home: team(g.home.teamId, g.home.name, g.home.logo),
    away: team(g.away.teamId, g.away.name, g.away.logo),
  };

  // Map (side, jersey #) -> playerId so timeline events can be attributed.
  const bySideNumber = new Map();
  // Some timeline entries omit the jersey number, so fall back to the name.
  for (const s of g.skaters) {
    bySideNumber.set(`${s.side}#${s.number}`, s.playerId);
    bySideNumber.set(`${s.side}@${s.name.toLowerCase()}`, s.playerId);
  }
  const pid = (s, who) => (who?.number && bySideNumber.get(`${s}#${who.number}`))
    || (who?.name && bySideNumber.get(`${s}@${who.name.toLowerCase()}`)) || null;

  // --- team results
  for (const s of ['home', 'away']) {
    const t = side[s];
    addResult(t, s, g[s].score, g[other(s)].score, side[other(s)].id, g.id, date);
    for (const p of g.periods) {
      t.gfByPeriod[p.label] = (t.gfByPeriod[p.label] || 0) + p[s];
      t.gaByPeriod[p.label] = (t.gaByPeriod[p.label] || 0) + p[other(s)];
    }
    t.pim += g.skaters.filter((x) => x.side === s).reduce((n, x) => n + x.pim, 0);
    // Shots: the "Shots" by-period table when present; goalie reports are far less complete.
    if (g.shotsByPeriod?.length) {
      t.sf += g.shotsByPeriod.reduce((n, p) => n + p[s], 0);
      t.sa += g.shotsByPeriod.reduce((n, p) => n + p[other(s)], 0);
      // Fewer shots than goals means the scorekeeper stopped tracking shots; leave it out of SV%.
      const shotsAgainst = g.shotsByPeriod.reduce((n, p) => n + p[other(s)], 0);
      if (shotsAgainst >= g[other(s)].score) { t.svShots += shotsAgainst; t.svGa += g[other(s)].score; }
      else dataWarnings.push({ gameId: g.id, message: `${t.name}: ${shotsAgainst} shots against but ${g[other(s)].score} goals — excluded from save %` });
    } else {
      t.sa += g.goalies.filter((x) => x.side === s).reduce((n, x) => n + x.shots, 0);
      t.sf += g.goalies.filter((x) => x.side === other(s)).reduce((n, x) => n + x.shots, 0);
    }
  }
  for (const e of g.events) {
    if (e.type === 'penalty' && isPowerPlayPenalty(e)) {
      side[e.side].tsh++;
      side[other(e.side)].ppo++;
    }
    if (e.type === 'goal') {
      if (e.tags.includes('PPG')) { side[e.side].ppg++; side[other(e.side)].ppga++; }
      if (e.tags.includes('SHG')) { side[e.side].shg++; side[other(e.side)].shga++; }
    }
  }

  // --- skaters
  const perGame = new Map(); // playerId -> game-log entry, so timeline extras land on it
  for (const s of g.skaters) {
    if (!s.playerId) continue;
    const t = side[s.side];
    const p = player(s, t.id, t.name);
    p.gp++; p.g += s.g; p.a += s.a; p.pts += s.g + s.a; p.pim += s.pim;
    const entry = { gameId: g.id, date, opp: side[other(s.side)].id, home: s.side === 'home', g: s.g, a: s.a, pts: s.g + s.a, pim: s.pim, ppg: 0, shg: 0, gwg: 0 };
    p.log.push(entry);
    perGame.set(s.playerId, entry);
  }
  let firstGoal = true;
  for (const e of g.events.filter((x) => x.type === 'goal')) {
    const scorer = players.get(pid(e.side, e.scorer));
    const entry = perGame.get(scorer?.id);
    if (scorer) {
      if (firstGoal) scorer.firstGoals++;
      if (e.tags.includes('PPG')) { scorer.ppg++; entry.ppg++; }
      if (e.tags.includes('SHG')) { scorer.shg++; entry.shg++; }
      if (e.tags.includes('GWG')) { scorer.gwg++; entry.gwg++; }
    }
    firstGoal = false;
    for (const a of e.assists) {
      const ap = players.get(pid(e.side, a));
      if (!ap) continue;
      if (e.tags.includes('PPG')) ap.ppa++;
      if (e.tags.includes('SHG')) ap.sha++;
    }
  }

  // --- goalies. Decision goes to the goalie with the most ice time.
  for (const s of ['home', 'away']) {
    const gs = g.goalies.filter((x) => x.side === s && x.playerId);
    if (!gs.length) continue;
    const t = side[s];
    // No decision when the sheet shows no goalie minutes at all.
    const starter = gs.some((x) => x.seconds > 0) ? gs.reduce((a, b) => (b.seconds > a.seconds ? b : a)) : null;
    for (const row of gs) {
      const gl = goalie(row, t.id, t.name);
      gl.gp++; gl.seconds += row.seconds; gl.ga += row.ga; gl.shots += row.shots; gl.saves += Math.max(0, row.saves);
      const r = row === starter ? (g[s].score > g[other(s)].score ? 'W' : g[s].score < g[other(s)].score ? 'L' : 'T') : null;
      if (r) gl[r.toLowerCase()]++;
      if (row === starter && g[other(s)].score === 0) gl.so++;
      gl.log.push({ gameId: g.id, date, opp: side[other(s)].id, home: s === 'home', seconds: row.seconds, ga: row.ga, shots: row.shots, saves: Math.max(0, row.saves), decision: r });
      const p = players.get(row.playerId);
      if (p) p.goalieGames = (p.goalieGames || 0) + 1;
    }
  }

  gameSummaries.push({
    id: g.id, gameNumber: g.gameNumber, date: g.start, rink: g.rink,
    home: { id: side.home.id, score: g.home.score }, away: { id: side.away.id, score: g.away.score },
    periods: g.periods,
    shotsByPeriod: g.shotsByPeriod || [],
    events: g.events.map((e) => ({
      ...e,
      teamId: side[e.side].id,
      playerId: e.type === 'goal' ? pid(e.side, e.scorer) : pid(e.side, e.player),
      assists: e.assists?.map((a) => ({ ...a, playerId: pid(e.side, a) })),
    })),
    skaters: g.skaters.map(({ side: s, playerId, number, name, g: goals, a, pim }) => ({ teamId: side[s].id, playerId, number, name, g: goals, a, pim })),
    goalies: g.goalies.map(({ side: s, playerId, number, name, seconds, ga, shots, saves }) => ({ teamId: side[s].id, playerId, number, name, seconds, ga, shots, saves })),
    warnings: g.warnings,
  });
}

// Final games with no usable game sheet (forfeit, late sheet, parse failure) still count in
// the standings from the calendar score, so our table never silently drifts from the league's.
const detailIds = new Set(gameSummaries.map((g) => g.id));
const scoreOnly = [];
for (const s of schedule.filter((x) => x.final && !detailIds.has(x.id))) {
  const h = teamIdByName.get(s.home), a = teamIdByName.get(s.away);
  if (!h || !a) { dataWarnings.push({ gameId: s.id, message: `not counted: unknown team ${s.home} / ${s.away}` }); continue; }
  const date = s.start.slice(0, 10);
  addResult(teams.get(h), 'home', s.homeScore, s.awayScore, a, s.id, date);
  addResult(teams.get(a), 'away', s.awayScore, s.homeScore, h, s.id, date);
  for (const t of [teams.get(h), teams.get(a)]) t.results.sort((x, y) => x.date.localeCompare(y.date));
  scoreOnly.push(s.id);
  dataWarnings.push({ gameId: s.id, message: 'counted from the calendar score only — no game sheet available' });
}

// A kid who took one turn in net is still a skater; only pure goalies are hidden from skater lists.
for (const p of players.values()) {
  p.goalieGames = p.goalieGames || 0;
  p.isGoalie = p.goalieGames > 0 && p.goalieGames >= p.gp;
}

// ---------------------------------------------------------------- derived stats
const round = (n, d = 3) => (Number.isFinite(n) ? Math.round(n * 10 ** d) / 10 ** d : null);

function streaks(results, hit) {
  let cur = 0, best = 0;
  for (const r of results) { cur = hit(r) ? cur + 1 : 0; best = Math.max(best, cur); }
  return { current: cur, best };
}

for (const t of teams.values()) {
  t.diff = t.gf - t.ga;
  t.ptsPct = round(t.gp ? t.pts / (t.gp * 2) : 0);
  t.gfPerGame = round(t.gp ? t.gf / t.gp : 0, 2);
  t.gaPerGame = round(t.gp ? t.ga / t.gp : 0, 2);
  t.ppPct = round(t.ppo ? t.ppg / t.ppo : null);
  t.pkPct = round(t.tsh ? 1 - t.ppga / t.tsh : null);
  t.svPct = round(t.svShots ? 1 - t.svGa / t.svShots : null);
  t.last5 = t.results.slice(-5).map((r) => r.r).join('');
  const last = t.results.at(-1);
  if (last) {
    let n = 0;
    for (let i = t.results.length - 1; i >= 0 && t.results[i].r === last.r; i--) n++;
    t.streak = `${last.r}${n}`;
  }
}

for (const p of players.values()) {
  p.ptsPerGame = round(p.gp ? p.pts / p.gp : 0, 2);
  p.multiPointGames = p.log.filter((l) => l.pts >= 2).length;
  p.pointStreak = streaks(p.log, (l) => l.pts > 0);
  p.goalStreak = streaks(p.log, (l) => l.g > 0);
  const t = teams.get(p.teamId);
  p.teamGoalShare = round(t?.gf ? p.pts / t.gf : 0); // share of team goals they had a point on
}

for (const gl of goalies.values()) {
  gl.svPct = round(gl.shots ? gl.saves / gl.shots : null);
  gl.gaa = round(gl.seconds ? (gl.ga * regSec) / gl.seconds : null, 2);
  gl.minutes = Math.round(gl.seconds / 60);
}

const standings = [...teams.values()].sort((a, b) =>
  b.pts - a.pts || b.w - a.w || b.diff - a.diff || b.gf - a.gf || a.name.localeCompare(b.name));
standings.forEach((t, i) => (t.rank = i + 1));

const scheduleOut = schedule.map((s) => ({
  id: s.id, gameNumber: s.gameNumber, start: s.start, end: s.end, location: s.location,
  home: teamIdByName.get(s.home) || s.home, away: teamIdByName.get(s.away) || s.away,
  final: s.final, homeScore: s.homeScore, awayScore: s.awayScore,
  hasDetail: gameSummaries.some((g) => g.id === s.id),
}));

// Published data policy: the site is password-protected (stats.enc.json), so individual penalty
// minutes and goalie stats are included (owner decision 2026-09-28).
const out = {
  meta: {
    updatedAt: new Date().toISOString(),
    league: config.leagueName,
    season: config.seasonName,
    division: config.divisionName,
    myTeamId: String(config.myTeamId),
    sourceUrl: `${config.baseUrl}/division/0/${config.divisionId}/masterschedule`,
    gamesPlayed: gameSummaries.length + scoreOnly.length,
    scoreOnlyGames: scoreOnly,
    gamesScheduled: schedule.length,
    regulationMinutes: config.regulationMinutes,
  },
  teams: standings,
  players: [...players.values()],
  goalies: [...goalies.values()],
  games: gameSummaries,
  schedule: scheduleOut,
  dataWarnings,
};

// Never deploy a hollowed-out season: if the schedule has finals but we built nothing, fail.
const finals = schedule.filter((x) => x.final).length;
if (finals && gameSummaries.length === 0) {
  console.error(`Refusing to build: ${finals} final games in the schedule but 0 usable game sheets.`);
  process.exit(1);
}

await fs.mkdir(OUT, { recursive: true });
// With SITE_PASSWORD set, publish only the encrypted file. CI must never publish plaintext.
const password = process.env.SITE_PASSWORD;
const plainFile = path.join(OUT, 'stats.json'), encFile = path.join(OUT, 'stats.enc.json');
if (password) {
  await fs.writeFile(encFile, JSON.stringify(await encryptJson(JSON.stringify(out), password)));
  await fs.rm(plainFile, { force: true });
} else if (process.env.CI) {
  console.error('SITE_PASSWORD is not set — refusing to publish unencrypted stats.');
  process.exit(1);
} else {
  await fs.writeFile(plainFile, JSON.stringify(out)); // local dev only
  await fs.rm(encFile, { force: true });
}
console.log(`built: ${standings.length} teams, ${players.size} players, ${goalies.size} goalies, ${gameSummaries.length} games, ${dataWarnings.length} data warnings`);
for (const t of standings) console.log(`  ${String(t.rank).padStart(2)} ${t.name.padEnd(28)} ${t.gp} ${t.w}-${t.l}-${t.t} ${String(t.pts).padStart(2)}pts GF ${t.gf} GA ${t.ga} PIM ${t.pim}`);
