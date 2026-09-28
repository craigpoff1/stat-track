// Regression tests against saved league pages: `npm test`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseGame } from '../scripts/parse.mjs';

const fixture = (id) => fs.readFileSync(new URL(`./fixtures/game-${id}.html`, import.meta.url), 'utf8');

for (const id of ['2019918', '2019965']) {
  test(`game ${id}: scoring, shots and box score agree with the final`, () => {
    const g = parseGame(fixture(id), id);
    assert.equal(g.status, 'Final');
    assert.ok(g.home.teamId && g.away.teamId);
    for (const s of ['home', 'away']) {
      assert.equal(g.periods.reduce((n, p) => n + p[s], 0), g[s].score, `${s} periods sum`);
      assert.equal(g.events.filter((e) => e.type === 'goal' && e.side === s).length, g[s].score, `${s} timeline goals`);
      assert.equal(g.skaters.filter((p) => p.side === s).reduce((n, p) => n + p.g, 0), g[s].score, `${s} box goals`);
    }
    assert.equal(g.periods.length, 3, 'scoring table only — shots must not leak in');
    assert.ok([0, 3].includes(g.shotsByPeriod.length), 'shots table is optional (some sheets omit it)');
  });
}

test('a league markup change fails loudly instead of returning a hollow game', () => {
  const broken = fixture('2019918').replaceAll('link-table-game-teamname', 'renamed-class');
  assert.throws(() => parseGame(broken, '2019918'), /structure not recognized/);
  const noStatus = fixture('2019918').replaceAll('game-page-marker', 'renamed-marker');
  assert.throws(() => parseGame(noStatus, '2019918'), /missing status/);
});
