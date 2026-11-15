const { webkit, chromium, devices } = require('playwright');
(async () => {
  for (const [bn, bt, o] of [['webkit-iphone', webkit, devices['iPhone 13']], ['webkit-desktop', webkit, { viewport: { width: 1280, height: 900 } }]]) {
    const b = await bt.launch();
    const c = await b.newContext(o); const p = await c.newPage(); const errs = [], bad = [];
    p.on('pageerror', (e) => errs.push('PAGEERR ' + String(e).slice(0, 400)));
    p.on('console', (m) => { if (m.type() === 'error') errs.push(m.type() + ' ' + m.text().slice(0, 300)); });
    p.on('response', (r) => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url().slice(0, 150)); });
    try {
      await p.goto('https://keirplaice.github.io/snow-watch/', { waitUntil: 'load', timeout: 90000 }); await p.waitForTimeout(6000);
      const ok = await p.$('text=I understand'); if (ok) await ok.click();
      await p.waitForTimeout(2000);
      await p.screenshot({ path: `live_${bn}_1.png` });
      const info = await p.evaluate(() => ({ text: document.body.innerText.slice(0, 300), skeletons: document.querySelectorAll('.dash-skeleton').length, maps: document.querySelectorAll('.sw-map canvas').length }));
      console.log('LIVE', bn, JSON.stringify(info));
      // open a map and switch the photo on
      await p.click('.sw-range[data-range=pyrenees]'); await p.waitForTimeout(500);
      await p.click('.sw-tab[data-tab=vallter]'); await p.waitForTimeout(5000);
      const m = '#vallter-map';
      await (await p.$(m + ' .sw-map')).scrollIntoViewIfNeeded(); await p.waitForTimeout(1500);
      await p.screenshot({ path: `live_${bn}_2.png` });
      await p.evaluate((m) => { const i = document.querySelector(m + ' .sw-sat'); i.click(); }, m); await p.waitForTimeout(6000);
      await p.screenshot({ path: `live_${bn}_3.png` });
      console.log('LIVE', bn, 'tiles', await p.evaluate((m) => [...document.querySelectorAll(m + ' .sw-sat-tile')].filter((i) => i.style.opacity === '1').length, m));
    } catch (e) { console.log('LIVE', bn, 'EXC', String(e).slice(0, 300)); }
    console.log('LIVE', bn, 'errors', JSON.stringify(errs.slice(0, 15)));
    console.log('LIVE', bn, 'bad', JSON.stringify(bad.slice(0, 15)));
    await b.close();
  }
})();
