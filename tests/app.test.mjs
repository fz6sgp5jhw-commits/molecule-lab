import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:8765/';
import { mkdirSync } from 'node:fs';
const out = new URL('./shots', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
let fails = 0;
const ok = (cond, label) => { console.log((cond ? 'PASS ' : 'FAIL ') + label); if (!cond) fails++; };

// Fake services, in the documented PubChem / OPSIN response formats.
// pubchem: map of query value -> property record (or null for 404). opsin: name -> smiles (or null for FAILURE)
let pubchem = {}, opsin = {}, netDown = false;
async function mockServices(ctx){
  await ctx.route(/pubchem\.ncbi\.nlm\.nih\.gov/, async (route) => {
    if (netDown) return route.abort('internetdisconnected');
    const req = route.request();
    const body = new URLSearchParams(req.postData() || '');
    const key = body.get('smiles') ?? body.get('name');
    const rec = pubchem[key];
    if (!rec) return route.fulfill({ status: 404, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ Fault: { Code: 'PUGREST.NotFound', Message: 'No CID found' } }) });
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ PropertyTable: { Properties: [rec] } }) });
  });
  await ctx.route(/(ebi\.ac\.uk\/opsin|opsin\.ch\.cam\.ac\.uk)/, async (route) => {
    if (netDown) return route.abort('internetdisconnected');
    const name = decodeURIComponent(route.request().url().split('/').pop().replace(/\.json$/, ''));
    const smi = opsin[name];
    const j = smi ? { status: 'SUCCESS', message: '', smiles: smi } : { status: 'FAILURE', message: `"${name}" could not be parsed`, smiles: '' };
    return route.fulfill({ status: smi ? 200 : 404, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(j) });
  });
}

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await mockServices(ctx);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(BASE);
await page.waitForSelector('#boot', { state: 'detached', timeout: 20000 });
await page.waitForFunction(() => document.querySelector('#fFormula')?.textContent.length > 0);
ok((await page.textContent('#fFormula')) === 'C5H12O', 'starter molecule formula C5H12O');
ok((await page.textContent('#fMass')).startsWith('88.1'), 'molar mass ~88.15');
ok(await page.locator('#line2d svg').count() === 1, '2D line drawing rendered');
ok(await page.locator('#viewer3d canvas').count() >= 1, '3D viewer canvas present');
ok(await page.evaluate(() => getComputedStyle(document.querySelector('#overlay3d')).display) === 'none', '3D model built (overlay hidden)');
ok(await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('16px "Pixelify Sans"') && document.fonts.check('16px VT323') && document.fonts.check('12px "Press Start 2P"'); }), 'local fonts loaded');
await page.screenshot({ path: `${out}/desktop.png`, fullPage: true });

const nameIt = async () => { await page.click('#nameItBtn'); await page.waitForFunction(() => { const b = document.querySelector('#verify .badge'); const m = document.querySelector('#nameItMsg'); return (b && !b.classList.contains('busy')) || (m && m.textContent); }, null, { timeout: 15000 }); };
const build = async (q) => { await page.fill('#nameInput', q); await page.click('#nameBtn'); await page.waitForFunction(() => document.querySelector('#nameBtn').textContent === 'Build' && !document.querySelector('#nameBtn').disabled); await page.waitForTimeout(400); };
const badgeKind = () => page.evaluate(() => { const b = document.querySelector('#verify .badge'); return b ? [...b.classList].find(c => c !== 'badge') : ''; });
const text = (s) => page.textContent(s);

// 1) structure -> name, all good (current PubChem key "SMILES")
pubchem = { 'CC(C)CCO': { CID: 31260, SMILES: 'CC(C)CCO', IUPACName: '3-methylbutan-1-ol', Title: 'Isoamyl alcohol' } };
opsin = { '3-methylbutan-1-ol': 'CC(C)CCO' };
await nameIt();
ok((await text('#iupac')) === '3-methylbutan-1-ol' && (await badgeKind()) === 'ok', 'name lookup + OPSIN back-check → green');
ok((await text('#common')).includes('Isoamyl alcohol'), 'common name shown');

// 2) structure -> name, older PubChem key "IsomericSMILES", OPSIN can't parse → still green, says so
pubchem = { 'CC(C)CCO': { CID: 31260, IsomericSMILES: 'CC(C)CCO', IUPACName: '3-methylbutan-1-ol', Title: 'Isoamyl alcohol' } };
opsin = {};
await nameIt();
ok((await badgeKind()) === 'ok' && (await text('#verify')).includes('couldn’t parse'), 'older SMILES key accepted; OPSIN parse failure reported');

