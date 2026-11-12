// SN1/SN2/E1/E2 engine, Node only. Table-driven from tests/seed-cases.json.
// Prints one line per failure and nothing for passes (see "Saving tokens" in docs/mechanisms-plan.md).
import { readFileSync } from 'node:fs';
import * as OCL from '../openchemlib.js';
import { nameMolecule } from '../namer.js';
import { predictSequence, runSequence, rankSN1, rankSN2, PATHWAYS } from '../predict.js';
import { findReagent, parseSequence, matchMolecule, guessBox, solventType, entryFromMolecule } from '../reagents.js';

const here = (p) => new URL(p, import.meta.url).pathname;
OCL.Resources.registerFromNodejs(here('../resources.json'));
const data = { rules: JSON.parse(readFileSync(here('../data/rules.json'))), cat: JSON.parse(readFileSync(here('../data/reagents.json'))) };
const seed = JSON.parse(readFileSync(here('seed-cases.json')));
const M = OCL.Molecule;
const nameOf = (m) => { const r = nameMolecule(OCL, m); return r.name || `(no name: ${r.error})`; };
const idOf = (smi) => M.fromSmiles(smi).getIDCode();
const ccDouble = (m) => { let n = 0; m.ensureHelperArrays(M.cHelperRings); for (let b = 0; b < m.getBonds(); b++) if (m.getBondOrder(b) === 2 && !m.isAromaticBond(b) && m.getAtomicNo(m.getBondAtom(0, b)) === 6 && m.getAtomicNo(m.getBondAtom(1, b)) === 6) n++; return n; };

const fails = [];
const fail = (id, msg) => fails.push(`#${id} ${msg}`);

for (const c of seed.cases){
  try {
    const sub = M.fromSmiles(c.substrate);
    if (c.substrateName && nameOf(sub) !== c.substrateName) fail(c.id, `substrate: expected ${c.substrateName}, got ${nameOf(sub)}`);
    const steps = c.steps.map((s) => ({ ...s, reagent: s.reagentDrawn ? (matchMolecule(OCL, data.cat, M.fromSmiles(s.reagentDrawn)) || entryFromMolecule(OCL, M.fromSmiles(s.reagentDrawn))) : findReagent(data.cat, s.reagent) || s.reagent }));
    const results = predictSequence(OCL, sub, steps, data);
    if (results.length < steps.length){ fail(c.id, `sequence stopped after step ${results.length}`); continue; }
    const res = results[results.length - 1];
    const e = c.expect;
    if (e.activation){
      const a = results[0].activation;
      if (!a) fail(c.id, 'activation: expected a product, got none');
      else {
        if (a.product.idcode !== idOf(e.activation.smiles)) fail(c.id, `activation: expected ${e.activation.smiles}, got ${a.product.smiles}`);
        if (e.activation.stereo && a.product.stereo !== e.activation.stereo) fail(c.id, `activation stereo: expected ${e.activation.stereo}, got ${a.product.stereo}`);
      }
    }
    if (e.notCovered !== undefined || res.notCovered){
      if (res.notCovered !== e.notCovered) fail(c.id, `notCovered: expected ${e.notCovered}, got ${res.notCovered}`);
    }
    for (const f of e.flags || []) if (!res.flags.includes(f)) fail(c.id, `flag: expected ${f}, got [${res.flags}]`);
    for (const w of e.warnings || []) if (!res.warnings.includes(w)) fail(c.id, `warning: expected ${w}, got [${res.warnings}]`);
    for (const w of e.noWarnings || []) if (res.warnings.includes(w)) fail(c.id, `warning ${w} shown, but it shouldn't be`);
    for (const [pw, ns] of Object.entries(e.notes || {})) for (const n of ns) if (!(res.pathways[pw]?.notes || []).includes(n)) fail(c.id, `${pw} note: expected ${n}, got [${res.pathways[pw]?.notes || ''}]`);
    for (const [pw, ns] of Object.entries(e.noNotes || {})) for (const n of ns) if ((res.pathways[pw]?.notes || []).includes(n)) fail(c.id, `${pw} note ${n} shown, but it shouldn't be`);
    for (const [pw, n] of Object.entries(e.productCount || {})){ const l = res.pathways[pw]?.products || []; if (l.length !== n) fail(c.id, `${pw}: expected ${n} product(s), got [${l.map((x) => nameOf(x.mol)).join('; ')}]`); }
    // every elimination product has exactly one more C=C than the substrate (catches a dropped or misplaced double bond)
    if (steps.length === 1) for (const pw of ['E1', 'E2']) for (const p of res.pathways[pw]?.products || []) if (ccDouble(p.mol) !== ccDouble(sub) + 1) fail(c.id, `${pw}: ${p.smiles} doesn't have exactly one new C=C`);
    if (e.lamps){
      for (const pw of PATHWAYS){
        const want = e.lamps[pw] || 'none', got = res.lamps[pw] || 'none';
        if (want !== got) fail(c.id, `${pw} lamp: expected ${want}, got ${got}`);
      }
    }
    for (const [pw, v] of Object.entries(e.stereospecific || {})) if (res.pathways[pw]?.stereospecific !== v) fail(c.id, `${pw} stereospecific: expected ${v}, got ${res.pathways[pw]?.stereospecific}`);
    for (const p of e.products || []){
      const list = res.pathways[p.pathway]?.products || [];
      const got = list.find((x) => x.idcode === idOf(p.smiles));
      if (!got){ fail(c.id, `${p.pathway}: expected ${p.name || p.smiles}, got [${list.map((x) => nameOf(x.mol)).join('; ')}]`); continue; }
      if (p.name && nameOf(got.mol) !== p.name) fail(c.id, `${p.pathway} name: expected ${p.name}, got ${nameOf(got.mol)}`);
      if (p.rank && got.rank !== p.rank) fail(c.id, `${p.pathway} ${p.name || p.smiles}: expected ${p.rank}, got ${got.rank}`);
      if (p.order && got.order !== p.order) fail(c.id, `${p.pathway} ${p.name || p.smiles}: expected place ${p.order}, got ${got.order}`);
      if (p.via && got.via !== p.via) fail(c.id, `${p.pathway} ${p.name || p.smiles}: expected via ${p.via}, got ${got.via}`);
      if (p.stereo && got.stereo !== p.stereo) fail(c.id, `${p.pathway} ${p.name || p.smiles}: expected stereo ${p.stereo}, got ${got.stereo}`);
    }
  } catch (err){ fail(c.id, `threw ${String(err && err.message || err).split('\n')[0]}`); }
}

