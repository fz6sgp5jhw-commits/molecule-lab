// Newman projections (logic only; the drawing is in newman-ui.js). Node-testable.
// A 3D conformer from OpenChemLib is looked at along a chosen C–C single bond (front carbon → back carbon).
// The back carbon turns in 60° steps (rigid rotation; even steps are staggered, odd steps eclipsed).
// Staggered steps also get an MMFF94s+ energy after relaxing. If the front carbon carries a leaving group
// and a back H is anti to it, the E2 product from that exact shape is built (anti.js / reactivity.js).

import { analyse, alkenesFrom, alkeneProducts, LG_LABEL } from './reactivity.js';
import { rotateAbout, pos, refGroups, cis2D } from './anti.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l]; };
const norm180 = (d) => { d = ((d % 360) + 360) % 360; return d > 180 ? d - 360 : d; };
const SYM = { 1: 'H', 6: 'C', 7: 'N', 8: 'O', 9: 'F', 15: 'P', 16: 'S', 17: 'Cl', 35: 'Br', 53: 'I' };

const heavyNbrs = (m, a) => { const l = []; for (let i = 0; i < m.getConnAtoms(a); i++) l.push(m.getConnAtom(a, i)); return l; };

// atoms of the branch that starts at `start`, not going back through `from`
function branch(m, from, start){
  const seen = new Set([from, start]), st = [start], out = [start];
  while (st.length){ const x = st.pop(); for (const y of heavyNbrs(m, x)) if (!seen.has(y)){ seen.add(y); out.push(y); st.push(y); } }
  return out;
}

// Course-style label for the group on `start` (seen from `from`): H, Cl, OH, CH3, CH2CH3, CH(CH3)2, C6H11 …
export function groupLabel(m, from, start, lgLabel){
  if (lgLabel) return lgLabel;
  const z = m.getAtomicNo(start);
  const atoms = branch(m, from, start);
  const hs = (a) => m.getAllHydrogens(a);
  const H = (n) => n === 0 ? '' : n === 1 ? 'H' : 'H' + n;
  if (z !== 6) return atoms.length === 1 ? SYM[z] + H(hs(start)) : formula(m, atoms);
  if (atoms.some((a) => m.getAtomicNo(a) !== 6) || atoms.some((a) => m.isRingAtom(a) || m.getAtomPi(a) > 0)) return formula(m, atoms);
  // plain alkyl: write it out while it stays short and unbranched past the first carbon
  const kids = (a, p) => heavyNbrs(m, a).filter((x) => x !== p);
  const write = (a, p) => {
    const k = kids(a, p);
    if (!k.length) return 'CH3';
    if (k.length === 1) return 'C' + H(hs(a)) + write(k[0], a);
    if (k.every((x) => !kids(x, a).length)) return 'C' + H(hs(a)) + (k.length === 2 ? '(CH3)2' : '(CH3)3');
    return null;
  };
  const s = atoms.length <= 4 ? write(start, from) : null;
  return s || formula(m, atoms);
}
function formula(m, atoms){
  const c = {}; let h = 0;
  for (const a of atoms){ const s = SYM[m.getAtomicNo(a)] || '?'; c[s] = (c[s] || 0) + 1; h += m.getAllHydrogens(a); }
  const order = ['C', ...Object.keys(c).filter((k) => k !== 'C').sort()];
  let out = '';
  for (const k of order){ if (!c[k]) continue; out += k + (c[k] > 1 ? c[k] : ''); if (k === 'C' && h) out += 'H' + (h > 1 ? h : ''); }
  if (!c.C && h) out += 'H' + (h > 1 ? h : '');
  return out;
}
const carbonText = (m, a) => 'C' + (m.getAllHydrogens(a) ? 'H' + (m.getAllHydrogens(a) > 1 ? m.getAllHydrogens(a) : '') : '') + heavyNbrs(m, a).filter((x) => m.getAtomicNo(x) !== 6).map((x) => SYM[m.getAtomicNo(x)] + (m.getAllHydrogens(x) ? 'H' : '')).join('');

