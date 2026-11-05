// Snow & Avalanche Watch: page helpers, calcs, draws, route check core, slope map, route check UI

// slope-map cards: each page section carries a slot with its settings; the card is built here, before the draws run
const MAPCARD_T = (p) => `
    <div class="sw-card sw-wide sw-mapcard" id="${p.zid}-map" data-pfx="${p.zid}">
      <h2 class="sw-h">Slope map</h2>
      <details class="sw-how"><summary>How this works</summary><p class="sw-note">${p.map_note} Grid north is up. Contour lines (optional) are every ${p.contour} m, with an extra interval when zoomed in. Drag to move around; ctrl- or ⌘-scroll, pinch or the buttons to zoom (plain scrolling zooms once the map is expanded). Hover for elevation, slope and aspect.</p></details>
      <div class="sw-map-ctrl">
        <div class="sw-seg" role="group" aria-label="Map view">
          <button type="button" class="sw-mode" data-mode="slope" aria-pressed="true">Slope angle</button>
          <button type="button" class="sw-mode" data-mode="watch" aria-pressed="false">Terrain to watch</button>
          <button type="button" class="sw-mode" data-mode="wind" aria-pressed="false">Wind loading</button>
        </div>
        <details class="sw-layers" open><summary>Layers</summary><div class="sw-layers-in">
        <label class="sw-paths-tog"><input type="checkbox" class="sw-topo" checked> Contour lines</label>
        ${p.paths_toggle}
        <label class="sw-paths-tog sw-fc-tog">Forecast <select class="sw-fc" aria-label="Forecast layer">
          <option value="off">none</option>
          <option value="snow1">new snow, next 24 h</option><option value="snow2">new snow, next 48 h</option><option value="snow3">new snow, next 72 h</option>
          <option value="fl1">freezing level, today</option><option value="fl2">freezing level, tomorrow</option><option value="fl3">freezing level, day 3</option>
        </select></label>
        </div></details>
        <div class="sw-zoombar">
          <button type="button" class="sw-zbtn sw-zin" aria-label="Zoom in">+</button>
          <button type="button" class="sw-zbtn sw-zout" aria-label="Zoom out">−</button>
          <button type="button" class="sw-zbtn sw-zreset">Reset view</button>
          <button type="button" class="sw-zbtn sw-expand">⤢ Expand</button>
          <button type="button" class="sw-zbtn sw-collapse" hidden>✕ Close</button>
        </div>
      </div>
      <div class="sw-search">
        <input type="search" class="sw-search-in" placeholder="Search peaks, passes, places, stations, or lat, lon" aria-label="Search the maps" autocomplete="off" spellcheck="false">
        <ul class="sw-search-list" role="listbox" hidden></ul>
      </div>
      <div class="sw-watch" hidden>
        <div class="sw-watch-row">
          <span class="sw-watch-lab">Aspects</span>
          <span class="sw-aspects">
            <label><input type="checkbox" class="sw-asp" value="N" checked>N</label>
            <label><input type="checkbox" class="sw-asp" value="NE" checked>NE</label>
            <label><input type="checkbox" class="sw-asp" value="E" checked>E</label>
            <label><input type="checkbox" class="sw-asp" value="SE" checked>SE</label>
            <label><input type="checkbox" class="sw-asp" value="S" checked>S</label>
            <label><input type="checkbox" class="sw-asp" value="SW" checked>SW</label>
            <label><input type="checkbox" class="sw-asp" value="W" checked>W</label>
            <label><input type="checkbox" class="sw-asp" value="NW" checked>NW</label>
          </span>
        </div>
        <div class="sw-watch-row">
          <label class="sw-watch-lab" for="${p.zid}-emin">Elevation</label>
          <span><input id="${p.zid}-emin" class="sw-emin" type="number" step="50" min="0" max="5000" placeholder="lowest" aria-label="Lowest elevation in metres"> to <input class="sw-emax" type="number" step="50" min="0" max="5000" placeholder="highest" aria-label="Highest elevation in metres"> m</span>
          <label class="sw-watch-lab" for="${p.zid}-smin">Slopes from</label>
          <select id="${p.zid}-smin" class="sw-smin">
            <option value="25">25°</option><option value="30" selected>30°</option><option value="35">35°</option><option value="40">40°</option>
          </select>
        </div>
        <div class="sw-watch-row">
          <button type="button" class="sw-match">Match current bulletin</button>
          <button type="button" class="sw-reset-watch">Reset</button>
        </div>
        <p class="sw-note sw-match-note" data-draw="match-note" data-source="problems danger_now">—</p>
      </div>
      <div class="sw-map dash-skeleton" data-draw="map" data-source="${p.terrain_src} wind_summary snow_grid${p.paths_src}"></div>
      <div class="sw-fc-legend" hidden></div>
      <ul class="sw-legend sw-leg-slope">
        <li><i class="sw-sw" style="background:var(--sw-s27)"></i>27–29°</li>
        <li><i class="sw-sw" style="background:var(--sw-s30)"></i>30–34°</li>
        <li><i class="sw-sw" style="background:var(--sw-s35)"></i>35–39°</li>
        <li><i class="sw-sw" style="background:var(--sw-s40)"></i>40–44°</li>
        <li><i class="sw-sw" style="background:var(--sw-s45)"></i>45° and steeper</li>
        <li><span class="sw-mk-peak">▲</span>Summit</li>
        <li><span class="sw-mk-col">◆</span>Col or pass</li>
        <li><span class="sw-mk-stn">●</span>Weather station</li>
        ${p.park_legend}
        <li class="sw-leg-glac" hidden><i class="sw-sw" style="background:rgba(150,205,255,.8);border-color:#145FAA"></i>Glacier or permanent snowfield</li>
      </ul>
      <ul class="sw-legend sw-leg-wind" hidden>
        <li><i class="sw-sw" style="background:var(--sw-wind)"></i>Likely wind-loaded (lee of recent winds)</li>
        <li><i class="sw-sw" style="background:var(--sw-s30);opacity:.35"></i>Other slopes from 30°</li>
      </ul>
      <p class="sw-note sw-wind-note" data-draw="wind-note" data-source="wind_summary" hidden>—</p>
      <ul class="sw-legend sw-leg-watch" hidden>
        <li><i class="sw-sw" style="background:var(--sw-watch)"></i>Matches your filter</li>
        <li><i class="sw-sw" style="background:var(--sw-s30);opacity:.35"></i>Other slopes from 30°</li>
      </ul>
      <span class="sw-blockmarks">${p.block_marks}</span>
      <details class="sw-how"><summary>How this works</summary><p class="sw-note sw-map-caveat">${p.map_caveat}</p></details>
      <div class="sw-route-bar">
        <label class="sw-zbtn sw-upload">Check a GPX route<input type="file" class="sw-gpx" accept=".gpx,application/gpx+xml,application/xml,text/xml"></label>
        <button type="button" class="sw-zbtn sw-route-clear" hidden>Remove route</button>
        <span class="sw-timing" hidden>
          <label class="sw-paths-tog">Start <input type="datetime-local" class="sw-start" step="900" aria-label="Start date and time, local time at the map"></label>
          <label class="sw-paths-tog">Pace <select class="sw-pace"><option value="0.8">relaxed</option><option value="1" selected>steady</option><option value="1.25">fast</option></select></label>
        </span>
        <span class="sw-watchgpx" hidden><button type="button" class="sw-zbtn sw-watchgpx-btn">Download hazard-marked route for watch</button></span>
        <span class="sw-route-msg" data-draw="route-msg" data-source="${p.terrain_src}">—</span>
        <span class="sw-route-hint">Your file stays in this browser; nothing is uploaded or saved.</span>
        <span class="sw-route-msg sw-watchgpx-note" aria-live="polite"></span>
      </div>
      <div class="sw-route" hidden>
        <h3 class="sw-h3">Route check</h3>
        <div class="sw-brief">
          <p class="sw-brief-verdict" data-draw="route-verdict" data-source="danger_now problems regional_forecasts">—</p>
          <div class="sw-brief-lab">Route profile</div>
          <div class="sw-chart sw-chart-short" data-draw="route-profile" data-source="${p.terrain_src}"></div>
          <div class="sw-brief-lab">Hazard sections</div>
          <div class="sw-hz-filter" role="group" aria-label="Show hazards">
            <span>Show:</span>
            <label class="sw-paths-tog"><input type="checkbox" class="sw-hz" value="all"> All</label>
            <label class="sw-paths-tog"><input type="checkbox" class="sw-hz" value="underfoot" checked> ▼ On the slope</label>
            <label class="sw-paths-tog"><input type="checkbox" class="sw-hz" value="overhead"> ▲ From above</label>
            <label class="sw-paths-tog"><input type="checkbox" class="sw-hz" value="other" checked> Glaciers and cliffs</label>
            <label class="sw-paths-tog"><input type="checkbox" class="sw-hz" value="highOnly"> High-consequence only</label>
          </div>
          <div class="sw-tablebox sw-route-box">
            <table class="sw-table sw-route-table">
              <thead><tr><th>#</th><th>Km</th><th class="sw-num">Elevation (m)</th><th>Level</th><th>What's there</th></tr></thead>
              <tbody data-draw="route-rows" data-source="${p.terrain_src} danger_now problems regional_forecasts outlook"></tbody>
            </table>
          </div>
          <details class="sw-how"><summary>How this works</summary><p class="sw-note">Select a section to zoom the map to it. Most avalanche accidents are triggered by the victim or someone in their group, so the slope underfoot always counts. A slope above counts in full only when today’s data gives it a reason to come down on you: considerable or higher danger at its elevation, a persistent slab problem with the start zone within 300 m (these can be triggered from a distance), a wet-snow problem, 20 cm or more of new snow forecast, a wind-loaded start zone, or warm sun on it when you pass. Otherwise it is shown as exposure. Other parties above you can still trigger it, so cross one at a time and don’t stop underneath. Each Show box matches a group in this table (a section on a slope you could trigger counts as “On the slope” even when there is also a slope above). The Show options apply to this table, the map, the profile, Previous / Next on the map and the watch file.</p></details>
          <div class="sw-brief-lab">Conditions</div>
          <ul class="sw-brief-list" data-draw="route-conditions" data-source="danger_now problems stations_daily outlook wind_summary avalanche_reports"></ul>
          <p class="sw-note">Generated from the route's terrain, today's bulletin and the station and forecast data on this dashboard. A guide to where to focus, not a go/no-go decision.</p>
          <details class="sw-how"><summary>How this works</summary><p class="sw-note">“Download hazard-marked route for watch” saves your route as a .gpx with a waypoint at the start of each section the Show options above let through (the same ones as in the table and on the map), named like “HIGH 3 slope above”, “CARE 5 …” or “EXPOSED 7 …”; section numbers match the table above. Import it into your watch’s app as a route and navigate it, and the watch alerts you as you approach each waypoint.</p></details>
        </div>
        <p class="sw-route-sum" data-draw="route-summary" data-source="${p.terrain_src} wind_summary${p.paths_src}">—</p>
        <details class="sw-how"><summary>How this works</summary><p class="sw-note">Timing uses your start time (local time at the map) and pace to estimate when you reach each section (Munter method: an hour per 4 km plus 400 m climbed at a steady pace, faster downhill), then checks where the sun is and the day's forecast warmth. It ignores shade cast by ridges, so a slope may get sun later than shown.</p></details>
        <ul class="sw-legend">
          <li><span class="sw-expo sw-expo-underfoot">▼ On the slope</span> the slope you're on can avalanche: solid line</li>
          <li><span class="sw-expo sw-expo-overhead">▲ Slope above</span> a slope above can run onto you: dashed line</li>
          <li><span class="sw-dedge"><i style="background:#4DB848"></i><i style="background:#FFE600"></i><i style="background:#F7941E"></i><i style="background:#E8222A"></i><i style="background:#231F20"></i></span>Outer edge: today's danger rating at that elevation (when a rating is in force)</li>
          <li><i class="sw-sw" style="background:var(--sw-r2)"></i>High consequence</li>
          <li><i class="sw-sw" style="background:var(--sw-r1)"></i>Take care</li>
          <li><i class="sw-sw" style="background:#8A7CC2"></i>Exposure: under a slope above that today’s conditions don’t raise</li>
          <li><i class="sw-sw" style="background:#fff"></i>No terrain flags</li>
        </ul>
        <details class="sw-how"><summary>How this works</summary><p class="sw-note">Every 10 m of the route is checked against the terrain model for: the slope underfoot (30° and up is avalanche terrain, 35° and up is steep); slopes of 30–60° above the route that face it, within 1 km and at least 30 m higher, steep enough to reach it (an angle of 22° or more up from the route to the start zone, the "alpha angle" used to screen avalanche runouts; 28° or more from a 35°+ slope counts as high); and cliffs or very steep drops within 40 m below. "Today" marks sections whose terrain matches the Terrain to watch filter, when that view is on. This reads the terrain only. It knows nothing about the snowpack, and can miss small features or flag paths that are sheltered in reality: a screening tool for planning, not a substitute for the bulletin, training and judgement on the day.</p></details>
      </div>
    </div>
`;
document.querySelectorAll('.sw-mapslot').forEach((el) => {
  const p = JSON.parse(el.dataset.p);
  const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  p.map_note = esc(p.map_note); p.map_caveat = esc(p.map_caveat);
  const b = p.blocks;
  p.block_marks = '';
  if (b) for (let r = 0; r < b[1]; r++) for (let c = 0; c < b[2]; c++) p.block_marks += `<i hidden data-rc="${r},${c}" data-source="${b[0]}_${r}_${c}"></i>`;
  el.insertAdjacentHTML('afterend', MAPCARD_T(p));
  el.remove();
});

;

// station tiles: the page carries only each tile's station and last row; the cells are built here, before the draws run
document.querySelectorAll('.sw-tile[data-st]').forEach((el) => {
  const st = el.dataset.st, [lab, field, unit] = (el.dataset.last || 'Max gust|gust_max_kmh|km/h').split('|');
  const c = (f) => { const s = document.createElement('span'); s.dataset.draw = 'cell'; s.dataset.source = 'latest_obs'; s.dataset.field = f; s.dataset.where = 'station=' + st; s.textContent = '—'; return s.outerHTML; };
  el.innerHTML = `<div class="sw-tile-name"></div>
        <div class="sw-tile-elev">${c('elevation_m')} m</div>
        <div class="sw-tile-big">${c('snow_depth_cm')}<span class="sw-unit"> cm</span></div>
        <div class="sw-tile-lab">snow on the ground</div>
        <dl class="sw-tile-dl">
          <dt>Change vs day before</dt><dd>${c('depth_change_cm')} cm</dd>
          <dt>Low / high</dt><dd>${c('temp_min_c')} / ${c('temp_max_c')} °C</dd>
          <dt></dt><dd>${c(field)} ${unit}</dd>
          <dt>Day</dt><dd>${c('date')}</dd>
        </dl>`;
  el.querySelector('.sw-tile-name').textContent = st;
  el.querySelectorAll('dt')[2].textContent = lab;
});

;

// terrain rows live in two datasets: Rossland on its own (the main file is near its size limit)
window.swTerrainData = (zone) => dash.data(['Rossland', 'Whitewater', 'Kootenay Pass'].includes(zone) ? 'terrain_rossland' : zone === 'Rocky Mountain NP' ? 'terrain_rmnp' : zone === 'Chamonix' ? 'terrain_chx' : 'terrain');
window.swTerrainAll = () => [].concat(...['terrain', 'terrain_rossland', 'terrain_rmnp', 'terrain_chx'].map((id) => { const d = dash.data(id); return d.status === 'ok' ? d.data : []; }));
(() => {
  const parse = d3.utcParse('%Y-%m-%d');
  const fmtDay = d3.utcFormat('%b %-d');
  const DANGER = ['var(--sw-d0)', 'var(--sw-d1)', 'var(--sw-d2)', 'var(--sw-d3)', 'var(--sw-d4)', 'var(--sw-d5)'];
  const DANGER_TEXT = ['var(--color-fg-muted)', '#fff', '#231F20', '#231F20', '#fff', '#fff'];
  const zoneOf = (el) => el.closest('[data-zone]').dataset.zone;
  const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

  const fail = (el, d) => {
    el.replaceChildren();
    if (d.status === 'error') {
      const box = document.createElement('div'); box.className = 'sw-fail';
      box.append(document.createElement('i'), 'Failed to load');
      el.append(box);
    } else el.textContent = '—';
  };

  const tooltip = (el) => {
    const t = document.createElement('div'); t.className = 'sw-tip'; t.hidden = true; el.append(t); return t;
  };
  const placeTip = (el, tip, x, y) => {
    tip.hidden = false;
    const w = el.clientWidth, tw = tip.offsetWidth, th = tip.offsetHeight;
    tip.style.left = Math.max(0, Math.min(w - tw, x + 12)) + 'px';
    tip.style.top = Math.max(0, y - th - 8) + 'px';
  };
  const tipLines = (tip, title, lines) => {
    tip.replaceChildren();
    const h = document.createElement('div'); h.className = 'sw-tdate'; h.textContent = title; tip.append(h);
    for (const l of lines) {
      const row = document.createElement('div');
      if (l.color) { const i = document.createElement('i'); i.style.background = l.color; row.append(i); }
      row.append(l.text); tip.append(row);
    }
  };

  // measure text width in an svg
  const measure = (svg, s, cls) => {
    const t = svg.append('text').attr('class', cls || null).text(s);
    const w = t.node().getComputedTextLength(); t.remove(); return w;
  };

  // drop any axis label that would spill outside its chart
  const trim = (axisG) => {
    const svgEl = axisG.node().ownerSVGElement;
    if (!svgEl) return;
    const box = svgEl.getBoundingClientRect();
    if (!box.width) return;
    axisG.selectAll('.tick text').each(function () {
      const r = this.getBoundingClientRect();
      if (r.width && (r.left < box.left - 0.5 || r.right > box.right + 0.5)) this.remove();
    });
  };
  window.swTrim = trim;
  const xAxis = (g, x, h, w) => {
    const n = Math.max(2, Math.min(8, Math.floor(w / 80)));
    g.attr('transform', `translate(0,${h})`).call(d3.axisBottom(x).ticks(n).tickFormat(fmtDay).tickSizeOuter(0))
      .attr('font-size', null).attr('font-family', null);
    g.select('.domain').attr('stroke', 'var(--cds-chart-axis)');
    g.selectAll('.tick line').attr('stroke', 'var(--cds-chart-axis)');
    trim(g);
  };
  const yAxis = (g, y, w, n) => {
    g.call(d3.axisLeft(y).ticks(n || 4).tickSize(-w).tickFormat(d3.format('~f')))
      .attr('font-size', null).attr('font-family', null);
    g.select('.domain').remove();
    g.selectAll('.tick line').attr('stroke', 'var(--cds-chart-grid)');
    g.selectAll('.tick text').attr('dx', -4);
  };

  // multi-line chart with end labels and hover tooltip
  window.swLines = (el, series, unit) => {
    el.replaceChildren();
    const W = Math.max(280, el.clientWidth), H = 240;
    const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
    const all = series.flatMap((s) => s.points);
    const dates = d3.extent(all, (p) => p.date);
    const ymax = Math.max(10, d3.max(all, (p) => p.value) || 0);
    const y0 = d3.scaleLinear([0, ymax], [0, 1]).nice();
    const ylabW = d3.max(y0.ticks(4), (t) => measure(svg, d3.format('~f')(t))) || 10;
    const labels = series.map((s) => { const last = s.points[s.points.length - 1]; return `${s.name} ${last ? d3.format('~f')(last.value) : ''} ${unit}`; });
    const endW = d3.max(labels, (l) => measure(svg, l, 'sw-endlab')) || 0;
    const m = { top: 10, right: endW + 10, bottom: 24, left: ylabW + 8 };
    const w = W - m.left - m.right, h = H - m.top - m.bottom;
    const x = d3.scaleUtc(dates, [0, w]);
    const y = d3.scaleLinear([0, ymax], [h, 0]).nice();
    const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`);
    yAxis(g.append('g'), y, w);
    xAxis(g.append('g'), x, h, w);
    const line = d3.line().defined((p) => p.value !== null).x((p) => x(p.date)).y((p) => y(p.value));
    series.forEach((s) => {
      g.append('path').attr('d', line(s.points)).attr('fill', 'none').attr('stroke', s.color)
        .attr('stroke-width', 2).attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round');
    });
    // end labels, pushed apart so they never touch
    const ends = series.map((s, i) => { const last = s.points[s.points.length - 1]; return { s, label: labels[i], y: last ? y(last.value) : 0 }; })
      .sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
    const over = ends.length ? ends[ends.length - 1].y - h : 0;
    if (over > 0) ends.forEach((e) => { e.y -= over; });
    for (let i = ends.length - 2; i >= 0; i--) if (ends[i + 1].y - ends[i].y < 14) ends[i].y = ends[i + 1].y - 14;
    ends.forEach((e) => {
      g.append('text').attr('class', 'sw-endlab').attr('x', w + 6).attr('y', e.y).attr('dy', '0.35em')
        .style('fill', e.s.color).text(e.label);
    });
    // hover
    const tip = tooltip(el);
    const rule = g.append('line').attr('y1', 0).attr('y2', h).attr('stroke', 'var(--cds-chart-reference)').attr('opacity', 0);
    const dots = g.append('g');
    const days = [...new Set(all.map((p) => +p.date))].sort((a, b) => a - b).map((t) => new Date(t));
    g.append('rect').attr('width', w).attr('height', h).attr('fill', 'transparent')
      .on('pointermove', (ev) => {
        const [mx] = d3.pointer(ev);
        const d = days[Math.max(0, Math.min(days.length - 1, d3.bisectCenter(days.map(Number), +x.invert(mx))))];
        rule.attr('x1', x(d)).attr('x2', x(d)).attr('opacity', 1);
        const lines = [];
        dots.selectAll('*').remove();
        series.forEach((s) => {
          const p = s.points.find((q) => +q.date === +d);
          if (p && p.value !== null) {
            dots.append('circle').attr('cx', x(d)).attr('cy', y(p.value)).attr('r', 3.5).attr('fill', s.color);
            lines.push({ color: s.color, text: `${s.name}: ${d3.format('~f')(p.value)} ${unit}` });
          }
        });
        tipLines(tip, fmtDay(d), lines);
        const [px, py] = d3.pointer(ev, el);
        placeTip(el, tip, px, py);
      })
      .on('pointerleave', () => { tip.hidden = true; rule.attr('opacity', 0); dots.selectAll('*').remove(); });
  };

  // bars over dates (one value per day)
  window.swBars = (el, rows, opt) => {
    el.replaceChildren();
    const W = Math.max(280, el.clientWidth), H = opt.height || 240;
    const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
    const ymax = Math.max(opt.min || 10, d3.max(rows, (r) => r.value) || 0);
    const y0 = d3.scaleLinear([0, ymax], [1, 0]).nice();
    const ylabW = d3.max(y0.ticks(4), (t) => measure(svg, d3.format('~f')(t))) || 10;
    const m = { top: opt.labels ? 18 : 10, right: 8, bottom: 24, left: ylabW + 8 };
    const w = W - m.left - m.right, h = H - m.top - m.bottom;
    const x = d3.scaleBand(rows.map((r) => r.key), [0, w]).padding(0.25);
    const y = d3.scaleLinear([0, ymax], [h, 0]).nice();
    const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`);
    yAxis(g.append('g'), y, w);
    // x labels: a subset so they never meet
    const lab = rows.map((r) => r.label);
    const lw = (d3.max(lab, (l) => measure(svg, l)) || 30) + 10;
    const every = Math.max(1, Math.ceil(lw / x.step()));
    const xa = g.append('g').attr('transform', `translate(0,${h})`)
      .call(d3.axisBottom(x).tickValues(rows.filter((_, i) => i % every === 0).map((r) => r.key))
        .tickFormat((k) => rows.find((r) => r.key === k).label).tickSizeOuter(0))
      .attr('font-size', null).attr('font-family', null);
    xa.select('.domain').attr('stroke', 'var(--cds-chart-axis)');
    xa.selectAll('.tick line').remove();
    trim(xa);
    const bw = Math.min(32, x.bandwidth());
    const tip = tooltip(el);
    g.selectAll('rect.sw-bar').data(rows).join('rect').attr('class', 'sw-bar')
      .attr('x', (r) => x(r.key) + (x.bandwidth() - bw) / 2).attr('width', bw)
      .attr('y', (r) => y(r.value || 0)).attr('height', (r) => h - y(r.value || 0))
      .attr('rx', 3).attr('fill', opt.color)
      .on('pointermove', (ev, r) => {
        tipLines(tip, r.tipTitle || r.label, r.tip || [{ text: `${d3.format('~f')(r.value)} ${opt.unit}` }]);
        const [px, py] = d3.pointer(ev, el); placeTip(el, tip, px, py);
      })
      .on('pointerleave', () => { tip.hidden = true; });
    if (opt.labels) {
      g.selectAll('text.sw-vlab').data(rows).join('text').attr('class', 'sw-vlab')
        .attr('x', (r) => x(r.key) + x.bandwidth() / 2).attr('y', (r) => y(r.value || 0) - 4)
        .attr('text-anchor', 'middle').text((r) => d3.format('~f')(r.value || 0));
    }
  };

  // daily low-high range bars with a 0 °C reference
  window.swRange = (el, rows) => {
    el.replaceChildren();
    const W = Math.max(280, el.clientWidth), H = 240;
    const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
    const lo = Math.min(-5, d3.min(rows, (r) => r.min)), hi = Math.max(5, d3.max(rows, (r) => r.max));
    const y0 = d3.scaleLinear([lo, hi], [1, 0]).nice();
    const ylabW = d3.max(y0.ticks(5), (t) => measure(svg, d3.format('~f')(t))) || 10;
    const m = { top: 10, right: 8, bottom: 24, left: ylabW + 8 };
    const w = W - m.left - m.right, h = H - m.top - m.bottom;
    const ext = d3.extent(rows, (r) => r.date);
    const x = d3.scaleUtc([d3.utcDay.offset(ext[0], -1), d3.utcDay.offset(ext[1], 1)], [0, w]);
    const y = d3.scaleLinear([lo, hi], [h, 0]).nice();
    const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`);
    yAxis(g.append('g'), y, w, 5);
    xAxis(g.append('g'), x, h, w);
    g.append('line').attr('x1', 0).attr('x2', w).attr('y1', y(0)).attr('y2', y(0))
      .attr('stroke', 'var(--cds-chart-reference)').attr('stroke-dasharray', '4 3');
    const bw = Math.max(2, Math.min(10, (w / rows.length) * 0.6));
    const tip = tooltip(el);
    g.selectAll('rect').data(rows).join('rect')
      .attr('x', (r) => x(r.date) - bw / 2).attr('width', bw)
      .attr('y', (r) => y(r.max)).attr('height', (r) => Math.max(1, y(r.min) - y(r.max)))
      .attr('rx', Math.min(3, bw / 2)).attr('fill', dash.colors[0])
      .on('pointermove', (ev, r) => {
        tipLines(tip, fmtDay(r.date), [{ text: `Low ${d3.format('.1f')(r.min)} °C` }, { text: `High ${d3.format('.1f')(r.max)} °C` }]);
        const [px, py] = d3.pointer(ev, el); placeTip(el, tip, px, py);
      })
      .on('pointerleave', () => { tip.hidden = true; });
  };

  // 72-hour mountain forecast: freezing level against the elevation bands, precipitation bars, ridge wind along the top
  window.swMtn = (el, rows) => {
    el.replaceChildren();
    const W = Math.max(300, el.clientWidth), H = 300;
    const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
    const pt = d3.utcParse('%Y-%m-%dT%H:%M');
    const hrs = rows.map((r) => ({ ...r, t: pt(r.time) })).filter((r) => r.t);
    if (!hrs.length) return;
    const bv = (el.dataset.bands || '1300,1900,2500').split(',').map(Number);
    const bands = [[bv[0], 'BTL'], [bv[1], 'TL'], [bv[2], 'ALP']];
    const flMax = Math.max(3200, bv[2] + 700, d3.max(hrs, (r) => num(r.freezing_level_m)) || 0);
    // start the scale about 1,000 m under the lowest band (or under the lowest freezing level), not at sea level
    const flLo = Math.max(0, Math.floor((Math.min(bv[0] - 1000, (d3.min(hrs, (r) => num(r.freezing_level_m)) ?? bv[0]) - 200)) / 500) * 500);
    const y0 = d3.scaleLinear([flLo, flMax], [1, 0]).nice();
    const ylabW = d3.max(y0.ticks(4), (t) => measure(svg, d3.format(',')(t))) || 20;
    const m = { top: 34, right: 34, bottom: 24, left: ylabW + 8 };
    const w = W - m.left - m.right, hTop = 164, gap = 16, hP = H - m.top - m.bottom - hTop - gap;
    const x = d3.scaleUtc(d3.extent(hrs, (r) => r.t), [0, w]);
    const y = d3.scaleLinear([flLo, flMax], [hTop, 0]).nice();
    const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`);
    g.call((gg) => { gg.append('g').call(d3.axisLeft(y).tickValues(y.ticks(4).filter((t) => t > y.domain()[0])).tickSize(-w).tickFormat(d3.format(','))).attr('font-size', null).attr('font-family', null)
      .call((a) => { a.select('.domain').remove(); a.selectAll('.tick line').attr('stroke', 'var(--cds-chart-grid)'); a.selectAll('.tick text').attr('dx', -4); }); });
    for (const [b, lab] of bands) {
      g.append('line').attr('x1', 0).attr('x2', w).attr('y1', y(b)).attr('y2', y(b)).attr('stroke', 'var(--cds-chart-reference)').attr('stroke-dasharray', '4 3');
      g.append('text').attr('class', 'sw-vlab').attr('x', w + 4).attr('y', y(b) + 4).text(lab);
    }
    // night shading: 6 pm to 6 am
    for (let d = d3.utcDay.floor(x.domain()[0]); d <= x.domain()[1]; d = d3.utcDay.offset(d, 1)) {
      const a = Math.max(0, x(d3.utcHour.offset(d, -6))), z = Math.min(w, x(d3.utcHour.offset(d, 6)));
      if (z > a) g.insert('rect', ':first-child').attr('x', a).attr('width', z - a).attr('y', 0).attr('height', hTop + gap + hP).attr('fill', 'var(--cds-chart-grid)').attr('opacity', 0.35);
    }
    g.append('path').datum(hrs.filter((r) => num(r.freezing_level_m) !== null))
      .attr('fill', 'none').attr('stroke', dash.colors[3] || 'currentColor').attr('stroke-width', 2)
      .attr('d', d3.line().x((r) => x(r.t)).y((r) => y(Math.max(y.domain()[0], Math.min(flMax, num(r.freezing_level_m))))));
    // precipitation panel
    const pMax = Math.max(2, d3.max(hrs, (r) => num(r.precip_mm)) || 0);
    const yp = d3.scaleLinear([0, pMax], [hP, 0]).nice();
    const gp = g.append('g').attr('transform', `translate(0,${hTop + gap})`);
    gp.append('g').call(d3.axisLeft(yp).ticks(2).tickSize(-w).tickFormat(d3.format('~f'))).attr('font-size', null).attr('font-family', null)
      .call((a) => { a.select('.domain').remove(); a.selectAll('.tick line').attr('stroke', 'var(--cds-chart-grid)'); a.selectAll('.tick text').attr('dx', -4); });
    gp.append('text').attr('class', 'sw-vlab').attr('x', w + 4).attr('y', 10).text('mm');
    const bw = Math.max(1, w / hrs.length - 1);
    gp.selectAll('rect.s').data(hrs).join('rect').attr('x', (r) => x(r.t) - bw / 2).attr('width', bw)
      .attr('y', (r) => yp(num(r.snow_tl_cm) || 0)).attr('height', (r) => hP - yp(num(r.snow_tl_cm) || 0)).attr('fill', dash.colors[0]);
    gp.selectAll('rect.r').data(hrs).join('rect').attr('x', (r) => x(r.t) - bw / 2).attr('width', bw)
      .attr('y', (r) => yp((num(r.snow_tl_cm) || 0) + (num(r.rain_tl_mm) || 0))).attr('height', (r) => hP - yp(num(r.rain_tl_mm) || 0)).attr('fill', dash.colors[1]);
    const xa = g.append('g').attr('transform', `translate(0,${hTop + gap + hP})`)
      .call(d3.axisBottom(x).ticks(d3.utcHour.every(w > 520 ? 12 : 24)).tickFormat((d) => d3.utcFormat(d3.utcHour(d) < d || d.getUTCHours() ? '%-I %p' : '%a %-d')(d)).tickSizeOuter(0))
      .attr('font-size', null).attr('font-family', null);
    xa.select('.domain').attr('stroke', 'var(--cds-chart-axis)'); xa.selectAll('.tick line').attr('stroke', 'var(--cds-chart-axis)'); trim(xa);
    // ridge wind every 6 hours
    const every = w / hrs.length * 6 < 34 ? 12 : 6;
    const ws = hrs.filter((r) => r.t.getUTCHours() % every === 0 && num(r.ridge_kmh) !== null && num(r.ridge_from_deg) !== null);
    const wg = svg.append('g').attr('transform', `translate(${m.left},0)`);
    for (const r of ws) {
      const cx = x(r.t);
      wg.append('text').attr('class', 'sw-vlab').attr('x', cx).attr('y', 12).attr('text-anchor', 'middle').text(Math.round(num(r.ridge_kmh)));
      // arrow points where the wind blows to: from-direction + 180°, screen y grows downward
      wg.append('path').attr('d', 'M0,-6 L4,3 L0,1 L-4,3 Z').attr('fill', num(r.ridge_kmh) >= 20 ? 'currentColor' : 'var(--cds-chart-axis)')
        .attr('transform', `translate(${cx},24) rotate(${(num(r.ridge_from_deg) + 180) % 360})`);
    }
    // hover
    const tip = tooltip(el), fmt = d3.utcFormat('%a %-d, %-I %p'), f1 = d3.format('.1f'), f0 = d3.format(',');
    const bis = d3.bisector((r) => r.t).center;
    const cross = g.append('line').attr('y1', 0).attr('y2', hTop + gap + hP).attr('stroke', 'var(--cds-chart-axis)').attr('hidden', true);
    svg.append('rect').attr('x', m.left).attr('y', 0).attr('width', w).attr('height', H - m.bottom).attr('fill', 'transparent')
      .on('pointermove', (ev) => {
        const [px] = d3.pointer(ev, g.node()); const r = hrs[bis(hrs, x.invert(px))]; if (!r) return;
        cross.attr('x1', x(r.t)).attr('x2', x(r.t)).attr('hidden', null);
        const ph = (k) => (num(r[`snow_${k}_cm`]) || 0) >= 0.05 || (num(r[`rain_${k}_mm`]) || 0) >= 0.05
          ? ((num(r[`rain_${k}_mm`]) || 0) > (num(r[`snow_${k}_cm`]) || 0) ? `rain ${f1(num(r[`rain_${k}_mm`]))} mm` : `snow ${f1(num(r[`snow_${k}_cm`]))} cm`) : 'dry';
        tipLines(tip, fmt(r.t) + ` (${el.dataset.tz || 'Pacific'})`, [
          { text: `Freezing level ${f0(num(r.freezing_level_m))} m${r.freezing_flag === 'warm layer aloft' ? ', warm layer aloft' : ''}` },
          { text: `Alpine ${f1(num(r.t_alp_c))} °C, ${ph('alp')}` },
          { text: `Treeline ${f1(num(r.t_tl_c))} °C, ${ph('tl')}` },
          { text: `Below treeline ${f1(num(r.t_btl_c))} °C, ${ph('btl')}` },
          { text: `Ridge wind ${Math.round(num(r.ridge_kmh))} km/h from ${['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(num(r.ridge_from_deg) / 45) % 8]}` },
        ]);
        const [qx, qy] = d3.pointer(ev, el); placeTip(el, tip, qx, qy);
      })
      .on('pointerleave', () => { tip.hidden = true; cross.attr('hidden', true); });
  };

  window.sw = { parse, fmtDay, DANGER, DANGER_TEXT, zoneOf, num, fail, tooltip, placeTip, tipLines, measure };
})();

