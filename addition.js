// Alkene additions (Ch 8): row lookup in data/additions.json + product building by graph edits.
// Same result shape as predict() (lamps, pathways, reasons, warnings, path), with one lamp, "Addition",
// so SN/E lamps are never faked, plus res.addition = what the row says (intermediate, regio, stereo,
// stereospecific). Never guesses: a case the rows or builders don't cover returns { notCovered }.
//
// Built in S1: Markovnikov HX / H₃O⁺ (with shifts), HBr/ROOR (radical, anti-Markovnikov), ozonolysis.
// Rows whose builder isn't written yet (X₂, BH₃, H₂/cat, peracids: S2) still report their classification
// and stop with addition_not_yet. New stereocentres are never given an invented configuration: products
// are labelled racemic (±) or mixture, and drawn without wedges at the new centres.

import { cationPathways, buildProduct, bondBetween } from './reactivity.js';

const matches = (want, have) => want === undefined || (Array.isArray(want) ? want.includes(have) : want === have);
export function lookupAddition(additions, facts){
  return additions.rows.find((r) => Object.entries(r.when).every(([k, v]) => matches(v, facts[k]))) || null;
}

// Non-aromatic C=C and C≡C bonds of a molecule (helper arrays must be ready).
export function alkeneBonds(OCL, m){
  const M = OCL.Molecule;
  m.ensureHelperArrays(M.cHelperRings);
  const cc = [], yne = [];
  for (let b = 0; b < m.getBonds(); b++){
    const x = m.getBondAtom(0, b), y = m.getBondAtom(1, b);
    if (m.isAromaticBond(b) || m.getAtomicNo(x) !== 6 || m.getAtomicNo(y) !== 6) continue;
    if (m.getBondOrder(b) === 2) cc.push([x, y]);
    else if (m.getBondOrder(b) === 3) yne.push([x, y]);
  }
  return { cc, yne };
}

// A C=C carbon that carries a heteroatom, or a C=C conjugated with C=O / C≡N / another C=C: the simple
// carbocation-score rule doesn't hold there, so those are out of scope (never guessed).
function alkeneProblem(OCL, m, cc){
  for (const [x, y] of cc){
    for (const a of [x, y]){
      const other = a === x ? y : x;
      for (let i = 0; i < m.getConnAtoms(a); i++){
        const n = m.getConnAtom(a, i);
        if (n === other) continue;
        if (m.getAtomicNo(n) !== 6 && m.getAtomicNo(n) !== 1) return 'addition_alkene_type';
        if (m.isAromaticAtom(n)) continue; // styrene-like: benzylic cation, covered
        for (let j = 0; j < m.getConnAtoms(n); j++){
          const z = m.getConnAtom(n, j);
          if (z === a || m.getConnBondOrder(n, j) < 2) continue;
          if (m.getAtomicNo(z) !== 6) return 'addition_alkene_type';
          return 'conjugated_diene';
        }
      }
    }
  }
  return null;
}

const ANCHOR = 54; // Xe: a dummy "leaving group" on the carbon that becomes C⁺, so cationPathways can be reused

// The C=C x=y protonated so that `plus` becomes the cation: bond made single, a dummy atom on `plus`.
// The other carbon picks up the new H implicitly (one more free valence).
function protonated(OCL, m, plus, other){
  const M = OCL.Molecule;
  const c = m.getCompactCopy();
  c.setBondType(bondBetween(c, plus, other), M.cBondTypeSingle);
  const xe = c.addAtom(ANCHOR);
  c.setBondType(c.addBond(plus, xe), M.cBondTypeSingle);
  c.ensureHelperArrays(M.cHelperRings);
  return { mol: c, site: { ca: plus, lgAtom: xe, lgAtoms: [xe] } };
}

// Carbocation (or radical: same 3° > 2° > 1°, allylic/benzylic order) score at each end of x=y.
function endScores(OCL, m, x, y){
  return [[x, y], [y, x]].map(([plus, other]) => {
    const p = protonated(OCL, m, plus, other);
    const cp = cationPathways(OCL, p.mol, p.site);
    return { plus, other, score: cp.pathways[0].score, p, cp };
  });
}

function product(mol, extra){ return { mol, idcode: mol.getIDCode(), smiles: mol.toIsomericSmiles(), ...extra }; }

