// Stat Track — "Primetime" broadcast theme. Renders site/data/stats.json; hash routes, no framework.
(() => {
  'use strict';

  let S; // stats.json
  const $app = document.getElementById('app');
  const teamById = new Map(), playerById = new Map(), gameById = new Map(), goalieById = new Map();

  // Short display names / 3-letter codes for this division; anything else falls back to derived values.
  const SHORT = { 402384: 'Stars', 402387: 'Crusaders', 402390: 'Riggers', 402385: 'Bandits', 402392: 'Young Kings', 402391: 'Spartans', 402388: 'MOB', 402386: 'Knights', 402389: 'Rebels', 402383: 'Saints' };
  const CODE = { 402384: 'STA', 402387: 'CRU', 402390: 'RIG', 402385: 'BAN', 402392: 'YKH', 402391: 'SPA', 402388: 'MOB', 402386: 'CCK', 402389: 'REB', 402383: 'SPH' };

  // ------------------------------------------------------------ utils
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem('st:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('st:' + k, JSON.stringify(v)); } catch { /* private mode */ } },
  };
  // "2026-09-27T08:00:00" is rink-local time; parse without timezone shifting.
  function localDate(s) {
    const [d, t = '12:00:00'] = String(s).split('T');
    const [y, m, day] = d.split('-').map(Number);
    const [h, mi] = t.split(':').map(Number);
    return new Date(y, m - 1, day, h, mi);
  }
  const dt = (s, o = { month: 'short', day: 'numeric' }) => localDate(s).toLocaleDateString('en-CA', o);
  const tm = (s) => localDate(s).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const rate = (x) => (x == null ? '—' : x >= 1 ? '1.000' : x.toFixed(3).replace(/^0/, ''));
  const pct = (x, dp = 1) => (x == null ? '—' : (x * 100).toFixed(dp) + '%');
  const sign = (n) => (n > 0 ? '+' + n : n < 0 ? '−' + Math.abs(n) : '0');
  const ordinal = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
  const lin = (d0, d1, r0, r1) => (v) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);
  const ticks = (max, n = 4) => {
    const raw = max / n, p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    const s = [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= raw) || p;
    const out = []; for (let v = 0; v <= max + 1e-9; v += s) out.push(+v.toFixed(6));
    if (out[out.length - 1] < max) out.push(+(out[out.length - 1] + s).toFixed(6));
    return out;
  };
  // bar paths: rounded at the data end only, square at the baseline
  function hbar(x0, x1, y, h, r = 3) {
    const L = Math.abs(x1 - x0); r = Math.min(r, L, h / 2); if (L < 0.5) return '';
    return x1 >= x0
      ? `M${x0},${y}H${x1 - r}Q${x1},${y} ${x1},${y + r}V${y + h - r}Q${x1},${y + h} ${x1 - r},${y + h}H${x0}Z`
      : `M${x0},${y}H${x1 + r}Q${x1},${y} ${x1},${y + r}V${y + h - r}Q${x1},${y + h} ${x1 + r},${y + h}H${x0}Z`;
  }
  function vbar(x, y0, y1, w, r = 3) {
    const L = y0 - y1; r = Math.min(r, L, w / 2); if (L < 0.5) return '';
    return `M${x},${y0}V${y1 + r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 + r}V${y0}Z`;
  }

  const myTeamId = () => { const id = String(store.get('myTeam', S.meta.myTeamId)); return teamById.has(id) ? id : String(S.meta.myTeamId); };
  const favPlayers = () => new Set(store.get('favPlayers', []).filter((id) => playerById.has(id)));
  // Teams in the schedule we have no game sheet for yet are plain names; give them a stub.
  const team = (id) => teamById.get(String(id)) || { id: String(id), name: String(id), short: String(id), code: String(id).slice(0, 3).toUpperCase(), logo: null, stub: true };
  const logo = (t, cls = 'logo') => `<span class="${cls}" data-code="${esc(t.code)}">${t.logo ? `<img src="${esc(t.logo)}" alt="" loading="lazy" onerror="this.remove()">` : ''}</span>`;
  const teamLink = (t, label = t.name) => (t.stub ? esc(label) : `<a class="lnk" href="#/team/${t.id}">${esc(label)}</a>`);
  // Tooltip attribute. The browser un-escapes attribute values and the tooltip sets innerHTML,
  // so the text is escaped once for the tooltip and once more for the attribute.
  const tip = (title, body) => `data-tip="${esc(`<b>${esc(title)}</b>${esc(body)}`)}"`;
  const playerLink = (id, name) => (id && playerById.has(id) ? `<a class="lnk" href="#/player/${id}">${esc(name)}</a>` : esc(name));
  const mmss = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
  const L5 = (s) => `<span class="l5">${[...(s || '')].map((c) => `<i class="${c}">${c}</i>`).join('')}</span>`;
  const tn = (t) => `<span class="tn">${logo(t)}<span class="full">${teamLink(t)}</span><span class="cd">${teamLink(t, t.code)}</span></span>`;
  const panel = (title, body, { meta = '', gold = false, reveal = true } = {}) =>
    `<section class="panel" ${reveal ? 'data-reveal' : ''}><div class="ph"><h2 class="${gold ? 'gold' : ''}">${title}</h2><span class="meta">${meta}</span></div>${body}</section>`;
  // Monday-start week key; HSL games are Fri-Sun so a week is a tournament weekend.
  const weekKey = (date) => {
    const d = localDate(date); d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const weekLabel = (k) => {
    const w = S.weekends.get(k); if (!w) return k;
    const a = localDate(w.first), b = localDate(w.last);
    const mon = (d) => d.toLocaleDateString('en-CA', { month: 'short' });
    if (a.toDateString() === b.toDateString()) return `${mon(a)} ${a.getDate()}`;
    return a.getMonth() === b.getMonth() ? `${mon(a)} ${a.getDate()}–${b.getDate()}` : `${mon(a)} ${a.getDate()} – ${mon(b)} ${b.getDate()}`;
  };
  // HOME / AWAY badge from a team's point of view
  const haBadge = (isHome) => `<span class="ha ${isHome ? 'h' : 'a'}" title="${isHome ? 'Home — white jerseys' : 'Away — green jerseys'}">${isHome ? 'Home' : 'Away'}</span>`;
  const involves = (s, id) => String(s.home) === String(id) || String(s.away) === String(id);
  const isUpcoming = (s) => !s.final && localDate(s.end || s.start) >= new Date(Date.now() - 3 * 36e5);

  // ------------------------------------------------------------ motion
  function countUp(el) {
    const to = parseFloat(el.dataset.count), fmt = el.dataset.fmt, dp = +(el.dataset.dp || 0);
    const out = (v) => (fmt === 'rate' ? rate(v) : fmt === 'pct' ? pct(v, dp) : fmt === 'sign' ? sign(Math.round(v)) : v.toFixed(dp));
    if (RM || !Number.isFinite(to)) { el.textContent = Number.isFinite(to) ? out(to) : '—'; return; }
    const dur = 650, t0 = performance.now();
    const step = (now) => { const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = out(to * e); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  const counter = (v, fmt, dp = 0) => (v == null ? '—' : `<span data-count="${v}" ${fmt ? `data-fmt="${fmt}"` : ''} data-dp="${dp}">0</span>`);
  function reveal(root) {
    const els = root.querySelectorAll('[data-reveal]');
    const fire = (el) => { el.classList.add('in'); el.querySelectorAll('[data-count]').forEach(countUp); };
    if (RM || !('IntersectionObserver' in window)) { els.forEach(fire); return; }
    const io = new IntersectionObserver((ents) => ents.forEach((e) => { if (e.isIntersecting) { fire(e.target); io.unobserve(e.target); } }), { rootMargin: '0px 0px -6% 0px' });
    els.forEach((el) => io.observe(el));
  }
  function tips() {
    const tip = document.createElement('div'); tip.className = 'tip'; tip.setAttribute('role', 'tooltip'); document.body.appendChild(tip);
    const move = (e) => {
      const w = tip.offsetWidth, h = tip.offsetHeight;
      let x = e.clientX + 14, y = e.clientY - h - 12;
      if (x + w > innerWidth - 8) x = e.clientX - w - 14;
      if (y < 8) y = e.clientY + 16;
      tip.style.transform = `translate(${Math.max(8, x)}px,${y}px)`;
    };
    document.addEventListener('pointerover', (e) => { const t = e.target.closest?.('[data-tip]'); if (!t) return; tip.innerHTML = t.dataset.tip; tip.classList.add('on'); move(e); });
    document.addEventListener('pointermove', (e) => { if (tip.classList.contains('on')) move(e); });
    document.addEventListener('pointerout', (e) => { const t = e.target.closest?.('[data-tip]'); if (t && !t.contains(e.relatedTarget)) tip.classList.remove('on'); });
    window.addEventListener('hashchange', () => tip.classList.remove('on'));
  }
  // Sortable table with FLIP row motion. cols: [{ key, label, val(row), html?(row), cls?, desc?:false, sort?:false, title? }]
  function sortable(table, rows, cols, opts = {}) {
    if (!table) return;
    let key = opts.key || cols[0].key, dir = opts.dir || -1;
    const thead = table.createTHead(), tb = table.tBodies[0] || table.createTBody();
    thead.innerHTML = '<tr>' + cols.map((c) => `<th class="${c.cls || ''}" data-k="${c.key}" ${c.sort === false ? '' : 'tabindex="0" aria-sort="none"'} ${c.title ? `title="${esc(c.title)}"` : ''}>${c.label}</th>`).join('') + '</tr>';
    if (!rows.length) { tb.innerHTML = `<tr><td class="l empty" colspan="${cols.length}">Nothing here yet</td></tr>`; return; }
    tb.innerHTML = rows.map((r) => `<tr data-id="${esc(r.id)}" ${opts.rowAttrs ? opts.rowAttrs(r) : ''} class="${opts.rowCls ? opts.rowCls(r) : ''}">` + cols.map((c) => `<td class="${c.cls || ''}">${c.html ? c.html(r) : esc(c.val(r))}</td>`).join('') + '</tr>').join('');
    const byId = new Map([...tb.rows].map((tr) => [tr.dataset.id, tr]));
    const apply = (animate) => {
      const c = cols.find((x) => x.key === key);
      const sorted = [...rows].sort((a, b) => {
        const va = c.val(a), vb = c.val(b);
        if (va == null && vb == null) return 0; if (va == null) return 1; if (vb == null) return -1;
        return (typeof va === 'string' ? va.localeCompare(vb) : va - vb) * dir || (a.rank || 0) - (b.rank || 0);
      });
      const first = new Map([...byId].map(([id, tr]) => [id, tr.getBoundingClientRect().top]));
      sorted.forEach((r) => tb.appendChild(byId.get(String(r.id))));
      thead.querySelectorAll('th').forEach((th) => {
        th.classList.toggle('sorted', th.dataset.k === key);
        if (th.hasAttribute('aria-sort')) th.setAttribute('aria-sort', th.dataset.k === key ? (dir > 0 ? 'ascending' : 'descending') : 'none');
      });
      if (!animate || RM) return;
      byId.forEach((tr, id) => {
        const d = first.get(id) - tr.getBoundingClientRect().top; if (!d) return;
        tr.style.transition = 'none'; tr.style.transform = `translateY(${d}px)`;
        requestAnimationFrame(() => requestAnimationFrame(() => { tr.style.transition = 'transform 320ms cubic-bezier(.2,.7,.2,1)'; tr.style.transform = ''; }));
      });
    };
    const click = (th) => {
      const k = th.dataset.k, c = cols.find((x) => x.key === k); if (!c || c.sort === false) return;
      if (k === key) dir = -dir; else { key = k; dir = c.desc === false ? 1 : -1; }
      apply(true);
    };
    thead.addEventListener('click', (e) => { const th = e.target.closest('th'); if (th) click(th); });
    thead.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('th')) { e.preventDefault(); click(e.target); } });
    apply(false);
    // staggered first reveal
    [...tb.rows].forEach((tr, i) => (tr.style.transitionDelay = Math.min(i, 20) * 30 + 'ms'));
    setTimeout(() => [...tb.rows].forEach((tr) => (tr.style.transitionDelay = '')), 1400);
  }
  // Draw an SVG string sized to the container; redraw on width change.
  function mount(el, draw) {
    if (!el) return; let w = 0;
    const run = () => { const nw = Math.round(el.clientWidth); if (nw && nw !== w) { w = nw; el.innerHTML = draw(nw); } };
    run();
    if ('ResizeObserver' in window) new ResizeObserver(() => { clearTimeout(el._t); el._t = setTimeout(run, 120); }).observe(el);
  }

  // post-render hooks: views return HTML, then register DOM work here
  let hooks = [];
  const after = (fn) => hooks.push(fn);
  const $ = (s) => $app.querySelector(s);

  // ------------------------------------------------------------ charts
  function gdChart(el, myId) {
    const rows = [...S.teams].sort((a, b) => b.diff - a.diff);
    mount(el, (w) => {
      const rh = 30, top = 18, lab = 44, H = top + rows.length * rh + 4;
      const mx = Math.max(1, ...rows.map((t) => Math.abs(t.diff))), x = lin(-mx, mx, lab + 30, w - 30);
      let s = `<svg width="${w}" height="${H}" role="img" aria-label="Goal differential by team">`;
      for (const v of ticks(mx, 2).flatMap((v) => (v ? [-v, v] : [0]))) if (Math.abs(v) <= mx) s += `<line class="${v ? 'gr' : 'zero'}" x1="${x(v)}" x2="${x(v)}" y1="${top - 4}" y2="${H}"/><text x="${x(v)}" y="10" text-anchor="middle" style="font-size:11px;fill:var(--ink3)">${sign(v)}</text>`;
      rows.forEach((t, i) => {
        const y = top + i * rh, pos = t.diff >= 0, us = String(t.id) === String(myId);
        const col = us ? 'var(--us)' : pos ? 'var(--blue)' : 'var(--red)';
        s += `<g class="row" ${tip(t.name, `${t.gf} GF · ${t.ga} GA · ${sign(t.diff)}`)}>
          <rect class="hit" x="0" y="${y}" width="${w}" height="${rh}"/>
          <text x="0" y="${y + rh / 2 + 5}" class="${us ? 't-us' : ''}">${esc(t.code)}</text>
          <path class="mk gb ${pos ? 'r' : 'lft'}" style="transition-delay:${i * 40}ms" fill="${col}" d="${hbar(x(0), x(t.diff), y + 7, rh - 14, 3)}"/>
          <text class="fade ${us ? 't-us' : 't-strong'}" x="${x(t.diff) + (pos ? 6 : -6)}" y="${y + rh / 2 + 5}" text-anchor="${pos ? 'start' : 'end'}">${sign(t.diff)}</text></g>`;
      });
      return s + '</svg>';
    });
  }

  function periodChart(el, t) {
    const P = [...new Set([...Object.keys(t.gfByPeriod), ...Object.keys(t.gaByPeriod)])].sort();
    const lbl = (p) => (/^\d+$/.test(p) ? 'P' + p : p);
    mount(el, (w) => {
      if (!P.length) return '<div class="empty">No games yet</div>';
      const rh = 56, top = 6, H = top + P.length * rh, mid = w / 2, lab = 34;
      const gf = (p) => t.gfByPeriod[p] || 0, ga = (p) => t.gaByPeriod[p] || 0;
      const mx = Math.max(1, ...P.map((p) => Math.max(gf(p), ga(p)))), sc = lin(0, mx, 0, mid - lab - 34);
      let s = `<svg width="${w}" height="${H + 22}" role="img" aria-label="${esc(t.short)} goals for and against by period">`;
      P.forEach((p, i) => {
        const y = top + i * rh, bh = 22;
        s += `<text x="${mid}" y="${y + rh / 2 + 5}" text-anchor="middle" class="t-strong" style="font-size:15px">${esc(lbl(p))}</text>
        <g ${tip(/^\d+$/.test(p) ? 'Period ' + p : p, `${t.short} scored ${gf(p)} · allowed ${ga(p)}`)}>
        <rect class="hit" x="0" y="${y}" width="${w}" height="${rh}"/>
        <path class="gb lft" style="transition-delay:${i * 60}ms" fill="var(--red)" d="${hbar(mid - lab / 2 - 4, mid - lab / 2 - 4 - sc(ga(p)), y + (rh - bh) / 2, bh)}"/>
        <path class="gb r" style="transition-delay:${i * 60}ms" fill="var(--us)" d="${hbar(mid + lab / 2 + 4, mid + lab / 2 + 4 + sc(gf(p)), y + (rh - bh) / 2, bh)}"/>
        <text class="fade t-strong" x="${mid - lab / 2 - 10 - sc(ga(p))}" y="${y + rh / 2 + 6}" text-anchor="end" style="font-size:18px">${ga(p)}</text>
        <text class="fade t-strong" x="${mid + lab / 2 + 10 + sc(gf(p))}" y="${y + rh / 2 + 6}" style="font-size:18px">${gf(p)}</text></g>`;
      });
      const best = P.reduce((a, b) => (gf(b) - ga(b) > gf(a) - ga(a) ? b : a));
      s += `<text x="${mid}" y="${H + 16}" text-anchor="middle" style="font-size:12px;fill:var(--ink3);letter-spacing:.08em">STRONGEST PERIOD: ${esc(lbl(best))} · ${gf(best)}–${ga(best)}</text>`;
      return s + '</svg>';
    });
  }

  function stChart(el, myId) {
    const withData = S.teams.filter((t) => t.ppPct != null && t.pkPct != null);
    const avg = (k) => withData.reduce((n, t) => n + t[k], 0) / (withData.length || 1);
    mount(el, (w) => {
      if (!withData.length) return '<div class="empty">No penalties yet</div>';
      const H = Math.min(340, Math.max(260, w * 0.62)), m = { l: 40, r: 14, t: 24, b: 34 };
      const xMax = Math.max(0.6, Math.ceil(Math.max(...withData.map((t) => t.ppPct)) * 5) / 5);
      const yMin = Math.min(0.6, Math.floor(Math.min(...withData.map((t) => t.pkPct)) * 10) / 10);
      const x = lin(0, xMax, m.l, w - m.r), y = lin(yMin, 1, H - m.b, m.t);
      let s = `<svg width="${w}" height="${H}" role="img" aria-label="Power play percentage versus penalty kill percentage">`;
      for (let v = 0; v <= xMax + 1e-9; v += 0.2) s += `<line class="gr" x1="${x(v)}" x2="${x(v)}" y1="${m.t}" y2="${H - m.b}"/><text x="${x(v)}" y="${H - m.b + 16}" text-anchor="middle" style="font-size:11px;fill:var(--ink3)">${Math.round(v * 100)}%</text>`;
      for (let v = yMin; v <= 1 + 1e-9; v += 0.1) s += `<line class="gr" x1="${m.l}" x2="${w - m.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end" style="font-size:11px;fill:var(--ink3)">${Math.round(v * 100)}</text>`;
      s += `<line x1="${x(avg('ppPct'))}" x2="${x(avg('ppPct'))}" y1="${m.t}" y2="${H - m.b}" style="stroke:var(--ink3);opacity:.6"/>
        <line x1="${m.l}" x2="${w - m.r}" y1="${y(avg('pkPct'))}" y2="${y(avg('pkPct'))}" style="stroke:var(--ink3);opacity:.6"/>
        <text x="${x(avg('ppPct')) + 6}" y="${m.t + 12}" style="font-size:11px;fill:var(--ink3);letter-spacing:.1em">ABOVE AVG BOTH WAYS</text>
        <text x="${x(avg('ppPct')) + 4}" y="${H - m.b - 6}" style="font-size:11px;fill:var(--ink3)">LG AVG</text>
        <text x="${w - m.r}" y="${H - 4}" text-anchor="end" style="font-size:11px;fill:var(--ink2);letter-spacing:.12em">POWER PLAY % →</text>
        <text x="${m.l - 34}" y="${m.t - 8}" style="font-size:11px;fill:var(--ink2);letter-spacing:.12em">PK %</text>`;
      [...withData].sort((a, b) => (String(a.id) === String(myId)) - (String(b.id) === String(myId))).forEach((t, i) => {
        const us = String(t.id) === String(myId), cx = x(t.ppPct), cy = y(Math.max(yMin, t.pkPct));
        s += `<g class="pt fade" style="transition-delay:${300 + i * 30}ms" ${tip(t.name, `PP ${pct(t.ppPct)} (${t.ppg}/${t.ppo}) · PK ${pct(t.pkPct)}`)}>
          <circle cx="${cx}" cy="${cy}" r="14" class="hit"/>
          <circle class="dot" cx="${cx}" cy="${cy}" r="${us ? 6 : 4.5}" fill="${us ? 'var(--us)' : 'var(--blue)'}" stroke="var(--panel)" stroke-width="2"/>
          <text x="${cx + 9}" y="${cy + 4}" class="${us ? 't-us' : ''}" style="font-size:12px">${esc(t.code)}</text></g>`;
      });
      return s + '</svg>';
    });
  }

  function logChart(el, p) {
    const log = p.log.slice(-12);
    mount(el, (w) => {
      if (!log.length) return '<div class="empty">No games yet</div>';
      const H = 190, m = { l: 24, r: 8, t: 18, b: 36 }, n = log.length, step = (w - m.l - m.r) / n, bw = Math.min(28, step * 0.5);
      const mx = Math.max(4, ...log.map((g) => g.pts)), y = lin(0, mx, H - m.b, m.t);
      let s = `<svg width="${w}" height="${H}" role="img" aria-label="${esc(p.name)} points by game">`;
      for (const v of ticks(mx, 4)) s += `<line class="gr" x1="${m.l}" x2="${w - m.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end" style="font-size:11px;fill:var(--ink3)">${v}</text>`;
      log.forEach((g, i) => {
        const cx = m.l + step * i + step / 2 - bw / 2, o = team(g.opp), yg = y(g.g), ya = y(g.pts);
        s += `<g ${tip(`${dt(g.date)} ${g.home ? 'vs' : '@'} ${o.short}`, `${g.g} G · ${g.a} A${g.gwg ? ' · game-winner' : ''}`)}>
          <rect class="hit" x="${m.l + step * i}" y="${m.t}" width="${step}" height="${H - m.t - m.b}"/>
          ${g.g ? `<path class="gv" style="transition-delay:${i * 70}ms" fill="var(--us)" d="${g.a ? `M${cx},${H - m.b}V${yg}H${cx + bw}V${H - m.b}Z` : vbar(cx, H - m.b, yg, bw)}"/>` : ''}
          ${g.a ? `<path class="gv" style="transition-delay:${i * 70 + 60}ms" fill="var(--blue)" d="${vbar(cx, g.g ? yg - 2 : H - m.b, ya, bw)}"/>` : ''}
          <text class="fade t-strong" x="${cx + bw / 2}" y="${(g.pts ? ya : H - m.b) - 6}" text-anchor="middle" style="font-size:15px">${g.pts}</text>
          <text x="${cx + bw / 2}" y="${H - m.b + 16}" text-anchor="middle" style="font-size:12px">${esc(o.code)}</text>
          <text x="${cx + bw / 2}" y="${H - m.b + 30}" text-anchor="middle" style="font-size:10px;fill:var(--ink3)">${dt(g.date)}</text></g>`;
      });
      return s + `<line class="ax" x1="${m.l}" x2="${w - m.r}" y1="${H - m.b}" y2="${H - m.b}"/></svg>`;
    });
  }

  // Game flow: running score across game time. Plays like a replay the first time it scrolls into view —
  // lines draw left to right behind a playhead, goals pop in as it passes them, the score readout ticks up.
  // focus = the team drawn in gold (defaults to home).
  function flowChart(el, g, { focus = g.home.id } = {}) {
    const PER = (S.meta.regulationMinutes || 45) / 3 * 60, nPer = Math.max(3, g.periods.length), T = PER * nPer;
    const goals = g.ev.filter((e) => e.type === 'goal');
    const us = String(focus) === String(g.away.id) ? 'away' : 'home', them = us === 'home' ? 'away' : 'home';
    const col = { [us]: 'var(--us)', [them]: 'var(--red)' };
    const code = { home: team(g.home.id).code, away: team(g.away.id).code };
    const uid = `fc${g.id}${Math.random().toString(36).slice(2, 7)}`;
    let state = RM ? 'done' : 'idle', geo = null, raf = 0;
    mount(el, (w) => {
      const H = 190, m = { l: 22, r: 30, t: 24, b: 34 }, x = lin(0, T, m.l, w - m.r);
      geo = { w, m, H };
      const mx = ticks(Math.max(1, g.home.score, g.away.score), 3).at(-1), y = lin(0, mx, H - m.b, m.t);
      const path = (side) => { let d = `M${x(0)},${y(0)}`, n = 0; for (const e of goals) if (e.side === side) d += `H${x(e.t)}V${y(++n)}`; return d + `H${x(T)}`; };
      const done = state === 'done', on = done ? ' on' : '';
      let s = `<svg width="${w}" height="${H}" role="img" aria-label="Running score through the game">
        <defs><clipPath id="${uid}"><rect class="fc-clip" x="0" y="0" width="${done ? w : m.l}" height="${H}"/></clipPath></defs>`;
      for (const v of ticks(mx, 3)) s += `<line class="gr" x1="${m.l}" x2="${w - m.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end" style="font-size:11px;fill:var(--ink3)">${v}</text>`;
      for (let p = 1; p <= nPer; p++) s += `${p > 1 ? `<line class="ax" x1="${x((p - 1) * PER)}" x2="${x((p - 1) * PER)}" y1="${m.t}" y2="${H - m.b}"/>` : ''}<text x="${x((p - 0.5) * PER)}" y="${H - m.b + 18}" text-anchor="middle" style="font-size:12px">${p <= 3 ? 'P' + p : 'OT'}</text>`;
      s += `<g clip-path="url(#${uid})">`;
      // power-play windows: from the penalty to its expiry (or period end), tinted for the team with the advantage
      for (const e of g.ev) {
        if (e.type !== 'penalty' || !e.minutes || e.minutes > 5 || !e.regulation) continue;
        const pEnd = Number(e.period) * PER, x0 = x(e.t), x1 = x(Math.min(pEnd, e.t + e.minutes * 60));
        const advSide = e.side === 'home' ? 'away' : 'home';
        s += `<rect x="${x0}" y="${m.t}" width="${Math.max(1, x1 - x0)}" height="${H - m.b - m.t}" fill="${col[advSide]}" fill-opacity=".1" ${tip(`${team(g[advSide].id).short} power play`, `${e.time} P${e.period} · ${team(e.teamId).short} ${e.infraction || 'penalty'} (${e.minutes} min)`)}/>`;
      }
      s += `<path d="${path(them)}" fill="none" stroke="${col[them]}" stroke-width="2" stroke-linejoin="round"/>
            <path d="${path(us)}" fill="none" stroke="${col[us]}" stroke-width="2.5" stroke-linejoin="round"/></g>`;
      for (const e of g.ev) {
        if (e.type === 'penalty') { s += `<rect class="fev${on}" data-x="${x(e.t)}" x="${x(e.t) - 1}" y="${H - m.b - 6}" width="2" height="6" fill="var(--ink3)" ${tip(`${e.time} P${e.period} · Penalty`, `${e.player?.name ? e.player.name + ', ' : ''}${team(e.teamId).short} · ${e.infraction || ''} (${e.minutes} min)`)}/>`; continue; }
        const n = e.side === 'home' ? e.score[0] : e.score[1];
        s += `<g class="fev${on}" data-x="${x(e.t)}" data-side="${e.side}" ${tip(`${e.time} P${e.period} · ${code.away} ${e.score[1]}–${e.score[0]} ${code.home}`, `${e.scorer.name} (${team(e.teamId).short})${e.moment && e.moment !== 'Opening goal' ? ' · ' + e.moment : ''}${e.tags.length ? ' · ' + e.tags.join(', ') : ''}`)}><circle cx="${x(e.t)}" cy="${y(n)}" r="11" class="hit"/><circle class="fdot" cx="${x(e.t)}" cy="${y(n)}" r="4.5" fill="${col[e.side]}" stroke="var(--panel)" stroke-width="2"/></g>`;
      }
      s += `<line class="fc-head" x1="${m.l}" x2="${m.l}" y1="${m.t - 4}" y2="${H - m.b}" style="opacity:${done ? 0 : 1}"/>
        <text class="fc-ro" x="${m.l + 2}" y="12" style="font-size:13px;font-weight:700;letter-spacing:.06em">${code.away} <tspan class="fc-a">${done ? g.away.score : 0}</tspan> – <tspan class="fc-h">${done ? g.home.score : 0}</tspan> ${code.home}<tspan class="fc-clk" style="fill:var(--ink3);font-weight:600"> ${done ? '· FINAL' : ''}</tspan></text>
        <g class="fev${on}" data-x="${w - m.r}"><text x="${w - m.r + 6}" y="${y(g[us].score) + 4}" class="t-us" style="font-size:14px">${g[us].score}</text><text x="${w - m.r + 6}" y="${y(g[them].score) + 4}" class="t-strong" style="font-size:14px">${g[them].score}</text></g>`;
      return s + '</svg>';
    });
    function frame(k) {
      const svg = el.querySelector('svg'); if (!svg || !geo) return;
      const { w, m } = geo, xs = m.l + k * (w - m.l - m.r);
      svg.querySelector('.fc-clip').setAttribute('width', k >= 1 ? w : xs);
      const head = svg.querySelector('.fc-head');
      head.setAttribute('x1', xs); head.setAttribute('x2', xs); head.style.opacity = k >= 1 ? 0 : 1;
      let h = 0, a = 0;
      svg.querySelectorAll('.fev').forEach((n) => {
        const hit = +n.dataset.x <= xs + 0.5 || k >= 1;
        n.classList.toggle('on', hit);
        if (hit && n.dataset.side) n.dataset.side === 'home' ? h++ : a++;
      });
      svg.querySelector('.fc-h').textContent = h; svg.querySelector('.fc-a').textContent = a;
      const secs = k * T, p = Math.min(nPer, Math.floor(secs / PER) + 1), left = Math.max(0, PER - (secs - (p - 1) * PER));
      svg.querySelector('.fc-clk').textContent = k >= 1 ? ' · FINAL' : ` · ${p <= 3 ? 'P' + p : 'OT'} ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
    }
    function play() {
      if (RM) { state = 'done'; frame(1); return; }
      cancelAnimationFrame(raf);
      state = 'playing';
      const D = 2800, t0 = performance.now();
      const step = (now) => {
        const k = Math.min(1, (now - t0) / D);
        frame(k);
        if (k < 1) raf = requestAnimationFrame(step); else state = 'done';
      };
      raf = requestAnimationFrame(step);
    }
    if (state === 'idle') {
      if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver((ents) => { if (ents.some((e) => e.isIntersecting)) { io.disconnect(); play(); } }, { threshold: 0.45 });
        io.observe(el);
      } else play();
    }
    return { play };
  }

  // Tiny static game-flow sparkline for result cards.
  function miniFlow(g, focus) {
    const PER = (S.meta.regulationMinutes || 45) / 3 * 60, T = PER * Math.max(3, g.periods.length), W = 120, H = 30;
    const us = String(focus) === String(g.away.id) ? 'away' : 'home', them = us === 'home' ? 'away' : 'home';
    const mx = Math.max(1, g.home.score, g.away.score), goals = g.ev.filter((e) => e.type === 'goal');
    const path = (side) => { let d = `M0,${H - 2}`, n = 0; for (const e of goals) if (e.side === side) d += `H${(e.t / T) * W}V${H - 2 - (++n / mx) * (H - 5)}`; return d + `H${W}`; };
    return `<svg class="mini" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="${path(them)}" fill="none" stroke="var(--red)" stroke-width="1.5" vector-effect="non-scaling-stroke"/><path d="${path(us)}" fill="none" stroke="var(--us)" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
  }

  // Season progression: cumulative GF (gold) vs GA (red) by game, weekend bands, W/L strip.
  function progChart(el, t) {
    const R = t.results;
    mount(el, (w) => {
      if (!R.length) return '<div class="empty">No games yet</div>';
      const H = 240, m = { l: 30, r: 36, t: 14, b: 58 }, n = R.length, step = (w - m.l - m.r) / n;
      let gf = 0, ga = 0;
      const pts = R.map((r) => ({ ...r, cf: (gf += r.gf), ca: (ga += r.ga), wk: weekKey(r.date) }));
      const mx = ticks(Math.max(1, gf, ga), 4).at(-1), y = lin(0, mx, H - m.b, m.t), x = (i) => m.l + step * (i + 0.5);
      let s = `<svg width="${w}" height="${H}" role="img" aria-label="${esc(t.short)} cumulative goals for and against">`;
      for (const v of ticks(mx, 4)) s += `<line class="gr" x1="${m.l}" x2="${w - m.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end" style="font-size:11px;fill:var(--ink3)">${v}</text>`;
      // weekend groups
      let start = 0;
      pts.forEach((p, i) => {
        const last = i === n - 1 || pts[i + 1].wk !== p.wk;
        if (!last) return;
        const x0 = m.l + step * start, x1 = m.l + step * (i + 1), wk = pts.slice(start, i + 1);
        const rec = ['W', 'L', 'T'].map((r) => wk.filter((q) => q.r === r).length);
        if (start > 0) s += `<line class="ax" x1="${x0}" x2="${x0}" y1="${m.t}" y2="${H - m.b + 30}"/>`;
        s += `<text x="${(x0 + x1) / 2}" y="${H - m.b + 44}" text-anchor="middle" style="font-size:11px;fill:var(--ink2)">${esc(weekLabel(p.wk).toUpperCase())}</text>
              <text x="${(x0 + x1) / 2}" y="${H - m.b + 56}" text-anchor="middle" style="font-size:10px;fill:var(--ink3)">${rec[0]}-${rec[1]}-${rec[2]}</text>`;
        start = i + 1;
      });
      const line = (k) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p[k])}`).join('');
      const len = w * 2;
      s += `<path class="draw" style="--len:${len}" d="M${m.l},${y(0)}L${line('ca').slice(1)}" fill="none" stroke="var(--red)" stroke-width="2" stroke-linejoin="round"/>
            <path class="draw" style="--len:${len}" d="M${m.l},${y(0)}L${line('cf').slice(1)}" fill="none" stroke="var(--us)" stroke-width="2.5" stroke-linejoin="round"/>`;
      pts.forEach((p, i) => {
        const o = team(p.opp);
        s += `<g class="fade" ${tip(`${dt(p.date)} ${p.home ? 'vs' : '@'} ${o.short}`, `${p.r} ${p.gf}–${p.ga} · season ${p.cf} GF, ${p.ca} GA`)}>
          <rect class="hit" x="${m.l + step * i}" y="${m.t}" width="${step}" height="${H - m.b - m.t + 24}"/>
          <circle cx="${x(i)}" cy="${y(p.cf)}" r="3.5" fill="var(--us)"/><circle cx="${x(i)}" cy="${y(p.ca)}" r="3" fill="var(--red)"/>
          <rect x="${m.l + step * i + 1.5}" y="${H - m.b + 10}" width="${Math.max(2, step - 3)}" height="12" fill="${p.r === 'W' ? 'var(--us)' : p.r === 'L' ? '#5A2A22' : 'var(--line2)'}"/>
          ${step >= 16 ? `<text x="${x(i)}" y="${H - m.b + 20}" text-anchor="middle" style="font-size:9px;fill:${p.r === 'W' ? '#111' : 'var(--ink)'};font-weight:800">${p.r}</text>` : ''}</g>`;
      });
      s += `<text x="${w - m.r + 6}" y="${y(gf) + 4}" class="t-us" style="font-size:14px">${gf}</text><text x="${w - m.r + 6}" y="${y(ga) + 4}" class="t-strong" style="font-size:14px">${ga}</text>`;
      return s + '</svg>';
    });
  }

  // When goals happen: each period split into five 3-minute stretches. Goals scored rise above the
  // centre line, goals allowed hang below it. Plain-language takeaways are written to `notes`.
  // up/down: { label, color, goals: [event] }; down is optional (division view).
  function timingChart(el, { up, down = null, notes = null }) {
    const PER = (S.meta.regulationMinutes || 45) / 3 * 60, B = 5, bucket = PER / B, mins = Math.round(bucket / 60);
    const count = (goals) => {
      const c = Array(3 * B).fill(0);
      for (const e of goals) {
        if (!e.regulation || e.badClock) continue;
        const pn = Number(e.period) - 1;
        c[pn * B + Math.min(B - 1, Math.floor((e.t - pn * PER) / bucket))]++;
      }
      return c;
    };
    const U = count(up.goals), D = down ? count(down.goals) : null;
    const range = (i) => { const b = i % B; return `P${Math.floor(i / B) + 1}, ${b * mins}–${(b + 1) * mins} min`; };
    mount(el, (w) => {
      const gap = 14, m = { l: 4, r: 4, t: 18, b: 34 }, cw = (w - m.l - m.r - gap * 2) / (3 * B);
      const hUp = down ? 78 : 120, hDn = down ? 78 : 0, base = m.t + hUp, H = base + hDn + m.b;
      const mx = Math.max(1, ...U, ...(D || [0])), sy = (v) => (v / mx) * (hUp - 14);
      const bx = (i) => m.l + Math.floor(i / B) * gap + i * cw;
      let s = `<svg width="${w}" height="${H}" role="img" aria-label="When goals are scored, in 3-minute stretches of each period">`;
      for (let p = 0; p < 3; p++) {
        const x0 = bx(p * B), x1 = x0 + cw * B;
        s += `<rect x="${x0}" y="${m.t - 6}" width="${cw * B}" height="${hUp + hDn + 12}" fill="var(--panel2)" opacity=".55"/>
          <text x="${(x0 + x1) / 2}" y="${H - m.b + 18}" text-anchor="middle" class="t-strong" style="font-size:14px">P${p + 1}</text>
          <text x="${x0 + 2}" y="${H - m.b + 30}" style="font-size:10px;fill:var(--ink3)">START</text>
          <text x="${x1 - 2}" y="${H - m.b + 30}" text-anchor="end" style="font-size:10px;fill:var(--ink3)">END</text>`;
      }
      s += `<line x1="${m.l}" x2="${w - m.r}" y1="${base}" y2="${base}" style="stroke:var(--ink3);opacity:.7"/>`;
      const bar = (v, i, dir, color, label) => {
        if (!v) return '';
        const x = bx(i) + 2, bw = Math.max(2, cw - 4), hh = sy(v);
        const d = dir > 0 ? vbar(x, base - 1, base - 1 - hh, bw, 2) : `M${x},${base + 1}V${base + 1 + hh - 2}Q${x},${base + 1 + hh} ${x + 2},${base + 1 + hh}H${x + bw - 2}Q${x + bw},${base + 1 + hh} ${x + bw},${base + 1 + hh - 2}V${base + 1}Z`;
        const ty = dir > 0 ? base - hh - 6 : base + hh + 15;
        return `<g ${tip(`${label} · ${range(i)}`, `${v} goal${v === 1 ? '' : 's'}`)}><rect class="hit" x="${bx(i)}" y="${dir > 0 ? m.t : base}" width="${cw}" height="${dir > 0 ? hUp : hDn}"/>
          <path class="gv ${dir < 0 ? 'dn' : ''}" style="transition-delay:${i * 30}ms" fill="${color}" d="${d}"/>
          ${cw >= 14 ? `<text class="fade t-strong" x="${x + bw / 2}" y="${ty}" text-anchor="middle" style="font-size:12px">${v}</text>` : ''}</g>`;
      };
      U.forEach((v, i) => (s += bar(v, i, 1, up.color, up.label)));
      if (D) D.forEach((v, i) => (s += bar(v, i, -1, down.color, down.label)));
      return s + '</svg>';
    });
    if (notes) {
      const tot = (c) => c.reduce((a, b) => a + b, 0);
      const per = (c) => [0, 1, 2].map((p) => c.slice(p * B, p * B + B).reduce((a, b) => a + b, 0));
      const late = (c) => [0, 1, 2].reduce((n, p) => n + c[p * B + B - 1], 0);
      const early = (c) => [0, 1, 2].reduce((n, p) => n + c[p * B], 0);
      const peak = (c) => { const v = Math.max(...c), i = c.indexOf(v), b = i % B; return v ? `P${Math.floor(i / B) + 1}, minutes ${b * mins}–${(b + 1) * mins} (${v} goal${v === 1 ? '' : 's'})` : '—'; };
      const best = (c) => { const p = per(c), v = Math.max(...p); return p.map((x, i) => (x === v ? 'P' + (i + 1) : null)).filter(Boolean).join(' & '); };
      const lines = [];
      if (tot(U)) {
        lines.push(`<b>${esc(up.label)} most:</b> ${esc(peak(U))}`);
        lines.push(`<b>By period:</b> ${per(U).map((v, i) => `P${i + 1} ${v}`).join(' · ')} — strongest ${best(U)}`);
        lines.push(`<b>First 3 min of a period:</b> ${early(U)} · <b>last 3 min:</b> ${late(U)}`);
      }
      if (D && tot(D)) lines.push(`<b>${esc(down.label)} most:</b> ${esc(peak(D))} · by period ${per(D).map((v, i) => `P${i + 1} ${v}`).join(' · ')}`);
      notes.innerHTML = lines.length ? `<ul class="ins">${lines.map((l) => `<li>${l}</li>`).join('')}</ul>` : '';
    }
  }

  // Linemates: who sets up whom on one team, from goal/assist pairs. Circle layout, curved links.
  // Link width/colour = goals the pair combined on; node size = assisted goals the player was part of.
  // `controls` gets a legend + quick-filter chips that spotlight part of the graph.
  function networkChart(el, teamId, { controls = null } = {}) {
    const pairs = new Map(), involvement = new Map(), passes = new Map(), finishes = new Map();
    let goals = 0, assisted = 0;
    const first = (id) => playerById.get(id)?.name.split(' ')[0] || '?';
    for (const g of S.games) for (const e of g.ev) {
      if (e.type !== 'goal' || String(e.teamId) !== String(teamId) || !e.playerId) continue;
      goals++;
      const as = e.assists.filter((a) => a.playerId && a.playerId !== e.playerId);
      if (as.length) { assisted++; finishes.set(e.playerId, (finishes.get(e.playerId) || 0) + 1); }
      for (const a of as) {
        const [lo, hi] = [a.playerId, e.playerId].sort(), k = `${lo}|${hi}`;
        const p = pairs.get(k) || { k, a: lo, b: hi, n: 0, detail: [] };
        p.n++; p.detail.push(`${first(a.playerId)} → ${first(e.playerId)}`);
        pairs.set(k, p);
        passes.set(a.playerId, (passes.get(a.playerId) || 0) + 1);
        for (const id of [a.playerId, e.playerId]) involvement.set(id, (involvement.get(id) || 0) + 1);
      }
    }
    const P = [...pairs.values()];
    const nodes = [...involvement.keys()].map((id) => playerById.get(id)).filter(Boolean).sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0));
    const linksOf = (id) => P.filter((p) => p.a === id || p.b === id);
    const degree = new Map(nodes.map((n) => [n.id, linksOf(n.id).length]));
    const tier = (n) => (n >= 3 ? 3 : n);
    const style = (n) => ({ w: [0, 1.6, 3.4, 5.6][tier(n)], c: n >= 3 ? 'var(--us)' : 'var(--blue)', o: [0, 0.45, 0.7, 0.9][tier(n)] });

    // quick filters: each spotlights a set of players + links
    const top = (map) => { const v = Math.max(0, ...map.values()); return v ? { v, ids: [...map].filter(([, x]) => x === v).map(([id]) => id) } : null; };
    const names = (ids) => ids.map((id) => playerById.get(id)?.name).filter(Boolean).join(' & ');
    const filters = [];
    const duo = P.length ? Math.max(...P.map((p) => p.n)) : 0;
    if (duo > 1) {
      const best = P.filter((p) => p.n === duo);
      filters.push({ id: 'duo', label: 'Top duo', nodes: new Set(best.flatMap((p) => [p.a, p.b])), links: new Set(best.map((p) => p.k)),
        caption: best.map((p) => `<b>${esc(names([p.a, p.b]))}</b> — ${p.n} goals together`).join('<br>') });
    }
    const conn = top(degree);
    if (conn) filters.push({ id: 'conn', label: 'Most connected', nodes: new Set(conn.ids.flatMap((id) => [id, ...linksOf(id).flatMap((p) => [p.a, p.b])])), links: new Set(conn.ids.flatMap((id) => linksOf(id).map((p) => p.k))),
      caption: `<b>${esc(names(conn.ids))}</b> — ${conn.ids.length > 1 ? 'each have' : 'has'} combined with ${conn.v} different teammate${conn.v === 1 ? '' : 's'}` });
    const pm = top(passes);
    if (pm) filters.push({ id: 'pm', label: 'Top playmaker', nodes: new Set(pm.ids.flatMap((id) => [id, ...linksOf(id).flatMap((p) => [p.a, p.b])])), links: new Set(pm.ids.flatMap((id) => linksOf(id).map((p) => p.k))),
      caption: `<b>${esc(names(pm.ids))}</b> — set up ${pm.v} goal${pm.v > 1 ? 's' : ''} for teammates` });
    const fin = top(finishes);
    if (fin) filters.push({ id: 'fin', label: 'Top finisher', nodes: new Set(fin.ids.flatMap((id) => [id, ...linksOf(id).flatMap((p) => [p.a, p.b])])), links: new Set(fin.ids.flatMap((id) => linksOf(id).map((p) => p.k))),
      caption: `<b>${esc(names(fin.ids))}</b> — scored ${fin.v} goal${fin.v > 1 ? 's' : ''} off a teammate's pass` });
    const favs = [...favPlayers()].filter((id) => involvement.has(id));
    if (favs.length) filters.push({ id: 'fav', label: 'Following', nodes: new Set(favs.flatMap((id) => [id, ...linksOf(id).flatMap((p) => [p.a, p.b])])), links: new Set(favs.flatMap((id) => linksOf(id).map((p) => p.k))),
      caption: favs.map((id) => `<b>${esc(playerById.get(id).name)}</b> — linked with ${degree.get(id)} teammate${degree.get(id) === 1 ? '' : 's'}`).join('<br>') });
    let active = null;

    el.classList.add('net');
    mount(el, (w) => {
      if (!nodes.length) return '<div class="empty">No assisted goals yet</div>';
      const H = Math.min(440, Math.max(300, w * 0.8)), cx = w / 2, cy = H / 2, R = Math.min(w, H) / 2 - 58;
      const pos = new Map(nodes.map((p, i) => { const a = -Math.PI / 2 + (i / nodes.length) * Math.PI * 2; return [p.id, { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a), a }]; }));
      const mxI = Math.max(1, ...involvement.values());
      let s = `<svg width="${w}" height="${H}" role="img" aria-label="Assist connections between teammates">`;
      let badges = '';
      [...P].sort((a, b) => a.n - b.n).forEach((p, i) => {
        const A = pos.get(p.a), Bp = pos.get(p.b); if (!A || !Bp) return;
        const mx = (A.x + Bp.x) / 2, my = (A.y + Bp.y) / 2, qx = mx + (cx - mx) * 0.55, qy = my + (cy - my) * 0.55, st = style(p.n);
        // count badge at the curve's midpoint (quadratic bezier at t = 0.5)
        const bx = 0.25 * A.x + 0.5 * qx + 0.25 * Bp.x, by = 0.25 * A.y + 0.5 * qy + 0.25 * Bp.y;
        badges += `<g class="fade lbadge n${Math.min(p.n, 2)} ${active?.links.has(p.k) ? 'hl' : ''}" style="transition-delay:${320 + i * 20}ms" data-k="${p.k}" data-a="${p.a}" data-b="${p.b}" ${tip(names([p.a, p.b]), `${p.n} goal${p.n > 1 ? 's' : ''} together · ${p.detail.join(' · ')}`)}>
          <circle cx="${bx}" cy="${by}" r="${p.n >= 10 ? 10 : 8.5}" fill="var(--panel)" stroke="${st.c}" stroke-width="1.5"/>
          <text x="${bx}" y="${by + 4}" text-anchor="middle" style="font-size:11px;font-weight:800;fill:${p.n >= 3 ? 'var(--us)' : 'var(--ink)'}">${p.n}</text></g>`;
        s += `<path class="fade link ${active?.links.has(p.k) ? 'hl' : ''}" style="transition-delay:${200 + i * 20}ms" data-k="${p.k}" data-a="${p.a}" data-b="${p.b}" d="M${A.x},${A.y}Q${qx},${qy} ${Bp.x},${Bp.y}" fill="none" stroke="${st.c}" stroke-width="${st.w}" stroke-opacity="${st.o}" stroke-linecap="round" ${tip(`${names([p.a, p.b])}`, `${p.n} goal${p.n > 1 ? 's' : ''} together · ${p.detail.join(' · ')}`)}/>`;
      });
      s += badges;
      nodes.forEach((p) => {
        const Pp = pos.get(p.id), r = 5 + 9 * ((involvement.get(p.id) || 0) / mxI), right = Math.cos(Pp.a) >= 0;
        const lx = Pp.x + Math.cos(Pp.a) * (r + 8), ly = Pp.y + Math.sin(Pp.a) * (r + 8) + 4;
        s += `<a href="#/player/${p.id}"><g class="node ${active?.nodes.has(p.id) ? 'hl' : ''}" data-id="${p.id}" ${tip(p.name, `${p.g} G · ${p.a} A · set up ${passes.get(p.id) || 0}, finished ${finishes.get(p.id) || 0} · ${degree.get(p.id)} linemate${degree.get(p.id) === 1 ? '' : 's'}`)}>
          <circle cx="${Pp.x}" cy="${Pp.y}" r="${r + 6}" class="hit"/>
          <circle cx="${Pp.x}" cy="${Pp.y}" r="${r}" fill="var(--panel2)" stroke="var(--ink2)" stroke-width="2"/>
          <text x="${lx}" y="${ly}" text-anchor="${Math.abs(Math.cos(Pp.a)) < 0.25 ? 'middle' : right ? 'start' : 'end'}" style="font-size:12px">${esc(p.name.split(' ')[0])} <tspan style="fill:var(--ink3)">#${esc(p.number)}</tspan></text></g></a>`;
      });
      return s + '</svg>';
    });
    const apply = (f) => {
      active = f;
      el.classList.toggle('focus', !!f);
      el.querySelectorAll('.link, .lbadge').forEach((l) => l.classList.toggle('hl', !!f && f.links.has(l.dataset.k)));
      el.querySelectorAll('.node').forEach((n) => n.classList.toggle('hl', !!f && f.nodes.has(n.dataset.id)));
      if (controls) {
        controls.querySelectorAll('.qf').forEach((b) => b.classList.toggle('on', b.dataset.f === (f ? f.id : '')));
        controls.querySelector('.qcap').innerHTML = f ? f.caption : 'Pick a filter to spotlight part of the chart, or hover a player.';
      }
    };
    // hover a player: fade links that don't touch them (temporarily overrides a filter)
    el.addEventListener('pointerover', (e) => {
      const n = e.target.closest?.('.node'); if (!n) return;
      el.querySelectorAll('.link, .lbadge').forEach((l) => {
        const on = l.dataset.a === n.dataset.id || l.dataset.b === n.dataset.id;
        l.style.opacity = on ? '1' : l.classList.contains('lbadge') ? '0' : '.06';
      });
    });
    el.addEventListener('pointerout', (e) => { if (e.target.closest?.('.node')) el.querySelectorAll('.link, .lbadge').forEach((l) => (l.style.opacity = '')); });
    if (controls && nodes.length) {
      const present = [1, 2, 3].filter((t) => P.some((p) => tier(p.n) === t));
      const sample = (t) => { const st = style(t === 3 ? 3 : t); return `<svg width="26" height="10" aria-hidden="true"><line x1="1" x2="25" y1="5" y2="5" stroke="${st.c}" stroke-width="${st.w}" stroke-opacity="${st.o}" stroke-linecap="round"/></svg>`; };
      controls.innerHTML = `
        <div class="legend net-legend">${present.map((t) => `<span>${sample(t)}${t === 3 ? '3+ goals together' : t === 2 ? '2 goals together' : '1 goal together'}</span>`).join('')}
          <span><svg width="20" height="18" aria-hidden="true"><circle cx="10" cy="9" r="7.5" fill="var(--panel)" stroke="var(--us)" stroke-width="1.5"/><text x="10" y="12.5" text-anchor="middle" style="font:800 10px var(--cond);fill:var(--us)">4</text></svg>Number on a line = goals together</span>
          <span><svg width="26" height="14" aria-hidden="true"><circle cx="5" cy="7" r="3.5" fill="var(--panel2)" stroke="var(--ink2)" stroke-width="1.5"/><circle cx="18" cy="7" r="6" fill="var(--panel2)" stroke="var(--ink2)" stroke-width="1.5"/></svg>Bigger = part of more assisted goals</span></div>
        <div class="qfs"><button class="qf on" data-f="">Everyone</button>${filters.map((f) => `<button class="qf" data-f="${f.id}">${esc(f.label)}</button>`).join('')}</div>
        <div class="qcap"></div>`;
      controls.addEventListener('click', (e) => {
        const b = e.target.closest('.qf'); if (!b) return;
        const f = filters.find((x) => x.id === b.dataset.f) || null;
        apply(active && f && active.id === f.id ? null : f);
      });
      apply(null);
    }
    return { goals, assisted };
  }

  // A player's season by weekend: stacked goals/assists per weekend, running total above.
  function weekendChart(el, p) {
    const by = new Map();
    for (const l of p.log) {
      const k = weekKey(l.date), w = by.get(k) || { k, g: 0, a: 0, gp: 0 };
      w.g += l.g; w.a += l.a; w.gp++; by.set(k, w);
    }
    const W = [...by.values()].sort((a, b) => a.k.localeCompare(b.k));
    mount(el, (w) => {
      if (!W.length) return '<div class="empty">No games yet</div>';
      const H = 200, m = { l: 24, r: 8, t: 26, b: 40 }, step = (w - m.l - m.r) / Math.max(W.length, 4), bw = Math.min(46, step * 0.55);
      const mx = Math.max(4, ...W.map((x) => x.g + x.a)), y = lin(0, mx, H - m.b, m.t);
      let s = `<svg width="${w}" height="${H}" role="img" aria-label="${esc(p.name)} points by weekend">`;
      for (const v of ticks(mx, 4)) s += `<line class="gr" x1="${m.l}" x2="${w - m.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end" style="font-size:11px;fill:var(--ink3)">${v}</text>`;
      let run = 0;
      W.forEach((x, i) => {
        run += x.g + x.a;
        const bx = m.l + step * i + step / 2 - bw / 2, yg = y(x.g), yt = y(x.g + x.a);
        s += `<g ${tip(`Weekend of ${weekLabel(x.k)}`, `${x.gp} games · ${x.g} G · ${x.a} A · ${run} season points`)}>
          <rect class="hit" x="${m.l + step * i}" y="${m.t}" width="${step}" height="${H - m.t - m.b}"/>
          ${x.g ? `<path class="gv" style="transition-delay:${i * 70}ms" fill="var(--us)" d="${x.a ? `M${bx},${H - m.b}V${yg}H${bx + bw}V${H - m.b}Z` : vbar(bx, H - m.b, yg, bw)}"/>` : ''}
          ${x.a ? `<path class="gv" style="transition-delay:${i * 70 + 60}ms" fill="var(--blue)" d="${vbar(bx, x.g ? yg - 2 : H - m.b, yt, bw)}"/>` : ''}
          <text class="fade t-strong" x="${bx + bw / 2}" y="${(x.g + x.a ? yt : H - m.b) - 6}" text-anchor="middle" style="font-size:15px">${x.g + x.a}</text>
          <text x="${bx + bw / 2}" y="${H - m.b + 16}" text-anchor="middle" style="font-size:12px">${esc(weekLabel(x.k).toUpperCase())}</text>
          <text x="${bx + bw / 2}" y="${H - m.b + 30}" text-anchor="middle" style="font-size:10px;fill:var(--ink3)">${x.gp} GP · ${run} total</text></g>`;
      });
      return s + `<line class="ax" x1="${m.l}" x2="${w - m.r}" y1="${H - m.b}" y2="${H - m.b}"/></svg>`;
    });
  }

  const firstsList = (items, { showPlayer = false } = {}) => (items.length
    ? `<ol class="evs">${items.map((f) => `<li class="ev moment"><span class="pn">${f.kind === 'first' ? '★' : '◆'}</span><span class="tc">${dt(f.date)}</span><span class="who"><b>${showPlayer ? `${playerLink(f.player.id, f.player.name)} · ` : ''}${esc(f.label)}</b><span>${f.gameId ? `<a class="lnk" href="#/game/${f.gameId}">vs ${esc(team(f.opp).short)}</a>` : ''}</span></span><span></span></li>`).join('')}</ol>`
    : '<div class="empty">Nothing yet — it\'s early</div>');

  // ------------------------------------------------------------ shared blocks
  function hero(t, { action = '' } = {}) {
    const diffRank = [...S.teams].sort((a, b) => b.diff - a.diff).findIndex((x) => x.id === t.id) + 1;
    const stats = [
      ['Points', counter(t.pts), `${pct(t.ptsPct, 0)} pts%`],
      ['Goals for', counter(t.gf), `${t.gfPerGame.toFixed(2)} / game`],
      ['Goals against', counter(t.ga), `${t.gaPerGame.toFixed(2)} / game`],
      ['Differential', counter(t.diff, 'sign'), `${ordinal(diffRank)} in division`],
      ['Power play', counter(t.ppPct, 'pct', 1), `${t.ppg} of ${t.ppo} chances`],
      ['Penalty kill', counter(t.pkPct, 'pct', 1), `${t.tsh - t.ppga} of ${t.tsh} killed`],
    ];
    return `<section class="hero" data-reveal>
      ${action ? `<div class="act">${action}</div>` : ''}
      <div class="plate wipe">${logo(t)}<div><div class="rk">#${t.rank} in division${t.streak ? ' · ' + esc(t.streak) : ''}</div><h1>${esc(t.name)}</h1>
      <div class="rec"><b>${t.w}-${t.l}-${t.t}</b> &nbsp;·&nbsp; ${t.pts} PTS &nbsp;·&nbsp; Home ${t.home.w}-${t.home.l}-${t.home.t} &nbsp;·&nbsp; Away ${t.away.w}-${t.away.l}-${t.away.t}</div></div></div>
      <div class="stats">${stats.map(([l, v, s]) => `<div class="st"><span class="l">${l}</span><span class="v">${v}</span><span class="s">${s}</span></div>`).join('')}</div>
    </section>`;
  }

  const GOALIE_NOTE = 'Goalie minutes and shots come from the league’s goalie reports, which are sometimes incomplete — treat SV% and GAA as approximate. W-L-T goes to the goalie with the most minutes.';
  const goalieCols = (showTeam) => [
    { key: 'name', label: 'Goalie', cls: 'l', val: (g) => g.name, desc: false, html: (g) => `${playerLink(g.id, g.name)}<span class="sub2">#${esc(g.number)}</span>` },
    ...(showTeam ? [{ key: 'team', label: 'Team', cls: 'l', val: (g) => team(g.teamId).short, desc: false, html: (g) => { const t = team(g.teamId); return `<span class="tn">${logo(t)}<span class="full">${esc(t.short)}</span><span class="cd">${esc(t.code)}</span></span>`; } }] : []),
    { key: 'gp', label: 'GP', val: (g) => g.gp },
    { key: 'rec', label: 'W-L-T', cls: 'hm', val: (g) => g.w * 2 + g.t, html: (g) => `${g.w}-${g.l}-${g.t}` },
    { key: 'min', label: 'MIN', cls: 'hm', val: (g) => g.seconds, html: (g) => g.minutes },
    { key: 'sa', label: 'SA', val: (g) => g.shots, title: 'Shots against' },
    { key: 'ga', label: 'GA', val: (g) => g.ga },
    { key: 'sv', label: 'SV%', val: (g) => g.svPct, html: (g) => `<span class="pts" style="font-size:16px">${rate(g.svPct)}</span>` },
    { key: 'gaa', label: 'GAA', val: (g) => g.gaa, html: (g) => (g.gaa == null ? '—' : g.gaa.toFixed(2)), title: 'Goals against per full game' },
    { key: 'so', label: 'SO', cls: 'hm', val: (g) => g.so, title: 'Shutouts' },
  ];

  function standingsCols(full) {
    return [
      { key: 'rank', label: '#', cls: 'rkc', val: (t) => t.rank, desc: false },
      { key: 'name', label: 'Team', cls: 'l', val: (t) => t.name, desc: false, html: tn },
      { key: 'gp', label: 'GP', cls: full ? 'hm' : 'hm hm2', val: (t) => t.gp },
      { key: 'w', label: 'W', val: (t) => t.w }, { key: 'l', label: 'L', val: (t) => t.l },
      { key: 't', label: 'T', cls: full ? '' : 'hm hm2', val: (t) => t.t },
      { key: 'pts', label: 'PTS', val: (t) => t.pts, html: (t) => `<span class="pts">${t.pts}</span>` },
      { key: 'gf', label: 'GF', cls: 'hm', val: (t) => t.gf }, { key: 'ga', label: 'GA', cls: 'hm', val: (t) => t.ga },
      { key: 'diff', label: 'DIFF', val: (t) => t.diff, html: (t) => `<span class="${t.diff > 0 ? 'pos' : t.diff < 0 ? 'neg' : ''}">${sign(t.diff)}</span>` },
      ...(full ? [
        { key: 'hm', label: 'Home', cls: 'hm', val: (t) => t.home.w * 2 + t.home.t, html: (t) => `${t.home.w}-${t.home.l}-${t.home.t}` },
        { key: 'aw', label: 'Away', cls: 'hm', val: (t) => t.away.w * 2 + t.away.t, html: (t) => `${t.away.w}-${t.away.l}-${t.away.t}` },
      ] : []),
      { key: 'pp', label: 'PP%', cls: 'hm', val: (t) => t.ppPct, html: (t) => pct(t.ppPct) },
      { key: 'pk', label: 'PK%', cls: 'hm', val: (t) => t.pkPct, html: (t) => pct(t.pkPct) },
      ...(full ? [
        { key: 'sv', label: 'SV%', cls: 'hm', val: (t) => t.svPct, html: (t) => rate(t.svPct), title: 'Team save %' },
        { key: 'pim', label: 'PIM', cls: 'hm', val: (t) => t.pim, title: 'Team penalty minutes' },
      ] : []),
      { key: 'l5', label: 'L5', sort: false, val: (t) => t.last5, html: (t) => L5(t.last5) },
    ];
  }
  const mineRow = (t) => (String(t.id) === myTeamId() ? 'me' : '');

  // Game cards: upcoming (date/opponent/rink) or results (with W/L from a team's perspective)
  function gameCards(items, perspective) {
    if (!items.length) return '<div class="empty">No games</div>';
    return `<div class="next wrap4">${items.map((x) => {
      const p = perspective && involves(x, perspective) ? String(perspective) : null;
      const home = p ? String(x.home) === p : true;
      const o = team(p ? (home ? x.away : x.home) : x.away), h = team(x.home);
      const d = dt(x.start, { weekday: 'short', month: 'short', day: 'numeric' });
      const who = `<span><small>${p ? (home ? 'VS' : '@') : ''}</small> ${esc(o.short)}${p ? '' : ` <small>@</small> ${esc(h.short)}`}</span>`;
      let inner;
      if (x.final) {
        const my = p ? (home ? x.homeScore : x.awayScore) : x.awayScore, op = p ? (home ? x.awayScore : x.homeScore) : x.homeScore;
        const r = p ? (my > op ? 'W' : my < op ? 'L' : 'T') : '';
        const g = x.hasDetail ? gameById.get(x.id) : null;
        inner = `<div class="d">${p ? haBadge(home) : ''}${d} · Final${g?.comeback ? ' · <span class="cbk">Comeback</span>' : ''}</div><div class="o">${logo(o)}${who}<span class="res ${r}">${r ? r + ' ' : ''}${my}–${op}</span></div><div class="r">${esc(x.location || '')}</div>
          ${g ? `<div class="cta">${miniFlow(g, p || x.away)}<span>Game flow &amp; summary <b>→</b></span></div>` : ''}`;
      } else {
        inner = `<div class="d">${p ? haBadge(home) : ''}${d} · ${tm(x.start)}</div><div class="o">${logo(o)}${who}</div><div class="r">${esc(x.location || '')}${o.stub ? '' : ` · opp ${o.w}-${o.l}-${o.t}`}</div>`;
      }
      return x.final && x.hasDetail ? `<a class="nx" href="#/game/${x.id}">${inner}</a>` : `<div class="nx">${inner}</div>`;
    }).join('')}</div>`;
  }

  function leaderRows(players, highlight) {
    return players.map((p) => {
      const t = team(p.teamId);
      return `<a class="ld ${highlight(p) ? 'me' : ''}" href="#/player/${p.id}"><span class="n">${p.rank}</span>${logo(t)}<span class="nm"><b>${esc(p.name)}</b><span>#${esc(p.number)} · ${esc(t.short)}</span></span><span class="ga">${p.g}G ${p.a}A</span><span class="p">${p.pts}</span></a>`;
    }).join('');
  }

  // ------------------------------------------------------------ views
  // Featured game: the big animated game-flow chart with a clear way into the full summary.
  function featuredGame(g, focusId, title) {
    const us = String(focusId) === String(g.away.id) ? 'away' : 'home', them = us === 'home' ? 'away' : 'home';
    const U = team(g[us].id), O = team(g[them].id), r = g[us].score > g[them].score ? 'W' : g[us].score < g[them].score ? 'L' : 'T';
    const moments = g.ev.filter((e) => e.type === 'goal' && e.side === us && e.moment && e.moment !== 'Opening goal').length;
    after(() => {
      const fc = flowChart($('#feat-flow'), g, { focus: focusId });
      $('#feat-replay').addEventListener('click', (e) => { e.preventDefault(); fc.play(); });
    });
    return `<section class="panel feat" data-reveal style="margin-bottom:18px">
      <div class="ph"><h2 class="gold">${title}</h2><span class="meta">${dt(g.date, { weekday: 'short', month: 'short', day: 'numeric' })} · ${esc(g.rink)}</span></div>
      <div class="feat-body">
        <div class="feat-score">
          <div class="fs-row">${logo(U)}<span class="nm">${esc(U.short)}</span><span class="sc">${g[us].score}</span></div>
          <div class="fs-row lo">${logo(O)}<span class="nm">${esc(O.short)}</span><span class="sc">${g[them].score}</span></div>
          <div class="fs-res"><span class="res ${r}">${r === 'W' ? 'Win' : r === 'L' ? 'Loss' : 'Tie'}</span>${g.comeback === us ? ' · comeback' : ''}${moments ? ` · ${moments} tying/go-ahead goal${moments > 1 ? 's' : ''}` : ''}</div>
          <div class="feat-act"><a class="btn on" href="#/game/${g.id}">Full game summary →</a><button class="btn" id="feat-replay">↻ Replay</button></div>
        </div>
        <div class="feat-chart"><div class="legend"><span><i style="background:var(--us)"></i>${esc(U.short)}</span><span><i style="background:var(--red)"></i>${esc(O.short)}</span><span><i style="background:var(--ink3);opacity:.5"></i>Power play</span></div><div class="chart" id="feat-flow"></div></div>
      </div>
    </section>`;
  }

  function viewStandings() {
    const periods = [...new Set(S.teams.flatMap((t) => Object.keys(t.gfByPeriod)))].sort();
    after(() => {
      sortable($('#standings'), S.teams, standingsCols(true), { key: 'rank', dir: 1, rowCls: mineRow });
      gdChart($('#gd'), myTeamId());
      stChart($('#st'), myTeamId());
      timingChart($('#heat'), { up: { label: 'Goals scored', color: 'var(--blue)', goals: S.games.flatMap((g) => g.ev.filter((e) => e.type === 'goal')) }, notes: $('#heat-notes') });
      sortable($('#special'), S.teams, [
        { key: 'name', label: 'Team', cls: 'l', val: (t) => t.name, desc: false, html: tn },
        { key: 'ppg', label: 'PPG', val: (t) => t.ppg }, { key: 'ppo', label: 'PPO', val: (t) => t.ppo, title: 'Power-play opportunities' },
        { key: 'pp', label: 'PP%', val: (t) => t.ppPct, html: (t) => `<span class="pts" style="font-size:16px">${pct(t.ppPct)}</span>` },
        { key: 'tsh', label: 'TSH', cls: 'hm', val: (t) => t.tsh, title: 'Times shorthanded' }, { key: 'ppga', label: 'PPGA', cls: 'hm', val: (t) => t.ppga },
        { key: 'pk', label: 'PK%', val: (t) => t.pkPct, html: (t) => `<span class="pts" style="font-size:16px">${pct(t.pkPct)}</span>` },
        { key: 'shg', label: 'SHG', cls: 'hm', val: (t) => t.shg }, { key: 'sf', label: 'SF', cls: 'hm', val: (t) => t.sf, title: 'Shots for' },
        { key: 'sa', label: 'SA', cls: 'hm', val: (t) => t.sa, title: 'Shots against' },
        { key: 'sv', label: 'SV%', val: (t) => t.svPct, html: (t) => rate(t.svPct), title: 'Team save %' },
      ], { key: 'pp', rowCls: mineRow });
      sortable($('#periods'), S.teams, [
        { key: 'name', label: 'Team', cls: 'l', val: (t) => t.name, desc: false, html: tn },
        ...periods.flatMap((p) => [
          { key: 'f' + p, label: `P${p} GF`, val: (t) => t.gfByPeriod[p] || 0 },
          { key: 'a' + p, label: `P${p} GA`, cls: 'hm', val: (t) => t.gaByPeriod[p] || 0 },
        ]),
      ], { key: 'f' + (periods[0] || '1'), rowCls: mineRow });
    });
    return `
      <div class="ptitle"><div><div class="k">${esc(S.meta.season)} · ${esc(S.meta.division)}</div><h1>Standings</h1><div class="s">2 pts win · 1 pt tie · tap any column to sort</div></div></div>
      <div style="margin-bottom:18px">${panel('Division', '<div class="tw"><table id="standings"></table></div>', { gold: true, meta: `${S.meta.gamesPlayed} of ${S.meta.gamesScheduled} games final` })}</div>
      <div class="grid g-6-6">
        ${panel('Goal differential', '<div class="pb"><div class="chart" id="gd"></div></div>', { meta: 'GF − GA' })}
        ${panel('Special teams', '<div class="pb"><div class="chart" id="st"></div></div>', { meta: 'PP% × PK%' })}
      </div>
      <div style="margin-bottom:18px">${panel('Special teams &amp; shots', '<div class="tw"><table id="special"></table></div><div class="note">PP chances are counted from opponent minor/major penalties on the game sheet. Team save % leaves out sheets where shots weren\'t tracked.</div>')}</div>
      <div style="margin-bottom:18px">${panel('Goals by period', '<div class="tw"><table id="periods"></table></div>')}</div>
      <div style="margin-bottom:18px">${panel('When goals happen', '<div class="pb"><div class="legend"><span><i style="background:var(--blue)"></i>Goals in each 3-minute stretch</span></div><div class="chart" id="heat"></div><div id="heat-notes"></div></div>', { meta: 'Whole division · regulation' })}</div>`;
  }

  function viewSkaters() {
    const f = store.get('skaterFilter', { team: '', q: '' });
    f.team = f.team || ''; f.q = f.q || '';
    const favs = favPlayers();
    const apply = () => {
      const q = f.q.trim().toLowerCase();
      let n = 0;
      $app.querySelectorAll('#skaters tbody tr[data-id]').forEach((tr) => {
        const show = (!f.team || tr.dataset.team === f.team) && (!q || tr.dataset.name.includes(q));
        tr.style.display = show ? '' : 'none'; if (show) n++;
      });
      const c = $('#sk-count'); if (c) c.textContent = `${n} players · tap any column to sort`;
    };
    after(() => {
      sortable($('#skaters'), S.skaters, [
        { key: 'rank', label: '#', cls: 'rkc', val: (p) => p.rank, desc: false },
        { key: 'name', label: 'Player', cls: 'l', val: (p) => p.name, desc: false, html: (p) => `${playerLink(p.id, p.name)}${favs.has(p.id) ? '<span class="chip gwg">★</span>' : ''}<span class="sub2">#${esc(p.number)}</span>` },
        { key: 'team', label: 'Team', cls: 'l', val: (p) => team(p.teamId).short, desc: false, html: (p) => { const t = team(p.teamId); return `<span class="tn">${logo(t)}<span class="full">${esc(t.short)}</span><span class="cd">${esc(t.code)}</span></span>`; } },
        { key: 'gp', label: 'GP', cls: 'hm', val: (p) => p.gp },
        { key: 'g', label: 'G', val: (p) => p.g }, { key: 'a', label: 'A', val: (p) => p.a },
        { key: 'pts', label: 'PTS', val: (p) => p.pts, html: (p) => `<span class="pts">${p.pts}</span>` },
        { key: 'ppgp', label: 'P/GP', cls: 'hm', val: (p) => p.ptsPerGame, html: (p) => p.ptsPerGame.toFixed(2) },
        { key: 'ppg', label: 'PPG', cls: 'hm', val: (p) => p.ppg, title: 'Power-play goals' },
        { key: 'shg', label: 'SHG', cls: 'hm', val: (p) => p.shg, title: 'Shorthanded goals' },
        { key: 'gwg', label: 'GWG', cls: 'hm', val: (p) => p.gwg, title: 'Game-winning goals (as recorded by the league)' },
        { key: 'mpg', label: 'MPG', cls: 'hm', val: (p) => p.multiPointGames, title: 'Multi-point games' },
        { key: 'strk', label: 'STRK', val: (p) => p.pointStreak.current, html: (p) => p.pointStreak.current || '–', title: 'Current point streak' },
        { key: 'pim', label: 'PIM', cls: 'hm', val: (p) => p.pim, title: 'Penalty minutes' },
      ], { key: 'pts', rowCls: (p) => (favs.has(p.id) || String(p.teamId) === myTeamId() ? 'me' : ''), rowAttrs: (p) => `data-team="${esc(p.teamId)}" data-name="${esc(p.name.toLowerCase())}"` });
      sortable($('#goalies'), S.goalies || [], goalieCols(true), { key: 'min', rowCls: (g) => (String(g.teamId) === myTeamId() ? 'me' : '') });
      const sel = $('#sk-team'), q = $('#sk-q');
      sel.addEventListener('change', () => { f.team = sel.value; store.set('skaterFilter', f); apply(); });
      q.addEventListener('input', () => { f.q = q.value; store.set('skaterFilter', f); apply(); });
      apply();
    });
    const opts = [...S.teams].sort((a, b) => a.name.localeCompare(b.name)).map((t) => `<option value="${t.id}" ${f.team === String(t.id) ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
    return `
      <div class="ptitle"><div><div class="k">${esc(S.meta.division)} · skaters</div><h1>Scoring leaders</h1><div class="s" id="sk-count"></div></div></div>
      ${favs.size ? `<div style="margin-bottom:18px">${panel('Following', `<div class="pb"><div class="leaders">${leaderRows([...favs].map((id) => playerById.get(id)).sort((a, b) => b.pts - a.pts), () => true)}</div></div>`, { gold: true, meta: 'Players you follow · any team' })}</div>` : ''}
      <div style="margin-bottom:18px">${panel('Points leaders', `<div class="pb"><div class="leaders">${leaderRows(S.skaters.slice(0, 12), (p) => favs.has(p.id) || String(p.teamId) === myTeamId())}</div></div>`, { meta: 'Top 12 in the division' })}</div>
      <div style="margin-bottom:18px">${panel('All skaters', `<div class="controls"><select id="sk-team" aria-label="Filter by team"><option value="">All teams</option>${opts}</select><input type="search" id="sk-q" placeholder="Search players" aria-label="Search players" value="${esc(f.q)}"></div><div class="tw"><table id="skaters"></table></div><div class="note">MPG = multi-point games · STRK = current point streak · GWG as recorded by the league.</div>`, { gold: true, reveal: false })}</div>
      <div style="margin-bottom:18px">${panel('Goalies', `<div class="tw"><table id="goalies"></table></div><div class="note">${GOALIE_NOTE}</div>`, { meta: `${(S.goalies || []).length} goalies` })}</div>`;
  }

  function viewSchedule() {
    const sel = String(store.get('schedTeam2', '') || '');
    const items = S.schedule.filter((s) => !sel || involves(s, sel));
    const past = items.filter((s) => s.final).reverse();
    const next = items.filter(isUpcoming);
    after(() => $('#sc-team').addEventListener('change', (e) => { store.set('schedTeam2', e.target.value); render(); }));
    const opts = [...S.teams].sort((a, b) => a.name.localeCompare(b.name)).map((t) => `<option value="${t.id}" ${sel === String(t.id) ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
    return `
      <div class="ptitle"><div><div class="k">${esc(S.meta.season)} · ${esc(S.meta.division)}</div><h1>Schedule</h1><div class="s">${S.meta.gamesPlayed} of ${S.meta.gamesScheduled} games final</div></div>
        <select id="sc-team" aria-label="Filter by team"><option value="">All teams</option>${opts}</select></div>
      <div style="margin-bottom:18px">${panel('Upcoming', gameCards(next, sel || null), { gold: true, meta: `${next.length} games` })}</div>
      <div style="margin-bottom:18px">${panel('Results', gameCards(past, sel || null), { meta: `${past.length} games` })}</div>`;
  }

  // One team's weekend: record, goals, and each kid's firsts/milestones grouped into one line.
  function teamWeekend(key, teamId) {
    const W = S.weekends.get(key); if (!W) return null;
    const items = W.items.slice().sort((a, b) => a.start.localeCompare(b.start));
    const mine = items.filter((s) => involves(s, teamId)), myFinals = mine.filter((s) => s.final);
    const ids = new Set(myFinals.map((s) => s.id));
    const rec = { W: 0, L: 0, T: 0 }, gfga = [0, 0];
    for (const s of myFinals) {
      const home = String(s.home) === String(teamId), my = home ? s.homeScore : s.awayScore, op = home ? s.awayScore : s.homeScore;
      rec[my > op ? 'W' : my < op ? 'L' : 'T']++; gfga[0] += my; gfga[1] += op;
    }
    const andJoin = (a) => (a.length > 1 ? `${a.slice(0, -1).join(', ')} & ${a.at(-1)}` : a[0]);
    const ORDER = ['goal', 'assist', 'multi-point game', 'hat trick', 'power-play goal', 'shorthanded goal'];
    const moments = S.players.filter((p) => String(p.teamId) === String(teamId)).map((p) => {
      const fs = p.firsts.filter((f) => ids.has(f.gameId));
      if (!fs.length) return null;
      const firsts = fs.filter((f) => f.kind === 'first').map((f) => f.label.replace(/^First /, '').replace(/ of the season$/, '')).sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
      const counts = new Map();
      for (const f of fs.filter((x) => x.kind !== 'first')) counts.set(f.label, (counts.get(f.label) || 0) + 1);
      const label = [firsts.length ? 'First ' + andJoin(firsts) : null, ...[...counts].map(([l, n]) => (n > 1 ? `${l} ×${n}` : l))].filter(Boolean).join(' · ');
      return { ...fs[0], kind: firsts.length ? 'first' : 'milestone', label, player: p };
    }).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date) || a.player.name.localeCompare(b.player.name));
    return { key, mine, myFinals, rec, gfga, moments };
  }

  // Team page — everything about one team, nothing league-wide. "/" is the selected team.
  function viewTeam(id) {
    if (id === 'mine') { location.replace('#/'); return ''; }
    const t = teamById.get(String(id));
    if (!t) return notFound();
    const isMine = String(id) === myTeamId();
    const roster = S.players.filter((p) => String(p.teamId) === String(id));
    const sched = S.schedule.filter((s) => involves(s, id));
    const upcoming = sched.filter(isUpcoming);
    const latest = sched.filter((s) => s.final && s.hasDetail).map((s) => gameById.get(s.id)).filter(Boolean).at(-1);
    const favs = favPlayers();
    const h2h = new Map();
    for (const r of t.results) {
      const o = h2h.get(r.opp) || { id: r.opp, gp: 0, w: 0, l: 0, t: 0, gf: 0, ga: 0 };
      o.gp++; o[r.r.toLowerCase()]++; o.gf += r.gf; o.ga += r.ga;
      h2h.set(r.opp, o);
    }
    const wk = new Map();
    for (const r of t.results) {
      const k = weekKey(r.date), o = wk.get(k) || { id: k, gp: 0, w: 0, l: 0, t: 0, gf: 0, ga: 0 };
      o.gp++; o[r.r.toLowerCase()]++; o.gf += r.gf; o.ga += r.ga; wk.set(k, o);
    }
    const lastWk = [...wk.keys()].sort().at(-1);
    const tw = lastWk ? teamWeekend(lastWk, id) : null;
    // team scoring leaders (rank within the team; ties share)
    const tLeaders = roster.filter((p) => !p.isGoalie || p.pts > 0).map((p) => ({ ...p })).sort((a, b) => b.pts - a.pts || b.g - a.g || a.name.localeCompare(b.name));
    { let rk = 0, prev = null; tLeaders.forEach((p, i) => { if (p.pts !== prev) rk = i + 1; p.rank = rk; prev = p.pts; }); }
    const teamGoals = (forTeam) => S.games.flatMap((g) => g.ev.filter((e) => e.type === 'goal' && (String(e.teamId) === String(id)) === forTeam && (String(g.home.id) === String(id) || String(g.away.id) === String(id))));
    after(() => {
      progChart($('#prog'), t);
      periodChart($('#byper'), t);
      timingChart($('#heat'), {
        up: { label: 'Scored', color: 'var(--us)', goals: teamGoals(true) },
        down: { label: 'Allowed', color: 'var(--red)', goals: teamGoals(false) },
        notes: $('#heat-notes'),
      });
      const net = networkChart($('#net'), id, { controls: $('#net-ctl') });
      const nm = $('#net-meta'); if (nm) nm.textContent = net.goals ? `${net.assisted} of ${net.goals} goals assisted` : '';
      sortable($('#roster'), roster, [
        { key: 'name', label: 'Player', cls: 'l', val: (p) => p.name, desc: false, html: (p) => `${playerLink(p.id, p.name)}${p.isGoalie ? '<span class="chip" title="Goalie">G</span>' : ''}${favs.has(p.id) ? '<span class="chip gwg">★</span>' : ''}` },
        { key: 'num', label: '#', val: (p) => Number(p.number) || 0, desc: false },
        { key: 'gp', label: 'GP', val: (p) => p.gp },
        { key: 'g', label: 'G', val: (p) => p.g }, { key: 'a', label: 'A', val: (p) => p.a },
        { key: 'pts', label: 'PTS', val: (p) => p.pts, html: (p) => `<span class="pts">${p.pts}</span>` },
        { key: 'ppgp', label: 'P/GP', cls: 'hm', val: (p) => p.ptsPerGame, html: (p) => p.ptsPerGame.toFixed(2) },
        { key: 'ppg', label: 'PPG', cls: 'hm', val: (p) => p.ppg }, { key: 'gwg', label: 'GWG', cls: 'hm', val: (p) => p.gwg },
        { key: 'strk', label: 'STRK', cls: 'hm', val: (p) => p.pointStreak.current, html: (p) => p.pointStreak.current || '–' },
        { key: 'pim', label: 'PIM', val: (p) => p.pim, title: 'Penalty minutes' },
      ], { key: 'pts', rowCls: (p) => (favs.has(p.id) ? 'me' : '') });
      sortable($('#tgoal'), (S.goalies || []).filter((g) => String(g.teamId) === String(id)), goalieCols(false), { key: 'min' });
      sortable($('#h2h'), [...h2h.values()], [
        { key: 'opp', label: 'Opponent', cls: 'l', val: (o) => team(o.id).name, desc: false, html: (o) => tn(team(o.id)) },
        { key: 'gp', label: 'GP', val: (o) => o.gp },
        { key: 'rec', label: 'W-L-T', val: (o) => o.w * 2 + o.t, html: (o) => `${o.w}-${o.l}-${o.t}` },
        { key: 'gf', label: 'GF', val: (o) => o.gf }, { key: 'ga', label: 'GA', val: (o) => o.ga },
        { key: 'diff', label: 'DIFF', val: (o) => o.gf - o.ga, html: (o) => `<span class="${o.gf > o.ga ? 'pos' : o.gf < o.ga ? 'neg' : ''}">${sign(o.gf - o.ga)}</span>` },
      ], { key: 'gp' });
      sortable($('#wk'), [...wk.values()], [
        { key: 'id', label: 'Weekend', cls: 'l', val: (o) => o.id, desc: false, html: (o) => `<a class="lnk" href="#/weekend/${o.id}">${esc(weekLabel(o.id))}</a>` },
        { key: 'gp', label: 'GP', val: (o) => o.gp },
        { key: 'rec', label: 'W-L-T', val: (o) => o.w * 2 + o.t, html: (o) => `${o.w}-${o.l}-${o.t}` },
        { key: 'gf', label: 'GF', val: (o) => o.gf }, { key: 'ga', label: 'GA', val: (o) => o.ga },
        { key: 'diff', label: 'DIFF', val: (o) => o.gf - o.ga, html: (o) => `<span class="${o.gf > o.ga ? 'pos' : o.gf < o.ga ? 'neg' : ''}">${sign(o.gf - o.ga)}</span>` },
      ], { key: 'id', dir: 1 });
      const b = $('#set-mine'); if (b) b.addEventListener('click', () => { setMyTeam(String(id)); });
    });
    const action = isMine ? '' : `<button class="btn" id="set-mine">Switch to ${esc(t.short)}</button>`;
    const wkPanel = tw && tw.myFinals.length ? panel(`Weekend recap · ${esc(weekLabel(tw.key))}`, `
        <div class="stats wkstats"><div class="st"><span class="l">Record</span><span class="v">${tw.rec.W}-${tw.rec.L}-${tw.rec.T}</span></div><div class="st"><span class="l">Goals for</span><span class="v">${tw.gfga[0]}</span></div><div class="st"><span class="l">Goals against</span><span class="v">${tw.gfga[1]}</span></div><div class="st"><span class="l">Games</span><span class="v">${tw.myFinals.length}</span></div></div>
        <div class="pb"><div class="sub">Firsts &amp; milestones</div>${firstsList(tw.moments, { showPlayer: true })}</div>
        <div class="note"><a class="lnk" href="#/weekend/${tw.key}">See the whole division that weekend →</a></div>`, { gold: true }) : '';
    return `
      ${hero(t, { action })}
      ${latest ? featuredGame(latest, id, `Last game · ${esc(t.short)}`) : ''}
      <div style="margin-bottom:18px">${panel(`Up next · ${esc(t.short)}`, gameCards(upcoming.slice(0, 4), id), { gold: true, meta: `${upcoming.length} remaining` })}</div>
      ${wkPanel ? `<div style="margin-bottom:18px">${wkPanel}</div>` : ''}
      <div style="margin-bottom:18px">${panel(`${esc(t.short)} scoring`, `<div class="pb"><div class="leaders">${leaderRows(tLeaders.slice(0, 12), (p) => favs.has(p.id))}</div></div>`, { meta: '<button class="lnk linkbtn" data-scroll="roster-anchor">Full roster ↓</button>' })}</div>
      <div style="margin-bottom:18px">${panel('Season progression', `<div class="pb"><div class="legend"><span><i style="background:var(--us)"></i>Goals for (running)</span><span><i style="background:var(--red)"></i>Goals against (running)</span><span><i style="background:var(--us);height:8px"></i>W</span><span><i style="background:#5A2A22;height:8px"></i>L</span></div><div class="chart" id="prog"></div></div>`, { gold: true, meta: `${t.gp} GP · by weekend` })}</div>
      <div class="grid g-7-5">
        ${panel('When goals happen', '<div class="pb"><div class="legend"><span><i style="background:var(--us)"></i>Scored (up)</span><span><i style="background:var(--red)"></i>Allowed (down)</span></div><div class="chart" id="heat"></div><div id="heat-notes"></div></div>', { meta: '3-minute stretches' })}
        ${panel('By period', `<div class="pb"><div class="legend"><span><i style="background:var(--red)"></i>Goals against</span><span><i style="background:var(--us)"></i>Goals for</span></div><div class="chart" id="byper"></div></div>`, { meta: `${t.gp} GP` })}
      </div>
      <div style="margin-bottom:18px">${panel('Linemates', '<div class="pb"><div id="net-ctl" class="net-ctl"></div><div class="chart" id="net"></div></div><div class="note">A line joins a passer and a scorer on the same goal. Hover a player to see only their connections. Fills in as the season goes on.</div>', { meta: '<span id="net-meta"></span>' })}</div>
      <div id="roster-anchor" style="margin-bottom:18px">${panel('Roster', '<div class="tw"><table id="roster"></table></div>', { meta: `Team PIM ${t.pim}` })}</div>
      <div style="margin-bottom:18px">${panel('Goalies', `<div class="tw"><table id="tgoal"></table></div><div class="note">Team save % ${rate(t.svPct)} (from shots on goal). ${GOALIE_NOTE}</div>`)}</div>
      <div style="margin-bottom:18px">${panel('Results', gameCards(sched.filter((s) => s.final).reverse(), id), { meta: `${t.w}-${t.l}-${t.t}` })}</div>
      <div class="grid g-6-6">
        ${panel('By weekend', '<div class="tw"><table id="wk"></table></div>')}
        ${panel('Head to head', '<div class="tw"><table id="h2h"></table></div>')}
      </div>`;
  }

  function result(gameId, teamId) {
    const g = gameById.get(gameId); if (!g) return '';
    const mine = String(g.home.id) === String(teamId) ? g.home : g.away, opp = mine === g.home ? g.away : g.home;
    const r = mine.score > opp.score ? 'W' : mine.score < opp.score ? 'L' : 'T';
    return `<span class="rb ${r}">${r}</span>${mine.score}–${opp.score}`;
  }

  function viewPlayer(id) {
    const p = playerById.get(id);
    if (!p) return notFound();
    const t = team(p.teamId);
    const isFav = favPlayers().has(id);
    const [first, ...rest] = p.name.split(' ');
    const teamRank = S.skaters.filter((x) => x.teamId === p.teamId).findIndex((x) => x.pts === p.pts) + 1;
    const rank = p.rank || S.skaters.length;
    const tied = S.skaters.filter((x) => x.pts === p.pts).length > 1;
    after(() => {
      logChart($('#elog'), p);
      weekendChart($('#pwk'), p);
      $('#fav').addEventListener('click', () => {
        const s = favPlayers(); s.has(id) ? s.delete(id) : s.add(id); store.set('favPlayers', [...s]); render();
      });
    });
    const role = p.isGoalie ? 'Goalie' : p.goalieGames ? `Skater · ${p.goalieGames} game${p.goalieGames > 1 ? 's' : ''} in goal` : 'Skater';
    return `
      <section class="spot" data-reveal>
        <div class="card"><div class="big">${esc(p.number)}</div>
          <div class="tm">${logo(t)}${teamLink(t, t.short)} · #${esc(p.number)}</div>
          <h3>${esc(first)}<span>${esc(rest.join(' '))}</span></h3>
          <div class="pos">${role} · ${esc(S.meta.division)}</div>
          <div class="line">${[['GP', p.gp], ['G', p.g], ['A', p.a], ['PTS', p.pts]].map(([l, v]) => `<div><b data-count="${v}">0</b><span>${l}</span></div>`).join('')}</div>
          <div class="act"><button class="btn ${isFav ? 'on' : ''}" id="fav">${isFav ? '★ Following' : '☆ Follow'}</button></div>
        </div>
        <div class="body">
          <div class="facts">
            <div><span>Pts / game</span><b data-count="${p.ptsPerGame}" data-dp="2">0</b><em>${tied ? 'T-' : ''}${ordinal(rank)} in division</em></div>
            <div><span>Team scoring</span><b>${teamRank ? ordinal(teamRank) : '—'}</b><em>on ${esc(t.short)}</em></div>
            <div><span>Involvement</span><b data-count="${p.teamGoalShare}" data-fmt="pct" data-dp="0">0</b><em>of team goals</em></div>
          </div>
          <div><div class="sub">Game log · points</div>
            <div class="legend"><span><i style="background:var(--us)"></i>Goals</span><span><i style="background:var(--blue)"></i>Assists</span></div>
            <div class="chart" id="elog"></div></div>
          <div><div class="sub">Log</div><div class="tw"><table class="gl"><thead><tr><th class="l">Date</th><th class="l">Opp</th><th>Result</th><th>G</th><th>A</th><th>PTS</th><th>PIM</th></tr></thead><tbody>
            ${p.log.slice().reverse().map((g) => `<tr><td class="l"><a class="lnk" href="#/game/${g.gameId}">${dt(g.date)}</a></td><td class="l">${g.home ? 'vs' : '@'} ${esc(team(g.opp).code)}</td><td>${result(g.gameId, p.teamId)}</td><td>${g.g}</td><td>${g.a}</td><td class="pts" style="font-size:16px">${g.pts}${g.gwg ? '<span class="chip gwg">GWG</span>' : ''}</td><td>${g.pim || 0}</td></tr>`).join('')}
          </tbody></table></div>
          <div class="warn" style="border-color:var(--us)">Point streak ${p.pointStreak.current} (best ${p.pointStreak.best}) · ${p.multiPointGames} multi-point games · ${p.ppg + p.ppa} power-play points · ${p.firstGoals} opening goals · ${p.pim} PIM</div></div>
        </div>
      </section>
      <div class="grid g-7-5">
        ${panel(`${esc(first)}'s season`, `<div class="pb"><div class="legend"><span><i style="background:var(--us)"></i>Goals</span><span><i style="background:var(--blue)"></i>Assists</span></div><div class="chart" id="pwk"></div></div>`, { gold: true, meta: 'Points by weekend' })}
        ${panel('Firsts &amp; milestones', `<div class="pb">${firstsList(p.firsts.slice().reverse())}</div>`, { meta: `${p.firsts.length}` })}
      </div>
      ${goalieById.has(id) ? goaliePanel(goalieById.get(id)) : ''}`;
  }

  function goaliePanel(gl) {
    const tiles = [['GP', gl.gp], ['W-L-T', `${gl.w}-${gl.l}-${gl.t}`], ['Shots against', gl.shots], ['Save %', rate(gl.svPct)], ['GAA', gl.gaa == null ? '—' : gl.gaa.toFixed(2)], ['Shutouts', gl.so]];
    return `<div style="margin-bottom:18px">${panel('In goal', `
      <div class="stats">${tiles.map(([l, v]) => `<div class="st"><span class="l">${l}</span><span class="v">${esc(v)}</span></div>`).join('')}</div>
      <div class="pb"><div class="tw"><table class="gl"><thead><tr><th class="l">Date</th><th class="l">Opp</th><th>Dec</th><th>MIN</th><th>SA</th><th>GA</th><th>SV%</th></tr></thead><tbody>
        ${gl.log.slice().reverse().map((l) => `<tr><td class="l"><a class="lnk" href="#/game/${l.gameId}">${dt(l.date)}</a></td><td class="l">${l.home ? 'vs' : '@'} ${esc(team(l.opp).code)}</td><td>${l.decision ? `<span class="rb ${l.decision}">${l.decision}</span>` : '–'}</td><td>${mmss(l.seconds)}</td><td>${l.shots}</td><td>${l.ga}</td><td>${l.shots ? rate(l.saves / l.shots) : '—'}</td></tr>`).join('')}
      </tbody></table></div></div>
      <div class="note">${GOALIE_NOTE}</div>`, { gold: true, meta: `${gl.minutes} minutes` })}</div>`;
  }

  function viewGame(id) {
    const g = gameById.get(id);
    if (!g) return notFound();
    const h = team(g.home.id), a = team(g.away.id), tie = g.home.score === g.away.score, hw = g.home.score > g.away.score;
    const shots = (side) => (g.shotsByPeriod.length ? g.shotsByPeriod.reduce((n, p) => n + p[side], 0) : null);
    const pim = (side) => g.events.filter((e) => e.type === 'penalty' && e.side === side).reduce((n, e) => n + (e.minutes || 0), 0);
    const def = (side, o) => { const sa = shots(o), ga = g[o].score; return { sa, ga, sv: sa && sa >= ga ? 1 - ga / sa : null, pim: pim(side) }; };
    const TH = def('home', 'away'), TA = def('away', 'home');
    const rec = (t) => (t.stub ? '' : `${t.w}-${t.l}-${t.t} · `);
    const flags = g.warnings.filter((w) => !/goalie/i.test(w));
    const box = (teamId) => g.skaters.filter((r) => String(r.teamId) === String(teamId)).sort((x, y) => (y.g + y.a) - (x.g + x.a) || y.g - x.g);
    const boxTable = (t) => `<div class="tw"><table class="gl"><thead><tr><th>#</th><th class="l">Player</th><th>G</th><th>A</th><th>PTS</th><th>PIM</th></tr></thead><tbody>${box(t.id).map((r) => `<tr><td>${esc(r.number)}</td><td class="l">${playerLink(r.playerId, r.name)}</td><td>${r.g}</td><td>${r.a}</td><td class="pts" style="font-size:16px">${r.g + r.a}</td><td>${r.pim || 0}</td></tr>`).join('')}</tbody></table></div>
      ${(g.goalies || []).some((x) => String(x.teamId) === String(t.id)) ? `<div class="sub" style="margin-top:14px">In goal</div><div class="tw"><table class="gl"><thead><tr><th class="l">Goalie</th><th>MIN</th><th>SA</th><th>GA</th><th>SV</th><th>SV%</th></tr></thead><tbody>${g.goalies.filter((x) => String(x.teamId) === String(t.id)).map((x) => `<tr><td class="l">${playerLink(x.playerId, x.name)}</td><td>${mmss(x.seconds)}</td><td>${x.shots}</td><td>${x.ga}</td><td>${Math.max(0, x.saves)}</td><td>${x.shots ? rate(Math.max(0, x.saves) / x.shots) : '—'}</td></tr>`).join('')}</tbody></table></div>` : ''}`;
    const plabel = (l) => (/^\d+$/.test(l) ? 'P' + l : l);
    const focus = involves({ home: g.home.id, away: g.away.id }, myTeamId()) ? myTeamId() : g.home.id;
    const fu = String(focus) === String(g.away.id) ? a : h, fo = fu === h ? a : h;
    after(() => {
      const fc = flowChart($('#flow'), g, { focus });
      $('#flow-replay').addEventListener('click', () => fc.play());
    });
    return `
      <section class="panel" data-reveal style="margin-bottom:18px">
        <div class="ph"><h2>Game summary</h2><span class="meta">${g.gameNumber ? `Game ${esc(g.gameNumber)} · ` : ''}${esc(g.rink)}</span></div>
        <div class="bug">
          <div class="side a ${tie || !hw ? 'win' : 'lose'}">${logo(a)}<div><div class="nm">${teamLink(a, a.short)}</div><div class="rc">${rec(a)}AWAY</div></div><span class="sc" data-count="${g.away.score}">0</span></div>
          <div class="mid"><b>FINAL</b>${g.comeback ? `<span class="chip mo" style="margin:0 0 6px">${esc(team(g[g.comeback].id).short)} comeback</span>` : ''}${dt(g.date, { weekday: 'short', month: 'short', day: 'numeric' })}<span style="margin-top:2px">${tm(g.date)}</span></div>
          <div class="side ${tie || hw ? 'win' : 'lose'}">${logo(h)}<div><div class="nm">${teamLink(h, h.short)}</div><div class="rc">${rec(h)}HOME</div></div><span class="sc" data-count="${g.home.score}">0</span></div>
        </div>
        <div class="game-body">
          <div>
            <div class="sub sub-row">Game flow <button class="btn sm" id="flow-replay">↻ Replay</button></div>
            <div class="legend"><span><i style="background:var(--us)"></i>${esc(fu.short)}</span><span><i style="background:var(--red)"></i>${esc(fo.short)}</span><span><i style="background:var(--ink3);opacity:.5"></i>Power play</span><span><i style="background:var(--ink3);height:6px;width:2px"></i>Penalty</span></div>
            <div class="chart" id="flow"></div>
            <div class="tw"><table class="per" style="margin-top:14px"><thead><tr><th class="l">Team</th>${g.periods.map((p) => `<th>${esc(plabel(p.label))}</th>`).join('')}<th>T</th><th>SOG</th></tr></thead><tbody>
              ${[[a, 'away'], [h, 'home']].map(([t, s]) => `<tr><td class="l"><span class="tn">${logo(t)}${esc(t.code)}</span></td>${g.periods.map((p) => `<td>${p[s]}</td>`).join('')}<td class="tot">${g[s].score}</td><td>${shots(s) ?? '—'}</td></tr>`).join('')}
            </tbody></table></div>
            <div class="sub" style="margin-top:18px">Team defense</div>
            <div class="tw"><table><thead><tr><th class="l">Team</th><th>Shots against</th><th>GA</th><th>Team SV%</th><th>PIM</th></tr></thead><tbody>
              ${[[a, TA], [h, TH]].map(([t, x]) => `<tr><td class="l"><span class="tn">${logo(t)}<span>${esc(t.short)}</span></span></td><td>${x.sa ?? '—'}</td><td>${x.ga}</td><td>${rate(x.sv)}</td><td>${x.pim}</td></tr>`).join('')}
            </tbody></table></div>
            ${flags.length ? `<div class="warn">Source data flag: ${flags.map(esc).join(' · ')}</div>` : ''}
          </div>
          <div>
            <div class="sub">Scoring summary</div>
            <ol class="evs">${g.ev.map((e) => {
              const t = team(e.teamId), home = e.side === 'home';
              if (e.type === 'goal') return `<li class="ev"><span class="pn">${esc(plabel(e.period))}</span><span class="tc">${esc(e.time)}</span><span class="who"><b>${playerLink(e.playerId, e.scorer.name)}</b>${e.tags.map((x) => `<span class="chip ${x === 'GWG' ? 'gwg' : ''}">${esc(x)}</span>`).join('')}${e.moment && e.moment !== 'Opening goal' ? `<span class="chip mo">${esc(e.moment)}</span>` : ''}<span>${esc(t.code)} ·${e.assists.length ? 'A: ' + e.assists.map((x) => playerLink(x.playerId, x.name)).join(', ') : 'Unassisted'}</span></span><span class="scr" style="color:${home ? 'var(--us)' : 'var(--red)'}">${e.score[1]}–${e.score[0]}</span></li>`;
              return `<li class="ev pen"><span class="pn">${esc(plabel(e.period))}</span><span class="tc">${esc(e.time)}</span><span class="who"><b>${e.player?.name ? playerLink(e.playerId, e.player.name) : esc(t.short) + ' penalty'} · ${e.minutes} min</b><span>${esc(t.code)} · ${esc(e.infraction || '')}</span></span><span class="scr" style="color:var(--ink3);font-size:12px">PEN</span></li>`;
            }).join('') || '<li class="empty">No events recorded</li>'}</ol>
          </div>
        </div>
      </section>
      <div class="grid g-6-6">
        ${panel(`${esc(a.short)} · box score`, `<div class="pb">${boxTable(a)}</div>`)}
        ${panel(`${esc(h.short)} · box score`, `<div class="pb">${boxTable(h)}</div>`)}
      </div>`;
  }

  function viewWeekend(key) {
    const keys = [...S.weekends.keys()].sort();
    const playedKeys = keys.filter((k) => S.weekends.get(k).items.some((s) => s.final));
    if (!key) key = playedKeys.at(-1) || keys[0];
    const W = S.weekends.get(key);
    if (!W) return notFound();
    const me = team(myTeamId());
    const items = W.items.slice().sort((a, b) => a.start.localeCompare(b.start));
    const finals = items.filter((s) => s.final), ids = new Set(finals.map((s) => s.id));
    const games = finals.map((s) => gameById.get(s.id)).filter(Boolean);
    // weekend scoring leaders
    const tally = new Map();
    for (const g of games) for (const r of g.skaters) {
      if (!r.playerId || !(r.g + r.a)) continue;
      const t = tally.get(r.playerId) || { ...playerById.get(r.playerId), g: 0, a: 0, pts: 0 };
      t.g += r.g; t.a += r.a; t.pts += r.g + r.a; tally.set(r.playerId, t);
    }
    const leaders = [...tally.values()].filter((p) => p.id).sort((a, b) => b.pts - a.pts || b.g - a.g || a.name.localeCompare(b.name));
    let rk = 0, prev = null; leaders.forEach((p, i) => { if (p.pts !== prev) rk = i + 1; p.rank = rk; prev = p.pts; });
    const div = [];
    for (const g of games) {
      const h = team(g.home.id), a = team(g.away.id);
      if (g.comeback) { const w = g.comeback === 'home' ? h : a, l = g.comeback === 'home' ? a : h; div.push({ gameId: g.id, date: g.date, text: `${w.short} came from behind to beat ${l.short} ${Math.max(g.home.score, g.away.score)}–${Math.min(g.home.score, g.away.score)}` }); }
      for (const [side, t, o] of [['home', h, a], ['away', a, h]]) if (g[side === 'home' ? 'away' : 'home'].score === 0) div.push({ gameId: g.id, date: g.date, text: `${t.short} shutout vs ${o.short}` });
      for (const r of g.skaters) if (r.g >= 3) div.push({ gameId: g.id, date: g.date, text: `${r.name} hat trick (${team(r.teamId).short}, ${r.g} goals)`, playerId: r.playerId });
    }
    const idx = keys.indexOf(key), prevK = keys[idx - 1], nextK = keys[idx + 1];
    const chips = keys.map((k) => `<a class="wkchip ${k === key ? 'on' : ''} ${S.weekends.get(k).items.some((s) => s.final) ? '' : 'up'}" href="#/weekend/${k}">${esc(weekLabel(k))}</a>`).join('');
    after(() => { const on = $app.querySelector('.wkchip.on'); if (on) on.scrollIntoView({ block: 'nearest', inline: 'center' }); });
    return `
      <div class="ptitle"><div><div class="k">Weekend · ${finals.length} of ${items.length} games final</div><h1>${esc(weekLabel(key))}</h1><div class="s">${W.items.length ? esc([...new Set(items.map((s) => s.location).filter(Boolean))].slice(0, 3).join(' · ')) : ''}</div></div>
        <div style="display:flex;gap:8px">${prevK ? `<a class="btn" href="#/weekend/${prevK}">← Prev</a>` : ''}${nextK ? `<a class="btn" href="#/weekend/${nextK}">Next →</a>` : ''}</div></div>
      <div class="wkbar">${chips}</div>
      ${finals.length ? `<div class="grid g-6-6">
        ${panel('Around the division', `<div class="pb">${div.length ? `<ol class="evs">${div.map((d) => `<li class="ev moment"><span class="pn">◆</span><span class="tc">${dt(d.date)}</span><span class="who"><b>${d.playerId ? playerLink(d.playerId, d.text) : esc(d.text)}</b></span><a class="scr lnk" href="#/game/${d.gameId}" style="font-size:12px">GAME →</a></li>`).join('')}</ol>` : '<div class="empty">No comebacks, shutouts or hat tricks</div>'}</div>`, { gold: true, meta: 'Comebacks · shutouts · hat tricks' })}
        ${panel('Weekend scoring', `<div class="pb"><div class="leaders one">${leaderRows(leaders.slice(0, 10), (p) => String(p.teamId) === me.id)}</div></div>`, { meta: 'Points this weekend' })}
      </div>` : ''}
      <div style="margin-bottom:18px">${panel('All games', gameCards(items, null), { meta: `${items.length} games` })}</div>`;
  }

  // ------------------------------------------------------------ scouting report
  // Built live in the browser for any team from stats.json. "Keys to the game" are rules that only
  // fire on a clear signal and always show their evidence; every section shows its sample size.
  function scoutData(id) {
    const t = teamById.get(String(id)), me = myTeamId(), self = String(id) === me;
    const PER = (S.meta.regulationMinutes || 45) / 3 * 60, bucket = PER / 5;
    const sideOf = (g) => (String(g.home.id) === String(id) ? 'home' : 'away');
    const oppOf = (s) => (s === 'home' ? 'away' : 'home');
    const games = S.games.filter((g) => String(g.home.id) === String(id) || String(g.away.id) === String(id));
    const rankOf = (fn, dir = 'desc') => { const v = fn(t); if (v == null) return null; return 1 + S.teams.filter((o) => fn(o) != null && (dir === 'desc' ? fn(o) > v : fn(o) < v)).length; };
    const avgOf = (fn) => { const xs = S.teams.map(fn).filter((v) => v != null && Number.isFinite(v)); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; };
    const perGame = (k) => (o) => (o.gp ? o[k] / o.gp : null);

    // players: skaters by goals (reliance) and points (threats)
    const skaters = S.players.filter((p) => String(p.teamId) === String(id) && (!p.isGoalie || p.pts > 0));
    const byPts = [...skaters].sort((a, b) => b.pts - a.pts || b.g - a.g);
    const byG = [...skaters].sort((a, b) => b.g - a.g || b.pts - a.pts);
    const top2 = byG.slice(0, 2), top2Share = t.gf ? top2.reduce((n, p) => n + p.g, 0) / t.gf : 0;
    const scorers = skaters.filter((p) => p.g > 0).length;
    const lastWk = t.results.length ? weekKey(t.results.at(-1).date) : null;
    const lwPts = (p) => p.log.filter((l) => weekKey(l.date) === lastWk).reduce((n, l) => n + l.pts, 0);
    // duos from goal/assist pairs
    const pairs = new Map();
    for (const g of games) for (const e of g.ev) {
      if (e.type !== 'goal' || String(e.teamId) !== String(id) || !e.playerId) continue;
      for (const a of e.assists) {
        if (!a.playerId || a.playerId === e.playerId) continue;
        const k = [a.playerId, e.playerId].sort().join('|');
        pairs.set(k, (pairs.get(k) || 0) + 1);
      }
    }
    const duos = [...pairs].map(([k, n]) => ({ ids: k.split('|'), n })).sort((a, b) => b.n - a.n).filter((d) => d.n >= 2).slice(0, 3);

    // timing: early (first 3 min of a period) and late (last 3 min) goals, for and against
    const tb = { gfEarly: 0, gfLate: 0, gaEarly: 0, gaLate: 0, n: 0 };
    for (const g of games) for (const e of g.ev) {
      if (e.type !== 'goal' || !e.regulation || e.badClock) continue;
      const within = e.t - (Number(e.period) - 1) * PER, mine = String(e.teamId) === String(id);
      const early = within < bucket, late = within >= PER - bucket;
      if (mine) { if (early) tb.gfEarly++; if (late) tb.gfLate++; } else { if (early) tb.gaEarly++; if (late) tb.gaLate++; }
    }
    const periods = [...new Set([...Object.keys(t.gfByPeriod), ...Object.keys(t.gaByPeriod)])].filter((p) => /^\d+$/.test(p)).sort();

    // discipline
    const pens = games.flatMap((g) => g.ev.filter((e) => e.type === 'penalty' && e.side === sideOf(g)));
    const infractions = [...pens.reduce((m, e) => m.set(e.infraction || 'Other', (m.get(e.infraction || 'Other') || 0) + 1), new Map())].sort((a, b) => b[1] - a[1]);
    const penPlayers = skaters.filter((p) => p.pim > 0).sort((a, b) => b.pim - a.pim).slice(0, 3);
    const penByPeriod = periods.map((p) => [p, pens.filter((e) => String(e.period) === p).length]);

    // game script
    const script = { first: { W: 0, L: 0, T: 0 }, trailFirst: { W: 0, L: 0, T: 0 }, oneGoal: { W: 0, L: 0, T: 0 }, blowW: 0, blowL: 0, comebacks: 0, blownLeads: 0, p3: 0, n: 0, big: null, worst: null };
    for (const g of games) {
      const s = sideOf(g), o = oppOf(s), gf = g[s].score, ga = g[o].score, r = gf > ga ? 'W' : gf < ga ? 'L' : 'T';
      script.n++;
      const fg = g.ev.find((e) => e.type === 'goal');
      if (fg) script[fg.side === s ? 'first' : 'trailFirst'][r]++;
      if (Math.abs(gf - ga) === 1) script.oneGoal[r]++;
      if (gf - ga >= 5) script.blowW++;
      if (ga - gf >= 5) script.blowL++;
      if (g.comeback === s) script.comebacks++;
      if (g.comeback === o) script.blownLeads++;
      const p3 = g.periods.find((p) => p.label === '3'); if (p3) script.p3 += p3[s] - p3[o];
      if (!script.big || gf - ga > script.big.m) script.big = { m: gf - ga, g, gf, ga };
      if (!script.worst || gf - ga < script.worst.m) script.worst = { m: gf - ga, g, gf, ga };
    }

    // shots: only games whose sheet has a shots table
    const sg = games.filter((g) => g.shotsByPeriod?.length);
    const sh = sg.reduce((a, g) => { const s = sideOf(g), o = oppOf(s); a.sf += g.shotsByPeriod.reduce((n, p) => n + p[s], 0); a.sa += g.shotsByPeriod.reduce((n, p) => n + p[o], 0); a.gf += g[s].score; a.ga += g[o].score; return a; }, { sf: 0, sa: 0, gf: 0, ga: 0 });
    const shootPct = sh.sf ? sh.gf / sh.sf : null;
    const teamShootPct = (o) => { const gs = S.games.filter((g) => (String(g.home.id) === o.id || String(g.away.id) === o.id) && g.shotsByPeriod?.length); let sf = 0, gf = 0; for (const g of gs) { const s = String(g.home.id) === o.id ? 'home' : 'away'; sf += g.shotsByPeriod.reduce((n, p) => n + p[s], 0); gf += g[s].score; } return sf ? gf / sf : null; };

    // goalies
    const gls = (S.goalies || []).filter((g) => String(g.teamId) === String(id)).sort((a, b) => b.seconds - a.seconds);
    const glSec = gls.reduce((n, g) => n + g.seconds, 0);

    // common opponents + history vs my team
    const res = (teamId, oppId) => teamById.get(String(teamId))?.results.filter((r) => String(r.opp) === String(oppId)) || [];
    const sum = (rs) => rs.reduce((a, r) => { a[r.r]++; a.gf += r.gf; a.ga += r.ga; return a; }, { W: 0, L: 0, T: 0, gf: 0, ga: 0 });
    const common = self ? [] : S.teams.filter((o) => o.id !== String(id) && o.id !== me).map((o) => ({ o, them: sum(res(id, o.id)), us: sum(res(me, o.id)) }))
      .filter((c) => c.them.W + c.them.L + c.them.T && c.us.W + c.us.L + c.us.T);
    const h2h = self ? [] : S.schedule.filter((s) => s.final && involves(s, id) && involves(s, me));
    const nextMeet = self ? null : S.schedule.find((s) => isUpcoming(s) && involves(s, id) && involves(s, me));
    const nextGame = S.schedule.find((s) => isUpcoming(s) && involves(s, id));
    const rinkFor = (s) => s?.location || null;
    const rinkRec = (teamId, rink) => { const r = sum((teamById.get(String(teamId))?.results || []).filter((x) => S.schedule.find((s) => s.id === x.gameId)?.location === rink)); return r.W + r.L + r.T ? r : null; };

    return {
      t, self, me, games, byPts, byG, top2, top2Share, scorers, lastWk, lwPts, duos, tb, periods, pens, infractions, penPlayers, penByPeriod,
      script, sg, sh, shootPct, gls, glSec, common, h2h, nextMeet, nextGame, rinkFor, rinkRec,
      ranks: {
        gfpg: rankOf((o) => o.gfPerGame), gapg: rankOf((o) => o.gaPerGame, 'asc'), pp: rankOf((o) => o.ppPct), pk: rankOf((o) => o.pkPct),
        pim: rankOf(perGame('pim')), sv: rankOf((o) => o.svPct), sapg: rankOf(perGame('sa'), 'asc'), shoot: rankOf(teamShootPct),
      },
      avg: { pim: avgOf(perGame('pim')), sapg: avgOf(perGame('sa')), sv: avgOf((o) => o.svPct), pp: avgOf((o) => o.ppPct), pk: avgOf((o) => o.pkPct), shoot: avgOf(teamShootPct) },
    };
  }

  // Keys to the game: each rule needs a clear signal (and enough games) before it says anything.
  function scoutKeys(d) {
    const { t, self } = d, We = self ? 'We' : 'They', we = self ? 'we' : 'they', our = self ? 'our' : 'their', n = t.gp;
    const keys = [];
    const add = (score, title, evidence) => keys.push({ score, title, evidence });
    const nm = (p) => `#${p.number} ${p.name}`;
    const pctS = (x) => `${Math.round(x * 100)}%`;
    if (n < 2) return keys;
    if (t.gf >= 8 && d.top2Share >= 0.5) add(d.top2Share, `Top-heavy scoring — ${self ? 'teams will key on' : 'key on'} ${d.top2.map(nm).join(' and ')}`, `${pctS(d.top2Share)} of ${our} ${t.gf} goals come from those two.`);
    else if (t.gf >= 8 && d.scorers >= 7) add(0.45, `Balanced scoring — ${d.scorers} different goal scorers`, `No player has more than ${pctS(d.byG[0].g / t.gf)} of ${our} goals.`);
    for (const p of d.periods) {
      const ga = t.gaByPeriod[p] || 0, gf = t.gfByPeriod[p] || 0;
      if (t.ga >= 6 && ga / t.ga >= 0.45) add(ga / t.ga, `${self ? 'We leak' : 'Leaky'} in period ${p}`, `${ga} of ${t.ga} goals against came in P${p}.`);
      if (t.gf >= 6 && gf / t.gf >= 0.45) add(gf / t.gf - 0.05, `${We} do most damage in period ${p}`, `${gf} of ${t.gf} goals for came in P${p}.`);
    }
    if (t.ga >= 5 && d.tb.gaLate / t.ga >= 0.3) add(d.tb.gaLate / t.ga, `Vulnerable late in periods`, `${d.tb.gaLate} of ${t.ga} goals against came in the last 3 minutes of a period.`);
    if (t.gf >= 5 && d.tb.gfEarly / t.gf >= 0.3) add(d.tb.gfEarly / t.gf - 0.05, `Fast starters`, `${d.tb.gfEarly} of ${t.gf} goals came in the first 3 minutes of a period.`);
    const pimpg = t.pim / n;
    if (d.avg.pim && pimpg >= d.avg.pim * 1.25 && d.ranks.pim <= 3) add(0.6 + (pimpg / d.avg.pim - 1) * 0.3, `${self ? 'We take too many penalties' : 'Penalty-prone — expect power plays'}`, `${pimpg.toFixed(1)} PIM per game (${ordinal(d.ranks.pim)} most; division average ${d.avg.pim.toFixed(1)}).${d.infractions[0] ? ` Most common: ${d.infractions[0][0]} (${d.infractions[0][1]}).` : ''}`);
    if (t.ppo >= 5 && t.ppPct >= 0.3 && d.ranks.pp <= 3) add(0.55 + t.ppPct * 0.3, `Dangerous power play${self ? '' : ' — stay out of the box'}`, `${t.ppg} of ${t.ppo} (${pctS(t.ppPct)}), ${ordinal(d.ranks.pp)} in the division.`);
    if (t.tsh >= 5 && t.pkPct != null && t.pkPct <= 0.7) add(0.55 + (0.7 - t.pkPct), `Weak penalty kill`, `Killed ${t.tsh - t.ppga} of ${t.tsh} (${pctS(t.pkPct)}), ${ordinal(d.ranks.pk)} in the division.`);
    if (t.svPct != null && d.avg.sv && t.svPct <= d.avg.sv - 0.05 && d.ranks.sv >= S.teams.length - 2) add(0.6 + (d.avg.sv - t.svPct), self ? `Our save % is among the lowest` : `Shoot early and often`, `Team save % ${rate(t.svPct)} (${ordinal(d.ranks.sv)}; division average ${rate(d.avg.sv)}).`);
    if (t.svPct != null && d.avg.sv && t.svPct >= d.avg.sv + 0.05 && d.ranks.sv <= 2) add(0.5 + (t.svPct - d.avg.sv), self ? `Strong in net` : `Hot goaltending — need quality chances`, `Team save % ${rate(t.svPct)} (${ordinal(d.ranks.sv)} in the division).`);
    if (d.sg.length >= 2 && d.sh.sa / d.sg.length >= (d.avg.sapg || 0) * 1.25) add(0.5, `${We} give up a lot of shots`, `${(d.sh.sa / d.sg.length).toFixed(1)} shots against per game (division average ${(d.avg.sapg || 0).toFixed(1)}).`);
    if (d.script.comebacks >= 2) add(0.55, `${We} don't quit — ${d.script.comebacks} comeback wins`, `Won ${d.script.comebacks} games after trailing.`);
    const tf = d.script.trailFirst, tfn = tf.W + tf.L + tf.T;
    if (tfn >= 2 && tf.W + tf.T === 0) add(0.55, `The first goal matters`, `${We}'re 0-${tf.L} when the other team scores first.`);
    const hot = d.byPts.map((p) => ({ p, v: d.lwPts(p) })).filter((x) => x.v >= 5).sort((a, b) => b.v - a.v)[0];
    if (hot) add(0.5 + hot.v / 40, `Hot hand: ${nm(hot.p)}`, `${hot.v} points last weekend.`);
    if (d.duos[0] && d.duos[0].n >= 3) add(0.45 + d.duos[0].n / 40, `${self ? 'Our top connection:' : 'Watch the'} ${d.duos[0].ids.map((i) => playerById.get(i)?.name.split(' ')[0]).join('–')}${self ? '' : ' connection'}`, `Combined on ${d.duos[0].n} goals.`);
    return keys.sort((a, b) => b.score - a.score).slice(0, 5);
  }

  function viewScout(id) {
    const me = myTeamId();
    if (!id) {
      const nx = S.schedule.find((s) => isUpcoming(s) && involves(s, me));
      const target = nx ? (String(nx.home) === me ? nx.away : nx.home) : S.teams.find((t) => t.id !== me)?.id;
      location.replace(`#/scout/${teamById.has(String(target)) ? target : me}`);
      return '';
    }
    const t = teamById.get(String(id));
    if (!t) return notFound();
    const d = scoutData(id), keys = scoutKeys(d), my = team(me), n = t.gp;
    const We = d.self ? 'We' : 'They';
    const rec = (r) => `${r.W}-${r.L}-${r.T}`;
    const pctS = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);
    const rk = (r) => (r ? `<em class="rk">${ordinal(r)}</em>` : '');
    // next meeting with each upcoming opponent (first occurrence wins — we play most teams more than once)
    const upOpps = [];
    for (const s of S.schedule.filter((x) => isUpcoming(x) && involves(x, me)).sort((a, b) => a.start.localeCompare(b.start))) {
      const o = String(s.home) === me ? String(s.away) : String(s.home);
      if (teamById.has(o) && !upOpps.some(([k]) => k === o)) upOpps.push([o, s]);
      if (upOpps.length === 4) break;
    }
    const opts = [...S.teams].sort((a, b) => a.name.localeCompare(b.name)).map((o) => `<option value="${o.id}" ${o.id === t.id ? 'selected' : ''}>${o.id === me ? `Self-scout: ${esc(o.name)}` : esc(o.name)}</option>`).join('');
    const chips = `${upOpps.map(([o, s]) => `<a class="wkchip ${o === t.id ? 'on' : ''}" href="#/scout/${o}">${esc(team(o).short)} · ${dt(s.start)} ${String(s.home) === me ? '<span class="hl-h" title="Home — white jerseys">H</span>' : '<span class="hl-a" title="Away — green jerseys">A</span>'}</a>`).join('')}<a class="wkchip ${d.self ? 'on' : ''}" href="#/scout/${me}">Self-scout</a>`;
    const tile = (l, v, s = '') => `<div class="st"><span class="l">${l}</span><span class="v">${v}</span><span class="s">${s}</span></div>`;
    const lastRes = t.results.filter((r) => weekKey(r.date) === d.lastWk), lwRec = rec(lastRes.reduce((a, r) => { a[r.r]++; return a; }, { W: 0, L: 0, T: 0 }));
    after(() => {
      $('#sc-pick').addEventListener('change', (e) => { location.hash = `#/scout/${e.target.value}`; });
      periodChart($('#sc-per'), t);
      timingChart($('#sc-time'), {
        up: { label: 'Scored', color: d.self ? 'var(--us)' : 'var(--blue)', goals: d.games.flatMap((g) => g.ev.filter((e) => e.type === 'goal' && String(e.teamId) === t.id)) },
        down: { label: 'Allowed', color: 'var(--red)', goals: d.games.flatMap((g) => g.ev.filter((e) => e.type === 'goal' && String(e.teamId) !== t.id)) },
        notes: $('#sc-time-notes'),
      });
      if (!d.self && d.common.length) sortable($('#sc-common'), d.common.map((c) => ({ ...c, id: c.o.id })), [
        { key: 'opp', label: 'Opponent', cls: 'l', val: (c) => c.o.name, desc: false, html: (c) => tn(c.o) },
        { key: 'them', label: esc(t.short), val: (c) => c.them.gf - c.them.ga, html: (c) => `<span class="rb ${c.them.W > c.them.L ? 'W' : c.them.L > c.them.W ? 'L' : 'T'}">${rec(c.them)}</span>${c.them.gf}–${c.them.ga}` },
        { key: 'us', label: esc(my.short), val: (c) => c.us.gf - c.us.ga, html: (c) => `<span class="rb ${c.us.W > c.us.L ? 'W' : c.us.L > c.us.W ? 'L' : 'T'}">${rec(c.us)}</span>${c.us.gf}–${c.us.ga}` },
        { key: 'edge', label: 'Edge', val: (c) => (c.us.gf - c.us.ga) - (c.them.gf - c.them.ga), html: (c) => { const e = (c.us.gf - c.us.ga) - (c.them.gf - c.them.ga); return `<span class="${e > 0 ? 'pos' : e < 0 ? 'neg' : ''}">${e > 0 ? esc(my.short) : e < 0 ? esc(t.short) : 'Even'} ${e ? sign(Math.abs(e)) : ''}</span>`; }, title: 'Goal-differential difference against that opponent' },
      ], { key: 'edge' });
    });

    // --- sections
    const keysHtml = keys.length
      ? `<ol class="keys">${keys.map((k) => `<li><b>${esc(k.title)}</b><span>${esc(k.evidence)}</span></li>`).join('')}</ol>`
      : `<div class="empty">${n < 2 ? 'Not enough games yet for reliable keys' : 'Nothing stands out yet — a well-rounded team so far'}</div>`;
    const nextHtml = d.nextMeet
      ? (() => {
        const rink = d.rinkFor(d.nextMeet), rt = d.rinkRec(t.id, rink), ru = d.rinkRec(me, rink);
        const weHome = String(d.nextMeet.home) === me, them = weHome ? t.away : t.home, us = weHome ? my.home : my.away;
        return `<div class="note nextmeet"><b>Next meeting:</b> ${haBadge(weHome)} ${dt(d.nextMeet.start, { weekday: 'short', month: 'short', day: 'numeric' })} · ${tm(d.nextMeet.start)} · ${esc(rink || '')}<br><b>Situational:</b> ${esc(t.short)} ${weHome ? 'on the road' : 'at home'} ${them.w}-${them.l}-${them.t} · ${esc(my.short)} ${weHome ? 'at home' : 'on the road'} ${us.w}-${us.l}-${us.t}${rt || ru ? `<br><b>At this rink:</b> ${esc(t.short)} ${rt ? rec(rt) : 'no games'} · ${esc(my.short)} ${ru ? rec(ru) : 'no games'}` : ''}</div>`;
      })() : '';
    const threats = d.byPts.slice(0, 8).map((p) => {
      const lw = d.lwPts(p);
      return `<tr><td class="l">${playerLink(p.id, p.name)}<span class="sub2">#${esc(p.number)}</span></td><td>${p.g}</td><td>${p.a}</td><td class="pts" style="font-size:16px">${p.pts}</td><td class="hm">${p.ptsPerGame.toFixed(2)}</td><td class="hm">${p.ppg}</td><td>${lw ? `${lw}${lw >= 5 ? '<span class="chip gwg">HOT</span>' : ''}` : '–'}</td></tr>`;
    }).join('');
    const gSec = (g) => (d.glSec ? Math.round((g.seconds / d.glSec) * 100) : 0);
    const goalieRows = d.gls.map((g) => `<tr><td class="l">${playerLink(g.id, g.name)}<span class="sub2">#${esc(g.number)}</span></td><td>${g.gp}</td><td>${gSec(g)}%</td><td>${g.w}-${g.l}-${g.t}</td><td>${rate(g.svPct)}</td><td>${g.gaa == null ? '—' : g.gaa.toFixed(2)}</td></tr>`).join('');
    const sc = d.script;
    const kv = (rows) => `<div class="kv">${rows.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>`;

    return `
      <div class="ptitle"><div><div class="k">Scouting report · ${d.self ? 'self-scout' : d.nextMeet ? `next opponent · ${esc(my.short)} ${String(d.nextMeet.home) === me ? 'home' : 'away'}` : 'opponent'} · ${n} GP</div>
        <h1 class="sc-h1">${logo(t)}${esc(t.name)}</h1>
        <div class="s">${ordinal(t.rank)} · ${rec({ W: t.w, L: t.l, T: t.t })} · last 5 ${esc(t.last5 || '–')}</div></div>
        <select id="sc-pick" aria-label="Scout a team">${opts}</select></div>
      <div class="wkbar">${chips}</div>

      <div style="margin-bottom:18px">${panel('Keys to the game', `<div class="pb">${keysHtml}</div>${nextHtml}`, { gold: true, meta: `Based on ${n} game${n === 1 ? '' : 's'}` })}</div>

      <div style="margin-bottom:18px">${panel('Snapshot', `<div class="stats">
        ${tile('Record', rec({ W: t.w, L: t.l, T: t.t }), `${ordinal(t.rank)} in division`)}
        ${tile('GF / game', t.gfPerGame.toFixed(1), rk(d.ranks.gfpg) + ' offense')}
        ${tile('GA / game', t.gaPerGame.toFixed(1), rk(d.ranks.gapg) + ' defense')}
        ${tile('Last weekend', lwRec, d.lastWk ? esc(weekLabel(d.lastWk)) : '')}
        ${tile('Power play', pctS(t.ppPct), `${t.ppg}/${t.ppo} · ${rk(d.ranks.pp)}`)}
        ${tile('Penalty kill', pctS(t.pkPct), `${t.tsh - t.ppga}/${t.tsh} · ${rk(d.ranks.pk)}`)}
      </div>`)}</div>

      ${!d.self ? `<div class="grid g-6-6">
        ${panel(`History vs ${esc(my.short)}`, d.h2h.length ? gameCards(d.h2h, me) : `<div class="empty">Haven't played ${esc(my.short)} yet</div>`, { meta: d.h2h.length ? `${d.h2h.length} game${d.h2h.length > 1 ? 's' : ''}` : '' })}
        ${panel('Common opponents', d.common.length ? '<div class="tw"><table id="sc-common"></table></div><div class="note">Same opponent, both teams’ results. Edge = which team did better against them, by goal differential.</div>' : '<div class="empty">No common opponents yet</div>', { meta: `${d.common.length} teams` })}
      </div>` : ''}

      <div class="grid g-7-5">
        ${panel('Who to key on', `<div class="tw"><table class="gl"><thead><tr><th class="l">Player</th><th>G</th><th>A</th><th>PTS</th><th class="hm">P/GP</th><th class="hm">PPG</th><th>Last wknd</th></tr></thead><tbody>${threats}</tbody></table></div>
          <div class="pb">${kv([
            ['Top two goal scorers', `${pctS(d.top2Share)} of goals`],
            ['Different goal scorers', d.scorers],
            ...d.duos.map((x) => [`Duo: ${x.ids.map((i) => esc(playerById.get(i)?.name || '?')).join(' + ')}`, `${x.n} goals together`]),
          ])}</div>`, { gold: true, meta: 'By points' })}
        ${panel('Goalies', `<div class="tw"><table class="gl"><thead><tr><th class="l">Goalie</th><th>GP</th><th>Share</th><th>W-L-T</th><th>SV%</th><th>GAA</th></tr></thead><tbody>${goalieRows || '<tr><td class="l empty" colspan="6">No goalie data</td></tr>'}</tbody></table></div>
          <div class="pb">${kv([
            ['Team save %', `${rate(t.svPct)} ${rk(d.ranks.sv)}`],
            ['Shots against / game', d.sg.length ? `${(d.sh.sa / d.sg.length).toFixed(1)} ${rk(d.ranks.sapg)}` : '—'],
            ['Goals against, last 3 min of periods', `${d.tb.gaLate} of ${t.ga}`],
            ...d.periods.map((p) => [`Goals against in P${p}`, t.gaByPeriod[p] || 0]),
          ])}</div><div class="note">Share = portion of goalie minutes. ${GOALIE_NOTE}</div>`, { meta: `${d.gls.length} goalie${d.gls.length === 1 ? '' : 's'}` })}
      </div>

      <div class="grid g-7-5">
        ${panel('When goals happen', `<div class="pb"><div class="legend"><span><i style="background:${d.self ? 'var(--us)' : 'var(--blue)'}"></i>Scored (up)</span><span><i style="background:var(--red)"></i>Allowed (down)</span></div><div class="chart" id="sc-time"></div><div id="sc-time-notes"></div></div>`, { meta: `${n} GP · 3-minute stretches` })}
        ${panel('Best &amp; worst periods', `<div class="pb"><div class="legend"><span><i style="background:var(--red)"></i>Against</span><span><i style="background:var(--us)"></i>For</span></div><div class="chart" id="sc-per"></div></div>`, { meta: `${n} GP` })}
      </div>

      <div class="grid g-6-6">
        ${panel('Discipline &amp; special teams', `<div class="pb">${kv([
          ['PIM per game', `${(t.pim / Math.max(1, n)).toFixed(1)} ${rk(d.ranks.pim)} <small>avg ${d.avg.pim ? d.avg.pim.toFixed(1) : '—'}</small>`],
          ['Times shorthanded / game', (t.tsh / Math.max(1, n)).toFixed(1)],
          ['Power play', `${pctS(t.ppPct)} (${t.ppg}/${t.ppo}) ${rk(d.ranks.pp)}`],
          ['Penalty kill', `${pctS(t.pkPct)} (${t.tsh - t.ppga}/${t.tsh}) ${rk(d.ranks.pk)}`],
          ['Shorthanded goals for / against', `${t.shg} / ${t.shga}`],
          ...d.infractions.slice(0, 3).map(([k, v]) => [`Infraction: ${esc(k)}`, v]),
          ...d.penPlayers.map((p) => [`Most PIM: ${esc(p.name)} #${esc(p.number)}`, `${p.pim} min`]),
          ['Penalties by period', d.penByPeriod.map(([p, v]) => `P${p} ${v}`).join(' · ') || '—'],
        ])}</div>`, { meta: `${d.pens.length} penalties` })}
        ${panel('Game script', `<div class="pb">${kv([
          ['Scoring first', rec(sc.first)],
          ['When opponent scores first', rec(sc.trailFirst)],
          ['One-goal games', rec(sc.oneGoal)],
          ['Blowouts (5+ goals) won / lost', `${sc.blowW} / ${sc.blowL}`],
          ['Comeback wins', sc.comebacks],
          ['Leads lost', sc.blownLeads],
          ['3rd-period goal differential', sign(sc.p3)],
          ...(sc.big ? [['Biggest win', sc.big.m > 0 ? `<a class="lnk" href="#/game/${sc.big.g.id}">${sc.big.gf}–${sc.big.ga} vs ${esc(team(sc.big.g[sc.big.g.home.id === t.id ? 'away' : 'home'].id).short)}</a>` : '—']] : []),
          ...(sc.worst ? [['Toughest loss', sc.worst.m < 0 ? `<a class="lnk" href="#/game/${sc.worst.g.id}">${sc.worst.gf}–${sc.worst.ga} vs ${esc(team(sc.worst.g[sc.worst.g.home.id === t.id ? 'away' : 'home'].id).short)}</a>` : '—']] : []),
        ])}</div>`, { meta: `${sc.n} game sheets` })}
      </div>

      <div style="margin-bottom:18px">${panel('Shots', `<div class="stats wkstats">
        ${tile('Shots for / game', d.sg.length ? (d.sh.sf / d.sg.length).toFixed(1) : '—')}
        ${tile('Shots against / game', d.sg.length ? (d.sh.sa / d.sg.length).toFixed(1) : '—')}
        ${tile('Shooting %', pctS(d.shootPct), `${rk(d.ranks.shoot)} · avg ${pctS(d.avg.shoot)}`)}
        ${tile('Save %', rate(t.svPct), rk(d.ranks.sv))}
      </div><div class="note">From the ${d.sg.length} game sheet${d.sg.length === 1 ? '' : 's'} that recorded shots. ${We === 'They' ? 'High shooting % = they finish their chances; high shots = they generate volume.' : ''}</div>`)}</div>`;
  }

  const notFound = () => `<div class="ptitle"><div><div class="k">404</div><h1>Not found</h1><div class="s"><a class="lnk" href="#/">Back to the scoreboard</a></div></div></div>`;

  // ------------------------------------------------------------ router
  const routes = [
    [/^\/?$/, () => viewTeam(myTeamId())], [/^\/standings$/, viewStandings], [/^\/skaters$/, viewSkaters], [/^\/schedule$/, viewSchedule],
    [/^\/weekends?$/, () => viewWeekend()], [/^\/weekend\/(\d{4}-\d{2}-\d{2})$/, viewWeekend],
    [/^\/scout$/, () => viewScout()], [/^\/scout\/(\d+)$/, viewScout],
    [/^\/team\/(\w+)$/, viewTeam], [/^\/player\/(\d+)$/, viewPlayer], [/^\/game\/(\d+)$/, viewGame],
  ];
  let lastPath = null;
  function render() {
    const path = location.hash.replace(/^#/, '') || '/';
    hooks = [];
    let html = notFound();
    for (const [re, fn] of routes) { const m = path.match(re); if (m) { html = fn(...m.slice(1)); break; } }
    if (!html) return; // view redirected
    $app.innerHTML = html;
    for (const fn of hooks) fn();
    reveal($app);
    const mine = '/team/' + myTeamId();
    document.querySelectorAll('#nav a').forEach((a) => {
      const h = a.getAttribute('href').slice(1);
      const on = h === '/' ? path === '/' || path === mine : path.startsWith(h);
      a.classList.toggle('on', on);
    });
    teamBar();
    if (path !== lastPath) { window.scrollTo(0, 0); lastPath = path; }
  }

  // ------------------------------------------------------------ team bar (top strip): team switcher + last/next game
  function setMyTeam(id) {
    store.set('myTeam', String(id));
    closeTeamMenu();
    if (location.hash === '' || location.hash === '#/' || location.hash === '#') render(); else location.hash = '#/';
  }
  function closeTeamMenu() {
    const m = document.getElementById('tmenu'), b = document.getElementById('tsel');
    if (m) m.hidden = true;
    if (b) b.setAttribute('aria-expanded', 'false');
  }
  function teamBar() {
    const me = team(myTeamId()), el = document.getElementById('teambar');
    const navTeam = document.getElementById('nav-team'); if (navTeam) navTeam.textContent = me.short;
    const mine = S.schedule.filter((s) => involves(s, me.id));
    const last = mine.filter((s) => s.final).at(-1), next = mine.find(isUpcoming);
    const days = (s) => {
      const a = new Date(); a.setHours(0, 0, 0, 0);
      const b = localDate(s.start); b.setHours(0, 0, 0, 0);
      const n = Math.round((b - a) / 864e5);
      return n <= 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`;
    };
    let lastHtml = '', nextHtml = '';
    if (last) {
      const home = String(last.home) === me.id, my = home ? last.homeScore : last.awayScore, op = home ? last.awayScore : last.homeScore, o = team(home ? last.away : last.home);
      const r = my > op ? 'W' : my < op ? 'L' : 'T';
      const inner = `<span class="k">Last</span><span class="rb ${r}">${r}</span><b>${my}–${op}</b> ${home ? 'vs' : '@'} ${esc(o.code)}`;
      lastHtml = last.hasDetail ? `<a class="tb-item tb-last" href="#/game/${last.id}">${inner}</a>` : `<span class="tb-item tb-last">${inner}</span>`;
    }
    if (next) {
      const home = String(next.home) === me.id, o = team(home ? next.away : next.home);
      nextHtml = `<span class="tb-item tb-next"><span class="k">Next</span>${haBadge(home)}<b>${dt(next.start, { weekday: 'short', month: 'short', day: 'numeric' })} · ${tm(next.start)}</b> ${home ? 'vs' : '@'} ${esc(o.short)}<span class="tb-loc"> · ${esc(next.location || '')}</span><span class="tb-days">${days(next)}</span></span>${o.stub ? '' : `<a class="tb-item tb-scout" href="#/scout/${o.id}">Scout ${esc(o.short)} →</a>`}`;
    }
    const opts = [...S.teams].sort((a, b) => a.rank - b.rank).map((t) =>
      `<button class="topt ${t.id === me.id ? 'on' : ''}" role="option" aria-selected="${t.id === me.id}" data-id="${t.id}">${logo(t)}<span class="tn2">${esc(t.name)}</span><span class="tr">${t.w}-${t.l}-${t.t}</span></button>`).join('');
    const open = !document.getElementById('tmenu')?.hidden && document.getElementById('tmenu');
    el.innerHTML = `<div class="wrap tb-in">
      <button class="tsel" id="tsel" aria-haspopup="listbox" aria-expanded="${open ? 'true' : 'false'}" title="Switch team">${logo(me)}<span class="tsn">${esc(me.short)}</span><span class="car" aria-hidden="true">▾</span></button>
      <div class="tb-info">${lastHtml}${nextHtml}</div>
      <div class="tmenu" id="tmenu" role="listbox" aria-label="Choose your team" ${open ? '' : 'hidden'}><div class="tmh">Choose your team</div>${opts}</div>
    </div>`;
  }
  // one set of listeners for the bar + page-level helpers
  document.addEventListener('click', (e) => {
    const sel = e.target.closest('#tsel');
    if (sel) { const m = document.getElementById('tmenu'); m.hidden = !m.hidden; sel.setAttribute('aria-expanded', String(!m.hidden)); return; }
    const opt = e.target.closest('.topt');
    if (opt) { setMyTeam(opt.dataset.id); return; }
    if (!e.target.closest('#tmenu')) closeTeamMenu();
    const sc = e.target.closest('[data-scroll]');
    if (sc) { e.preventDefault(); document.getElementById(sc.dataset.scroll)?.scrollIntoView({ behavior: RM ? 'auto' : 'smooth', block: 'start' }); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeTeamMenu(); });

  // ------------------------------------------------------------ boot
  function prepare() {
    const PER = (S.meta.regulationMinutes || 45) / 3 * 60;
    for (const t of S.teams) {
      t.id = String(t.id);
      t.short = SHORT[t.id] || t.name.replace(/\s+(Hockey Academy|Hockey Club|Hockey|Academy)$/i, '');
      t.code = CODE[t.id] || t.short.replace(/[^A-Za-z ]/g, '').split(/\s+/).map((w) => w[0]).join('').padEnd(3, t.short.replace(/\W/g, '').slice(1)).slice(0, 3).toUpperCase();
      teamById.set(t.id, t);
    }
    for (const p of S.players) playerById.set(p.id, p);
    for (const g of S.goalies || []) goalieById.set(g.id, g);
    // game clock: sheet times count down within each period
    const clock = (period, time) => {
      const pn = /^\d+$/.test(period) ? Number(period) : 4;
      const [m, s] = String(time).split(':').map(Number);
      const rem = Math.max(0, Math.min(PER, (m || 0) * 60 + Math.min(59, s || 0)));
      return (pn - 1) * PER + (PER - rem);
    };
    for (const g of S.games) {
      g.ev = g.events.map((e, i) => ({
        ...e, i, t: clock(e.period, e.time),
        // e.g. "06:86" on a sheet: keep the event, but keep it out of timing analytics
        badClock: !/^\d+:[0-5]\d$/.test(String(e.time || '')),
        regulation: /^[123]$/.test(String(e.period)),
      })).sort((a, b) => a.t - b.t || a.i - b.i);
      // running score + moments: opening, tying and go-ahead goals; comeback wins
      let h = 0, a = 0;
      const trailed = { home: false, away: false };
      for (const e of g.ev) {
        if (e.type !== 'goal') continue;
        const before = e.side === 'home' ? h - a : a - h, first = h + a === 0;
        e.side === 'home' ? h++ : a++;
        e.score = [h, a];
        e.moment = first ? 'Opening goal' : before === -1 ? 'Tying goal' : before === 0 ? 'Go-ahead goal' : null;
        if (h < a) trailed.home = true;
        if (a < h) trailed.away = true;
      }
      const winner = g.home.score > g.away.score ? 'home' : g.away.score > g.home.score ? 'away' : null;
      g.comeback = winner && trailed[winner] ? winner : null;
      g.weekend = weekKey(g.date);
      gameById.set(g.id, g);
    }
    // weekends (Mon-start weeks; games are Fri-Sun) across the whole schedule
    S.weekends = new Map();
    for (const s of S.schedule) {
      const k = weekKey(s.start);
      const w = S.weekends.get(k) || { key: k, items: [], first: s.start, last: s.start };
      w.items.push(s);
      if (s.start < w.first) w.first = s.start;
      if (s.start > w.last) w.last = s.start;
      S.weekends.set(k, w);
    }
    // player firsts + milestones, from each player's chronological game log
    for (const p of S.players) {
      p.firsts = [];
      const add = (label, l, kind) => p.firsts.push({ label, kind, gameId: l.gameId, date: l.date, opp: l.opp });
      const seen = new Set(), tot = { g: 0, pts: 0 };
      const once = (key, cond, label, l) => { if (cond && !seen.has(key)) { seen.add(key); add(label, l, 'first'); } };
      for (const l of p.log) {
        once('g', l.g > 0, 'First goal of the season', l);
        once('a', l.a > 0, 'First assist of the season', l);
        once('mp', l.pts >= 2, 'First multi-point game', l);
        if (l.g >= 3) { if (seen.has('hat')) add('Hat trick', l, 'milestone'); else once('hat', true, 'First hat trick', l); }
        once('ppg', l.ppg > 0, 'First power-play goal', l);
        once('shg', l.shg > 0, 'First shorthanded goal', l);
        const pg = tot.g, pp = tot.pts;
        tot.g += l.g; tot.pts += l.pts;
        for (const m of [10, 25, 50, 75, 100]) if (pp < m && tot.pts >= m) add(`${m}th point`, l, 'milestone');
        for (const m of [10, 25, 50]) if (pg < m && tot.g >= m) add(`${m}th goal`, l, 'milestone');
      }
    }
    // skater ranking (ties share a rank)
    S.skaters = S.players.filter((p) => !p.isGoalie || p.pts > 0).sort((a, b) => b.pts - a.pts || b.g - a.g || a.name.localeCompare(b.name));
    let rk = 0, prev = null;
    S.skaters.forEach((p, i) => { if (p.pts !== prev) rk = i + 1; p.rank = rk; prev = p.pts; });
  }

  function chrome() {
    document.getElementById('brand-division').textContent = S.meta.division;
    document.getElementById('upd').textContent = `${S.meta.league} · ${S.meta.season} · Updated ${new Date(S.meta.updatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
    document.title = `${S.meta.division} · ${S.meta.league}`;
    const so = S.meta.scoreOnlyGames?.length;
    document.getElementById('foot').innerHTML = `Unofficial stats built from the <a class="lnk" href="${esc(S.meta.sourceUrl)}" target="_blank" rel="noopener">${esc(S.meta.league)}</a> published game sheets · ${S.meta.gamesPlayed} of ${S.meta.gamesScheduled} games final${so ? ` · ${so} counted from the final score only (no game sheet yet)` : ''}.${savedKey() ? ' · <a class="lnk" href="#" id="lock">Lock this device</a>' : ''}`;
  }

  // ------------------------------------------------------------ password gate
  // The published stats are AES-GCM encrypted (scripts/crypto.mjs). The derived key — never the
  // password — can be remembered on this device; the salt is fixed so it survives rebuilds.
  const b64d = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const b64e = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const KEY_STORE = 'st:siteKey';
  async function deriveKey(password, env) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(env.salt), iterations: env.iterations },
      base, { name: 'AES-GCM', length: 256 }, true, ['decrypt']);
  }
  async function decryptWith(key, env) {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(env.iv) }, key, b64d(env.ct));
    return JSON.parse(new TextDecoder().decode(pt));
  }
  const savedKey = () => { try { return localStorage.getItem(KEY_STORE) || sessionStorage.getItem(KEY_STORE); } catch { return null; } };
  const saveKey = async (key, remember) => {
    const raw = b64e(await crypto.subtle.exportKey('raw', key));
    try { (remember ? localStorage : sessionStorage).setItem(KEY_STORE, raw); } catch { /* private mode: unlock each visit */ }
  };
  const forgetKey = () => { try { localStorage.removeItem(KEY_STORE); sessionStorage.removeItem(KEY_STORE); } catch { /* ignore */ } };

  async function unlock(env) {
    const cached = savedKey();
    if (cached) {
      try {
        const key = await crypto.subtle.importKey('raw', b64d(cached), 'AES-GCM', false, ['decrypt']);
        return await decryptWith(key, env);
      } catch { forgetKey(); } // password changed since this device unlocked
    }
    document.body.classList.add('locked');
    $app.innerHTML = `
      <section class="gate panel">
        <div class="ph"><h2 class="gold">Team access</h2><span class="meta">${esc(document.title)}</span></div>
        <form class="gate-f" id="gate" autocomplete="on">
          <p>These stats are shared with team families. Enter the team password to continue.</p>
          <label class="gate-l" for="gate-pw">Password</label>
          <input id="gate-pw" type="password" autocomplete="current-password" required autofocus>
          <label class="gate-r"><input type="checkbox" id="gate-rem" checked> Remember this device</label>
          <button class="btn on" type="submit" id="gate-go">Unlock</button>
          <div class="gate-err" id="gate-err" role="alert"></div>
        </form>
      </section>`;
    return new Promise((resolve) => {
      const f = document.getElementById('gate'), pw = document.getElementById('gate-pw'), go = document.getElementById('gate-go'), err = document.getElementById('gate-err');
      pw.focus();
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        go.disabled = true; go.textContent = 'Unlocking…'; err.textContent = '';
        try {
          const key = await deriveKey(pw.value, env);
          const data = await decryptWith(key, env);
          await saveKey(key, document.getElementById('gate-rem').checked);
          document.body.classList.remove('locked');
          resolve(data);
        } catch {
          go.disabled = false; go.textContent = 'Unlock';
          err.textContent = 'That password didn’t work. Check with your team manager.';
          f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake');
          pw.select();
        }
      });
    });
  }

  async function loadStats() {
    const enc = await fetch('data/stats.enc.json', { cache: 'no-cache' });
    if (enc.ok) return unlock(await enc.json());
    const r = await fetch('data/stats.json', { cache: 'no-cache' }); // local dev build (no password)
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }
  window.addEventListener('click', (e) => { if (e.target.closest('#lock')) { e.preventDefault(); forgetKey(); location.reload(); } });

  loadStats()
    .then((data) => {
      S = data;
      prepare();
      chrome();
      tips();
      window.addEventListener('hashchange', render);
      render();
    })
    .catch((err) => { $app.innerHTML = `<div class="ptitle"><div><div class="k">Error</div><h1>Couldn't load stats</h1><div class="s">${esc(err.message)}</div></div></div>`; });
})();
