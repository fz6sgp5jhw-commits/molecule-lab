// Anti-periplanar geometry for open-chain E2 (and the Newman tab): 3D conformers from OpenChemLib,
// MMFF94s+ energies. For a Cα–LG / Cβ pair it finds every staggered conformer in which a β-H sits
// anti (≈180°) to the leaving group, and says which way the two carbons' other groups end up in the
// alkene that E2 makes from that shape (groups gauche → cis, groups anti → trans).
// Heavy atoms keep their indices in conformers; hydrogens are appended after them.

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l]; };
export const pos = (m, a) => [m.getAtomX(a), m.getAtomY(a), m.getAtomZ(a)];

// signed dihedral a–b–c–d in degrees (−180…180)
export function dihedral(m, a, b, c, d){
  const p0 = pos(m, a), p1 = pos(m, b), p2 = pos(m, c), p3 = pos(m, d);
  const b0 = sub(p0, p1), b1 = norm(sub(p2, p1)), b2 = sub(p3, p2);
  const v = sub(b0, b1.map((x) => x * dot(b0, b1))), w = sub(b2, b1.map((x) => x * dot(b2, b1)));
  return Math.atan2(dot(cross(b1, v), w), dot(v, w)) * 180 / Math.PI;
}

const nbrs = (m, a) => { const l = []; for (let i = 0; i < m.getAllConnAtoms(a); i++) l.push(m.getConnAtom(a, i)); return l; };

// atoms on b's side of the a–b bond (b included); null if a–b is in a ring
function sideOf(m, a, b){
  const seen = new Set([b]), st = [b];
  while (st.length){ const x = st.pop(); for (const y of nbrs(m, x)){ if (x === b && y === a) continue; if (y === a) return null; if (!seen.has(y)){ seen.add(y); st.push(y); } } }
  return seen;
}

// rotate the atoms in `set` about the axis p→q by `deg` degrees (Rodrigues)
export function rotateAbout(m, set, p, q, deg){
  const o = pos(m, p), k = norm(sub(pos(m, q), o)), t = deg * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
  for (const a of set){
    const v = sub(pos(m, a), o), kv = cross(k, v), kd = dot(k, v);
    const r = [0, 1, 2].map((i) => v[i] * c + kv[i] * s + k[i] * kd * (1 - c));
    m.setAtomX(a, o[0] + r[0]); m.setAtomY(a, o[1] + r[1]); m.setAtomZ(a, o[2] + r[2]);
  }
}

// The groups whose relation (cis/trans) in the alkene is reported: the first heavy neighbour of Cα
// (not Cβ, not the leaving group) and of Cβ (not Cα). null if either end has none (no E/Z possible).
export function refGroups(m, ca, lgAtom, beta){
  const heavy = (a, not) => nbrs(m, a).filter((x) => m.getAtomicNo(x) > 1 && !not.includes(x)).sort((x, y) => x - y)[0];
  const ga = heavy(ca, [beta, lgAtom]), gb = heavy(beta, [ca]);
  return ga === undefined || gb === undefined ? null : { ga, gb };
}

// antiConformers(OCL, mol, ca, lgAtom, beta) → { options: [{ cis, energy, dE, h, mol }], ref } or { error }
// One option per outcome (cis / trans of the reference groups), the lowest-energy conformer for it.
// dE is relative to the lowest option. Several start conformers are tried because the other chains'
// rotations change the energy; each β-H is turned exactly anti to the LG, then MMFF relaxes the shape
// (a staggered anti rotamer is an energy minimum, so it stays anti; it is kept only if within 25°).
export function antiConformers(OCL, mol, ca, lgAtom, beta, opts = {}){
  const tries = opts.tries || 4;
  const ref = refGroups(mol, ca, lgAtom, beta);
  const gen = new OCL.ConformerGenerator(opts.seed || 1);
  const ready = gen.initializeConformers(mol.getCompactCopy());
  const best = new Map();
  for (let t = 0; t < tries; t++){
    const base = ready ? gen.getNextConformerAsMolecule() : (t === 0 ? new OCL.ConformerGenerator(1).getOneConformerAsMolecule(mol.getCompactCopy()) : null);
    if (!base) break;
    base.ensureHelperArrays(OCL.Molecule.cHelperNeighbours);
    const side = sideOf(base, ca, beta);
    if (!side) return { error: 'ring' };
    for (const h of nbrs(base, beta).filter((x) => base.getAtomicNo(x) === 1)){
      const m = base.getCompactCopy();
      rotateAbout(m, side, ca, beta, 180 - dihedral(m, h, beta, ca, lgAtom));
      const ff = new OCL.ForceFieldMMFF94(m, 'MMFF94s+');
      ff.minimise({ maxIts: 4000 });
      const d = dihedral(m, h, beta, ca, lgAtom);
      if (Math.abs(Math.abs(d) - 180) > 25) continue;
      const energy = ff.getTotalEnergy();
      const cis = ref ? Math.abs(dihedral(m, ref.ga, ca, beta, ref.gb)) < 90 : null;
      const k = String(cis);
      if (!best.has(k) || energy < best.get(k).energy) best.set(k, { cis, energy, h, mol: m, dihedral: d });
    }
  }
  const options = [...best.values()].sort((a, b) => a.energy - b.energy);
  if (!options.length) return { error: 'no_anti' };
  options.forEach((o) => { o.dE = o.energy - options[0].energy; });
  return { options, ref };
}

// 2D cis test in a product drawn by OpenChemLib (coordinates follow the bond's parity): are atoms x
// (on A) and y (on B) on the same side of the A=B bond?
export function cis2D(m, A, B, x, y){
  const P = (i) => [m.getAtomX(i), m.getAtomY(i)];
  const [ax, ay] = P(A), [bx, by] = P(B);
  const side = (i) => { const [px, py] = P(i); return Math.sign((bx - ax) * (py - ay) - (by - ay) * (px - ax)); };
  return side(x) * side(y) > 0;
}
