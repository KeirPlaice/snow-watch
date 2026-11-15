const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch();
  for (const [name, o] of [['desktop', { viewport: { width: 1280, height: 900 } }], ['iphone', devices['iPhone 13']]]) {
    const c = await b.newContext(o); const p = await c.newPage(); const errs = [], bad = [];
    p.on('pageerror', (e) => errs.push('PAGEERR ' + String(e).slice(0, 400)));
    p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ' ' + m.text().slice(0, 300)); });
    p.on('response', (r) => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url().slice(0, 150)); });
    await p.goto('https://keirplaice.github.io/snow-watch/', { waitUntil: 'networkidle', timeout: 90000 }); await p.waitForTimeout(5000);
    const ok = await p.$('text=I understand'); if (ok) await ok.click();
    await p.waitForTimeout(3000);
    await p.screenshot({ path: `live_${name}.png` });
    const info = await p.evaluate(() => ({ title: document.title, text: document.body.innerText.slice(0, 600), skeletons: document.querySelectorAll('.dash-skeleton').length }));
    console.log('LIVE', name, JSON.stringify(info));
    console.log('LIVE', name, 'errors', JSON.stringify(errs.slice(0, 15)));
    console.log('LIVE', name, 'bad', JSON.stringify(bad.slice(0, 15)));
    // second load (service worker active)
    await p.reload({ waitUntil: 'networkidle', timeout: 90000 }); await p.waitForTimeout(4000);
    console.log('LIVE', name, 'reload errors', JSON.stringify(errs.slice(0, 20)));
    await c.close();
  }
  await b.close();
})();
