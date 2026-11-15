// Faces of a C=C and 3D placement of the atoms an addition delivers (Ch 8, S2).
// docs/ch8-10-app-gaps.md, "Stereochemistry" and "Facial selectivity".
//
// - A face is named by topology, not by one conformer's axes: face +1 of x=y is the side of
//   n = (y − x) × (r − x), where r is a fixed heavy neighbour (by atom index). Heavy atoms keep their
//   indices in every conformer, so "+1" means the same face in all of them.
// - Probe: a point `probeHeight` Å above each alkene carbon along n; every atom within `cutoff` Å of it
//   adds (cutoff − r). Sum both carbons. Average over up to `maxConformers` MMFF94s+ conformers,
//   Boltzmann-weighted at `temperature` K.
// - Tiers (the tier is shown on the card):
//   1 computed: ratio ≥ `ratio` and every conformer within `agreeWindow` kcal/mol agrees;
//   2 course rule: exactly one allylic stereocentre with an exocyclic non-H group, next to an alkene
//     carbon that has no H, and the 3D direction doesn't contradict it → add anti to that group;
//   3 otherwise: both faces, "facial selectivity not covered".
// - Building: the C=C is made single and each new atom is put `bond[el]` Å from its carbon along ±n
//   (an epoxide O over the middle of the bond). R/S then comes from the 3D coordinates (OpenChemLib
//   recomputes parities from 3D after setParitiesValid(0)); nothing is assigned by hand.
// All constants live in data/additions.json → faces.

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => mul(a, 1 / Math.hypot(...a));
export const pos = (m, a) => [m.getAtomX(a), m.getAtomY(a), m.getAtomZ(a)];
const setPos = (m, a, p) => { m.setAtomX(a, p[0]); m.setAtomY(a, p[1]); m.setAtomZ(a, p[2]); };

function heavyNbrs(m, a, not){
  const l = [];
  for (let i = 0; i < m.getAllConnAtoms(a); i++){ const n = m.getConnAtom(a, i); if (n !== not && m.getAtomicNo(n) > 1) l.push(n); }
  return l.sort((p, q) => p - q);
}

// The reference atom that names the faces of x=y: lowest-index heavy neighbour of x (else of y).
export function faceRef(m, x, y){
  const nx = heavyNbrs(m, x, y);
  if (nx.length) return { on: x, other: y, r: nx[0] };
  const ny = heavyNbrs(m, y, x);
  if (ny.length) return { on: y, other: x, r: ny[0] };
  return { on: x, other: y, r: -1 };
}

// Unit normal of face +1 in conformer c.
export function faceNormal(c, x, y, ref){
  const o = pos(c, ref.on);
  if (ref.r < 0){ // ethylene-like: any fixed H will do
    for (let i = 0; i < c.getAllConnAtoms(ref.on); i++){ const n = c.getConnAtom(ref.on, i); if (n !== ref.other) return unit(cross(sub(pos(c, ref.other), o), sub(pos(c, n), o))); }
  }
  return unit(cross(sub(pos(c, ref.other), o), sub(pos(c, ref.r), o)));
}

