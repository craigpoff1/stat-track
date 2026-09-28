// Stat Track — renders site/data/stats.json. No framework; hash routes.
(() => {
  'use strict';

  let S; // stats.json
  const $app = document.getElementById('app');
  const teamById = new Map();
  const playerById = new Map();
  const gameById = new Map();

  // ------------------------------------------------------------ utils
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem('st:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('st:' + k, JSON.stringify(v)); } catch { /* private mode */ } },
  };
  // "2026-09-27T08:00:00" is local rink time; parse without timezone shifting.
  function localDate(s) {
    const [d, t = '00:00:00'] = s.split('T');
    const [y, m, day] = d.split('-').map(Number);
    const [h, mi] = t.split(':').map(Number);
    return new Date(y, m - 1, day, h, mi);
  }
  const fmtDay = (s) => localDate(s).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const fmtTime = (s) => localDate(s).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const pct = (v, d = 3) => (v == null ? '–' : v.toFixed(d).replace(/^0\./, '.'));
  const pct100 = (v) => (v == null ? '–' : Math.round(v * 100) + '%');
  const num = (v, d = 2) => (v == null ? '–' : Number(v).toFixed(d));

  const myTeamId = () => store.get('myTeam', S.meta.myTeamId);
  const favPlayers = () => new Set(store.get('favPlayers', []));

  const team = (id) => teamById.get(String(id));
  const teamName = (id) => team(id)?.name ?? id;
  function teamCell(id, { link = true, short = false } = {}) {
    const t = team(id);
    if (!t) return esc(id);
    const img = t.logo ? `<img src="${esc(t.logo)}" alt="" loading="lazy">` : '';
    const name = esc(short ? shortName(t.name) : t.name);
    return link ? `<a class="team-cell" href="#/team/${t.id}">${img}<span>${name}</span></a>` : `<span class="team-cell">${img}<span>${name}</span></span>`;
  }
  const shortName = (n) => n.replace(/\s+(Hockey Academy|Hockey Club|Hockey|Academy)$/i, '');
  const playerLink = (id, name) => (id && playerById.has(id) ? `<a href="#/player/${id}">${esc(name)}</a>` : esc(name));
  const form = (s) => `<span class="form">${[...(s || '')].map((r) => `<span class="${r}">${r}</span>`).join('')}</span>`;

  // ------------------------------------------------------------ sortable tables
  // cols: [{ key, label, fmt?(row), sortVal?(row), cls?, noSort?, desc? (default sort direction desc) }]
  const tableState = new Map();
  const currentDefaults = new Map();
  function table(id, cols, rows, { sort, rowClass, rank = false, limit } = {}) {
    if (sort) currentDefaults.set(id, sort);
    const st = tableState.get(id) || sort || {};
    const col = cols.find((c) => c.key === st.key);
    let data = rows.slice();
    if (col) {
      const val = col.sortVal || ((r) => r[col.key]);
      data.sort((a, b) => {
        const va = val(a), vb = val(b);
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        const c = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
        return st.desc ? -c : c;
      });
    }
    if (limit) data = data.slice(0, limit);
    const head = (rank ? '<th class="rank"></th>' : '') + cols.map((c) => {
      const cls = [c.cls, c.noSort ? '' : 'sortable', st.key === c.key ? 'sorted' : '', st.key === c.key && !st.desc ? 'asc' : ''].filter(Boolean).join(' ');
      return `<th class="${cls}" ${c.noSort ? '' : `data-t="${id}" data-k="${c.key}"`} ${c.title ? `title="${esc(c.title)}"` : ''}>${esc(c.label)}</th>`;
    }).join('');
    const body = data.length ? data.map((r, i) => `<tr class="${rowClass ? rowClass(r) : ''}">${rank ? `<td class="rank">${i + 1}</td>` : ''}${cols.map((c) =>
      `<td class="${c.cls || ''}">${c.fmt ? c.fmt(r) : esc(r[c.key])}</td>`).join('')}</tr>`).join('')
      : `<tr><td class="l empty" colspan="${cols.length + (rank ? 1 : 0)}">Nothing here yet.</td></tr>`;
    return `<div class="tw"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  }
  document.addEventListener('click', (e) => {
    const th = e.target.closest('th.sortable');
    if (!th) return;
    const id = th.dataset.t, key = th.dataset.k;
    const cur = tableState.get(id) || currentDefaults.get(id) || {};
    tableState.set(id, { key, desc: cur.key === key ? !cur.desc : true });
    render();
  });
  const sortable = table;

  // ------------------------------------------------------------ column sets
  const mineRow = (teamIdKey = 'teamId') => (r) => {
    const cls = [];
    if (String(r[teamIdKey]) === String(myTeamId())) cls.push('mine');
    if (favPlayers().has(r.id)) cls.push('fav');
    return cls.join(' ');
  };
  const skaterCols = ({ showTeam = true } = {}) => [
    { key: 'name', label: 'Player', cls: 'l stick', fmt: (p) => `${playerLink(p.id, p.name)}${p.isGoalie ? '<span class="chip" title="Goalie">G</span>' : ''}${favPlayers().has(p.id) ? ' ★' : ''}`, sortVal: (p) => p.name },
    { key: 'number', label: '#', sortVal: (p) => Number(p.number) },
    ...(showTeam ? [{ key: 'team', label: 'Team', cls: 'l', fmt: (p) => teamCell(p.teamId, { short: true }), sortVal: (p) => p.team }] : []),
    { key: 'gp', label: 'GP' },
    { key: 'g', label: 'G' },
    { key: 'a', label: 'A' },
    { key: 'pts', label: 'PTS', cls: 'strong' },
    { key: 'ptsPerGame', label: 'P/GP', fmt: (p) => num(p.ptsPerGame) },
    { key: 'ppg', label: 'PPG', title: 'Power-play goals' },
    { key: 'shg', label: 'SHG', title: 'Shorthanded goals' },
    { key: 'gwg', label: 'GWG', title: 'Game-winning goals' },
    { key: 'multiPointGames', label: 'MPG', title: 'Multi-point games' },
    { key: 'streak', label: 'STRK', title: 'Current point streak (games)', sortVal: (p) => p.pointStreak.current, fmt: (p) => p.pointStreak.current || '–' },
  ];
  const standingsCols = ({ full = false } = {}) => [
    { key: 'name', label: 'Team', cls: 'l stick', fmt: (t) => teamCell(t.id), sortVal: (t) => t.name },
    { key: 'gp', label: 'GP' },
    { key: 'w', label: 'W' },
    { key: 'l', label: 'L' },
    { key: 't', label: 'T' },
    { key: 'pts', label: 'PTS', cls: 'strong' },
    { key: 'gf', label: 'GF' },
    { key: 'ga', label: 'GA' },
    { key: 'diff', label: 'DIFF', fmt: (t) => (t.diff > 0 ? '+' : '') + t.diff },
    ...(full ? [
      { key: 'homeRec', label: 'Home', fmt: (t) => `${t.home.w}-${t.home.l}-${t.home.t}`, sortVal: (t) => t.home.w * 2 + t.home.t },
      { key: 'awayRec', label: 'Away', fmt: (t) => `${t.away.w}-${t.away.l}-${t.away.t}`, sortVal: (t) => t.away.w * 2 + t.away.t },
      { key: 'ppPct', label: 'PP%', fmt: (t) => pct100(t.ppPct), title: 'Power-play goals ÷ opponent minor penalties' },
      { key: 'pkPct', label: 'PK%', fmt: (t) => pct100(t.pkPct) },
      { key: 'svPct', label: 'SV%', fmt: (t) => pct(t.svPct), title: 'Team save % — shots on goal stopped' },
      { key: 'pim', label: 'PIM' },
    ] : []),
    { key: 'streak', label: 'STRK', sortVal: (t) => (t.streak?.[0] === 'W' ? 1 : -1) * parseInt(t.streak?.slice(1) || 0, 10) },
    { key: 'last5', label: 'Last 5', cls: 'l', noSort: true, fmt: (t) => form(t.last5) },
  ];

  // ------------------------------------------------------------ game list
  function gameRow(s, perspective) {
    const d = `<div class="when">${esc(fmtDay(s.start))}<br>${esc(fmtTime(s.start))}</div>`;
    const tn = (id) => (team(id) ? teamCell(id, { link: false, short: true }) : esc(id));
    const where = !s.final && s.location ? `<div class="muted small">${esc(s.location)}</div>` : '';
    const vs = `<div class="vs"><div>${tn(s.away)}</div><div>@ ${tn(s.home)}</div>${where}</div>`;
    let score;
    if (s.final) {
      let res = '';
      if (perspective) {
        const my = String(s.home) === String(perspective) ? s.homeScore : s.awayScore;
        const op = String(s.home) === String(perspective) ? s.awayScore : s.homeScore;
        const r = my > op ? 'W' : my < op ? 'L' : 'T';
        res = `<span class="res-${r}">${r}</span> `;
        score = `${res}${my}–${op}`;
      } else {
        score = `${s.awayScore}–${s.homeScore}`;
      }
      if (s.hasDetail) score = `<a href="#/game/${s.id}">${score}</a>`;
    } else {
      score = '';
    }
    return `<li>${d}${vs}<div class="score">${score}</div></li>`;
  }
  const gameList = (items, perspective) => (items.length ? `<ul class="games">${items.map((s) => gameRow(s, perspective)).join('')}</ul>` : '<p class="empty">No games.</p>');
  const isUpcoming = (s) => !s.final && localDate(s.end || s.start) >= new Date(Date.now() - 3 * 36e5);
  const involves = (s, id) => String(s.home) === String(id) || String(s.away) === String(id);

  // ------------------------------------------------------------ views
  function viewHome() {
    const my = team(myTeamId());
    const mySched = S.schedule.filter((s) => involves(s, myTeamId()));
    const played = mySched.filter((s) => s.final);
    const upcoming = mySched.filter(isUpcoming);
    const skaters = S.players.filter((p) => !p.isGoalie || p.pts > 0);
    const favs = [...favPlayers()].map((id) => playerById.get(id)).filter(Boolean);

    const myCard = my ? `
      <section class="card">
        <div class="hero">
          ${my.logo ? `<img src="${esc(my.logo)}" alt="">` : ''}
          <div>
            <div class="muted small">My team · ${ordinal(my.rank)} of ${S.teams.length}</div>
            <div class="name"><a href="#/team/${my.id}">${esc(my.name)}</a></div>
            <div class="tiles" style="margin-top:10px">
              ${tile(`${my.w}-${my.l}-${my.t}`, 'Record')}
              ${tile(my.pts, 'Points')}
              ${tile((my.diff > 0 ? '+' : '') + my.diff, 'Goal diff')}
              ${tile(num(my.gfPerGame, 1), 'GF / game')}
              ${tile(num(my.gaPerGame, 1), 'GA / game')}
              ${tile(my.streak || '–', 'Streak')}
            </div>
          </div>
        </div>
      </section>` : '';

    const favCard = favs.length ? `
      <section class="card">
        <div class="card-head"><h2>Following</h2></div>
        ${sortable('home-favs', skaterCols().filter((c) => ['name', 'team', 'gp', 'g', 'a', 'pts', 'ptsPerGame', 'streak'].includes(c.key)), favs, { sort: { key: 'pts', desc: true } })}
      </section>` : '';

    return `
      ${myCard}
      ${favCard}
      <div class="grid g2">
        <section class="card">
          <div class="card-head"><h2>Last results</h2><a class="small" href="#/team/${myTeamId()}">All</a></div>
          ${gameList(played.slice(-4).reverse(), myTeamId())}
        </section>
        <section class="card">
          <div class="card-head"><h2>Coming up</h2><a class="small" href="#/schedule">Schedule</a></div>
          ${gameList(upcoming.slice(0, 4), myTeamId())}
        </section>
      </div>
      <section class="card">
        <div class="card-head"><h2>Standings</h2><a class="small" href="#/standings">More detail</a></div>
        ${sortable('home-standings', standingsCols(), S.teams, { rank: true, rowClass: (t) => (String(t.id) === String(myTeamId()) ? 'mine' : '') })}
      </section>
      <div class="grid g2">
        <section class="card">
          <div class="card-head"><h2>Points leaders</h2><a class="small" href="#/skaters">All skaters</a></div>
          ${table('home-pts', skaterCols().filter((c) => ['name', 'team', 'gp', 'g', 'a', 'pts'].includes(c.key)), skaters, { sort: { key: 'pts', desc: true }, limit: 10, rank: true, rowClass: mineRow() })}
        </section>
        <section class="card">
          <div class="card-head"><h2>Team defense</h2><a class="small" href="#/standings">Standings</a></div>
          ${table('home-def', [
            { key: 'name', label: 'Team', cls: 'l stick', fmt: (t) => teamCell(t.id, { short: true }), sortVal: (t) => t.name },
            { key: 'gaPerGame', label: 'GA/GP', fmt: (t) => num(t.gaPerGame, 1) },
            { key: 'sa', label: 'SA', title: 'Shots against' },
            { key: 'svPct', label: 'SV%', cls: 'strong', fmt: (t) => pct(t.svPct), title: 'Team save %' },
          ], S.teams, { sort: { key: 'svPct', desc: true }, rank: true, rowClass: (t) => (String(t.id) === String(myTeamId()) ? 'mine' : '') })}
        </section>
      </div>`;
  }

  function viewStandings() {
    const periodsSeen = [...new Set(S.teams.flatMap((t) => Object.keys(t.gfByPeriod)))];
    const periodCols = [
      { key: 'name', label: 'Team', cls: 'l', fmt: (t) => teamCell(t.id), sortVal: (t) => t.name },
      ...periodsSeen.flatMap((p) => [
        { key: 'gf' + p, label: `P${p} GF`, fmt: (t) => t.gfByPeriod[p] || 0, sortVal: (t) => t.gfByPeriod[p] || 0 },
        { key: 'ga' + p, label: `P${p} GA`, fmt: (t) => t.gaByPeriod[p] || 0, sortVal: (t) => t.gaByPeriod[p] || 0 },
      ]),
    ];
    const specialCols = [
      { key: 'name', label: 'Team', cls: 'l', fmt: (t) => teamCell(t.id), sortVal: (t) => t.name },
      { key: 'ppg', label: 'PPG' }, { key: 'ppo', label: 'PPO', title: 'Power-play opportunities' },
      { key: 'ppPct', label: 'PP%', cls: 'strong', fmt: (t) => pct100(t.ppPct) },
      { key: 'tsh', label: 'TSH', title: 'Times shorthanded' }, { key: 'ppga', label: 'PPGA' },
      { key: 'pkPct', label: 'PK%', cls: 'strong', fmt: (t) => pct100(t.pkPct) },
      { key: 'shg', label: 'SHG' }, { key: 'shga', label: 'SHGA' },
      { key: 'sf', label: 'SF', title: 'Shots for' },
      { key: 'sa', label: 'SA', title: 'Shots against' },
      { key: 'svPct', label: 'SV%', cls: 'strong', fmt: (t) => pct(t.svPct), title: 'Team save %' },
    ];
    const rc = (t) => (String(t.id) === String(myTeamId()) ? 'mine' : '');
    return `
      <div class="page-head"><div><h1>Standings</h1><div class="sub">${esc(S.meta.division)} · ${esc(S.meta.season)} · 2 pts for a win, 1 for a tie</div></div></div>
      <section class="card">${sortable('standings', standingsCols({ full: true }), S.teams, { rank: true, rowClass: rc })}</section>
      <section class="card"><div class="card-head"><h2>Special teams &amp; shots</h2></div>${sortable('special', specialCols, S.teams, { sort: { key: 'ppPct', desc: true }, rowClass: rc })}
        <p class="muted small">PP opportunities are counted from opponent minor/major penalties in the game timeline, so they're a close approximation — coincidental penalties still count.</p></section>
      <section class="card"><div class="card-head"><h2>Goals by period</h2></div>${sortable('periods', periodCols, S.teams, { rowClass: rc })}</section>`;
  }

  function teamFilterSelect(id, value, { all = true } = {}) {
    return `<select id="${id}">${all ? `<option value="">All teams</option>` : ''}${S.teams.slice().sort((a, b) => a.name.localeCompare(b.name))
      .map((t) => `<option value="${t.id}" ${String(value) === String(t.id) ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>`;
  }

  function viewSkaters() {
    const f = store.get('skaterFilter', { team: '', q: '', goalies: false });
    let rows = S.players.filter((p) => f.goalies || !p.isGoalie || p.pts > 0);
    if (f.team) rows = rows.filter((p) => String(p.teamId) === String(f.team));
    if (f.q) rows = rows.filter((p) => p.name.toLowerCase().includes(f.q.toLowerCase()));
    setTimeout(() => {
      bind('#sk-team', 'change', (e) => { store.set('skaterFilter', { ...f, team: e.target.value }); render(); });
      bind('#sk-q', 'input', (e) => { store.set('skaterFilter', { ...f, q: e.target.value }); rerenderKeepFocus('#sk-q'); });
    });
    return `
      <div class="page-head"><div><h1>Skaters</h1><div class="sub">${rows.length} players · click a column to sort</div></div></div>
      <section class="card">
        <div class="controls">${teamFilterSelect('sk-team', f.team)}<input type="search" id="sk-q" placeholder="Search players" value="${esc(f.q)}"></div>
        ${sortable('skaters', skaterCols(), rows, { sort: { key: 'pts', desc: true }, rank: true, rowClass: mineRow() })}
      </section>
      <p class="muted small">MPG = multi-point games. STRK = current point streak. GWG is as recorded by the league.</p>`;
  }

  function viewSchedule() {
    const sel = store.get('schedTeam', String(myTeamId()));
    const items = S.schedule.filter((s) => !sel || involves(s, sel));
    const past = items.filter((s) => s.final).reverse();
    const next = items.filter(isUpcoming);
    setTimeout(() => bind('#sc-team', 'change', (e) => { store.set('schedTeam', e.target.value); render(); }));
    return `
      <div class="page-head"><div><h1>Schedule</h1><div class="sub">${S.meta.gamesPlayed} of ${S.meta.gamesScheduled} games played</div></div></div>
      <div class="controls">${teamFilterSelect('sc-team', sel)}</div>
      <div class="grid g2">
        <section class="card"><div class="card-head"><h2>Upcoming</h2><span class="muted small">${next.length}</span></div>${gameList(next, sel || null)}</section>
        <section class="card"><div class="card-head"><h2>Results</h2><span class="muted small">${past.length}</span></div>${gameList(past, sel || null)}</section>
      </div>`;
  }

  function viewTeam(id) {
    const t = team(id);
    if (!t) return notFound();
    const roster = S.players.filter((p) => String(p.teamId) === String(id));
    const sched = S.schedule.filter((s) => involves(s, id));
    const isMine = String(id) === String(myTeamId());
    // head-to-head vs every opponent
    const h2h = new Map();
    for (const r of t.results) {
      const o = h2h.get(r.opp) || { opp: r.opp, gp: 0, w: 0, l: 0, t: 0, gf: 0, ga: 0 };
      o.gp++; o[r.r.toLowerCase()]++; o.gf += r.gf; o.ga += r.ga;
      h2h.set(r.opp, o);
    }
    setTimeout(() => bind('#set-mine', 'click', () => { store.set('myTeam', String(id)); render(); }));
    return `
      <div class="page-head">
        ${t.logo ? `<img src="${esc(t.logo)}" alt="">` : ''}
        <div><h1>${esc(t.name)}</h1><div class="sub">${ordinal(t.rank)} in ${esc(S.meta.division)} · ${t.w}-${t.l}-${t.t} · ${t.pts} pts ${form(t.last5)}</div></div>
        <div style="margin-left:auto">${isMine ? '<span class="chip">My team</span>' : '<button class="star" id="set-mine">Make this my team</button>'}</div>
      </div>
      <section class="card"><div class="tiles">
        ${tile(t.gf, 'Goals for')}${tile(t.ga, 'Goals against')}${tile(num(t.gfPerGame, 1), 'GF / game')}${tile(num(t.gaPerGame, 1), 'GA / game')}
        ${tile(pct100(t.ppPct), `PP (${t.ppg}/${t.ppo})`)}${tile(pct100(t.pkPct), `PK (${t.tsh - t.ppga}/${t.tsh})`)}${tile(pct(t.svPct), 'Save %')}${tile(t.pim, 'PIM')}
        ${tile(`${t.home.w}-${t.home.l}-${t.home.t}`, 'Home')}${tile(`${t.away.w}-${t.away.l}-${t.away.t}`, 'Away')}
      </div></section>
      <section class="card"><div class="card-head"><h2>Skaters</h2></div>
        ${sortable('team-sk-' + id, skaterCols({ showTeam: false }), roster, { sort: { key: 'pts', desc: true }, rowClass: (p) => (favPlayers().has(p.id) ? 'fav' : '') })}</section>
      <div class="grid g2">
        <section class="card"><div class="card-head"><h2>Results</h2></div>${gameList(sched.filter((s) => s.final).reverse(), id)}</section>
        <section class="card"><div class="card-head"><h2>Upcoming</h2></div>${gameList(sched.filter(isUpcoming).slice(0, 8), id)}</section>
      </div>
      <section class="card"><div class="card-head"><h2>Head to head</h2></div>
        ${sortable('h2h-' + id, [
          { key: 'opp', label: 'Opponent', cls: 'l', fmt: (o) => teamCell(o.opp), sortVal: (o) => teamName(o.opp) },
          { key: 'gp', label: 'GP' }, { key: 'rec', label: 'W-L-T', fmt: (o) => `${o.w}-${o.l}-${o.t}`, sortVal: (o) => o.w * 2 + o.t },
          { key: 'gf', label: 'GF' }, { key: 'ga', label: 'GA' },
        ], [...h2h.values()], { sort: { key: 'gp', desc: true } })}</section>`;
  }

  function viewPlayer(id) {
    const p = playerById.get(id);
    if (!p) return notFound();
    const t = team(p.teamId);
    const isFav = favPlayers().has(id);
    const teamRank = [...S.players].filter((x) => x.teamId === p.teamId).sort((a, b) => b.pts - a.pts || b.g - a.g).findIndex((x) => x.id === id) + 1;
    const leagueRank = [...S.players].sort((a, b) => b.pts - a.pts).findIndex((x) => x.pts === p.pts) + 1;
    const maxPts = Math.max(1, ...p.log.map((l) => l.pts));
    setTimeout(() => bind('#fav', 'click', () => {
      const s = favPlayers(); s.has(id) ? s.delete(id) : s.add(id); store.set('favPlayers', [...s]); render();
    }));
    return `
      <div class="page-head">
        ${t?.logo ? `<img src="${esc(t.logo)}" alt="">` : ''}
        <div><h1>#${esc(p.number)} ${esc(p.name)}</h1><div class="sub">${teamCell(p.teamId)}</div></div>
        <div style="margin-left:auto"><button class="star ${isFav ? 'on' : ''}" id="fav">${isFav ? '★ Following' : '☆ Follow'}</button></div>
      </div>
      <section class="card"><div class="tiles">
        ${tile(p.gp, 'Games')}${tile(p.g, 'Goals')}${tile(p.a, 'Assists')}${tile(p.pts, 'Points')}${tile(num(p.ptsPerGame), 'Points / game')}
        ${tile(`${ordinal(teamRank)}`, 'Team scoring')}${tile(`${S.players.filter((x) => x.pts === p.pts).length > 1 ? 'T-' : ''}${ordinal(leagueRank)}`, 'League scoring')}
        ${tile(pct100(p.teamGoalShare), 'Of team goals', 'Share of team goals this player scored or assisted on')}
        ${tile(p.ppg + p.ppa, 'PP points')}${tile(p.gwg, 'Game winners')}${tile(p.firstGoals, 'Opening goals')}
        ${tile(`${p.pointStreak.current} / ${p.pointStreak.best}`, 'Point streak (now / best)')}${p.goalieGames ? tile(p.goalieGames, 'Games in goal') : ''}
      </div></section>
      <section class="card"><div class="card-head"><h2>Game log</h2></div>
        ${table('log-' + id, [
          { key: 'date', label: 'Date', cls: 'l', fmt: (l) => `<a href="#/game/${l.gameId}">${esc(fmtDay(l.date))}</a>` },
          { key: 'opp', label: 'Opponent', cls: 'l', fmt: (l) => `${l.home ? 'vs' : '@'} ${teamCell(l.opp, { short: true })}`, sortVal: (l) => teamName(l.opp) },
          { key: 'res', label: 'Result', fmt: (l) => gameResult(l.gameId, p.teamId), noSort: true },
          { key: 'g', label: 'G' }, { key: 'a', label: 'A' }, { key: 'pts', label: 'PTS', cls: 'strong' },
          { key: 'bar', label: '', noSort: true, cls: 'l', fmt: (l) => `<div class="bar" style="width:90px"><i style="width:${(l.pts / maxPts) * 100}%"></i></div>` },
          { key: 'ppg', label: 'PPG' }, { key: 'gwg', label: 'GWG' },
        ], p.log.slice().reverse())}</section>`;
  }

  function viewGame(id) {
    const g = gameById.get(id);
    if (!g) return notFound();
    const hs = g.home, as = g.away;
    const cols = [...g.periods.map((p) => p.label), 'T'];
    const periodTable = `<div class="tw"><table><thead><tr><th class="l">Team</th>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>
      ${[['away', as], ['home', hs]].map(([s, side]) => `<tr><td class="l">${teamCell(side.id, { short: true })}</td>${g.periods.map((p) => `<td>${p[s]}</td>`).join('')}<td class="strong">${side.score}</td></tr>`).join('')}
      </tbody></table></div>${g.shotsByPeriod?.length ? `<div class="tw" style="margin-top:12px"><table><thead><tr><th class="l">Shots</th>${g.shotsByPeriod.map((p) => `<th>${esc(p.label)}</th>`).join('')}<th>T</th></tr></thead><tbody>
      ${[['away', as], ['home', hs]].map(([s, side]) => `<tr><td class="l">${teamCell(side.id, { short: true })}</td>${g.shotsByPeriod.map((p) => `<td>${p[s]}</td>`).join('')}<td class="strong">${g.shotsByPeriod.reduce((n, p) => n + p[s], 0)}</td></tr>`).join('')}
      </tbody></table></div>` : ''}`;
    let lastPer = null;
    const tl = g.events.map((e) => {
      const per = e.period !== lastPer ? `<li class="per">${/^\d+$/.test(e.period) ? 'Period ' + e.period : esc(e.period)}</li>` : '';
      lastPer = e.period;
      if (e.type === 'goal') {
        const as_ = e.assists.length ? `<div class="muted small">Assists: ${e.assists.map((a) => playerLink(a.playerId, a.name)).join(', ')}</div>` : '<div class="muted small">Unassisted</div>';
        return `${per}<li><span class="t">${esc(e.time)}</span><div><strong>Goal</strong> · ${playerLink(e.playerId, e.scorer.name)} ${e.tags.map((t) => `<span class="chip">${esc(t)}</span>`).join('')}${as_}</div><div>${teamCell(e.teamId, { link: false, short: true })}</div></li>`;
      }
      return `${per}<li class="pen"><span class="t">${esc(e.time)}</span><div>Penalty <span class="muted">${esc(e.infraction || '')} (${e.minutes} min)</span></div><div>${teamCell(e.teamId, { link: false, short: true })}</div></li>`;
    }).join('');
    const box = (teamId) => sortable(`box-${id}-${teamId}`, [
      { key: 'number', label: '#', sortVal: (r) => Number(r.number) },
      { key: 'name', label: 'Player', cls: 'l', fmt: (r) => playerLink(r.playerId, r.name) },
      { key: 'g', label: 'G' }, { key: 'a', label: 'A' }, { key: 'pts', label: 'PTS', cls: 'strong', sortVal: (r) => r.g + r.a, fmt: (r) => r.g + r.a },
    ], g.skaters.filter((r) => String(r.teamId) === String(teamId)), { sort: { key: 'pts', desc: true }, rowClass: (r) => (favPlayers().has(r.playerId) ? 'fav' : '') });
    return `
      <div class="page-head"><div><h1>Game ${g.gameNumber ? '#' + g.gameNumber : ''}</h1><div class="sub">${esc(fmtDay(g.date))} · ${esc(fmtTime(g.date))} · ${esc(g.rink)}</div></div></div>
      <section class="card">
        <div class="scoreboard">
          <div>${team(as.id)?.logo ? `<img src="${esc(team(as.id).logo)}" alt="">` : ''}<div class="tname"><a href="#/team/${as.id}">${esc(teamName(as.id))}</a></div><div class="muted small">Away</div></div>
          <div><div class="big">${as.score} – ${hs.score}</div><div class="muted small">Final</div></div>
          <div>${team(hs.id)?.logo ? `<img src="${esc(team(hs.id).logo)}" alt="">` : ''}<div class="tname"><a href="#/team/${hs.id}">${esc(teamName(hs.id))}</a></div><div class="muted small">Home</div></div>
        </div>
      </section>
      <section class="card">${periodTable}</section>
      <section class="card"><div class="card-head"><h2>Timeline</h2></div><ul class="timeline">${tl || '<li class="empty">No events recorded.</li>'}</ul></section>
      <div class="grid g2">
        <section class="card"><div class="card-head"><h2>${esc(teamName(as.id))}</h2></div>${box(as.id)}</section>
        <section class="card"><div class="card-head"><h2>${esc(teamName(hs.id))}</h2></div>${box(hs.id)}</section>
      </div>
      ${g.warnings.length ? `<p class="note">Data issues in the league's report for this game: ${g.warnings.map(esc).join('; ')}.</p>` : ''}`;
  }

  // ------------------------------------------------------------ small pieces
  function tile(v, k, title) { return `<div class="tile" ${title ? `title="${esc(title)}"` : ''}><div class="v">${esc(v)}</div><div class="k">${esc(k)}</div></div>`; }
  function ordinal(n) { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function gameResult(gameId, teamId) {
    const g = gameById.get(gameId);
    if (!g) return '';
    const mine = String(g.home.id) === String(teamId) ? g.home : g.away;
    const opp = mine === g.home ? g.away : g.home;
    const r = mine.score > opp.score ? 'W' : mine.score < opp.score ? 'L' : 'T';
    return `<span class="res-${r}">${r} ${mine.score}–${opp.score}</span>`;
  }
  function bind(sel, ev, fn) { const el = document.querySelector(sel); if (el) el.addEventListener(ev, fn); }
  function rerenderKeepFocus(sel) {
    const el = document.querySelector(sel); const pos = el?.selectionStart;
    render();
    const n = document.querySelector(sel); if (n) { n.focus(); if (pos != null) n.setSelectionRange(pos, pos); }
  }
  const notFound = () => '<section class="card"><h2>Not found</h2><p><a href="#/">Back to home</a></p></section>';

  // ------------------------------------------------------------ router
  const routes = [
    [/^\/?$/, viewHome], [/^\/standings$/, viewStandings], [/^\/skaters$/, viewSkaters],
    [/^\/schedule$/, viewSchedule], [/^\/team\/(\d+)$/, viewTeam], [/^\/player\/(\d+)$/, viewPlayer],
    [/^\/game\/(\d+)$/, viewGame],
  ];
  let lastPath = null;
  function render() {
    const path = location.hash.replace(/^#/, '') || '/';
    let html = notFound();
    for (const [re, fn] of routes) { const m = path.match(re); if (m) { html = fn(...m.slice(1)); break; } }
    $app.innerHTML = html;
    document.querySelectorAll('#nav a').forEach((a) => {
      const h = a.getAttribute('href').slice(1);
      a.classList.toggle('active', h === '/' ? path === '/' : path.startsWith(h));
    });
    if (path !== lastPath) { window.scrollTo(0, 0); lastPath = path; }
  }

  // ------------------------------------------------------------ boot
  fetch('data/stats.json', { cache: 'no-cache' })
    .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then((data) => {
      S = data;
      S.teams.forEach((t) => teamById.set(String(t.id), t));
      S.players.forEach((p) => playerById.set(p.id, p));
      S.games.forEach((g) => gameById.set(g.id, g));
      document.getElementById('brand-division').textContent = `${S.meta.division} Stats`;
      document.getElementById('brand-season').textContent = `${S.meta.league} · ${S.meta.season}`;
      document.title = `${S.meta.division} Stats`;
      const updated = new Date(S.meta.updatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
      document.getElementById('foot').innerHTML = `Updated ${esc(updated)} · ${S.meta.gamesPlayed} games · Source: <a href="${esc(S.meta.sourceUrl)}" target="_blank" rel="noopener">${esc(S.meta.league)}</a>. Unofficial — built from the league's published game sheets.${S.meta.scoreOnlyGames?.length ? ` ${S.meta.scoreOnlyGames.length} game(s) counted from the final score only (no game sheet yet).` : ''}`;
      window.addEventListener('hashchange', render);
      render();
    })
    .catch((err) => { $app.innerHTML = `<section class="card"><h2>Couldn't load stats</h2><p class="muted">${esc(err.message)}</p></section>`; });
})();