;

dash.calc('latest_obs', {
  title: 'Latest day at each station',
  description: 'The most recent daily row for each station.',
  inputs: ['stations_daily'],
  fn: (stations_daily) => {
    const last = new Map();
    for (const r of stations_daily) {
      const p = last.get(r.station);
      if (!p || r.date > p.date) last.set(r.station, r);
    }
    return [...last.values()].map((r) => ({
      station: r.station, zone: r.zone, elevation_m: r.elevation_m, date: r.date,
      snow_depth_cm: r.snow_depth_cm, depth_change_cm: r.depth_change_cm,
      temp_min_c: r.temp_min_c, temp_max_c: r.temp_max_c, gust_max_kmh: r.gust_max_kmh, wind_max_kmh: r.wind_max_kmh,
    }));
  },
});

dash.calc('danger_now', {
  title: 'Latest danger rating',
  description: 'Each zone’s ratings for today in that zone (or the latest earlier day if today isn’t rated yet).',
  inputs: ['danger_history'],
  fn: (danger_history) => {
    const tz = { 'Rogers Pass': 'America/Vancouver', Rossland: 'America/Vancouver', Whitewater: 'America/Vancouver', 'Kootenay Pass': 'America/Vancouver', 'Vallter / Ulldeter': 'Europe/Madrid', Innsbruck: 'Europe/Vienna', 'Rocky Mountain NP': 'America/Denver', Chamonix: 'Europe/Paris' };
    const today = (z) => new Intl.DateTimeFormat('en-CA', { timeZone: tz[z] || 'UTC' }).format(new Date());
    const pick = {};
    for (const r of danger_history) {
      const t = today(r.zone), cur = pick[r.zone];
      const better = !cur || (r.date <= t && (cur > t || r.date > cur)) || (r.date > t && cur > t && r.date < cur);
      if (better) pick[r.zone] = r.date;
    }
    return danger_history.filter((r) => r.date === pick[r.zone]);
  },
});

dash.calc('av_kpis', {
  title: 'Recent avalanche report counts',
  description: 'Counts from the last 30 days of field reports: reports of avalanches, largest size, reports of warning signs, people caught.',
  inputs: ['avalanche_reports'],
  fn: (avalanche_reports) => {
    const t = {};
    for (const r of avalanche_reports) {
      if (!r.id) { t[r.zone] = t[r.zone] || { zone: r.zone, avalanche_reports: 0, largest: null, sign_reports: 0, incidents: 0 }; continue; }
      const a = t[r.zone] || (t[r.zone] = { zone: r.zone, avalanche_reports: 0, largest: null, sign_reports: 0, incidents: 0 });
      if (r.kind === 'avalanche' || (r.kind === 'incident' && r.avalanches > 0)) a.avalanche_reports += 1;
      if (r.max_size !== null && r.max_size !== undefined) a.largest = Math.max(a.largest || 0, Number(r.max_size));
      if (r.signs) a.sign_reports += 1;
      if (r.kind === 'incident') a.incidents += 1;
    }
    return Object.values(t);
  },
});

dash.calc('outlook_totals', {
  title: '7-day outlook totals',
  description: 'Forecast snowfall summed and strongest gust over the next 7 days, per forecast point.',
  inputs: ['outlook'],
  fn: (outlook) => {
    const t = {};
    for (const r of outlook) {
      const k = r.point || r.zone;
      const a = t[k] || (t[k] = { zone: r.zone, point: k, first: !Object.values(t).some((x) => x.zone === r.zone), snow_7d_cm: 0, gust_max_kmh: 0 });
      a.snow_7d_cm += r.snowfall_cm || 0;
      a.gust_max_kmh = Math.max(a.gust_max_kmh, r.gust_max_kmh || 0);
    }
    // one row per forecast point; a zone's first point also answers "zone=…" lookups
    return Object.values(t).map((a) => ({ zone: a.first ? a.zone : a.zone + ' · ' + a.point, point: a.point, snow_7d_cm: Math.round(a.snow_7d_cm * 10) / 10, gust_max_kmh: Math.round(a.gust_max_kmh) }));
  },
});

;

const { parse, fmtDay, DANGER, DANGER_TEXT, zoneOf, num, fail, tooltip, placeTip, tipLines, measure } = window.sw;

// one value from one row, named by the element's own data-source / data-field / data-where
const FMT = {
  date: (v) => fmtDay(parse(v)), issued: (v) => fmtDay(parse(v)), valid_until: (v) => fmtDay(parse(v)),
  temp_min_c: d3.format('.1f'), temp_max_c: d3.format('.1f'),
};
dash.draw('cell', (el) => {
  const d = dash.data(el.dataset.source);
  if (d.status !== 'ok') { el.textContent = '—'; return; }
  const [k, v] = el.dataset.where.split('=').map(decodeURIComponent);
  const row = d.data.find((r) => String(r[k]) === v);
  const val = row ? row[el.dataset.field] : null;
  if (val === null || val === undefined || val === '') { el.textContent = '—'; return; }
  const f = FMT[el.dataset.field];
  el.textContent = f ? f(val) : (typeof val === 'number' ? d3.format('~f')(val) : String(val));
});

dash.draw('danger', (el) => {
  const d = dash.data('danger_now');
  if (d.status !== 'ok') { fail(el, d); return; }
  const zone = zoneOf(el);
  const order = { upper: 0, middle: 1, lower: 2 };
  const rows = d.data.filter((r) => r.zone === zone).sort((a, b) => order[a.band] - order[b.band]);
  el.replaceChildren();
  if (!rows.length) { const p = document.createElement('p'); p.className = 'sw-dfor'; p.textContent = 'No rating published yet this season.'; el.append(p); return; }
  const p = document.createElement('p'); p.className = 'sw-dfor';
  p.textContent = 'Rating for ' + d3.utcFormat('%A, %b %-d')(parse(rows[0].date));
  el.append(p);
  for (const r of rows) {
    const row = document.createElement('div'); row.className = 'sw-drow';
    const lv = document.createElement('div'); lv.className = 'sw-dlvl';
    const n = Number(r.level) || 0;
    lv.style.background = DANGER[n]; lv.style.color = DANGER_TEXT[n];
    lv.textContent = n ? String(n) : '–';
    const band = document.createElement('div'); band.className = 'sw-dband'; band.textContent = r.band_label;
    const rate = document.createElement('div'); rate.className = 'sw-drate'; rate.textContent = r.rating;
    row.append(lv, band, rate); el.append(row);
  }
});

dash.draw('bulletin', (el) => {
  const d = dash.data('bulletins');
  if (d.status !== 'ok') { fail(el, d); return; }
  const b = d.data.find((r) => r.zone === zoneOf(el));
  el.replaceChildren();
  if (!b) return;
  const add = (label, text, cls) => {
    if (!text) return;
    const p = document.createElement('p');
    if (label) { const s = document.createElement('span'); s.className = 'sw-blab'; s.textContent = label; p.append(s); }
    const body = document.createElement('span'); body.className = cls || ''; body.textContent = text; p.append(body);
    if (b.language && b.language !== 'en') p.lang = b.language;
    el.append(p);
  };
  add(null, b.headline, 'sw-bhead');
  add('Snowpack', b.snowpack);
  add(b.zone === 'Innsbruck' || b.zone === 'Chamonix' ? 'Avalanche activity' : 'Snow distribution', b.detail);
  add('Trend', b.trend);
  if (b.confidence) add('Forecaster confidence', b.confidence);
  if (b.url) {
    const a = document.createElement('a'); a.href = b.url; a.target = '_blank'; a.rel = 'noopener';
    a.textContent = 'Open the full ' + (b.forecaster || '') + ' bulletin';
    el.append(a);
  }
});

dash.draw('problems', (el) => {
  const d = dash.data('problems');
  if (d.status !== 'ok') { fail(el, d); return; }
  const rows = d.data.filter((r) => r.zone === zoneOf(el) && r.problem);
  el.replaceChildren();
  if (!rows.length) {
    const p = document.createElement('p'); p.className = 'sw-muted';
    p.textContent = 'None listed in the current bulletin.'; el.append(p); return;
  }
  const ul = document.createElement('ul');
  for (const r of rows) {
    const li = document.createElement('li');
    const b = document.createElement('b'); b.textContent = r.problem; li.append(b);
    const bits = [r.likelihood && ('likelihood ' + r.likelihood.toLowerCase()), r.size && ('size ' + r.size), r.elevations, r.aspects && ('aspects ' + r.aspects)].filter(Boolean);
    if (bits.length) li.append(' · ' + bits.join(' · '));
    ul.append(li);
  }
  el.append(ul);
});

dash.draw('depth', (el) => {
  const d = dash.data('stations_daily');
  if (d.status !== 'ok') { fail(el, d); el.classList.toggle('dash-skeleton', d.status === 'loading'); return; }
  el.classList.remove('dash-skeleton');
  const zone = zoneOf(el);
  const rows = d.data.filter((r) => r.zone === zone);
  const names = [...new Set(rows.map((r) => r.station))];
  const series = names.map((name) => ({
    name,
    points: rows.filter((r) => r.station === name && num(r.snow_depth_cm) !== null)
      .map((r) => ({ date: parse(r.date), value: num(r.snow_depth_cm) })),
  })).filter((s) => s.points.length).map((s, i) => ({ ...s, color: dash.colors[i] }));
  window.swLines(el, series, 'cm');
});

dash.draw('temp', (el) => {
  const d = dash.data('stations_daily');
  if (d.status !== 'ok') { fail(el, d); el.classList.toggle('dash-skeleton', d.status === 'loading'); return; }
  el.classList.remove('dash-skeleton');
  const st = el.closest('[data-temp]').dataset.temp;
  const rows = d.data.filter((r) => r.station === st && num(r.temp_min_c) !== null && num(r.temp_max_c) !== null)
    .map((r) => ({ date: parse(r.date), min: num(r.temp_min_c), max: num(r.temp_max_c) }));
  window.swRange(el, rows);
});

dash.draw('wind', (el) => {
  const d = dash.data('stations_daily');
  if (d.status !== 'ok') { fail(el, d); el.classList.toggle('dash-skeleton', d.status === 'loading'); return; }
  el.classList.remove('dash-skeleton');
  const st = el.closest('[data-wind]').dataset.wind;
  const field = (el.closest('[data-wfield]') || {}).dataset?.wfield || 'gust_max_kmh';
  const rows = d.data.filter((r) => r.station === st && num(r[field]) !== null)
    .map((r) => ({ key: r.date, label: fmtDay(parse(r.date)), value: num(r[field]) }));
  window.swBars(el, rows, { unit: 'km/h', color: dash.colors[1], min: 20 });
});

dash.draw('outlook', (el) => {
  const d = dash.data('outlook');
  if (d.status !== 'ok') { fail(el, d); el.classList.toggle('dash-skeleton', d.status === 'loading'); return; }
  el.classList.remove('dash-skeleton');
  const wk = d3.utcFormat('%a %-d');
  const pt = (el.closest('[data-point]') || {}).dataset?.point;
  const rows = d.data.filter((r) => r.zone === zoneOf(el) && (!pt || r.point === pt)).map((r) => ({
    key: r.date, label: wk(parse(r.date)), tipTitle: d3.utcFormat('%A, %b %-d')(parse(r.date)), value: num(r.snowfall_cm) || 0,
    tip: [
      { text: `Snow ${d3.format('~f')(num(r.snowfall_cm) || 0)} cm` },
      { text: `Low ${d3.format('.1f')(num(r.temp_min_c))} / high ${d3.format('.1f')(num(r.temp_max_c))} °C` },
      { text: `Freezing level up to ${d3.format(',')(num(r.freezing_level_max_m))} m` },
    ],
  }));
  window.swBars(el, rows, { unit: 'cm', color: dash.colors[0], min: 5, labels: true, height: 180 });
});

dash.draw('outlook-rows', (tb) => {
  const d = dash.data('outlook');
  tb.replaceChildren();
  if (d.status !== 'ok') return;
  const zone = zoneOf(tb);
  const wk = d3.utcFormat('%a %b %-d');
  const f1 = d3.format('.1f'), f0 = d3.format(','), fs = d3.format('~f');
  const pt = (tb.closest('[data-point]') || {}).dataset?.point;
  const rows = d.data.filter((r) => r.zone === zone);
  const first = rows.length ? rows[0].point : null;
  for (const r of rows.filter((r) => r.point === (pt || first))) {
    const tr = document.createElement('tr');
    tr.dataset.key = encodeURIComponent(r.point) + ',' + encodeURIComponent(r.date);
    const cells = [
      [wk(parse(r.date)), ''],
      [fs(num(r.snowfall_cm) || 0), 'sw-num'],
      [f1(num(r.temp_min_c)), 'sw-num'],
      [f1(num(r.temp_max_c)), 'sw-num'],
      [num(r.freezing_level_max_m) === null ? '—' : f0(num(r.freezing_level_max_m)), 'sw-num sw-hide-narrow'],
      [fs(Math.round(num(r.gust_max_kmh))), 'sw-num'],
    ];
    for (const [t, c] of cells) { const td = document.createElement('td'); td.className = c; td.textContent = t; tr.append(td); }
    tb.append(tr);
  }
});

dash.draw('mtn-hours', (el) => {
  const d = dash.data('mountain_forecast');
  if (d.status !== 'ok') { fail(el, d); el.classList.toggle('dash-skeleton', d.status === 'loading'); return; }
  el.classList.remove('dash-skeleton');
  const rows = d.data.filter((r) => r.zone === zoneOf(el) && r.kind === 'hour');
  if (!rows.length) { el.replaceChildren(); const p = document.createElement('p'); p.className = 'sw-note'; p.textContent = 'No model forecast today.'; el.append(p); return; }
  window.swMtn(el, rows);
});

dash.draw('mtn-kpis', (el) => {
  const d = dash.data('mountain_forecast');
  const set = (k, v) => { const s = el.querySelector(`[data-k="${k}"]`); if (s) s.textContent = v; };
  if (d.status !== 'ok') { for (const k of ['alp', 'tl', 'fl', 'wind']) set(k, '—'); return; }
  const days = d.data.filter((r) => r.zone === zoneOf(el) && r.kind === 'day');
  if (!days.length) return;
  set('alp', d3.format('~f')(d3.sum(days, (r) => num(r.snow_alp_cm) || 0)));
  set('tl', d3.format('~f')(d3.sum(days, (r) => num(r.snow_tl_cm) || 0)));
  set('fl', d3.format(',')(d3.max(days, (r) => num(r.freezing_level_max_m))));
  set('wind', d3.format('~f')(d3.max(days, (r) => num(r.ridge_max_kmh))));
});

dash.draw('mtn-rows', (tb) => {
  const d = dash.data('mountain_forecast');
  tb.replaceChildren();
  if (d.status !== 'ok') return;
  const wk = d3.utcFormat('%a %b %-d'), pd = d3.utcParse('%Y-%m-%d'), f0 = d3.format(','), fs = d3.format('~f'), ft = d3.format('.0f');
  const fmtT = (v) => { const n = Math.round(num(v)); return (n < 0 ? '−' : '') + Math.abs(n); };
  for (const r of d.data.filter((r) => r.zone === zoneOf(tb) && r.kind === 'day')) {
    const tr = document.createElement('tr');
    tr.dataset.key = encodeURIComponent(r.time);
    const add = (main, sub, cls) => {
      const td = document.createElement('td'); if (cls) td.className = cls;
      td.append(main);
      if (sub) { const s = document.createElement('span'); s.className = 'sw-mtn-t'; s.textContent = sub; td.append(s); }
      tr.append(td);
    };
    add(wk(pd(r.time)), r.model && /^(HRDPS|ICON-D2|HRRR)/.test(r.model) ? '' : 'coarser model');
    for (const k of ['alp', 'tl', 'btl']) {
      const sn = num(r[`snow_${k}_cm`]) || 0, rn = num(r[`rain_${k}_mm`]) || 0;
      const main = sn >= 1 && rn >= 1 ? `${fs(sn)} cm + ${fs(Math.round(rn))} mm rain` : sn >= 1 ? `${fs(sn)} cm snow` : rn >= 1 ? `${fs(Math.round(rn))} mm rain` : 'dry';
      add(main, `${fmtT(r[`t_${k}_min_c`])} to ${fmtT(r[`t_${k}_max_c`])} °C`);
    }
    add(`${f0(num(r.freezing_level_min_m))}–${f0(num(r.freezing_level_max_m))}`, '', 'sw-num sw-hide-narrow');
    add(r.ridge_mean_kmh === null ? '—' : `${ft(num(r.ridge_mean_kmh))}, max ${ft(num(r.ridge_max_kmh))}`, r.ridge_from_dir ? `from ${r.ridge_from_dir}` : '');
    add((num(r.ridge_moving_hours) || 0) >= 3 && r.loads ? r.loads.split(',').join(', ') : '—', (num(r.ridge_moving_hours) || 0) >= 3 ? `${r.ridge_moving_hours} h of 20 km/h+` : '');
    tb.append(tr);
  }
});