// Every C–C single bond outside a ring with at least one other heavy atom on each carbon … or at least
// substituents to look at (both carbons sp3). A carbon with a leaving group goes in front. The E2 bonds
// (Cα–Cβ with a β-H) come first, the more substituted β first.
// → { mol (heavy-atom copy all indices refer to), sites, bonds: [{ front, back, label, site }] }
export function newmanBonds(OCL, mol){
  const { mol: m, sites } = analyse(OCL, mol);
  const bonds = [];
  const sp3C = (a) => m.getAtomicNo(a) === 6 && m.getAtomPi(a) === 0 && !m.isAromaticAtom(a);
  for (let b = 0; b < m.getBonds(); b++){
    let x = m.getBondAtom(0, b), y = m.getBondAtom(1, b);
    if (m.getBondOrder(b) !== 1 || m.isRingBond(b) || !sp3C(x) || !sp3C(y)) continue;
    const siteX = sites.find((s) => s.ca === x && s.lg !== 'OH'), siteY = sites.find((s) => s.ca === y && s.lg !== 'OH');
    if (!siteX && siteY) [x, y] = [y, x];
    const site = siteX || siteY || null;
    const e2 = site && m.getAllHydrogens(y) > 0;
    bonds.push({ front: x, back: y, site: e2 ? site : null, score: (e2 ? 100 : 0) + (heavyNbrs(m, x).length - 1) + (heavyNbrs(m, y).length - 1) + (e2 ? heavyNbrs(m, y).length : 0) });
  }
  bonds.sort((p, q) => q.score - p.score);
  const labels = bonds.map((bd) => `${carbonText(m, bd.front)}–${carbonText(m, bd.back)}`);
  bonds.forEach((bd, i) => {
    const same = labels.filter((l) => l === labels[i]).length > 1;
    bd.label = labels[i] + (same ? ` (#${labels.slice(0, i + 1).filter((l) => l === labels[i]).length})` : '') + (bd.site ? ' · E2' : '');
  });
  return { mol: m, sites, bonds };
}

