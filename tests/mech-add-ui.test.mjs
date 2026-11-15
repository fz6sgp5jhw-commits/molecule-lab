// Ch 8/10 mechanism viewer (S4), wired up in the real page (fake PubChem/OPSIN). DOM text and SVG attributes only.
// Opens each addition / radical / epoxide-opening template once from the card's ▶ Watch button, steps through every
// frame and checks it for overlapping labels (overlaps.js), plus one or two template-specific drawing checks.
// Then the quiz: one tap quiz (Markovnikov H) and one choice quiz (B and H on the same face).
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:8765/';
let fails = 0, checks = 0, lastOk = '';
const ok = (cond, label) => { checks++; lastOk = label; if (!cond){ console.log('FAIL ' + label); fails++; } };
const cors = { 'access-control-allow-origin': '*' };

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
await ctx.route(/pubchem\.ncbi\.nlm\.nih\.gov/, (route) => route.fulfill({ status: 404, contentType: 'application/json', headers: cors, body: '{"Fault":{"Code":"PUGREST.NotFound"}}' }));
await ctx.route(/(ebi\.ac\.uk\/opsin|opsin\.ch\.cam\.ac\.uk)/, (route) => route.fulfill({ status: 404, contentType: 'application/json', headers: cors, body: '{"status":"FAILURE","smiles":""}' }));
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
page.setDefaultTimeout(8000);
const text = (s) => page.textContent(s);
const count = (s) => page.locator(s).count();

