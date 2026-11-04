// Snow & Avalanche Watch — standalone runtime.
// Stands in for the dashboard runtime the page was written for: loads each dataset from data/<id>.json
// the first time it is read, runs the page's calcs, keeps view settings in this browser, and redraws.
(() => {
  const draws = new Map(), calcs = new Map(), store = new Map(), onData = [];
  let index = null; // data/index.json: { built, files: { id: hash } }
  const KEY = 'sw-params-v1';
  let params = {};
  try { params = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { params = {}; }
  const saveParams = () => { try { localStorage.setItem(KEY, JSON.stringify(params)); } catch (e) { /* private mode */ } };

  const els = (name) => document.querySelectorAll(`[data-draw="${name}"]`);
  const run = (name) => {
    const d = draws.get(name);
    if (!d) return;
    for (const el of els(name)) {
      try {
        if (typeof d === 'function') d(el);
        else {
          if (!el.__swMade) el.__swMade = { v: d.mount ? d.mount(el) : undefined };
          if (d.update) d.update(el, el.__swMade.v);
        }
      } catch (e) { console.error(`draw ${name}:`, e); }
    }
  };
  let pending = false;
  const redrawAll = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      for (const f of onData) { try { f(); } catch (e) { console.error(e); } }
      for (const n of draws.keys()) run(n);
    });
  };

  const indexReady = fetch('data/index.json', { cache: 'no-cache' }).then((r) => r.json()).then((j) => { index = j; }).catch(() => { index = { files: {} }; });
  const load = (id) => {
    const rec = { status: 'loading', data: [], columns: [], meta: [], refreshing: false, message: '' };
    store.set(id, rec);
    indexReady.then(() => {
      const v = (index.files || {})[id];
      if (!v) { rec.status = 'missing'; rec.message = 'No such dataset'; redrawAll(); return null; }
      return fetch(`data/${id}.json?v=${v}`).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }).then((j) => {
        const rows = Array.isArray(j) ? j : j.rows || j.data || j.results || [];
        rec.data = rows; rec.columns = rows.length ? Object.keys(rows[0]) : []; rec.status = 'ok';
        redrawAll();
      });
    }).catch((e) => { rec.status = 'error'; rec.message = String(e); redrawAll(); });
    return rec;
  };
  const view = (rec) => ({ status: rec.status, data: rec.data, columns: rec.columns, meta: rec.meta, refreshing: false, message: rec.message, rows: rec.data, value: rec.data });

  window.dash = {
    colors: ['#2D6FCB', '#D95F02', '#7570B3', '#1B9E77', '#E7298A', '#66A61E', '#E6AB02', '#A6761D'],
    draw(name, fn) { if (fn === undefined) { run(name); return; } draws.set(name, fn); run(name); },
    calc(id, spec) { calcs.set(id, spec); },
    loader() {},
    data(id) {
      const c = calcs.get(id);
      if (c) {
        const ins = c.inputs.map((i) => window.dash.data(i));
        const bad = ins.find((x) => x.status !== 'ok');
        if (bad) return { status: bad.status === 'missing' ? 'missing' : bad.status, data: [], columns: [], meta: [] };
        try {
          const out = c.fn(...ins.map((x) => x.data));
          const rows = Array.isArray(out) ? out : out;
          return { status: 'ok', data: rows, columns: Array.isArray(rows) && rows.length ? Object.keys(rows[0]) : [], meta: [], rows, value: rows };
        } catch (e) { console.error(`calc ${id}:`, e); return { status: 'error', data: [], columns: [], meta: [], message: String(e) }; }
      }
      return view(store.get(id) || load(id));
    },
    params: () => ({ ...params }),
    setParams(p) { params = { ...params, ...p }; saveParams(); redrawAll(); },
    resetParams() { params = {}; saveParams(); redrawAll(); },
    onData(f) { onData.push(f); try { f(); } catch (e) { console.error(e); } },
    refresh() {},
    setLink() {},
  };
  window.swStandalone = true;
  // a marked element that becomes visible starts loading its datasets (the route check asks for terrain this way)
  new MutationObserver((muts) => {
    for (const m of muts) {
      const el = m.target;
      if (el.nodeType === 1 && !el.hidden && el.dataset && el.dataset.source) for (const id of el.dataset.source.split(/\s+/)) if (id) window.dash.data(id);
    }
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['hidden'], subtree: true });
  let w = window.innerWidth;
  window.addEventListener('resize', () => { if (Math.abs(window.innerWidth - w) > 1) { w = window.innerWidth; redrawAll(); } });
  indexReady.then(() => {
    const el = document.querySelector('.sw-updated');
    if (el && index && index.built) {
      const d = new Date(index.built);
      el.textContent = `Data updated ${d.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`;
    }
  });
})();