// Conformers with MMFF94s+ energies (kcal/mol), lowest first. Hydrogens are explicit, appended after heavy atoms.
// Always generated from the same hand of a chiral molecule (the one with the smaller ID code), then mirrored back
// if needed: the generator samples two enantiomers differently, and a drawing and its mirror image must get the
// same verdict. The input molecule is never modified (initializeConformers adds hydrogens to what it is given).
export function conformers(OCL, mol, max, seed = 42){
  const M = OCL.Molecule;
  const m = mol.getCompactCopy();
  m.ensureHelperArrays(M.cHelperParities);
  const mir = m.getCompactCopy();
  for (let a = 0; a < mir.getAllAtoms(); a++) mir.setAtomX(a, -mir.getAtomX(a));
  mir.setParitiesValid(0);
  mir.ensureHelperArrays(M.cHelperParities);
  const flip = mir.getIDCode() < m.getIDCode();
  // the generator reads stereo from a molfile-clean molecule: given the x-mirrored copy directly it still builds
  // the original hand, so round-trip it (a molfile keeps the atom order)
  const start = flip ? M.fromMolfile(mir.toMolfile()) : m;
  const g = new OCL.ConformerGenerator(seed, false);
  if (!g.initializeConformers(start)) return [];
  const out = [];
  for (let i = 0; i < max; i++){
    const c = g.getNextConformerAsMolecule();
    if (!c) break;
    let e = null;
    try { const ff = new OCL.ForceFieldMMFF94(c, 'MMFF94s+'); ff.minimise(); e = ff.getTotalEnergy(); } catch { e = null; }
    if (flip) for (let a = 0; a < c.getAllAtoms(); a++) c.setAtomZ(a, -c.getAtomZ(a));
    if (e !== null && Number.isFinite(e)) out.push({ mol: c, e });
  }
  out.sort((a, b) => a.e - b.e);
  // guard: the 3D shape must be the drawn stereoisomer (only checkable when every stereo element is drawn)
  let drawn = true;
  for (let a = 0; a < m.getAtoms(); a++) if (m.isAtomStereoCenter(a) && m.getAtomParity(a) !== 1 && m.getAtomParity(a) !== 2) drawn = false;
  for (let b = 0; b < m.getBonds(); b++) if (m.getBondParity(b) === M.cBondParityUnknown) drawn = false;
  if (drawn && out.length){
    const c = out[0].mol.getCompactCopy();
    c.setParitiesValid(0);
    c.ensureHelperArrays(M.cHelperParities);
    if (c.getIDCode() !== m.getIDCode()) return [];
  }
  return out;
}

function crowding(c, x, y, n, f, K){
  let s = 0;
  for (const a of [x, y]){
    const p = add(pos(c, a), mul(n, f * K.probeHeight));
    for (let b = 0; b < c.getAllAtoms(); b++){
      if (b === x || b === y) continue;
      const r = Math.hypot(...sub(pos(c, b), p));
      if (r < K.cutoff) s += K.cutoff - r;
    }
  }
  return s;
}

// Probe both faces over the conformers. Returns { less: +1 | −1 | 0, ratio, agree, n, perConf }.
export function probeFaces(confs, x, y, ref, K){
  const kT = 0.0019872 * K.temperature;
  const e0 = confs[0].e;
  let wSum = 0, plus = 0, minus = 0;
  const per = confs.map((c) => {
    const n = faceNormal(c.mol, x, y, ref);
    const p = crowding(c.mol, x, y, n, +1, K), q = crowding(c.mol, x, y, n, -1, K);
    const w = Math.exp(-(c.e - e0) / kT);
    wSum += w; plus += w * p; minus += w * q;
    return { e: c.e - e0, plus: p, minus: q };
  });
  plus /= wSum; minus /= wSum;
  const less = plus < minus ? 1 : minus < plus ? -1 : 0;
  const lo = Math.min(plus, minus), hi = Math.max(plus, minus);
  const ratio = lo > 0 ? hi / lo : hi > 0 ? Infinity : 1;
  const near = per.filter((p) => p.e <= K.agreeWindow);
  const agree = near.filter((p) => Math.sign(p.minus - p.plus) === less).length;
  return { less, ratio, agree, n: near.length, plus, minus };
}

// Boltzmann-weighted crowding above one carbon `a` on face f (used to pick which carbon a nucleophile opens from the back).
export function carbonCrowd(confs, a, x, y, ref, f, K){
  const kT = 0.0019872 * K.temperature, e0 = confs[0].e;
  let w = 0, s = 0;
  for (const c of confs){
    const n = faceNormal(c.mol, x, y, ref), p = add(pos(c.mol, a), mul(n, f * K.probeHeight));
    let v = 0;
    for (let b = 0; b < c.mol.getAllAtoms(); b++){ if (b === x || b === y) continue; const r = Math.hypot(...sub(pos(c.mol, b), p)); if (r < K.cutoff) v += K.cutoff - r; }
    const wi = Math.exp(-(c.e - e0) / kT); w += wi; s += wi * v;
  }
  return s / w;
}

