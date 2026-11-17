// Reverse planner ("get from A to B"): tries a fixed list of short reagent sequences through the forward
// engine (predict.js runSequence) and reports every one whose MAJOR product is B, plus why the others
// miss (B only minor, a different major product, or the chain stops). No new chemistry rules: each
// verdict is exactly what the forward predictions say.

import { runSequence, predict, stepOptions } from './predict.js';
import { findReagent, reagentById } from './reagents.js';
import { alkeneBonds, epoxideOf } from './addition.js';

// steps as [reagent, solvent, heat]; the reagent's default solvent is used when solvent is null
const ROUTES = [
  { id: 'acid', for: 'OH', steps: [['H2SO4', null, true]] },
  { id: 'socl2-naoet', for: 'OH', steps: [['SOCl2', null, false], ['NaOEt', 'EtOH', true]] },
  { id: 'socl2-kotbu', for: 'OH', steps: [['SOCl2', null, false], ['KOtBu', null, true]] },
  { id: 'tscl-naoet', for: 'OH', steps: [['TsCl', null, false], ['NaOEt', 'EtOH', true]] },
  { id: 'tscl-kotbu', for: 'OH', steps: [['TsCl', null, false], ['KOtBu', null, true]] },
  { id: 'pbr3-naoet', for: 'OH', steps: [['PBr3', null, false], ['NaOEt', 'EtOH', true]] },
  { id: 'pbr3-kotbu', for: 'OH', steps: [['PBr3', null, false], ['KOtBu', null, true]] },
  { id: 'tscl-nai-kotbu', for: 'OH', steps: [['TsCl', null, false], ['NaI', 'acetone', false], ['KOtBu', null, true]] },
  { id: 'hbr', for: 'OH', steps: [['HBr', null, false]] },
  { id: 'pbr3', for: 'OH', steps: [['PBr3', null, false]] },
  { id: 'socl2', for: 'OH', steps: [['SOCl2', null, false]] },
  { id: 'naoet', for: 'X', steps: [['NaOEt', 'EtOH', true]] },
  { id: 'kotbu', for: 'X', steps: [['KOtBu', null, true]] },
  { id: 'etoh-heat', for: 'X', steps: [['EtOH', 'EtOH', true]] },
  { id: 'nai', for: 'X', steps: [['NaI', 'acetone', false]] },
  { id: 'naoh', for: 'X', steps: [['NaOH', 'H2O', false]] },
];

const flat = (m) => { const c = m.getCompactCopy(); c.stripStereoInformation(); return c.getIDCode(); };
const hasStereo = (OCL, m) => {
  const c = m.getCompactCopy(); c.ensureHelperArrays(OCL.Molecule.cHelperCIP);
  for (let a = 0; a < c.getAtoms(); a++) if ([1, 2].includes(c.getAtomCIPParity(a))) return true;
  for (let b = 0; b < c.getBonds(); b++) if ([1, 2].includes(c.getBondCIPParity(b))) return true;
  return false;
};

// Same compound? Exact ID code, or the same constitution when the target is drawn without any stereo.
function sameAs(OCL, p, target, targetStereo){
  if (p.getIDCode() === target.getIDCode()) return true;
  return !targetStereo && flat(p) === flat(target);
}

export function routeText(cat, r){
  return r.steps.map(([rg, sv, heat], i) => { const e = findReagent(cat, rg); return `${r.steps.length > 1 ? i + 1 + ') ' : ''}${e ? e.label : rg}${sv && (!e || e.solvent !== sv) ? ', ' + sv : ''}${heat ? ', heat' : ''}`; }).join('  ');
}

