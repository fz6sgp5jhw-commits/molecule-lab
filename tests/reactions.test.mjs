// SN1/SN2/E1/E2 engine, Node only. Table-driven from tests/seed-cases.json.
// Prints one line per failure and nothing for passes (see "Saving tokens" in docs/mechanisms-plan.md).
import { readFileSync } from 'node:fs';
import * as OCL from '../openchemlib.js';
import { nameMolecule } from '../namer.js';
import { predictSequence, rankSN1, rankSN2, PATHWAYS } from '../predict.js';
import { findReagent, matchMolecule, guessBox, solventType, entryFromMolecule } from '../reagents.js';

const here = (p) => new URL(p, import.meta.url).pathname;
OCL.Resources.registerFromNodejs(here('../resources.json'));
const data = { rules: JSON.parse(readFileSync(here('../data/rules.json'))), cat: JSON.parse(readFileSync(here('../data/reagents.json'))) };
const seed = JSON.parse(readFileSync(here('seed-cases.json')));
const M = OCL.Molecule;
const nameOf = (m) => { const r = nameMolecule(OCL, m); return r.name || `(no name: ${r.error})`; };
const idOf = (smi) => M.fromSmiles(smi).getIDCode();

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

// every reason key the table uses has text
for (const row of data.rules.rows) for (const k of [...(row.reasons || []), row.notCovered].filter(Boolean)) if (!data.rules.reasons[k]) fail('rules', `missing reason text for ${k}`);

// ---------- mechanism templates (Session 3): data integrity + the atoms the viewer follows ----------
{
  const { TEMPLATES, PRELUDES } = await import('../mech-templates.js');
  const T = JSON.parse(readFileSync(here('../data/mech-text.json')));
  const all = [...Object.entries(TEMPLATES).flatMap(([k, t]) => t.frames.map((f) => [k, f])), ...Object.entries(PRELUDES).flatMap(([k, fs]) => fs.map((f) => [k, f]))];
  for (const [k, f] of all){
    for (const key of typeof f.text === 'object' ? Object.values(f.text) : [f.text]) if (!T.frames[key]) fail('mech', `${k}: missing frame text ${key}`);
    if (f.quiz && !T.quiz[f.quiz.q]) fail('mech', `${k}: missing quiz text ${f.quiz.q}`);
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

if (fails.length){ console.log(fails.join('\n')); process.exit(1); }