// 3) OPSIN reads name as a different structure → red
opsin = { '3-methylbutan-1-ol': 'CCCCCO' };
await nameIt();
ok((await badgeKind()) === 'bad', 'OPSIN disagreement on name → red');

// 4) not in PubChem → built-in namer, checked by OPSIN
pubchem = {}; opsin = { '3-methylbutan-1-ol': 'CC(C)CCO' };
await nameIt();
ok((await text('#iupac')) === '3-methylbutan-1-ol' && (await badgeKind()) === 'ok' && (await text('#verify')).includes('built-in'), 'no PubChem record → built-in name, OPSIN-checked green');
ok(await page.isVisible('#explain') && (await text('#explainSteps')).includes('Parent chain'), 'explanation panel shown');
// 4b) built-in name that OPSIN reads differently → red
opsin = { '3-methylbutan-1-ol': 'CCCCCO' };
await nameIt();
ok((await badgeKind()) === 'bad', 'built-in name failing the OPSIN check → red');
// 4c) structure outside the namer's scope (heterocycle) → honest "no name"
await page.fill('#nameInput', 'C1CCOC1'); await page.click('#nameBtn'); await page.waitForTimeout(500);
pubchem = {};
await nameIt();
ok((await text('#iupac')) === 'No name found.' && /heterocycles/.test(await text('#nameItMsg')), 'out-of-scope structure → says why, no name: ' + (await text('#nameItMsg')));
await page.fill('#nameInput', 'CC(C)CCO'); await page.click('#nameBtn'); await page.waitForTimeout(500);

// 5) name -> structure via PubChem (trivial name, OPSIN fails) → green
pubchem = { 'aspirin': { CID: 2244, SMILES: 'CC(=O)OC1=CC=CC=C1C(=O)O', IUPACName: '2-acetyloxybenzoic acid', Title: 'Aspirin' } };
opsin = {};
await build('aspirin');
ok((await text('#fFormula')) === 'C9H8O4' && (await text('#iupac')) === '2-acetyloxybenzoic acid' && (await badgeKind()) === 'ok', 'aspirin via PubChem → C9H8O4, green');

// 6) name -> structure, both agree → green "same structure"
pubchem = { '(R)-butan-2-ol': { CID: 84682, SMILES: 'CC[C@@H](C)O', IUPACName: '(2R)-butan-2-ol', Title: '(R)-2-Butanol' } };
opsin = { '(R)-butan-2-ol': 'C[C@@H](O)CC' };
await build('(R)-butan-2-ol');
ok((await badgeKind()) === 'ok' && (await text('#verify')).includes('same structure'), 'PubChem + OPSIN agree → green');
ok((await text('#fStereo')).includes('R at C'), 'calculated stereo shows R');

// 7) disagreement on stereo → yellow with button to switch
opsin = { '(R)-butan-2-ol': 'C[C@H](O)CC' };
await build('(R)-butan-2-ol');
ok((await badgeKind()) === 'warn' && await page.locator('#verify .badge button').count() === 1, 'stereo disagreement → yellow + switch button');
pubchem = {};
await page.click('#verify .badge button');
await page.waitForTimeout(1500);
ok((await text('#fStereo')).includes('S at C'), 'switch button loads OPSIN reading (S)');

// 8) OPSIN only, then structure not in PubChem → shows typed name, yellow, honest note
pubchem = {};
opsin = { '2,2,3,3-tetramethylheptan-4-ol': 'CC(C)(C)C(C)(C)C(O)CCC' };
await build('2,2,3,3-tetramethylheptan-4-ol');
ok((await text('#fFormula')) === 'C11H24O' && (await text('#iupac')) === '2,2,3,3-tetramethylheptan-4-ol' && (await badgeKind()) === 'ok', 'OPSIN-only + no PubChem record → built-in name, green: ' + (await text('#iupac')));

// 9) OPSIN only, PubChem knows the structure → PubChem's name, green
pubchem = { 'CC(C)CCO': { CID: 31260, SMILES: 'CC(C)CCO', IUPACName: '3-methylbutan-1-ol', Title: 'Isoamyl alcohol' } };
opsin = { 'isopentyl alcohol x': 'CC(C)CCO', '3-methylbutan-1-ol': 'CC(C)CCO' };
await build('isopentyl alcohol x');
ok((await text('#iupac')) === '3-methylbutan-1-ol' && (await badgeKind()) === 'ok', 'OPSIN-built → PubChem name + back-check green');

// 10) neither knows it
pubchem = {}; opsin = {};
await build('3-methylbutan-1-olz');
ok((await text('#nameMsg')).includes('Neither PubChem nor OPSIN'), 'unknown name → plain message');