// Tier 2 (course rule): exactly one allylic stereocentre whose exocyclic non-H group could block a face,
// sitting next to an alkene carbon with no H. Returns { atom, group } or null.
export function courseRuleGroup(m, x, y){
  const ringWith = (a, b) => { const rs = m.getRingSet(); for (let i = 0; i < rs.getSize(); i++){ const r = rs.getRingAtoms(i); if (r.includes(a) && r.includes(b)) return true; } return false; };
  const cands = [];
  for (const [c, other] of [[x, y], [y, x]]){
    if (m.getAllHydrogens(c) > 0) continue;
    for (let i = 0; i < m.getConnAtoms(c); i++){
      const s = m.getConnAtom(c, i);
      if (s === other || !m.isAtomStereoCenter(s)) continue;
      const groups = [];
      for (let j = 0; j < m.getConnAtoms(s); j++){
        const g = m.getConnAtom(s, j);
        if (g === c || m.getAtomicNo(g) === 1) continue;
        if (!ringWith(s, g) || !m.isRingBond(m.getConnBond(s, j))) groups.push(g);
      }
      if (groups.length === 1) cands.push({ atom: s, group: groups[0], on: c });
    }
  }
  return cands.length === 1 ? cands[0] : null;
}

// Face (+1/−1) that is anti to `group` on `atom` in conformer c.
export function antiFace(c, x, y, ref, cand){
  const n = faceNormal(c, x, y, ref);
  return dot(sub(pos(c, cand.group), pos(c, cand.atom)), n) > 0 ? -1 : 1;
}

// Build one 3D product: `ops` = [{ on: atom, el: atomicNo, face: ±1, bridge: [a, b]? }]; the bond x–y becomes single.
// `breakBond` [a, b] removes a bond first (epoxide opening). `backside` puts the new atom opposite `from`.
export function place3d(OCL, conf, x, y, n, ops, K, breakBond){
  const M = OCL.Molecule;
  const m = conf.getCompactCopy();
  m.ensureHelperArrays(M.cHelperNeighbours);
  if (breakBond){
    const b = m.getBond(breakBond[0], breakBond[1]);
    m.deleteBond(b);
  } else m.setBondType(m.getBond(x, y), M.cBondTypeSingle);
  for (const o of ops){
    const d = K.bond[o.el] || 1.5;
    let p;
    if (o.bridge){ const mid = mul(add(pos(m, o.bridge[0]), pos(m, o.bridge[1])), 0.5); p = add(mid, mul(n, o.face * d * 0.8)); }
    else if (o.from != null){ const c = pos(m, o.on); p = add(c, mul(unit(sub(c, pos(m, o.from))), d)); }
    else p = add(pos(m, o.on), mul(n, o.face * d));
    const a = m.addAtom(o.el);
    setPos(m, a, p);
    for (const t of o.bridge || [o.on]) m.setBondType(m.addBond(t, a), M.cBondTypeSingle);
  }
  m.setParitiesValid(0);
  m.ensureHelperArrays(M.cHelperParities);
  return m;
}

// ID code of a 3D molecule and of its mirror image (z → −z).
export function idPair(OCL, m3){
  const M = OCL.Molecule;
  const id = m3.getIDCode();
  const mir = m3.getCompactCopy();
  for (let a = 0; a < mir.getAllAtoms(); a++) mir.setAtomZ(a, -mir.getAtomZ(a));
  mir.setParitiesValid(0);
  mir.ensureHelperArrays(M.cHelperParities);
  return { id, mirror: mir.getIDCode() };
}

// A 2D molecule (for drawing, naming and the next step) from an ID code, stereo kept.
export function from3d(OCL, m3){
  const M = OCL.Molecule;
  const id = m3.getIDCode();
  const out = M.fromIDCode(id);
  out.ensureHelperArrays(M.cHelperCIP);
  if (out.getIDCode() !== id) throw new Error('from3d: stereo lost');
  return out;
}

export function isStereoCentre(m, a){ return m.isAtomStereoCenter(a); }
