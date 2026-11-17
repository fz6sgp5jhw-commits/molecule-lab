// S5 (Playwright, fake PubChem/OPSIN): the forward-search planner (Q11), the Classify table (Q6–Q8 lines) and the
// Ch 8/10 Study sheet cards with Try it. DOM text only; the chemistry is checked in reactions.test.mjs.
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:8765/';
let fails = 0, checks = 0, lastOk = '';
const ok = (cond, label) => { checks++; lastOk = label; if (!cond){ console.log('FAIL ' + label); fails++; } };
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
await ctx.route(/pubchem|opsin/, (r) => r.abort());
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.setDefaultTimeout(10000);
const text = (s) => page.textContent(s);

try {
  await page.goto(BASE);
  await page.waitForSelector('#boot', { state: 'detached', timeout: 20000 });
  await page.click('.apptab[data-app="rx"]');

  // planner, Q11: 2,2-dimethylcyclopentanol → heptane-2,6-dione. No fixed route reaches it; the forward search does.
  await page.fill('#nameInput', 'CC1(C)CCCC1O.CC(=O)CCCC(C)=O');
  await page.click('#nameBtn');
  await page.waitForFunction(() => !document.querySelector('#rxRank').hidden);
  await page.click('#rxPlan');
  await page.waitForFunction(() => document.querySelector('#rxRankList [data-search]'), null, { timeout: 90000 });
  const plan = await text('#rxRankList');
  ok(await page.getAttribute('#rxRankList [data-search]', 'data-search') === '2', 'planner Q11: the shortest route takes 2 steps');
  ok(/H₂SO₄, heat\s+2\) O₃; DMS/.test(plan), `planner Q11: 1) H₂SO₄, heat 2) O₃; DMS is listed (${plan.slice(0, 300)})`);
  ok(/via 1,2-dimethylcyclopent-1-ene/.test(plan) || /via 1,2-dimethylcyclopentene/.test(plan), 'planner Q11: names the alkene in between');

  // planner from an alkane (no OH or X): the fixed-route heading is left out, the search still runs
  await page.fill('#nameInput', 'CC1CCCCC1.c1ccccc1');
  await page.click('#nameBtn');
  await page.waitForFunction(() => !document.querySelector('#rxRank').hidden);
  await page.click('#rxPlan');
  await page.waitForFunction(() => document.querySelector('#rxRankList [data-search]'), null, { timeout: 90000 });
  const none = await text('#rxRankList');
  ok(/no route of up to 4 steps/.test(none) && !/fixed routes gives/.test(none), 'planner: an impossible target says no route, no fixed-route heading');

  // Classify: three worksheet lines and one bad line
  await page.fill('#nameInput', 'CC1=CCCCC1');
  await page.click('#nameBtn');
  await page.click('#rxClassifyBox summary');
  await page.fill('#rxClassifyIn', 'C=CC(C)(C)C >> H2SO4\nCC1=CCCCC1 >> BH3·THF; H2O2/OH-\nCC1=CCCCC1 >> Br2, H2O\nhello');
  await page.click('#rxClassify');
  await page.waitForSelector('#rxClassifyOut:not([hidden])');
  const cells = await page.$$eval('#rxClassifyOut tr', (rs) => rs.slice(1).map((r) => [...r.cells].map((c) => c.textContent.trim())));
  ok(cells.length === 4, `classify: 4 rows (got ${cells.length})`);
  ok(cells[0][2] === '✓ Y' && cells[0][3] === 'N' && /carbocation/.test(cells[0][1]), `classify Q6A: H₂SO₄ Markovnikov via a carbocation (${cells[0]})`);
  ok(cells[1][2] === 'N' && cells[1][3] === '✓ Y' && /✓ Y/.test(cells[1][4]) && /2-methylcyclohexan-1-ol/.test(cells[1][5]), `classify Q7B: hydroboration anti-Markovnikov, stereospecific (${cells[1]})`);
  ok(/✓ Y/.test(cells[2][4]) && /course/.test(cells[2][4]), `classify Q8C: Br₂/H₂O stereospecific, marked as the course's meaning (${cells[2]})`);
  ok(/SMILES >> reagent/.test(cells[3][1]), `classify: a bad line explains the format (${cells[3]})`);

  // Study sheet: the Ch 8/10 cards and the summary card; Try it on hydroboration lights the Addition lamp
  await page.click('#studyBtn');
  await page.waitForFunction(() => document.querySelectorAll('#studyCards .st-card').length > 0);
  const titles = await page.$$eval('#studyCards h3', (hs) => hs.map((h) => h.textContent));
  for (const t of ['Electrophilic addition: HX, H₃O⁺', 'Halogenation and halohydrins', 'Hydroboration–oxidation', 'Catalytic hydrogenation', 'Epoxidation and epoxide opening', 'Ozonolysis', 'Radical halogenation', 'Radical HBr addition', 'Additions at a glance']) ok(titles.includes(t), `study: card "${t}"`);
  const sum = await text('.st-card[data-card="addSummary"]');
  ok(/anti-Markovnikov → syn → stereospecific: Y/.test(sum) && /bridged halonium ion/.test(sum), 'study: summary card rows come from the addition rows');
  await page.fill('#studySearch', 'ozonide');
  const g = await page.$$eval('#studyGloss dt', (ds) => ds.map((d) => d.textContent));
  ok(g.includes('ozonide'), 'study: glossary has ozonide');
  await page.fill('#studySearch', '');
  await page.click('.st-card[data-card="hydroboration"] .st-try');
  await page.waitForFunction(() => /major/.test(document.querySelector('#rxLamps .lamp[data-pw="Addition"]')?.className || ''), null, { timeout: 30000 });
  ok(/2-methylcyclohexan-1-ol/.test(await text('#rxCards')), 'study: Try it on hydroboration predicts trans-2-methylcyclohexanol');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('#rxClassify');
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= 390), '390 px with the Classify table: no sideways scroll');
} catch (e) {
  ok(false, 'test crashed after "' + lastOk + '": ' + e.message.split('\n').slice(0, 6).join(' | '));
}
ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors[0] : ''));
await browser.close();
console.log(fails ? `${fails} of ${checks} checks failed` : `s5-ui: ${checks} checks passed`);
process.exit(fails ? 1 : 0);
