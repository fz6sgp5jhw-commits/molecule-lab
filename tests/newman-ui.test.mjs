// Newman tab (Playwright): 2-bromobutane along C2–C3, turn the back carbon, anti H/Br highlight, "(2E)" from
// the anti shape with the CH3's anti, "(2Z)" from the other one, the quiz, and no sideways scroll at 390 px.
import { chromium } from 'playwright';
const fails = []; const ok = (c, l) => { if (!c) fails.push(l); };
const b = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
for (const [vw, tag] of [[{ width: 1280, height: 900 }, 'desk'], [{ width: 390, height: 844 }, 'phone']]){
  const ctx = await b.newContext({ viewport: vw });
  await ctx.route(/pubchem|opsin/, (r) => r.abort());
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(process.env.BASE_URL || 'http://localhost:8765/'); await p.waitForSelector('#boot', { state: 'detached' });
  await p.fill('#nameInput', 'CC(Br)CC'); await p.click('#nameBtn'); await p.waitForTimeout(500);
  await p.click('.tab[data-view="vnewman"]');
  await p.waitForFunction(() => document.querySelector('#newmanInfo').textContent.length > 0, null, { timeout: 20000 });
  ok(!/soon/.test(await p.textContent('.tab[data-view="vnewman"]')), `${tag}: tab still says soon`);
  ok(/CHBr–CH2/.test(await p.textContent('#nwBond')), `${tag}: bond list lacks CHBr–CH2`);
  const info = () => p.textContent('#newmanInfo');
  // step 0 is the lowest staggered shape for this bond: Br anti to an H, CH3's anti → (2E)
  ok(/E2 can go from here/.test(await info()) && /\(2E\)-but-2-ene/.test(await info()), `${tag}: step 0 should give (2E): ${(await info()).slice(0, 160)}`);
  ok((await p.$$('#newmanSvg line[stroke="#55ffff"]')).length === 1 && (await p.$$('#newmanSvg line[stroke="#ff66ff"]')).length === 1, `${tag}: anti H and Br not highlighted`);
  await p.click('#nwRight');
  ok(/ECLIPSED/.test(await p.textContent('#newmanTag')) && /can’t go/.test(await info()), `${tag}: step 1 should be eclipsed with no E2`);
  await p.click('#nwRight'); await p.click('#nwRight'); await p.click('#nwRight'); // step 4
  ok(/\(2Z\)-but-2-ene/.test(await info()) && /kcal\/mol/.test(await info()), `${tag}: step 4 should give (2Z) with an energy: ${(await info()).slice(0, 160)}`);
  // quiz: ask for (E); a wrong shape is explained, the anti-E shape is right
  await p.click('#nwQuiz');
  ok(/\(E\)/.test(await p.textContent('#nwQuizQ')), `${tag}: quiz should ask for (E)`);
  await p.click('#nwCheck');
  ok(/gives \(Z\)/.test(await p.textContent('#nwQuizMsg')), `${tag}: quiz should explain the Z shape: ${await p.textContent('#nwQuizMsg')}`);
  await p.click('#newmanSvg'); await p.click('#newmanSvg'); // tap to turn: step 4 → 0
  await p.click('#nwCheck');
  ok(/Right/.test(await p.textContent('#nwQuizMsg')), `${tag}: quiz should accept step 0: ${await p.textContent('#nwQuizMsg')}`);
  if (tag === 'phone') ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'phone: sideways scroll');
  if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/newman-${tag}.png`, fullPage: tag === 'phone' });
  // butane: no leaving group, explained
  await p.fill('#nameInput', 'CCCC'); await p.click('#nameBtn');
  await p.waitForFunction(() => /No leaving group/.test(document.querySelector('#newmanInfo').textContent), null, { timeout: 20000 }).catch(() => ok(false, `${tag}: butane should say no leaving group`));
  ok(errs.length === 0, `${tag}: page errors ${JSON.stringify(errs)}`);
  await ctx.close();
}
await b.close();
if (fails.length){ console.log(fails.join('\n')); process.exit(1); }
console.log('newman-ui: all checks passed');