dash.draw('history', (el) => {
  const d = dash.data('danger_history');
  if (d.status !== 'ok') { fail(el, d); el.classList.toggle('dash-skeleton', d.status === 'loading'); return; }
  el.classList.remove('dash-skeleton');
  el.replaceChildren();
  const zone = zoneOf(el);
  const rows = d.data.filter((r) => r.zone === zone);
  if (!rows.length) {
    const p = document.createElement('p'); p.className = 'sw-note';
    p.textContent = 'No ratings yet. The first ones will appear here when the bulletin starts for the season.';
    el.append(p); return;
  }
  const order = { upper: 0, middle: 1, lower: 2 };
  const bands = [...new Map(rows.sort((a, b) => order[a.band] - order[b.band]).map((r) => [r.band, r])).values()];
  const dates = [...new Set(rows.map((r) => r.date))].sort();
  const W = Math.max(280, el.clientWidth);
  const svg0 = d3.select(el).append('svg');
  const labW = d3.max(bands, (b) => measure(svg0, b.band_label)) || 60;
  svg0.remove();
  const rowH = 22, m = { top: 4, right: 8, bottom: 24, left: labW + 10 };
  const H = m.top + m.bottom + bands.length * rowH;
  const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
  const w = W - m.left - m.right;
  const first = parse(dates[0]), last = parse(dates[dates.length - 1]);
  const span = Math.max(14, d3.utcDay.count(first, last) + 1);
  const x = d3.scaleUtc([first, d3.utcDay.offset(first, span)], [0, w]);
  const cw = Math.max(2, w / span - 1);
  const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`);
  bands.forEach((b, i) => {
    g.append('text').attr('x', -8).attr('y', i * rowH + rowH / 2).attr('dy', '0.35em').attr('text-anchor', 'end').text(b.band_label);
  });
  const tip = tooltip(el);
  g.selectAll('rect').data(rows).join('rect')
    .attr('x', (r) => x(parse(r.date))).attr('width', cw)
    .attr('y', (r) => bands.findIndex((b) => b.band === r.band) * rowH + 2).attr('height', rowH - 4)
    .attr('rx', 2).style('fill', (r) => DANGER[Number(r.level) || 0])
    .on('pointermove', (ev, r) => {
      tipLines(tip, fmtDay(parse(r.date)), [{ color: DANGER[Number(r.level) || 0], text: `${r.band_label}: ${r.rating}` }]);
      const [px, py] = d3.pointer(ev, el); placeTip(el, tip, px, py);
    })
    .on('pointerleave', () => { tip.hidden = true; });
  const xa = g.append('g').attr('transform', `translate(0,${bands.length * rowH})`)
    .call(d3.axisBottom(x).ticks(Math.max(2, Math.min(8, Math.floor(w / 80)))).tickFormat(fmtDay).tickSizeOuter(0))
    .attr('font-size', null).attr('font-family', null);
  xa.select('.domain').attr('stroke', 'var(--cds-chart-axis)');
  xa.selectAll('.tick line').attr('stroke', 'var(--cds-chart-axis)');
  window.swTrim(xa);
});

;
(() => {
  const root = typeof window !== 'undefined' ? window : globalThis;
  const ASP = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const STEP = 10; // metres between checks along the route
  const OVERHEAD_R = 1000; // how far up-slope to look for start zones, m
  const ALPHA_CAUTION = 22, ALPHA_HIGH = 28; // runout screening angles, degrees
  const START_MIN = 30, START_MAX = 60; // slopes that can hold and release snow
  const UNDER_CAUTION = 30, UNDER_HIGH = 35;
  const CLIFF = 45, CLIFF_R = 40; // drop below the route

  // WGS84 / ETRS89 lat-lon to UTM (northern hemisphere)
  const utm = (lat, lon, zone) => {
    const a = 6378137, f = 1 / 298.257223563, k0 = 0.9996, e2 = f * (2 - f), ep2 = e2 / (1 - e2);
    const phi = (lat * Math.PI) / 180, lam = (lon * Math.PI) / 180, lam0 = (((zone - 1) * 6 - 180 + 3) * Math.PI) / 180;
    const s = Math.sin(phi), c = Math.cos(phi), tn = Math.tan(phi);
    const N = a / Math.sqrt(1 - e2 * s * s), T = tn * tn, C = ep2 * c * c, A = c * (lam - lam0);
    const M = a * ((1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256) * phi
      - ((3 * e2) / 8 + (3 * e2 ** 2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * phi)
      + ((15 * e2 ** 2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * phi)
      - ((35 * e2 ** 3) / 3072) * Math.sin(6 * phi));
    const x = k0 * N * (A + ((1 - T + C) * A ** 3) / 6 + ((5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5) / 120) + 500000;
    const y = k0 * (M + N * tn * ((A * A) / 2 + ((5 - T + 9 * C + 4 * C * C) * A ** 4) / 24 + ((61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6) / 720));
    return [x, y];
  };
  const zoneOfCrs = (crs) => Number(String(crs).slice(-2));

  // GPX text to points (track points, else route points)
  const parseGpx = (text) => {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('This file is not valid GPX.');
    let nodes = [...doc.getElementsByTagName('trkpt')];
    if (!nodes.length) nodes = [...doc.getElementsByTagName('rtept')];
    const pts = nodes.map((n) => { const e = n.getElementsByTagName('ele')[0]; return { lat: Number(n.getAttribute('lat')), lon: Number(n.getAttribute('lon')), ele: e ? Number(e.textContent) : NaN }; })
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
    if (pts.length < 2) throw new Error('No track found in this GPX file.');
    const nameEl = doc.getElementsByTagName('name')[0];
    return { name: nameEl ? nameEl.textContent.trim() : '', points: pts };
  };

  // share of a route's points inside a terrain grid
  const coverage = (points, row) => {
    const z = zoneOfCrs(row.crs);
    let n = 0;
    for (const p of points) {
      const [x, y] = utm(p.lat, p.lon, z);
      const c = (x - row.x0) / row.cell_m, r = (row.y0 - y) / row.cell_m;
      if (c >= 0 && r >= 0 && c < row.width && r < row.height) n++;
    }
    return n / points.length;
  };

  // ---- wind loading: lee slopes sheltered from the recent wind (Winstral-style shelter index) ----
  // A cell is loaded when it is 25–55° steep, faces downwind (within 67.5°), lies above the
  // alpine line, and sits at least SHELTER_DEG below the skyline looking upwind within 300 m.
  const SHELTER_DEG = 4, SHELTER_R = 300;
  const windMask = (row, t, fromDeg, minElev) => {
    const W = row.width, H = row.height, cell = row.cell_m;
    const mask = new Uint8Array(W * H);
    if (fromDeg === null || fromDeg === undefined) return mask;
    const ux = Math.sin((fromDeg * Math.PI) / 180), uy = -Math.cos((fromDeg * Math.PI) / 180); // upwind step in grid cols/rows
    const lee = (fromDeg + 180) % 360;
    const steps = Math.ceil(SHELTER_R / cell), tanMin = Math.tan((SHELTER_DEG * Math.PI) / 180);
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      const i = r * W + c, sl = t.slope[i], a = t.aspect[i];
      if (sl < 25 || sl > 55 || a === 255 || t.elev[i] < minElev) continue;
      let diff = Math.abs(a * 2 - lee) % 360;
      if (diff > 180) diff = 360 - diff;
      if (diff > 67.5) continue;
      const e0 = t.elev[i];
      let best = -1;
      for (let k = 1; k <= steps; k++) {
        const cc = Math.round(c + ux * k), rr = Math.round(r + uy * k);
        if (cc < 0 || rr < 0 || cc >= W || rr >= H) break;
        const tn = (t.elev[rr * W + cc] - e0) / (k * cell);
        if (tn > best) best = tn;
      }
      if (best >= tanMin) mask[i] = 1;
    }
    return mask;
  };

  // mapped avalanche paths: rings in grid cells; point-in-polygon with a bounding-box prefilter
  const preparePaths = (rows) => rows.map((p) => {
    const rings = typeof p.rings === 'string' ? JSON.parse(p.rings) : p.rings;
    let c0 = Infinity, r0 = Infinity, c1 = -Infinity, r1 = -Infinity;
    for (const ring of rings) for (const [c, r] of ring) { if (c < c0) c0 = c; if (c > c1) c1 = c; if (r < r0) r0 = r; if (r > r1) r1 = r; }
    return { id: p.path_id, valley: p.valley, method: p.method, rings, box: [c0, r0, c1, r1] };
  });
  const inRing = (c, r, ring) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > r) !== (yj > r) && c < ((xj - xi) * (r - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  const pathAt = (paths, c, r) => {
    for (const p of paths) {
      const b = p.box;
      if (c < b[0] || c > b[2] || r < b[1] || r > b[3]) continue;
      for (const ring of p.rings) if (inRing(c, r, ring)) return p;
    }
    return null;
  };

  // glaciers: rings in the overview grid of their own map (holes are nunataks), even-odd test
  const glacierAt = (G, x, y) => {
    if (!G || !G.list.length) return null;
    const c = (x - G.x0) / G.cell, r = (G.y0 - y) / G.cell;
    for (const g of G.list) {
      const b = g.box;
      if (c < b[0] || c > b[2] || r < b[1] || r > b[3]) continue;
      let n = 0;
      for (const ring of g.rings) if (inRing(c, r, ring)) n++;
      if (n % 2) return g;
    }
    return null;
  };

  const analyse = (route, row, t, fine, watch, extra) => {
    const glaciers = (extra && extra.glaciers) || null;
    const paths = (extra && extra.paths) || [];
    const wind = (extra && extra.wind) || null; // { mask, active, from }
    const W = row.width, H = row.height, cell = row.cell_m, z = zoneOfCrs(row.crs);
    // project and resample every STEP metres
    const xy = route.points.map((p) => utm(p.lat, p.lon, z));
    const samples = [];
    let dist = 0, carry = 0;
    for (let i = 1; i < xy.length; i++) {
      const [x0, y0] = xy[i - 1], [x1, y1] = xy[i];
      const seg = Math.hypot(x1 - x0, y1 - y0);
      if (seg === 0) continue;
      let at = i === 1 ? 0 : STEP - carry;
      while (at <= seg) {
        const f = at / seg;
        samples.push({ d: dist + at, x: x0 + (x1 - x0) * f, y: y0 + (y1 - y0) * f });
        at += STEP;
      }
      carry = seg - (at - STEP);
      dist += seg;
    }
    const total = dist;
    const fineAt = (x, y) => {
      for (const b of fine) {
        const m = b.meta, fc = (x - row.x0) / m.cell_m - m.col0, fr = (row.y0 - y) / m.cell_m - m.row0;
        if (fc >= 0 && fr >= 0 && fc < m.width && fr < m.height) return { b, fc, fr };
      }
      return null;
    };
    const octOf = (v) => (v === 255 ? null : ASP[Math.round((v * 2) / 45) % 8]);
    const watchOn = watch && watch.mode === 'watch';
    const aspSet = new Set(watchOn ? watch.aspects : []);
    const inWatch = (e, sl, oct) => watchOn && sl >= watch.smin && (watch.emin === null || e >= watch.emin)
      && (watch.emax === null || e <= watch.emax) && aspSet.has(oct);
    const R = Math.ceil(OVERHEAD_R / cell);
    let fineUsed = 0, outside = 0;
    let last = null;

    samples.forEach((s, k) => {
      const c = (s.x - row.x0) / cell, r = (row.y0 - s.y) / cell;
      if (c < 1 || r < 1 || c >= W - 1 || r >= H - 1) { s.outside = true; outside++; return; }
      const ci = Math.floor(c), ri = Math.floor(r), fx = c - ci, fy = r - ri;
      const E = (cc, rr) => t.elev[rr * W + cc];
      s.elev = E(ci, ri) * (1 - fx) * (1 - fy) + E(ci + 1, ri) * fx * (1 - fy) + E(ci, ri + 1) * (1 - fx) * fy + E(ci + 1, ri + 1) * fx * fy;
      const nc = Math.round(c), nr = Math.min(H - 1, Math.round(r));
      // underfoot: steepest within ~10 m on the fine model, else the nearest coarse cell
      const fh = fineAt(s.x, s.y);
      if (fh) {
        fineUsed++;
        const { b, fc, fr } = fh, m = b.meta, d = b.d;
        // mean over ~15 m, so a single boulder or step doesn't read as a slope
        const rad = Math.max(1, Math.round(7.5 / m.cell_m));
        let sum = 0, n = 0, bi = -1, best = -1;
        for (let rr = Math.max(0, Math.floor(fr) - rad); rr <= Math.min(m.height - 1, Math.floor(fr) + rad); rr++)
          for (let cc = Math.max(0, Math.floor(fc) - rad); cc <= Math.min(m.width - 1, Math.floor(fc) + rad); cc++) {
            const j = rr * m.width + cc;
            sum += d.slope[j]; n++;
            if (d.slope[j] > best) { best = d.slope[j]; bi = j; }
          }
        best = Math.round(sum / n);
        s.under = best; s.underAsp = d.asp[bi] === 255 ? null : ASP[d.asp[bi]];
        s.elev = d.elev[Math.floor(fr) * m.width + Math.floor(fc)];
      } else {
        const j = nr * W + nc;
        s.under = t.slope[j]; s.underAsp = octOf(t.aspect[j]);
      }
      s.underWatch = inWatch(s.elev, s.under, s.underAsp);
      s.path = paths.length ? pathAt(paths, c, r) : null;
      s.glacier = glacierAt(glaciers, s.x, s.y);
      s.windUnder = !!(wind && wind.active && wind.mask[nr * W + nc] && s.under >= 25);

      // overhead: start zones above that face the route (checked every third step, reused between)
      if (k % 3 === 0 || !last) {
        let ov = null;
        for (let rr = Math.max(0, nr - R); rr <= Math.min(H - 1, nr + R); rr++) {
          for (let cc = Math.max(0, nc - R); cc <= Math.min(W - 1, nc + R); cc++) {
            const j = rr * W + cc, sl = t.slope[j];
            if (sl < START_MIN || sl > START_MAX) continue;
            const dz = t.elev[j] - s.elev;
            if (dz < 30) continue; // small banks can't build a runout worth worrying about
            const ex = (cc - c) * cell, ny = (r - rr) * cell; // cell relative to the route: east, north
            const hd = Math.hypot(ex, ny);
            if (hd > OVERHEAD_R || hd < cell) continue;
            const alpha = (Math.atan(dz / hd) * 180) / Math.PI;
            if (alpha < ALPHA_CAUTION) continue;
            const a = t.aspect[j];
            if (a === 255) continue;
            const facing = a * 2; // direction the slope faces
            const toRoute = ((Math.atan2(-ex, -ny) * 180) / Math.PI + 360) % 360;
            let diff = Math.abs(facing - toRoute) % 360;
            if (diff > 180) diff = 360 - diff;
            if (diff > 60) continue;
            const score = alpha + sl / 10;
            const loaded = !!(wind && wind.active && wind.mask[j]);
            if (!ov || score + (loaded ? 3 : 0) > ov.score) ov = { score: score + (loaded ? 3 : 0), alpha, slope: sl, dist: hd, asp: octOf(a), elev: t.elev[j], watch: inWatch(t.elev[j], sl, octOf(a)), loaded };
          }
        }
        last = ov;
      }
      s.over = last;
      // consequences: a cliff or very steep drop just below
      let cliff = false;
      const cr = Math.max(1, Math.ceil(CLIFF_R / cell));
      for (let rr = Math.max(0, nr - cr); rr <= Math.min(H - 1, nr + cr) && !cliff; rr++)
        for (let cc = Math.max(0, nc - cr); cc <= Math.min(W - 1, nc + cr); cc++) {
          const j = rr * W + cc;
          if (t.slope[j] >= CLIFF && t.elev[j] < s.elev - 5) { cliff = true; break; }
        }
      s.cliff = cliff;
      // three separate sources of hazard, graded 0 (none), 1 (take care) or 2 (high consequence):
      // tl: the slope you're on, which you could trigger yourself (behind most accidents)
      const hU = s.under >= UNDER_HIGH || (s.windUnder && s.under >= UNDER_CAUTION) || (s.path && s.under >= UNDER_CAUTION);
      s.tl = hU ? 2 : s.under >= UNDER_CAUTION || s.windUnder ? 1 : 0;
      // ol: a slope above that can run onto you (natural releases, remote triggers, other parties)
      const hO = !!(s.over && ((s.over.alpha >= ALPHA_HIGH && s.over.slope >= 35) || s.over.loaded || s.path));
      s.ol = hO ? 2 : s.over || s.path ? 1 : 0;
      // xl: consequences and other ground: a cliff just below, glacier ice
      s.xl = cliff || s.glacier ? 1 : 0;
    });

    // grade each point and group into sections; close gaps under 40 m, drop sections under 20 m.
    // raise(s) returns why a slope above is dangerous today ('' if not): without a reason, terrain above
    // is shown as exposure; the slope underfoot always counts.
    const group = (raise) => {
    for (const s of samples) {
      const why = s.ol && !s.outside && raise ? raise(s) || '' : '';
      s.raised = why;
      if (s.tl) { s.level = Math.max(s.tl, s.xl, why ? s.ol : 0); s.kind = 'ground'; }
      else if (s.ol) { s.level = why ? Math.max(s.ol, s.xl) : 1; s.kind = why ? 'above' : 'exposure'; }
      else if (s.xl) { s.level = s.xl; s.kind = 'other'; }
      else { s.level = 0; s.kind = null; }
      s.expo = s.tl && s.ol ? 'both' : s.tl ? 'underfoot' : s.ol ? 'overhead' : null;
    }
    const segs = [];
    let cur = null;
    for (const s of samples) {
      if (s.outside || !s.level) continue;
      if (cur && cur.level === s.level && cur.kind === s.kind && s.d - cur.end <= 40) { cur.end = s.d; cur.items.push(s); }
      else { cur = { level: s.level, kind: s.kind, start: s.d, end: s.d, items: [s] }; segs.push(cur); }
    }
    const sections = segs.filter((g) => g.end - g.start >= 20).map((g) => {
      const it = g.items;
      const level = g.level, kind = g.kind;
      const raised = [...new Set(it.map((s) => s.raised).filter(Boolean).flatMap((w) => w.split('; ')))];
      const has = { underfoot: it.some((s) => s.tl), overhead: it.some((s) => s.ol), other: it.some((s) => s.xl) };
      const under = Math.max(...it.map((s) => s.under));
      const underItem = it.find((s) => s.under === under);
      const overs = it.map((s) => s.over).filter(Boolean);
      const over = overs.sort((a, b) => b.alpha - a.alpha)[0] || null;
      const why = [];
      if (under >= UNDER_CAUTION) why.push(`${under >= UNDER_HIGH ? 'steep' : 'avalanche-angle'} slope underfoot (${under}°${underItem.underAsp ? ', ' + underItem.underAsp + '-facing' : ''})`);
      if (over) why.push(`${over.slope}° ${over.asp}-facing slope above, ${Math.round(over.dist / 10) * 10} m away at ${Math.round(over.alpha)}°`);
      if (it.some((s) => s.cliff)) why.push('cliff or very steep drop just below');
      const secPaths = [...new Map(it.filter((s) => s.path).map((s) => [s.path.id, s.path])).values()];
      if (secPaths.length) why.push(`inside mapped avalanche path${secPaths.length > 1 ? 's' : ''} ${secPaths.slice(0, 3).map((p) => p.id + (p.valley ? ' (' + p.valley + ')' : '')).join(', ')}${secPaths.length > 3 ? ' and more' : ''}`);
      const secGl = [...new Map(it.filter((s) => s.glacier).map((s) => [s.glacier.id, s.glacier])).values()];
      if (secGl.length) {
        const named = secGl.filter((g) => g.name).map((g) => g.name);
        why.push(`on glacier ice${named.length ? ' (' + [...new Set(named)].slice(0, 2).join(', ') + ')' : ''}: crevasse and rope-team terrain`);
      }
      const windU = it.some((s) => s.windUnder), windO = overs.some((o) => o.loaded);
      if (windU || windO) why.push(`wind-loaded ${windU ? 'slope underfoot' : 'start zone above'} (lee of recent ${wind.from || ''} winds)`.replace('  ', ' '));
      const today = it.some((s) => s.underWatch) || overs.some((o) => o.watch);
      const expo = has.underfoot && has.overhead ? 'both' : has.underfoot ? 'underfoot' : has.overhead ? 'overhead' : null;
      // the same reasons, sorted by where they come from
      const parts = { underfoot: [], overhead: [], other: [] };
      if (under >= UNDER_CAUTION) parts.underfoot.push(`${under}° ${under >= UNDER_HIGH ? 'steep slope' : 'avalanche-angle slope'}${underItem.underAsp ? ', ' + underItem.underAsp + '-facing' : ''}`);
      if (windU) parts.underfoot.push('wind-loaded');
      if (over) parts.overhead.push(`${over.slope}° ${over.asp}-facing start zone ${Math.round(over.dist / 10) * 10} m away, ${Math.round(over.alpha)}° up from the route${windO ? ', wind-loaded' : ''}`);
      if (it.some((s) => s.cliff)) parts.other.push('cliff or very steep drop just below');
      if (secPaths.length) parts.overhead.push(`inside mapped avalanche path${secPaths.length > 1 ? 's' : ''} ${secPaths.slice(0, 3).map((p) => p.id).join(', ')}`);
      if (secGl.length) { const named = secGl.filter((g) => g.name).map((g) => g.name); parts.other.push(`glacier ice${named.length ? ' (' + [...new Set(named)].slice(0, 2).join(', ') + ')' : ''}: crevasses`); }
      const elevs = it.map((s) => s.elev);
      const pts = it.map((s) => [(s.x - row.x0) / cell, (row.y0 - s.y) / cell]);
      return {
        level, kind, raised, has, start: g.start, end: g.end, under, over, why, today, expo, parts, paths: secPaths.map((p) => p.id), windLoaded: windU || windO, glacier: secGl.length > 0,
        elevMin: Math.min(...elevs), elevMax: Math.max(...elevs),
        box: [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))],
      };
    });
    const len = (lv, ex) => sections.filter((g) => g.level === lv && (g.kind === 'exposure') === !!ex).reduce((a, g) => a + g.end - g.start, 0);
    return { sections, highLen: len(2), cautionLen: len(1), exposureLen: len(1, true) };
    };
    const res = {
      name: route.name, total, samples, outsideShare: samples.length ? outside / samples.length : 1,
      fineShare: samples.length ? fineUsed / Math.max(1, samples.length - outside) : 0,
      watchOn,
      pathsCrossed: new Set(samples.filter((s) => s.path).map((s) => s.path.id)).size,
      glacierLen: samples.filter((s) => s.glacier).length * STEP,
      glacierNames: [...new Set(samples.filter((s) => s.glacier && s.glacier.name).map((s) => s.glacier.name))],
      windActive: !!(wind && wind.active), windFrom: wind ? wind.from : null,
    };
    res.regroup = (raise) => Object.assign(res, group(raise));
    return res.regroup(null);
  };

  const prepareGlaciers = (rows) => rows.map((g) => {
    const p = preparePaths([{ path_id: g.glacier_id, rings: g.rings }])[0];
    return Object.assign(p, { name: g.name, area_ha: g.area_ha });
  });
  root.swRouteCore = { utm, zoneOfCrs, parseGpx, coverage, analyse, windMask, preparePaths, pathAt, glacierAt, prepareGlaciers, STEP };
})();

;

(() => {
  const ASP = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const SLOPE_CLASSES = [[45, [40, 60, 160]], [40, [142, 60, 170]], [35, [232, 34, 42]], [30, [247, 148, 30]], [27, [255, 230, 0]]];
  const WATCH = [232, 34, 42];
  const cache = {};
  const unpack = async (b64, Ctor) => {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const stream = new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Ctor(await new Response(stream).arrayBuffer());
  };
  const terrainFor = (row) => {
    if (!cache[row.zone]) {
      cache[row.zone] = Promise.all([
        unpack(row.elev_b64, Uint16Array), unpack(row.slope_b64, Uint8Array), unpack(row.aspect_b64, Uint8Array),
      ]).then(([elev, slope, aspect]) => {
        // hillshade worked out here from the elevations (sun from the north-west, 45° up)
        const W = row.width, H = row.height, cell = row.cell_m, shade = new Uint8Array(W * H);
        const az = (315 * Math.PI) / 180, alt = Math.PI / 4;
        for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
          const cl = Math.max(0, c - 1), cr = Math.min(W - 1, c + 1), ru = Math.max(0, r - 1), rd = Math.min(H - 1, r + 1);
          const dzdx = (elev[r * W + cr] - elev[r * W + cl]) / ((cr - cl) * cell), dzdn = (elev[ru * W + c] - elev[rd * W + c]) / ((rd - ru) * cell);
          const sl = Math.atan(Math.hypot(dzdx, dzdn)), asp = Math.atan2(-dzdx, -dzdn);
          shade[r * W + c] = Math.max(0, Math.sin(alt) * Math.cos(sl) + Math.cos(alt) * Math.sin(sl) * Math.cos(az - asp)) * 255;
        }
        return { elev, slope, aspect, shade, done: true };
      });
      cache[row.zone].then((t) => { cache[row.zone + ':ready'] = t; dash.draw('map'); if (window.swRouteRefresh) window.swRouteRefresh(row.zone); });
    }
    return cache[row.zone + ':ready'];
  };
  const pfxOf = (el) => el.closest('[data-pfx]').dataset.pfx;
  const settings = (pfx) => {
    const p = dash.params();
    const asp = p[pfx + '_aspects'];
    return {
      mode: p[pfx + '_mode'] || 'slope',
      paths: p[pfx + '_paths'] !== false,
      fc: p[pfx + '_fc'] || 'off',
      obs: p[pfx + '_obs'] !== false,
      doc: p[pfx + '_doc'] === true,
      topo: p[pfx + '_topo'] !== false,
      glac: p[pfx + '_glac'] !== false,
      aspects: Array.isArray(asp) ? asp : ASP,
      emin: typeof p[pfx + '_emin'] === 'number' ? p[pfx + '_emin'] : null,
      emax: typeof p[pfx + '_emax'] === 'number' ? p[pfx + '_emax'] : null,
      smin: typeof p[pfx + '_smin'] === 'number' ? p[pfx + '_smin'] : 30,
    };
  };
  window.swMapSettings = settings;
  // contour lines from the overview grid: smoothed 3x3, marching squares, map-edge runs dropped, lightly thinned
  const TOPO = { 'Rogers Pass': { step: 50, minor: 100, index: 500 }, 'Vallter / Ulldeter': { step: 25, minor: 50, index: 250 }, Innsbruck: { step: 50, minor: 100, index: 500 }, Rossland: { step: 25, minor: 50, index: 250 }, Whitewater: { step: 25, minor: 50, index: 250 }, 'Kootenay Pass': { step: 25, minor: 50, index: 250 }, 'Rocky Mountain NP': { step: 50, minor: 100, index: 500 }, Chamonix: { step: 50, minor: 100, index: 500 } };
  const topoCache = {};
  window.swContours = (row, t) => {
    if (topoCache[row.zone]) return topoCache[row.zone];
    const W = row.width, H = row.height, e = t.elev, sm = new Float32Array(W * H);
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      let sum = 0, n = 0;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr, cc = c + dc;
        if (rr >= 0 && cc >= 0 && rr < H && cc < W) { sum += e[rr * W + cc]; n++; }
      }
      sm[r * W + c] = sum / n;
    }
    const cfg = TOPO[row.zone] || { step: 50, minor: 100, index: 500 };
    const lo = Math.ceil(row.elev_min_m / cfg.step) * cfg.step, hi = Math.floor(row.elev_max_m / cfg.step) * cfg.step;
    const onEdge = (x, y) => x <= 0 || y <= 0 || x >= W || y >= H;
    const out = { extra: [], minor: [], index: [], labels: [] };
    for (const c of d3.contours().size([W, H]).thresholds(d3.range(lo, hi + 1, cfg.step))(sm)) {
      const cls = c.value % cfg.index === 0 ? 'index' : c.value % cfg.minor === 0 ? 'minor' : 'extra';
      let d = '';
      for (const poly of c.coordinates) for (const ring of poly) {
        let pen = false, lx = 0, ly = 0, run = [];
        for (let i = 0; i < ring.length; i++) {
          const [x, y] = ring[i];
          if (onEdge(x, y)) { pen = false; if (run.length > 60) out.labels.push({ v: c.value, cls, run }); run = []; continue; }
          if (!pen) { d += `M${x.toFixed(1)},${y.toFixed(1)}`; pen = true; lx = x; ly = y; run = [[x, y]]; continue; }
          if (Math.hypot(x - lx, y - ly) < 0.7 && i < ring.length - 1) continue;
          d += `L${x.toFixed(1)},${y.toFixed(1)}`; lx = x; ly = y; run.push([x, y]);
        }
        if (cls === 'index' && run.length > 60) out.labels.push({ v: c.value, cls, run });
      }
      if (d) out[cls].push(d);
    }
    // one label per long index line, at its middle, kept upright
    out.labels = out.labels.filter((l) => l.cls === 'index').sort((a, b) => b.run.length - a.run.length).slice(0, 80).map((l) => {
      const m = Math.floor(l.run.length / 2), a = l.run[Math.max(0, m - 3)], b = l.run[Math.min(l.run.length - 1, m + 3)];
      let ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
      if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
      return { v: l.v, x: l.run[m][0], y: l.run[m][1], ang };
    });
    return (topoCache[row.zone] = out);
  };
  const ALPINE = { 'Rogers Pass': 1900, 'Vallter / Ulldeter': 2100, Innsbruck: 2000, Rossland: 1900, Whitewater: 1900, 'Kootenay Pass': 1900, 'Rocky Mountain NP': 3400, Chamonix: 2200 }; // roughly the treeline; wind loading is mapped above it
  window.swAlpine = ALPINE;
  const maskCache = {}, pathCache = {};
  window.swWindMaskFor = (row, t, w) => {
    const k = row.zone + ':' + w.from_deg;
    if (!maskCache[k]) maskCache[k] = window.swRouteCore.windMask(row, t, w.from_deg, ALPINE[row.zone] || 0);
    return maskCache[k];
  };
  // wind loading counts only with a snowpack worth moving: 20 cm on the ground, or 10 cm new in 3 days
  window.swWindActive = (w) => !!w && w.from_deg !== null && w.transport_hours >= 3 && ((w.snow_depth_cm || 0) >= 20 || (w.new_snow_3d_cm || 0) >= 10);
  const glacCache = {};
  window.swGlaciersFor = (zone, rows) => (glacCache[zone] = glacCache[zone] || window.swRouteCore.prepareGlaciers(rows.filter((r) => r.zone === zone)));
  window.swPathsFor = (zone, rows) => (pathCache[zone] = pathCache[zone] || window.swRouteCore.preparePaths(rows.filter((r) => r.zone === zone)));
  window.swTerrainFor = (row) => terrainFor(row);
  window.swFine = window.swFine || {};
  window.swASP = ASP;
  const octant = (a) => (a === 255 ? null : ASP[Math.round((a * 2) / 45) % 8]);

  window.swMaps = new Map();
  const isBig = (el) => {
    const card = el.closest('.sw-mapcard');
    return card.classList.contains('sw-map-big') || document.fullscreenElement === card;
  };
  const nice = (m) => [250, 500, 1000, 2000, 5000].find((d) => d >= m) || 5000;

  dash.draw('map', {
    mount: (el) => {
      const stage = document.createElement('div'); stage.className = 'sw-stage';
      const canvas = document.createElement('canvas');
      stage.append(canvas);
      const svg = d3.select(el).append('svg').node();
      const tip = document.createElement('div'); tip.className = 'sw-tip'; tip.hidden = true;
      el.prepend(stage); el.append(tip);
      const made = { stage, canvas, svg, tip, key: null, t: d3.zoomIdentity, geo: null };
      made.zoom = d3.zoom().scaleExtent([1, 16])
        .filter((ev) => {
          if (ev.type === 'wheel') return isBig(el) || ev.ctrlKey || ev.metaKey;
          if (ev.type.startsWith('touch')) return isBig(el) || (ev.touches && ev.touches.length > 1);
          return !ev.button;
        })
        .on('zoom', (ev) => { made.t = ev.transform; made.apply && made.apply(); });
      d3.select(el).call(made.zoom).on('dblclick.zoom', null);
      window.swMaps.set(el, {
        zoomBy: (f) => d3.select(el).transition().duration(250).call(made.zoom.scaleBy, f),
        reset: () => d3.select(el).transition().duration(250).call(made.zoom.transform, d3.zoomIdentity),
        redraw: () => { if (made.apply) made.apply(); },
        zoomTo: (c0, r0, c1, r1) => {
          const g = made.geo;
          if (!g) return;
          const wpx = Math.max(1, (c1 - c0) * g.s0), hpx = Math.max(1, (r1 - r0) * g.s0);
          const k = Math.max(1, Math.min(16, 0.8 * Math.min(g.cw / wpx, g.ch / hpx)));
          const cx = g.ox + ((c0 + c1) / 2) * g.s0, cy = g.oy + ((r0 + r1) / 2) * g.s0;
          d3.select(el).transition().duration(400).call(made.zoom.transform, d3.zoomIdentity.translate(g.cw / 2 - cx * k, g.ch / 2 - cy * k).scale(k));
        },
      });
      return made;
    },
    update: (el, made) => {
      const zone = el.closest('[data-zone]').dataset.zone;
      const d = window.swTerrainData(zone);
      const { stage, canvas, svg, tip } = made;
      if (d.status !== 'ok') { el.classList.toggle('dash-skeleton', d.status === 'loading'); return; }
      const row = d.data.find((r) => r.zone === zone);
      if (!row) return;
      const W = row.width, H = row.height;
      const big = isBig(el);
      el.style.aspectRatio = big ? 'auto' : `${W} / ${H}`;
      el.style.touchAction = big ? 'none' : 'pan-y';
      const t = terrainFor(row);
      if (!t) return; // drawn again once decoded
      el.classList.remove('dash-skeleton');
      const s = settings(pfxOf(el));

      // paint the terrain only when the view settings change
      // wind-loaded slopes (shared with the route check)
      const ws = dash.data('wind_summary');
      const wrow = ws.status === 'ok' ? ws.data.find((x) => x.zone === zone) : null;
      const wmask = s.mode === 'wind' && wrow ? window.swWindMaskFor(row, t, wrow) : null;
      const key = JSON.stringify([zone, s, wrow ? wrow.from_deg : null]);
      const aspSet = new Set(s.aspects);
      const colour = (px, i, g0, sl, e, oct, wl) => {
        const g = g0 * 0.55 + 100;
        let r = g, gg = g, b = g;
        if (s.mode === 'wind') {
          if (wl && sl >= 25) { r = r * 0.25 + 14 * 0.75; gg = gg * 0.25 + 138 * 0.75; b = b * 0.25 + 132 * 0.75; }
          else if (sl >= 30) { r = r * 0.8 + 247 * 0.2; gg = gg * 0.8 + 148 * 0.2; b = b * 0.8 + 30 * 0.2; }
        } else if (s.mode === 'slope') {
          for (const [lo, c] of SLOPE_CLASSES) if (sl >= lo) { r = r * 0.35 + c[0] * 0.65; gg = gg * 0.35 + c[1] * 0.65; b = b * 0.35 + c[2] * 0.65; break; }
        } else {
          const hit = sl >= s.smin && (s.emin === null || e >= s.emin) && (s.emax === null || e <= s.emax) && aspSet.has(oct);
          if (hit) { r = r * 0.25 + WATCH[0] * 0.75; gg = gg * 0.25 + WATCH[1] * 0.75; b = b * 0.25 + WATCH[2] * 0.75; }
          else if (sl >= 30) { r = r * 0.8 + 247 * 0.2; gg = gg * 0.8 + 148 * 0.2; b = b * 0.8 + 30 * 0.2; }
        }
        px[i * 4] = r; px[i * 4 + 1] = gg; px[i * 4 + 2] = b; px[i * 4 + 3] = 255;
      };
      if (made.key !== key) {
        made.key = key;
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d');
        const img = ctx.createImageData(W, H);
        for (let i = 0; i < W * H; i++) colour(img.data, i, t.shade[i], t.slope[i], t.elev[i], octant(t.aspect[i]), !!(wmask && wmask[i]));
        ctx.putImageData(img, 0, 0);
      }

      // finer terrain, where the zone has it: blocks load as you zoom into them
      const detail = row.detail ? JSON.parse(row.detail) : null;
      const card = el.closest('.sw-mapcard');
      made.blocks = made.blocks || {};
      const paintBlock = (id) => {
        const bk = made.blocks[id];
        if (!bk || !bk.d || bk.key === key) return;
        bk.key = key;
        const { w, h } = bk.d;
        bk.canvas.width = w; bk.canvas.height = h;
        const ctx = bk.canvas.getContext('2d');
        const img = ctx.createImageData(w, h);
        // wind loading worked out on the block's own fine terrain
        let bmask = null;
        if (s.mode === 'wind' && wrow && wrow.from_deg !== null) {
          const mk = 'w' + wrow.from_deg;
          bk.masks = bk.masks || {};
          bmask = bk.masks[mk] = bk.masks[mk] || window.swRouteCore.windMask({ width: w, height: h, cell_m: bk.meta.cell_m },
            { elev: bk.d.elev, slope: bk.d.slope, aspect: bk.d.asp2 }, wrow.from_deg, window.swAlpine[zone] || 0);
        }
        for (let i = 0; i < w * h; i++) colour(img.data, i, bk.d.shade[i], bk.d.slope[i], bk.d.elev[i], bk.d.asp[i] === 255 ? null : ASP[bk.d.asp[i]], !!(bmask && bmask[i]));
        ctx.putImageData(img, 0, 0);
      };
      if (detail) {
        for (const mk of card.querySelectorAll('[data-rc]')) {
          const id = mk.dataset.source;
          if (mk.hidden) continue; // not asked for yet
          const dd = dash.data(id);
          if (dd.status !== 'ok' || !dd.data.length) continue;
          let bk = made.blocks[id];
          if (!bk) {
            const b = dd.data[0];
            const cv = document.createElement('canvas'); cv.className = 'sw-detail';
            const firstLayer = stage.querySelector('.sw-paths-layer');
            if (firstLayer) stage.insertBefore(cv, firstLayer); else stage.append(cv);
            bk = made.blocks[id] = { meta: b, canvas: cv, d: null, key: null };
            unpack(b.elev_dm_b64, Uint16Array).then((e) => {
              const w = b.width, h = b.height, m = b.margin, ew = w + 2 * m, cell = b.cell_m;
              const n = w * h, elev = new Float32Array(n), slope = new Uint8Array(n), shade = new Uint8Array(n), asp = new Uint8Array(n), asp2 = new Uint8Array(n);
              const az = (315 * Math.PI) / 180, alt = Math.PI / 4;
              for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
                const R = r + m, C = c + m, i = r * w + c;
                const dzdx = (e[R * ew + C + 1] - e[R * ew + C - 1]) / (20 * cell);
                const dzdn = (e[(R - 1) * ew + C] - e[(R + 1) * ew + C]) / (20 * cell);
                const sl = Math.atan(Math.hypot(dzdx, dzdn)), aspR = Math.atan2(-dzdx, -dzdn);
                const deg = (sl * 180) / Math.PI;
                elev[i] = e[R * ew + C] / 10;
                slope[i] = Math.round(deg);
                shade[i] = Math.max(0, Math.sin(alt) * Math.cos(sl) + Math.cos(alt) * Math.sin(sl) * Math.cos(az - aspR)) * 255;
                asp[i] = deg < 5 ? 255 : Math.round((((aspR * 180) / Math.PI + 360) % 360) / 45) % 8;
                asp2[i] = deg < 5 ? 255 : Math.round((((aspR * 180) / Math.PI + 360) % 360) / 2) % 180;
              }
              bk.d = { w, h, elev, slope, shade, asp, asp2 };
              (window.swFine[zone] = window.swFine[zone] || {})[id] = bk;
              dash.draw('map');
              if (window.swRouteRefresh) window.swRouteRefresh(zone);
            });
          }
          paintBlock(id);
        }
      }

      // mapped avalanche paths: outlines painted at 3x the grid, on top of the terrain
      const showPaths = card.querySelector('.sw-paths') && s.paths;
      const pd = showPaths ? dash.data('avalanche_paths') : null;
      if (!made.pathCanvas && pd && pd.status === 'ok') {
        const PX = 3, cv = document.createElement('canvas'); cv.className = 'sw-paths-layer';
        cv.width = W * PX; cv.height = H * PX;
        const ctx = cv.getContext('2d');
        ctx.lineJoin = 'round';
        for (const p of window.swPathsFor(zone, pd.data)) {
          ctx.beginPath();
          for (const ring of p.rings) { ring.forEach(([c, r], k) => (k ? ctx.lineTo(c * PX, r * PX) : ctx.moveTo(c * PX, r * PX))); ctx.closePath(); }
          ctx.fillStyle = 'rgba(30, 60, 160, 0.16)'; ctx.fill();
          ctx.strokeStyle = 'rgba(20, 40, 120, 0.75)'; ctx.lineWidth = 1.4; ctx.stroke();
        }
        made.pathCanvas = cv;
      }
      if (made.pathCanvas) {
        if (made.pathCanvas.parentNode !== stage || stage.lastChild !== made.pathCanvas) stage.append(made.pathCanvas);
        made.pathCanvas.style.display = showPaths ? 'block' : 'none';
      }

      // glaciers (BC Freshwater Atlas): pale blue tint with an outline, nunataks left clear
      const showGlac = card.querySelector('.sw-glac') && s.glac;
      const gdd = showGlac ? dash.data('glaciers') : null;
      if (!made.glacCanvas && gdd && gdd.status === 'ok') {
        const PX = 3, cv = document.createElement('canvas'); cv.className = 'sw-paths-layer';
        cv.width = W * PX; cv.height = H * PX;
        const ctx = cv.getContext('2d');
        ctx.lineJoin = 'round';
        for (const g of window.swGlaciersFor(zone, gdd.data)) {
          ctx.beginPath();
          for (const ring of g.rings) { ring.forEach(([c, r], k) => (k ? ctx.lineTo(c * PX, r * PX) : ctx.moveTo(c * PX, r * PX))); ctx.closePath(); }
          ctx.fillStyle = 'rgba(150, 205, 255, 0.42)'; ctx.fill('evenodd');
          ctx.strokeStyle = 'rgba(20, 95, 170, 0.85)'; ctx.lineWidth = 1.4; ctx.stroke();
        }
        made.glacCanvas = cv;
        const firstLayer = stage.querySelector('.sw-paths-layer');
        if (firstLayer) stage.insertBefore(cv, firstLayer); else stage.append(cv);
      }
      if (made.glacCanvas) made.glacCanvas.style.display = showGlac ? 'block' : 'none';

      // documented avalanches (ICGC record): recent years in red, older in grey
      const showDoc = card.querySelector('.sw-doc') && s.doc;
      const dd = showDoc ? dash.data('documented_avalanches') : null;
      if (!made.docCanvas && dd && dd.status === 'ok') {
        const PX = 3, cv = document.createElement('canvas'); cv.className = 'sw-paths-layer';
        cv.width = W * PX; cv.height = H * PX;
        const ctx = cv.getContext('2d');
        ctx.lineJoin = 'round';
        const rows = window.swDocFor(zone, dd.data).slice().sort((a, b) => a.year - b.year);
        const newest = d3.max(rows, (r) => r.year) || 0;
        for (const p of rows) {
          const recent = p.year >= newest - 6;
          ctx.beginPath();
          for (const ring of p.rings) { ring.forEach(([c, r], k) => (k ? ctx.lineTo(c * PX, r * PX) : ctx.moveTo(c * PX, r * PX))); ctx.closePath(); }
          ctx.fillStyle = recent ? 'rgba(208, 0, 60, 0.22)' : 'rgba(60, 60, 60, 0.14)'; ctx.fill();
          ctx.strokeStyle = recent ? 'rgba(160, 0, 40, 0.9)' : 'rgba(40, 40, 40, 0.6)'; ctx.lineWidth = 1.3; ctx.stroke();
        }
        made.docCanvas = cv;
      }
      if (made.docCanvas) {
        if (made.docCanvas.parentNode !== stage || stage.lastChild !== made.docCanvas) stage.append(made.docCanvas);
        made.docCanvas.style.display = showDoc ? 'block' : 'none';
      }

      // contour lines: one vector layer per map, built the first time they're switched on
      if (s.topo && !made.topo) {
        const ct = window.swContours(row, t);
        const NS = 'http://www.w3.org/2000/svg';
        const sv = document.createElementNS(NS, 'svg');
        sv.setAttribute('class', 'sw-paths-layer sw-topo-layer');
        sv.setAttribute('viewBox', `0 0 ${W} ${H}`); sv.setAttribute('preserveAspectRatio', 'none');
        const grp = {};
        for (const k of ['extra', 'minor', 'index']) {
          const g = document.createElementNS(NS, 'g'); g.setAttribute('class', 'sw-topo-' + k);
          const pth = document.createElementNS(NS, 'path'); pth.setAttribute('d', ct[k].join(''));
          g.append(pth); sv.append(g); grp[k] = g;
        }
        const lg = document.createElementNS(NS, 'g'); lg.setAttribute('class', 'sw-topo-labels'); sv.append(lg);
        for (const l of ct.labels) {
          const tx = document.createElementNS(NS, 'text');
          tx.setAttribute('transform', `translate(${l.x},${l.y}) rotate(${l.ang})`);
          tx.setAttribute('text-anchor', 'middle'); tx.setAttribute('dy', '0.35em');
          tx.textContent = d3.format(',')(l.v); lg.append(tx);
        }
        made.topo = { sv, grp, lg };
        const firstLayer = stage.querySelector('.sw-paths-layer');
        if (firstLayer) stage.insertBefore(sv, firstLayer); else stage.append(sv);
      }
      if (made.topo) made.topo.sv.style.display = s.topo ? 'block' : 'none';

      // forecast layer: new snow (shaded) or the freezing level (a dashed line), from the Open-Meteo grid
      const fcLeg = card.querySelector('.sw-fc-legend');
      const sgd = s.fc !== 'off' ? dash.data('snow_grid') : null;
      const fcKey = s.fc + '|' + (sgd && sgd.status === 'ok' ? sgd.data.length + ':' + ((sgd.data[0] || {}).day || '') : sgd ? sgd.status : '');
      if (made.fcKey !== fcKey) {
        made.fcKey = fcKey;
        if (made.fcLayer) { made.fcLayer.remove(); made.fcLayer = null; }
        if (fcLeg) { fcLeg.replaceChildren(); fcLeg.hidden = s.fc === 'off'; }
        const pts = sgd && sgd.status === 'ok' ? sgd.data.filter((r) => r.zone === zone) : [];
        if (s.fc !== 'off' && !pts.length && fcLeg) fcLeg.textContent = sgd && sgd.status === 'loading' ? 'Loading the forecast…' : 'No forecast grid for this map yet; it arrives with the morning refresh.';
        if (pts.length) {
          const C2 = window.swRouteCore, zn = C2.zoneOfCrs(row.crs);
          const cellOf = (r) => { const [x, y] = C2.utm(r.lat, r.lon, zn); return [(x - row.x0) / row.cell_m, (row.y0 - y) / row.cell_m]; };
          const days = [...new Set(pts.map((r) => r.day))].sort();
          const wd = (d) => d3.utcFormat('%a %b %-d')(d3.utcParse('%Y-%m-%d')(d));
          const firstLayer = stage.querySelector('.sw-paths-layer');
          if (s.fc.startsWith('snow')) {
            const n = Number(s.fc.slice(4));
            const P = [...d3.rollup(pts.filter((r) => r.d < n), (v) => ({ c: cellOf(v[0]), v: d3.sum(v, (r) => r.snow_cm || 0) }), (r) => r.lat + ',' + r.lon).values()];
            const R = 4, w = Math.ceil(W / R), h = Math.ceil(H / R);
            const cv = document.createElement('canvas'); cv.className = 'sw-paths-layer sw-fc-layer'; cv.width = w; cv.height = h;
            const ctx = cv.getContext('2d'), img = ctx.createImageData(w, h);
            const STEPS = [[40, [8, 48, 140]], [20, [33, 102, 172]], [10, [67, 147, 195]], [5, [146, 197, 222]], [1, [209, 229, 240]]];
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
              const c = (x + 0.5) * R, r = (y + 0.5) * R;
              let sw = 0, sv = 0;
              for (const p of P) { const dd = (p.c[0] - c) ** 2 + (p.c[1] - r) ** 2 + 1; const wt = 1 / dd; sw += wt; sv += wt * p.v; }
              const v = sv / sw, i = (y * w + x) * 4;
              const st2 = STEPS.find((q) => v >= q[0]);
              if (st2) { img.data[i] = st2[1][0]; img.data[i + 1] = st2[1][1]; img.data[i + 2] = st2[1][2]; img.data[i + 3] = 150; }
            }
            ctx.putImageData(img, 0, 0);
            made.fcLayer = cv;
            if (fcLeg) {
              const mx = d3.max(P, (p) => p.v) || 0, span = n === 1 ? 'next 24 h' : 'next ' + n * 24 + ' h';
              const tl = document.createElement('span');
              tl.textContent = mx < 1 ? `Forecast new snow, ${span} from ${wd(days[0])}: under 1 cm anywhere on this map (model).` : `Forecast new snow, ${span} from ${wd(days[0])} (model; up to ${d3.format('.0f')(mx)} cm on this map):`;
              fcLeg.append(tl);
              if (mx >= 1)
              for (const [lo, c] of STEPS.slice().reverse()) { const sp = document.createElement('span'); const i2 = document.createElement('i'); i2.style.background = `rgba(${c.join(',')},.6)`; sp.append(i2, `${lo}+ cm`); fcLeg.append(sp); }
            }
          } else {
            const k = Number(s.fc.slice(2)) - 1, day = days[Math.min(k, days.length - 1)];
            const fls = pts.filter((r) => r.day === day && r.freezing_level_m !== null).map((r) => r.freezing_level_m);
            const fl = Math.round(d3.mean(fls) / 10) * 10;
            const NS = 'http://www.w3.org/2000/svg';
            const sv = document.createElementNS(NS, 'svg');
            sv.setAttribute('class', 'sw-paths-layer sw-fc-layer'); sv.setAttribute('viewBox', `0 0 ${W} ${H}`); sv.setAttribute('preserveAspectRatio', 'none');
            const lo = d3.min(t.elev), hi = d3.max(t.elev);
            if (fl > lo && fl < hi) {
              const geo = d3.contours().size([W, H]).thresholds([fl])(t.elev)[0];
              const pth = document.createElementNS(NS, 'path'); pth.setAttribute('d', geo.coordinates.flatMap((poly) => poly.map((ring) => 'M' + ring.map((q) => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join('L') + 'Z')).join(''));
              pth.setAttribute('fill', 'none'); pth.setAttribute('stroke', '#1E64C8'); pth.setAttribute('stroke-linejoin', 'round'); sv.append(pth);
            }
            made.fcLayer = sv;
            if (fcLeg) {
              const sp = document.createElement('span');
              const i2 = document.createElement('i'); i2.style.cssText = 'background:none;border:none;border-top:3px dashed #1E64C8;height:0;width:22px';
              sp.append(i2, fl <= lo ? `Freezing level, ${wd(day)}: about ${d3.format(',')(fl)} m, below the whole map (everything stays frozen)` :
                fl >= hi ? `Freezing level, ${wd(day)}: about ${d3.format(',')(fl)} m, above every summit on the map` :
                `Freezing level, ${wd(day)}: about ${d3.format(',')(fl)} m (highest of the day, model; ${d3.format(',')(d3.min(fls))}–${d3.format(',')(d3.max(fls))} m across the map). Above the line stays below freezing.`);
              fcLeg.append(sp);
            }
          }
          if (firstLayer) stage.insertBefore(made.fcLayer, firstLayer); else stage.append(made.fcLayer);
        }
      }

      // fit the grid into the box, then let zoom transform it
      const cw = el.clientWidth, ch = el.clientHeight || (cw * H) / W;
      // on a phone the map fills its (taller) box and you pan around it; elsewhere the whole area fits
      const cover = window.matchMedia('(max-width: 640px)').matches;
      const s0 = cover ? Math.max(cw / W, ch / H) : Math.min(cw / W, ch / H);
      const ox = (cw - W * s0) / 2, oy = (ch - H * s0) / 2;
      made.geo = { ox, oy, s0, cw, ch };
      canvas.style.width = W * s0 + 'px'; canvas.style.height = H * s0 + 'px';
      canvas.style.left = ox + 'px'; canvas.style.top = oy + 'px';
      for (const lc of [made.glacCanvas, made.pathCanvas, made.docCanvas, made.topo && made.topo.sv, made.fcLayer]) if (lc) Object.assign(lc.style, { left: ox + 'px', top: oy + 'px', width: W * s0 + 'px', height: H * s0 + 'px' });
      // zoom in until a cell of the finest terrain is about 24 screen pixels across (at least 16×), so the
      // big maps can get down to a single slope even on a phone
      const finest = row.detail ? JSON.parse(row.detail).cell_m : row.cell_m;
      const maxK = Math.max(16, (24 * (row.cell_m / finest)) / s0);
      made.zoom.scaleExtent([1, maxK]);
      made.zoom.extent([[0, 0], [cw, ch]]).translateExtent([[ox, oy], [ox + W * s0, oy + H * s0]]);
      const RANK = { station: 0, peak: 1, place: 2, summit: 3, col: 4, glacier: 5, circ: 6 };
      const markers = JSON.parse(row.markers || '[]').sort((a, b) => (RANK[a.kind] - RANK[b.kind]) || ((b.elev_m || 0) - (a.elev_m || 0)));
      const fmt = d3.format(',');

      // close in, repaint just the visible area at screen resolution: terrain values are interpolated between
      // cells, so slope bands get crisp edges and the shading stays smooth instead of a blown-up grid of squares
      const hiRender = () => {
        const tr = made.t;
        if (!made.hi) {
          made.hi = document.createElement('canvas');
          made.hi.className = 'sw-hi';
          Object.assign(made.hi.style, { position: 'absolute', pointerEvents: 'none' });
        }
        const hi = made.hi;
        if (s0 * tr.k < 3) { hi.style.display = 'none'; return; }
        // keep it above the terrain images but below glaciers, contours and the rest
        const terr = [canvas, ...Object.values(made.blocks || {}).map((b) => b.canvas)].filter((c) => c && c.parentNode === stage);
        const kids = [...stage.children];
        const last = terr.sort((a, b) => kids.indexOf(a) - kids.indexOf(b)).pop();
        if (hi.parentNode !== stage || hi.previousSibling !== last) stage.insertBefore(hi, last.nextSibling);
        let dpr = Math.min(2, window.devicePixelRatio || 1);
        if (cw * ch * dpr * dpr > 1.4e6) dpr = Math.sqrt(1.4e6 / (cw * ch)); // keeps a repaint quick on phones
        const needE = s.mode === 'watch';
        const PW = Math.max(1, Math.round(cw * dpr)), PH = Math.max(1, Math.round(ch * dpr));
        if (hi.width !== PW || hi.height !== PH) { hi.width = PW; hi.height = PH; }
        Object.assign(hi.style, { left: -tr.x / tr.k + 'px', top: -tr.y / tr.k + 'px', width: cw / tr.k + 'px', height: ch / tr.k + 'px', display: 'block' });
        const ctx = hi.getContext('2d');
        const img = ctx.createImageData(PW, PH);
        const f = detail ? row.cell_m / detail.cell_m : 1;
        const blocks = Object.values(made.blocks || {}).filter((b) => b.d);
        const wkey = wrow && wrow.from_deg !== null ? 'w' + wrow.from_deg : null;
        // grid position (overview cells) of each screen column and row
        const colAt = new Float64Array(PW), rowAt = new Float64Array(PH);
        for (let x = 0; x < PW; x++) colAt[x] = (((x + 0.5) / dpr - tr.x) / tr.k - ox) / s0;
        for (let y = 0; y < PH; y++) rowAt[y] = (((y + 0.5) / dpr - tr.y) / tr.k - oy) / s0;
        const bil = (arr, w, h, u, v) => {
          const x0 = Math.max(0, Math.min(w - 1, Math.floor(u))), y0 = Math.max(0, Math.min(h - 1, Math.floor(v)));
          const x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1), fx = Math.max(0, Math.min(1, u - x0)), fy = Math.max(0, Math.min(1, v - y0));
          return (arr[y0 * w + x0] * (1 - fx) + arr[y0 * w + x1] * fx) * (1 - fy) + (arr[y1 * w + x0] * (1 - fx) + arr[y1 * w + x1] * fx) * fy;
        };
        const px = img.data;
        let bk = null;
        for (let y = 0; y < PH; y++) {
          const r = rowAt[y];
          for (let x = 0; x < PW; x++) {
            const c = colAt[x], i = y * PW + x;
            if (c < 0 || r < 0 || c >= W || r >= H) { px[i * 4 + 3] = 0; continue; }
            const fc = c * f, fr = r * f;
            if (!bk || fc < bk.meta.col0 || fr < bk.meta.row0 || fc >= bk.meta.col0 + bk.d.w || fr >= bk.meta.row0 + bk.d.h)
              bk = blocks.find((b) => fc >= b.meta.col0 && fr >= b.meta.row0 && fc < b.meta.col0 + b.d.w && fr < b.meta.row0 + b.d.h) || null;
            if (bk) {
              const d = bk.d, u = fc - bk.meta.col0 - 0.5, v = fr - bk.meta.row0 - 0.5;
              const ni = Math.min(d.h - 1, Math.floor(fr - bk.meta.row0)) * d.w + Math.min(d.w - 1, Math.floor(fc - bk.meta.col0));
              const m = wkey && bk.masks && bk.masks[wkey];
              colour(px, i, bil(d.shade, d.w, d.h, u, v), bil(d.slope, d.w, d.h, u, v), needE ? bil(d.elev, d.w, d.h, u, v) : 0, d.asp[ni] === 255 ? null : ASP[d.asp[ni]], !!(m && m[ni]));
            } else {
              const u = c - 0.5, v = r - 0.5, ni = Math.min(H - 1, Math.floor(r)) * W + Math.min(W - 1, Math.floor(c));
              colour(px, i, bil(t.shade, W, H, u, v), bil(t.slope, W, H, u, v), needE ? bil(t.elev, W, H, u, v) : 0, octant(t.aspect[ni]), !!(wmask && wmask[ni]));
            }
          }
        }
        ctx.putImageData(img, 0, 0);
      };

      made.apply = () => {
        const tr = made.t;
        stage.style.transform = `translate(${tr.x}px,${tr.y}px) scale(${tr.k})`;
        clearTimeout(made.hiT);
        if (made.hi && s0 * tr.k < 3) made.hi.style.display = 'none';
        made.hiT = setTimeout(hiRender, 180);
        if (made.fcLayer && made.fcLayer.tagName.toLowerCase() === 'svg') {
          const u = 1 / (s0 * tr.k), pth = made.fcLayer.querySelector('path');
          if (pth) { pth.setAttribute('stroke-width', 3 * u); pth.setAttribute('stroke-dasharray', `${9 * u} ${6 * u}`); }
        }
        if (made.topo && s.topo) {
          const u = 1 / (s0 * tr.k); // grid units per screen pixel
          made.topo.grp.extra.setAttribute('stroke-width', 0.5 * u);
          made.topo.grp.minor.setAttribute('stroke-width', 0.7 * u);
          made.topo.grp.index.setAttribute('stroke-width', 1.3 * u);
          made.topo.grp.extra.style.display = tr.k >= 2.5 ? '' : 'none';
          made.topo.lg.setAttribute('font-size', 10 * u);
          made.topo.lg.setAttribute('stroke-width', 2.5 * u);
        }
        if (detail) {
          const f = row.cell_m / detail.cell_m;
          const sharp = s0 * tr.k > Math.max(1.6, f * 0.4); // an overview cell is over ~1.6 screen pixels and a detail cell over ~0.4 (so 5 m blocks wait for a real zoom)
          // the part of the grid in view, in fine cells
          const vc0 = (((0 - tr.x) / tr.k - ox) / s0) * f, vc1 = (((cw - tr.x) / tr.k - ox) / s0) * f;
          const vr0 = (((0 - tr.y) / tr.k - oy) / s0) * f, vr1 = (((ch - tr.y) / tr.k - oy) / s0) * f;
          for (const mk of card.querySelectorAll('[data-rc]')) {
            const [br, bc] = mk.dataset.rc.split(',').map(Number);
            const c0 = bc * detail.block, r0 = br * detail.block;
            const inView = c0 < vc1 && c0 + detail.block > vc0 && r0 < vr1 && r0 + detail.block > vr0;
            if (sharp && inView && mk.hidden) mk.hidden = false; // starts loading that block
          }
          for (const [id, bk] of Object.entries(made.blocks)) {
            const b = bk.meta;
            Object.assign(bk.canvas.style, {
              left: ox + (b.col0 / f) * s0 + 'px', top: oy + (b.row0 / f) * s0 + 'px',
              width: (b.width / f) * s0 + 'px', height: (b.height / f) * s0 + 'px',
              display: sharp && bk.d ? 'block' : 'none',
            });
          }
        }
        const toX = (c) => tr.x + (ox + c * s0) * tr.k, toY = (r) => tr.y + (oy + r * s0) * tr.k;
        const sel = d3.select(svg).attr('viewBox', `0 0 ${cw} ${ch}`);
        sel.selectAll('*').remove();
        if (row.parks) {
          made.parks = made.parks || JSON.parse(row.parks);
          for (const pk of made.parks) for (const ring of pk.rings) {
            sel.append('path').attr('d', 'M' + ring.map(([c, r]) => `${toX(c).toFixed(1)},${toY(r).toFixed(1)}`).join('L') + 'Z')
              .attr('fill', 'none').attr('stroke', '#0B7A3B').attr('stroke-width', 2).attr('stroke-dasharray', '7 4').attr('stroke-opacity', 0.85);
          }
        }
        if (window.swObsOverlay) window.swObsOverlay(sel, zone, row, toX, toY, s, card);
        if (window.swRouteOverlay) window.swRouteOverlay(sel, zone, row, toX, toY);
        if (window.swSearchOverlay) window.swSearchOverlay(sel, zone, toX, toY);
        const boxes = [];
        for (const m of markers) {
          const x = toX(m.col), y = toY(m.row);
          if (x < -10 || y < -10 || x > cw + 10 || y > ch + 10) continue;
          const minor = m.kind === 'col' || m.kind === 'glacier' || m.kind === 'circ';
          if (minor && tr.k < 1.5) continue; // the busier names come in as you zoom
          const area = m.kind === 'glacier' || m.kind === 'circ';
          let label = m.name || '';
          if (m.kind === 'summit') label = fmt(m.elev_m) + ' m';
          else if (m.kind === 'peak' && m.label_elev && m.elev_m && tr.k >= 1.8) label += ' ' + fmt(m.elev_m) + ' m';
          const size = m.kind === 'peak' || m.kind === 'station' ? 11.5 : 10.5;
          const w = label.length * size * 0.56, h = size + 3;
          const lx = area ? x - w / 2 : x + 7;
          const box = [lx, y - h / 2, lx + w, y + h / 2];
          const clash = boxes.some((o) => !(box[2] < o[0] || box[0] > o[2] || box[3] < o[1] || box[1] > o[3])) || box[2] > cw - 2 || box[0] < 2 || box[1] < 2 || box[3] > ch - 2;
          if (clash && m.kind !== 'station' && m.kind !== 'peak' && m.kind !== 'summit') continue; // no symbol without its name
          if (m.kind === 'peak' || m.kind === 'summit') sel.append('path').attr('d', `M${x},${y - 5}L${x - 4.5},${y + 3.5}L${x + 4.5},${y + 3.5}Z`).attr('fill', '#1A1A1A');
          else if (m.kind === 'station') sel.append('circle').attr('cx', x).attr('cy', y).attr('r', 4.5).attr('fill', '#1E64C8').attr('stroke', '#fff').attr('stroke-width', 1.5);
          else if (m.kind === 'col') sel.append('path').attr('d', `M${x - 3.5},${y}L${x},${y - 3.5}L${x + 3.5},${y}L${x},${y + 3.5}Z`).attr('fill', '#5A5A5A').attr('stroke', '#fff').attr('stroke-width', 1);
          else if (m.kind === 'place') sel.append('rect').attr('x', x - 3.5).attr('y', y - 3.5).attr('width', 7).attr('height', 7).attr('fill', '#6B3FA0').attr('stroke', '#fff').attr('stroke-width', 1);
          if (clash) continue;
          boxes.push(box);
          const fill = { station: '#0B3D8C', peak: '#1A1A1A', summit: '#1A1A1A', col: '#404040', place: '#4B2A78', glacier: '#1F5F96', circ: '#4A4A4A' }[m.kind];
          const tx = sel.append('text').attr('x', area ? x : lx).attr('y', y).attr('dy', '0.35em').attr('font-size', size)
            .attr('text-anchor', area ? 'middle' : 'start').attr('font-style', area ? 'italic' : null)
            .attr('font-weight', m.kind === 'peak' ? 500 : null)
            .attr('stroke-width', 3).style('fill', fill).text(label);
          // near an edge, measure the real width and drop the label if it would be cut off
          if (box[2] > cw - 140 || box[0] < 140) {
            const tw = tx.node().getComputedTextLength(), left = area ? x - tw / 2 : lx;
            if (left < 2 || left + tw > cw - 2) { tx.remove(); boxes.pop(); }
          }
        }
        // scale bar sized to the zoom
        const pxPerM = (s0 * tr.k) / row.cell_m;
        const dist = nice(90 / pxPerM), bar = dist * pxPerM;
        const bx = 12, by = ch - 16;
        sel.append('rect').attr('x', bx).attr('y', by).attr('width', bar).attr('height', 5).attr('fill', '#1A1A1A');
        sel.append('rect').attr('x', bx + bar / 2).attr('y', by).attr('width', bar / 2).attr('height', 5).attr('fill', '#fff').attr('stroke', '#1A1A1A');
        sel.append('text').attr('x', bx).attr('y', by - 5).attr('font-size', 11.5).attr('stroke-width', 3).style('fill', '#1A1A1A')
          .text(dist >= 1000 ? `${dist / 1000} km` : `${dist} m`);
        sel.append('text').attr('x', cw - 12).attr('y', 20).attr('text-anchor', 'end').attr('font-size', 12.5).attr('stroke-width', 3).style('fill', '#1A1A1A').text('N ↑');
      };
      // a new box size (expand, close, resize) starts from the whole map
      const size = `${cw}x${ch}`;
      if (made.size !== size) { made.size = size; made.t = d3.zoomIdentity; d3.select(el).call(made.zoom.transform, d3.zoomIdentity); }
      made.apply();

      // hover readout
      el.onpointermove = (ev) => {
        const r = el.getBoundingClientRect();
        const sx = ev.clientX - r.left, sy = ev.clientY - r.top, tr = made.t;
        const c = Math.floor(((sx - tr.x) / tr.k - ox) / s0), rr = Math.floor(((sy - tr.y) / tr.k - oy) / s0);
        if (c < 0 || rr < 0 || c >= W || rr >= H) { tip.hidden = true; return; }
        const i = rr * W + c;
        let elev = t.elev[i], slope = t.slope[i], a = octant(t.aspect[i]);
        if (detail && s0 * tr.k > 1.6) {
          const f = row.cell_m / detail.cell_m;
          const fc = Math.floor((((sx - tr.x) / tr.k - ox) / s0) * f), fr = Math.floor((((sy - tr.y) / tr.k - oy) / s0) * f);
          for (const bk of Object.values(made.blocks)) {
            const b = bk.meta;
            if (bk.d && fc >= b.col0 && fc < b.col0 + b.width && fr >= b.row0 && fr < b.row0 + b.height) {
              const j = (fr - b.row0) * b.width + (fc - b.col0);
              elev = Math.round(bk.d.elev[j]); slope = bk.d.slope[j]; a = bk.d.asp[j] === 255 ? null : ASP[bk.d.asp[j]];
            }
          }
        }
        tip.replaceChildren();
        const pdh = s.paths && card.querySelector('.sw-paths') ? dash.data('avalanche_paths') : null;
        const ph = pdh && pdh.status === 'ok' ? window.swRouteCore.pathAt(window.swPathsFor(zone, pdh.data), ((sx - tr.x) / tr.k - ox) / s0, ((sy - tr.y) / tr.k - oy) / s0) : null;
        const l1 = document.createElement('div'); l1.textContent = `${fmt(elev)} m`;
        const l2 = document.createElement('div'); l2.textContent = `Slope ${slope}°` + (a ? ` · faces ${a}` : ' · flat');
        tip.append(l1, l2);
        if (ph) { const l3 = document.createElement('div'); l3.textContent = `Mapped avalanche path ${ph.id}${ph.valley ? ' · ' + ph.valley : ''}`; tip.append(l3); }
        const ddh = s.doc && card.querySelector('.sw-doc') ? dash.data('documented_avalanches') : null;
        if (ddh && ddh.status === 'ok') {
          const gc = ((sx - tr.x) / tr.k - ox) / s0, gr = ((sy - tr.y) / tr.k - oy) / s0;
          const hits = window.swDocFor(zone, ddh.data).filter((p) => gc >= p.box[0] && gc <= p.box[2] && gr >= p.box[1] && gr <= p.box[3] && window.swRouteCore.pathAt([p], gc, gr));
          if (hits.length) { const l4 = document.createElement('div'); l4.textContent = `Documented avalanche${hits.length > 1 ? 's' : ''}: ${[...new Set(hits.map((h) => h.year))].sort((a, b) => b - a).join(', ')}`; tip.append(l4); }
        }
        const gdh = s.glac && card.querySelector('.sw-glac') ? dash.data('glaciers') : null;
        if (gdh && gdh.status === 'ok') {
          const gx = row.x0 + (((sx - tr.x) / tr.k - ox) / s0) * row.cell_m, gy = row.y0 - (((sy - tr.y) / tr.k - oy) / s0) * row.cell_m;
          const gl = window.swRouteCore.glacierAt({ list: window.swGlaciersFor(zone, gdh.data), x0: row.x0, y0: row.y0, cell: row.cell_m }, gx, gy);
          if (gl) { const l6 = document.createElement('div'); l6.textContent = `Glacier${gl.name ? ': ' + gl.name : ''} (${d3.format(',')(Math.round(gl.area_ha))} ha)`; tip.append(l6); }
        }
        const near = (window.swObsHits || {})[zone];
        if (near) for (const m of near) if (Math.hypot(m.x - sx, m.y - sy) <= 9) {
          const l5 = document.createElement('div'); l5.textContent = m.label; tip.append(l5);
        }
        tip.hidden = false;
        tip.style.left = Math.max(0, Math.min(cw - tip.offsetWidth, sx + 12)) + 'px';
        tip.style.top = Math.max(0, sy - tip.offsetHeight - 8) + 'px';
      };
      el.onpointerleave = () => { tip.hidden = true; };
    },
    unmount: (el) => { window.swMaps.delete(el); },
  });

  // what the current bulletin says, for the "terrain to watch" view
  dash.draw('match-note', (el) => {
    const pr = dash.data('problems'), dn = dash.data('danger_now');
    if (pr.status !== 'ok' || dn.status !== 'ok') { el.textContent = '—'; return; }
    const zone = el.closest('[data-zone]').dataset.zone;
    const probs = pr.data.filter((r) => r.zone === zone && r.problem);
    const rated = dn.data.filter((r) => r.zone === zone && Number(r.level) > 0);
    if (!probs.length && !rated.length) {
      el.textContent = 'No danger ratings or avalanche problems in the current bulletin yet, so “Match current bulletin” shows every slope from 30°.';
      return;
    }
    const parts = probs.map((p) => p.problem + (p.aspects ? ` on ${p.aspects}` : '') + (p.elevations ? ` (${p.elevations})` : ''));
    let txt = parts.length ? 'Current problems: ' + parts.join('; ') + '.' : '';
    const top = rated.sort((a, b) => b.level - a.level)[0];
    if (top) txt += ` Highest rating: ${top.rating} (${top.band_label}).`;
    if (['Rogers Pass', 'Rossland', 'Whitewater', 'Kootenay Pass'].includes(zone)) txt += ' Avalanche Canada names bands, not heights, so set the elevation range yourself.';
    if (zone === 'Rocky Mountain NP') txt += ' The CAIC names bands (above, near and below treeline), not heights, so set the elevation range yourself; treeline here is roughly 3,300–3,500 m.';
    el.textContent = txt.trim();
  });
})();

;
(() => {
  const C = window.swRouteCore;
  const byZone = {}; // zone -> { route, res, key, error, busy, sel }
  const fmt = d3.format(','), km = d3.format('.1f'), km2 = d3.format('.2f');
  const LV = ['#FFFFFF', '#FFB000', '#D0007A'];
  const cardOf = (zone) => document.querySelector(`.sw-zone[data-zone="${CSS.escape(zone)}"] .sw-mapcard`) || document.querySelector(`.sw-mapcard[data-zone="${CSS.escape(zone)}"]`);
  const terrainRows = () => window.swTerrainAll();

  const refresh = (zone) => {
    const st = byZone[zone];
    if (!st || !st.route) return;
    const row = terrainRows().find((r) => r.zone === zone);
    if (!row) return;
    const t = window.swTerrainFor(row);
    if (!t) { st.busy = true; return; } // runs again once the terrain is decoded
    const fine = Object.values((window.swFine || {})[zone] || {}).filter((b) => b.d);
    const det = row.detail ? JSON.parse(row.detail) : null;
    const coarse = det && row.cell_m > det.cell_m * 2;
    const card = cardOf(zone);
    const watch = card ? window.swMapSettings(card.dataset.pfx) : null;
    const pd = zone === 'Vallter / Ulldeter' ? dash.data('avalanche_paths') : null;
    const paths = pd && pd.status === 'ok' ? window.swPathsFor(zone, pd.data) : [];
    const wd = dash.data('wind_summary');
    const w = wd.status === 'ok' ? wd.data.find((x) => x.zone === zone) : null;
    const wind = w && w.from_deg !== null ? { mask: window.swWindMaskFor(row, t, w), active: window.swWindActive(w), from: w.from_dir } : null;
    const gd = dash.data('glaciers');
    const glaciers = gd.status === 'ok' && gd.data.some((x) => x.zone === zone)
      ? { list: window.swGlaciersFor(zone, gd.data), x0: row.x0, y0: row.y0, cell: row.cell_m } : null;
    const key = JSON.stringify([fine.length, watch, paths.length, w ? [w.from_deg, w.until] : null, glaciers ? glaciers.list.length : 0]);
    if (st.res && st.key === key) { if (applyConditions(zone, st)) redrawAll(zone); return; }
    st.key = key;
    if (coarse) {
      const m = mosaic(zone, row, det, st.route);
      if (!m) { st.busy = true; st.res = null; st.key = null; dash.draw('route-msg'); return; } // waits for the 30 m blocks along the route
      const wm = w && w.from_deg !== null ? { mask: C.windMask(m.row, m.t, w.from_deg, (window.swAlpine || {})[zone] || 0), active: window.swWindActive(w), from: w.from_dir } : null;
      st.res = C.analyse(st.route, m.row, m.t, [], watch, { paths, wind: wm, glaciers });
      const f = row.cell_m / det.cell_m;
      st.boxT = (b) => [(m.fc0 + b[0]) / f, (m.fr0 + b[1]) / f, (m.fc0 + b[2]) / f, (m.fr0 + b[3]) / f];
      st.res.fineShare = 1;
    } else { st.res = C.analyse(st.route, row, t, fine, watch, { paths, wind, glaciers }); st.boxT = null; }
    if (st.res && det) st.res.fineCell = det.cell_m;
    st.condKey = null;
    applyConditions(zone, st);
    st.busy = false;
    redrawAll(zone);
  };
  const redrawAll = (zone) => {
    for (const n of ['route-msg', 'route-verdict', 'route-conditions', 'route-summary', 'route-profile', 'route-rows']) dash.draw(n);
    const card = cardOf(zone);
    const co = card && card.querySelector('.sw-callout'); if (co) co.dataset.key = '';
    const st = byZone[zone];
    if (card && st) {
      const v = showOf(st);
      for (const i of card.querySelectorAll('.sw-hz')) i.checked = i.value === 'all' ? v.underfoot && v.overhead && v.other && !v.highOnly : !!v[i.value];
    }
    const m = card && window.swMaps.get(card.querySelector('.sw-map'));
    if (m) m.redraw();
  };

  // ---- what today's conditions say about slopes above the route ----
  // Most avalanche accidents are triggered by the victim or their group, so the slope underfoot always
  // counts. A slope above counts in full only when today's data gives a reason it could come down on you.
  const bulletinFor = (zone, st) => {
    const dn = ok('danger_now') || [], pr = ok('problems') || [];
    let rated = dn.filter((x) => x.zone === zone && Number(x.level) > 0);
    let probs = pr.filter((x) => x.zone === zone && x.problem);
    let forecastName = null;
    const rf = (ok('regional_forecasts') || []).filter((x) => x.zone === zone);
    if (rf.length) {
      const inRing = (lon, lat, ring) => { let ins = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) ins = !ins; } return ins; };
      const counts = rf.map((f) => { const rings = JSON.parse(f.rings || '[]'); return st.route.points.filter((p) => rings.some((rg) => inRing(p.lon, p.lat, rg))).length; });
      const best = counts.indexOf(Math.max(...counts));
      if (counts[best] > 0) {
        const f = rf[best];
        forecastName = `${f.name} (${f.forecaster})`;
        const days = JSON.parse(f.ratings || '[]');
        const first = d3.min(days, (x) => x.date);
        rated = days.filter((x) => x.date === first && Number(x.level) > 0).map((x) => ({ ...x, zone }));
        probs = JSON.parse(f.problems || '[]').map((x) => ({ ...x, zone }));
      }
    }
    return { rated, probs, forecastName, at: bandRater(zone, rated) };
  };
  const REMOTE_M = 300; // persistent slabs: start zones this close can be triggered from where you stand
  const raiseFor = (zone, st) => {
    const bl = bulletinFor(zone, st);
    let tm = null;
    try { tm = timing(zone, st, ok('outlook') || []); } catch (e) { tm = null; }
    const pnames = bl.probs.map((p) => String(p.problem).toLowerCase());
    const persistent = pnames.some((n) => /persistent/.test(n));
    const wet = pnames.some((n) => /wet|glid/.test(n));
    const bigSnow = tm && tm.fc && (tm.fc.snowfall_cm || 0) >= 20;
    const p0 = st.route.points[0];
    const fn = (s) => {
      const o = s.over, why = [];
      const elev = o ? o.elev : s.elev;
      if (o && o.loaded) why.push('start zone wind-loaded');
      if (bl.rated.length && bl.at(elev).level >= 3) why.push(`${String(bl.at(elev).rating).toLowerCase()} danger at the start zone`);
      if (persistent && o && o.dist <= REMOTE_M) why.push('persistent slab: can be triggered from a distance');
      if (wet) why.push('wet-snow problem in the bulletin');
      if (bigSnow) why.push(`${Math.round(tm.fc.snowfall_cm)} cm new snow forecast`);
      if (tm && tm.fc && o) {
        const ms = tm.atD(s.d), tt = tm.clock(ms), hr = Number(tt.slice(0, 2)) + Number(tt.slice(3)) / 60;
        if (hr >= 10.5 && tm.warmAt(o.elev) && insolation(sunPos(ms, p0.lat, p0.lon), o.slope, o.asp) >= 0.55) why.push('start zone in warm sun when you pass');
      }
      return why.join('; ');
    };
    fn.key = JSON.stringify([bl.rated.map((x) => [x.band, x.level]), pnames, tm ? [tm.t0, tm.fc && tm.fc.date, Number(st.pace || 1)] : null]);
    fn.bl = bl;
    return fn;
  };
  // regroup the sections for today's conditions; true when anything changed
  const applyConditions = (zone, st) => {
    if (!st.res || !st.res.regroup) return false;
    const raise = raiseFor(zone, st);
    if (st.condKey === raise.key) return false;
    const before = (st.res.sections || []).map((g) => [g.start, g.end, g.level, g.kind].join()).join('|');
    st.res.regroup(raise);
    if (st.boxT) for (const sec of st.res.sections) sec.box = st.boxT(sec.box);
    st.condKey = raise.key;
    st.bulletin = raise.bl;
    const after = st.res.sections.map((g) => [g.start, g.end, g.level, g.kind].join()).join('|');
    if (before !== after) st.sel = null;
    return before !== after || true;
  };

  // ---- the hazard filter: on the slope / from above / cliffs and glaciers ----
  // one filter for the table, the map, the profile and previous / next on the map
  const showOf = (st) => st.show || (st.show = { underfoot: true, overhead: false, other: true, highOnly: false });
  // each box matches the table's groups: on the slope (anything you could trigger, ▼ or ▼▲), from above
  // (raised or exposure), cliffs and glaciers
  const BOX = { ground: 'underfoot', above: 'overhead', exposure: 'overhead', other: 'other' };
  const visible = (st, sec, anyLevel) => { const v = showOf(st); return (anyLevel || !v.highOnly || sec.level === 2) && !!v[BOX[sec.kind]]; };
  const visS = (st, s) => { const v = showOf(st); return !!s.kind && (!v.highOnly || s.level === 2) && !!v[BOX[s.kind]]; };
  const EXPO_COL = '#8A7CC2'; // exposure to slopes above, not raised by today's conditions
  const colOf = (lv, kind) => (kind === 'exposure' ? EXPO_COL : LV[lv || 0]);
  const levelWord = (g, long) => (g.kind === 'exposure' ? (long ? 'Exposure from above' : 'Exposure') : g.level === 2 ? 'High-consequence' : (long ? 'Take care' : 'Care'));

  // the route's surroundings on the 30 m blocks, stitched into one grid for the check
  const BUF = 1300; // m: the overhead search looks 1 km out
  const routeBox = (row, det, route) => {
    const z = C.zoneOfCrs(row.crs);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of route.points) { const [x, y] = C.utm(p.lat, p.lon, z); if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const Wf = row.width * (row.cell_m / det.cell_m), Hf = row.height * (row.cell_m / det.cell_m);
    const fc0 = Math.max(0, Math.floor((x0 - BUF - row.x0) / det.cell_m)), fc1 = Math.min(Wf - 1, Math.ceil((x1 + BUF - row.x0) / det.cell_m));
    const fr0 = Math.max(0, Math.floor((row.y0 - (y1 + BUF)) / det.cell_m)), fr1 = Math.min(Hf - 1, Math.ceil((row.y0 - (y0 - BUF)) / det.cell_m));
    return { fc0, fc1, fr0, fr1 };
  };
  const mosaic = (zone, row, det, route) => {
    const b = routeBox(row, det, route);
    if (b.fc1 < b.fc0 || b.fr1 < b.fr0) return null;
    const need = new Set();
    for (let br = Math.floor(b.fr0 / det.block); br <= Math.floor(b.fr1 / det.block); br++)
      for (let bc = Math.floor(b.fc0 / det.block); bc <= Math.floor(b.fc1 / det.block); bc++) need.add(`${det.prefix}_${br}_${bc}`);
    const have = (window.swFine || {})[zone] || {};
    for (const id of need) if (!have[id] || !have[id].d) return null;
    const w = b.fc1 - b.fc0 + 1, h = b.fr1 - b.fr0 + 1, n = w * h;
    const elev = new Uint16Array(n), slope = new Uint8Array(n), aspect = new Uint8Array(n);
    for (const id of need) {
      const bk = have[id], m = bk.meta, d = bk.d;
      const r0 = Math.max(b.fr0, m.row0), r1 = Math.min(b.fr1, m.row0 + m.height - 1);
      const c0 = Math.max(b.fc0, m.col0), c1 = Math.min(b.fc1, m.col0 + m.width - 1);
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        const j = (r - m.row0) * m.width + (c - m.col0), i = (r - b.fr0) * w + (c - b.fc0);
        elev[i] = Math.round(d.elev[j]); slope[i] = d.slope[j]; aspect[i] = d.asp2[j];
      }
    }
    return { row: { zone, crs: row.crs, cell_m: det.cell_m, width: w, height: h, x0: row.x0 + b.fc0 * det.cell_m, y0: row.y0 - b.fr0 * det.cell_m },
      t: { elev, slope, aspect }, fc0: b.fc0, fr0: b.fr0 };
  };
  window.swRouteRefresh = refresh;

  // route on the map, coloured by section
  window.swRouteOverlay = (sel, zone, row, toX, toY) => {
    const st = byZone[zone];
    const host = sel.node().parentNode;
    if (!st || !st.res) { hideCallout(host); return; }
    const pts = st.res.samples.filter((s) => !s.outside).map((s) => ({ s, x: toX((s.x - row.x0) / row.cell_m), y: toY((row.y0 - s.y) / row.cell_m) }));
    st.screen = pts;
    if (pts.length < 2) { hideCallout(host); return; }
    const line = d3.line().x((p) => p.x).y((p) => p.y);
    sel.append('path').attr('d', line(pts)).attr('fill', 'none').attr('stroke', '#1A1A1A').attr('stroke-width', 7).attr('stroke-opacity', 0.75)
      .attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round');
    // today's danger rating at each point's elevation, as a coloured edge around the hazard line
    let at = null;
    try { const b = brief(zone, st); if (b && b.at && st.res.samples.some((q) => !q.outside && b.at(q.elev).level)) at = b.at; } catch (e) { at = null; }
    if (at) {
      sel.append('path').attr('d', line(pts)).attr('fill', 'none').attr('stroke', '#1A1A1A').attr('stroke-width', 12).attr('stroke-opacity', 0.7)
        .attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round');
      let dr = [pts[0]];
      const dflush = () => { if (dr.length > 1) sel.append('path').attr('d', line(dr)).attr('fill', 'none').attr('stroke', DCOL[at(dr[dr.length - 1].s.elev).level]).attr('stroke-width', 9).attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round'); };
      for (let i = 1; i < pts.length; i++) {
        dr.push(pts[i]);
        if (at(pts[i].s.elev).level !== at(pts[i - 1].s.elev).level || i === pts.length - 1) { dflush(); dr = [pts[i]]; }
      }
    }
    let run = [pts[0]];
    const flush = () => {
      if (run.length < 2) return;
      const s = run[run.length - 1].s, on = s.level && visS(st, s);
      const p = sel.append('path').attr('d', line(run)).attr('fill', 'none').attr('stroke', on ? colOf(s.level, s.kind) : LV[0])
        .attr('stroke-width', 4).attr('stroke-linejoin', 'round').attr('stroke-linecap', on && s.expo === 'overhead' ? 'butt' : 'round');
      if (on && s.expo === 'overhead') p.attr('stroke-dasharray', '9 6'); // danger from above only: dashed
    };
    const kindOf = (q) => (q.s.level && visS(st, q.s) ? q.s.level + q.s.kind + (q.s.expo === 'overhead' ? 'o' : '') : '0');
    for (let i = 1; i < pts.length; i++) {
      run.push(pts[i]);
      if (kindOf(pts[i]) !== kindOf(pts[i - 1]) || i === pts.length - 1) { flush(); run = [pts[i]]; }
    }
    if (st.sel !== null && st.sel !== undefined) {
      const g = st.res.sections[st.sel];
      const seg = g ? pts.filter((p) => p.s.d >= g.start && p.s.d <= g.end) : [];
      if (seg.length > 1) sel.append('path').attr('d', line(seg)).attr('fill', 'none').attr('stroke', '#1E64C8').attr('stroke-width', 9).attr('stroke-opacity', 0.45).attr('stroke-linecap', 'round');
    }
    const a = pts[0], b = pts[pts.length - 1];
    sel.append('circle').attr('cx', a.x).attr('cy', a.y).attr('r', 6).attr('fill', '#1E9E4A').attr('stroke', '#fff').attr('stroke-width', 2);
    sel.append('circle').attr('cx', b.x).attr('cy', b.y).attr('r', 6).attr('fill', '#1A1A1A').attr('stroke', '#fff').attr('stroke-width', 2);
    if (st.sel !== null && st.sel !== undefined && st.res.sections[st.sel]) placeCallout(sel, host, zone, st, pts);
    else hideCallout(host);
  };

  // ---- underfoot vs overhead, shown the same way in the list, the callout, the table and on the map ----
  const EXPO = { underfoot: ['▼ On the slope', 'The danger is the slope you are on: you can trigger it.'],
    overhead: ['▲ Slope above', 'The danger is a slope above that can release onto you, even if you never touch it.'],
    both: ['▼▲ On it and under it', 'You are on avalanche terrain and under more of it.'] };
  const expoBadge = (expo) => {
    const b = document.createElement('span');
    if (!expo) return b;
    b.className = 'sw-expo sw-expo-' + expo; b.textContent = EXPO[expo][0]; b.title = EXPO[expo][1];
    return b;
  };
  const expoLines = (sec) => {
    const out = [];
    const P = sec.parts || { underfoot: [], overhead: [], other: sec.why };
    if (P.underfoot.length) out.push(['Underfoot', P.underfoot.join(', ')]);
    if (P.overhead.length) out.push(['Above', P.overhead.join('; ')]);
    if (P.other.length) out.push(['Also', P.other.join('; ')]);
    return out;
  };
  window.swExpoBadge = expoBadge;
  // why a slope above counts today, or why it doesn't
  const raisedLine = (g, bl) => {
    if (!g.has || !g.has.overhead) return null;
    if (g.raised && g.raised.length) return ['Above, today', `counts in full: ${g.raised.join('; ')}`];
    if (bl && !bl.rated.length) return ['Above, today', 'can’t be judged without a danger rating; avoid stopping under it'];
    return ['Above, today', 'nothing in today’s data points to it releasing onto you; still cross one at a time and don’t stop under it'];
  };

  // ---- the hazard callout: a card beside the selected section, placed where it covers least of the route ----
  const hideCallout = (host) => { const co = host && host.querySelector('.sw-callout'); if (co) co.hidden = true; };
  const calloutFor = (host) => {
    let co = host.querySelector('.sw-callout');
    if (!co) {
      co = document.createElement('div'); co.className = 'sw-callout'; co.hidden = true;
      co.setAttribute('role', 'dialog'); co.setAttribute('aria-label', 'Hazard on your route');
      for (const ev of ['pointerdown', 'pointermove', 'mousedown', 'touchstart', 'wheel', 'dblclick', 'click']) co.addEventListener(ev, (e) => e.stopPropagation());
      host.append(co);
    }
    return co;
  };
  const fillCallout = (co, zone, st) => {
    const secs = st.res.sections, i = st.sel, g = secs[i];
    const key = `${st.route.name}|${i}|${st.key}|${st.condKey}|${JSON.stringify(showOf(st))}`;
    if (co.dataset.key === key) return;
    co.dataset.key = key;
    co.className = 'sw-callout sw-lv' + (g.kind === 'exposure' ? 'E' : g.level);
    co.replaceChildren();
    const head = document.createElement('div'); head.className = 'sw-co-head';
    const tag = document.createElement('span'); tag.className = 'sw-lvl sw-lvl' + (g.kind === 'exposure' ? 'E' : g.level); tag.textContent = levelWord(g, true);
    const title = document.createElement('span'); title.className = 'sw-co-title'; title.textContent = `Km ${km2(g.start / 1000)}–${km2(g.end / 1000)}`;
    const x = document.createElement('button'); x.type = 'button'; x.className = 'sw-co-btn'; x.textContent = '✕'; x.setAttribute('aria-label', 'Close');
    x.onclick = () => selectSection(zone, null);
    head.append(tag, expoBadge(g.expo), title, x);
    const sub = document.createElement('div'); sub.className = 'sw-co-sub';
    sub.textContent = `${fmt(Math.round(g.end - g.start))} m long · ${fmt(Math.round(g.elevMin))}–${fmt(Math.round(g.elevMax))} m`;
    if (g.today) { const t = document.createElement('span'); t.className = 'sw-today'; t.textContent = 'Today'; sub.append(t); }
    const ul = document.createElement('ul'); ul.className = 'sw-co-list';
    for (const [lab, txt] of expoLines(g)) { const li = document.createElement('li'); const b = document.createElement('b'); b.textContent = lab + ': '; li.append(b, txt); ul.append(li); }
    { const r = raisedLine(g, st.bulletin); if (r) { const li = document.createElement('li'); const b = document.createElement('b'); b.textContent = r[0] + ': '; li.append(b, r[1]); ul.append(li); } }
    try {
      const bb = brief(zone, st);
      const a = bb.at && bb.at(g.elevMax);
      if (a && a.level) { const li = document.createElement('li'); const b = document.createElement('b'); b.textContent = 'Today here: '; const c = document.createElement('span'); c.className = 'sw-dchip'; c.style.background = DCOL[a.level]; c.textContent = a.level; li.append(b, c, ` ${a.rating} (${a.where})`); ul.append(li); }
      if (bb.tm && bb.tm.sun.get(g)) {
        const v = bb.tm.sun.get(g); const li = document.createElement('li'); const b = document.createElement('b'); b.textContent = 'Timing: ';
        li.append(b, `about ${v.time}` + (v.hits.length ? `, sun on ${v.hits.map((h) => h[0]).join(' and ')}` : '') + (v.hits.length && v.warm && v.late ? ', warm day: wet-snow risk' : ''));
        ul.append(li);
      }
      const pt = bb.all.find((q) => q.sec === g);
      if (pt && pt.match) { const li = document.createElement('li'); const b = document.createElement('b'); b.textContent = pt.match[0].toUpperCase() + pt.match.slice(1); li.append(b); ul.append(li); }
    } catch (e) { /* the brief needs bulletin data; the callout works without it */ }
    // previous / next step through the sections the Show filter lets through (high-consequence only by default)
    const list = secs.map((sec, k) => k).filter((k) => visible(st, secs[k]));
    const pos = list.indexOf(i);
    const before = list.filter((k) => k < i), after = list.filter((k) => k > i);
    const nav = document.createElement('div'); nav.className = 'sw-co-nav';
    const prev = document.createElement('button'); prev.type = 'button'; prev.className = 'sw-co-btn'; prev.textContent = '‹ Previous'; prev.disabled = !before.length;
    prev.onclick = () => selectSection(zone, before[before.length - 1], { zoom: true });
    const count = document.createElement('span');
    const what = showOf(st).highOnly ? 'high-consequence' : 'shown';
    count.textContent = !list.length ? `No ${what} sections` : pos >= 0 ? `${pos + 1} of ${list.length} ${what}` : `${list.length} ${what}`;
    const next = document.createElement('button'); next.type = 'button'; next.className = 'sw-co-btn'; next.textContent = 'Next ›'; next.disabled = !after.length;
    next.onclick = () => selectSection(zone, after[0], { zoom: true });
    nav.append(prev, count, next);
    co.append(head, sub, ul, nav);
  };
  const placeCallout = (sel, host, zone, st, pts) => {
    const co = calloutFor(host);
    fillCallout(co, zone, st);
    co.hidden = false;
    const g = st.res.sections[st.sel];
    const seg = pts.filter((p) => p.s.d >= g.start && p.s.d <= g.end);
    if (!seg.length) { co.hidden = true; return; }
    const cw = host.clientWidth, ch = host.clientHeight, w = co.offsetWidth, h = co.offsetHeight;
    const bx0 = d3.min(seg, (p) => p.x), bx1 = d3.max(seg, (p) => p.x), by0 = d3.min(seg, (p) => p.y), by1 = d3.max(seg, (p) => p.y);
    const mid = seg[Math.floor(seg.length / 2)], cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2, gap = 30, pad = 6;
    const clampX = (v) => Math.max(pad, Math.min(cw - w - pad, v)), clampY = (v) => Math.max(pad, Math.min(ch - h - pad, v));
    const cands = [
      [bx1 + gap, cy - h / 2], [bx0 - gap - w, cy - h / 2], [cx - w / 2, by0 - gap - h], [cx - w / 2, by1 + gap],
      [bx1 + gap, by0 - gap - h], [bx0 - gap - w, by0 - gap - h], [bx1 + gap, by1 + gap], [bx0 - gap - w, by1 + gap],
      [pad, pad], [cw - w - pad, pad], [pad, ch - h - pad], [cw - w - pad, ch - h - pad],
    ].map(([x, y]) => [clampX(x), clampY(y)]);
    const thin = pts.filter((_, k) => k % 2 === 0);
    let best = null;
    for (const [x, y] of cands) {
      const inR = (p, m) => p.x >= x - m && p.x <= x + w + m && p.y >= y - m && p.y <= y + h + m;
      const overSec = seg.filter((p) => inR(p, 10)).length;
      const overRoute = thin.filter((p) => inR(p, 8)).length;
      const dist = Math.hypot(x + w / 2 - cx, y + h / 2 - cy);
      const score = overSec * 1000 + overRoute * 40 + dist / 20;
      if (!best || score < best.score) best = { x, y, score };
    }
    co.style.left = best.x + 'px'; co.style.top = best.y + 'px';
    // leader line from the card to the middle of the section
    const lx = Math.max(best.x, Math.min(best.x + w, mid.x)), ly = Math.max(best.y, Math.min(best.y + h, mid.y));
    if (Math.hypot(lx - mid.x, ly - mid.y) > 4) {
      sel.append('line').attr('x1', lx).attr('y1', ly).attr('x2', mid.x).attr('y2', mid.y).attr('stroke', '#1A1A1A').attr('stroke-width', 1.5).attr('stroke-dasharray', '3 3');
    }
    sel.append('circle').attr('cx', mid.x).attr('cy', mid.y).attr('r', 5).attr('fill', '#fff').attr('stroke', '#1A1A1A').attr('stroke-width', 2);
  };

  // choose a section (or none): highlight it, sync the list, show the callout; optionally bring the map to it
  const selectSection = (zone, i, opt = {}) => {
    const st = byZone[zone];
    if (!st || !st.res) return;
    st.sel = i === null || i === undefined ? null : Math.max(0, Math.min(st.res.sections.length - 1, i));
    dash.draw('route-rows');
    const card = cardOf(zone), mapEl = card && card.querySelector('.sw-map'), m = mapEl && window.swMaps.get(mapEl);
    if (!m) return;
    const sec = st.sel === null ? null : st.res.sections[st.sel];
    const zoom = () => { if (sec) m.zoomTo(...sec.box.map((v, k) => v + (k < 2 ? -8 : 8))); m.redraw(); };
    if (!opt.scroll || !sec) { if (opt.zoom && sec) zoom(); else m.redraw(); return; }
    const r = mapEl.getBoundingClientRect();
    if (r.top >= 0 && r.bottom <= (window.innerHeight || document.documentElement.clientHeight)) { zoom(); return; }
    mapEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    let done = false;
    const go = () => { if (!done) { done = true; zoom(); } };
    window.addEventListener('scrollend', go, { once: true, capture: true });
    document.addEventListener('scrollend', go, { once: true, capture: true });
    setTimeout(go, 600);
  };

  const zoomToRoute = (zone) => {
    const st = byZone[zone], card = cardOf(zone);
    const row = terrainRows().find((r) => r.zone === zone);
    if (!st || !card || !row) return;
    const z = C.zoneOfCrs(row.crs);
    const cr = st.route.points.map((p) => { const [x, y] = C.utm(p.lat, p.lon, z); return [(x - row.x0) / row.cell_m, (row.y0 - y) / row.cell_m]; });
    const m = window.swMaps.get(card.querySelector('.sw-map'));
    if (m) m.zoomTo(d3.min(cr, (p) => p[0]), d3.min(cr, (p) => p[1]), d3.max(cr, (p) => p[0]), d3.max(cr, (p) => p[1]));
  };

  // load the fine terrain blocks the route passes through
  const askBlocks = (zone) => {
    const st = byZone[zone], card = cardOf(zone);
    const row = terrainRows().find((r) => r.zone === zone);
    if (!st || !card || !row || !row.detail) return;
    const det = JSON.parse(row.detail), z = C.zoneOfCrs(row.crs);
    const hit = new Set();
    const pad = row.cell_m > det.cell_m * 2 ? BUF : 0;
    for (const p of st.route.points) {
      const [x, y] = C.utm(p.lat, p.lon, z);
      for (const [dx, dy] of [[0, 0], [-pad, -pad], [pad, -pad], [-pad, pad], [pad, pad]]) {
        const fc = (x + dx - row.x0) / det.cell_m, fr = (row.y0 - (y + dy)) / det.cell_m;
        hit.add(`${Math.floor(fr / det.block)},${Math.floor(fc / det.block)}`);
      }
    }
    for (const mk of card.querySelectorAll('[data-rc]')) if (hit.has(mk.dataset.rc)) mk.hidden = false;
  };

  const showResults = (zone, on) => {
    const card = cardOf(zone);
    if (!card) return;
    for (const r of card.querySelectorAll('.sw-route')) r.hidden = !on;
    for (const b of card.querySelectorAll('.sw-route-clear, .sw-watchgpx, .sw-timing')) b.hidden = !on;
    const st = byZone[zone];
    if (on && st) {
      if (!st.start) st.start = defaultStart(zone);
      for (const i of card.querySelectorAll('.sw-start')) i.value = st.start;
      for (const i of card.querySelectorAll('.sw-pace')) i.value = String(st.pace || 1);
    }
  };

  for (const card of document.querySelectorAll('.sw-mapcard')) {
    const myZone = card.closest('[data-zone]').dataset.zone;
    for (const input of card.querySelectorAll('.sw-gpx')) {
      input.addEventListener('change', async () => {
        const file = input.files && input.files[0];
        input.value = '';
        if (!file) return;
        let route;
        try {
          route = C.parseGpx(await file.text());
          route.file = file.name;
        } catch (e) {
          byZone[myZone] = { error: e.message || 'Could not read this file.' };
          showResults(myZone, false);
          dash.draw('route-msg');
          return;
        }
        const rows = terrainRows();
        const best = rows.map((r) => ({ r, c: C.coverage(route.points, r) })).sort((a, b) => b.c - a.c)[0];
        if (!best || best.c < 0.05) {
          byZone[myZone] = { error: 'This route isn’t inside any of the map areas, so it can’t be checked here.' };
          showResults(myZone, false);
          dash.draw('route-msg');
          return;
        }
        const zone = best.r.zone;
        if (zone !== myZone) {
          byZone[myZone] = null;
          dash.draw('route-msg');
          const tab = document.querySelector(`.sw-tab[data-tab="${cardOf(zone).dataset.pfx}"]`);
          if (tab) tab.click();
        }
        byZone[zone] = { route, res: null, key: null, busy: true, sel: null };
        showResults(zone, true);
        askBlocks(zone);
        dash.draw('route-msg');
        setTimeout(() => { refresh(zone); zoomToRoute(zone); }, 30);
      });
    }
    for (const mapEl of card.querySelectorAll('.sw-map')) {
      mapEl.addEventListener('click', (ev) => {
        const st = byZone[myZone];
        if (!st || !st.res || !st.screen || ev.target.closest('.sw-callout')) return;
        const r = mapEl.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
        let near = null, nd = 14;
        for (const p of st.screen) { const d = Math.hypot(p.x - x, p.y - y); if (d < nd) { nd = d; near = p; } }
        if (!near) return;
        const i = st.res.sections.findIndex((g) => near.s.d >= g.start - 20 && near.s.d <= g.end + 20);
        if (i >= 0) selectSection(myZone, i);
      });
    }
    for (const b of card.querySelectorAll('.sw-route-clear')) {
      b.addEventListener('click', () => {
        byZone[myZone] = null;
        showResults(myZone, false);
        for (const n of card.querySelectorAll('.sw-watchgpx-note')) n.textContent = '';
        dash.draw('route-msg');
        const m = window.swMaps.get(card.querySelector('.sw-map'));
        if (m) m.redraw();
      });
    }
  }
  // ---- the route as a GPX for a watch, with a waypoint at the start of each flagged section ----
  // Suunto (and most watches) alert when you near a route waypoint. Suunto takes a <wpt> as a route
  // waypoint when its coordinates match a track point exactly, so each one is also inserted into the track.
  const xmlEsc = (t) => String(t).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
  const shortWhy = (sec) => {
    const w = sec.why.join(' ');
    if (/slope above/.test(w)) return 'slope above';
    if (/steep slope underfoot/.test(w)) return 'steep underfoot';
    if (/slope underfoot/.test(w)) return 'avy slope';
    if (/avalanche path/.test(w)) return 'avy path';
    if (/cliff/.test(w)) return 'cliff below';
    if (/glacier/.test(w)) return 'glacier';
    if (/wind-loaded/.test(w)) return 'wind slab';
    return 'hazard';
  };
  const typeOf = (sec) => {
    const w = sec.why.join(' ');
    if (/slope (above|underfoot)|avalanche path|wind-loaded/.test(w)) return 'Avalanche';
    if (/cliff/.test(w)) return 'Cliff';
    return 'Danger';
  };
  const buildWatchGpx = (zone) => {
    const st = byZone[zone];
    const row = terrainRows().find((r) => r.zone === zone);
    if (!st || !st.res || !row) return null;
    const z = C.zoneOfCrs(row.crs);
    const pts = st.route.points;
    const cum = [0];
    let prev = C.utm(pts[0].lat, pts[0].lon, z);
    for (let i = 1; i < pts.length; i++) { const q = C.utm(pts[i].lat, pts[i].lon, z); cum.push(cum[i - 1] + Math.hypot(q[0] - prev[0], q[1] - prev[1])); prev = q; }
    const secs = st.res.sections.map((sec, i) => ({ sec, n: i + 1 })).filter((o) => visible(st, o.sec)); // exactly the sections the Show filter shows
    // one marker per section start, placed on the route by distance
    const marks = secs.map((o) => {
      const d = o.sec.start;
      let i = cum.findIndex((c) => c >= d);
      if (i <= 0) i = i === 0 ? 0 : pts.length - 1;
      let lat, lon, ele;
      if (i === 0 || cum[i] === d) ({ lat, lon, ele } = pts[i]);
      else {
        const f = (d - cum[i - 1]) / (cum[i] - cum[i - 1]), a = pts[i - 1], b = pts[i];
        lat = a.lat + (b.lat - a.lat) * f; lon = a.lon + (b.lon - a.lon) * f;
        ele = Number.isFinite(a.ele) && Number.isFinite(b.ele) ? a.ele + (b.ele - a.ele) * f : NaN;
      }
      return { ...o, i, d, lat: lat.toFixed(6), lon: lon.toFixed(6), ele };
    });
    const lv = (s) => (s.kind === 'exposure' ? 'EXPOSED' : s.level === 2 ? 'HIGH' : 'CARE');
    const fmtM = d3.format(',');
    const wpts = marks.map((m) => {
      const s = m.sec;
      const name = `${lv(s)} ${m.n} ${shortWhy(s)}`;
      const desc = `${levelWord(s, true)}, km ${km2(s.start / 1000)}–${km2(s.end / 1000)} (${fmtM(Math.round(s.end - s.start))} m), ${fmtM(Math.round(s.elevMin))}–${fmtM(Math.round(s.elevMax))} m: ${s.why.join('; ')}.`;
      return `  <wpt lat="${m.lat}" lon="${m.lon}">${Number.isFinite(m.ele) ? `<ele>${m.ele.toFixed(1)}</ele>` : ''}<name>${xmlEsc(name)}</name><desc>${xmlEsc(desc)}</desc><type>${typeOf(s)}</type><sym>Danger Area</sym></wpt>`;
    });
    // the track, with each marker point inserted where it falls
    const byIdx = d3.group(marks, (m) => m.i);
    const trk = [];
    const tp = (lat, lon, ele) => `      <trkpt lat="${lat}" lon="${lon}">${Number.isFinite(ele) ? `<ele>${ele.toFixed(1)}</ele>` : ''}</trkpt>`;
    pts.forEach((p, i) => {
      const here = (byIdx.get(i) || []).slice().sort((a, b) => a.d - b.d);
      for (const m of here) if (!(cum[i] === m.d || i === 0)) trk.push(tp(m.lat, m.lon, m.ele));
      trk.push(tp(p.lat.toFixed(6), p.lon.toFixed(6), p.ele));
    });
    const title = (st.route.name || (st.route.file || 'Route').replace(/\.gpx$/i, '')).trim();
    const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Snow &amp; Avalanche Watch" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${xmlEsc(title)} – hazards</name><desc>Waypoints mark the start of each section shown by the route check's filter. A planning aid, not a substitute for the bulletin and judgement on the day.</desc></metadata>
${wpts.join('\n')}
  <trk><name>${xmlEsc(title)} – hazards</name>
    <trkseg>
${trk.join('\n')}
    </trkseg>
  </trk>
</gpx>
`;
    return { gpx, count: marks.length, base: title.replace(/[^\p{L}\p{N} _-]+/gu, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'route' };
  };
  // a .gpx can't be saved directly from the dashboard, so it goes inside a .zip (stored, no compression)
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const zipOne = (name, text) => {
    const data = new TextEncoder().encode(text), fn = new TextEncoder().encode(name);
    let crc = 0xffffffff; for (const b of data) crc = CRC[(crc ^ b) & 0xff] ^ (crc >>> 8); crc = (crc ^ 0xffffffff) >>> 0;
    const now = new Date(), dt = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff,
      dd = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;
    const lh = new DataView(new ArrayBuffer(30)), ch = new DataView(new ArrayBuffer(46)), eo = new DataView(new ArrayBuffer(22));
    const le = (v, o, x, n) => (n === 2 ? v.setUint16(o, x, true) : v.setUint32(o, x, true));
    [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, dt, 2], [12, dd, 2], [14, crc, 4], [18, data.length, 4], [22, data.length, 4], [26, fn.length, 2], [28, 0, 2]].forEach(([o, x, n]) => le(lh, o, x, n));
    [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, dt, 2], [14, dd, 2], [16, crc, 4], [20, data.length, 4], [24, data.length, 4], [28, fn.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, 0, 4]].forEach(([o, x, n]) => le(ch, o, x, n));
    const cdOff = 30 + fn.length + data.length, cdLen = 46 + fn.length;
    [[0, 0x06054b50, 4], [4, 0, 2], [6, 0, 2], [8, 1, 2], [10, 1, 2], [12, cdLen, 4], [16, cdOff, 4], [20, 0, 2]].forEach(([o, x, n]) => le(eo, o, x, n));
    return new Blob([lh, fn, data, ch, fn, eo], { type: 'application/zip' });
  };
  for (const card of document.querySelectorAll('.sw-mapcard')) {
    const myZone = card.closest('[data-zone]').dataset.zone;
    for (const b of card.querySelectorAll('.sw-watchgpx-btn')) {
      b.addEventListener('click', async () => {
        const note = card.querySelector('.sw-watchgpx-note');
        const out = buildWatchGpx(myZone);
        const say = (t) => { if (note) note.textContent = t; };
        if (!out) { say('Check a route first.'); return; }
        if (!out.count) { say(byZone[myZone].res.sections.length ? 'No sections match the Show options, so there are no hazard waypoints to add. Tick more of them (or All) and try again.' : 'No flagged sections on this route, so there are no hazard waypoints to add.'); return; }
        const fname = `${out.base}-hazards.gpx`;
        let dl = null;
        try { dl = window.claude && window.claude.use ? await window.claude.use('downloads') : null; } catch (e) { dl = null; }
        if (dl) {
          try {
            await dl.save({ filename: `${out.base}-hazards.zip`, data: zipOne(fname, out.gpx) });
            say(`Saved ${out.count} hazard waypoint${out.count === 1 ? '' : 's'}, as ${fname} inside a .zip (unzip it, then import the .gpx).`);
          } catch (e) {
            say(e && e.code === 'declined' ? 'Download cancelled.' : 'This view can’t save files; open the dashboard in claude.ai to download.');
          }
          return;
        }
        try {
          const url = URL.createObjectURL(new Blob([out.gpx], { type: 'application/gpx+xml' }));
          const a = document.createElement('a'); a.href = url; a.download = fname; document.body.append(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 5000);
          say(`Downloaded ${fname} with ${out.count} hazard waypoint${out.count === 1 ? '' : 's'}.`);
        } catch (e) { say('This view can’t save files; open the dashboard in claude.ai to download.'); }
      });
    }
  }
  window.swBuildWatchGpx = buildWatchGpx;
  window.swZipOne = zipOne;

  // start time and pace feed the timing in the brief
  for (const card of document.querySelectorAll('.sw-mapcard')) {
    const myZone = card.closest('[data-zone]').dataset.zone;
    const redrawBrief = () => {
      const st0 = byZone[myZone];
      if (st0 && applyConditions(myZone, st0)) { redrawAll(myZone); return; }
      for (const n of ['route-verdict', 'route-rows', 'route-conditions']) dash.draw(n);
      const st = byZone[myZone]; if (st) { const co = card.querySelector('.sw-callout'); if (co) co.dataset.key = ''; }
      const m = window.swMaps.get(card.querySelector('.sw-map')); if (m) m.redraw();
    };
    for (const i of card.querySelectorAll('.sw-start')) i.addEventListener('change', () => { const st = byZone[myZone]; if (st && i.value) { st.start = i.value; redrawBrief(); } });
    for (const i of card.querySelectorAll('.sw-pace')) i.addEventListener('change', () => { const st = byZone[myZone]; if (st) { st.pace = Number(i.value); redrawBrief(); } });
    for (const i of card.querySelectorAll('.sw-hz')) i.addEventListener('change', () => {
      const st = byZone[myZone]; if (!st) return;
      const v = showOf(st);
      if (i.value === 'all') { if (i.checked) Object.assign(v, { underfoot: true, overhead: true, other: true, highOnly: false }); else Object.assign(v, { underfoot: true, overhead: false, other: true, highOnly: false }); }
      else v[i.value] = i.checked;
      if (st.sel !== null && st.sel !== undefined && st.res && st.res.sections[st.sel] && !visible(st, st.res.sections[st.sel])) st.sel = null;
      redrawAll(myZone);
    });
  }

  // a change to the Terrain to watch filter re-tags the sections
  dash.onData(() => { for (const z of Object.keys(byZone)) if (byZone[z] && byZone[z].route) refresh(z); });



  const zoneOf = (el) => el.closest('[data-zone]').dataset.zone;

  // ---- the brief: route terrain + today's rating + recent and coming weather ----
  const ASPN = { NORTH: 'N', NORTHEAST: 'NE', EAST: 'E', SOUTHEAST: 'SE', SOUTH: 'S', SOUTHWEST: 'SW', WEST: 'W', NORTHWEST: 'NW' };
  const normAsp = (txt) => String(txt || '').split(',').map((a) => { const k = a.toUpperCase().replace(/[^A-Z]/g, ''); return ASPN[k] || k; })
    .filter((a) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'].includes(a));
  const ok = (id) => { const d = dash.data(id); return d.status === 'ok' ? d.data : null; };
  const RATING = ['no rating', 'low', 'moderate', 'considerable', 'high', 'very high'];

  // ---- timing: when you reach each part of the route, where the sun is then, and whether it's warm ----
  const ZONE_TZ = { 'Rogers Pass': 'America/Vancouver', Rossland: 'America/Vancouver', Whitewater: 'America/Vancouver', 'Kootenay Pass': 'America/Vancouver', 'Rocky Mountain NP': 'America/Denver', 'Vallter / Ulldeter': 'Europe/Madrid', Innsbruck: 'Europe/Vienna', Chamonix: 'Europe/Paris' };
  const RAD = Math.PI / 180;
  const tzOffMin = (tz, ms) => {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ms));
    const g = (k) => Number(p.find((x) => x.type === k).value);
    return (Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - ms) / 60000;
  };
  const zonedToUtc = (str, tz) => { // "YYYY-MM-DDTHH:MM" local at the map -> epoch ms
    const [d, t] = str.split('T'); const [y, mo, da] = d.split('-').map(Number); const [h, mi] = t.split(':').map(Number);
    const guess = Date.UTC(y, mo - 1, da, h, mi);
    let ms = guess - tzOffMin(tz, guess) * 60000;
    ms = guess - tzOffMin(tz, ms) * 60000;
    return ms;
  };
  const clock = (ms, tz) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
  const localDay = (ms, tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(ms));
  const defaultStart = (zone) => {
    const tz = ZONE_TZ[zone] || 'UTC';
    const d = new Date(zonedToUtc(localDay(Date.now(), tz) + 'T12:00', tz) + 86400000);
    return localDay(d.getTime(), tz) + 'T08:00';
  };
  const sunPos = (ms, lat, lon) => {
    const d = ms / 86400000 + 2440587.5 - 2451545.0;
    const g = ((357.529 + 0.98560028 * d) % 360) * RAD, q = (280.459 + 0.98564736 * d) % 360;
    const L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * RAD, e = (23.439 - 0.00000036 * d) * RAD;
    const RA = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)), dec = Math.asin(Math.sin(e) * Math.sin(L));
    const GMST = (18.697374558 + 24.06570982441908 * d) % 24;
    const H = (GMST * 15 + lon) * RAD - RA, la = lat * RAD;
    const elev = Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(H));
    const az = Math.atan2(-Math.sin(H), Math.tan(dec) * Math.cos(la) - Math.sin(la) * Math.cos(H));
    return { elev: elev / RAD, az: (az / RAD + 360) % 360 };
  };
  const ASPDEG = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };
  // how directly the sun strikes a slope: 1 = straight on, 0 = grazing or behind it
  const insolation = (sun, slopeDeg, asp) => {
    if (sun.elev <= 3 || ASPDEG[asp] === undefined) return 0;
    const e = sun.elev * RAD, sl = slopeDeg * RAD;
    return Math.max(0, Math.sin(e) * Math.cos(sl) + Math.cos(e) * Math.sin(sl) * Math.cos((sun.az - ASPDEG[asp]) * RAD));
  };
  const timing = (zone, st, ol) => {
    const tz = ZONE_TZ[zone] || 'UTC';
    if (!st.start) st.start = defaultStart(zone);
    const pace = Number(st.pace || 1);
    const t0 = zonedToUtc(st.start, tz);
    const S = st.res.samples;
    // Munter-style moving time: uphill (km + 100 m climbed) at 4 units/h, downhill (km + 200 m lost) at 10 units/h
    const T = new Float64Array(S.length); let hrs = 0, gain = 0, loss = 0;
    for (let i = 1; i < S.length; i++) {
      const a = S[i - 1], b = S[i];
      const km = (b.d - a.d) / 1000, dz = (b.elev ?? a.elev ?? 0) - (a.elev ?? b.elev ?? 0);
      if (dz > 0) gain += dz; else loss -= dz;
      hrs += dz >= -0.5 ? (km + Math.max(0, dz) / 100) / (4 * pace) : (km + -dz / 200) / (10 * pace);
      T[i] = hrs;
    }
    const at = (d) => { let i = d3.bisector((q) => q.d).left(S, d); i = Math.max(0, Math.min(S.length - 1, i)); return t0 + T[i] * 3600000; };
    // sunset at the route's middle
    const z = C.zoneOfCrs(terrainRows().find((r) => r.zone === zone).crs);
    const mid = st.route.points[Math.floor(st.route.points.length / 2)];
    let sunset = null;
    for (let m = 0; m < 24 * 60; m += 5) { const ms = zonedToUtc(localDay(t0, tz) + 'T00:00', tz) + m * 60000; if (m > 12 * 60 && sunPos(ms, mid.lat, mid.lon).elev < -0.8) { sunset = ms; break; } }
    // the day's forecast at the zone's first forecast point
    const day = localDay(t0, tz);
    const zol = (ol || []).filter((x) => x.zone === zone);
    const fc = zol.find((x) => x.date === day && x.point === (zol[0] || {}).point) || null;
    const warmAt = (elev) => {
      if (!fc) return null;
      const tAt = fc.temp_max_c === null ? null : fc.temp_max_c - 0.0065 * (elev - (fc.elevation_m || elev));
      return (fc.freezing_level_max_m !== null && fc.freezing_level_max_m >= elev) || (tAt !== null && tAt >= 1);
    };
    // sunny, warm, steep slopes reached late in the morning or after
    const sun = new Map();
    for (const sec of st.res.sections) {
      const ms = at(sec.start), hr = Number(clock(ms, tz).slice(0, 2)) + Number(clock(ms, tz).slice(3)) / 60;
      const p = S.find((q) => q.d >= sec.start && q.d <= sec.end && !q.outside && q.under === sec.under) || S.find((q) => q.d >= sec.start && !q.outside) || S[0];
      const [lat, lon] = [st.route.points[0].lat, st.route.points[0].lon];
      const sp = sunPos(ms, lat, lon);
      const hits = [];
      if (sec.under >= 30 && p.underAsp && insolation(sp, sec.under, p.underAsp) >= 0.55) hits.push(['the slope you are on', p.underAsp]);
      if (sec.over && insolation(sp, sec.over.slope, sec.over.asp) >= 0.55) hits.push(['the start zone above', sec.over.asp]);
      const warm = warmAt(sec.elevMax);
      sun.set(sec, { ms, time: clock(ms, tz), hits, warm, late: hr >= 10.5 });
    }
    // rain on snow: wet day with the freezing level above the whole route
    const top = d3.max(S, (q) => q.elev) || 0;
    const rain = fc && fc.precip_mm >= 2 && fc.freezing_level_max_m !== null && fc.freezing_level_max_m > top;
    return { tz, t0, end: t0 + hrs * 3600000, hrs, gain, loss, sunset, fc, day, sun, rain, top, clock: (ms) => clock(ms, tz), atD: at, warmAt };
  };
  const hm = (h) => `${Math.floor(h)} h ${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;

  // ---- today's rating at a given elevation ----
  // Avalanche Canada rates alpine / treeline / below treeline without heights; these are the rough
  // heights of those bands here (treeline wanders by aspect and valley, so it's approximate).
  const BANDS_M = { 'Rogers Pass': [1800, 2100], Rossland: [1700, 2000], Whitewater: [1700, 2000], 'Kootenay Pass': [1700, 2000], 'Rocky Mountain NP': [3300, 3500] };
  const DCOL = ['#9A9A9A', '#4DB848', '#FFE600', '#F7941E', '#E8222A', '#231F20'];
  const bandRater = (zone, rated) => {
    const by = (b) => rated.find((x) => x.band === b);
    const up = by('upper'), mid = by('middle'), lo = by('lower');
    const pack = (r, where) => (r ? { level: Number(r.level) || 0, rating: r.rating, band: r.band, where } : { level: 0, rating: 'no rating', band: null, where });
    let fn;
    if (mid || (up && lo && BANDS_M[zone] && !/\d/.test(up.band_label || ''))) {
      const [b1, b2] = BANDS_M[zone] || [1800, 2100];
      fn = (e) => (e >= b2 ? pack(up, 'alpine') : e >= b1 ? pack(mid || up, 'treeline') : pack(lo, 'below treeline'));
      fn.approx = `alpine taken as above about ${fmt(b2)} m and treeline from about ${fmt(b1)} m here`;
    } else if (up && lo) {
      const m = /(\d[\d.,]*)\s*m/.exec(up.band_label || '');
      const t = m ? Number(m[1].replace(/[.,]/g, '')) : ((window.swAlpine || {})[zone] || 2000);
      fn = (e) => (e >= t ? pack(up, `above ${fmt(t)} m`) : pack(lo, `below ${fmt(t)} m`));
      if (!m) fn.approx = `the treeline taken as about ${fmt(t)} m`;
    } else {
      const r = up || mid || lo || rated[0];
      fn = () => pack(r, 'at all elevations');
    }
    return fn;
  };
  window.swDangerColours = DCOL;

  const brief = (zone, st) => {
    const r = st.res;
    const sd = ok('stations_daily') || [], ol = ok('outlook') || [];
    const { rated, probs, forecastName } = bulletinFor(zone, st);
    const inside = r.samples.filter((s) => !s.outside);
    const eMin = d3.min(inside, (s) => s.elev), eMax = d3.max(inside, (s) => s.elev);

    // which rating applies at each elevation the route reaches
    let thr = null;
    const upper = rated.find((x) => x.band === 'upper'), lower = rated.find((x) => x.band === 'lower');
    if (upper) { const m = /(\d[\d.,]*)\s*m/.exec(upper.band_label || ''); if (m) thr = Number(m[1].replace(/[.,]/g, '')); }
    const at = bandRater(zone, rated);
    const danger = d3.max(inside, (s) => at(s.elev).level) || 0;
    const dangerAt = (sec) => (rated.length ? Math.max(at(sec.elevMin).level, at(sec.elevMax).level) : 0);
    // distance in each rated band, for the conditions list
    const byBand = new Map();
    for (const s of inside) { const a = at(s.elev); if (!a.level) continue; const k = a.band; const o = byBand.get(k) || { ...a, m: 0 }; o.m += window.swRouteCore.STEP; byBand.set(k, o); }

    // how exposed the route is, by terrain alone
    const hiFrac = r.total ? r.highLen / r.total : 0;
    const exposure = r.highLen === 0 && r.cautionLen < 300 ? 'low' : (r.highLen > 1000 || hiFrac > 0.2 ? 'high' : 'moderate');
    const pl = (n, w, ws) => `${n} ${n === 1 ? w : ws || w + 's'}`;
    const G = r.sections.filter((g) => g.kind === 'ground'), A = r.sections.filter((g) => g.kind === 'above'), E = r.sections.filter((g) => g.kind === 'exposure');
    const nG2 = G.filter((g) => g.level === 2).length, nA2 = A.filter((g) => g.level === 2).length;
    const aboveTxt = A.length ? `, and passes under ${pl(A.length, 'slope')} that today’s conditions could bring down on you` : '';
    const expText = {
      low: 'it stays almost entirely off avalanche terrain' + aboveTxt,
      moderate: `it puts you on avalanche terrain you could trigger in ${pl(G.length, 'place')}, ${nG2 ? nG2 + ' of them' : 'none of them'} high-consequence` + aboveTxt,
      high: `it spends a lot of time in avalanche terrain: ${km(r.highLen / 1000)} km of high-consequence ground (${pl(nG2, 'section')} on the slope${nA2 ? `, ${nA2} from above` : ''})`,
    }[exposure];

    const extras = [];
    const expoTxt = E.length ? ` It passes under slopes above in ${pl(E.length, 'place')}${danger ? ' where today’s data gives no reason for them to release; still cross those one at a time and don’t stop underneath' : ', which can’t be judged until a danger rating is out'}.` : '';
    if (r.pathsCrossed) extras.push(`crosses ${r.pathsCrossed} mapped avalanche path${r.pathsCrossed === 1 ? '' : 's'}`);
    const windSecs = r.sections.filter((g) => g.windLoaded).length;
    if (windSecs && r.windActive) extras.push(`passes ${windSecs} likely wind-loaded spot${windSecs === 1 ? '' : 's'}`);
    if (r.glacierLen >= 50) extras.push(`travels ${km2(r.glacierLen / 1000)} km on glacier ice${r.glacierNames.length ? ' (' + r.glacierNames.slice(0, 2).join(', ') + ')' : ''}, so plan for crevasses: rope up, carry rescue gear and know how to use it`);
    const extraTxt = expoTxt + (extras.length ? ` It also ${extras.join(' and ')}.` : '');
    let verdict, tone;
    if (!danger) {
      tone = exposure === 'high' ? 2 : exposure === 'moderate' ? 1 : 0;
      verdict = `No avalanche danger rating is in force for this area yet, so this is a terrain-only read: ${expText}.`;
    } else if (danger >= 4) {
      tone = 3;
      verdict = exposure === 'low'
        ? `${RATING[danger][0].toUpperCase() + RATING[danger].slice(1)} danger. The route keeps mostly off avalanche terrain, but large natural avalanches can run far: check every runout you pass under, or wait.`
        : `Avoid this route today: ${RATING[danger]} danger, and ${expText}.`;
    } else if (danger === 3) {
      tone = exposure === 'low' ? 1 : exposure === 'moderate' ? 2 : 3;
      verdict = {
        low: 'Considerable danger, but the route keeps mostly off avalanche terrain. Manageable with care at the flagged spots.',
        moderate: `Serious today: considerable danger, and ${expText}. Know where those are, cross them one at a time, and set a turnaround point.`,
        high: `Very serious today: considerable danger, and ${expText}. This is the combination behind most avalanche accidents; go only with an expert assessment, or choose a simpler line.`,
      }[exposure];
    } else if (danger === 2) {
      tone = exposure === 'high' ? 2 : exposure === 'moderate' ? 1 : 0;
      verdict = {
        low: 'Moderate danger and little avalanche terrain on the route: generally favourable.',
        moderate: `Moderate danger, and ${expText}. Careful route-finding at those points, especially where the bulletin's problems apply.`,
        high: `Demanding: moderate danger, but ${expText}. Assess the key slopes carefully on the day.`,
      }[exposure];
    } else {
      tone = exposure === 'high' ? 1 : 0;
      verdict = exposure === 'high'
        ? `Low danger, but ${expText}. Isolated instabilities remain possible on the steepest flagged slopes.`
        : 'Low danger and limited avalanche terrain: generally favourable.';
    }

    verdict += extraTxt;
    if (windSecs && r.windActive && tone < 3 && danger >= 2) tone = Math.min(3, tone + 1);

    // the danger points: worst first, those matching today's problems ahead of others
    const probAsp = new Set(probs.flatMap((p) => normAsp(p.aspects)));
    const secAsp = (sec) => {
      const a = new Set();
      for (const s of inside) if (s.d >= sec.start && s.d <= sec.end) {
        if (s.under >= 30 && s.underAsp) a.add(s.underAsp);
        if (s.over && s.over.asp) a.add(s.over.asp);
      }
      return a;
    };
    const points = r.sections.map((sec) => {
      const asp = secAsp(sec);
      const hitAsp = [...asp].filter((a) => probAsp.has(a));
      const d = dangerAt(sec);
      let match = '';
      if (probs.length && hitAsp.length) match = `matches today's ${probs.map((p) => p.problem.toLowerCase()).join(' / ')} on ${hitAsp.join(', ')} aspects`;
      else if (thr && upper && sec.elevMax >= thr && Number(upper.level) > Number(lower ? lower.level : 0)) match = `in the band rated ${String(upper.rating).toLowerCase()} (${upper.band_label.toLowerCase()})`;
      return { sec, d, match, score: sec.level * 10 + (match ? 5 : 0) + d + (sec.end - sec.start) / 1000 };
    });
    // every high-consequence section, in route order; with none, the three that matter most
    const highs = points.filter((p) => p.sec.level === 2).sort((a, b) => a.sec.start - b.sec.start);
    const shown = highs.length ? highs : points.slice().sort((a, b) => b.score - a.score).slice(0, 3);
    const pointsNote = highs.length ? '' : 'No high-consequence sections on this route. The sections that most need care:';

    // conditions: recent snow, wind, warmth, and what's coming
    const zrows = sd.filter((x) => x.zone === zone);
    const lastDay = d3.max(zrows, (x) => x.date);
    const days = (n) => { if (!lastDay) return []; const d0 = new Date(lastDay); d0.setUTCDate(d0.getUTCDate() - (n - 1)); const iso = d0.toISOString().slice(0, 10); return zrows.filter((x) => x.date >= iso); };
    const cond = [];
    const depthSt = d3.greatest(d3.groups(zrows.filter((x) => x.snow_depth_cm !== null), (x) => x.station), (g) => d3.max(g[1], (x) => x.snow_depth_cm));
    if (depthSt) {
      const name = depthSt[0];
      const recent = days(3).filter((x) => x.station === name);
      const gained = d3.sum(recent, (x) => Math.max(0, x.depth_change_cm || 0));
      const latest = d3.greatest(depthSt[1], (x) => x.date);
      cond.push(`${latest.snow_depth_cm} cm on the ground at ${name}${gained >= 2 ? `, ${gained} cm gained in the last 3 days` : ', no new snow in the last 3 days'}.`);
    }
    const wsd = ok('wind_summary') || [];
    const w = wsd.find((x) => x.zone === zone);
    if (w && w.transport_hours) {
      const la = w.loaded_aspects.split(','); const loaded = la.length > 1 ? la.slice(0, -1).join(', ') + ' and ' + la[la.length - 1] : la[0];
      cond.push(`Winds mostly from the ${w.from_dir} in the last 3 days, ${w.transport_hours} h strong enough to move snow, gusts to ${w.max_gust_kmh} km/h at ${w.station}` +
        (window.swWindActive(w) ? `: fresh slabs likely on ${loaded}-facing slopes below ridges.` : `; little snow to move yet, but ${loaded} slopes will load first once it snows.`));
    } else if (w) cond.push(`Light winds in the last 3 days at ${w.station}: little wind transport.`);
    const warm = d3.greatest(days(1).filter((x) => x.temp_max_c !== null), (x) => x.elevation_m);
    if (warm && warm.temp_max_c >= 2) cond.push(`Highs of ${d3.format('.1f')(warm.temp_max_c)} °C at ${warm.station}: expect wet snow to weaken on sun-exposed slopes as the day warms.`);
    const zol = ol.filter((x) => x.zone === zone);
    const ahead = zol.filter((x) => x.point === (zol[0] || {}).point).slice(0, 3); // the zone's first forecast point
    const snowAhead = d3.sum(ahead.slice(0, 2), (x) => x.snowfall_cm || 0);
    const gustAhead = d3.max(ahead.slice(0, 2), (x) => x.gust_max_kmh);
    if (snowAhead >= 5) cond.push(`${d3.format('.0f')(snowAhead)} cm of new snow forecast over the next 2 days: danger is likely to rise.`);
    if (gustAhead >= 60) cond.push(`Forecast gusts to ${Math.round(gustAhead)} km/h: fresh wind slabs likely.`);
    // field reports near the route (Rogers Pass)
    const reps = (ok('avalanche_reports') || []).filter((x) => x.zone === zone && x.id && (x.avalanches > 0 || x.signs || x.kind === 'incident'));
    if (reps.length) {
      const zn = Number(String(st.res.zoneCrs || '').slice(-2)) || (['Rogers Pass', 'Rossland', 'Whitewater', 'Kootenay Pass'].includes(zone) ? 11 : zone === 'Rocky Mountain NP' ? 13 : zone === 'Chamonix' ? 32 : 31);
      const near = reps.map((x) => {
        const [ex, ny] = window.swRouteCore.utm(x.lat, x.lon, zn);
        let best = Infinity;
        for (const sm of inside) { const dd = Math.hypot(sm.x - ex, sm.y - ny); if (dd < best) best = dd; }
        return { x, d: best };
      }).filter((o) => o.d <= 2000).sort((a, b) => (a.x.date < b.x.date ? 1 : -1));
      if (near.length) {
        const av = near.filter((o) => o.x.avalanches > 0);
        cond.push(`${near.length} field report${near.length === 1 ? '' : 's'} within 2 km of the route in the last 30 days${av.length ? `, ${av.length} with avalanches` : ''}; latest: ${near[0].x.title} (${near[0].x.date}, ${Math.round(near[0].d / 100) / 10} km away). See the Recent avalanches tab.`);
      } else cond.push('No avalanche or warning-sign reports within 2 km of the route in the last 30 days (reports are sparse; this is not an all-clear).');
    }
    if (!rated.length) cond.unshift(forecastName ? `Forecast for this route: ${forecastName}. No danger rating in force yet.` : 'No bulletin rating yet; check the forecasters’ notes above before you go.');
    else cond.unshift(`${forecastName ? 'Forecast for this route, ' + forecastName : 'Bulletin for ' + zone}: ${rated.map((x) => `${String(x.band_label).toLowerCase()} ${String(x.rating).toLowerCase()}`).join(', ')}${probs.length ? '; problems: ' + probs.map((p) => p.problem.toLowerCase() + (p.aspects ? ` (${p.aspects})` : '')).join(', ') : ''}.`);

    if (byBand.size) {
      const order = ['upper', 'middle', 'lower'];
      const bits = [...byBand.values()].sort((a, b) => order.indexOf(a.band) - order.indexOf(b.band))
        .map((o) => `${km(o.m / 1000)} km ${o.where} rated ${String(o.rating).toLowerCase()}`);
      cond.splice(1, 0, `By elevation: ${bits.join(', ')}.${at.approx ? ` (${at.approx})` : ''}`);
    }
    let tm = null;
    try { tm = timing(zone, st, ol); } catch (e) { tm = null; }
    if (tm) {
      const lines = [];
      const paceWord = { 0.8: 'relaxed', 1: 'steady', 1.25: 'fast' }[Number(st.pace || 1)] || 'steady';
      lines.push(`Timing (${paceWord} pace): start ${tm.clock(tm.t0)}, about ${hm(tm.hrs)} moving for ${fmt(Math.round(tm.gain))} m up and ${fmt(Math.round(tm.loss))} m down, back about ${tm.clock(tm.end)}` +
        (tm.sunset ? `; sunset ${tm.clock(tm.sunset)}${tm.end > tm.sunset - 30 * 60000 ? ' — that leaves no margin: start earlier or shorten the route' : ''}` : '') + '. Moving time only; add stops.');
      if (!tm.fc) lines.push('No forecast yet for that day, so warming can’t be checked.');
      else {
        const late = [...tm.sun.entries()].filter(([sec, v]) => v.hits.length && v.warm && v.late);
        const warmDay = tm.fc.freezing_level_max_m !== null && tm.fc.freezing_level_max_m > d3.min(inside, (q) => q.elev);
        if (late.length) {
          lines.push(`Warm sun on avalanche slopes: you reach ${late.length} sunny, steep section${late.length === 1 ? '' : 's'} from late morning on a warm day (freezing level up to ${fmt(tm.fc.freezing_level_max_m)} m): ` +
            late.slice(0, 4).map(([sec, v]) => `km ${km(sec.start / 1000)} at ${v.time} (${v.hits.map((h) => h[1]).join('/')}-facing)`).join(', ') +
            '. Wet-snow avalanches get more likely as these warm: be off them earlier, or choose shaded aspects.');
        } else if (warmDay) lines.push(`Warm day (freezing level up to ${fmt(tm.fc.freezing_level_max_m)} m), but your timing keeps you off sun-warmed avalanche slopes from late morning on. Watch for wet snow if you run late.`);
        else lines.push(`Cold at your elevations that day (freezing level up to ${tm.fc.freezing_level_max_m === null ? '—' : fmt(tm.fc.freezing_level_max_m) + ' m'}): sun-warming isn’t the main concern.`);
        if (tm.rain) lines.push(`Rain likely on snow: ${fmt(tm.fc.precip_mm)} mm forecast with the freezing level above the top of your route (${fmt(Math.round(tm.top))} m). Wet loose and slab avalanches are likely; this is a day to stay off avalanche terrain.`);
      }
      cond.push(...lines);
    }
    return { verdict, tone, points: shown, all: points, pointsNote, cond, at, tm };
  };

  dash.draw('route-verdict', (el) => {
    const st = byZone[zoneOf(el)];
    if (!st || !st.res) { el.textContent = '—'; el.className = 'sw-brief-verdict'; return; }
    const b = brief(zoneOf(el), st);
    el.className = 'sw-brief-verdict sw-tone' + b.tone;
    el.textContent = b.verdict;
  });
  dash.draw('route-conditions', (ul) => {
    ul.replaceChildren();
    const st = byZone[zoneOf(ul)];
    if (!st || !st.res) return;
    for (const c of brief(zoneOf(ul), st).cond) { const li = document.createElement('li'); li.textContent = c; ul.append(li); }
  });

  dash.draw('route-msg', (el) => {
    const st = byZone[zoneOf(el)];
    if (!st) { el.textContent = ''; return; }
    if (st.error) { el.textContent = st.error; return; }
    if (st.busy || !st.res) { el.textContent = 'Checking the route…'; return; }
    el.textContent = (st.route.name || st.route.file || 'Route') + ' loaded.';
  });

  dash.draw('route-summary', (el) => {
    const st = byZone[zoneOf(el)];
    if (!st || !st.res) { el.textContent = '—'; return; }
    const r = st.res, secs = r.sections;
    const nG = secs.filter((g) => g.kind === 'ground').length, nA = secs.filter((g) => g.kind === 'above').length, nE = secs.filter((g) => g.kind === 'exposure').length;
    const n2 = secs.filter((g) => g.level === 2).length, n1 = secs.filter((g) => g.level === 1 && g.kind !== 'exposure').length;
    let txt = `${km(r.total / 1000)} km checked. `;
    if (!secs.length) txt += 'No sections cross or sit under avalanche terrain, by the terrain model. ';
    else {
      const nX = secs.filter((g) => g.kind === 'other').length;
      txt += (n2 ? `${km2(r.highLen / 1000)} km is high-consequence in ${n2} section${n2 === 1 ? '' : 's'}, and ` : 'No high-consequence sections; ') + `${km2(r.cautionLen / 1000)} km needs care in ${n1}${n2 ? ' more' : ''}. ` +
        `By source: ${nG} on the slope, ${nA} from slopes above raised by today’s conditions, ${nE} more under slopes above (${km2(r.exposureLen / 1000)} km of exposure), ${nX} cliff or glacier only. `;
      const today = secs.filter((g) => g.today).length;
      if (r.watchOn) txt += today ? `${today} section${today === 1 ? '' : 's'} match today’s Terrain to watch filter. ` : 'None match today’s Terrain to watch filter. ';
    }
    if (r.pathsCrossed) txt += `Crosses ${r.pathsCrossed} mapped avalanche path${r.pathsCrossed === 1 ? '' : 's'}. `;
    if (r.glacierLen) txt += `${km2(r.glacierLen / 1000)} km on glacier ice${r.glacierNames.length ? ' (' + r.glacierNames.slice(0, 3).join(', ') + ')' : ''}. `;
    if (r.fineShare > 0) txt += `Checked on ${r.fineCell || 5} m terrain for ${Math.round(r.fineShare * 100)}% of the route. `;
    if (r.outsideShare > 0.005) txt += `${Math.round(r.outsideShare * 100)}% of the route runs outside the map and wasn’t checked.`;
    el.textContent = txt.trim();
  });

  dash.draw('route-profile', (el) => {
    el.replaceChildren();
    const st = byZone[zoneOf(el)];
    if (!st || !st.res) return;
    const S = st.res.samples.filter((s) => !s.outside);
    if (S.length < 2) return;
    const Wd = Math.max(280, el.clientWidth), Hd = 180;
    const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${Wd} ${Hd}`);
    const y0 = d3.scaleLinear(d3.extent(S, (s) => s.elev), [1, 0]).nice();
    const lw = d3.max(y0.ticks(4), (t) => { const tx = svg.append('text').text(fmt(t)); const w = tx.node().getComputedTextLength(); tx.remove(); return w; }) || 30;
    const m = { top: 12, right: 10, bottom: 24, left: lw + 10 };
    const w = Wd - m.left - m.right, h = Hd - m.top - m.bottom;
    const x = d3.scaleLinear([0, st.res.total / 1000], [0, w]);
    const y = d3.scaleLinear(d3.extent(S, (s) => s.elev), [h, 0]).nice();
    const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`);
    for (const sec of st.res.sections) {
      if (!visible(st, sec)) continue;
      g.append('rect').attr('x', x(sec.start / 1000)).attr('width', Math.max(1, x(sec.end / 1000) - x(sec.start / 1000)))
        .attr('y', 0).attr('height', h).attr('fill', colOf(sec.level, sec.kind)).attr('opacity', 0.35);
    }
    // today's danger at each point's elevation, as a strip along the top
    let at = null;
    try { const b = brief(zoneOf(el), st); if (b && b.at && S.some((q) => b.at(q.elev).level)) at = b.at; } catch (e) { at = null; }
    if (at) {
      for (let i = 1; i < S.length; i++) {
        const a = at(S[i].elev);
        g.append('rect').attr('x', x(S[i - 1].d / 1000)).attr('width', Math.max(0.5, x(S[i].d / 1000) - x(S[i - 1].d / 1000) + 0.3))
          .attr('y', -6).attr('height', 6).attr('fill', DCOL[a.level]);
      }
    }
    const ya = g.append('g').call(d3.axisLeft(y).ticks(4).tickSize(-w).tickFormat(fmt)).attr('font-size', null).attr('font-family', null);
    ya.select('.domain').remove(); ya.selectAll('.tick line').attr('stroke', 'var(--cds-chart-grid)'); ya.selectAll('.tick text').attr('dx', -4);
    const xa = g.append('g').attr('transform', `translate(0,${h})`)
      .call(d3.axisBottom(x).ticks(Math.max(2, Math.min(8, Math.floor(w / 70)))).tickFormat((v) => `${v} km`).tickSizeOuter(0))
      .attr('font-size', null).attr('font-family', null);
    xa.select('.domain').attr('stroke', 'var(--cds-chart-axis)'); xa.selectAll('.tick line').attr('stroke', 'var(--cds-chart-axis)');
    if (window.swTrim) window.swTrim(xa);
    g.append('path').attr('d', d3.line().x((s) => x(s.d / 1000)).y((s) => y(s.elev))(S)).attr('fill', 'none')
      .attr('stroke', dash.colors[0]).attr('stroke-width', 2).attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round');
    const tip = document.createElement('div'); tip.className = 'sw-tip'; tip.hidden = true; el.append(tip);
    const dot = g.append('circle').attr('r', 3.5).attr('fill', dash.colors[0]).attr('opacity', 0);
    g.append('rect').attr('width', w).attr('height', h).attr('fill', 'transparent')
      .on('pointermove', (ev) => {
        const [mx] = d3.pointer(ev);
        const dkm = x.invert(mx) * 1000;
        const s = S[Math.max(0, Math.min(S.length - 1, d3.bisector((q) => q.d).center(S, dkm)))];
        dot.attr('cx', x(s.d / 1000)).attr('cy', y(s.elev)).attr('opacity', 1);
        const lines = [{ text: `${fmt(Math.round(s.elev))} m · ${s.under}° underfoot` }];
        if (at) { const a = at(s.elev); if (a.level) lines.push({ text: `Today: ${a.rating} (${a.where})` }); }
        if (s.over) lines.push({ text: `${s.over.slope}° slope above at ${Math.round(s.over.alpha)}°` });
        if (s.cliff) lines.push({ text: 'Steep drop just below' });
        tip.replaceChildren();
        const hd = document.createElement('div'); hd.className = 'sw-tdate'; hd.textContent = `${km2(s.d / 1000)} km`; tip.append(hd);
        for (const l of lines) { const dv = document.createElement('div'); dv.textContent = l.text; tip.append(dv); }
        tip.hidden = false;
        const [px, py] = d3.pointer(ev, el);
        tip.style.left = Math.max(0, Math.min(el.clientWidth - tip.offsetWidth, px + 12)) + 'px';
        tip.style.top = Math.max(0, py - tip.offsetHeight - 8) + 'px';
      })
      .on('pointerleave', () => { tip.hidden = true; dot.attr('opacity', 0); });
  });

  dash.draw('route-rows', (tb) => {
    tb.replaceChildren();
    const zone = zoneOf(tb), st = byZone[zone];
    if (!st || !st.res) return;
    let b = null;
    try { b = brief(zone, st); } catch (e) { b = null; } // the brief needs bulletin data; the table works without it
    const line = (cell, lab, text, cls) => {
      const d = document.createElement('span'); d.className = 'sw-pt-line' + (cls ? ' ' + cls : '');
      if (lab) { const i = document.createElement('i'); i.textContent = lab + ': '; d.append(i); }
      d.append(text); cell.append(d);
    };
    const groups = [
      ['ground', 'On the slope: terrain you could trigger yourself'],
      ['above', 'From above: slopes that today’s conditions could bring down on you'],
      ['exposure', 'Under slopes above: exposure, not raised by today’s conditions'],
      ['other', 'Glacier ice and cliffs'],
    ];
    let shown = 0;
    for (const [kind, title] of groups) {
      const list = st.res.sections.map((sec, i) => [sec, i]).filter(([sec]) => sec.kind === kind && visible(st, sec));
      if (!list.length) continue;
      const gr = document.createElement('tr'); gr.className = 'sw-grp'; const gc = document.createElement('td'); gc.colSpan = 5; gc.textContent = `${title} (${list.length})`; gr.append(gc); tb.append(gr);
      for (const [sec, i] of list) {
      shown++;
      const tr = document.createElement('tr');
      tr.className = 'sw-sec' + (sec.kind === 'exposure' ? 'E' : sec.level);
      tr.setAttribute('aria-selected', String(st.sel === i));
      const td = (t, cls) => { const c = document.createElement('td'); if (t !== undefined) c.append(t); if (cls) c.className = cls; tr.append(c); return c; };
      td(String(i + 1));
      const kmc = td(`${km2(sec.start / 1000)}–${km2(sec.end / 1000)}`, 'sw-nowrap');
      const len = document.createElement('span'); len.className = 'sw-sub'; len.textContent = `${fmt(Math.round(sec.end - sec.start))} m long`; kmc.append(len);
      td(`${fmt(Math.round(sec.elevMin))}–${fmt(Math.round(sec.elevMax))}`, 'sw-num sw-nowrap');
      const lv = td(undefined, 'sw-nowrap'); const tag = document.createElement('span');
      tag.className = 'sw-lvl sw-lvl' + (sec.kind === 'exposure' ? 'E' : sec.level); tag.textContent = levelWord(sec); lv.append(tag);
      if (sec.expo) { const ex = document.createElement('div'); ex.className = 'sw-lv-expo'; ex.append(expoBadge(sec.expo)); lv.append(ex); }
      // what's there: underfoot / above / other, then today's danger, timing and the bulletin match
      const why = td(undefined, 'sw-why');
      for (const [l, t] of expoLines(sec)) line(why, l, t + '.');
      { const r = raisedLine(sec, st.bulletin); if (r) line(why, r[0], r[1] + '.', sec.raised && sec.raised.length ? 'sw-pt-match' : 'sw-sub'); }
      const pt = b && b.all.find((q) => q.sec === sec);
      if (b && b.at && pt && pt.d) {
        const a = b.at(sec.elevMax), lo = b.at(sec.elevMin);
        const chip = document.createElement('span'); chip.className = 'sw-dchip'; chip.style.background = DCOL[a.level]; chip.textContent = a.level || '–';
        const frag = document.createDocumentFragment();
        frag.append(chip, ` ${a.rating} (${a.where})` + (lo.level !== a.level && lo.level ? `, ${String(lo.rating).toLowerCase()} lower down` : '') + '.');
        line(why, 'Today here', frag);
      }
      const v = b && b.tm && b.tm.sun.get(sec);
      if (v) {
        const warn = v.hits.length && v.warm && v.late;
        line(why, 'Timing', `about ${v.time}` + (v.hits.length ? `; sun on ${v.hits.map((h) => h[0] + ' (' + h[1] + ')').join(' and ')}` : '; not in strong sun then') +
          (warn ? ', on a warm day: wet-snow risk rising.' : '.'), warn ? 'sw-pt-warm' : '');
      }
      if (pt && pt.match) line(why, '', pt.match[0].toUpperCase() + pt.match.slice(1) + '.', 'sw-pt-match');
      if (sec.today) { const t2 = document.createElement('span'); t2.className = 'sw-today'; t2.textContent = 'Today'; why.append(t2); }
      tr.tabIndex = 0;
      tr.setAttribute('aria-label', `Section ${i + 1}, km ${km2(sec.start / 1000)} to ${km2(sec.end / 1000)}: show on the map`);
      tr.onclick = () => selectSection(zone, i, { scroll: true });
      tr.onkeydown = (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); selectSection(zone, i, { scroll: true }); } };
      tb.append(tr);
      }
    }
    const hidden = st.res.sections.length - shown;
    if (!shown || hidden) {
      const tr = document.createElement('tr'); tr.className = 'sw-grp sw-hidden-note'; const td = document.createElement('td'); td.colSpan = 5;
      td.textContent = !st.res.sections.length ? 'No flagged sections on this route.'
        : `${shown ? '' : 'No sections match the Show options. '}${hidden} ${shown ? 'more ' : ''}section${hidden === 1 ? '' : 's'} hidden by the Show options${showOf(st).highOnly ? ' (untick “High-consequence only” to see take-care and exposure sections)' : ''}; tick “All” to see every section.`;
      tr.append(td); tb.append(tr);
    }
  });
})();

