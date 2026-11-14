// Ch 8 addition card, wired up in the real page (fake PubChem/OPSIN). DOM text only.
// 1-methylcyclopentene + HBr → one Addition lamp (no SN/E lamps), Intermediate / Regiochemistry / Stereospecific lines,
// product 1-bromo-1-methylcyclopentane; then Br₂ (builder not written yet) → the classification card, no product.
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:8765/';
let fails = 0, checks = 0, lastOk = '';
const ok = (cond, label) => { checks++; lastOk = label; if (!cond){ console.log('FAIL ' + label); fails++; } };
const cors = { 'access-control-allow-origin': '*' };

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
await ctx.route(/pubchem\.ncbi\.nlm\.nih\.gov/, (route) => route.fulfill({ status: 404, contentType: 'application/json', headers: cors, body: '{"Fault":{"Code":"PUGREST.NotFound"}}' }));
const opsin = { '1-bromo-1-methylcyclopentane': 'CC1(Br)CCCC1' };
await ctx.route(/(ebi\.ac\.uk\/opsin|opsin\.ch\.cam\.ac\.uk)/, (route) => {
  const smi = opsin[decodeURIComponent(route.request().url().split('/').pop().replace(/\.json$/, ''))];
  return route.fulfill({ status: smi ? 200 : 404, contentType: 'application/json', headers: cors, body: JSON.stringify(smi ? { status: 'SUCCESS', smiles: smi } : { status: 'FAILURE', smiles: '' }) });
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
page.setDefaultTimeout(5000);
const text = (s) => page.textContent(s);

try {
  await page.goto(BASE);
  await page.waitForSelector('#boot', { state: 'detached', timeout: 20000 });
  await page.waitForFunction(() => document.querySelectorAll('#rxReagentChips .chip').length > 0, null, { timeout: 10000 });
  await page.click('.apptab[data-app="rx"]');
  await page.fill('#nameInput', 'CC1=CCCC1');
  await page.click('#nameBtn');
  await page.waitForFunction(() => window.getComputedStyle(document.querySelector('#rxWin')).display !== 'none', null, { timeout: 10000 });
  await page.fill('#rxReagentInput', 'HBr'); await page.press('#rxReagentInput', 'Enter');
  await page.click('#rxPredict');
  await page.waitForSelector('#rxOut:not([hidden])');
  const lamps = await page.$$eval('#rxLamps .lamp', (l) => l.map((x) => `${x.dataset.pw}:${x.className}`));
  ok(lamps.join() === 'Addition:lamp major', `one Addition lamp, lit (got ${lamps.join()})`);
  await page.waitForFunction(() => /1-bromo-1-methylcyclopentane/.test(document.querySelector('#rxCards').textContent), null, { timeout: 10000 });
  const card = await text('#rxCards .rx-card');
  ok(/Intermediate\s*carbocation/.test(card), 'card: Intermediate carbocation');
  ok(/Regiochemistry\s*Markovnikov/.test(card), 'card: Regiochemistry Markovnikov');
  ok(/Stereospecific\?\s*N/.test(card), 'card: Stereospecific? N');
  ok(!(await page.$('#rxCards .rx-watch')), 'no Watch button until the addition viewer exists');
  ok(/addition/i.test(await text('#rxPath')), 'decision path names the addition');
  // a 390 px phone: no sideways scrolling
  await page.setViewportSize({ width: 390, height: 844 });
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= 390), '390 px: no sideways scroll');
  await page.setViewportSize({ width: 1280, height: 900 });
  // Br₂: classified, builder not written yet → says so, no product
  await page.fill('#rxReagentInput', 'Br2'); await page.press('#rxReagentInput', 'Enter');
  await page.click('#rxPredict');
  await page.waitForFunction(() => /isn’t built yet/.test(document.querySelector('#rxNotes').textContent), null, { timeout: 5000 });
  ok(/halonium/.test(await text('#rxCards')) && /no product yet/.test(await text('#rxCards')), 'Br₂: classification card (halonium), no product');
} catch (e) {
  ok(false, 'test crashed after "' + lastOk + '": ' + e.message.split('\n').slice(0, 6).join(' | '));
}
ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors[0] : ''));
await browser.close();
console.log(fails ? `${fails} of ${checks} checks failed` : `addition-ui: ${checks} checks passed`);
process.exit(fails ? 1 : 0);