// racemic (one new stereocentre, nothing else chiral), mixture (diastereomers), or null (no new centre)
function flatStereo(mol, newAtoms){
  let all = 0, fresh = 0;
  for (let a = 0; a < mol.getAtoms(); a++) if (mol.isAtomStereoCenter(a)){ all++; if (newAtoms.includes(a)) fresh++; }
  if (!fresh) return null;
  return all === 1 ? 'racemic' : 'mixture';
}

function rankProducts(list){
  const seen = new Set(), uniq = [];
  list.sort((a, b) => { for (let i = 0; i < a.key.length; i++) if (a.key[i] !== b.key[i]) return b.key[i] - a.key[i]; return 0; });
  for (const p of list){ if (seen.has(p.idcode)) continue; seen.add(p.idcode); uniq.push(p); }
  const same = (a, b) => a.key.every((v, i) => v === b.key[i]);
  uniq.forEach((p, i) => { p.rank = i === 0 ? (uniq[1] && same(uniq[0], uniq[1]) ? 'competing' : 'major') : same(p, uniq[0]) ? 'competing' : 'minor'; p.order = i + 1; });
  return uniq;
}

// H⁺ to the end that gives the better C⁺ (both ends on a tie), then the cation's own pathways
// (1,2-shifts only when they raise the score), then the nucleophile on the final C⁺.
function buildMarkovnikov(OCL, m, x, y, nu, out){
  const ends = endScores(OCL, m, x, y);
  const best = Math.max(...ends.map((e) => e.score));
  const chosen = ends.filter((e) => e.score === best);
  if (chosen.length > 1) out.notes.push('markovnikov_tie');
  const list = [];
  out.cations = [];
  for (const e of chosen){
    const { pathways, notes } = e.cp;
    for (const n of notes) if (!out.notes.includes(n.replace(/ /g, '_') + '_not_covered')) out.notes.push(n.replace(/ /g, '_') + '_not_covered');
    for (const c of pathways){
      if (c.shift === 'allylic') continue; // conjugated dienes are stopped before this
      out.cations.push({ centre: c.centre, score: c.score, shift: c.shift, label: c.label, protonated: e.other });
      const b = buildProduct(OCL, e.p.mol, { del: [e.p.site.lgAtom], ...c.ops, attach: [{ to: c.centre, frag: nu }] });
      const fresh = [c.centre, e.other, e.plus, c.from].filter((a) => a != null).map((a) => b.map[a]);
      list.push(product(b.mol, { key: [c.score], via: c.label, cationScore: c.score, cationCarbons: c.carbons, shift: c.shift, centre: c.centre, group: c.group, protonated: e.other, stereo: flatStereo(b.mol, fresh) }));
    }
  }
  out.products = rankProducts(list);
}

// HBr/ROOR: Br• adds to the end that leaves the more stable radical (same score as a cation, no shifts),
// so Br sits on the less substituted carbon and H goes to the radical carbon.
function buildRadical(OCL, m, x, y, nu, out){
  const ends = endScores(OCL, m, x, y);
  const best = Math.max(...ends.map((e) => e.score));
  const chosen = ends.filter((e) => e.score === best);
  if (chosen.length > 1) out.notes.push('markovnikov_tie');
  const list = chosen.map((e) => {
    const b = buildProduct(OCL, m, { setOrder: [[e.plus, e.other, 1]], attach: [{ to: e.other, frag: nu }] });
    return product(b.mol, { key: [e.score], via: 'radical chain (Br• to the less substituted end)', radicalScore: e.score, centre: e.plus, brOn: e.other, stereo: flatStereo(b.mol, [b.map[e.plus], b.map[e.other]]) });
  });
  out.products = rankProducts(list);
}

