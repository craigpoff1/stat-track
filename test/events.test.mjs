// Tournament (RAMP event) parsing: `npm test`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseGame, parseSchedule } from '../scripts/parse.mjs';

const fixture = (f) => fs.readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');

test('tournament sheet with one empty box score: lenient ids for events, strict for the league', () => {
  const html = fixture('event-2034532.html');
  assert.throws(() => parseGame(html, '2034532'), /structure not recognized/); // league mode stays strict
  const g = parseGame(html, '2034532', { lenientTeamIds: true });
  assert.equal(g.home.teamId, 'n:beavers');
  assert.match(g.away.teamId, /^\d+$/);
  assert.ok(g.warnings.some((w) => /no box score/.test(w)));
  assert.equal(g.periods.reduce((n, p) => n + p.home, 0), g.home.score);
});

test('tournament calendar: tournamentgame UIDs and prefixed summaries', () => {
  const ics = [
    'BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'DESCRIPTION:Game #1\\nFinal: 5 - 6', 'DTSTART;TZID=America/Edmonton:20261002T090000',
    'SUMMARY:Pacific Duel (HSL): 2019 Pacific Duel: Bandits vs MOB Hockey', 'UID:tournamentgame-2034531@rampinteractive.com', 'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  const [g] = parseSchedule(ics, '2019 Pacific Duel');
  assert.deepEqual([g.id, g.home, g.away, g.homeScore, g.awayScore, g.final], ['2034531', 'Bandits', 'MOB Hockey', 5, 6, true]);
});

// RAMP dropped the "@rampinteractive.com" suffix from calendar UIDs on 2026-10-18; both forms must parse.
test('calendar UIDs with and without the @domain suffix', () => {
  const ev = (uid) => ['BEGIN:VEVENT', 'DESCRIPTION:Game #146\\nFinal: 1 - 8', 'DTSTART;TZID=America/Edmonton:20260925T163000',
    'SUMMARY:2019 Major: Capital City Knights vs HC Calgary Bandits', `UID:${uid}`, 'END:VEVENT'];
  const ics = ['BEGIN:VCALENDAR', ...ev('leaguegame-2019918'), ...ev('leaguegame-2019922@rampinteractive.com'), ...ev('tournamentgame-2078913'), ...ev('leaguegame-20199x'), 'END:VCALENDAR'].join('\r\n');
  assert.deepEqual(parseSchedule(ics, '2019 Major').map((g) => g.id), ['2019918', '2019922', '2078913']);
});