// plan(OCL, A, B, data, { onProgress }) → { works: [route], misses: [route], kind } where each route is
// { id, text, steps (runSequence steps), verdict: 'major' | 'minor' | 'other' | 'stopped', majorMol, why }
async function fixedRoutes(OCL, A, B, data, opts = {}){
  const { analyse } = await import('./reactivity.js');
  const sites = analyse(OCL, A).sites;
  if (!sites.length) return { works: [], misses: [], targetStereo: hasStereo(OCL, B) };
  const kinds = new Set(sites.map((s) => s.lg === 'OH' ? 'OH' : 'X'));
  const routes = ROUTES.filter((r) => kinds.has(r.for) && r.steps.every(([rg]) => findReagent(data.cat, rg)));
  const targetStereo = hasStereo(OCL, B);
  const works = [], misses = [];
  for (const [i, r] of routes.entries()){
    if (opts.onProgress) await opts.onProgress(i, routes.length);
    const steps = r.steps.map(([rg, sv, heat]) => ({ reagent: findReagent(data.cat, rg), solvent: sv || findReagent(data.cat, rg).solvent, heat }));
    const out = { id: r.id, text: routeText(data.cat, r) };
    let seq;
    try { seq = runSequence(OCL, A, steps, data); } catch (e) { out.verdict = 'stopped'; out.why = 'the prediction failed: ' + e.message; misses.push(out); continue; }
    out.steps = seq.steps;
    if (seq.stopped !== null){ out.verdict = 'stopped'; out.why = seq.steps[seq.stopped].stop; out.stopStep = seq.stopped; misses.push(out); continue; }
    const last = seq.steps[seq.steps.length - 1];
    const major = last.chosen.product;
    out.majorMol = major.mol; out.majorPw = last.chosen.pw; out.via = major.via;
    if (sameAs(OCL, major.mol, B, targetStereo)){
      out.verdict = 'major';
      out.rank = major.rank;
      out.stereoNote = !targetStereo && hasStereo(OCL, major.mol) ? 'the target is drawn without stereo; this route gives one stereoisomer' : null;
      works.push(out);
      continue;
    }
    const minor = last.options.find((o) => sameAs(OCL, o.product.mol, B, targetStereo));
    if (minor && minor.product.rank === 'competing' && minor.pw === last.chosen.pw){ out.verdict = 'competing'; out.minorPw = minor.pw; }
    else if (minor){ out.verdict = 'minor'; out.minorPw = minor.pw; out.minorVia = minor.product.via; }
    else out.verdict = 'other';
    misses.push(out);
  }
  return { works, misses, targetStereo };
}

// ---------- forward search (Ch 8/10: Q10 starts from an alkane, Q11 ends with ozonolysis) ----------
// Breadth-first over the reagents that fit each state's functional groups, following only each step's
// MAJOR product (options[0], as runSequence does), depth ≤ 4. predict() is memoised by (ID code, step), and a
// state seen at a shallower depth isn't expanded again. Every verdict is the forward engine's: no new rules.
// Steps are catalogue ids with the condition the textbook uses: [id, solvent or null, heat].
export const STEPS = {
  alkane: [['br2-hv', null, false], ['cl2-hv', null, false]],
  halide: [['ethoxide', 'EtOH', true], ['tert-butoxide', null, true], ['ethanol', 'EtOH', true]],
  alcohol: [['h2so4', null, true], ['tscl', null, false], ['socl2', null, false], ['pbr3', null, false], ['hbr', null, false]],
  alkene: [['hbr', null, false], ['hbr-roor', null, false], ['h3o', null, false], ['br2', null, false], ['br2-h2o', null, false],
    ['hydroboration', null, false], ['h2-cat', null, false], ['peracid', null, false], ['ozonolysis', null, false]],
  epoxide: [['h3o', null, false], ['hydroxide', null, false]],
};
export const MAX_DEPTH = 4;

// which step lists fit this molecule (a molecule can have several groups)
export async function groupsOf(OCL, mol){
  const { analyse } = await import('./reactivity.js');
  const sites = analyse(OCL, mol).sites, m = mol.getCompactCopy(), g = [];
  if (sites.some((x) => x.lg === 'OH')) g.push('alcohol');
  if (sites.some((x) => x.lg !== 'OH')) g.push('halide');
  if (alkeneBonds(OCL, m).cc.length) g.push('alkene');
  if (epoxideOf(OCL, m)) g.push('epoxide');
  if (!g.length){
    let hetero = false;
    for (let a = 0; a < m.getAtoms(); a++) if (![1, 6].includes(m.getAtomicNo(a))) hetero = true;
    if (!hetero) g.push('alkane');
  }
  return g;
}