;

(() => {
  // phones: map layers and long explanations fold away; wider screens show them open
  const narrow = window.matchMedia('(max-width: 640px)');
  const fold = () => { for (const d of document.querySelectorAll('details.sw-layers, details.sw-how')) d.open = !narrow.matches; };
  fold();
  if (narrow.addEventListener) narrow.addEventListener('change', () => { fold(); dash.draw('map'); });
})();
(() => {
  const ASP = window.swASP;
  for (const card of document.querySelectorAll('.sw-mapcard')) {
    const pfx = card.dataset.pfx;
    const set = (o) => dash.setParams(Object.fromEntries(Object.entries(o).map(([k, v]) => [pfx + '_' + k, v])));
    for (const b of card.querySelectorAll('.sw-mode')) b.addEventListener('click', () => set({ mode: b.dataset.mode }));
    const aspects = () => [...card.querySelectorAll('.sw-asp')].filter((c) => c.checked).map((c) => c.value);
    for (const c of card.querySelectorAll('.sw-asp')) c.addEventListener('change', () => set({ aspects: aspects() }));
    for (const inp of card.querySelectorAll('.sw-emin, .sw-emax')) {
      inp.addEventListener('change', () => {
        const v = inp.value === '' ? null : Number(inp.value);
        if (v === null || (inp.validity.valid && Number.isFinite(v))) set({ [inp.classList.contains('sw-emin') ? 'emin' : 'emax']: v });
      });
    }
    const mapEl = () => card.querySelector('.sw-map');
    for (const b of card.querySelectorAll('.sw-zin')) b.addEventListener('click', () => window.swMaps.get(mapEl())?.zoomBy(1.8));
    for (const b of card.querySelectorAll('.sw-zout')) b.addEventListener('click', () => window.swMaps.get(mapEl())?.zoomBy(1 / 1.8));
    for (const b of card.querySelectorAll('.sw-zreset')) b.addEventListener('click', () => window.swMaps.get(mapEl())?.reset());
    const sizeButtons = () => {
      const big = card.classList.contains('sw-map-big');
      for (const x of card.querySelectorAll('.sw-expand')) x.hidden = big;
      for (const x of card.querySelectorAll('.sw-collapse')) x.hidden = !big;
    };
    // expanded: the map fills the whole screen (true full screen where the browser allows it,
    // otherwise the card covers the whole page; phones in particular often refuse full screen for a page)
    // Phones: the card moves to the top of the document (so nothing around it can shrink or clip it), is sized
    // in pixels to the visible screen, and redraws only once the size settles (no flicker as browser bars move).
    const narrow = () => window.matchMedia('(max-width: 640px)').matches;
    let home = null, lastH = 0, redrawT = null;
    const screenH = () => Math.round((window.visualViewport && window.visualViewport.height) || window.innerHeight);
    const fitBig = () => {
      if (!card.classList.contains('sw-map-big') || !home) return;
      const h = screenH();
      if (Math.abs(h - lastH) < 2) return;
      lastH = h;
      card.style.height = h + 'px';
      clearTimeout(redrawT); redrawT = setTimeout(() => dash.draw('map'), 150);
    };
    const portalIn = () => {
      // carry the theme and type across, in case they're set on a wrapper rather than the page
      const cs = getComputedStyle(card);
      for (let i = 0; i < cs.length; i++) { const k = cs[i]; if (k.startsWith('--')) card.style.setProperty(k, cs.getPropertyValue(k)); }
      for (const k of ['font-family', 'font-size', 'line-height', 'color']) card.style.setProperty(k, cs.getPropertyValue(k));
      if (!card.dataset.zone) card.dataset.zone = card.closest('[data-zone]').dataset.zone; // lookups by zone keep working
      home = document.createComment('map card');
      card.replaceWith(home);
      document.body.append(card);
      lastH = 0; fitBig();
      if (window.visualViewport) window.visualViewport.addEventListener('resize', fitBig);
    };
    const portalOut = () => {
      if (!home) return;
      if (window.visualViewport) window.visualViewport.removeEventListener('resize', fitBig);
      home.replaceWith(card); home = null;
      card.style.height = '';
    };
    const closeBig = () => {
      card.classList.remove('sw-map-big'); sizeButtons();
      document.documentElement.classList.remove('sw-noscroll');
      portalOut();
      if (document.fullscreenElement === card) document.exitFullscreen().catch(() => {}); else dash.draw('map');
    };
    for (const b of card.querySelectorAll('.sw-expand')) b.addEventListener('click', () => {
      card.classList.add('sw-map-big'); sizeButtons();
      document.documentElement.classList.add('sw-noscroll');
      const done = () => dash.draw('map');
      if (narrow() || !card.requestFullscreen) { portalIn(); window.scrollTo(0, 0); done(); return; }
      card.requestFullscreen({ navigationUI: 'hide' }).then(done, () => { portalIn(); done(); });
    });
    for (const b of card.querySelectorAll('.sw-collapse')) b.addEventListener('click', closeBig);
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && card.classList.contains('sw-map-big') && !document.fullscreenElement) closeBig(); });
    window.addEventListener('resize', () => {
      if (!card.classList.contains('sw-map-big')) return;
      if (home) fitBig(); else { clearTimeout(redrawT); redrawT = setTimeout(() => dash.draw('map'), 150); }
    });
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement && card.classList.contains('sw-map-big') && card.dataset.wasFs) { delete card.dataset.wasFs; closeBig(); return; }
      if (document.fullscreenElement === card) card.dataset.wasFs = '1';
      dash.draw('map');
    });
    for (const c of card.querySelectorAll('.sw-paths')) c.addEventListener('change', () => set({ paths: c.checked }));
    for (const c of card.querySelectorAll('.sw-obs')) c.addEventListener('change', () => set({ obs: c.checked }));
    for (const c of card.querySelectorAll('.sw-doc')) c.addEventListener('change', () => set({ doc: c.checked }));
    for (const c of card.querySelectorAll('.sw-topo')) c.addEventListener('change', () => set({ topo: c.checked }));
    for (const c of card.querySelectorAll('.sw-fc')) c.addEventListener('change', () => set({ fc: c.value }));
    for (const c of card.querySelectorAll('.sw-glac')) c.addEventListener('change', () => set({ glac: c.checked }));
    for (const s of card.querySelectorAll('.sw-smin')) s.addEventListener('change', () => set({ smin: Number(s.value) }));
    for (const b of card.querySelectorAll('.sw-reset-watch')) b.addEventListener('click', () => set({ aspects: ASP, emin: null, emax: null, smin: 30 }));
    for (const b of card.querySelectorAll('.sw-match')) {
      b.addEventListener('click', () => {
        const zone = card.closest('[data-zone]').dataset.zone;
        const pr = dash.data('problems'), dn = dash.data('danger_now');
        const probs = pr.status === 'ok' ? pr.data.filter((r) => r.zone === zone && r.problem) : [];
        const norm = { NORTH: 'N', NORTHEAST: 'NE', EAST: 'E', SOUTHEAST: 'SE', SOUTH: 'S', SOUTHWEST: 'SW', WEST: 'W', NORTHWEST: 'NW' };
        const asp = new Set();
        for (const p of probs) for (const a of String(p.aspects || '').split(',')) {
          const k = a.toUpperCase().replace(/[^A-Z]/g, '');
          const v = norm[k] || (ASP.includes(k) ? k : null);
          if (v) asp.add(v);
        }
        let emin = null;
        const rows = dn.status === 'ok' ? dn.data.filter((r) => r.zone === zone && Number(r.level) > 0) : [];
        const upper = rows.find((r) => r.band === 'upper'), lower = rows.find((r) => r.band === 'lower');
        const m = upper && /(\d[\d,.]*)\s*m/.exec(upper.band_label || '');
        if (m && lower && Number(upper.level) > Number(lower.level)) emin = Number(m[1].replace(/[,.]/g, ''));
        set({ mode: 'watch', aspects: asp.size ? ASP.filter((a) => asp.has(a)) : ASP, emin, emax: null, smin: 30 });
      });
    }
  }
  // keep controls in step with the current settings
  dash.onData(() => {
    for (const card of document.querySelectorAll('.sw-mapcard')) {
      const s = window.swMapSettings(card.dataset.pfx);
      for (const b of card.querySelectorAll('.sw-mode')) b.setAttribute('aria-pressed', String(b.dataset.mode === s.mode));
      for (const w of card.querySelectorAll('.sw-watch, .sw-leg-watch')) w.hidden = s.mode !== 'watch';
      for (const w of card.querySelectorAll('.sw-leg-wind, .sw-wind-note')) w.hidden = s.mode !== 'wind';
      for (const w of card.querySelectorAll('.sw-leg-slope')) w.hidden = s.mode !== 'slope';
      for (const c of card.querySelectorAll('.sw-paths')) c.checked = s.paths;
      for (const c of card.querySelectorAll('.sw-obs')) c.checked = s.obs;
      for (const c of card.querySelectorAll('.sw-doc')) c.checked = s.doc;
      for (const c of card.querySelectorAll('.sw-topo')) c.checked = s.topo;
      for (const c of card.querySelectorAll('.sw-fc')) c.value = s.fc;
      for (const c of card.querySelectorAll('.sw-glac')) c.checked = s.glac;
      for (const l of card.querySelectorAll('.sw-leg-glac')) l.hidden = !s.glac;
      for (const c of card.querySelectorAll('.sw-asp')) c.checked = s.aspects.includes(c.value);
      for (const i of card.querySelectorAll('.sw-emin')) if (i !== document.activeElement) i.value = s.emin ?? '';
      for (const i of card.querySelectorAll('.sw-emax')) if (i !== document.activeElement) i.value = s.emax ?? '';
      for (const x of card.querySelectorAll('.sw-smin')) x.value = String(s.smin);
    }
  });
})();

