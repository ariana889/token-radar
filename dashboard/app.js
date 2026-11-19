// Token Radar's page: one static file, no framework and no network. It reads window.RADAR, written
// beside dashboard/ by main.ts from the same board.json, and renders the rail of filters, the ranked
// table and the detail drawer. Every figure on the page comes from that dataset; nothing is fetched.
//
// The filters, the sort key and the open protocol live in the query string, so a view can be linked:
//   ?protocol=<slug>  ?category=<name>  ?token=pre-token|trading  ?chain=<name>  ?sort=tvl|value|...
(function () {
  'use strict';

  var DATA = window.RADAR;
  var rowsEl = document.getElementById('rows');
  if (!DATA || !rowsEl) return;

  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var abs = Math.abs(n);
    if (abs >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (abs >= 1e7) return '$' + Math.round(n / 1e6) + 'M';
    if (abs >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (abs >= 1e4) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1000) return (n > 0 ? '+' : '') + (n / 1000).toFixed(1) + 'k%';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }
  function fmtMonths(m) {
    if (m === null || m === undefined) return 'n/a';
    return m.toFixed(1) + ' mo';
  }
  function fmtMultiple(m) {
    return m.toFixed(2) + '×';
  }

  // -------------------------------------------------------------- elements

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined) return;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v);
      });
    }
    for (var i = 2; i < arguments.length; i++) append(node, arguments[i]);
    return node;
  }
  function append(node, child) {
    if (child === null || child === undefined) return;
    if (Array.isArray(child)) { child.forEach(function (c) { append(node, c); }); return; }
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }

  // -------------------------------------------------------------- state

  var state = { q: '', category: 'all', chain: 'all', token: 'pre-token', floor: 0, watch: false, sort: 'value', dir: -1, selected: null };

  var FLOORS = [
    { v: 0, label: 'Any TVL' },
    { v: 20000000, label: '$20M and up' },
    { v: 50000000, label: '$50M watchlist floor' },
    { v: 100000000, label: '$100M and up' },
    { v: 250000000, label: '$250M and up' },
    { v: 1000000000, label: '$1B and up' }
  ];

  function readUrl() {
    var params = new URLSearchParams(window.location.search);
    if (params.get('protocol')) state.selected = params.get('protocol');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('token') === 'trading' || params.get('token') === 'pre-token') state.token = params.get('token');
    if (params.get('q')) state.q = params.get('q');
    if (params.get('watch') === '1') state.watch = true;
    if (params.get('floor')) {
      var f = parseInt(params.get('floor'), 10);
      if (isFinite(f) && f >= 0) state.floor = f;
    }
    if (params.get('sort')) {
      var s = params.get('sort');
      var map = { value: 'value', implied: 'value', tvl: 'tvl', change: 'change', age: 'age', name: 'name', rank: 'rank' };
      if (map[s]) state.sort = map[s];
      if (state.sort !== 'name' && state.sort !== 'rank') state.dir = -1;
    }
  }
  function writeUrl() {
    var params = new URLSearchParams();
    if (state.selected) params.set('protocol', state.selected);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.token !== 'pre-token') params.set('token', state.token);
    if (state.q) params.set('q', state.q);
    if (state.floor > 0) params.set('floor', String(state.floor));
    if (state.watch && state.token === 'pre-token') params.set('watch', '1');
    if (state.sort !== 'value') params.set('sort', state.sort);
    var qs = params.toString();
    var next = window.location.pathname + (qs ? '?' + qs : '');
    try { window.history.replaceState(null, '', next); } catch (e) { /* a file URL may refuse: the view still works */ }
  }

  // -------------------------------------------------------------- the record

  function list() { return state.token === 'trading' ? DATA.live : DATA.rows; }
  function valueOf(r) { return state.token === 'trading' ? r.mcap_usd : r.implied_value_usd; }

  function filtered() {
    var q = state.q.trim().toLowerCase();
    return list().filter(function (r) {
      if (state.floor > 0 && r.tvl_usd < state.floor) return false;
      if (state.watch && state.token === 'pre-token' && !r.on_watchlist) return false;
      if (state.category !== 'all' && (r.category || 'Uncategorised') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' '), r.symbol].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }

  function sorted(listed) {
    var key = state.sort;
    return listed.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'rank') { av = state.token === 'trading' ? 0 : a.rank; bv = state.token === 'trading' ? 0 : b.rank; }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'change') { av = a.change_7d === null || a.change_7d === undefined ? -1e9 : a.change_7d; bv = b.change_7d === null || b.change_7d === undefined ? -1e9 : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null || a.age_days === undefined ? -1 : a.age_days; bv = b.age_days === null || b.age_days === undefined ? -1 : b.age_days; }
      else { av = valueOf(a) || 0; bv = valueOf(b) || 0; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  // -------------------------------------------------------------- rail

  function fillSelect(select, options, current) {
    select.textContent = '';
    options.forEach(function (o) {
      select.appendChild(el('option', { value: String(o.v), text: o.label, selected: String(o.v) === String(current) ? 'selected' : null }));
    });
    select.value = String(current);
  }

  function categories() {
    var seen = {};
    list().forEach(function (r) { seen[r.category || 'Uncategorised'] = 1; });
    return Object.keys(seen).sort(function (a, b) { return a.localeCompare(b); });
  }
  function chains() {
    var seen = {};
    list().forEach(function (r) { (r.chains || []).forEach(function (c) { seen[c] = 1; }); });
    return Object.keys(seen).sort(function (a, b) { return a.localeCompare(b); });
  }

  function buildRail() {
    var search = document.getElementById('q');
    search.value = state.q;
    search.oninput = function () { state.q = search.value; paint(); };

    var seg = document.getElementById('token-seg');
    seg.textContent = '';
    [['pre-token', 'Pre-token'], ['trading', 'Trading']].forEach(function (pair) {
      seg.appendChild(el('button', {
        type: 'button',
        'aria-pressed': state.token === pair[0] ? 'true' : 'false',
        text: pair[1],
        onclick: function () {
          if (state.token === pair[0]) return;
          state.token = pair[0];
          state.category = 'all';
          state.chain = 'all';
          if (state.token === 'trading') state.watch = false;
          buildRail();
          paint();
        }
      }));
    });

    var cat = document.getElementById('category');
    fillSelect(cat, [{ v: 'all', label: 'All categories' }].concat(categories().map(function (c) { return { v: c, label: c }; })), state.category);
    cat.onchange = function () { state.category = cat.value; paint(); };

    var chain = document.getElementById('chain');
    fillSelect(chain, [{ v: 'all', label: 'All chains' }].concat(chains().map(function (c) { return { v: c, label: c }; })), state.chain);
    chain.onchange = function () { state.chain = chain.value; paint(); };

    var floor = document.getElementById('floor');
    fillSelect(floor, FLOORS.map(function (f) { return { v: f.v, label: f.label }; }), state.floor);
    floor.onchange = function () { state.floor = parseInt(floor.value, 10) || 0; paint(); };

    var watchBtn = document.getElementById('watch');
    watchBtn.textContent = 'Watchlist only · ' + DATA.counts.watchlist;
    watchBtn.setAttribute('aria-pressed', state.watch ? 'true' : 'false');
    watchBtn.style.display = state.token === 'trading' ? 'none' : '';
    watchBtn.onclick = function () { state.watch = !state.watch; buildRail(); paint(); };

    document.getElementById('reset').onclick = function () {
      state.q = '';
      state.category = 'all';
      state.chain = 'all';
      state.floor = 0;
      state.watch = false;
      state.sort = 'value';
      state.dir = -1;
      state.selected = null;
      buildRail();
      paint();
    };
  }

  // -------------------------------------------------------------- the table

  function sortHeaderState() {
    var buttons = document.querySelectorAll('thead button[data-sort]');
    for (var i = 0; i < buttons.length; i++) {
      var b = buttons[i];
      var th = b.parentNode;
      var key = b.getAttribute('data-sort');
      if (key === state.sort) {
        th.setAttribute('aria-sort', state.dir < 0 ? 'descending' : 'ascending');
        b.textContent = b.textContent.replace(/ [↑↓]$/, '') + (state.dir < 0 ? ' ↓' : ' ↑');
      } else {
        th.removeAttribute('aria-sort');
        b.textContent = b.textContent.replace(/ [↑↓]$/, '');
      }
    }
    document.getElementById('val-head').textContent = (state.token === 'trading' ? 'Market cap' : 'Implied value') + (state.sort === 'value' ? (state.dir < 0 ? ' ↓' : ' ↑') : '');
  }

  function row(r, max) {
    var value = valueOf(r);
    var pct = max > 0 ? Math.max(0, value || 0) / max : 0;
    var tr = el('tr', {
      'data-slug': r.slug,
      class: state.selected === r.slug ? 'sel' : null,
      tabindex: '0',
      onclick: function () { select(r.slug); },
      onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(r.slug); } }
    });
    append(tr, el('td', { class: 'c-rank' }, el('span', { class: 'num', text: state.token === 'trading' ? '—' : String(r.rank) })));
    append(tr, el('td', { class: 'c-name' }, el('div', { class: 'prot' },
      el('b', { text: r.name }),
      el('span', { text: (r.category || 'Uncategorised') + ' · ' + ((r.chains && r.chains.length) ? r.chains.slice(0, 2).join(', ') : 'chain unrecorded') })
    )));
    append(tr, el('td', { class: 'c-val' }, el('div', { class: 'val' },
      el('span', { class: 'v', text: fmtUsd(value) }),
      el('span', { class: 'bar' }, el('i', { style: 'width:' + Math.max(3, Math.min(100, Math.round(pct * 100))) + '%' }))
    )));
    append(tr, el('td', { class: 'c-tvl num tvl', text: fmtUsd(r.tvl_usd) }));
    append(tr, el('td', {
      class: 'c-chg num chg ' + (r.change_7d === null || r.change_7d === undefined ? 'nil' : r.change_7d >= 0 ? 'pos' : 'neg'),
      text: fmtPct(r.change_7d)
    }));
    append(tr, el('td', { class: 'c-age num age', text: r.age_months === null || r.age_months === undefined ? 'n/a' : r.age_months.toFixed(1) }));
    append(tr, el('td', { class: 'c-token' }, el('span', {
      class: 'pill ' + (state.token === 'trading' ? 'live' : r.on_watchlist ? 'watch' : ''),
      text: state.token === 'trading' ? (r.symbol || 'trades') : r.on_watchlist ? 'watchlist' : 'no token'
    })));
    return tr;
  }

  function paintTable() {
    var listed = sorted(filtered());
    rowsEl.textContent = '';
    if (listed.length === 0) {
      var td = el('td', { colspan: '7' }, el('div', { class: 'empty', text: 'No protocol matches these filters. Widen the TVL floor, clear the search, or switch token status.' }));
      rowsEl.appendChild(el('tr', null, td));
      return 0;
    }
    var max = 0;
    listed.forEach(function (r) { var v = valueOf(r) || 0; if (v > max) max = v; });
    if (max <= 0) max = 1;
    var frag = document.createDocumentFragment();
    listed.forEach(function (r) { frag.appendChild(row(r, max)); });
    rowsEl.appendChild(frag);
    return listed.length;
  }

  function paintCount(shown) {
    var count = document.getElementById('count');
    count.textContent = '';
    append(count, [
      el('b', { text: String(shown) }),
      shown === list().length ? ' rows' : ' of ' + list().length + ' rows',
      el('i', { text: state.token === 'trading' ? ' · market data' : ' · ' + (DATA.counts.watchlist) + ' on the watchlist' }),
      ' · ' + sortLabel()
    ]);

    var chips = document.getElementById('chips');
    chips.textContent = '';
    chips.appendChild(el('button', {
      class: 'chip', type: 'button', title: 'Switch token status',
      onclick: function () { state.token = state.token === 'pre-token' ? 'trading' : 'pre-token'; state.category = 'all'; state.chain = 'all'; buildRail(); paint(); }
    }, el('span', { text: 'status' }), el('b', { text: state.token })));
    if (state.category !== 'all') chips.appendChild(chip('category', state.category, function () { state.category = 'all'; buildRail(); paint(); }));
    if (state.chain !== 'all') chips.appendChild(chip('chain', state.chain, function () { state.chain = 'all'; buildRail(); paint(); }));
    if (state.watch && state.token === 'pre-token') chips.appendChild(chip('coverage', 'watchlist only', function () { state.watch = false; buildRail(); paint(); }));
    if (state.floor > 0) chips.appendChild(chip('tvl', '≥ ' + fmtUsd(state.floor), function () { state.floor = 0; buildRail(); paint(); }));
    if (state.q) chips.appendChild(chip('search', '"' + state.q + '"', function () { state.q = ''; buildRail(); paint(); }));
    if (chips.childNodes.length > 1) chips.appendChild(el('button', {
      class: 'chip clear', type: 'button', text: 'clear', onclick: function () { document.getElementById('reset').click(); }
    }));
  }

  function chip(label, value, clear) {
    return el('button', { class: 'chip', type: 'button', title: 'Remove this filter', onclick: clear },
      el('span', { text: label }), el('b', { text: value }), el('span', { text: '×' }));
  }

  function sortLabel() {
    var names = { value: state.token === 'trading' ? 'market cap' : 'implied value', tvl: 'TVL', change: '7d change', age: 'months tracked', name: 'name', rank: 'rank' };
    return 'sorted by ' + names[state.sort] + (state.dir < 0 ? ', high to low' : ', low to high');
  }

  // -------------------------------------------------------------- the drawer

  function select(slug) {
    state.selected = slug;
    writeUrl();
    var all = rowsEl.querySelectorAll('tr[data-slug]');
    for (var i = 0; i < all.length; i++) all[i].className = all[i].getAttribute('data-slug') === slug ? 'sel' : '';
    paintDrawer();
  }
  function closeDrawer() {
    state.selected = null;
    writeUrl();
    var all = rowsEl.querySelectorAll('tr[data-slug]');
    for (var i = 0; i < all.length; i++) all[i].className = '';
    paintDrawer();
  }

  function recordItem(key, value) {
    return el('div', null, el('dt', { text: key }), el('dd', { text: value === null || value === undefined || value === '' ? 'null' : String(value) }));
  }

  function paintDrawer() {
    var drawer = document.getElementById('drawer');
    var scrim = document.getElementById('scrim');
    var r = state.selected === null ? null : (DATA.rows.filter(function (x) { return x.slug === state.selected; })[0] || DATA.live.filter(function (x) { return x.slug === state.selected; })[0]);
    if (!r) {
      drawer.hidden = true;
      scrim.hidden = true;
      drawer.textContent = '';
      return;
    }
    var trading = r.token_status === 'trading';
    drawer.textContent = '';
    drawer.hidden = false;
    scrim.hidden = false;

    var head = el('div', { class: 'd-head' },
      el('p', { class: 'd-kicker', text: trading ? 'Trading · set aside from the model' : 'Rank ' + r.rank + ' of ' + DATA.rows.length + ' · ' + (r.on_watchlist ? 'on the watchlist' : 'early radar') }),
      el('h2', { id: 'drawer-title', text: r.name }),
      el('p', { class: 'd-meta', text: (r.category || 'Uncategorised') + ' · ' + ((r.chains && r.chains.length) ? r.chains.join(', ') : 'chain unrecorded') }),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close the detail view', text: '×', onclick: closeDrawer })
    );
    append(drawer, head);

    var value = trading ? r.mcap_usd : r.implied_value_usd;
    var mult = trading ? null : r.factors.multiple;
    append(drawer, el('div', { class: 'd-value' },
      el('span', { class: 'big', text: fmtUsd(value) }),
      el('span', { class: 'mult', text: trading ? 'market cap' : (mult === null ? '' : fmtMultiple(mult) + ' multiple') }),
      el('span', { class: 'anchor', text: fmtUsd(r.tvl_usd) + ' TVL' + (trading ? '' : '\n' + fmtUsd(r.tvl_usd * r.factors.base) + ' base') })
    ));

    if (trading) {
      append(drawer, el('div', { class: 'd-sec' },
        el('h3', { text: 'Why it is set aside' }),
        el('p', { class: 'd-note', text: 'This record carries a token — symbol ' + (r.symbol || 'recorded without a symbol') + (r.gecko_id ? ', CoinGecko id ' + r.gecko_id : '') + '. The market prices it, so the pre-token model never touches it: the board ranks only records with no token, and this view shows the market cap the snapshot carries.' })
      ));
    } else {
      var f = r.factors;
      var bars = [
        { cls: '', k: 'base', x: f.base, why: 'FDV / TVL', note: 'the model’s anchor' },
        { cls: 'growth', k: 'growth', x: f.growth, why: fmtPct(r.change_7d) + ' 7d', note: 'clamped ±40%, mapped 0.75–1.35' },
        { cls: 'age', k: 'age', x: f.age, why: fmtMonths(r.age_months), note: '0.85 + 0.05 a month, capped 1.50' },
        { cls: 'category', k: 'category', x: f.category, why: r.category || 'no category', note: 'the record’s own category' }
      ];
      var factorList = el('div', { class: 'factors' });
      bars.forEach(function (b) {
        append(factorList, el('div', { class: 'factor ' + b.cls, title: b.note },
          el('span', { class: 'k', text: b.k }),
          el('span', { class: 'x', text: fmtMultiple(b.x) }),
          el('span', { class: 'track' }, el('i', { style: 'width:' + Math.max(3, Math.min(100, Math.round((b.x / 1.6) * 100))) + '%' })),
          el('span', { class: 'why', text: b.why })
        ));
      });
      append(drawer, el('div', { class: 'd-sec' },
        el('h3', { text: 'The four factors' }),
        factorList,
        el('p', { class: 'd-foot', text: 'Base × growth × age × category = ' + fmtMultiple(f.multiple) + ' multiple. Applied to ' + fmtUsd(r.tvl_usd) + ' of TVL that is ' + fmtUsd(r.implied_value_usd) + ', rounded to the dollar.' })
      ));

      var steps = el('div', { class: 'steps' });
      r.farm_plan.forEach(function (s, i) {
        append(steps, el('div', { class: 'step' },
          el('span', { class: 'n', text: String(i + 1) }),
          el('div', null,
            el('p', { text: s.text }),
            el('div', { class: 'chips-cost' },
              el('span', { class: 'cost' }, el('b', { text: 'cost ' }), s.cost),
              el('span', { class: 'time' }, el('b', { text: 'time ' }), s.time)
            )
          )
        ));
      });
      append(drawer, el('div', { class: 'd-sec' }, el('h3', { text: 'Farm plan · ' + r.farm_plan.length + ' steps' }), steps));
    }

    append(drawer, el('div', { class: 'd-sec' },
      el('h3', { text: 'The record' }),
      el('dl', { class: 'record' },
        recordItem('slug', r.slug),
        recordItem('category', r.category),
        recordItem('listed_at', r.listed_at),
        recordItem('tvl_usd', usd0.format(r.tvl_usd)),
        recordItem('change_7d', r.change_7d === null ? null : r.change_7d.toFixed(2) + '%'),
        recordItem('months tracked', r.age_months === null ? null : r.age_months.toFixed(1)),
        recordItem('gecko_id', r.gecko_id === null ? 'null · records no token' : r.gecko_id),
        recordItem('symbol', r.symbol === null ? 'null · records no token' : r.symbol),
        recordItem('token_status', r.token_status),
        el('div', { class: 'wide' },
          el('dt', { text: 'chains · ' + (r.chains || []).length }),
          el('dd', { text: (r.chains || []).length ? r.chains.join(', ') : 'null' })
        )
      )
    ));
    append(drawer, el('p', { class: 'd-foot', text: trading
      ? 'Figures are the snapshot’s own: TVL, market cap and the seven-day move. A token that already trades is not a launch candidate. Snapshot ' + DATA.as_of + '.'
      : 'Implied value is this entry’s own claim, computed from the snapshot alone — not a price, a forecast, or make.fun’s view. Snapshot ' + DATA.as_of + '.' }));
  }

  // -------------------------------------------------------------- paint

  function paint() {
    var shown = paintTable();
    sortHeaderState();
    paintCount(shown);
    paintDrawer();
    document.getElementById('foot').textContent = state.token === 'trading'
      ? 'These ' + DATA.live.length + ' protocols carry a token in DefiLlama’s record, so their market cap is a fact rather than a model of what a launch might be worth. The other ' + DATA.rows.length + ' records carry none and are ranked by implied value.'
      : 'The board ranks every one of the snapshot’s ' + DATA.rows.length + ' protocols whose record carries no token — all ' + DATA.counts.watchlist + ' watchlist slugs, ' + DATA.counts.early + ' early rows outside it, and ' + DATA.counts.floor_below + ' below the $50M floor. Rows marked watchlist sit on the house floor; the rest are the tail the radar exists to find.';
    writeUrl();
  }

  function chrome() {
    document.getElementById('as-of').textContent = DATA.as_of;
    document.getElementById('model-version').textContent = DATA.model_version;
    document.getElementById('model-line').textContent = '';
    var m = DATA.model;
    append(document.getElementById('model-line'), [
      'implied = TVL × ',
      el('b', { text: String(m.base) }),
      ' base × growth ',
      el('b', { text: m.growth_min.toFixed(2) + '–' + m.growth_max.toFixed(2) }),
      ' × age ',
      el('b', { text: m.age_base.toFixed(2) + '–' + m.age_cap.toFixed(2) }),
      ' × category ',
      el('b', { text: '0.40–1.25' })
    ]);
    document.getElementById('mast-note').textContent =
      DATA.counts.no_token + ' of ' + DATA.counts.protocols + ' protocols record no token at all; ' + DATA.counts.watchlist +
      ' of those hold at least ' + fmtUsd(DATA.floor_usd) + ' and sit on the house watchlist. Ranked by what a token would be worth if the record stayed as it is.';
    document.getElementById('lg-base').textContent = m.base.toFixed(2);
    document.getElementById('lg-growth').textContent = m.growth_min.toFixed(2) + ' – ' + m.growth_max.toFixed(2);
    document.getElementById('lg-age').textContent = m.age_base.toFixed(2) + ' – ' + m.age_cap.toFixed(2);
  }

  // A deterministic film grain over the page, seeded so every capture is the same image. It is the
  // only ornament; the palette's detail, not the layout, is what it changes.
  function grain() {
    var c = document.getElementById('grain');
    if (!c || !c.getContext) return;
    var w = window.innerWidth;
    var h = window.innerHeight;
    c.width = w;
    c.height = h;
    var g = c.getContext('2d');
    var img = g.createImageData(w, h);
    var d = img.data;
    var seed = 20261114;
    function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
    for (var i = 0; i < d.length; i += 4) {
      if (rnd() < 0.049) {
        var v = rnd() < 0.5 ? 0 : 255;
        d[i] = v;
        d[i + 1] = v;
        d[i + 2] = v;
        d[i + 3] = 1 + Math.floor(rnd() * 14);
      }
    }
    g.putImageData(img, 0, 0);
  }

  // -------------------------------------------------------------- wiring

  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && state.selected) closeDrawer(); });
  document.getElementById('scrim').addEventListener('click', closeDrawer);
  var headers = document.querySelectorAll('thead button[data-sort]');
  for (var i = 0; i < headers.length; i++) {
    headers[i].addEventListener('click', function () {
      var key = this.getAttribute('data-sort');
      if (state.sort === key) state.dir = -state.dir;
      else { state.sort = key; state.dir = key === 'name' || key === 'rank' ? 1 : -1; }
      paint();
    });
  }

  readUrl();
  chrome();
  buildRail();
  grain();
  paint();
})();
