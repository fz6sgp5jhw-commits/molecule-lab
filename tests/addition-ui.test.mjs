// Ch 8 addition card, wired up in the real page (fake PubChem/OPSIN). DOM text only.
// 1-methylcyclopentene + HBr → one Addition lamp (no SN/E lamps), Intermediate / Regiochemistry / Stereospecific lines,
// product 1-bromo-1-methylcyclopentane; then Br₂ → Racemic? Y; then 3-tBu-cyclohexene + mCPBA → Face computed (S2); Br₂/hν on methylcyclohexane and Rank radicals (S3).
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
  // Br₂ (S2): anti addition built in 3D → Racemic? Y, halonium, no "not built" note
  await page.fill('#rxReagentInput', 'Br2'); await page.press('#rxReagentInput', 'Enter');
  await page.click('#rxPredict');
  await page.waitForFunction(() => /Racemic\?/.test(document.querySelector('#rxCards').textContent), null, { timeout: 15000 });
  const br = await text('#rxCards .rx-card');
  ok(/halonium/.test(br) && /Racemic\?\s*Y/.test(br), 'Br₂: halonium card, Racemic? Y');
  ok(!/isn’t built yet/.test(await text('#rxNotes')), 'Br₂: no "not built yet" note');
  // a face decided from the 3D shape: 3-tBu-cyclohexene + mCPBA → one major epoxide, Face computed, one stereoisomer
  await page.fill('#nameInput', 'CC(C)(C)[C@@H]1CCCC=C1');
  await page.click('#nameBtn');
  await page.waitForTimeout(500);
  await page.fill('#rxReagentInput', 'mCPBA'); await page.press('#rxReagentInput', 'Enter');
  await page.click('#rxPredict');
  await page.waitForFunction(() => /Face/.test(document.querySelector('#rxCards').textContent), null, { timeout: 20000 });
  const ep = await text('#rxCards .rx-card');
  ok(/major/.test(ep) && /computed from the 3D shape/.test(ep) && /one stereoisomer/.test(ep), 'mCPBA on 3-tBu-cyclohexene: major, Face computed, one stereoisomer');
  await page.setViewportSize({ width: 390, height: 844 });
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= 390), '390 px with the stereo card: no sideways scroll');
  await page.setViewportSize({ width: 1280, height: 900 });
  // S3: radical bromination of an alkane, and the radical ranking
  await page.fill('#nameInput', 'CC1CCCCC1');
  await page.click('#nameBtn');
  await page.waitForTimeout(500);
  await page.fill('#rxReagentInput', 'Br2, hv'); await page.press('#rxReagentInput', 'Enter');
  await page.click('#rxPredict');
  await page.waitForFunction(() => /radical/.test(document.querySelector('#rxCards').textContent), null, { timeout: 10000 });
  const rad = await text('#rxCards .rx-card');
  ok(/major/.test(rad) && /3° C–H/.test(rad) && /weakest/.test(rad), 'Br₂/hν on methylcyclohexane: major product from the 3° C–H');
  await page.fill('#nameInput', '[CH2]C.C[C](C)C.[CH2]C=C');
  await page.click('#nameBtn');
  await page.waitForFunction(() => !document.querySelector('#rxRank').hidden, null, { timeout: 10000 });
  await page.click('#rxRankRad');
  ok(/1.*allylic.*2.*3° radical.*3.*1° radical/s.test(await text('#rxRankList')), 'ranking mode: radicals allylic > 3° > 1°');
} catch (e) {
  ok(false, 'test crashed after "' + lastOk + '": ' + e.message.split('\n').slice(0, 6).join(' | '));
}
ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors[0] : ''));
await browser.close();
console.log(fails ? `${fails} of ${checks} checks failed` : `addition-ui: ${checks} checks passed`);
process.exit(fails ? 1 : 0);
