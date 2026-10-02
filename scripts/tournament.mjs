// Fetch opponent-league data for the one-off tournament area → data/tournament/<source>.json
//   node scripts/tournament.mjs
// Kreezee (HPL) publishes schedule, final scores, rinks and rosters — no scorers, shots, penalties
// or goalie stats — so this is team-level data only. Rosters keep name / number / position ONLY:
// the feed also carries contact fields (email, birthday, address) that must never be stored.
import fs from 'node:fs/promises';
import path from 'node:path';
import { tournament } from './tournament.config.mjs';

const OUT = path.resolve('data/tournament');
const UA = 'stat-track/1.0 (parent-run stats page; https://github.com/craigpoff1/stat-track)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt >= 3) throw new Error(`${url}: ${err.message}`);
      await sleep(1500 * attempt);
    }
  }
}

async function kreezee(src) {
  const api = `${src.base}/api/v2/solutions/${src.solutionId}`;
  const schedule = await getJson(`${api}/seasons/${src.seasonId}/schedule?startDate=${src.seasonStart}%2000:00:00&endDate=${src.seasonEnd}%2023:59:59`);
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
      id: `${src.id}:${g.Id}`,
      start: `${g.Date.slice(0, 10)}T${g.StartTime || '00:00:00'}`,
      rink: [g.SportCenterName, g.Note].filter(Boolean).join(' · ') || null,
      home: `${src.id}:${g.LocalTeamId}`,
      away: `${src.id}:${g.VisitorTeamId}`,
      final,
      homeScore: final ? g.LocalResult : null,
      awayScore: final ? g.VisitorResult : null,
      url: `${src.base}/scores/game-${g.Id}`,
    };
  }).sort((a, b) => a.start.localeCompare(b.start));

  for (const t of teams.values()) {
    await sleep(400);
    const lineup = await getJson(`${api}/teams/${t.sourceId}/lineup/active`).catch(() => []);
    t.roster = (Array.isArray(lineup) ? lineup : []).flatMap((cat) => (cat.Players || []).map((p) => ({
      // whitelist — never copy contact/birthday/address fields
      name: [p.FirstName, p.LastName].filter(Boolean).join(' ').trim() || p.Name || null,
      number: p.Number || null,
      goalie: /goal|gardien/i.test(`${p.Position || ''} ${cat.Name || ''}`),
    }))).filter((p) => p.name).sort((a, b) => (Number(a.number) || 999) - (Number(b.number) || 999));
    t.url = `${src.base}/teams/${t.sourceId}`;
    delete t.sourceId;
  }
  return {
    source: { id: src.id, league: src.league, region: src.region, division: src.divisionName, url: src.base, platform: 'Kreezee' },
    fetchedAt: new Date().toISOString(),
    detail: 'scores-only', // no scorers, shots, penalties or goalie stats published
    teams: [...teams.values()],
    games,
  };
}

const ADAPTERS = { kreezee };

await fs.mkdir(OUT, { recursive: true });
let failed = 0;
for (const src of tournament.sources) {
  try {
    const data = await ADAPTERS[src.adapter](src);
    await fs.writeFile(path.join(OUT, `${src.id}.json`), JSON.stringify(data, null, 1));
    const finals = data.games.filter((g) => g.final).length;
    console.log(`${src.league} ${src.divisionName}: ${data.teams.length} teams, ${data.games.length} games (${finals} final), ${data.teams.reduce((n, t) => n + t.roster.length, 0)} rostered players`);
  } catch (err) {
    failed++;
    console.error(`${src.league}: FAILED — ${err.message} (keeping the last saved copy)`);
  }
}
// Never fail the whole update over a one-off tournament source.
if (failed) console.error(`${failed} tournament source(s) failed`);