// Every C=C → two C=O, then split into molecules. These are co-products (all form), not alternatives:
// each is "major", biggest first (that one continues a sequence).
function buildOzonolysis(OCL, m, cc, out){
  const O2 = { smiles: 'O', atom: 0, order: 2 };
  const b = buildProduct(OCL, m, { removeBonds: cc, attach: cc.flatMap(([x, y]) => [{ to: x, frag: O2 }, { to: y, frag: O2 }]) });
  const seen = new Set(), list = [];
  for (const f of b.mol.getFragments()){
    f.ensureHelperArrays(OCL.Molecule.cHelperCIP);
    const p = product(f, { via: 'C=C cut, each carbon → C=O', coproduct: true, stereo: null });
    if (seen.has(p.idcode)) continue;
    seen.add(p.idcode); list.push(p);
  }
  list.sort((p, q) => q.mol.getAtoms() - p.mol.getAtoms());
  list.forEach((p, i) => { p.rank = 'major'; p.order = i + 1; });
  out.products = list;
}

const SUBST = ['unsubstituted', 'monosubstituted', 'disubstituted', 'trisubstituted', 'tetrasubstituted'];

// predictAddition(OCL, mol, reagent, opts, data) → a predict()-shaped result, or null when this isn't an
// addition case at all (no C=C, and no alkane row matches), so predict() carries on as before.
export function predictAddition(OCL, mol, r, opts = {}, data){
  const M = OCL.Molecule;
  const { additions } = data;
  const m = mol.getCompactCopy();
  m.removeExplicitHydrogens();
  m.ensureHelperArrays(M.cHelperRings);
  const { cc, yne } = alkeneBonds(OCL, m);
  const res = { kind: 'addition', lamps: {}, reasons: [], pathways: {}, warnings: [], flags: [], path: [] };
  const facts = { sub: cc.length ? 'alkene' : 'alkane', act: r.add, x: r.x, heat: !!opts.heat, light: !!(r.light || opts.light), peroxide: !!(r.peroxide || opts.peroxide), water: !!r.water };
  res.facts = facts;
  if (!cc.length && yne.length) return { ...res, notCovered: 'alkyne_not_covered' };
  const row = lookupAddition(additions, facts);
  if (!cc.length && !row) return null;
  if (!row) return { ...res, notCovered: 'no_rule' };
  if (row.notCovered) return { ...res, notCovered: row.notCovered };
  const t = row.then;
  res.addition = { row: row.id, intermediate: t.intermediate, regio: t.regio, stereo: t.stereo, shifts: t.shifts, stereospecific: t.stereospecific, adds: t.adds, template: t.template, tags: row.tags || t.tags || [] };
  const carbonsOn = (a) => { let n = 0; for (let i = 0; i < m.getConnAtoms(a); i++) if (m.getAtomicNo(m.getConnAtom(a, i)) === 6) n++; return n; };
  res.path = [
    { step: 'substrate', text: cc.length === 1 ? `alkene (${SUBST[carbonsOn(cc[0][0]) + carbonsOn(cc[0][1]) - 2] || ''} C=C)` : `${cc.length} C=C` },
    { step: 'reagent', text: `${r.label}: adds across the C=C` },
    { step: 'conditions', text: [facts.heat && 'heat', facts.light && 'light', facts.peroxide && 'peroxides'].filter(Boolean).join(', ') || 'no heat or light' },
  ];
  if (!t.build) return { ...res, notCovered: 'addition_not_yet', session: t.session };
  if (t.build !== 'ozonolysis'){
    const prob = alkeneProblem(OCL, m, cc);
    if (prob) return { ...res, notCovered: prob };
    if (cc.length > 1) return { ...res, notCovered: 'several_alkenes' };
  }
  res.reasons.push(...(t.reasons || []));
  const out = { lamp: 'major', stereospecific: t.stereospecific === 'Y', products: [], notes: [] };
  const nu = r.addNu || r.nu;
  const [x, y] = cc[0];
  if (t.build === 'markovnikov') buildMarkovnikov(OCL, m, x, y, nu, out);
  else if (t.build === 'radical') buildRadical(OCL, m, x, y, nu, out);
  else buildOzonolysis(OCL, m, cc, out);
  if (!out.products.length) return { ...res, notCovered: 'no_rule' };
  if (out.notes.includes('markovnikov_tie')) res.reasons.push('markovnikov_tie');
  const st = new Set(out.products.map((p) => p.stereo).filter(Boolean));
  if (st.has('racemic')) res.reasons.push('racemic_flat');
  if (st.has('mixture')) res.reasons.push('mixture_flat');
  res.pathways.Addition = out;
  res.lamps.Addition = 'major';
  return res;
}
