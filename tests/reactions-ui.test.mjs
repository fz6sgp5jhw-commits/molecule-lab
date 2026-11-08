// Reactions window + SN2 mechanism viewer, wired up in the real page (fake PubChem/OPSIN).
// Checks DOM text only (no screenshot comparison). SHOTS=1 also saves review screenshots to docs/screens/.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:8765/';
let fails = 0, checks = 0;
let lastOk = '';
const ok = (cond, label) => { checks++; lastOk = label; if (!cond){ console.log('FAIL ' + label); fails++; } };

const cors = { 'access-control-allow-origin': '*' };
async function mockServices(ctx){
  // PubChem knows nothing → products are named by namer.js and checked by OPSIN
  await ctx.route(/pubchem\.ncbi\.nlm\.nih\.gov/, (route) => route.fulfill({ status: 404, contentType: 'application/json', headers: cors, body: '{"Fault":{"Code":"PUGREST.NotFound"}}' }));
  const opsin = { '2-bromo-2-methylpropane': 'CC(C)(C)Br', '2-iodobutane': 'CCC(C)I', '(2E)-but-2-ene': 'C/C=C/C', '2-methylbut-2-ene': 'CC=C(C)C' };
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
  await page.addScriptTag({ path: new URL('./overlaps.js', import.meta.url).pathname });
  // ERRLINES=n: on a crash, print n lines of Playwright's log and what closed/changed the page (debugging aid)
  if (process.env.ERRLINES) await page.evaluate(() => { window.__mlog = []; const w = document.querySelector('#mechWin'); const hd = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'hidden'); Object.defineProperty(w, 'hidden', { set(v){ if (v) window.__mlog.push('HIDE ' + new Error().stack.split('\n').slice(2, 8).join(' < ')); hd.set.call(this, v); }, get(){ return hd.get.call(this); } }); document.addEventListener('ml:molecule', (e) => window.__mlog.push((e.detail ? e.detail.getIDCode().slice(0, 12) : 'null') + ' ' + new Error().stack.split('\n').slice(2, 6).join(' < '))); });
  await page.waitForFunction(() => document.querySelectorAll('#rxReagentChips .chip').length > 0, null, { timeout: 10000 });
  ok(await page.isHidden('#rxWin') && await page.isVisible('#viewer3d'), 'Molecule tab first: Reactions hidden');
  await page.click('.apptab[data-app="rx"]');
  ok(await page.isVisible('#rxWin') && await page.isVisible('#viewer3d') && await page.isVisible('#editor'), 'Reactions tab: Reactions, editor and Viewer shown');
  { const v = await page.locator('#viewerWin').boundingBox(), r = await page.locator('#rxWin').boundingBox();
    ok(v && r && v.x + v.width <= r.x, 'Reactions tab: the Viewer sits in the left column'); }
  ok(/Press Predict/.test(await text('#sceneAdd')), 'Viewer quick-add: hint before a prediction');

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
  ok(/poor/.test(await page.getAttribute('.mv-svg .mv-glow[data-role="ca"]', 'data-dens')) && (await text('.mv-svg')).includes('δ+'), 'blue (electron-poor) glow + δ+ on Cα');
  if (process.env.SHOTS){
    mkdirSync(new URL('../docs/screens', import.meta.url).pathname, { recursive: true });
  }
  // whole-molecule electron density (rule-based): every atom glows, every bond has its own cloud
  const attr = (sel, a) => page.getAttribute(sel, a);
  const bw = async (pair) => Number(await attr(`.mv-svg .mv-bdens[data-pair="${pair}"]`, 'data-w'));
  const noOverlap = async (where) => { const o = await page.evaluate(() => window.__mvOverlaps()); ok(!o.length, `${where}: labels clear of each other and of bonds${o.length ? ' (' + o.slice(0, 3).join(', ') + ')' : ''}`); };
  ok(await attr('.mv-svg .mv-glow[data-role="nu"]', 'data-dens') === 'rich', 'SN2 frame 1: I⁻ glows electron-rich (red)');
  ok(await page.locator('.mv-svg .mv-glow').count() >= 6, 'SN2 frame 1: a glow on every atom');
  { const ws = await page.$$eval('.mv-svg .mv-bdens', (e) => e.filter((x) => x.dataset.pair !== 'ca-lg').map((x) => +x.dataset.w));
    ok(ws.length >= 3 && (await bw('ca-lg')) < Math.min(...ws), 'SN2 frame 1: the C–Br bond cloud is thinner than the C–C bonds'); }
  ok(await page.locator('.mv-svg .mv-dipole[data-pair="ca-lg"]').count() === 1, 'SN2 frame 1: dipole arrow on C–Br');
  ok(await page.locator('.mv-svg .mv-sstar').count() === 2, 'SN2 frame 1: the empty σ* lobes behind C–Br');
  await noOverlap('SN2 frame 1');
  // layer checkboxes: each hides only its own layer, and stays off on the next frame
  const LAY = ['skeleton', 'glow', 'density', 'dipoles', 'arrows', 'orbitals', 'labels'];
  ok(await page.locator('.mv-layer').count() === LAY.length, 'seven layer checkboxes');
  const shown = (k) => page.$eval(`.mv-svg .mv-L-${k}`, (g) => getComputedStyle(g).display !== 'none');
  for (const k of LAY){
    await page.uncheck(`.mv-layer[data-layer="${k}"]`);
    const others = await Promise.all(LAY.filter((x) => x !== k).map(shown));
    ok(!(await shown(k)) && others.every(Boolean), `layer toggle "${k}" hides only that layer`);
    await page.check(`.mv-layer[data-layer="${k}"]`);
    ok(await shown(k), `layer toggle "${k}" shows it again`);
  }
  await page.uncheck('.mv-layer[data-layer="glow"]');
  await page.click('.mv-next');
  ok((await text('#mechDialog')).includes('backside attack') && await page.locator('.mv-arrow').count() === 2, 'frame 2: backside attack, two curved arrows');
  ok(!(await shown('glow')) && !(await page.isChecked('.mv-layer[data-layer="glow"]')), 'a layer switched off stays off on the next frame');
  await page.check('.mv-layer[data-layer="glow"]');
  ok(await attr('.mv-svg .mv-bdens[data-pair="ca-lg"]', 'data-state') === 'breaking' && await page.locator('.mv-svg .mv-bdens[data-state="forming"]').count() === 1, 'SN2 frame 2: C–Br starts breaking, the Nu–C cloud starts forming');
  await noOverlap('SN2 frame 2');
  await page.click('.mv-why');
  ok((await text('#mechDialog')).includes('antibonding'), 'WHY? page explains the σ* orbital');
  await page.click('.mv-dialog .term');
  ok(!(await page.isHidden('.mv-gloss')), 'glossary term opens a definition');
  await page.click('.mv-next'); // closes nothing: Next always advances (WHY 2)
  await page.click('.mv-next'); // frame 3
  ok((await text('#mechDialog')).includes('transition state') && await page.locator('.mv-bracket').count() === 1, 'frame 3: transition state with ‡ brackets');
  ok(await attr('.mv-svg .mv-bdens[data-pair="ca-lg"]', 'data-state') === 'partial' && await attr('.mv-svg .mv-bdens[data-pair="nu-ca"]', 'data-state') === 'partial', 'SN2 TS: both partial bonds have thin clouds');
  ok(await page.locator('.mv-svg .mv-pshared').count() === 2, 'SN2 TS: one p orbital shared by Nu and LG');
  await noOverlap('SN2 TS');
  ok(await page.locator('.mv-meter i.on').count() === 0, 'stability meter empty at the transition state');
  await page.click('.mv-next');
  ok(await attr('.mv-svg .mv-glow[data-role="lg"]', 'data-dens') === 'rich' && await page.locator('.mv-svg .mv-bdens[data-pair="ca-lg"]').count() === 0, 'SN2 product: Br⁻ fully electron-rich, C–Br cloud gone');
  ok(await attr('.mv-svg .mv-bdens[data-pair="nu-ca"]', 'data-state') === 'full', 'SN2 product: the new C–I bond has a full cloud');
  await noOverlap('SN2 product');
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

  // ---------- Session 3: SN1 (+ shift), E1, E2, activation, quiz, competing offer ----------
  await page.setViewportSize({ width: 1280, height: 900 });
  const dir = new URL('../docs/screens', import.meta.url).pathname;
  async function setup(smiles, reagent, heat){
    const prev = await text('#rxFactList');
    await page.fill('#nameInput', smiles); await page.click('#nameBtn');
    await page.waitForFunction((p) => document.querySelector('#rxFactList').textContent !== p, prev, { timeout: 10000 }).catch(() => {});
    await page.fill('#rxReagentInput', reagent); await page.press('#rxReagentInput', 'Enter');
    if ((await page.getAttribute('#rxHeat', 'aria-pressed')) !== String(heat)) await page.click('#rxHeat');
    await page.click('#rxPredict');
    await page.waitForSelector('#rxOut:not([hidden])');
  }
  const dialog = () => text('#mechDialog .mv-text');
  // review screenshots of the mechanism window at laptop and phone width (SHOTS=1 only)
  async function phoneToo(name){
    await page.locator('#mechWin').screenshot({ path: `${dir}/${name}-desktop.png` });
    await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300);
    await page.locator('#mechWin').screenshot({ path: `${dir}/${name}-phone.png` });
    await page.setViewportSize({ width: 1280, height: 900 }); await page.waitForTimeout(300);
  }
  const steps = async () => Number((await text('.mv-step')).match(/\/(\d+)/)[1]);
  // step to the end, collecting each frame's dialog text
  async function walk(onFrame){
    const seen = [];
    for (let i = 0; i < 30; i++){
      seen.push(await dialog());
      const o = await page.evaluate(() => window.__mvOverlaps());
      ok(!o.length, `${await text('#mechTitle')} ${await text('.mv-step')}: labels clear of each other and of bonds${o.length ? ' (' + o.slice(0, 3).join(', ') + ')' : ''}`);
      if (onFrame) await onFrame(i, seen[i]);
      if (await page.isDisabled('.mv-next')) break;
      await page.click('.mv-next');
    }
    return seen.join(' ¦ ');
  }

  // an unrecognised typed reagent: say so, and explain the four reagent types instead of guessing
  await page.fill('#rxReagentInput', 'sodium unobtainium'); await page.press('#rxReagentInput', 'Enter');
  const info = await text('#rxReagentInfo');
  ok(/isn’t in the reagent list/.test(info) && (info.match(/Spot it:/g) || []).length === 4 && /Bulky strong base/.test(info), 'unknown typed reagent: explains the four reagent types');
  await page.setViewportSize({ width: 390, height: 844 });
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'reagent type guide: no sideways scroll at 390 px');
  await page.setViewportSize({ width: 1280, height: 900 });

  // the substrate's name typed in the reagent box: say so, and move it on request
  await page.fill('#rxReagentInput', '2-bromo-2-methylpropane'); await page.press('#rxReagentInput', 'Enter');
  ok(/looks like the name of the substrate/.test(await text('#rxReagentInfo')), 'substrate name in the reagent box: explained');
  await page.click('.rx-use-sub');
  await page.waitForFunction(() => /3°/.test(document.querySelector('#rxFactList').textContent), null, { timeout: 10000 }).catch(() => {});
  ok(/3°/.test(await text('#rxFactList')), '"Use it as the substrate" loads it as the substrate');

  // SN1 on worksheet 3d: (1-bromoethyl)benzene + CH₃OH, heat → benzylic cation, oxonium, proton transfer, racemic
  await setup('C[C@@H](Br)c1ccccc1', 'CH3OH', true);
  ok(await page.getAttribute('.lamp[data-pw="SN1"]', 'class') === 'lamp major', 'W3d: SN1 lamp major');
  await page.click('.lamp[data-pw="SN1"]');
  await page.waitForSelector('#mechDialog');
  const n3d = await steps();
  let all = await walk(async (i, t) => {
    if (/benzylic carbocation/.test(t)){
      ok(await page.locator('.mv-porb').count() === 2, 'SN1: cation drawn with an empty p orbital');
      ok(await page.locator('.mv-svg .mv-ghostH').count() === 1 && await page.locator('.mv-svg .mv-sorb').count() === 1, 'SN1 cation: a neighbouring C–H σ lined up with the empty p (hyperconjugation)');
      ok(await attr('.mv-svg .mv-glow[data-role="ca"]', 'data-dens') === 'poor' && await page.locator('.mv-svg .mv-glow[data-dens="poor1"]').count() >= 1, 'SN1 cation: C⁺ electron-poor, its neighbours share some of the +');
    }
    if (/arrives/.test(t) && !(await page.locator('.mv-hit').count())) ok(await page.locator('.mv-svg .mv-approach').count() === 2, 'SN1: Nu can come in at either face of the empty p');
  });
  ok(/benzylic carbocation/.test(all) && /oxonium/.test(all) && !/shift:/.test(all), 'SN1 (W3d): ionise → benzylic C⁺ → oxonium, no shift step');
  ok(/both configurations/.test(all) && /not stereospecific/.test(all), 'SN1 result: racemic, not stereospecific');
  await page.waitForTimeout(600);
  ok(await page.locator('#sceneChips .chip[aria-pressed="true"]:not([data-key="substrate"])').count() === 1 && /SN1 major/.test(await text('#sceneChips .chip[aria-pressed="true"]:not([data-key="substrate"])')), 'last step (laptop): the product is added to the Viewer\'s 3D scene');
  ok(/reagent|CH₃OH/.test(await text('#sceneChips')) && /Br⁻/.test(await text('#sceneChips')), 'quick-add offers the reagent and the leaving group');
  await page.locator('#sceneChips .chip', { hasText: 'Br⁻' }).click();
  ok(await page.locator('#sceneChips .chip[aria-pressed="true"]:not([data-key="substrate"])').count() === 2, 'quick-add: a second molecule joins the scene');
  // the substrate is a chip too, and the names under the molecules can be switched off
  await page.waitForTimeout(400);
  ok(await page.getAttribute('#sceneChips .chip[data-key="substrate"]', 'aria-pressed') === 'true' && (await page.evaluate(() => window.ml3d())).models === 3, '3D scene: substrate + two molecules');
  await page.click('#sceneChips .chip[data-key="substrate"]');
  await page.waitForTimeout(300);
  { const s3 = await page.evaluate(() => window.ml3d());
    ok(await page.getAttribute('#sceneChips .chip[data-key="substrate"]', 'aria-pressed') === 'false' && s3.models === 2 && !s3.names.includes('substrate'), 'substrate chip: switches the substrate off'); }
  await page.uncheck('#sceneNames');
  await page.waitForTimeout(300);
  ok((await page.evaluate(() => window.ml3d())).names.length === 0, 'names switch: no labels under the molecules');
  await page.check('#sceneNames');
  await page.click('#sceneChips .chip[data-key="substrate"]');
  await page.waitForTimeout(300);
  { const s3 = await page.evaluate(() => window.ml3d());
    ok(s3.models === 3 && s3.names.length === 3 && s3.names.includes('substrate'), 'substrate and names back on'); }
  ok((await text('.mv-offer')).includes('E1 also competes'), 'SN1 end: offers the competing E1');
  await page.check('.mv-skipbox');
  ok(await steps() === n3d - 1, 'Skip proton transfers removes the oxonium deprotonation');
  await page.uncheck('.mv-skipbox');
  await page.click('.mv-offer button');
  await page.waitForFunction(() => /E1 mechanism/.test(document.querySelector('#mechTitle').textContent));
  all = await walk();
  ok(/start the same way/.test(all) && /weak base/.test(all) && /E1 is not/.test(all), 'E1 (from the offer): ionise → base takes β-H → alkene');

  // Worksheet 4: the ring-expansion ether, opened from its own ▶ Watch button, with the quiz on
  await setup('CC(Br)C1(C)CCCC1', 'EtOH', true);
  const ringCard = page.locator('#rxCards .rx-card', { hasText: 'ring expansion' }).filter({ hasText: 'SN1' }).first();
  await ringCard.locator('.rx-watch').click();
  await page.waitForSelector('#mechDialog');
  await page.check('.mv-quizbox');
  let quizzed = 0, shot = false;
  all = await walk(async (i, t) => {
    if (await page.locator('.mv-qbtn').count()){
      ok(/rearrange/.test(t), 'quiz: "will this cation shift?"');
      await page.click('.mv-qbtn >> text=Yes');
      ok(/Right!/.test(await dialog()), 'quiz: Yes is right for W4 (it shifts)'); quizzed++;
      // review finding 4: rebuilding the frame list must not forget which questions were answered
      await page.check('.mv-skipbox');
      ok(await page.locator('.mv-qbtn').count() === 0, 'answered quiz is not asked again after "Skip proton transfers"');
      await page.uncheck('.mv-skipbox');
    } else if (await page.locator('.mv-hit').count()){
      ok(/which carbon/i.test(t), 'quiz: tap the carbon the Nu bonds to');
      await page.locator('.mv-hit').first().click();
      ok(/Right!|Not quite/.test(await dialog()) && await page.locator('.mv-correct').count() === 1, 'quiz: tap answered and the right atom is ringed'); quizzed++;
    }
    if (/^Done: the ring/.test(await dialog())){
      ok(await page.locator('.mv-svg [data-bond="ca-g"]').count() > 0, 'ring expansion: the migrated ring bond is drawn to Cα');
      if (process.env.SHOTS && !shot){ shot = true; await phoneToo('sn1-ring-expansion-frame'); }
    }
  });
  ok(quizzed === 2, `W4 SN1 asks two quiz questions (got ${quizzed})`);
  ok(/ring expansion/.test(all) && /New cation: 3°/.test(all), 'W4: ring expansion step, 2° → 3° cation');
  ok((await text('.mv-result')).includes('cyclohexane'), 'W4: product card is the cyclohexane ether');
  // Load into editor: the mechanism stays, marked as for the earlier substrate
  await page.click('.mv-result .rx-load');
  await page.waitForTimeout(500);
  ok(await page.isVisible('#mechDialog') && /earlier substrate/.test(await text('#rxStale')), 'Load into editor: mechanism kept, marked as the earlier substrate');
  await page.click('.mv-back');
  ok(/./.test(await dialog()), 'kept mechanism still steps');
  await page.uncheck('.mv-quizbox');

  // E2: 2-bromobutane + NaOEt, heat → Zaitsev, anti-periplanar H drawn, three arrows
  await setup('CCC(C)Br', 'NaOEt', true);
  await page.click('.lamp[data-pw="E2"]');
  await page.waitForSelector('#mechDialog');
  all = await walk(async (i, t) => {
    if (/anti-periplanar/.test(t)){
      ok(await page.locator('.mv-svg [data-atom="hb"]').count() === 1, 'E2: the β-H is drawn');
      ok(await page.locator('.mv-svg .mv-sorb').count() === 1 && await page.locator('.mv-svg .mv-sstar').count() === 2, 'E2: σ C–H lined up with the C–Br σ*');
    }
    if (/half-formed/.test(t)) ok(await page.locator('.mv-svg .mv-piorb.mv-forming').count() === 2 && await page.locator('.mv-svg .mv-pfill').count() === 4, 'E2 TS: two p orbitals overlapping (π forming)');
    if (/^The alkene is made/.test(t)) ok(await page.locator('.mv-svg .mv-piorb:not(.mv-forming)').count() === 2 && await attr('.mv-svg .mv-glow[data-role="lg"]', 'data-dens') === 'rich', 'E2 product: π bond drawn, Br⁻ electron-rich');
    if (/Three curved arrows/.test(t)){
      ok(await page.locator('.mv-arrow').count() === 3, 'E2: three curved arrows');
      if (process.env.SHOTS) await phoneToo('e2-frame');
    }
  });
  ok(/strong \[?base/.test(all) && /anti-periplanar/.test(all) && /Zaitsev/.test(all), 'E2: base, anti-periplanar, Zaitsev');
  ok((await text('.mv-result')).includes('but-2-ene'), 'E2: product card but-2-ene');
  ok((await text('.mv-offer')).includes('SN2 also competes'), 'E2 end: offers the competing SN2');

  // E1 with an activation prelude: 2-methylbutan-2-ol + H₂SO₄, heat
  await setup('CCC(C)(C)O', 'H2SO4', true);
  await page.click('.lamp[data-pw="E1"]');
  await page.waitForSelector('#mechDialog');
  ok(/alcohol activation/.test(await dialog()) && /proton transfer/.test(await text('.mv-step')), 'acid: protonation prelude, marked as a proton transfer');
  await page.check('.mv-skipbox');
  ok(/OH₂⁺/.test(await dialog()), 'skipping proton transfers starts at the loss of water');
  all = await walk();
  ok(/E1 is not/.test(all) && (await text('.mv-result')).includes('2-methylbut-2-ene'), 'E1 (acid): Zaitsev alkene 2-methylbut-2-ene');
  await page.uncheck('.mv-skipbox');

  // HBr on a 2° alcohol (seed 12): protonation, then SN1 with a hydride shift (the H travels on an arc)
  await setup('CC(C)C(C)O', 'HBr', false);
  await page.click('.lamp[data-pw="SN1"]');
  await page.waitForSelector('#mechDialog');
  all = await walk(async (i, t) => { if (/^Done: the H/.test(t)) ok(await page.locator('.mv-svg [data-bond="ca-gh"]').count() > 0, 'hydride shift: the H is now bonded to Cα'); });
  ok(/hydride shift/.test(all) && /New cation: 3°/.test(all) && /Br⁻ arrives/.test(all), 'HBr: hydride shift 2° → 3°, then Br⁻ attacks');
  ok((await text('.mv-result')).includes('2-bromo-2-methylbutane'), 'HBr: product 2-bromo-2-methylbutane');

  // allylic SN1: one resonance frame with two structures; either end is right in the tap quiz
  await setup('C=CC(C)Br', 'EtOH', true);
  await page.locator('#rxCards .rx-card', { hasText: 'allylic' }).first().locator('.rx-watch').click();
  await page.waitForSelector('#mechDialog');
  await page.check('.mv-quizbox');
  let taps = 0;
  all = await walk(async (i, t) => {
    if (/shared between both ends/.test(t)) ok(await page.locator('.mv-svg .mv-form').count() === 2 && (await text('.mv-svg')).includes('↔'), 'allylic: resonance frame draws two structures');
    if (await page.locator('.mv-qbtn').count()) ok(false, 'allylic: no "will it shift?" question');
    if (await page.locator('.mv-hit').count()){
      taps++;
      const atoms = await page.$$eval('.mv-hit', (h) => h.map((x) => +x.dataset.hit));
      await page.locator('.mv-hit').nth(atoms.length - 1).click(); // any atom; then the ring shows both ends
      ok(await page.locator('.mv-correct').count() === 2, 'allylic quiz: both ends are marked right');
      ok(/Either end/.test(await dialog()), 'allylic quiz explains that either end can react');
    }
  });
  ok(taps === 1, `allylic SN1 asks one tap question (got ${taps})`);
  await page.uncheck('.mv-quizbox');

  // PBr₃ on butan-1-ol (seed 15): O attacks P, then Br⁻ does SN2
  await setup('CCCCO', 'PBr3', false);
  await page.click('.lamp[data-pw="SN2"]');
  await page.waitForSelector('#mechDialog');
  all = await walk();
  ok(/attacks phosphorus/.test(all) && /HOPBr₂/.test(all) && /backside attack/.test(all), 'PBr₃: activation, then SN2 with HOPBr₂ leaving');

  // SOCl₂ on butan-2-ol: O attacks S, Cl⁻ leaves, pyridine deprotonates, then Cl⁻ does SN2.
  // Chlorine is drawn in VT323 (l with a flag and foot, I with serifs) on cards, chips and in the drawing.
  await setup('CCC(C)O', 'SOCl2', false);
  await page.click('.lamp[data-pw="SN2"]');
  await page.waitForSelector('#mechDialog');
  all = await walk();
  ok(/attacks sulfur/.test(all) && /chlorosulfite/.test(all) && /backside attack/.test(all), 'SOCl₂: activation (chlorosulfite), then SN2 by Cl⁻');
  const fam = (sel) => page.$eval(sel, (e) => getComputedStyle(e).fontFamily);
  ok(/^"?VT323/.test(await fam('#rxCards .rx-draw svg text')) && (await text('#rxCards .rx-draw svg')).includes('Cl'), 'Cl on the result card drawing is in VT323');
  ok(/^"?VT323/.test(await fam('.mv-svg text.mv-atom')), 'mechanism atom symbols are in VT323');
  { const chip = page.locator('#sceneChips .chip', { hasText: 'SOCl' }).first();
    ok(await chip.locator('.chem').count() === 1 && /^"?VT323/.test(await chip.locator('.chem').evaluate((e) => getComputedStyle(e).fontFamily)), 'Cl in a chip label is set in VT323'); }
  ok(!(await page.evaluate(() => [...document.querySelectorAll('.chem')].some((e) => e.textContent !== 'Cl'))), 'only "Cl" is re-fonted (not words like "Click")');

  // review finding 3: a drawn, uncatalogued reagent (isopropanol) is named by its formula, never "(drawn reagent)"
  await page.fill('#nameInput', 'CC(C)(C)Br'); await page.click('#nameBtn');
  await page.waitForFunction(() => /3°/.test(document.querySelector('#rxFactList').textContent), null, { timeout: 10000 }).catch(() => {});
  await page.click('#rxDrawBox summary');
  await page.waitForTimeout(300);
  await page.evaluate(async () => {
    const api = await window.reactions, m = api.st.ed.getMolecule();
    const a = [6, 6, 6, 8].map((z) => m.addAtom(z)); m.addBond(a[0], a[1]); m.addBond(a[1], a[2]); m.addBond(a[1], a[3]);
    m.inventCoordinates(); api.st.ed.setMolecule(m); api.drawnReagent();
  });
  ok(/Drawn reagent/.test(await text('#rxReagentInfo')), 'drawn isopropanol: recognised as a drawn reagent');
  await page.click('#rxSolvents [data-solvent="EtOH"]');
  if ((await page.getAttribute('#rxHeat', 'aria-pressed')) !== 'true') await page.click('#rxHeat');
  await page.click('#rxPredict');
  await page.waitForSelector('#rxOut:not([hidden])');
  await page.click('.lamp[data-pw="SN1"]');
  await page.waitForSelector('#mechDialog');
  { const seen = [];
    for (let i = 0; i < 12; i++){ seen.push(await text('.mv-svg')); if (await page.isDisabled('.mv-next')) break; await page.click('.mv-next'); }
    const svgText = seen.join(' ');
    ok(!/drawn reagent/.test(svgText) && /C₃H₈O/.test(svgText), 'drawn reagent: the mechanism labels it by formula (C₃H₈O), not "(drawn reagent)"'); }
  await page.click('#rxDrawBox summary');

  // Ch 6 test 2a: 3° benzylic + NaCN in DMSO → SN1 major (course rule), E1 minor with CN⁻ as the base
  await setup('CC[C@](C)(Br)c1ccccc1', 'NaCN', true);
  ok(await page.getAttribute('.lamp[data-pw="SN1"]', 'class') === 'lamp major' && await page.getAttribute('.lamp[data-pw="E1"]', 'class') === 'lamp minor', 'test 2a: SN1 major, E1 minor');
  await page.click('.lamp[data-pw="E1"]');
  await page.waitForSelector('#mechDialog');
  all = await walk();
  ok(/weak base \(CN⁻\)/.test(all), 'E1 in DMSO: CN⁻ is the base, not the solvent');

  // TsCl: step 1 on its own (retention)
  await setup('CC[C@@H](C)O', 'TsCl', false);
  await page.click('#rxCards .rx-watch');
  await page.waitForSelector('#mechDialog');
  all = await walk();
  ok(/tosyl chloride/.test(all) && /retention/.test(all), 'TsCl activation: O attacks S, C–O kept (retention)');

  // ranking mode: two molecules in the editor
  await page.fill('#nameInput', 'CCBr.CC(C)(C)Br');
  await page.click('#nameBtn');
  await page.waitForFunction(() => !document.querySelector('#rxRank').hidden, null, { timeout: 10000 });
  await page.click('#rxRankSN2');
  const rank = await text('#rxRankList');
  ok(/1.*1°.*3°: backside attack blocked/s.test(rank), 'ranking mode: SN2 order 1° first, 3° none');
} catch (e) {
  if (process.env.ERRLINES) console.log('STATE', JSON.stringify(await page.evaluate(() => ({ mech: !document.querySelector('#mechWin').hidden, nexts: document.querySelectorAll('.mv-next').length, title: document.querySelector('#mechTitle').textContent, mount: document.querySelector('#mechMount').textContent.slice(0, 200), step: document.querySelector('.mv-step') && document.querySelector('.mv-step').textContent, mlog: (window.__mlog || []).slice(-3) }))));
  ok(false, 'test crashed after "' + lastOk + '": ' + e.message.split('\n').slice(0, +(process.env.ERRLINES || 12)).join(' | '));
}
ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors[0] : ''));
await browser.close();
console.log(fails ? `${fails} of ${checks} checks failed` : `reactions-ui: ${checks} checks passed`);
process.exit(fails ? 1 : 0);