;

(() => {
  const OCT = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const zoneOf = (el) => el.closest('[data-zone]').dataset.zone;
  const wsum = (zone) => { const d = dash.data('wind_summary'); return d.status === 'ok' ? d.data.find((x) => x.zone === zone) : null; };

  dash.draw('wind-sum', (el) => {
    const w = wsum(zoneOf(el));
    if (!w) { el.textContent = '—'; return; }
    let ends = '';
    const until = w.until ? new Date(w.until.replace('Z', ':00Z')) : null;
    if (until && !isNaN(until) && Date.now() - until > 3 * 3600e3) {
      const tzs = { 'Rogers Pass': 'America/Vancouver', Rossland: 'America/Vancouver', Whitewater: 'America/Vancouver', 'Kootenay Pass': 'America/Vancouver' };
      const z = zoneOf(el).split(' · ')[0];
      ends = ` Readings end ${new Intl.DateTimeFormat('en-US', { timeZone: tzs[z] || 'UTC', weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(until)}${tzs[z] ? ' Pacific time' : ' UTC'}.`;
    }
    if (!w.transport_hours) { el.textContent = 'Winds have been too light to move snow in the 72 hours to the latest reading.' + ends; return; }
    const strength = w.strong_hours >= 6 ? 'strong' : w.transport_hours >= 12 ? 'sustained moderate' : 'moderate';
    let txt = `${w.transport_hours} hour${w.transport_hours === 1 ? '' : 's'} of ${strength} wind, mostly from the ${w.from_dir}, averaging ${w.mean_transport_kmh} km/h when it was blowing hard enough to move snow. `;
    const la = w.loaded_aspects.split(','), loaded = la.length > 1 ? la.slice(0, -1).join(', ') + ' and ' + la[la.length - 1] : la[0];
    if (window.swWindActive(w)) txt += `Expect fresh wind slabs on ${loaded}-facing slopes below ridges and in gullies.`;
    else txt += `There’s little snow for it to move yet (${w.snow_depth_cm ?? 0} cm on the ground), so loading is limited for now.`;
    el.textContent = txt + ends;
  });

  dash.draw('wind-note', (el) => {
    const w = wsum(zoneOf(el));
    if (!w) { el.textContent = '—'; return; }
    const alp = window.swAlpine[zoneOf(el)];
    if (w.from_deg === null) { el.textContent = 'Winds have been too light to move snow in the last 72 hours, so no slopes are shaded.'; return; }
    el.textContent = `Slopes of 25–55° above about ${d3.format(',')(alp)} m that face away from the recent ${w.from_dir} wind and sit sheltered below a ridge or rise within 300 m upwind. A model of where slabs are likely, from one ridge station’s wind; local winds funnel and swirl, so expect loading on other aspects too, especially cross-loaded gully sides.` + (window.swWindActive(w) ? '' : ' There’s little snow to move yet, so treat this as where loading will build once it snows.');
  });

  dash.draw('wind-rose', (el) => {
    el.replaceChildren();
    const d = dash.data('wind_rose');
    if (d.status !== 'ok') return;
    const rows = d.data.filter((x) => x.zone === zoneOf(el));
    const S = 220, cx = S / 2, cy = S / 2, R = S / 2 - 22;
    const max = Math.max(1, d3.max(rows, (x) => x.hours) || 1);
    const rs = d3.scaleSqrt([0, max], [0, R]);
    const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${S} ${S}`).attr('width', '100%');
    for (const f of [0.5, 1]) svg.append('circle').attr('cx', cx).attr('cy', cy).attr('r', rs(max * f)).attr('fill', 'none').attr('stroke', 'var(--cds-chart-grid)');
    const arc = d3.arc();
    const tip = document.createElement('div'); tip.className = 'sw-tip'; tip.hidden = true; el.append(tip);
    rows.forEach((x) => {
      const i = OCT.indexOf(x.from_dir), a0 = ((i * 45 - 20) * Math.PI) / 180, a1 = ((i * 45 + 20) * Math.PI) / 180;
      const g = svg.append('g').attr('transform', `translate(${cx},${cy})`);
      g.append('path').attr('d', arc({ innerRadius: 0, outerRadius: rs(x.hours || 0), startAngle: a0, endAngle: a1 })).attr('fill', dash.colors[0]).attr('opacity', 0.35);
      g.append('path').attr('d', arc({ innerRadius: 0, outerRadius: rs(x.transport_hours || 0), startAngle: a0, endAngle: a1 })).attr('fill', dash.colors[0]);
      g.append('path').attr('d', arc({ innerRadius: 0, outerRadius: R, startAngle: a0, endAngle: a1 })).attr('fill', 'transparent')
        .on('pointermove', (ev) => {
          tip.replaceChildren();
          const h = document.createElement('div'); h.className = 'sw-tdate'; h.textContent = `From the ${x.from_dir}`;
          const l1 = document.createElement('div'); l1.textContent = `${x.hours} h, ${x.transport_hours} h strong enough to move snow`;
          const l2 = document.createElement('div'); l2.textContent = x.mean_kmh === null ? '' : `Average ${x.mean_kmh} km/h`;
          tip.append(h, l1, l2); tip.hidden = false;
          const [px, py] = d3.pointer(ev, el);
          tip.style.left = Math.max(0, Math.min(el.clientWidth - tip.offsetWidth, px + 10)) + 'px';
          tip.style.top = Math.max(0, py - tip.offsetHeight - 6) + 'px';
        })
        .on('pointerleave', () => { tip.hidden = true; });
    });
    OCT.forEach((o, i) => {
      const a = (i * 45 * Math.PI) / 180;
      svg.append('text').attr('x', cx + Math.sin(a) * (R + 12)).attr('y', cy - Math.cos(a) * (R + 12)).attr('dy', '0.35em')
        .attr('text-anchor', 'middle').attr('font-size', 11).style('fill', 'var(--color-fg-muted)').text(o);
    });
  });
})();

;

(() => {
  const C = window.swRouteCore;
  const fmtDay = d3.utcFormat('%b %-d'), parse = d3.utcParse('%Y-%m-%d'), f1 = d3.format('~f');
  const KIND = { avalanche: 'Avalanche', signs: 'Warning signs', incident: 'Caught', report: 'Conditions' };
  const KCOL = { avalanche: 'var(--sw-av)', signs: 'var(--sw-r1)', incident: '#231F20', report: 'var(--cds-chart-muted)' };
  const docCache = {};
  const zoneOfEl = (el) => el.closest('[data-zone]').dataset.zone;
  const refOf = (el) => (el.closest('[data-ref]') || {}).dataset?.ref || 'the pass';
  dash.draw('regional', (ul) => {
    ul.replaceChildren();
    const d = dash.data('regional_forecasts');
    if (d.status !== 'ok') return;
    const zr = d.data.filter((x) => x.zone === zoneOfEl(ul));
    if (zr.length > 3 && !zr.some((x) => x.today)) {
      const li = document.createElement('li');
      li.textContent = `No ratings yet for any of the ${zr.length} forecast regions on this map; they'll be listed here once the bulletin starts.`;
      ul.append(li); return;
    }
    for (const r of zr) {
      const li = document.createElement('li');
      const b = document.createElement('b'); b.textContent = r.name; li.append(b);
      li.append(` (${r.forecaster}): ${r.today || 'no rating'}${r.issued ? ', issued ' + fmtDay(parse(r.issued)) : ''}. `);
      if (r.url) { const a = document.createElement('a'); a.href = r.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'Open'; li.append(a); }
      ul.append(li);
    }
  });
  window.swDocFor = (zone, rows) => (docCache[zone] = docCache[zone] || rows.filter((r) => r.zone === zone).map((r) => {
    const p = C.preparePaths([{ path_id: r.code, valley: r.valley, rings: r.rings }])[0];
    return Object.assign(p, { year: r.year, code: r.code });
  }));
  const reports = () => { const d = dash.data('avalanche_reports'); return d.status === 'ok' ? d.data.filter((r) => r.id) : null; };
  const filtered = (rows) => {
    const p = dash.params();
    const range = p.av_range || 'all', only = p.av_only === true;
    return rows.filter((r) => (range === 'all' || r.dist_km <= Number(range)) && (!only || r.kind !== 'report'));
  };
  const terrainRow = (zone) => window.swTerrainAll().find((r) => r.zone === zone) || null;
  const toCell = (row, lat, lon) => {
    const [x, y] = C.utm(lat, lon, C.zoneOfCrs(row.crs));
    return [(x - row.x0) / row.cell_m, (row.y0 - y) / row.cell_m];
  };
  const what = (r) => {
    const bits = [];
    if (r.avalanches) bits.push(`${r.count_label && String(r.count_label) !== '1' ? r.count_label + ' avalanches' : 'avalanche'}${r.max_size ? ', size ' + f1(r.max_size) : ''}`);
    if (r.types) bits.push(r.types);
    if (r.triggers) bits.push(r.triggers);
    if (r.aspects) bits.push(r.aspects + (r.elevations ? '' : ' aspect'));
    if (r.elevations) bits.push(r.elevations + (r.elev_m ? ` (${d3.format(',')(r.elev_m)} m)` : ''));
    if (r.avalanche_date && r.avalanche_date !== r.date) bits.push('ran ' + fmtDay(parse(r.avalanche_date)));
    if (r.signs) bits.push(r.signs);
    if (r.caught) bits.push(r.caught);
    return bits.join(' · ');
  };

  // map markers for reports inside the Rogers Pass map
  window.swObsHits = {};
  window.swObsOverlay = (sel, zone, row, toX, toY, s, card) => {
    window.swObsHits[zone] = [];
    if (!card.querySelector('.sw-obs') || !s.obs) return;
    const rows = reports();
    if (!rows) return;
    for (const r of rows.filter((x) => x.zone === zone).slice().reverse()) {
      const [c, rr] = toCell(row, r.lat, r.lon);
      if (c < 0 || rr < 0 || c > row.width || rr > row.height) continue;
      const x = toX(c), y = toY(rr), col = { avalanche: '#C4122F', signs: '#FFB000', incident: '#231F20', report: '#8A8A8A' }[r.kind];
      if (r.kind === 'avalanche' || r.kind === 'incident') {
        const k = 6 + Math.min(4, (r.max_size || 1));
        sel.append('path').attr('d', `M${x},${y - k}L${x + k},${y}L${x},${y + k}L${x - k},${y}Z`).attr('fill', col).attr('stroke', '#fff').attr('stroke-width', 1.5);
      } else {
        sel.append('circle').attr('cx', x).attr('cy', y).attr('r', 5).attr('fill', col).attr('stroke', '#fff').attr('stroke-width', 1.5);
      }
      window.swObsHits[zone].push({ x, y, label: `${fmtDay(parse(r.date))}: ${r.title}${r.kind !== 'report' ? ' (' + KIND[r.kind].toLowerCase() + ')' : ''}` });
    }
  };

  window.swShowOnMap = (zone, lat, lon) => {
    const card = document.querySelector(`.sw-zone[data-zone="${CSS.escape(zone)}"] .sw-mapcard`);
    const row = terrainRow(zone);
    if (!card || !row) return;
    const tab = document.querySelector(`.sw-tab[data-tab="${card.dataset.pfx}"]`);
    if (tab) tab.click();
    const mapEl = card.querySelector('.sw-map');
    setTimeout(() => {
      mapEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const m = window.swMaps.get(mapEl);
      if (m && lat !== undefined) { const [c, r] = toCell(row, lat, lon); const pad = 1500 / row.cell_m; setTimeout(() => m.zoomTo(c - pad, r - pad, c + pad, r + pad), 450); }
      else if (m) m.redraw();
    }, 60);
  };

  // controls
  for (const sel of document.querySelectorAll('.sw-av-range')) sel.addEventListener('change', () => dash.setParams({ av_range: sel.value }));
  for (const c of document.querySelectorAll('.sw-av-only')) c.addEventListener('change', () => dash.setParams({ av_only: c.checked }));
  dash.onData(() => {
    const p = dash.params();
    for (const sel of document.querySelectorAll('.sw-av-range')) sel.value = p.av_range || 'all';
    for (const c of document.querySelectorAll('.sw-av-only')) c.checked = p.av_only === true;
  });

  dash.draw('av-sum', (el) => {
    const all = reports();
    if (!all) { el.textContent = '—'; return; }
    const zone = zoneOfEl(el), ref = refOf(el);
    const rows = all.filter((r) => r.zone === zone);
    if (!rows.length) { el.textContent = ['Rogers Pass', 'Rossland', 'Whitewater', 'Kootenay Pass'].includes(zone) ? 'No field reports in the last 30 days.' : 'No reports in the last 30 days. Both feeds are mostly filed in winter.'; return; }
    const av = rows.filter((r) => r.avalanches > 0);
    const latest = av[0];
    const big = d3.greatest(av.filter((r) => r.max_size), (r) => r.max_size);
    let t = `${rows.length} report${rows.length === 1 ? '' : 's'} in the last 30 days, ${av.length} of them describing avalanches.`;
    if (latest) t += ` Most recent: ${latest.title} (${fmtDay(parse(latest.date))}, ${latest.dist_km} km from ${ref}), ${what(latest)}.`;
    if (big && big !== latest) t += ` Largest: size ${f1(big.max_size)}, ${big.title} (${fmtDay(parse(big.date))}).`;
    const near = av.filter((r) => r.dist_km <= 10).length;
    if (av.length) t += ` ${near} within 10 km of ${ref}.`;
    el.textContent = t;
  });

  dash.draw('av-chart', (el) => {
    el.replaceChildren();
    const all = reports();
    if (!all) return;
    const rows = filtered(all.filter((r) => r.zone === zoneOfEl(el)));
    const end = d3.max(all, (r) => r.date) || new Date().toISOString().slice(0, 10);
    const days = d3.utcDays(d3.utcDay.offset(parse(end), -29), d3.utcDay.offset(parse(end), 1)).map((d) => d.toISOString().slice(0, 10));
    const order = ['report', 'signs', 'avalanche', 'incident'];
    const by = d3.rollup(rows, (v) => v, (r) => r.date);
    const W = Math.max(280, el.clientWidth), H = 180, m = { top: 10, right: 24, bottom: 24, left: 26 };
    const w = W - m.left - m.right, h = H - m.top - m.bottom;
    const ymax = Math.max(3, d3.max(days, (d) => (by.get(d) || []).length) || 0);
    const x = d3.scaleBand(days, [0, w]).padding(0.2), y = d3.scaleLinear([0, ymax], [h, 0]).nice();
    const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
    const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`);
    const ya = g.append('g').call(d3.axisLeft(y).ticks(Math.min(ymax, 4)).tickFormat(d3.format('d')).tickSize(-w)).attr('font-size', null).attr('font-family', null);
    ya.select('.domain').remove(); ya.selectAll('.tick line').attr('stroke', 'var(--cds-chart-grid)'); ya.selectAll('.tick text').attr('dx', -4);
    const every = Math.max(1, Math.ceil(60 / x.step()));
    const xa = g.append('g').attr('transform', `translate(0,${h})`).call(d3.axisBottom(x).tickValues(days.filter((_, i) => i % every === 0)).tickFormat((d) => fmtDay(parse(d))).tickSizeOuter(0))
      .attr('font-size', null).attr('font-family', null);
    xa.select('.domain').attr('stroke', 'var(--cds-chart-axis)'); xa.selectAll('.tick line').remove();
    window.swTrim(xa);
    const tip = document.createElement('div'); tip.className = 'sw-tip'; tip.hidden = true; el.append(tip);
    const bw = Math.min(28, x.bandwidth());
    for (const d of days) {
      const list = (by.get(d) || []).slice().sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
      list.forEach((r, i) => {
        g.append('rect').attr('x', x(d) + (x.bandwidth() - bw) / 2).attr('width', bw).attr('y', y(i + 1) + 1).attr('height', Math.max(1, y(i) - y(i + 1) - 1))
          .attr('rx', 2).style('fill', KCOL[r.kind])
          .on('pointermove', (ev) => {
            tip.replaceChildren();
            const hd = document.createElement('div'); hd.className = 'sw-tdate'; hd.textContent = fmtDay(parse(d));
            const l1 = document.createElement('div'); l1.textContent = r.title;
            const l2 = document.createElement('div'); l2.textContent = what(r) || KIND[r.kind];
            tip.append(hd, l1, l2); tip.hidden = false;
            const [px, py] = d3.pointer(ev, el);
            tip.style.left = Math.max(0, Math.min(el.clientWidth - tip.offsetWidth, px + 12)) + 'px';
            tip.style.top = Math.max(0, py - tip.offsetHeight - 8) + 'px';
          })
          .on('pointerleave', () => { tip.hidden = true; });
      });
    }
  });

  dash.draw('av-rows', (tb) => {
    tb.replaceChildren();
    const all = reports();
    if (!all) return;
    const zone = zoneOfEl(tb);
    const row = terrainRow(zone);
    const rows = filtered(all.filter((r) => r.zone === zone));
    for (const r of rows) {
      const tr = document.createElement('tr'); tr.dataset.key = r.id;
      const td = (t) => { const c = document.createElement('td'); if (t !== undefined) c.textContent = t; tr.append(c); return c; };
      td(fmtDay(parse(r.date)));
      const tt = td();
      const a = document.createElement('a'); a.href = r.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = r.title || 'Report'; tt.append(a);
      if (r.comment) { const c = document.createElement('span'); c.className = 'sw-av-c'; c.textContent = r.comment.length > 220 ? r.comment.slice(0, 220) + '…' : r.comment; tt.append(c); }
      const dc = td(f1(r.dist_km)); dc.className = 'sw-num';
      const kc = td(); const k = document.createElement('span'); k.className = 'sw-kind sw-kind-' + r.kind; k.textContent = KIND[r.kind]; kc.append(k);
      const wc = td(what(r)); wc.className = 'sw-hide-narrow';
      const mc = td();
      if (row) {
        const [c, rr] = toCell(row, r.lat, r.lon);
        if (c >= 0 && rr >= 0 && c <= row.width && rr <= row.height) {
          const b = document.createElement('button'); b.type = 'button'; b.className = 'sw-zbtn'; b.textContent = 'Map';
          b.onclick = () => window.swShowOnMap(zone, r.lat, r.lon);
          mc.append(b);
        }
      }
      tb.append(tr);
    }
    if (!rows.length) { const tr = document.createElement('tr'); const c = document.createElement('td'); c.colSpan = 6; c.textContent = 'No reports match.'; tr.append(c); tb.append(tr); }
  });

  dash.draw('av-bulletin', (el) => {
    el.replaceChildren();
    const d = dash.data('bulletins');
    if (d.status !== 'ok') return;
    const b = d.data.find((r) => r.zone === 'Vallter / Ulldeter');
    const dn = dash.data('danger_now');
    const inSeason = dn.status === 'ok' && dn.data.some((r) => r.zone === 'Vallter / Ulldeter' && Number(r.level) > 0);
    const add = (t, lang) => { const p = document.createElement('p'); p.textContent = t; if (lang) p.lang = lang; el.append(p); };
    if (!b || !inSeason) { add(`The ICGC bulletin isn't running yet${b && b.valid_until ? ' (it resumes by ' + fmtDay(parse(b.valid_until)) + ')' : ''}, so there are no official notes on recent activity.`); return; }
    const text = [b.snowpack, b.detail, b.trend].filter(Boolean).join(' ');
    const hits = text.split(/(?<=[.!?])\s+/).filter((x) => /allau|plaques?|purg|caigud|desencaden|activitat|lliscament|esllavissad|purga/i.test(x));
    if (!hits.length) { add('The current bulletin doesn’t mention recent avalanche activity.'); return; }
    add(`Bulletin of ${fmtDay(parse(b.issued))}, in Catalan:`);
    for (const h of hits) add('“' + h.trim() + '”', 'ca');
  });

})();

