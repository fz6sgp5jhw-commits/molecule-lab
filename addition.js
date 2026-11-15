// Alkene additions (Ch 8): row lookup in data/additions.json + product building by graph edits.
// Same result shape as predict() (lamps, pathways, reasons, warnings, path), with one lamp, "Addition",
// so SN/E lamps are never faked, plus res.addition = what the row says (intermediate, regio, stereo,
// stereospecific). Never guesses: a case the rows or builders don't cover returns { notCovered }.
//
// Built in S1: Markovnikov HX / H₃O⁺ (with shifts), HBr/ROOR (radical, anti-Markovnikov), ozonolysis.
// S2: stereo additions in 3D (faces.js) and epoxide opening. S3: radical halogenation of alkanes.
// Rows whose builder isn't written yet (X₂, BH₃, H₂/cat, peracids: S2) still report their classification
// and stop with addition_not_yet. New stereocentres are never given an invented configuration: products
// are labelled racemic (±) or mixture, and drawn without wedges at the new centres.

import { cationPathways, buildProduct, bondBetween } from './reactivity.js';
import { conformers, faceRef, faceNormal, probeFaces, carbonCrowd, courseRuleGroup, antiFace, place3d, idPair, from3d } from './faces.js';

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

// ---------- S2: stereo additions built in 3D (faces.js) ----------
const HALOGEN = { F: 9, Cl: 17, Br: 35, I: 53 };
const carbonCount = (m, a) => { let n = 0; for (let i = 0; i < m.getConnAtoms(a); i++) if (m.getAtomicNo(m.getConnAtom(a, i)) === 6) n++; return n; };

// Stereo facts about the substrate: chiral (in 3D), stereocentres drawn without wedges, C=C geometry not drawn.
function substrateStereo(OCL, m, c0, x, y){
  const M = OCL.Molecule;
  m.ensureHelperArrays(M.cHelperCIP);
  let undefinedCentre = false;
  for (let a = 0; a < m.getAtoms(); a++) if (m.isAtomStereoCenter(a) && m.getAtomParity(a) !== 1 && m.getAtomParity(a) !== 2) undefinedCentre = true;
  const b = bondBetween(m, x, y);
  const geometryUnknown = !m.isRingBond(b) && m.getBondParity(b) === M.cBondParityUnknown;
  const p = idPair(OCL, c0);
  return { chiral: p.id !== p.mirror, undefinedCentre, geometryUnknown };
}

function stereoLabel(OCL, prod3d, st){
  const p = idPair(OCL, prod3d);
  const m = from3d(OCL, prod3d);
  // real stereocentres, and ring cis/trans "pseudo" centres (trans-4a-methyldecalin has only those)
  let centres = 0, pseudo = 0;
  for (let a = 0; a < m.getAtoms(); a++){ if (m.isAtomStereoCenter(a)) centres++; else if (m.isAtomParityPseudo(a) && (m.getAtomParity(a) === 1 || m.getAtomParity(a) === 2)) pseudo++; }
  if (!centres && !pseudo) return { mol: m, ids: p, stereo: null };
  if (p.id === p.mirror) return { mol: m, ids: p, stereo: centres ? 'meso' : 'achiral' };
  if (st.undefinedCentre) return { mol: m, ids: p, stereo: 'relative' };
  return { mol: m, ids: p, stereo: st.chiral ? 'single' : 'racemic' };
}