const stepKey = ([id, sv, heat]) => `${id}|${sv || ''}|${heat ? 1 : 0}`;
function stepText(cat, steps){
  return steps.map(([id, sv, heat], i) => { const e = reagentById(cat, id); return `${steps.length > 1 ? i + 1 + ') ' : ''}${e.label}${sv && e.solvent !== sv ? ', ' + sv : ''}${heat ? ', heat' : ''}`; }).join('  ');
}
// racemic products are drawn as one enantiomer: the target or its mirror image both count
const mirrorSmiles = (smi) => smi.replace(/@@|@/g, (t) => t === '@' ? '@@' : '@');
function matches(OCL, prod, B, targetStereo){
  if (sameAs(OCL, prod.mol, B, targetStereo)) return 'exact';
  if (targetStereo && prod.stereo === 'racemic'){
    const smi = prod.smiles || prod.mol.toIsomericSmiles();
    if (OCL.Molecule.fromSmiles(mirrorSmiles(smi)).getIDCode() === B.getIDCode()) return 'mirror';
  }
  return null;
}

// searchRoutes(OCL, A, B, data, { onProgress, maxDepth }) → { routes: [{ id, text, steps, depth, chain, majorPw, rank,
//   mirror }], near: [{ id, text, why, depth }], depth, calls }. routes = all shortest routes; near = routes of the same
//   or shorter length whose last step gives the target only as a minor/competing product.
export async function searchRoutes(OCL, A, B, data, opts = {}){
  const maxDepth = opts.maxDepth || MAX_DEPTH;
  const targetStereo = hasStereo(OCL, B);
  const memo = new Map(), seen = new Set([A.getIDCode()]);
  let calls = 0;
  const run = async (mol, st) => {
    const k = mol.getIDCode() + '>' + stepKey(st);
    if (memo.has(k)) return memo.get(k);
    const [id, sv, heat] = st, reagent = reagentById(data.cat, id);
    let res;
    try { res = predict(OCL, mol, reagent, { solvent: sv || reagent.solvent, heat }, data); } catch (e) { res = { notCovered: 'error', error: e.message }; }
    calls++;
    if (opts.onProgress && calls % 4 === 0) await opts.onProgress(calls);
    const options = res.notCovered || res.needSite ? [] : stepOptions(res);
    const out = { options, chosen: options[0] || null };
    memo.set(k, out);
    return out;
  };
  let layer = [{ mol: A, steps: [], chain: [] }];
  const routes = [], near = [];
  for (let d = 1; d <= maxDepth && layer.length && !routes.length; d++){
    const next = [];
    for (const node of layer){
      for (const g of await groupsOf(OCL, node.mol)) for (const st of STEPS[g]){
        if (!reagentById(data.cat, st[0])) continue;
        if (node.steps.length && stepKey(node.steps[node.steps.length - 1]) === stepKey(st)) continue; // same step twice in a row
        const r = await run(node.mol, st);
        if (!r.chosen) continue;
        const steps = [...node.steps, st], chain = [...node.chain, { pw: r.chosen.pw, product: r.chosen.product }];
        const id = steps.map((s) => s[0]).join('>');
        if (routes.some((x) => x.id === id) || near.some((x) => x.id === id)) continue;
        const hit = matches(OCL, r.chosen.product, B, targetStereo);
        if (hit){ routes.push({ id, text: stepText(data.cat, steps), steps, depth: d, chain, majorPw: r.chosen.pw, rank: r.chosen.product.rank, mirror: hit === 'mirror' }); continue; }
        const minor = r.options.slice(1).find((o) => matches(OCL, o.product, B, targetStereo));
        if (minor) near.push({ id, text: stepText(data.cat, steps), steps, depth: d, chain, why: minor.product.rank === 'competing' ? 'competing' : 'minor', minorPw: minor.pw });
        const idc = r.chosen.product.mol.getIDCode();
        if (seen.has(idc)) continue;
        seen.add(idc);
        next.push({ mol: r.chosen.product.mol, steps, chain });
      }
    }
    layer = next;
  }
  const depth = routes.length ? routes[0].depth : null;
  return { routes, near: near.filter((x) => depth === null || x.depth <= depth), depth, calls, maxDepth };
}

// plan(OCL, A, B, data, { onProgress }) → the fixed routes (works/misses, as before) + the forward search (search)
export async function plan(OCL, A, B, data, opts = {}){
  const fixed = await fixedRoutes(OCL, A, B, data, { onProgress: opts.onProgress ? (i, n) => opts.onProgress(`Trying route ${i + 1} of ${n}…`) : null });
  if (!(await groupsOf(OCL, A)).length && !fixed.works.length && !fixed.misses.length) return { error: 'no_site' };
  const search = await searchRoutes(OCL, A, B, data, { onProgress: opts.onProgress ? (n) => opts.onProgress(`Searching forward: ${n} predictions…`) : null });
  return { ...fixed, search };
}
