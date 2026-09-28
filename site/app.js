// Stat Track — "Primetime" broadcast theme. Renders site/data/stats.json; hash routes, no framework.
(() => {
  'use strict';

  let S; // stats.json
  const $app = document.getElementById('app');
  const teamById = new Map(), playerById = new Map(), gameById = new Map();

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

  function flowChart(el, g) {
    const PER = (S.meta.regulationMinutes || 45) / 3 * 60, nPer = Math.max(3, g.periods.length), T = PER * nPer;
    const goals = g.ev.filter((e) => e.type === 'goal');
    mount(el, (w) => {
      const H = 170, m = { l: 22, r: 30, t: 10, b: 34 }, x = lin(0, T, m.l, w - m.r);
      const mx = ticks(Math.max(1, g.home.score, g.away.score), 3).at(-1), y = lin(0, mx, H - m.b, m.t);
      const path = (side) => { let d = `M${x(0)},${y(0)}`, n = 0; for (const e of goals) if (e.side === side) d += `H${x(e.t)}V${y(++n)}`; return d + `H${x(T)}`; };
      let s = `<svg width="${w}" height="${H}" role="img" aria-label="Running score through the game">`;
      for (const v of ticks(mx, 3)) s += `<line class="gr" x1="${m.l}" x2="${w - m.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end" style="font-size:11px;fill:var(--ink3)">${v}</text>`;
      for (let p = 1; p <= nPer; p++) s += `${p > 1 ? `<line class="ax" x1="${x((p - 1) * PER)}" x2="${x((p - 1) * PER)}" y1="${m.t}" y2="${H - m.b}"/>` : ''}<text x="${x((p - 0.5) * PER)}" y="${H - m.b + 18}" text-anchor="middle" style="font-size:12px">${p <= 3 ? 'P' + p : 'OT'}</text>`;
      // power-play windows: from the penalty to its expiry (or period end), tinted for the team with the advantage
      for (const e of g.ev) {
        if (e.type !== 'penalty' || !e.minutes || e.minutes > 5 || !e.regulation) continue;
        const pEnd = Number(e.period) * PER, x0 = x(e.t), x1 = x(Math.min(pEnd, e.t + e.minutes * 60));
        const adv = team(e.side === 'home' ? g.away.id : g.home.id);
        s += `<rect class="fade" x="${x0}" y="${m.t}" width="${Math.max(1, x1 - x0)}" height="${H - m.b - m.t}" fill="${e.side === 'home' ? 'var(--red)' : 'var(--us)'}" fill-opacity=".09" ${tip(`${adv.short} power play`, `${e.time} P${e.period} · ${team(e.teamId).short} ${e.infraction || 'penalty'} (${e.minutes} min)`)}/>`;
      }
      const len = w * 2;
      s += `<path class="draw" style="--len:${len}" d="${path('away')}" fill="none" stroke="var(--red)" stroke-width="2" stroke-linejoin="round"/>
            <path class="draw" style="--len:${len}" d="${path('home')}" fill="none" stroke="var(--us)" stroke-width="2.5" stroke-linejoin="round"/>`;
      for (const e of g.ev) {
        if (e.type === 'penalty') { s += `<rect x="${x(e.t) - 1}" y="${H - m.b - 6}" width="2" height="6" fill="var(--ink3)" ${tip(`${e.time} P${e.period} · Penalty`, `${team(e.teamId).short} · ${e.infraction || ''}`)}/>`; continue; }
        const n = e.side === 'home' ? e.score[0] : e.score[1];
        s += `<g class="fade" ${tip(`${e.time} P${e.period} · ${e.score[1]}–${e.score[0]}`, `${e.scorer.name} (${team(e.teamId).short})${e.tags.length ? ' · ' + e.tags.join(', ') : ''}`)}><circle cx="${x(e.t)}" cy="${y(n)}" r="11" class="hit"/><circle cx="${x(e.t)}" cy="${y(n)}" r="4" fill="${e.side === 'home' ? 'var(--us)' : 'var(--red)'}" stroke="var(--panel)" stroke-width="2"/></g>`;
      }
      s += `<text x="${w - m.r + 6}" y="${y(g.home.score) + 4}" class="t-us" style="font-size:14px">${g.home.score}</text><text x="${w - m.r + 6}" y="${y(g.away.score) + 4}" class="t-strong" style="font-size:14px">${g.away.score}</text>`;
      return s + '</svg>';
    });
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

  // Goal timing heatmap: 3 regulation periods x 5 three-minute buckets. rows: [{ label, color, goals: [event] }]
  function heatmap(el, rows) {
    const PER = (S.meta.regulationMinutes || 45) / 3 * 60, B = 5, bucket = PER / B;
    const grid = rows.map((r) => {
      const c = Array(3 * B).fill(0);
      for (const e of r.goals) {
        if (!e.regulation || e.badClock) continue;
        const pn = Number(e.period) - 1, within = e.t - pn * PER;
        c[pn * B + Math.min(B - 1, Math.floor(within / bucket))]++;
      }
      return { ...r, c, n: c.reduce((a, b) => a + b, 0) };
    });
    mount(el, (w) => {
      const lab = 78, top = 22, rh = 40, cw = (w - lab) / (3 * B), H = top + rows.length * (rh + 6);
      let s = `<svg width="${w}" height="${H}" role="img" aria-label="When goals are scored, by period and minute">`;
      for (let p = 0; p < 3; p++) s += `<text x="${lab + cw * (p * B + B / 2)}" y="12" text-anchor="middle" class="t-strong" style="font-size:13px">P${p + 1} <tspan style="fill:var(--ink3);font-weight:600;font-size:11px">0–${Math.round(PER / 60)}'</tspan></text>`;
      grid.forEach((r, ri) => {
        const y = top + ri * (rh + 6), mx = Math.max(1, ...r.c);
        s += `<text x="0" y="${y + rh / 2 - 2}" class="t-strong" style="font-size:13px">${esc(r.label)}</text><text x="0" y="${y + rh / 2 + 13}" style="font-size:11px;fill:var(--ink3)">${r.n} goals</text>`;
        r.c.forEach((v, i) => {
          const p = Math.floor(i / B), b = i % B, x = lab + cw * i + 1;
          const a = v ? 0.14 + 0.86 * (v / mx) : 0;
          const m0 = Math.round((b * bucket) / 60), m1 = Math.round(((b + 1) * bucket) / 60);
          s += `<g class="fade" style="transition-delay:${i * 18}ms" ${tip(`${r.label} · P${p + 1}, minutes ${m0}–${m1}`, `${v} goal${v === 1 ? '' : 's'}`)}>
            <rect x="${x}" y="${y}" width="${cw - 2}" height="${rh}" fill="${v ? r.color : 'var(--panel2)'}" fill-opacity="${v ? a : 1}"/>
            ${v ? `<text x="${x + (cw - 2) / 2}" y="${y + rh / 2 + 5}" text-anchor="middle" style="font-size:13px;font-weight:700;fill:${a > 0.55 ? '#0B0B0B' : 'var(--ink)'}">${v}</text>` : ''}</g>`;
        });
      });
      for (let p = 1; p < 3; p++) s += `<line x1="${lab + cw * p * B}" x2="${lab + cw * p * B}" y1="${top - 4}" y2="${H}" style="stroke:var(--bg);stroke-width:3"/>`;
      return s + '</svg>';
    });
  }

  // Linemates: who sets up whom on one team, from goal/assist pairs. Circle layout, curved links.
  function networkChart(el, teamId) {
    const pairs = new Map(), involvement = new Map();
    let goals = 0, assisted = 0;
    for (const g of S.games) for (const e of g.ev) {
      if (e.type !== 'goal' || String(e.teamId) !== String(teamId) || !e.playerId) continue;
      goals++;
      const as = e.assists.filter((a) => a.playerId);
      if (as.length) assisted++;
      for (const a of as) {
        const k = [a.playerId, e.playerId].sort().join('|');
        const p = pairs.get(k) || { a: [a.playerId, e.playerId].sort()[0], b: [a.playerId, e.playerId].sort()[1], n: 0, detail: [] };
        p.n++; p.detail.push(`${playerById.get(a.playerId)?.name.split(' ')[0]} → ${e.scorer.name.split(' ')[0]}`);
        pairs.set(k, p);
        for (const id of [a.playerId, e.playerId]) involvement.set(id, (involvement.get(id) || 0) + 1);
      }
    }
    const nodes = [...involvement.keys()].map((id) => playerById.get(id)).filter(Boolean).sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0));
    mount(el, (w) => {
      if (!nodes.length) return '<div class="empty">No assisted goals yet</div>';
      const H = Math.min(440, Math.max(300, w * 0.8)), cx = w / 2, cy = H / 2, R = Math.min(w, H) / 2 - 58;
      const pos = new Map(nodes.map((p, i) => { const a = -Math.PI / 2 + (i / nodes.length) * Math.PI * 2; return [p.id, { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a), a }]; }));
      const mxN = Math.max(1, ...[...pairs.values()].map((p) => p.n)), mxI = Math.max(1, ...involvement.values());
      let s = `<svg width="${w}" height="${H}" role="img" aria-label="Assist connections between teammates">`;
      [...pairs.values()].sort((a, b) => a.n - b.n).forEach((p, i) => {
        const A = pos.get(p.a), B = pos.get(p.b); if (!A || !B) return;
        const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2, qx = mx + (cx - mx) * 0.55, qy = my + (cy - my) * 0.55;
        const k = p.n / mxN;
        s += `<path class="fade link" style="transition-delay:${200 + i * 20}ms" data-a="${p.a}" data-b="${p.b}" d="M${A.x},${A.y}Q${qx},${qy} ${B.x},${B.y}" fill="none" stroke="${k > 0.6 ? 'var(--us)' : 'var(--blue)'}" stroke-width="${1.5 + 5 * k}" stroke-opacity="${0.35 + 0.5 * k}" stroke-linecap="round" ${tip(`${p.n} goal${p.n > 1 ? 's' : ''} together`, p.detail.join(' · '))}/>`;
      });
      nodes.forEach((p) => {
        const P = pos.get(p.id), r = 5 + 9 * ((involvement.get(p.id) || 0) / mxI), right = Math.cos(P.a) >= 0;
        const lx = P.x + Math.cos(P.a) * (r + 8), ly = P.y + Math.sin(P.a) * (r + 8) + 4;
        s += `<a href="#/player/${p.id}"><g class="node" data-id="${p.id}" ${tip(p.name, `${p.g} G · ${p.a} A · in ${involvement.get(p.id)} assisted goal${involvement.get(p.id) > 1 ? 's' : ''}`)}>
          <circle cx="${P.x}" cy="${P.y}" r="${r + 6}" class="hit"/>
          <circle cx="${P.x}" cy="${P.y}" r="${r}" fill="var(--panel2)" stroke="var(--us)" stroke-width="2"/>
          <text x="${lx}" y="${ly}" text-anchor="${Math.abs(Math.cos(P.a)) < 0.25 ? 'middle' : right ? 'start' : 'end'}" style="font-size:12px">${esc(p.name.split(' ')[0])} <tspan style="fill:var(--ink3)">#${esc(p.number)}</tspan></text></g></a>`;
      });
      return s + '</svg>';
    });
    // hover a player: fade links that don't touch them
    el.addEventListener('pointerover', (e) => {
      const n = e.target.closest?.('.node'); if (!n) return;
      el.querySelectorAll('.link').forEach((l) => (l.style.opacity = l.dataset.a === n.dataset.id || l.dataset.b === n.dataset.id ? '1' : '.08'));
    });
    el.addEventListener('pointerout', (e) => { if (e.target.closest?.('.node')) el.querySelectorAll('.link').forEach((l) => (l.style.opacity = '')); });
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
        inner = `<div class="d">${d} · Final</div><div class="o">${logo(o)}${who}<span class="res ${r}">${r ? r + ' ' : ''}${my}–${op}</span></div><div class="r">${esc(x.location || '')}</div>`;
      } else {
        inner = `<div class="d">${d} · ${tm(x.start)}</div><div class="o">${logo(o)}${who}</div><div class="r">${esc(x.location || '')}${o.stub ? '' : ` · opp ${o.w}-${o.l}-${o.t}`}</div>`;
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
  function viewHome() {
    const me = team(myTeamId());
    const mySched = S.schedule.filter((s) => involves(s, me.id));
    const played = mySched.filter((s) => s.final).slice(-4).reverse();
    const upcoming = mySched.filter(isUpcoming);
    const favs = favPlayers();
    const followed = [...favs].map((id) => playerById.get(id)).sort((a, b) => b.pts - a.pts);
    after(() => {
      sortable($('#standings'), S.teams, standingsCols(false), { key: 'rank', dir: 1, rowCls: mineRow });
      gdChart($('#gd'), me.id);
      periodChart($('#byper'), me);
      stChart($('#st'), me.id);
    });
    return `
      ${hero(me)}
      <div class="grid g-7-5">
        ${panel('Standings', '<div class="tw"><table id="standings"></table></div>', { meta: 'Tap a column to sort' })}
        ${panel('Goal differential', '<div class="pb"><div class="chart" id="gd"></div></div>', { meta: 'GF − GA' })}
      </div>
      <div class="grid g-5-7">
        ${panel(`${esc(me.short)} by period`, `<div class="pb"><div class="legend"><span><i style="background:var(--red)"></i>Goals against</span><span><i style="background:var(--us)"></i>Goals for</span></div><div class="chart" id="byper"></div></div>`, { gold: true, meta: `${me.gp} GP` })}
        ${panel('Special teams', '<div class="pb"><div class="chart" id="st"></div></div>', { meta: 'PP% × PK%' })}
      </div>
      ${followed.length ? `<div style="margin-bottom:18px">${panel('Following', `<div class="pb"><div class="leaders">${leaderRows(followed, () => true)}</div></div>`, { gold: true, meta: 'Players you follow' })}</div>` : ''}
      <div style="margin-bottom:18px">${panel('Points leaders', `<div class="pb"><div class="leaders">${leaderRows(S.skaters.slice(0, 12), (p) => favs.has(p.id) || String(p.teamId) === me.id)}</div></div>`, { meta: '<a class="lnk" href="#/skaters">All skaters →</a>' })}</div>
      <div style="margin-bottom:18px">${panel(`Last results · ${esc(me.short)}`, gameCards(played, me.id), { meta: `<a class="lnk" href="#/weekend">Weekend recap →</a>` })}</div>
      <div style="margin-bottom:18px">${panel(`Up next · ${esc(me.short)}`, gameCards(upcoming.slice(0, 4), me.id), { gold: true, meta: `${upcoming.length} remaining` })}</div>`;
  }

  function viewStandings() {
    const periods = [...new Set(S.teams.flatMap((t) => Object.keys(t.gfByPeriod)))].sort();
    after(() => {
      sortable($('#standings'), S.teams, standingsCols(true), { key: 'rank', dir: 1, rowCls: mineRow });
      gdChart($('#gd'), myTeamId());
      stChart($('#st'), myTeamId());
      const me = team(myTeamId());
      heatmap($('#heat'), [
        { label: 'Division', color: 'var(--blue)', goals: S.games.flatMap((g) => g.ev.filter((e) => e.type === 'goal')) },
        { label: me.short, color: 'var(--us)', goals: S.games.flatMap((g) => g.ev.filter((e) => e.type === 'goal' && String(e.teamId) === me.id)) },
      ]);
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
      <div style="margin-bottom:18px">${panel('When goals happen', '<div class="pb"><div class="chart" id="heat"></div></div><div class="note">Every regulation goal in the division, by period and 3-minute stretch. Darker = more goals.</div>', { meta: 'Division-wide' })}</div>`;
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
      ], { key: 'pts', rowCls: (p) => (favs.has(p.id) || String(p.teamId) === myTeamId() ? 'me' : ''), rowAttrs: (p) => `data-team="${esc(p.teamId)}" data-name="${esc(p.name.toLowerCase())}"` });
      const sel = $('#sk-team'), q = $('#sk-q');
      sel.addEventListener('change', () => { f.team = sel.value; store.set('skaterFilter', f); apply(); });
      q.addEventListener('input', () => { f.q = q.value; store.set('skaterFilter', f); apply(); });
      apply();
    });
    const opts = [...S.teams].sort((a, b) => a.name.localeCompare(b.name)).map((t) => `<option value="${t.id}" ${f.team === String(t.id) ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
    return `
      <div class="ptitle"><div><div class="k">${esc(S.meta.division)} · skaters</div><h1>Scoring leaders</h1><div class="s" id="sk-count"></div></div></div>
      <div style="margin-bottom:18px">${panel('All skaters', `<div class="controls"><select id="sk-team" aria-label="Filter by team"><option value="">All teams</option>${opts}</select><input type="search" id="sk-q" placeholder="Search players" aria-label="Search players" value="${esc(f.q)}"></div><div class="tw"><table id="skaters"></table></div><div class="note">MPG = multi-point games · STRK = current point streak · GWG as recorded by the league.</div>`, { gold: true, reveal: false })}</div>`;
  }

  function viewSchedule() {
    const sel = String(store.get('schedTeam', myTeamId()) || '');
    const items = S.schedule.filter((s) => !sel || involves(s, sel));
    const past = items.filter((s) => s.final).reverse();
    const next = items.filter(isUpcoming);
    after(() => $('#sc-team').addEventListener('change', (e) => { store.set('schedTeam', e.target.value); render(); }));
    const opts = [...S.teams].sort((a, b) => a.name.localeCompare(b.name)).map((t) => `<option value="${t.id}" ${sel === String(t.id) ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
    return `
      <div class="ptitle"><div><div class="k">${esc(S.meta.season)} · ${esc(S.meta.division)}</div><h1>Schedule</h1><div class="s">${S.meta.gamesPlayed} of ${S.meta.gamesScheduled} games final</div></div>
        <select id="sc-team" aria-label="Filter by team"><option value="">All teams</option>${opts}</select></div>
      <div style="margin-bottom:18px">${panel('Upcoming', gameCards(next, sel || null), { gold: true, meta: `${next.length} games` })}</div>
      <div style="margin-bottom:18px">${panel('Results', gameCards(past, sel || null), { meta: `${past.length} games` })}</div>`;
  }

  function viewTeam(id) {
    if (id === 'mine') { location.replace('#/team/' + myTeamId()); return ''; }
    const t = teamById.get(String(id));
    if (!t) return notFound();
    const isMine = String(id) === myTeamId();
    const roster = S.players.filter((p) => String(p.teamId) === String(id));
    const sched = S.schedule.filter((s) => involves(s, id));
    const h2h = new Map();
    for (const r of t.results) {
      const o = h2h.get(r.opp) || { id: r.opp, gp: 0, w: 0, l: 0, t: 0, gf: 0, ga: 0 };
      o.gp++; o[r.r.toLowerCase()]++; o.gf += r.gf; o.ga += r.ga;
      h2h.set(r.opp, o);
    }
    const favs = favPlayers();
    after(() => {
      periodChart($('#byper'), t);
      sortable($('#roster'), roster, [
        { key: 'name', label: 'Player', cls: 'l', val: (p) => p.name, desc: false, html: (p) => `${playerLink(p.id, p.name)}${p.isGoalie ? '<span class="chip" title="Goalie">G</span>' : ''}${favs.has(p.id) ? '<span class="chip gwg">★</span>' : ''}` },
        { key: 'num', label: '#', val: (p) => Number(p.number) || 0, desc: false },
        { key: 'gp', label: 'GP', val: (p) => p.gp },
        { key: 'g', label: 'G', val: (p) => p.g }, { key: 'a', label: 'A', val: (p) => p.a },
        { key: 'pts', label: 'PTS', val: (p) => p.pts, html: (p) => `<span class="pts">${p.pts}</span>` },
        { key: 'ppgp', label: 'P/GP', cls: 'hm', val: (p) => p.ptsPerGame, html: (p) => p.ptsPerGame.toFixed(2) },
        { key: 'ppg', label: 'PPG', cls: 'hm', val: (p) => p.ppg }, { key: 'gwg', label: 'GWG', cls: 'hm', val: (p) => p.gwg },
        { key: 'strk', label: 'STRK', cls: 'hm', val: (p) => p.pointStreak.current, html: (p) => p.pointStreak.current || '–' },
      ], { key: 'pts', rowCls: (p) => (favs.has(p.id) ? 'me' : '') });
      sortable($('#h2h'), [...h2h.values()], [
        { key: 'opp', label: 'Opponent', cls: 'l', val: (o) => team(o.id).name, desc: false, html: (o) => tn(team(o.id)) },
        { key: 'gp', label: 'GP', val: (o) => o.gp },
        { key: 'rec', label: 'W-L-T', val: (o) => o.w * 2 + o.t, html: (o) => `${o.w}-${o.l}-${o.t}` },
        { key: 'gf', label: 'GF', val: (o) => o.gf }, { key: 'ga', label: 'GA', val: (o) => o.ga },
        { key: 'diff', label: 'DIFF', val: (o) => o.gf - o.ga, html: (o) => `<span class="${o.gf > o.ga ? 'pos' : o.gf < o.ga ? 'neg' : ''}">${sign(o.gf - o.ga)}</span>` },
      ], { key: 'gp' });
      const b = $('#set-mine'); if (b) b.addEventListener('click', () => { store.set('myTeam', String(id)); render(); });
    });
    const teamGoals = (forTeam) => S.games.flatMap((g) => g.ev.filter((e) => e.type === 'goal' && (String(e.teamId) === String(id)) === forTeam && (String(g.home.id) === String(id) || String(g.away.id) === String(id))));
    // weekend-by-weekend record
    const wk = new Map();
    for (const r of t.results) {
      const k = weekKey(r.date), o = wk.get(k) || { id: k, gp: 0, w: 0, l: 0, t: 0, gf: 0, ga: 0 };
      o.gp++; o[r.r.toLowerCase()]++; o.gf += r.gf; o.ga += r.ga; wk.set(k, o);
    }
    after(() => {
      progChart($('#prog'), t);
      heatmap($('#heat'), [
        { label: 'Scored', color: 'var(--us)', goals: teamGoals(true) },
        { label: 'Allowed', color: 'var(--red)', goals: teamGoals(false) },
      ]);
      const net = networkChart($('#net'), id);
      const nm = $('#net-meta'); if (nm) nm.textContent = net.goals ? `${net.assisted} of ${net.goals} goals assisted` : '';
      sortable($('#wk'), [...wk.values()], [
        { key: 'id', label: 'Weekend', cls: 'l', val: (o) => o.id, desc: false, html: (o) => `<a class="lnk" href="#/weekend/${o.id}">${esc(weekLabel(o.id))}</a>` },
        { key: 'gp', label: 'GP', val: (o) => o.gp },
        { key: 'rec', label: 'W-L-T', val: (o) => o.w * 2 + o.t, html: (o) => `${o.w}-${o.l}-${o.t}` },
        { key: 'gf', label: 'GF', val: (o) => o.gf }, { key: 'ga', label: 'GA', val: (o) => o.ga },
        { key: 'diff', label: 'DIFF', val: (o) => o.gf - o.ga, html: (o) => `<span class="${o.gf > o.ga ? 'pos' : o.gf < o.ga ? 'neg' : ''}">${sign(o.gf - o.ga)}</span>` },
      ], { key: 'id', dir: 1 });
    });
    const action = isMine ? '<span class="tag-mine">My team</span>' : '<button class="btn" id="set-mine">Make this my team</button>';
    const upcoming = sched.filter(isUpcoming);
    return `
      ${hero(t, { action })}
      <div style="margin-bottom:18px">${panel('Season progression', `<div class="pb"><div class="legend"><span><i style="background:var(--us)"></i>Goals for (running)</span><span><i style="background:var(--red)"></i>Goals against (running)</span><span><i style="background:var(--us);height:8px"></i>W</span><span><i style="background:#5A2A22;height:8px"></i>L</span></div><div class="chart" id="prog"></div></div>`, { gold: true, meta: `${t.gp} GP · by weekend` })}</div>
      <div class="grid g-7-5">
        ${panel('When goals happen', '<div class="pb"><div class="chart" id="heat"></div></div><div class="note">Regulation goals by period and 3-minute stretch. Darker = more goals.</div>', { meta: 'Scored vs allowed' })}
        ${panel('By weekend', '<div class="tw"><table id="wk"></table></div>')}
      </div>
      <div style="margin-bottom:18px">${panel('Linemates', '<div class="pb"><div class="chart" id="net"></div></div><div class="note">Lines join a passer and scorer on the same goal — thicker means more goals together. Hover a player to see just their connections. Fills in as the season goes on.</div>', { meta: '<span id="net-meta"></span>' })}</div>
      <div class="grid g-5-7">
        ${panel('By period', `<div class="pb"><div class="legend"><span><i style="background:var(--red)"></i>Goals against</span><span><i style="background:var(--us)"></i>Goals for</span></div><div class="chart" id="byper"></div></div>`, { gold: true, meta: `${t.gp} GP` })}
        ${panel('Roster', '<div class="tw"><table id="roster"></table></div>', { meta: `Team SV% ${rate(t.svPct)} · PIM ${t.pim}` })}
      </div>
      <div style="margin-bottom:18px">${panel('Results', gameCards(sched.filter((s) => s.final).reverse(), id), { meta: `${t.w}-${t.l}-${t.t}` })}</div>
      <div style="margin-bottom:18px">${panel('Up next', gameCards(upcoming.slice(0, 8), id), { gold: true, meta: `${upcoming.length} remaining` })}</div>
      <div style="margin-bottom:18px">${panel('Head to head', '<div class="tw"><table id="h2h"></table></div>')}</div>`;
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
          <div><div class="sub">Log</div><div class="tw"><table class="gl"><thead><tr><th class="l">Date</th><th class="l">Opp</th><th>Result</th><th>G</th><th>A</th><th>PTS</th></tr></thead><tbody>
            ${p.log.slice().reverse().map((g) => `<tr><td class="l"><a class="lnk" href="#/game/${g.gameId}">${dt(g.date)}</a></td><td class="l">${g.home ? 'vs' : '@'} ${esc(team(g.opp).code)}</td><td>${result(g.gameId, p.teamId)}</td><td>${g.g}</td><td>${g.a}</td><td class="pts" style="font-size:16px">${g.pts}${g.gwg ? '<span class="chip gwg">GWG</span>' : ''}</td></tr>`).join('')}
          </tbody></table></div>
          <div class="warn" style="border-color:var(--us)">Point streak ${p.pointStreak.current} (best ${p.pointStreak.best}) · ${p.multiPointGames} multi-point games · ${p.ppg + p.ppa} power-play points · ${p.firstGoals} opening goals</div></div>
        </div>
      </section>
      <div class="grid g-7-5">
        ${panel(`${esc(first)}'s season`, `<div class="pb"><div class="legend"><span><i style="background:var(--us)"></i>Goals</span><span><i style="background:var(--blue)"></i>Assists</span></div><div class="chart" id="pwk"></div></div>`, { gold: true, meta: 'Points by weekend' })}
        ${panel('Firsts &amp; milestones', `<div class="pb">${firstsList(p.firsts.slice().reverse())}</div>`, { meta: `${p.firsts.length}` })}
      </div>`;
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
    const boxTable = (t) => `<div class="tw"><table class="gl"><thead><tr><th>#</th><th class="l">Player</th><th>G</th><th>A</th><th>PTS</th></tr></thead><tbody>${box(t.id).map((r) => `<tr><td>${esc(r.number)}</td><td class="l">${playerLink(r.playerId, r.name)}</td><td>${r.g}</td><td>${r.a}</td><td class="pts" style="font-size:16px">${r.g + r.a}</td></tr>`).join('')}</tbody></table></div>`;
    const plabel = (l) => (/^\d+$/.test(l) ? 'P' + l : l);
    after(() => flowChart($('#flow'), g));
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
            <div class="sub">Game flow</div>
            <div class="legend"><span><i style="background:var(--red)"></i>${esc(a.short)}</span><span><i style="background:var(--us)"></i>${esc(h.short)}</span><span><i style="background:var(--ink3);height:2px;vertical-align:3px"></i>Penalty</span></div>
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
              return `<li class="ev pen"><span class="pn">${esc(plabel(e.period))}</span><span class="tc">${esc(e.time)}</span><span class="who"><b>${esc(t.short)} penalty · ${e.minutes} min</b><span>${esc(e.infraction || '')}</span></span><span class="scr" style="color:var(--ink3);font-size:12px">PEN</span></li>`;
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
    const mine = items.filter((s) => involves(s, me.id));
    const myFinals = mine.filter((s) => s.final);
    const rec = { W: 0, L: 0, T: 0 }, gfga = [0, 0];
    for (const s of myFinals) {
      const home = String(s.home) === me.id, my = home ? s.homeScore : s.awayScore, op = home ? s.awayScore : s.homeScore;
      rec[my > op ? 'W' : my < op ? 'L' : 'T']++; gfga[0] += my; gfga[1] += op;
    }
    // weekend scoring leaders
    const tally = new Map();
    for (const g of games) for (const r of g.skaters) {
      if (!r.playerId || !(r.g + r.a)) continue;
      const t = tally.get(r.playerId) || { ...playerById.get(r.playerId), g: 0, a: 0, pts: 0 };
      t.g += r.g; t.a += r.a; t.pts += r.g + r.a; tally.set(r.playerId, t);
    }
    const leaders = [...tally.values()].filter((p) => p.id).sort((a, b) => b.pts - a.pts || b.g - a.g || a.name.localeCompare(b.name));
    let rk = 0, prev = null; leaders.forEach((p, i) => { if (p.pts !== prev) rk = i + 1; p.rank = rk; prev = p.pts; });
    // moments: my team's firsts/milestones, then division highlights
    // one line per player: "First goal, assist & multi-point game · 10th point"
    const andJoin = (a) => (a.length > 1 ? `${a.slice(0, -1).join(', ')} & ${a.at(-1)}` : a[0]);
    const myMoments = S.players.filter((p) => p.teamId === me.id).map((p) => {
      const fs = p.firsts.filter((f) => ids.has(f.gameId));
      if (!fs.length) return null;
      const ORDER = ['goal', 'assist', 'multi-point game', 'hat trick', 'power-play goal', 'shorthanded goal'];
      const firsts = fs.filter((f) => f.kind === 'first').map((f) => f.label.replace(/^First /, '').replace(/ of the season$/, ''))
        .sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
      const counts = new Map();
      for (const f of fs.filter((x) => x.kind !== 'first')) counts.set(f.label, (counts.get(f.label) || 0) + 1);
      const label = [firsts.length ? 'First ' + andJoin(firsts) : null, ...[...counts].map(([l, n]) => (n > 1 ? `${l} ×${n}` : l))].filter(Boolean).join(' · ');
      return { ...fs[0], kind: firsts.length ? 'first' : 'milestone', label, player: p };
    }).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date) || a.player.name.localeCompare(b.player.name));
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
      ${mine.length ? `<div style="margin-bottom:18px">${panel(`${esc(me.short)} this weekend`, `${myFinals.length ? `<div class="stats wkstats"><div class="st"><span class="l">Record</span><span class="v">${rec.W}-${rec.L}-${rec.T}</span></div><div class="st"><span class="l">Goals for</span><span class="v">${gfga[0]}</span></div><div class="st"><span class="l">Goals against</span><span class="v">${gfga[1]}</span></div><div class="st"><span class="l">Games</span><span class="v">${myFinals.length}/${mine.length}</span></div></div>` : ''}${gameCards(mine, me.id)}`, { gold: true, meta: `${mine.length} games` })}</div>` : ''}
      ${finals.length ? `<div class="grid g-6-6">
        ${panel(`${esc(me.short)} moments`, `<div class="pb">${firstsList(myMoments, { showPlayer: true })}</div>`, { gold: true, meta: 'Firsts &amp; milestones' })}
        ${panel('Around the division', `<div class="pb">${div.length ? `<ol class="evs">${div.map((d) => `<li class="ev moment"><span class="pn">◆</span><span class="tc">${dt(d.date)}</span><span class="who"><b>${d.playerId ? playerLink(d.playerId, d.text) : esc(d.text)}</b></span><a class="scr lnk" href="#/game/${d.gameId}" style="font-size:12px">GAME →</a></li>`).join('')}</ol>` : '<div class="empty">No comebacks, shutouts or hat tricks</div>'}</div>`, { meta: 'Comebacks · shutouts · hat tricks' })}
      </div>
      <div style="margin-bottom:18px">${panel('Weekend scoring', `<div class="pb"><div class="leaders">${leaderRows(leaders.slice(0, 12), (p) => String(p.teamId) === me.id || favPlayers().has(p.id))}</div></div>`, { meta: 'Points this weekend' })}</div>` : ''}
      <div style="margin-bottom:18px">${panel('All games', gameCards(items, null), { meta: `${items.length} games` })}</div>`;
  }

  const notFound = () => `<div class="ptitle"><div><div class="k">404</div><h1>Not found</h1><div class="s"><a class="lnk" href="#/">Back to the scoreboard</a></div></div></div>`;

  // ------------------------------------------------------------ router
  const routes = [
    [/^\/?$/, viewHome], [/^\/standings$/, viewStandings], [/^\/skaters$/, viewSkaters], [/^\/schedule$/, viewSchedule],
    [/^\/weekends?$/, () => viewWeekend()], [/^\/weekend\/(\d{4}-\d{2}-\d{2})$/, viewWeekend],
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
      const on = h === '/' ? path === '/' : h === '/team/mine' ? path === mine : path.startsWith(h);
      a.classList.toggle('on', on);
    });
    if (path !== lastPath) { window.scrollTo(0, 0); lastPath = path; }
  }

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
    const finals = S.schedule.filter((x) => x.final).slice(-14).reverse();
    const tk = finals.map((x) => {
      const h = team(x.home), a = team(x.away), hw = x.homeScore > x.awayScore;
      const inner = `<span class="f">FINAL</span><span class="${hw ? 'lo' : ''}">${esc(a.code)}</span> <b>${x.awayScore}</b><span class="${hw ? '' : 'lo'}">${esc(h.code)}</span> <b>${x.homeScore}</b>`;
      return x.hasDetail ? `<a class="tk" href="#/game/${x.id}">${inner}</a>` : `<span class="tk">${inner}</span>`;
    }).join('');
    document.getElementById('ticker').innerHTML = tk + tk;
    const so = S.meta.scoreOnlyGames?.length;
    document.getElementById('foot').innerHTML = `Unofficial stats built from the <a class="lnk" href="${esc(S.meta.sourceUrl)}" target="_blank" rel="noopener">${esc(S.meta.league)}</a> published game sheets · ${S.meta.gamesPlayed} of ${S.meta.gamesScheduled} games final${so ? ` · ${so} counted from the final score only (no game sheet yet)` : ''}.`;
  }

  fetch('data/stats.json', { cache: 'no-cache' })
    .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
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
