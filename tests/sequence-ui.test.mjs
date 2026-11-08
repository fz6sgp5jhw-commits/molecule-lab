// Multistep sequences + the "Which pathway wins?" grid, wired up in the real page (fake PubChem/OPSIN).
// DOM text only. SHOTS=1 also saves review screenshots to docs/screens/.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:8765/';
let fails = 0, checks = 0, lastOk = '';
const ok = (cond, label) => { checks++; lastOk = label; if (!cond){ console.log('FAIL ' + label); fails++; } };
const cors = { 'access-control-allow-origin': '*' };
const dir = new URL('../docs/screens/', import.meta.url).pathname;

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
await ctx.route(/pubchem\.ncbi\.nlm\.nih\.gov/, (r) => r.fulfill({ status: 404, contentType: 'application/json', headers: cors, body: '{"Fault":{"Code":"PUGREST.NotFound"}}' }));
await ctx.route(/(ebi\.ac\.uk\/opsin|opsin\.ch\.cam\.ac\.uk)/, (r) => r.fulfill({ status: 404, contentType: 'application/json', headers: cors, body: '{"status":"FAILURE","smiles":""}' }));
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
const text = (s) => page.textContent(s);
page.setDefaultTimeout(5000);

try {
  await page.goto(BASE + '#reactions');
  await page.waitForSelector('#boot', { state: 'detached', timeout: 20000 });
  await page.waitForFunction(() => document.querySelectorAll('#rxReagentChips .chip').length > 0, null, { timeout: 10000 });

  // ---------- seed 17 typed on one line ----------
  await page.fill('#nameInput', 'C[C@@H](O)CC');
  await page.click('#nameBtn');
  await page.waitForFunction(() => /alcohol|OH/.test(document.querySelector('#rxFactList').textContent), null, { timeout: 10000 });
  await page.fill('#rxReagentInput', '1) TsCl, py 2) NaCN, DMSO');
  await page.press('#rxReagentInput', 'Enter');
  ok(await page.locator('#rxSteps .rx-steptab').count() === 2, 'typed sequence fills two step tabs');
  ok(/1\) TsCl, pyridine/.test(await text('#rxSteps')) && /2\) NaCN, DMSO/.test(await text('#rxSteps')), 'step tabs show reagent + solvent');
  await page.click('#rxPredict');
  await page.waitForSelector('#rxChain:not([hidden])');
  ok(await page.locator('#rxChain .rx-cstep').count() === 2, 'chain strip: two steps');
  ok(/activated/.test(await text('#rxChain')) && /SN2/.test(await text('#rxChain')), 'chain: activation, then SN2');
  ok(/step 2 of 2/i.test(await text('#rxChainView')), 'chain shows the last step by default');
  await page.waitForFunction(() => /\(2S\)-2-methylbutanenitrile/.test(document.querySelector('#rxCards').textContent), null, { timeout: 10000 });
  ok((await text('#rxCards')).includes('inversion'), 'step 2 card: (2S)-nitrile, inversion');
  ok(await page.getAttribute('.lamp[data-pw="SN2"]', 'class') === 'lamp major', 'step 2 lamps: SN2 major');
  // step 1 view
  await page.click('#rxChain .rx-cstep[data-k="0"]');
  ok(/retention/.test(await text('#rxCards')) && /goes on to step 2/.test(await text('#rxCards')), 'step 1 card: tosylate, retention, carried on');
  if (process.env.SHOTS){ mkdirSync(dir, { recursive: true }); await page.locator('#rxWin').screenshot({ path: `${dir}/sequence-desktop.png` }); }
  // watch all steps: step 1 (tosylation), then the bridge page and step 2
  await page.click('#rxPlayChain');
  await page.waitForSelector('#mechDialog');
  ok(/Step 1 of 2: tosylation/.test(await text('#mechTitle')), 'mechanism title: Step 1 of 2: tosylation');
  for (let i = 0; i < 30 && !(await page.locator('.mv-offer button', { hasText: 'Step 2' }).count()); i++) await page.click('.mv-next');
  ok(await page.locator('.mv-offer button', { hasText: 'Step 2' }).count() === 1, 'end of step 1 offers step 2');
  await page.click('.mv-offer button:has-text("Step 2")');
  await page.waitForFunction(() => /Step 2 of 2: SN2/.test(document.querySelector('#mechTitle').textContent));
  ok(/better/.test(await text('#mechDialog')) && /TsO⁻/.test(await text('#mechDialog')), 'between steps: why OTs is a better leaving group');
  ok(/Between steps/.test(await text('.mv-step')), 'between-steps page is labelled');

  // ---------- pick a minor product: HBr (shift) → NaOEt, heat ----------
  await page.fill('#nameInput', 'CC(C)C(C)O');
  await page.click('#nameBtn');
  await page.waitForFunction(() => document.querySelector('#rxChain').hidden, null, { timeout: 10000 });
  await page.fill('#rxReagentInput', '1) HBr 2) NaOEt, EtOH, heat');
  await page.press('#rxReagentInput', 'Enter');
  await page.click('#rxPredict');
  await page.waitForSelector('#rxChain:not([hidden])');
  await page.click('#rxChain .rx-cstep[data-k="0"]');
  ok(await page.locator('#rxCards .rx-continue').count() === 1, 'step 1: the unshifted (minor) product can be picked');
  await page.click('#rxCards .rx-continue');
  ok(/your pick/.test(await text('#rxChain')), 'chain marks the picked product');

  // ---------- out of scope: stops with the reason ----------
  await page.fill('#nameInput', 'CC(C)(C)O');
  await page.click('#nameBtn');
  await page.waitForFunction(() => document.querySelector('#rxChain').hidden, null, { timeout: 10000 });
  await page.fill('#rxReagentInput', '1) PBr3 2) NaI, acetone');
  await page.press('#rxReagentInput', 'Enter');
  await page.click('#rxPredict');
  await page.waitForSelector('#rxChain:not([hidden])');
  ok(/stopped/.test(await text('#rxChain')) && /not run/.test(await text('#rxChain')), 'chain stops at step 1; step 2 not run');
  ok(/Not covered yet/.test(await text('#rxNotes')), 'stopped step says not covered yet, with why');

  // ---------- Which pathway wins? ----------
  ok(await page.locator('#pwTable tbody tr').count() === 9 && await page.locator('#pwTable tbody .pw-cell').count() === 63, 'grid: 9 classes × 7 reagent types');
  await page.click('#pwTable .pw-cell[data-r="2"][data-c="nucbase"]');
  ok(/E2/.test(await text('#pwDetail')) && /disagree/i.test(await text('#pwDetail')), 'cell 2° × strong base: E2 major, textbooks disagree flag');
  await page.click('#pwConds [data-solv="protic"]'); await page.click('#pwHeat');
  await page.click('#pwTable .pw-cell[data-r="3"][data-c="weak"]');
  ok(/Course rule/.test(await text('#pwDetail')) && /SN1/.test(await text('#pwDetail')), 'cell 3° × weak, protic + heat: course rule SN1');
  ok(/With other conditions/.test(await text('#pwDetail')), 'cell shows how it changes with conditions');
  if (process.env.SHOTS) await page.locator('#pwWin').screenshot({ path: `${dir}/pathway-grid-desktop.png` });
  await page.click('#pwTry');
  await page.waitForSelector('#rxOut:not([hidden])');
  ok(await page.getAttribute('.lamp[data-pw="SN1"]', 'class') === 'lamp major' && await page.getAttribute('.lamp[data-pw="E1"]', 'class') === 'lamp competing', 'Try it: loads the example, Predict agrees (SN1 major, E1 competing)');
  ok(await page.inputValue('#rxReagentInput') === 'EtOH' && await page.getAttribute('#rxHeat', 'aria-pressed') === 'true', 'Try it: reagent box and heat filled');

  // ---------- phone: 390 px, no sideways scroll; pick a substrate class first ----------
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= 390), 'phone: no sideways scroll');
  ok(await page.isHidden('#pwTable') && await page.isVisible('#pwRows'), 'phone: row picker instead of the table');
  await page.click('#pwRows [data-row="2ab"]');
  ok(await page.locator('#pwList .pw-cell').count() === 7, 'phone: the chosen row as a list');
  await page.click('#pwList .pw-cell[data-c="nucbase"]');
  await page.click('#pwConds [data-solv="aprotic"]');
  await page.click('#pwList .pw-cell[data-c="nucbase"]');
  ok(/Course rule/.test(await text('#pwDetail')) && /SN2/.test(await text('#pwDetail')), 'phone: 2° allylic/benzylic + alkoxide, aprotic → SN2 (course)');
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= 390), 'phone: no sideways scroll with a cell open');
  if (process.env.SHOTS) await page.locator('#pwWin').screenshot({ path: `${dir}/pathway-grid-phone.png` });
  // the sequence chain at phone width
  await page.fill('#nameInput', 'C[C@@H](O)CC');
  await page.click('#nameBtn');
  await page.waitForFunction(() => document.querySelector('#rxChain').hidden, null, { timeout: 10000 });
  await page.fill('#rxReagentInput', '1) TsCl, py 2) NaCN, DMSO');
  await page.press('#rxReagentInput', 'Enter');
  await page.click('#rxPredict');
  await page.waitForSelector('#rxChain:not([hidden])');
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= 390), 'phone: no sideways scroll with a chain');
  if (process.env.SHOTS){ await page.waitForTimeout(500); await page.locator('#rxWin').screenshot({ path: `${dir}/sequence-phone.png` }); }

  ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
} catch (e){
  console.log(`FAIL crashed after "${lastOk}": ${String(e.message).split('\n')[0]}`);
  fails++;
}
await browser.close();
if (fails){ console.log(`${fails} of ${checks} checks failed`); process.exit(1); }
console.log(`sequence-ui: ${checks} checks passed`);