// The recipe for one addition: which atoms go where, for a face f (+1/−1) of x=y.
// Each variant is one regiochemical/opening choice; `attack` is the carbon a nucleophile opens from the back.
function recipes(OCL, m, x, y, t, r, out){
  const H = 1, O = 8;
  if (t.build === 'hydrogenation') return [{ ops: (f) => [{ on: x, el: H, face: f }, { on: y, el: H, face: f }] }];
  if (t.build === 'epoxidation') return [{ ops: (f) => [{ bridge: [x, y], el: O, face: f }] }];
  if (t.build === 'hydroboration'){
    const cx = carbonCount(m, x), cy = carbonCount(m, y);
    const pairs = cx === cy ? [[x, y], [y, x]] : cx < cy ? [[x, y]] : [[y, x]];
    if (pairs.length > 1) out.notes.push('boron_tie');
    return pairs.map(([b, h]) => ({ ops: (f) => [{ on: b, el: O, face: f }, { on: h, el: H, face: f }], regio: b }));
  }
  // halonium: X⁺ bridges face f; the nucleophile (X⁻, or water for a halohydrin) opens it from −f
  const X = HALOGEN[r.x] || 35, nu = t.adds && t.adds.more === 'OH' ? O : X;
  let attack;
  if (nu === O){ // water at the carbon with more δ+ (same score as a cation); tie → both
    const ends = endScores(OCL, m, x, y), best = Math.max(...ends.map((e) => e.score));
    attack = ends.filter((e) => e.score === best).map((e) => e.plus);
    if (attack.length > 1) out.notes.push('markovnikov_tie');
  } else attack = [x, y]; // X₂: either carbon; decided below only if it changes the product
  return attack.map((a) => { const o = a === x ? y : x; return { ops: (f) => [{ on: o, el: X, face: f }, { on: a, el: nu, face: -f }], attack: a, regio: a }; });
}

const VIA = { halonium: 'bridged halonium ion on one face, opened from the back (anti)', hydroboration: 'B and H add to one face (syn); B → OH with retention', hydrogenation: 'two H from the metal surface to one face (syn)', epoxidation: 'the peroxy acid delivers O to one face (syn)' };

// Builds every face × variant in the lowest-energy conformer, then decides which face (faces.js tiers).
function buildStereo(OCL, m, x, y, t, r, K, out){
  const confs = conformers(OCL, m, K.maxConformers);
  if (!confs.length) return 'no_3d';
  const c0 = confs[0].mol, ref = faceRef(c0, x, y), n0 = faceNormal(c0, x, y, ref);
  const st = substrateStereo(OCL, m, c0, x, y);
  const vars = recipes(OCL, m, x, y, t, r, out);
  const built = vars.map((v) => {
    const at = (f) => { const p3 = place3d(OCL, c0, x, y, n0, v.ops(f), K); return { f, v, ...stereoLabel(OCL, p3, st) }; };
    return { plus: at(1), minus: at(-1) };
  });
  // Enantiotopic (or homotopic) faces: the two faces give mirror images (or the same molecule), so no face question.
  const diastereotopic = built.some(({ plus, minus }) => plus.ids.id !== minus.ids.id && plus.ids.id !== minus.ids.mirror);
  let major, minor = [];
  out.face = { tier: 0 };
  if (!diastereotopic) major = built.map((b) => b.plus);
  else {
    const pr = probeFaces(confs, x, y, ref, K);
    out.face = { tier: 3, ratio: pr.ratio, agree: pr.agree, n: pr.n };
    let F = 0;
    if (pr.less && pr.ratio >= K.ratio && pr.agree === pr.n){ F = pr.less; out.face.tier = 1; }
    else {
      const cand = courseRuleGroup(m, x, y);
      if (cand){ const af = antiFace(c0, x, y, ref, cand); if (!pr.less || pr.less === af){ F = af; out.face.tier = 2; out.face.group = cand.group; } }
    }
    const all = built.flatMap((b) => [b.plus, b.minus]);
    if (!F) major = all;
    else {
      let chosen = built.map((b) => (F > 0 ? b.plus : b.minus));
      // X₂ opened at either carbon gives different diastereomers here: open at the carbon whose back face (−F) is less crowded
      const opens = chosen.filter((p) => p.v.attack != null && t.build === 'halonium' && !(t.adds && t.adds.more === 'OH'));
      if (opens.length > 1){
        const cr = opens.map((p) => carbonCrowd(confs, p.v.attack, x, y, ref, -F, K));
        const lo = Math.min(...cr), hi = Math.max(...cr);
        out.face.openRatio = lo > 0 ? hi / lo : Infinity;
        if (out.face.openRatio >= K.ratio) chosen = chosen.filter((p) => !opens.includes(p) || cr[opens.indexOf(p)] === lo);
        else out.notes.push('opening_undecided');
      }
      major = chosen;
      minor = all.filter((p) => !chosen.some((q) => q.ids.id === p.ids.id));
    }
  }
  const list = [], seen = new Set();
  const push = (p, rank) => {
    if (seen.has(p.ids.id) || (p.stereo === 'racemic' && seen.has(p.ids.mirror))) return;
    seen.add(p.ids.id);
    let mol = p.mol, stereo = p.stereo;
    if (st.geometryUnknown && stereo){ mol = mol.getCompactCopy(); mol.stripStereoInformation(); mol.ensureHelperArrays(OCL.Molecule.cHelperCIP); stereo = 'mixture'; }
    list.push(product(mol, { key: [rank === 'minor' ? 0 : 1], via: VIA[t.build] || t.build, face: p.f, stereo }));
  };
  for (const p of major) push(p, 'major');
  for (const p of minor) push(p, 'minor');
  if (st.geometryUnknown) out.notes.push('alkene_geometry_unknown');
  if (st.undefinedCentre) out.notes.push('substrate_stereo_undefined');
  out.products = rankProducts(list);
  return null;
}