// buildNewman(OCL, m, bond) → model, or { error }. m = newmanBonds(...).mol.
// model: { front, back, frontSubs, backSubs (angles at step 0, degrees, screen frame: x = cos, y = sin, SVG y down),
//          energies: { 0, 2, 4 } (kcal/mol relative, staggered steps), site, isomers … }
export function buildNewman(OCL, m, bond, opts = {}){
  const { front, back } = bond;
  const gen = new OCL.ConformerGenerator(opts.seed || 1);
  const base = gen.getOneConformerAsMolecule(m.getCompactCopy());
  if (!base) return { error: 'Couldn’t build a 3D shape for this structure.' };
  new OCL.ForceFieldMMFF94(base, 'MMFF94s+').minimise({ maxIts: 4000 });
  base.ensureHelperArrays(OCL.Molecule.cHelperNeighbours);
  const all = (a) => { const l = []; for (let i = 0; i < base.getAllConnAtoms(a); i++) l.push(base.getConnAtom(a, i)); return l; };
  const k = unit(sub(pos(base, back), pos(base, front)));
  const proj = (from, s) => { const v = sub(pos(base, s), pos(base, from)); return sub(v, k.map((x) => x * dot(k, v))); };
  const fAtoms = all(front).filter((a) => a !== back), bAtoms = all(back).filter((a) => a !== front);
  const u = unit(proj(front, fAtoms[0])), w = cross(k, u);
  const ang = (from, s) => { const v = proj(from, s); return Math.atan2(dot(v, w), dot(v, u)) * 180 / Math.PI; };
  const site = bond.site;
  const lgText = site ? site.lg : null;
  const subs = (from, list) => list.map((a) => ({ atom: a, isH: base.getAtomicNo(a) === 1, lg: !!(site && from === site.ca && a === site.lgAtom),
    label: base.getAtomicNo(a) === 1 ? 'H' : groupLabel(m, from, a, site && from === site.ca && a === site.lgAtom ? lgText : null), angle: ang(from, a) }));
  const frontSubs = subs(front, fAtoms), backSubs = subs(back, bAtoms);
  // turn the back so step 0 is exactly staggered (back groups 60° from the front groups)
  const d0 = norm180(backSubs[0].angle - frontSubs[0].angle);
  const offset = 60 - (((d0 % 120) + 120) % 120);
  backSubs.forEach((s) => { s.angle = norm180(s.angle + offset); });
  // relaxed energies of the three staggered steps
  const side = new Set([back]);
  { const st = [back]; while (st.length){ const x = st.pop(); for (const y of all(x)) if (y !== front && !side.has(y)){ side.add(y); st.push(y); } } }
  const energies = {};
  for (const step of [0, 2, 4]){
    const c = base.getCompactCopy();
    rotateAbout(c, side, front, back, offset + 60 * step);
    const ff = new OCL.ForceFieldMMFF94(c, 'MMFF94s+');
    ff.minimise({ maxIts: 4000 });
    energies[step] = ff.getTotalEnergy();
  }
  const min = Math.min(...Object.values(energies));
  for (const s in energies) energies[s] -= min;
  // E2 products that could form across this bond (one or two, if E/Z is possible)
  let alkene = null;
  if (site){
    const al = alkenesFrom(OCL, m, front, { del: site.lgAtoms }).find((x) => x.beta === back);
    if (al) alkene = { isomers: alkeneProducts(OCL, m, al), ref: refGroups(m, front, site.lgAtom, back) };
  }
  return { front, back, frontSubs, backSubs, energies, site, alkene, lgName: site ? (LG_LABEL[site.lg] || site.lg) : null, mol: m };
}

// The view at a given step (0–5): back angles, staggered/eclipsed, named relations, and E2 from this shape.
export function newmanAt(model, step){
  step = ((step % 6) + 6) % 6;
  const backSubs = model.backSubs.map((s) => ({ ...s, angle: norm180(s.angle + 60 * step) }));
  const staggered = step % 2 === 0;
  const rel = (f, b) => { const d = Math.abs(norm180(b.angle - f.angle)); return d > 155 ? 'anti' : d < 25 ? 'eclipsed' : d < 85 ? 'gauche' : null; };
  const out = { step, backSubs, frontSubs: model.frontSubs, staggered, energy: staggered ? model.energies[step] : null, e2: null };
  const lg = model.frontSubs.find((s) => s.lg);
  if (!lg || !model.alkene) return out;
  const h = backSubs.find((s) => s.isH && rel(lg, s) === 'anti');
  if (!h){ out.e2 = { possible: false }; return out; }
  const { isomers, ref } = model.alkene;
  let iso = isomers[0];
  if (isomers.length > 1 && ref){
    const ga = model.frontSubs.find((s) => s.atom === ref.ga), gb = backSubs.find((s) => s.atom === ref.gb);
    const cis = Math.abs(norm180(gb.angle - ga.angle)) < 90;
    iso = isomers.find((x) => cis2D(x.mol, x.map[model.front], x.map[model.back], x.map[ref.ga], x.map[ref.gb]) === cis) || null;
  }
  out.e2 = { possible: true, h: h.atom, product: iso, ez: iso ? iso.ez : null, both: isomers.length > 1 };
  return out;
}

// The staggered step whose E2 gives the wanted outcome ('E' / 'Z' / any), lowest energy first; null if none.
export function stepFor(model, ez){
  const steps = [0, 2, 4].filter((s) => { const v = newmanAt(model, s); return v.e2 && v.e2.possible && (!ez || v.e2.ez === ez); });
  return steps.sort((a, b) => model.energies[a] - model.energies[b])[0] ?? null;
}