for (const r of seed.ranking){
  try {
    const out = (r.mode === 'SN1' ? rankSN1 : rankSN2)(OCL, r.mols.map((s) => M.fromSmiles(s)));
    // order: list of indices fastest first; null = "doesn't react"; [a, b] = a tie
    const want = r.order.map((x) => Array.isArray(x) ? [...x].sort().join('=') : x === null ? 'none' : String(x));
    const groups = [];
    for (const x of out){
      if (x.place === null){ groups.push('none'); continue; }
      const g = groups.find((y) => y.place === x.place);
      if (g) g.idx.push(x.index); else groups.push({ place: x.place, idx: [x.index] });
    }
    const got = groups.map((g) => g === 'none' ? 'none' : g.idx.sort().join('='));
    const nNone = want.filter((w) => w === 'none').length;
    if (got.join(' > ') !== want.join(' > ') && !(nNone && got.slice(0, -nNone).join() === want.slice(0, -nNone).join())) fail(r.id, `${r.mode} order: expected ${want.join(' > ')}, got ${got.join(' > ')}`);
  } catch (err){ fail(r.id, `threw ${String(err && err.message || err).split('\n')[0]}`); }
}

for (const [i, r] of seed.reagentMatching.entries()){
  const id = `M${i + 1}`;
  try {
    if (r.drawn){ const e = matchMolecule(OCL, data.cat, M.fromSmiles(r.drawn)); if (e?.id !== r.id) fail(id, `drawn ${r.drawn}: expected ${r.id}, got ${e?.id}`); }
    if (r.typed){ const e = findReagent(data.cat, r.typed); if (e?.id !== r.id) fail(id, `typed ${r.typed}: expected ${r.id}, got ${e?.id}`); }
    if (r.guess){ const g = guessBox(OCL, M.fromSmiles(r.guess)); if (g?.box !== r.box || !g?.estimated) fail(id, `guess ${r.guess}: expected ${r.box}, got ${g?.box}`); }
    if (r.solvent){ const t = solventType(data.cat, r.solvent); if (t !== r.type) fail(id, `solvent ${r.solvent}: expected ${r.type}, got ${t}`); }
  } catch (err){ fail(id, `threw ${String(err && err.message || err).split('\n')[0]}`); }
}