async function setup(smiles, reagent){
  const prev = await text('#rxFactList').catch(() => '');
  await page.fill('#nameInput', smiles); await page.click('#nameBtn');
  await page.waitForFunction((p) => document.querySelector('#rxFactList').textContent !== p, prev, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(300);
  await page.fill('#rxReagentInput', reagent); await page.press('#rxReagentInput', 'Enter');
  await page.click('#rxPredict');
  await page.waitForFunction(() => document.querySelector('#rxCards .rx-watch'), null, { timeout: 25000 });
}
// open the first card's mechanism, then walk every frame: overlap check + onFrame(i, dialog text)
async function watch(label, onFrame){
  await page.click('#rxCards .rx-watch');
  await page.waitForSelector('#mechDialog');
  const seen = [];
  for (let i = 0; i < 30; i++){
    const t = await text('#mechDialog .mv-text');
    seen.push(t);
    ok(!/missing text/.test(t), `${label} step ${i + 1}: has its text`);
    const o = await page.evaluate(() => window.__mvOverlaps());
    ok(!o.length, `${label} step ${i + 1}: labels clear of each other and of bonds${o.length ? ' (' + o.slice(0, 3).join(', ') + ')' : ''}`);
    if (onFrame) await onFrame(i, t);
    if (await page.isDisabled('.mv-next')) break;
    await page.click('.mv-next');
  }
  return seen.join(' ¦ ');
}
const fish = () => count('.mv-svg path.mv-arrow[data-kind="fishhook"]');

try {
  await page.goto(BASE);
  await page.waitForSelector('#boot', { state: 'detached', timeout: 20000 });
  await page.addScriptTag({ path: new URL('./overlaps.js', import.meta.url).pathname });
  await page.evaluate(() => { try { localStorage.setItem('ml-mech-quiz', '0'); } catch {} });
  await page.waitForFunction(() => document.querySelectorAll('#rxReagentChips .chip').length > 0, null, { timeout: 10000 });
  await page.click('.apptab[data-app="rx"]');

  // addHX: 1-methylcyclopentene + HBr → H on the CH, 3° C⁺, Br⁻ bonds to it
  await setup('CC1=CCCC1', 'HBr');
  let cation = false, plus = false;
  let all = await watch('addHX', async (i, t) => {
    if (/carbocation/.test(t)){ cation = true; plus = (await page.locator('.mv-svg .mv-charge[data-role="ca"]').textContent().catch(() => '')) === '+'; }
  });
  ok(cation && plus, 'addHX: a carbocation frame with + on the cation carbon');
  ok(/Markovnikov product/.test(all) && /Product \(major\)/.test(all), 'addHX: ends on the Markovnikov product');

  // addHX with a methyl shift: 3,3-dimethylbut-1-ene + HCl
  await setup('C=CC(C)(C)C', 'HCl');
  all = await watch('addHX shift');
  ok(/shift/i.test(all), 'addHX: the 1,2-shift frames play for the shifted product');

  // hydration: H₃O⁺ → oxonium, then a proton transfer step
  await setup('CC(C)=C', 'H3O+');
  all = await watch('hydration');
  ok(/H₃O⁺/.test(all) && /oxonium/.test(all) && /Proton transfer/.test(all), 'hydration: H₃O⁺, oxonium ion, proton transfer');

  // halonium: cyclohexene + Br₂ → bridged ion (two bonds to the bridging Br, + on it), anti
  await setup('C1=CCCCC1', 'Br2');
  let bridge = false;
  all = await watch('halonium', async (i, t) => {
    if (/^A bridged/.test(t)) bridge = (await page.locator('.mv-svg .mv-charge[data-role="e"]').textContent().catch(() => '')) === '+'
      && (await count('.mv-svg line[data-bond="e-a"]')) >= 1 && (await count('.mv-svg line[data-bond="e-b"]')) >= 1;
  });
  ok(bridge, 'halonium: bridged Br⁺ bonded to both carbons');
  ok(/anti addition/.test(all), 'halonium: ends with anti addition');

  // halohydrin: 1-methylcyclopentene + Br₂/H₂O → water at the more substituted carbon, then loses H⁺
  await setup('CC1=CCCC1', 'Br2, H2O');
  all = await watch('halohydrin');
  ok(/more substituted carbon/.test(all) && /Proton transfer/.test(all), 'halohydrin: water at the more substituted carbon, proton transfer');

  // hbrRadical: 2-methylpent-1-ene + HBr/ROOR → fishhooks, radical dots, chain
  await setup('C=C(C)CCC', 'HBr, ROOR');
  let hooks = 0, dots = 0;
  all = await watch('hbrRadical', async () => { hooks = Math.max(hooks, await fish()); dots = Math.max(dots, await count('.mv-svg .mv-rad')); });
  ok(hooks >= 2 && dots >= 1, `hbrRadical: fishhook arrows and radical dots (${hooks}, ${dots})`);
  ok(/Initiation/.test(all) && /Propagation 1/.test(all) && /Propagation 2/.test(all), 'hbrRadical: initiation, propagation 1 and 2');

  // radicalHalogenation: methylcyclohexane + Br₂/hν → the 3° C–H, radical carbon only somewhat electron-poor
  await setup('CC1CCCCC1', 'Br2, hv');
  let radDens = '';
  all = await watch('radicalHalogenation', async (i, t) => {
    if (/carbon radical/.test(t)) radDens = await page.getAttribute('.mv-svg .mv-glow[data-role="a"]', 'data-dens');
  });
  ok(radDens === 'poor1', `radical carbon glows somewhat electron-poor, one level only (got ${radDens})`);
  ok(/3° carbon radical/.test(all), 'radicalHalogenation: a 3° carbon radical');

  // hydroboration: 1-methylcyclohexene → four-centre TS, organoborane, oxidation summary
  await setup('CC1=CCCCC1', 'hydroboration');
  let ts4 = false;
  all = await watch('hydroboration', async (i, t) => { if (/four-centre/.test(t)) ts4 = (await count('.mv-svg .mv-ts4')) === 1; });
  ok(ts4, 'hydroboration: the four-centre transition state is shaded');
  ok(/organoborane/.test(all) && /retention/.test(all), 'hydroboration: organoborane, then B → OH with retention');

  // hydrogenation: 1-methylcyclohexene + H₂/Pd → metal surface bar
  await setup('CC1=CCCCC1', 'H2, Pd');
  let surface = false;
  all = await watch('hydrogenation', async (i) => { if (i === 0) surface = (await count('.mv-svg .mv-surface')) === 1; });
  ok(surface && /syn addition/.test(all), 'hydrogenation: metal surface drawn, syn addition');

  // epoxidation: cis-pent-2-ene + mCPBA → butterfly (four arrows), cis epoxide
  await setup('CC/C=C\\C', 'mCPBA');
  let four = 0;
  all = await watch('epoxidation', async (i, t) => { if (/Four arrows/.test(t)) four = await count('.mv-svg path.mv-arrow'); });
  ok(four === 4, `epoxidation: four arrows in the butterfly step (got ${four})`);
  ok(/epoxide/.test(all) && /cis epoxide/.test(all), 'epoxidation: ends with the epoxide, cis stays cis');

  // ozonolysis: 2-methylpent-2-ene → C=C cut, two pieces moved apart
  await setup('CC=C(C)CC', 'O3, DMS');
  all = await watch('ozonolysis');
  ok(/cut/.test(all), 'ozonolysis: the C=C is cut');

  // epoxide opening with acid and with base
  await setup('C[C@@H]1O[C@@H]1C', 'H3O+');
  all = await watch('epoxideOpening acid');
  ok(/takes H⁺ from H₃O⁺/.test(all) && /trans/.test(all), 'epoxide + H₃O⁺: protonation, then anti opening (trans)');
  await setup('CC1(C)OC1', 'NaOH');
  all = await watch('epoxideOpening base');
  ok(/less substituted/.test(all) && /alkoxide/.test(all), 'epoxide + HO⁻: less substituted carbon, alkoxide, proton transfer');

  // quiz: tap the carbon H⁺ bonds to (addHX), and a choice quiz (hydroboration: same face)
  await page.evaluate(() => { try { localStorage.setItem('ml-mech-quiz', '1'); } catch {} });
  await setup('CC1=CCCC1', 'HBr');
  await page.click('#rxCards .rx-watch');
  await page.waitForSelector('#mechMount[data-quiz="pending"]');
  ok(/which C=C carbon will the H⁺ bond to/.test(await text('#mechDialog .mv-text')), 'quiz: asks which carbon gets the H');
  // the CH of the ring C=C (atom 3 in the SMILES order, index 2): the right answer
  await page.locator('.mv-svg .mv-hit[data-hit="2"]').click();
  ok(await page.getAttribute('#mechMount', 'data-quiz') === 'right', 'quiz: tapping the CH carbon is right');
  await setup('CC1=CCCCC1', 'hydroboration');
  await page.click('#rxCards .rx-watch');
  await page.waitForSelector('#mechDialog');
  for (let i = 0; i < 8 && !(await page.$('.mv-qbtn')); i++) await page.click('.mv-next');
  const btns = await page.$$eval('.mv-qbtn', (b) => b.map((x) => x.textContent));
  ok(btns.join() === 'Same face,Opposite faces', `choice quiz buttons (got ${btns.join()})`);
  await page.click('.mv-qbtn >> text=Same face');
  ok(await page.getAttribute('#mechMount', 'data-quiz') === 'right', 'choice quiz: Same face is right');
  await page.evaluate(() => { try { localStorage.setItem('ml-mech-quiz', '0'); } catch {} });

  // a 390 px phone: no sideways scrolling with the viewer open
  await page.setViewportSize({ width: 390, height: 844 });
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= 390), '390 px with an addition mechanism open: no sideways scroll');
} catch (e) {
  ok(false, 'test crashed after "' + lastOk + '": ' + e.message.split('\n').slice(0, 6).join(' | '));
}
ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors[0] : ''));
await browser.close();
console.log(fails ? `${fails} of ${checks} checks failed` : `mech-add-ui: ${checks} checks passed`);
process.exit(fails ? 1 : 0);