// Epoxide + H₃O⁺ / HO⁻: SN2 opening, the nucleophile (water/hydroxide → OH) comes in opposite the ring O.
// Acid: the more substituted C if one is 3°; base: the less substituted C; a tie (or 1° vs 2° in acid) → both.
function buildEpoxideOpening(OCL, m, ep, t, K, out){
  const confs = conformers(OCL, m, 1);
  if (!confs.length) return 'no_3d';
  const c0 = confs[0].mol;
  const st = substrateStereo(OCL, m, c0, ep.c[0], ep.c[1]);
  const [ca, cb] = ep.c.map((a) => carbonCount(m, a));
  let attack;
  if (ca === cb) attack = ep.c;
  else if (t.open === 'acid') attack = Math.max(ca, cb) >= 3 ? [ca > cb ? ep.c[0] : ep.c[1]] : ep.c;
  else attack = [ca < cb ? ep.c[0] : ep.c[1]];
  if (attack.length > 1) out.notes.push(ca === cb ? 'epoxide_tie' : 'epoxide_acid_mixed');
  const list = [], seen = new Set();
  for (const a of attack){
    const p3 = place3d(OCL, c0, a, ep.o, null, [{ on: a, el: 8, from: ep.o }], K, [a, ep.o]);
    const p = stereoLabel(OCL, p3, st);
    if (seen.has(p.ids.id) || (p.stereo === 'racemic' && seen.has(p.ids.mirror))) continue;
    seen.add(p.ids.id);
    list.push(product(p.mol, { key: [1], via: 'SN2 opening (back side)', stereo: p.stereo, attack: a }));
  }
  out.products = rankProducts(list);
  return null;
}

// The epoxide ring of a molecule: { o, c: [c1, c2] }, or null.
export function epoxideOf(OCL, m){
  m.ensureHelperArrays(OCL.Molecule.cHelperRings);
  const rs = m.getRingSet();
  for (let i = 0; i < rs.getSize(); i++){
    const r = rs.getRingAtoms(i);
    if (r.length !== 3) continue;
    const o = r.filter((a) => m.getAtomicNo(a) === 8), c = r.filter((a) => m.getAtomicNo(a) === 6);
    if (o.length === 1 && c.length === 2) return { o: o[0], c };
  }
  return null;
}

