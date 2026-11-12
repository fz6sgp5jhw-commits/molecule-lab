// Reverse planner ("get from A to B"): tries a fixed list of short reagent sequences through the forward
// engine (predict.js runSequence) and reports every one whose MAJOR product is B, plus why the others
// miss (B only minor, a different major product, or the chain stops). No new chemistry rules: each
// verdict is exactly what the forward predictions say.

import { runSequence } from './predict.js';
import { findReagent } from './reagents.js';

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
export async function plan(OCL, A, B, data, opts = {}){
  const { analyse } = await import('./reactivity.js');
  const sites = analyse(OCL, A).sites;
  if (!sites.length) return { error: 'no_site' };
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
