import { mkdirSync } from 'node:fs';
mkdirSync(new URL('./shots', import.meta.url).pathname, { recursive: true });
import { chromium } from 'playwright';
let fails = 0; const ok = (c, l) => { console.log((c ? 'PASS ' : 'FAIL ') + l); if (!c) fails++; };
const b = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
for (const [vw, tag] of [[{ width: 1280, height: 900 }, 'desk'], [{ width: 390, height: 844 }, 'phone']]){
  const ctx = await b.newContext({ viewport: vw, deviceScaleFactor: tag === 'phone' ? 2 : 1 });
  await ctx.route(/pubchem|opsin/, r => r.abort());
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto((process.env.BASE_URL || 'http://localhost:8765/')); await p.waitForSelector('#boot', { state: 'detached' });
  const load = async (smi) => { await p.fill('#nameInput', smi); await p.click('#nameBtn'); await p.waitForTimeout(500); };
  const waitChair = async () => p.waitForFunction(() => document.querySelector('#chairInfo').innerHTML.length > 0 || /No cyclo|Couldn/.test(document.querySelector('#overlayChair').textContent), null, { timeout: 20000 });
  await load('CC(C)[C@@H]1CC[C@@H](C)C[C@H]1O');
  await p.click('.tab[data-view="vchair"]');
  await waitChair();
  const info = await p.textContent('#chairInfo');
  ok(/Chair A is more stable by [3-5]\.\d kcal\/mol/.test(info), `${tag}: menthol energy line: ${info.slice(0, 90)}`);
  const rowsA = await p.$$eval('#chairInfo tbody tr', rs => rs.map(r => r.innerText.replace(/\s+/g, ' ')));
  ok(rowsA.length === 3 && rowsA.every(r => /equatorial.*axial/.test(r)), `${tag}: all three groups equatorial in A, axial after flip: ${JSON.stringify(rowsA)}`);
  ok((await p.textContent('#chairTag')) === 'CHAIR A', `${tag}: tag CHAIR A`);
  if (tag === 'desk') await p.screenshot({ path: new URL('./shots/', import.meta.url).pathname + 'chair-menthol-A.png', clip: await (await p.$('.col:nth-child(2)')).boundingBox() });
  else await p.screenshot({ path: new URL('./shots/', import.meta.url).pathname + 'chair-phone.png', fullPage: true });
  await p.click('#flipBtn');
  await p.waitForFunction(() => document.querySelector('#chairTag').textContent === 'CHAIR B' && !document.querySelector('#flipBtn').disabled, null, { timeout: 10000 });
  const rowsB = await p.$$eval('#chairInfo tbody tr', rs => rs.map(r => r.innerText.replace(/\s+/g, ' ')));
  ok(rowsB.every(r => /axial.*1,3-diaxial.*equatorial|axial.*equatorial/.test(r)) && rowsB.some(r => r.includes('1,3-diaxial')), `${tag}: after flip groups axial with 1,3-diaxial notes`);
  // faces unchanged by flip
  const faces = (rows) => rows.map(r => (r.match(/(up|down)/) || [])[0]).join();
  ok(faces(rowsA) === faces(rowsB), `${tag}: up/down preserved through flip (${faces(rowsA)})`);
  if (tag === 'desk') await p.screenshot({ path: new URL('./shots/', import.meta.url).pathname + 'chair-menthol-B.png', clip: await (await p.$('.col:nth-child(2)')).boundingBox() });
  if (tag === 'desk'){
    await p.check('#chairHLabels'); await p.waitForTimeout(300);
    await p.screenshot({ path: new URL('./shots/', import.meta.url).pathname + 'chair-Hlabels.png', clip: await (await p.$('#chairBox')).boundingBox() });
    await load('CC1CCCCC1'); await waitChair();
    const t = await p.textContent('#chairInfo');
    ok(/more stable by 1\.\d/.test(t) && /equatorial/.test((await p.$$eval('#chairInfo tbody td', ts => ts.map(x => x.innerText)))[2]), 'methylcyclohexane: equatorial chair first, ΔE ~1.4');
    await load('c1ccccc1'); await p.waitForTimeout(300);
    ok(/No cyclohexane-type ring/.test(await p.textContent('#overlayChair')), 'benzene: explains no chair');
    await load('[H][C@]1(C)CCCC[C@@]1([H])C'); await waitChair();
    ok(/(axial|equatorial)/.test(await p.textContent('#chairInfo')) && (await p.$$('#chairInfo tbody tr')).length === 2, 'explicit-H input works');
    await load('C1CC[C@H]2CCCC[C@@H]2C1'); await waitChair();
    ok(await p.isDisabled('#flipBtn') && /fused/.test(await p.textContent('#chairInfo')), 'trans-decalin: flip disabled, explained');
    await load('CC1CCC(C)C(C)C1.C1CCCCC1'); await waitChair();
    ok(!(await p.isHidden('#ringSel')) && (await p.$$('#ringSel option')).length === 2, 'two rings → ring picker');
  }
  ok(errs.length === 0, `${tag}: no page errors ${JSON.stringify(errs)}`);
  await ctx.close();
}
await b.close(); console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0);