// ---------- S3: radical halogenation of alkanes (X₂ + light) ----------
// Br• takes the weakest C–H (the one leaving the most stable radical: 3° > 2° > 1° > CH₃), so the top class is
// major and the rest minor; two different positions of the top class are competing. Cl• is much less selective
// (its H-abstraction is downhill, an early transition state: Hammond), so every position is competing, with no
// percentages. Allylic/benzylic C–H needs NBS (not covered); C–H next to O/N/halogen isn't covered either.
const CLS = ['methyl', '1°', '2°', '3°', '4°'];
function buildRadicalSub(OCL, m, r, t, out){
  for (let a = 0; a < m.getAtoms(); a++) if (m.getAtomicNo(a) !== 6) return 'radical_heteroatom';
  const X = { smiles: r.x === 'Cl' ? 'Cl' : 'Br', atom: 0 };
  const list = [];
  for (let a = 0; a < m.getAtoms(); a++){
    if (m.isAromaticAtom(a) || m.getAllHydrogens(a) === 0) continue;
    let sp2 = false, ab = false;
    for (let i = 0; i < m.getConnAtoms(a); i++){
      const n = m.getConnAtom(a, i);
      if (m.getConnBondOrder(a, i) > 1) sp2 = true;
      if (m.isAromaticAtom(n)) ab = true;
      for (let j = 0; j < m.getConnAtoms(n); j++) if (m.getConnAtom(n, j) !== a && m.getConnBondOrder(n, j) > 1) ab = true;
    }
    if (sp2) continue; // vinyl/aryl C–H: much stronger, not taken
    if (ab) return 'allylic_needs_nbs';
    const cls = carbonCount(m, a);
    const b = buildProduct(OCL, m, { attach: [{ to: a, frag: X }] });
    list.push(product(b.mol, { key: [t.selective ? cls : 0], via: `${CLS[cls]} C–H → ${CLS[cls]} radical, then X–X`, radicalClass: cls, centre: a, stereo: flatStereo(b.mol, [b.map[a]]) }));
  }
  if (!list.length) return 'no_ch';
  out.products = rankProducts(list);
  if (!t.selective && out.products.length > 1) out.notes.push('cl_unselective');
  return null;
}

