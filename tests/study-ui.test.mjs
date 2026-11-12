// Study sheet (Playwright): opens from the header, shows the cards and glossary, search filters both,
// Try it runs the card's example on the Reactions tab, and the phone layout has no sideways scroll.
import { chromium } from 'playwright';
const fails = []; const ok = (c, l) => { if (!c) fails.push(l); };
const b = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
for (const [vw, tag] of [[{ width: 1280, height: 900 }, 'desk'], [{ width: 390, height: 844 }, 'phone']]){
  const ctx = await b.newContext({ viewport: vw });
  await ctx.route(/pubchem|opsin/, (r) => r.abort());
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(process.env.BASE_URL || 'http://localhost:8765/'); await p.waitForSelector('#boot', { state: 'detached' });
  await p.click('#studyBtn');
  await p.waitForFunction(() => document.querySelectorAll('#studyCards .st-card').length > 0, null, { timeout: 10000 });
  const titles = await p.$$eval('#studyCards h3', (hs) => hs.map((h) => h.textContent));
  ok(['SN2', 'SN1', 'E2', 'E1'].every((t) => titles.includes(t)) && titles.length >= 8, `${tag}: cards ${titles}`);
  ok((await p.$$('#studyGloss dt')).length >= 50, `${tag}: glossary too short`);
  ok(await p.evaluate(() => { const d = document.querySelector('#studyWin'); return d.scrollWidth <= d.clientWidth + 1 && document.documentElement.scrollWidth <= window.innerWidth; }), `${tag}: sideways scroll`);
  if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/study-${tag}.png` });
  await p.fill('#studySearch', 'gauche');
  const after = await p.$$eval('#studyCards h3', (hs) => hs.map((h) => h.textContent));
  const terms = await p.$$eval('#studyGloss dt', (ds) => ds.map((d) => d.textContent));
  ok(after.includes('E2 geometry') && !after.includes('SN2') && terms.includes('gauche'), `${tag}: search "gauche" → ${after} / ${terms}`);
  await p.fill('#studySearch', '');
  await p.click('.st-card[data-card="E2"] .st-try');
  await p.waitForFunction(() => document.querySelector('main').dataset.app === 'rx' && /major/.test(document.querySelector('#rxLamps .lamp[data-pw="E2"]')?.className || ''), null, { timeout: 30000 }).catch(() => ok(false, `${tag}: Try it on E2 didn't show E2 major on the Reactions tab`));
  ok(!(await p.evaluate(() => document.querySelector('#studyWin').open)), `${tag}: sheet should close after Try it`);
  ok(errs.length === 0, `${tag}: page errors ${JSON.stringify(errs)}`);
  await ctx.close();
}
await b.close();
if (fails.length){ console.log(fails.join('\n')); process.exit(1); }
console.log('study-ui: all checks passed');