;

(() => {
  // search every map's named places; the current map's matches first
  const KIND = { peak: 'summit', summit: 'summit', col: 'pass or col', place: 'place', glacier: 'glacier', station: 'weather station', circ: 'cirque' };
  const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ß/g, 'ss');
  const cache = new Map();
  const markersOf = (row) => { if (!cache.has(row)) cache.set(row, JSON.parse(row.markers || '[]')); return cache.get(row); };
  window.swSearchHit = {};
  window.swSearchOverlay = (sel, zone, toX, toY) => {
    const h = window.swSearchHit[zone];
    if (!h) return;
    const x = toX(h.col), y = toY(h.row);
    sel.append('circle').attr('cx', x).attr('cy', y).attr('r', 14).attr('fill', 'none').attr('stroke', '#fff').attr('stroke-width', 5);
    sel.append('circle').attr('cx', x).attr('cy', y).attr('r', 14).attr('fill', 'none').attr('stroke', '#C4122F').attr('stroke-width', 2.5);
    if (h.coords) sel.append('circle').attr('cx', x).attr('cy', y).attr('r', 2.5).attr('fill', '#C4122F');
  };
  const goTo = (zone, col, rowN, label, coords) => {
    const card = document.querySelector(`.sw-zone[data-zone="${CSS.escape(zone)}"] .sw-mapcard`);
    const row = window.swTerrainAll().find((r) => r.zone === zone);
    if (!card || !row) return;
    window.swSearchHit[zone] = { col, row: rowN, label, coords };
    const tab = document.querySelector(`.sw-tab[data-tab="${card.dataset.pfx}"]`);
    if (tab && tab.getAttribute('aria-selected') !== 'true') tab.click();
    const mapEl = card.querySelector('.sw-map');
    setTimeout(() => {
      const m = window.swMaps.get(mapEl);
      if (!m) return;
      const pad = 1500 / row.cell_m;
      m.zoomTo(col - pad, rowN - pad, col + pad, rowN + pad);
      setTimeout(() => m.redraw(), 450);
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 60);
  };
  const results = (q, here) => {
    const out = [];
    const rows = window.swTerrainAll();
    const ll = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(q);
    if (ll) {
      const lat = Number(ll[1]), lon = Number(ll[2]);
      for (const row of rows) {
        const [x, y] = window.swRouteCore.utm(lat, lon, window.swRouteCore.zoneOfCrs(row.crs));
        const c = (x - row.x0) / row.cell_m, r = (row.y0 - y) / row.cell_m;
        if (c >= 0 && r >= 0 && c < row.width && r < row.height)
          out.push({ zone: row.zone, col: c, row: r, name: `${lat.toFixed(4)}, ${lon.toFixed(4)}`, meta: 'coordinates', coords: true, score: 0 });
      }
      return out;
    }
    const n = norm(q).trim();
    if (n.length < 2) return out;
    for (const row of rows) {
      for (const m of markersOf(row)) {
        if (!m.name) continue;
        const t = norm(m.name);
        const i = t.indexOf(n);
        if (i < 0) continue;
        const score = (t === n ? 0 : i === 0 ? 1 : /[\s\-(]/.test(t[i - 1]) ? 2 : 3) + (row.zone === here ? 0 : 10) + (m.kind === 'peak' ? 0 : 0.5);
        out.push({ zone: row.zone, col: m.col, row: m.row, name: m.name, score,
          meta: [KIND[m.kind] || m.kind, m.elev_m ? d3.format(',')(m.elev_m) + ' m' : null, row.zone === here ? null : row.zone + ' map'].filter(Boolean).join(' · ') });
      }
    }
    out.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name));
    const seen = new Set();
    return out.filter((o) => { const k = o.zone + '|' + o.name; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 10);
  };
  for (const card of document.querySelectorAll('.sw-mapcard')) {
    const here = card.closest('[data-zone]').dataset.zone;
    const inp = card.querySelector('.sw-search-in'), ul = card.querySelector('.sw-search-list');
    if (!inp || !ul) continue;
    let list = [], active = -1;
    const close = () => { ul.hidden = true; ul.replaceChildren(); active = -1; };
    const pick = (o) => { inp.value = o.coords ? o.name : o.name; close(); goTo(o.zone, o.col, o.row, o.name, o.coords); };
    const render = () => {
      ul.replaceChildren();
      if (!inp.value.trim()) { close(); return; }
      if (!list.length) {
        const li = document.createElement('li'); li.className = 'sw-s-none';
        li.textContent = window.swTerrainAll().length ? 'No match on the maps.' : 'Maps still loading…'; ul.append(li); ul.hidden = false; return;
      }
      list.forEach((o, i) => {
        const li = document.createElement('li'); li.setAttribute('role', 'option'); li.setAttribute('aria-selected', String(i === active));
        const a = document.createElement('span'); a.textContent = o.name;
        const b = document.createElement('span'); b.className = 'sw-s-meta'; b.textContent = o.meta;
        li.append(a, b);
        li.addEventListener('mousedown', (ev) => { ev.preventDefault(); pick(o); });
        ul.append(li);
      });
      ul.hidden = false;
    };
    inp.addEventListener('input', () => {
      if (!inp.value.trim() && window.swSearchHit[here]) { delete window.swSearchHit[here]; const m = window.swMaps.get(card.querySelector('.sw-map')); if (m) m.redraw(); }
      list = results(inp.value, here); active = list.length ? 0 : -1; render();
    });
    inp.addEventListener('keydown', (ev) => {
      if (ev.key === 'ArrowDown' && list.length) { active = (active + 1) % list.length; render(); ev.preventDefault(); }
      else if (ev.key === 'ArrowUp' && list.length) { active = (active - 1 + list.length) % list.length; render(); ev.preventDefault(); }
      else if (ev.key === 'Enter' && list[active]) { pick(list[active]); ev.preventDefault(); }
      else if (ev.key === 'Escape') { close(); }
    });
    inp.addEventListener('blur', () => setTimeout(close, 150));
    inp.addEventListener('focus', () => { if (inp.value.trim()) { list = results(inp.value, here); render(); } });
  }
})();
