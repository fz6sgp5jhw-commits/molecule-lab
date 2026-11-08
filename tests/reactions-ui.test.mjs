// Reactions window + SN2 mechanism viewer, wired up in the real page (fake PubChem/OPSIN).
// Checks DOM text only (no screenshot comparison). SHOTS=1 also saves review screenshots to docs/screens/.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:8765/';
let fails = 0;
const ok = (cond, label) => { if (!cond){ console.log('FAIL ' + label); fails++; } };

const cors = { 'access-control-allow-origin': '*' };
async function mockServices(ctx){
  // PubChem knows nothing → products are named by namer.js and checked by OPSIN
  await ctx.route(/pubchem\.ncbi\.nlm\.nih\.gov/, (route) => route.fulfill({ status: 404, contentType: 'application/json', headers: cors, body: '{"Fault":{"Code":"PUGREST.NotFound"}}' }));
  const opsin = { '2-iodobutane': 'CCC(C)I' };
  await ctx.route(/(ebi\.ac\.uk\/opsin|opsin\.ch\.cam\.ac\.uk)/, (route) => {
    const name = decodeURIComponent(route.request().url().split('/').pop().replace(/\.json$/, ''));
    const smi = opsin[name];
    return route.fulfill({ status: smi ? 200 : 404, contentType: 'application/json', headers: cors, body: JSON.stringify(smi ? { status: 'SUCCESS', smiles: smi } : { status: 'FAILURE', smiles: '' }) });
  });
}

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
await mockServices(ctx);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
const text = (s) => page.textContent(s);
page.setDefaultTimeout(5000);

try {
  await page.goto(BASE);
  await page.waitForSelector('#boot', { state: 'detached', timeout: 20000 });
  await page.waitForFunction(() => document.querySelectorAll('#rxReagentChips .chip').length > 0, null, { timeout: 10000 });
  ok(await page.isHidden('#rxWin') && await page.isVisible('#viewer3d'), 'Molecule tab first: Reactions hidden');
  await page.click('.apptab[data-app="rx"]');
  ok(await page.isVisible('#rxWin') && await page.isHidden('#viewer3d') && await page.isVisible('#editor'), 'Reactions tab: Reactions + editor shown, viewer hidden');

  // substrate: 2-bromobutane (SMILES through the Build box)
  await page.fill('#nameInput', 'CCC(C)Br');
  await page.click('#nameBtn');
  await page.waitForFunction(() => !document.querySelector('#rxFacts').hidden && /2°/.test(document.querySelector('#rxFactList').textContent), null, { timeout: 10000 });
  ok((await text('#rxFactList')).includes('β-H’s5'), 'reactivity facts: 2°, 5 β-H’s');

  // reagent typed by name → acetone auto-filled
  await page.fill('#rxReagentInput', 'sodium iodide');
  await page.press('#rxReagentInput', 'Enter');
  ok((await page.getAttribute('#rxSolvents [data-solvent="acetone"]', 'aria-pressed')) === 'true', 'NaI auto-fills acetone');
  await page.click('#rxPredict');
  await page.waitForSelector('#rxOut:not([hidden])');
  ok(await page.getAttribute('.lamp[data-pw="SN2"]', 'class') === 'lamp major', 'SN2 lamp bright (major)');
  ok((await page.$$eval('.lamp.none', (l) => l.length)) === 3, 'SN1/E1/E2 lamps off');
  await page.click('.rx-box[data-step="rule"]');
  ok((await text('#rxPathInfo')).includes('from the back'), 'rule box explains the decision');
  await page.waitForFunction(() => /2-iodobutane/.test(document.querySelector('#rxCards').textContent), null, { timeout: 10000 });
  ok((await text('#rxCards')).includes('Stereospecific') && (await text('#rxCards')).includes('no stereocentre defined'), 'result card: stereospecific + honest stereo note');

  ok(await page.locator('#rxCards .rx-watch').count() === 1, 'result card has a Watch button');
  // mechanism (opened from the card's Watch button)
  await page.click('#rxCards .rx-watch');
  await page.waitForSelector('#mechDialog');
  ok((await text('#mechDialog')).includes('I⁻ is the nucleophile'), 'frame 1 dialog names the nucleophile');
  ok(await page.locator('.mv-svg [data-role="ca"].mv-cloud').count() === 1 && (await text('.mv-svg')).includes('δ+'), 'density cloud + δ+ on Cα');
  if (process.env.SHOTS){
    mkdirSync(new URL('../docs/screens', import.meta.url).pathname, { recursive: true });
  }
  await page.click('.mv-next');
  ok((await text('#mechDialog')).includes('backside attack') && await page.locator('.mv-arrow').count() === 2, 'frame 2: backside attack, two curved arrows');
  await page.click('.mv-why');
  ok((await text('#mechDialog')).includes('antibonding'), 'WHY? page explains the σ* orbital');
  await page.click('.mv-dialog .term');
  ok(!(await page.isHidden('.mv-gloss')), 'glossary term opens a definition');
  await page.click('.mv-next'); // closes nothing: Next always advances (WHY 2)
  await page.click('.mv-next'); // frame 3
  ok((await text('#mechDialog')).includes('transition state') && await page.locator('.mv-bracket').count() === 1, 'frame 3: transition state with ‡ brackets');
  ok(await page.locator('.mv-meter i.on').count() === 0, 'stability meter empty at the transition state');
  await page.click('.mv-next');
  await page.click('.mv-next');
  await page.waitForFunction(() => /Product: 2-iodobutane/.test(document.querySelector('#mechDialog').textContent), null, { timeout: 10000 });
  ok((await text('.mv-result')).includes('2-iodobutane'), 'final frame: product name 2-iodobutane + result card');
  ok(await page.isDisabled('.mv-next'), 'last frame: Next disabled');
  ok(await page.locator('.mv-result .rx-watch').count() === 0, 'no Watch button inside the mechanism');
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no sideways scroll (desktop)');

  if (process.env.SHOTS){
    const dir = new URL('../docs/screens', import.meta.url).pathname;
    await page.click('.mv-back'); await page.click('.mv-back'); await page.click('.mv-back');
    await page.locator('#mechWin').screenshot({ path: `${dir}/sn2-frame-desktop.png` });
    await page.locator('#rxWin').screenshot({ path: `${dir}/reactions-desktop.png` });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${dir}/reactions-tab-desktop.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no sideways scroll at 390 px');
    await page.locator('#rxWin').screenshot({ path: `${dir}/reactions-phone.png` });
    await page.locator('#mechWin').screenshot({ path: `${dir}/sn2-frame-phone.png` });
  }

  // ranking mode: two molecules in the editor
  await page.fill('#nameInput', 'CCBr.CC(C)(C)Br');
  await page.click('#nameBtn');
  await page.waitForFunction(() => !document.querySelector('#rxRank').hidden, null, { timeout: 10000 });
  await page.click('#rxRankSN2');
  const rank = await text('#rxRankList');
  ok(/1.*1°.*3°: backside attack blocked/s.test(rank), 'ranking mode: SN2 order 1° first, 3° none');
} catch (e) {
  ok(false, 'test crashed: ' + e.message.split('\n').slice(0, 12).join(' | '));
}
ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors[0] : ''));
await browser.close();
if (fails) console.log(`${fails} failure(s)`);
process.exit(fails ? 1 : 0);
