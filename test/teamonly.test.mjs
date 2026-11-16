// HSL stopped publishing player names (mid-Nov 2026): game pages keep scores, shots and a
// goal/penalty timeline, but no box score, goalie lines or names. `npm test`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseGame, dropsPlayerDetail } from '../scripts/parse.mjs';

const page = fs.readFileSync(new URL('./fixtures/hsl-teamonly-2020461.html', import.meta.url), 'utf8');
const full = fs.readFileSync(new URL('./fixtures/game-2019918.html', import.meta.url), 'utf8');
const ids = { 'Stars Hockey Academy': '402384', 'Young Kings Hockey': '402392' };

test('team-only page: scores, shots and timeline parse, with no player credited', () => {
  const g = parseGame(page, '2020461', { teamIdByName: ids });
  assert.equal(g.teamOnly, true);
  assert.equal(g.status, 'Final');
  assert.deepEqual([g.home.teamId, g.home.score, g.away.teamId, g.away.score], ['402384', 6, '402392', 1]);
  assert.deepEqual(g.periods.map((p) => [p.home, p.away]), [[2, 1], [1, 0], [3, 0]]);
  assert.deepEqual(g.shotsByPeriod.map((p) => [p.home, p.away]), [[2, 7], [8, 16], [4, 10]]);
  const goals = g.events.filter((e) => e.type === 'goal'), pens = g.events.filter((e) => e.type === 'penalty');
  assert.deepEqual(goals.map((e) => `${e.period} ${e.time} ${e.side}`), ['1 14:40 away', '1 13:06 home', '1 03:00 home', '2 13:21 home', '3 10:05 home', '3 01:42 home', '3 00:56 home']);
  assert.deepEqual(goals.map((e) => e.tags.join()), ['', '', 'GWG', '', '', '', 'SHG']);
  assert.equal(pens.length, 6);
  assert.ok(pens.every((e) => e.minutes === 2 && e.infraction), 'penalty minutes + infraction kept');
  // "Bench Penalty" is the league's placeholder title, never a player
  assert.ok(goals.every((e) => e.scorer === null && e.assists.length === 0), 'no scorer on goals');
  assert.ok(pens.every((e) => e.player === null), 'no player on penalties');
  assert.ok(!g.warnings.some((w) => /box score/.test(w)), `no box-score noise: ${g.warnings}`);
});

test('team-only mode needs the name map and is strict about who the teams are', () => {
  assert.throws(() => parseGame(page, '2020461'), /missing home teamId, away teamId/);
  assert.throws(() => parseGame(page, '2020461', { teamIdByName: { 'Stars Hockey Academy': '402384' } }), /missing away teamId/);
  const hollow = page.replace(/<h1[^>]*card-title-table[^>]*>\s*Scoring\s*<\/h1>/, '<h1 class="card-title-table">Renamed</h1>');
  assert.throws(() => parseGame(hollow, '2020461', { teamIdByName: ids }), /no scoring by period/);
});

test('a full sheet ignores the name map and keeps its box score', () => {
  const g = parseGame(full, '2019918', { teamIdByName: { 'Capital City Knights': 'WRONG', 'HC Calgary Bandits': 'WRONG' } });
  assert.equal(g.teamOnly, false);
  assert.ok(g.skaters.length > 0 && g.home.teamId !== 'WRONG' && g.away.teamId !== 'WRONG');
});

test('a team-only copy never replaces a saved game that has player detail', () => {
  const detailed = parseGame(full, '2019918');
  const teamOnly = parseGame(page, '2020461', { teamIdByName: ids });
  assert.equal(dropsPlayerDetail(detailed, teamOnly), true);
  assert.equal(dropsPlayerDetail(null, teamOnly), false, 'new game: write it');
  assert.equal(dropsPlayerDetail(teamOnly, teamOnly), false, 'team-only over team-only: refresh it');
  assert.equal(dropsPlayerDetail(detailed, detailed), false, 'full over full: refresh it');
  // decided on the data, not the teamOnly flag: a partial strip must not slip past
  assert.equal(dropsPlayerDetail(detailed, { ...detailed, teamOnly: false, skaters: [] }), true, 'goalies kept, box score gone');
  assert.equal(dropsPlayerDetail(detailed, { ...detailed, teamOnly: false, goalies: [] }), true, 'box score kept, goalies gone');
  assert.equal(dropsPlayerDetail(detailed, { ...detailed, skaters: detailed.skaters.filter((r) => r.side === 'home') }), true, 'one side stripped');
});

test('a changed layout is rejected, not saved as a team-only game', () => {
  // box-score headers renamed: no tables recognised, but the timeline still names players
  const renamed = full.replaceAll('>PIM<', '>PEN<').replaceAll('>Saves<', '>SV<').replaceAll('>Sav%<', '>SV%<');
  const fullIds = { 'Capital City Knights': '402386', 'HC Calgary Bandits': '402385' };
  assert.throws(() => parseGame(renamed, '2019918', { teamIdByName: fullIds }), /name a player/);
  // penalty cards no longer recognised: they'd read as goals titled "Bench Penalty" — rejected
  const noPen = page.replaceAll('game-penalty', 'renamed-penalty');
  assert.throws(() => parseGame(noPen, '2020461', { teamIdByName: ids }), /structure not recognized/);
  // the timeline is the only source of PIM and PP/PK, so it must account for every goal
  const offByOne = page.replace('~text-4xl/6xl">6 - 1<', '~text-4xl/6xl">7 - 1<');
  assert.throws(() => parseGame(offByOne, '2020461', { teamIdByName: ids }), /timeline has 6 home goals, final is 7/);
});
