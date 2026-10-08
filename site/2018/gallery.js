// 2018 Major stat gallery — a deliberately simple companion to the main (2019) site: standings and
// scoring leaders for the whole division, with a team filter that narrows both tables.
// Data: data/stats.enc.json, built by `DIVISION=2018 node scripts/build.mjs` and encrypted with the
// same password + salt as the main site, so a device unlocked there opens this page directly.
(() => {
  const $app = document.getElementById('app');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sign = (n) => (n > 0 ? '+' + n : n < 0 ? '−' + Math.abs(n) : '0');
  const pct = (x) => (x == null ? '—' : `${(x * 100).toFixed(1)}%`);
  const short = (n) => String(n).replace(/\b(Hockey Academy|Hockey Club|Hockey|Academy)\b/g, ' ').replace(/\s+/g, ' ').trim();
  const logo = (t) => `<span class="logo">${t?.logo ? `<img src="${esc(t.logo)}" alt="" loading="lazy" onerror="this.remove()">` : ''}</span>`;
  const store = {
    get: (k, d) => { try { const v = localStorage.getItem('st:g2018:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set: (k, v) => { try { localStorage.setItem('st:g2018:' + k, JSON.stringify(v)); } catch { /* private mode */ } },
  };

  // ---------------------------------------------------------------- unlock (shared key with main site)
  const KEY_STORE = 'st:siteKey';
  const b64d = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const savedKey = () => { try { return localStorage.getItem(KEY_STORE) || sessionStorage.getItem(KEY_STORE); } catch { return null; } };
  async function load() {
    const enc = await fetch('data/stats.enc.json', { cache: 'no-cache' });
    if (!enc.ok) { const r = await fetch('data/stats.json', { cache: 'no-cache' }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }
    const env = await enc.json(), raw = savedKey();
    if (!raw) return null;
    try {
      const key = await crypto.subtle.importKey('raw', b64d(raw), 'AES-GCM', false, ['decrypt']);
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(env.iv) }, key, b64d(env.ct));
      return JSON.parse(new TextDecoder().decode(pt));
    } catch { return null; } // key from an older password: unlock again on the main site
  }

  // ---------------------------------------------------------------- sortable table
  function table(el, rows, cols, { key, dir = -1 } = {}) {
    let sk = key, sd = dir;
    const draw = () => {
      const c = cols.find((x) => x.key === sk);
      const sorted = [...rows].sort((a, b) => {
        const x = c.val(a), y = c.val(b);
        if (x == null) return 1; if (y == null) return -1;
        return (typeof x === 'string' ? x.localeCompare(y) : x - y) * sd;
      });
      el.innerHTML = `<thead><tr>${cols.map((k) => `<th class="${k.cls || ''} ${k.key === sk ? 'sorted' : ''}" ${k.sort === false ? '' : `tabindex="0" data-k="${k.key}"`} ${k.key === sk ? `aria-sort="${sd > 0 ? 'ascending' : 'descending'}"` : ''} title="${esc(k.title || '')}">${k.label}</th>`).join('')}</tr></thead>
        <tbody>${sorted.length ? sorted.map((r) => `<tr>${cols.map((k) => `<td class="${k.cls || ''}">${k.html ? k.html(r) : esc(k.val(r))}</td>`).join('')}</tr>`).join('') : `<tr><td class="l empty" colspan="${cols.length}">No players yet</td></tr>`}</tbody>`;
    };
    el.addEventListener('click', (e) => {
      const th = e.target.closest('th[data-k]'); if (!th) return;
      const k = th.dataset.k, c = cols.find((x) => x.key === k);
      if (k === sk) sd = -sd; else { sk = k; sd = c.desc === false ? 1 : -1; }
      draw();
    });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('th[data-k]')) e.target.click(); });
    draw();
  }

  // ---------------------------------------------------------------- page
  function render(S) {
    const teams = S.teams, byId = new Map(teams.map((t) => [String(t.id), t]));
    let sel = String(store.get('team', '') || '');
    if (sel && !byId.has(sel)) sel = '';
    const perGP = (n, gp) => (gp ? n / gp : null);
    const draw = () => {
      const tSel = sel ? byId.get(sel) : null;
      const chips = [`<button type="button" class="wkchip ${sel ? '' : 'on'}" data-t="">All teams</button>`,
        ...[...teams].sort((a, b) => short(a.name).localeCompare(short(b.name))).map((t) => `<button type="button" class="wkchip ${sel === String(t.id) ? 'on' : ''}" data-t="${esc(t.id)}">${esc(short(t.name))}</button>`)].join('');
      const skaters = S.players.filter((p) => (!p.isGoalie || p.pts > 0) && (!sel || String(p.teamId) === sel));
      $app.innerHTML = `
        <div class="ptitle"><div><div class="k">${esc(S.meta.season)} · ${esc(S.meta.league)}</div><h1>2018 Major</h1>
          <div class="s">${S.meta.gamesPlayed} of ${S.meta.gamesScheduled} games final · tap a team to filter · tap a column to sort</div></div></div>
        <div class="wkbar g-teams" role="group" aria-label="Filter by team">${chips}</div>
        <div style="margin-bottom:18px"><section class="panel"><div class="ph"><h2 class="gold">${tSel ? esc(short(tSel.name)) : 'Standings'}</h2><span class="meta">${tSel ? `${tSel.rank} of ${teams.length} in division` : `${teams.length} teams`}</span></div><div class="tw"><table id="g-st"></table></div></section></div>
        <div style="margin-bottom:18px"><section class="panel"><div class="ph"><h2 class="${tSel ? 'gold' : ''}">Scoring leaders</h2><span class="meta">${skaters.length} players${tSel ? ` · ${esc(short(tSel.name))}` : ''}</span></div><div class="tw"><table id="g-sk"></table></div></section></div>`;
      table(document.getElementById('g-st'), sel ? [byId.get(sel)] : teams, [
        { key: 'rank', label: '#', cls: 'rkc', val: (t) => t.rank, desc: false },
        { key: 'name', label: 'Team', cls: 'l', val: (t) => t.name, desc: false, html: (t) => `<span class="tn">${logo(t)}<span class="full">${esc(t.name)}</span><span class="cd">${esc(short(t.name))}</span></span>` },
        { key: 'gp', label: 'GP', val: (t) => t.gp },
        { key: 'w', label: 'W', val: (t) => t.w }, { key: 'l', label: 'L', val: (t) => t.l }, { key: 't', label: 'T', cls: 'hm', val: (t) => t.t },
        { key: 'pts', label: 'PTS', val: (t) => t.pts, html: (t) => `<span class="pts">${t.pts}</span>` },
        { key: 'gf', label: 'GF', cls: 'hm', val: (t) => t.gf }, { key: 'ga', label: 'GA', cls: 'hm', val: (t) => t.ga },
        { key: 'diff', label: 'DIFF', val: (t) => t.diff, html: (t) => `<span class="${t.diff > 0 ? 'pos' : t.diff < 0 ? 'neg' : ''}">${sign(t.diff)}</span>` },
        { key: 'pp', label: 'PP%', cls: 'hm', val: (t) => t.ppPct, html: (t) => pct(t.ppPct) },
        { key: 'pk', label: 'PK%', cls: 'hm', val: (t) => t.pkPct, html: (t) => pct(t.pkPct) },
        { key: 'pim', label: 'PIM', cls: 'hm', val: (t) => t.pim },
        { key: 'pimpg', label: 'PIM/GP', val: (t) => perGP(t.pim, t.gp), html: (t) => (t.gp ? (t.pim / t.gp).toFixed(1) : '—'), title: 'Penalty minutes per game' },
        { key: 'l5', label: 'L5', cls: 'hm', sort: false, val: (t) => t.last5 || '', html: (t) => `<span class="g-l5">${esc((t.last5 || '–').split('').join(' '))}</span>` },
      ], { key: 'rank', dir: 1 });
      table(document.getElementById('g-sk'), skaters, [
        { key: 'name', label: 'Player', cls: 'l', val: (p) => p.name, desc: false, html: (p) => `${esc(p.name)}<span class="sub2">#${esc(p.number)}${sel ? '' : ` · ${esc(short(byId.get(String(p.teamId))?.name || p.team || ''))}`}</span>` },
        { key: 'gp', label: 'GP', val: (p) => p.gp },
        { key: 'g', label: 'G', val: (p) => p.g }, { key: 'a', label: 'A', val: (p) => p.a },
        { key: 'pts', label: 'PTS', val: (p) => p.pts, html: (p) => `<span class="pts">${p.pts}</span>` },
        { key: 'ppgp', label: 'P/GP', cls: 'hm', val: (p) => p.ptsPerGame, html: (p) => (p.ptsPerGame ?? 0).toFixed(2) },
        { key: 'ppg', label: 'PPG', cls: 'hm', val: (p) => p.ppg },
        { key: 'pim', label: 'PIM', val: (p) => p.pim, title: 'Penalty minutes' },
      ], { key: 'pts' });
    };
    $app.addEventListener('click', (e) => {
      const c = e.target.closest('.g-teams [data-t]'); if (!c) return;
      sel = c.dataset.t; store.set('team', sel); draw();
    });
    draw();
    const upd = new Date(S.meta.updatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    document.getElementById('upd').textContent = `${S.meta.league} · ${S.meta.season} · Updated ${upd}`;
    document.getElementById('foot').innerHTML = `Unofficial stats built from the <a class="lnk" href="${esc(S.meta.sourceUrl)}" target="_blank" rel="noopener">${esc(S.meta.league)}</a> published game sheets · ${S.meta.gamesPlayed} of ${S.meta.gamesScheduled} games final · <a class="lnk" href="../">2019 Major site</a>`;
  }

  load()
    .then((S) => {
      if (S) return render(S);
      $app.innerHTML = `<div class="ptitle"><div><div class="k">Team access</div><h1>Unlock first</h1>
        <div class="s">These stats use the same team password as the 2019 Major site.</div></div></div>
        <p><a class="btn on" href="../">Unlock on the main site →</a></p><p class="note" style="padding-left:0">Then come back to this page (or use the "2018 Major stats" link at the bottom of the main site).</p>`;
    })
    .catch((err) => { $app.innerHTML = `<div class="ptitle"><div><div class="k">Error</div><h1>Couldn't load stats</h1><div class="s">${esc(err.message)}</div></div></div>`; });
})();