// ---------- multistep sequences: typed on one line, each step on the chosen product of the step before ----------
for (const q of seed.sequenceParsing){
  const p = parseSequence(data.cat, q.text);
  if (q.error){ if (!p || !p.error) fail('parse', `"${q.text}": expected an error, got ${p && p.steps ? p.steps.length + ' steps' : p}`); continue; }
  if (q.steps === null){ if (p !== null) fail('parse', `"${q.text}": expected not a sequence, got ${JSON.stringify(p)}`); continue; }
  const got = p && p.steps ? p.steps.map((s) => `${s.reagent.id}/${s.solvent}/${s.heat}`).join(' ') : `error ${p && p.error}`;
  if (got !== q.steps.join(' ')) fail('parse', `"${q.text}": expected ${q.steps.join(' ')}, got ${got}`);
}
for (const q of seed.sequences){
  try {
    const p = parseSequence(data.cat, q.text);
    if (!p || p.error){ fail(q.id, `parse: ${p && p.error}`); continue; }
    const picks = (q.picks || []).map((s) => s && idOf(s));
    const { steps } = runSequence(OCL, M.fromSmiles(q.substrate), p.steps, data, picks);
    q.expect.forEach((e, k) => {
      const s = steps[k], tag = `step ${k + 1}`;
      if (!s){ fail(q.id, `${tag}: missing`); return; }
      if (e.stop || s.stop){ if (s.stop !== e.stop) fail(q.id, `${tag}: expected stop ${e.stop}, got ${s.stop || 'a product'}`); return; }
      const c = s.chosen;
      if (c.pw !== e.pw) fail(q.id, `${tag}: expected ${e.pw}, got ${c.pw}`);
      if (e.smiles && c.product.idcode !== idOf(e.smiles)) fail(q.id, `${tag}: expected ${e.smiles}, got ${c.product.smiles}`);
      if (e.name && nameOf(c.product.mol) !== e.name) fail(q.id, `${tag}: expected ${e.name}, got ${nameOf(c.product.mol)}`);
      if (e.stereo && c.product.stereo !== e.stereo) fail(q.id, `${tag}: expected stereo ${e.stereo}, got ${c.product.stereo}`);
    });
  } catch (err){ fail(q.id, `threw ${String(err && err.message || err).split('\n')[0]}`); }
}

// ---------- "Which pathway wins?" grid: every cell (all conditions) = what predict() gives for its example ----------
{
  const { buildGrid, SOLVENT_MODES } = await import('../pathway-grid.js');
  const { predict } = await import('../predict.js');
  for (const solvent of SOLVENT_MODES) for (const heat of [false, true]){
    for (const { row, cells } of buildGrid({ solvent, heat }, data)) for (const c of cells){
      const tag = `${row.id}×${c.col} ${solvent}${heat ? '+heat' : ''}`;
      try {
        const e = c.example;
        const res = predict(OCL, M.fromSmiles(e.smiles), e.reagent, { solvent: e.solvent, heat: e.heat }, data);
        const got = res.notCovered ? 'nc:' + res.notCovered : PATHWAYS.map((p) => res.lamps[p] || 'none').join();
        if (got !== c.key) fail('grid', `${tag}: grid says ${c.key}, predict() on ${e.smiles} + ${e.reagent} says ${got}`);
        if (c.noReaction && !res.notCovered && PATHWAYS.some((p) => res.lamps[p] && res.lamps[p] !== 'none')) fail('grid', `${tag}: grid says no reaction`);
      } catch (err){ fail('grid', `${tag}: threw ${String(err && err.message || err).split('\n')[0]}`); }
    }
  }
}

// every reason key the table uses has text
for (const row of data.rules.rows) for (const k of [...(row.reasons || []), row.notCovered].filter(Boolean)) if (!data.rules.reasons[k]) fail('rules', `missing reason text for ${k}`);