// Norbornene, α-pinene, camphene: a cation (or bridged ion, or radical) next to a bridged bicyclic skeleton
// rearranges (Wagner–Meerwein, ring opening). True if the C=C is in a ring that shares ≥ 3 atoms with another.
function bridgedAlkene(OCL, m, x, y){
  m.ensureHelperArrays(OCL.Molecule.cHelperRings);
  const rs = m.getRingSet(), rings = [];
  for (let i = 0; i < rs.getSize(); i++) rings.push(rs.getRingAtoms(i));
  for (const r of rings){
    if (!r.includes(x) && !r.includes(y)) continue;
    for (const q of rings) if (q !== r && q.filter((a) => r.includes(a)).length >= 3) return true;
  }
  return false;
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
  const ep = cc.length ? null : epoxideOf(OCL, m);
  const res = { kind: 'addition', lamps: {}, reasons: [], pathways: {}, warnings: [], flags: [], path: [] };
  const facts = { sub: cc.length ? 'alkene' : ep ? 'epoxide' : 'alkane', act: r.add || (ep ? r.open : undefined), x: r.x, heat: !!opts.heat, light: !!(r.light || opts.light), peroxide: !!(r.peroxide || opts.peroxide), water: !!r.water };
  res.facts = facts;
  if (!cc.length && yne.length) return { ...res, notCovered: 'alkyne_not_covered' };
  const row = lookupAddition(additions, facts);
  if (!cc.length && !row) return null;
  if (!row) return { ...res, notCovered: 'no_rule' };
  if (row.notCovered) return { ...res, notCovered: row.notCovered };
  const t = row.then;
  res.addition = { row: row.id, intermediate: t.intermediate, regio: t.regio, stereo: t.stereo, shifts: t.shifts, stereospecific: t.stereospecific, adds: t.adds, template: t.template, tags: [...(row.tags || t.tags || [])] };
  const carbonsOn = (a) => { let n = 0; for (let i = 0; i < m.getConnAtoms(a); i++) if (m.getAtomicNo(m.getConnAtom(a, i)) === 6) n++; return n; };
  res.path = [
    { step: 'substrate', text: !cc.length && !ep ? 'alkane (C–H bonds only)' : ep ? 'epoxide (three-membered C–O–C ring)' : cc.length === 1 ? `alkene (${SUBST[carbonsOn(cc[0][0]) + carbonsOn(cc[0][1]) - 2] || ''} C=C)` : `${cc.length} C=C` },
    { step: 'reagent', text: ep ? `${r.label}: opens the strained ring` : !cc.length ? `${r.label}: X• takes an H (radical chain)` : `${r.label}: adds across the C=C` },
    { step: 'conditions', text: [facts.heat && 'heat', facts.light && 'light', facts.peroxide && 'peroxides'].filter(Boolean).join(', ') || 'no heat or light' },
  ];
  if (!t.build) return { ...res, notCovered: 'addition_not_yet', session: t.session };
  if (t.build !== 'ozonolysis' && !ep && cc.length){
    const prob = alkeneProblem(OCL, m, cc);
    if (prob) return { ...res, notCovered: prob };
    if (cc.length > 1) return { ...res, notCovered: 'several_alkenes' };
    if (['cation', 'halonium', 'radical'].includes(t.intermediate) && bridgedAlkene(OCL, m, cc[0][0], cc[0][1])) return { ...res, notCovered: 'bridged_rearranges' };
  }
  res.reasons.push(...(t.reasons || []));
  const out = { lamp: 'major', stereospecific: t.stereospecific === 'Y', products: [], notes: [] };
  const nu = r.addNu || r.nu;
  const [x, y] = cc[0] || [];
  const K = additions.faces;
  let stop = null;
  if (t.build === 'markovnikov') buildMarkovnikov(OCL, m, x, y, nu, out);
  else if (t.build === 'radical') buildRadical(OCL, m, x, y, nu, out);
  else if (t.build === 'ozonolysis') buildOzonolysis(OCL, m, cc, out);
  else if (t.build === 'epoxideOpen') stop = buildEpoxideOpening(OCL, m, ep, t, K, out);
  else if (t.build === 'radicalSub') stop = buildRadicalSub(OCL, m, r, t, out);
  else stop = buildStereo(OCL, m, x, y, t, r, K, out);
  if (stop) return { ...res, notCovered: stop };
  if (!out.products.length) return { ...res, notCovered: 'no_rule' };
  for (const k of ['cl_unselective', 'markovnikov_tie', 'boron_tie', 'epoxide_tie', 'epoxide_acid_mixed', 'opening_undecided', 'alkene_geometry_unknown', 'substrate_stereo_undefined']) if (out.notes.includes(k)) res.reasons.push(k);
  if (out.face){
    if (out.face.tier) res.reasons.push('face_tier' + out.face.tier);
    if (out.face.tier === 2 && !res.addition.tags.includes('course')) res.addition.tags.push('course');
  }
  // racemic / mixture at a flat C⁺ or radical, vs racemic / meso / single from a syn or anti (3D-built) addition
  const st = new Set(out.products.map((p) => p.stereo).filter(Boolean));
  const flat = t.build === 'markovnikov' || t.build === 'radical';
  if (st.has('racemic')) res.reasons.push(flat ? 'racemic_flat' : 'racemic_faces');
  if (st.has('mixture') && flat) res.reasons.push('mixture_flat');
  if (st.has('meso')) res.reasons.push('meso_product');
  if (st.has('achiral')) res.reasons.push('achiral_cis_trans');
  if (st.has('single')) res.reasons.push('single_isomer');
  if (st.has('relative')) res.reasons.push('relative_only');
  res.pathways.Addition = out;
  res.lamps.Addition = 'major';
  return res;
}