// 11) stereo drawn but PubChem only has flat compound
const smiFlat = 'CC(O)C(C)CC';
pubchem = { [smiFlat]: { CID: 11651, SMILES: smiFlat, IUPACName: '3-methylpentan-2-ol', Title: '' } };
await page.fill('#nameInput', 'C[C@@H](O)[C@H](C)CC'); await page.click('#nameBtn'); await page.waitForTimeout(800);
const drawnFlat = await page.evaluate(async () => { const OCL = await import('./openchemlib.js'); const m = OCL.Molecule.fromSmiles('C[C@@H](O)[C@H](C)CC'); m.stripStereoInformation(); return m.toIsomericSmiles(); });
pubchem = { [drawnFlat]: pubchem[smiFlat] };
await nameIt();
ok(/^\(2[RS],3[RS]\)-3-methylpentan-2-ol$/.test(await text('#iupac')) && (await text('#verify')).includes('without stereo'), 'stereo not in PubChem → built-in name with R/S: ' + (await text('#iupac')));

// 12) network failure
netDown = true;
await nameIt();
ok((await text('#iupac')) !== 'No name found.' && (await text('#verify')).includes('couldn’t be reached'), 'services unreachable → built-in name, flagged unchecked: ' + (await text('#verify')));
netDown = false;

// 13) installability + service worker + offline reload
const cdp = await ctx.newCDPSession(page);
const inst = await cdp.send('Page.getInstallabilityErrors');
ok(inst.installabilityErrors.filter(e => e.errorId !== 'in-incognito').length === 0, 'Chrome installability: no errors ' + JSON.stringify(inst.installabilityErrors));
const man = await cdp.send('Page.getAppManifest');
ok(man.errors.length === 0, 'manifest parses cleanly ' + JSON.stringify(man.errors));
await page.evaluate(() => navigator.serviceWorker.ready);
await page.reload(); await page.waitForSelector('#boot', { state: 'detached' });
ok(await page.evaluate(() => !!navigator.serviceWorker.controller), 'service worker controls page');
const cached = await page.evaluate(async () => { const keys = await caches.keys(); const c = await caches.open(keys[0]); return (await c.keys()).length; });
ok(cached >= 16, `precache holds ${cached} files`);
const oc = await browser.newContext();
const op = await oc.newPage();
await op.goto(BASE); await op.waitForSelector('#boot', { state: 'detached' });
await op.evaluate(() => navigator.serviceWorker.ready);
await op.waitForTimeout(500);
await oc.setOffline(true);
await op.reload(); await op.waitForSelector('#boot', { state: 'detached', timeout: 20000 });
await op.waitForFunction(() => document.querySelector('#fFormula')?.textContent.length > 0);
ok((await op.textContent('#fFormula')) === 'C5H12O', 'offline reload: app + chemistry engine work');
ok(await op.evaluate(() => getComputedStyle(document.querySelector('#overlay3d')).display) === 'none', 'offline: 3D model builds');
ok(await op.isVisible('#net'), 'offline banner shown');
await op.waitForTimeout(500); await op.click('#nameItBtn'); await op.waitForFunction(() => { const b = document.querySelector('#verify .badge'); return (b && !b.classList.contains('busy')) || document.querySelector('#nameItMsg').textContent; }, null, { timeout: 8000 }).catch(() => {});
ok((await op.textContent('#iupac')) === '3-methylbutan-1-ol' && (await op.textContent('#verify')).includes('offline'), 'offline naming → built-in name, flagged unchecked: ' + (await op.textContent('#verify')));
await op.fill('#nameInput', 'aspirin'); await op.click('#nameBtn'); await op.waitForTimeout(500);
ok((await op.textContent('#nameMsg')).startsWith('You’re offline'), 'offline build-from-name → clear message');
await op.fill('#nameInput', 'CCO'); await op.click('#nameBtn'); await op.waitForTimeout(800);
ok((await op.textContent('#fFormula')) === 'C2H6O', 'offline: SMILES input still builds');
await oc.close();

// 14) phone layout, installed (standalone) look
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await mockServices(phone);
const p2 = await phone.newPage();
await p2.goto(BASE); await p2.waitForSelector('#boot', { state: 'detached' });
await p2.waitForTimeout(800);
ok(await p2.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'phone: no sideways scrolling');
await p2.screenshot({ path: `${out}/phone.png`, fullPage: false });
await p2.screenshot({ path: `${out}/phone-full.png`, fullPage: true });

const real = errors.filter(e => !/ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(e));
ok(real.length === 0, 'no page errors ' + JSON.stringify(real));
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
