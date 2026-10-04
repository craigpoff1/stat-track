// Parsers for the two sources: the season .ics calendar and a single game page.
import * as cheerio from 'cheerio';

const clean = (s) => (s ?? '').replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------- schedule (.ics)

function unfoldIcs(text) {
  // RFC 5545: continuation lines start with a space or tab.
  return text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
}

function icsUnescape(v) {
  return v.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
}

// "20260927T080000" (local, TZID given) -> "2026-09-27T08:00:00"
function icsLocal(v) {
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}` : v;
}

export function parseSchedule(icsText, divisionName) {
  const events = [];
  for (const block of unfoldIcs(icsText).split('BEGIN:VEVENT').slice(1)) {
    const body = block.split('END:VEVENT')[0];
    const f = {};
    for (const line of body.split('\n')) {
      const m = line.match(/^([A-Z-]+)(?:;[^:]*)?:(.*)$/);
      if (m) f[m[1]] = icsUnescape(m[2]);
    }
    const idMatch = (f.UID || '').match(/(?:league|tournament)game-(\d+)@/);
    if (!idMatch) continue; // non-game calendar events
    let summary = f.SUMMARY || '';
    // league: "2019 Major: A vs B"; tournament: "Pacific Duel (HSL): 2019 Pacific Duel: A vs B"
    if (summary.includes(': ')) summary = summary.slice(summary.lastIndexOf(': ') + 2);
    const [home, away] = summary.split(' vs ').map(clean);
    const desc = f.DESCRIPTION || '';
    const final = desc.match(/Final:\s*(\d+)\s*-\s*(\d+)/);
    const gameNo = desc.match(/Game #(\d+)/);
    events.push({
      id: idMatch[1],
      gameNumber: gameNo ? Number(gameNo[1]) : null,
      start: icsLocal(f.DTSTART || ''),
      end: icsLocal(f.DTEND || ''),
      location: clean((f.LOCATION || '').split(',')[0]),
      home: home || null,
      away: away || null,
      final: !!final,
      homeScore: final ? Number(final[1]) : null,
      awayScore: final ? Number(final[2]) : null,
    });
  }
  return events.sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
}

// ---------------------------------------------------------------- game page

const PLAYER_HREF = /\/team\/\d+\/\d+\/\d+\/(\d+)\/player\/(\d+)/;

function parseMmSs(s) {
  const m = clean(s).match(/^(\d+):(\d+)$/);
  return m ? { min: Number(m[1]), sec: Number(m[2]) } : null;
}

// "#66 Tucker Dorran (1)" -> { number: '66', name: 'Tucker Dorran' }
function parseCardPlayer(s) {
  const m = clean(s).match(/^#?(\d+)?\s*(.*?)\s*(?:\(\d+\))?$/);
  return { number: m?.[1] ?? null, name: clean(m?.[2] ?? s) };
}

function headerCells($, table) {
  return $(table).find('thead th').map((_, th) => clean($(th).text())).get();
}

export function parseGame(html, id, { regulationMinutes = 45, lenientTeamIds = false } = {}) {
  const $ = cheerio.load(html);
  const warnings = [];

  // --- header: date, rink, teams, score, status
  const dateText = clean($('.link-game-date-time').first().text());
  const rink = clean($('.link-rinkdb-text').first().text());
  const teamCells = $('.grid-cols-3.link-table-game-teamname > .link-table-game-teamname');
  const teamNames = teamCells.map((_, el) => clean($(el).children('div').first().text())).get();
  const logos = teamCells.map((_, el) => $(el).find('img').attr('src') || null).get();
  const scoreText = clean($('.grid-cols-3.link-table-game-teamname .font-title .block').first().text());
  const status = clean($('.game-page-marker').first().text()) || null;
  const sm = scoreText.match(/(\d+)\s*-\s*(\d+)/);

  const game = {
    id: String(id),
    dateText,
    rink,
    status,
    home: { name: teamNames[0] ?? null, teamId: null, logo: logos[0] ?? null, score: sm ? Number(sm[1]) : null },
    away: { name: teamNames[1] ?? null, teamId: null, logo: logos[1] ?? null, score: sm ? Number(sm[2]) : null },
    periods: [],   // [{ label, home, away }]
    events: [],    // goals + penalties in order
    skaters: [],   // box score rows
    goalies: [],
    warnings,
  };

  // --- box score + goalie tables. Each follows an h1.card-title-table with the team name.
  $('table').each((_, table) => {
    const heads = headerCells($, table);
    const isSkater = heads.includes('PIM') && heads.includes('PTS');
    const isGoalie = heads.includes('Sav%') || heads.includes('Saves');
    if (!isSkater && !isGoalie) return;
    const teamName = clean($(table).closest('.card-title-container').find('h1.card-title-table').first().text());
    const side = teamName.toLowerCase() === (game.home.name || '').toLowerCase() ? 'home'
      : teamName.toLowerCase() === (game.away.name || '').toLowerCase() ? 'away' : null;
    if (!side) warnings.push(`table for unknown team "${teamName}"`);
    const col = (name) => heads.indexOf(name);

    $(table).find('tbody tr').each((_, tr) => {
      const tds = $(tr).find('td');
      const cell = (i) => (i < 0 ? '' : clean($(tds[i]).text()));
      const link = $(tr).find('a[href*="/player/"]').attr('href') || '';
      const lm = link.match(PLAYER_HREF);
      const teamId = lm ? lm[1] : null;
      if (side && teamId && !game[side].teamId) game[side].teamId = teamId;
      const base = { side, teamId, playerId: lm ? lm[2] : null, number: cell(col('#')) || null, name: cell(col('Name')) };
      if (isSkater) {
        game.skaters.push({ ...base, g: +cell(col('G')) || 0, a: +cell(col('A')) || 0, pts: +cell(col('PTS')) || 0, pim: +cell(col('PIM')) || 0 });
      } else {
        const mp = parseMmSs(cell(col('MP')));
        game.goalies.push({
          ...base,
          seconds: mp ? mp.min * 60 + mp.sec : 0,
          ga: +cell(col('GA')) || 0,
          shots: +cell(col('Shots')) || 0,
          saves: +cell(col('Saves')) || 0,
        });
      }
    });
  });

  // --- by-period tables. Two share the "Team | 1 | 2 | 3 | T" shape: "Scoring" and "Shots".
  game.shotsByPeriod = [];
  $('table').each((_, table) => {
    const heads = headerCells($, table);
    if (heads[0] !== 'Team' || !heads.includes('T')) return;
    const title = clean($(table).closest('.card-title-container').find('h1.card-title-table').first().text()).toLowerCase();
    const target = title === 'scoring' ? game.periods : title === 'shots' ? game.shotsByPeriod : null;
    if (!target) { warnings.push(`unrecognized by-period table "${title}"`); return; }
    const labels = heads.slice(1, heads.indexOf('T'));
    const rows = {};
    $(table).find('tbody tr').each((_, tr) => {
      const cells = $(tr).find('td').map((_, td) => clean($(td).text())).get().filter(Boolean);
      const s = cells[0] === game.home.name ? 'home' : cells[0] === game.away.name ? 'away' : null;
      if (s) rows[s] = cells;
    });
    if (!rows.home || !rows.away) { warnings.push(`${title} table rows don't match team names`); return; }
    labels.forEach((label, i) => {
      target.push({ label, home: Number(rows.home[i + 1] ?? 0), away: Number(rows.away[i + 1] ?? 0) });
    });
  });

  // --- timeline. Walk period headers and cards in document order.
  let period = null;
  const timeline = $('h1.card-title-table').filter((_, h) => clean($(h).text()) === 'Game Timeline').first().parent();
  timeline.find('h2.card-subtitle-table, .game-summary-card').each((_, el) => {
    const $el = $(el);
    if (el.tagName === 'h2') { period = clean($el.text()).replace(/^Period\s+/i, ''); return; }
    const side = $el.find('.game-home-away').hasClass('game-home') ? 'home' : 'away';
    const teamName = clean($el.find('.game-summary-card-subtitle').first().text());
    const who = parseCardPlayer($el.find('.game-summary-card-title').first().text());
    const boxes = {};
    $el.find('.game-summary-card-goal .box').each((_, b) => {
      boxes[clean($(b).find('.header').text()).toLowerCase()] = $(b);
    });
    const time = clean(boxes.time?.find('.time').text());
    const t = parseMmSs(time);
    if (time && (!t || t.sec > 59)) warnings.push(`invalid clock time "${time}" in period ${period}`);

    const penaltyEl = $el.find('.game-penalty');
    if (penaltyEl.length) {
      const dur = parseMmSs(penaltyEl.text());
      game.events.push({
        type: 'penalty', period, time, side, team: teamName,
        player: who,
        minutes: dur ? dur.min + dur.sec / 60 : null,
        infraction: clean(boxes.penalty?.find('.time').text()) || null,
      });
    } else {
      const tags = $el.find('span.goal, span.goal-team').map((_, s) => clean($(s).text())).get().filter((x) => x && x !== 'Goal');
      const assists = $el.find('.game-summary-card-subtitle span').map((_, s) => parseCardPlayer($(s).text())).get();
      game.events.push({ type: 'goal', period, time, side, team: teamName, scorer: who, assists, tags });
    }
  });

  // --- structural checks. Throw rather than return a degraded game: a markup change on the
  // league site must fail the run loudly, not overwrite good data with nulls.
  // Tournament sheets sometimes leave one team's box score empty (no player links to identify the
  // team); there, fall back to a name-based id. League sheets stay strict.
  if (lenientTeamIds) for (const s of ['home', 'away']) {
    if (!game[s].teamId && game[s].name) {
      game[s].teamId = 'n:' + game[s].name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      warnings.push(`${s}: no box score on the sheet (team identified by name)`);
    }
  }
  const missing = [];
  if (!game.status) missing.push('status');
  for (const s of ['home', 'away']) {
    if (!game[s].name) missing.push(`${s} name`);
    if (!game[s].teamId) missing.push(`${s} teamId`);
    if (game[s].score == null) missing.push(`${s} score`);
  }
  if (missing.length) throw new Error(`page structure not recognized (missing ${missing.join(', ')})`);

  // --- consistency checks against the official final
  for (const side of ['home', 'away']) {
    const final = game[side].score;
    const per = game.periods.reduce((n, p) => n + p[side], 0);
    if (game.periods.length && per !== final) warnings.push(`${side}: periods sum to ${per}, final is ${final}`);
    const box = game.skaters.filter((s) => s.side === side).reduce((n, s) => n + s.g, 0);
    const tl = game.events.filter((e) => e.type === 'goal' && e.side === side).length;
    if (tl !== final) warnings.push(`${side}: timeline has ${tl} goals, final is ${final}`);
    if (box !== final) warnings.push(`${side}: box score has ${box} goals, final is ${final}`);
    const gSec = game.goalies.filter((g) => g.side === side).reduce((n, g) => n + g.seconds, 0);
    if (gSec && gSec !== regulationMinutes * 60) warnings.push(`${side}: goalie minutes total ${Math.round(gSec / 60)}`);
  }
  return game;
}