// ---------- mechanism templates (Session 3): data integrity + the atoms the viewer follows ----------
{
  const { TEMPLATES, PRELUDES } = await import('../mech-templates.js');
  const T = JSON.parse(readFileSync(here('../data/mech-text.json')));
  const all = [...Object.entries(TEMPLATES).flatMap(([k, t]) => t.frames.map((f) => [k, f])), ...Object.entries(PRELUDES).flatMap(([k, fs]) => fs.map((f) => [k, f]))];
  for (const [k, f] of all){
    for (const key of typeof f.text === 'object' ? Object.values(f.text) : [f.text]) if (!T.frames[key]) fail('mech', `${k}: missing frame text ${key}`);
    for (const q of [f.quiz, ...Object.values(f.when || {}).map((w) => w.quiz)]) if (q && !T.quiz[q.q]) fail('mech', `${k}: missing quiz text ${q.q}`);
  }
  const strings = JSON.stringify([T.frames, T.quiz]);
  for (const [, term] of strings.matchAll(/\[\[([^\]|]+)/g)) if (!T.glossary[term]) fail('mech', `glossary term missing: ${term}`);
  for (const pw of ['SN1', 'E1', 'E2']) if (!TEMPLATES[pw].frames.some((f) => f.result)) fail('mech', `${pw}: no result frame`);
  if (!TEMPLATES.SN1.frames.some((f) => f.if === 'shift') || !TEMPLATES.SN1.frames.some((f) => f.if === 'allylic')) fail('mech', 'SN1: shift / allylic sub-steps missing');
  if (!Object.values(PRELUDES).flat().some((f) => f.proton) || !TEMPLATES.SN1.frames.some((f) => f.proton)) fail('mech', 'proton-transfer frames not marked');
  // W4: each SN1 product knows which cation it came from (no shift / methyl shift / ring expansion)
  const w4 = seed.cases.find((c) => c.id === 'W4');
  const [res] = predictSequence(OCL, M.fromSmiles(w4.substrate), w4.steps, data);
  const got = res.pathways.SN1.products.map((p) => `${p.shift || 'none'}:${p.centre !== res.site.ca}:${p.group != null}`).sort().join(' ');
  if (got !== 'alkyl:true:true none:false:false ring:true:true') fail('W4', `SN1 products' shift atoms: got ${got}`);
  for (const p of res.pathways.E1.products) if (p.beta == null || p.centre == null) fail('W4', 'E1 product without beta/centre');
}

// ---------- Newman projections (newman.js): which staggered shape E2 can go from, and what it gives ----------
{
  const N = await import('../newman.js');
  for (const c of seed.newman){
    try {
      const nb = N.newmanBonds(OCL, M.fromSmiles(c.smiles));
      const bond = nb.bonds.find((b) => b.label.startsWith(c.bond));
      if (!bond){ fail(c.id, `no bond ${c.bond} in [${nb.bonds.map((b) => b.label)}]`); continue; }
      const md = N.buildNewman(OCL, nb.mol, bond);
      if (c.noE2){ if (md.alkene) fail(c.id, 'expected no E2 along this bond'); }
      for (const ez of ['E', 'Z']){
        if (c[ez] === undefined) continue;
        const st = N.stepFor(md, ez);
        if (c[ez] === null){ if (st !== null) fail(c.id, `expected no ${ez} shape, got step ${st}`); continue; }
        if (st === null){ fail(c.id, `expected a shape giving ${c[ez]}, got none`); continue; }
        const got = nameOf(N.newmanAt(md, st).e2.product.mol);
        if (got !== c[ez]) fail(c.id, `${ez} shape: expected ${c[ez]}, got ${got}`);
      }
      if (c.best && N.newmanAt(md, N.stepFor(md)).e2.ez !== c.best) fail(c.id, `lowest-energy E2 shape: expected ${c.best}`);
      if (c.gauche){ const g = Math.max(md.energies[2], md.energies[4]); if (g < c.gauche[0] || g > c.gauche[1]) fail(c.id, `gauche energy ${g.toFixed(2)} outside ${c.gauche}`); }
    } catch (err){ fail(c.id, `threw ${String(err && err.message || err).split('\n')[0]}`); }
  }
}

if (fails.length){ console.log(fails.join('\n')); process.exit(1); }
