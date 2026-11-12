// Name checker + course-style name (Playwright, fake OPSIN): (E)-hept-3-ene drawn, four pasted choices
// get ✔ / ≈ / ✗ / ?, and the name box shows "Course style: (3E)-3-heptene" once OPSIN reads it back.
import { chromium } from 'playwright';
const fails = []; const ok = (c, l) => { if (!c) fails.push(l); };
const FAKE = { '(E)-3-heptene': 'CC/C=C/CCC', '(Z)-3-heptene': 'CC/C=C\\CCC', '3-heptyne': 'CCC#CCCC', '(3E)-hept-3-ene': 'CC/C=C/CCC', '(3E)-3-heptene': 'CC/C=C/CCC' };
const b = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
await ctx.route(/pubchem/, (r) => r.abort());
await ctx.route(/opsin/, (r) => {
  const name = decodeURIComponent(r.request().url().split('/').pop().replace(/\.json$/, ''));
  const smi = FAKE[name];
  r.fulfill({ contentType: 'application/json', body: JSON.stringify(smi ? { status: 'SUCCESS', smiles: smi } : { status: 'FAILURE', message: 'unparsable' }) });
});
const p = await ctx.newPage(); const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto(process.env.BASE_URL || 'http://localhost:8765/'); await p.waitForSelector('#boot', { state: 'detached' });
await p.fill('#nameInput', 'CC/C=C/CCC'); await p.click('#nameBtn'); await p.waitForTimeout(500);
await p.click('#nameItBtn');
await p.waitForFunction(() => /Course style/.test(document.querySelector('#course').textContent), null, { timeout: 15000 }).catch(() => {});
ok(/Course style: \(3E\)-3-heptene/.test(await p.textContent('#course')), `course style line: "${await p.textContent('#course')}" (name: ${await p.textContent('#iupac')})`);
await p.click('#mcBox summary');
await p.fill('#mcText', 'A. (E)-3-heptene\nB. (Z)-3-heptene\nC. 3-heptyne\nD. hept-3-zzz');
await p.click('#mcBtn');
await p.waitForFunction(() => document.querySelectorAll('#mcOut li').length === 4, null, { timeout: 15000 }).catch(() => {});
const cls = await p.$$eval('#mcOut li', (ls) => ls.map((l) => l.className).join(' '));
ok(cls === 'same stereo different unread', `verdicts: ${cls}`);
ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'phone: sideways scroll');
ok(errs.length === 0, `page errors ${JSON.stringify(errs)}`);
await b.close();
if (fails.length){ console.log(fails.join('\n')); process.exit(1); }
console.log('names-ui: all checks passed');
