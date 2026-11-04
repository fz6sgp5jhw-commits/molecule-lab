// Chair conformations of six-membered rings: build both chairs, label axial/equatorial, compare energies.
// Geometry and energies come from OpenChemLib (MMFF94s+), never from guesses.

const v = {
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  unit: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
};
const pos = (m, a) => [m.getAtomX(a), m.getAtomY(a), m.getAtomZ(a)];
const setPos = (m, a, p) => { m.setAtomX(a, p[0]); m.setAtomY(a, p[1]); m.setAtomZ(a, p[2]); };

// Rotation matrix (rows) taking orthonormal frame F (columns e1,e2,e3) onto frame G.
function frameRotation(f, g){
  // R = G * F^T
  const R = [[0,0,0],[0,0,0],[0,0,0]];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) R[i][j] += g[k][i] * f[k][j];
  return R;
}
const apply = (R, p) => [v.dot(R[0], p), v.dot(R[1], p), v.dot(R[2], p)];
function frameFrom(a, b){ // right-handed orthonormal frame from two non-parallel vectors
  const e1 = v.unit(a); const e3 = v.unit(v.cross(a, b)); const e2 = v.cross(e3, e1);
  return [e1, e2, e3];
}
function anyPerp(a){ const t = Math.abs(a[0]) < 0.9 ? [1,0,0] : [0,1,0]; return v.cross(a, t); }

// Walk the ring so atoms are in bonded order.
function orderRing(m, atoms){
  const set = new Set(atoms), out = [atoms[0]];
  while (out.length < atoms.length){
    const cur = out[out.length - 1], prev = out[out.length - 2];
    let next = -1;
    for (let i = 0; i < m.getAllConnAtoms(cur); i++){
      const n = m.getConnAtom(cur, i);
      if (set.has(n) && n !== prev && !out.includes(n)){ next = n; break; }
    }
    if (next < 0) return null;
    out.push(next);
  }
  return out;
}
function newellNormal(ps){
  let n = [0, 0, 0];
  for (let i = 0; i < ps.length; i++){ const a = ps[i], b = ps[(i + 1) % ps.length]; n = v.add(n, v.cross(a, b)); }
  return v.unit(n);
}
const centroid = (ps) => v.mul(ps.reduce((s, p) => v.add(s, p), [0, 0, 0]), 1 / ps.length);
function torsion(a, b, c, d){
  const b1 = v.sub(b, a), b2 = v.sub(c, b), b3 = v.sub(d, c);
  const n1 = v.cross(b1, b2), n2 = v.cross(b2, b3);
  return Math.atan2(v.dot(v.cross(n1, n2), v.unit(b2)), v.dot(n1, n2)) * 180 / Math.PI;
}
function ringTorsions(m, ring){
  return ring.map((_, i) => torsion(...[0, 1, 2, 3].map(k => pos(m, ring[(i + k) % 6]))));
}
// A chair has six ring torsions of alternating sign, each roughly 40–75°.
function chairSense(m, ring){
  const t = ringTorsions(m, ring);
  const alt = t.every((x, i) => Math.abs(x) > 30 && Math.abs(x) < 85 && Math.sign(x) === (i % 2 ? -1 : 1) * Math.sign(t[0]));
  return alt ? Math.sign(t[0]) : 0;
}

// Six-membered rings with no double bonds inside the ring.
export function findChairRings(OCL, mol){
  const m = mol.getCompactCopy();
  m.ensureHelperArrays(OCL.Molecule.cHelperRings);
  const rs = m.getRingSet(), rings = [];
  for (let i = 0; i < rs.getSize(); i++){
    if (rs.getRingSize(i) !== 6 || rs.isAromatic(i)) continue;
    if (rs.getRingBonds(i).some(b => m.getBondOrder(b) !== 1)) continue;
    rings.push(rs.getRingAtoms(i).slice().sort((a, b) => a - b));
  }
  return rings;
}

// Condensed formula of a substituent, e.g. CH3, CH2OH, C(CH3)3, CH(CH3)2; plain formula if it contains a ring.
function branchFormula(m, atoms){
  const count = {};
  for (const a of atoms){ const el = m.getAtomLabel(a); count[el] = (count[el] || 0) + 1; }
  const order = ['C', 'H', ...Object.keys(count).filter(e => e !== 'C' && e !== 'H').sort()];
  if (!count.C) order.sort((a, b) => (a === 'H') - (b === 'H'));
  return order.filter(e => count[e]).map(e => e + (count[e] > 1 ? count[e] : '')).join('');
}
function condensed(m, start, parent, atoms){
  const set = new Set(atoms);
  let ring = false;
  const go = (a, from, seen) => {
    seen.add(a);
    const hs = []; const kids = [];
    for (let i = 0; i < m.getAllConnAtoms(a); i++){
      const n = m.getConnAtom(a, i);
      if (n === from) continue;
      if (seen.has(n) || !set.has(n)){ if (n !== parent) ring = true; continue; }
      if (m.getAtomicNo(n) === 1) hs.push(n); else kids.push(n);
    }
    let txt = m.getAtomLabel(a) + (hs.length ? 'H' + (hs.length > 1 ? hs.length : '') : '');
    const parts = kids.map(k => (m.getBondOrder(m.getBond(a, k)) === 2 ? '=' : m.getBondOrder(m.getBond(a, k)) === 3 ? '≡' : '') + go(k, a, seen));
    if (!parts.length) return txt;
    const same = parts.every(x => x === parts[0]);
    if (same && parts.length > 1) return txt + `(${parts[0]})${parts.length}`;
    const last = parts.pop();
    return txt + parts.map(x => `(${x})`).join('') + last.replace(/^=/, '=');
  };
  const out = go(start, parent, new Set());
  if (ring || out.length > 14) return branchFormula(m, atoms);
  return out.replace(/^OH$/, 'OH').replace(/^(.)H(\d?)$/, '$1H$2');
}

/**
 * Build both chairs for one ring.
 * @param mol molecule (no explicit H needed)
 * @param ringHeavy heavy-atom indices of the ring (from findChairRings)
 * Returns { chairs:[A,B], canFlip, note, ring, atoms } where each chair has coords (Å, ring in xz-plane, normal = +y),
 * energy (kcal/mol, MMFF94s+), and subs: [{ringPos, atom, group, isH, axial, up}].
 */
export function buildChairs(OCL, mol, ringHeavy, opts = {}){
  const tries = opts.tries || 4;
  const gen = new OCL.ConformerGenerator(opts.seed || 1);
  let best = null;
  const init = mol.getCompactCopy();
  const ready = gen.initializeConformers(init);
  for (let t = 0; t < tries; t++){
    const base = ready ? gen.getNextConformerAsMolecule() : (t === 0 ? new OCL.ConformerGenerator(1).getOneConformerAsMolecule(mol.getCompactCopy()) : null);
    if (!base) break;
    let r = chairsFrom(OCL, base, ringHeavy);
    if (r.error){ if (!best) best = r; continue; }
    if (!best || best.error){ best = r; continue; }
    if (r.upSig !== best.upSig){
      // same compound drawn with the ring traced the other way round: use its mirror image (only valid if achiral)
      const mir = base.getCompactCopy();
      for (let a = 0; a < mir.getAllAtoms(); a++) mir.setAtomZ(a, -mir.getAtomZ(a));
      r = chairsFrom(OCL, mir, ringHeavy);
      if (r.error || r.upSig !== best.upSig) continue;
    }
    // keep the lowest-energy version of each chair (substituent rotations differ between starts)
    r.raw.forEach((c, i) => {
      const b = best.raw[i];
      const better = !b || (c.isChair && !b.isChair) || (c.isChair === b.isChair && c.energy < b.energy - 1e-6);
      if (better) best.raw[i] = c;
    });
  }
  if (!best) return { error: 'Couldn’t build a 3D shape for this structure.' };
  if (best.error) return best;
  return describe(OCL, best);
}

function chairsFrom(OCL, base, ringHeavy){
  base.ensureHelperArrays(OCL.Molecule.cHelperRings);
  // heavy atoms keep their indices in the conformer; hydrogens are appended
  const ring = orderRing(base, ringHeavy);
  if (!ring) return { error: 'Couldn’t trace the ring.' };
  const N = base.getAllAtoms();
  const inRing = new Set(ring);

  // Substituent branches of each ring atom (everything reachable without crossing the ring).
  const owner = new Array(N).fill(-1);
  const branches = ring.map(() => []);
  let fused = false;
  ring.forEach((ra, k) => {
    for (let i = 0; i < base.getAllConnAtoms(ra); i++){
      const s = base.getConnAtom(ra, i);
      if (inRing.has(s)) continue;
      const stack = [s];
      while (stack.length){
        const a = stack.pop();
        if (owner[a] === k) continue;
        if (owner[a] >= 0){ fused = true; continue; }
        owner[a] = k; branches[k].push(a);
        for (let j = 0; j < base.getAllConnAtoms(a); j++){
          const n = base.getConnAtom(a, j);
          if (inRing.has(n)){ if (n !== ra) fused = true; continue; }
          stack.push(n);
        }
      }
    }
  });
  const directSubs = ring.map(ra => {
    const out = [];
    for (let i = 0; i < base.getAllConnAtoms(ra); i++){ const s = base.getConnAtom(ra, i); if (!inRing.has(s)) out.push(s); }
    return out;
  });

  // Which face each substituent is on, from the generated 3D shape (this carries the stereochemistry).
  const rp = ring.map(a => pos(base, a));
  const n0 = newellNormal(rp.map(p => v.sub(p, centroid(rp))));
  const upAtom = ring.map((ra, k) => {
    const subs = directSubs[k];
    if (!subs.length) return -1;
    const d = subs.map(s => v.dot(v.unit(v.sub(pos(base, s), rp[k])), n0));
    if (subs.length === 1) return d[0] >= 0 ? subs[0] : -1;
    return d[0] >= d[1] ? subs[0] : subs[1];
  });

  const finish = (m, label) => {
    const ff = new OCL.ForceFieldMMFF94(m, 'MMFF94s+');
    ff.minimise({ maxIts: 6000 });
    return { m, energy: ff.getTotalEnergy(), label, isChair: chairSense(m, ring) !== 0 };
  };

  let raw;
  if (fused){
    // Fused or bridged rings can't be rebuilt piece by piece; describe the generated shape as it is.
    raw = [finish(base, 'A')];
  } else {
    raw = [+1, -1].map((sense) => {
      const m = base.getCompactCopy();
      const h = 0.25, r = Math.sqrt(1.53 * 1.53 - 4 * h * h);
      const newRing = ring.map((_, k) => {
        const t = (k * Math.PI) / 3;
        return [r * Math.cos(t), r * Math.sin(t), (k % 2 ? -1 : 1) * sense * h];
      });
      ring.forEach((ra, k) => {
        setPos(m, ra, newRing[k]);
        const subs = directSubs[k];
        if (!subs.length) return;
        const radial = v.unit([newRing[k][0], newRing[k][1], 0]);
        const zs = Math.sign(newRing[k][2]);
        const axial = [0, 0, zs];
        const equatorial = v.unit(v.add(v.mul(radial, 0.94), [0, 0, -0.34 * zs]));
        // the substituent on the upper face takes the axial slot if this atom sits up, else the equatorial one
        const upDir = zs > 0 ? axial : equatorial, downDir = zs > 0 ? equatorial : axial;
        const oldC = rp[k];
        let R;
        if (subs.length >= 2){
          const up = upAtom[k], down = subs.find(s => s !== up);
          const oa = v.sub(pos(base, up), oldC), ob = v.sub(pos(base, down), oldC);
          R = frameRotation(frameFrom(v.add(v.unit(oa), v.unit(ob)), v.sub(v.unit(oa), v.unit(ob))),
                            frameFrom(v.add(upDir, downDir), v.sub(upDir, downDir)));
        } else {
          const s = subs[0];
          const o = v.unit(v.sub(pos(base, s), oldC));
          const target = upAtom[k] === s ? upDir : downDir;
          R = frameRotation(frameFrom(o, anyPerp(o)), frameFrom(target, anyPerp(target)));
        }
        for (const a of branches[k]) setPos(m, a, v.add(newRing[k], apply(R, v.sub(pos(base, a), oldC))));
      });
      return finish(m, sense > 0 ? 'A' : 'B');
    });
  }

  return { ring, raw, fused, owner, branches, directSubs, inRing, upSig: upAtom.join(','), ringLabels: ring.map(a => base.getAtomLabel(a)) };
}

function describe(OCL, { ring, raw, fused, owner, directSubs, inRing, ringLabels }){
  const chairs = raw.map(({ m, energy, label }) => {
    // Put the ring in a standard orientation: centroid at origin, mean plane horizontal (normal = +y).
    const ps = ring.map(a => pos(m, a)), c = centroid(ps);
    const n = newellNormal(ps.map(p => v.sub(p, c)));
    const x = v.unit(v.sub(v.sub(ps[0], c), v.mul(n, v.dot(v.sub(ps[0], c), n))));
    const z = v.cross(x, n); // x, y=n, z right-handed
    // tilt 22° toward the viewer (who looks down -z) so the top face shows, like a textbook chair
    const ca = Math.cos(22 * Math.PI / 180), sa = Math.sin(22 * Math.PI / 180);
    const coords = [];
    for (let a = 0; a < m.getAllAtoms(); a++){
      const p = v.sub(pos(m, a), c);
      const X = v.dot(p, x), Y = v.dot(p, n), Z = v.dot(p, z);
      coords.push([X, Y * ca - Z * sa, Y * sa + Z * ca]);
    }
    const flat = [];
    for (let a = 0; a < m.getAllAtoms(); a++){ const p = v.sub(pos(m, a), c); flat.push([v.dot(p, x), v.dot(p, n), v.dot(p, z)]); }
    const sense = chairSense(m, ring);
    const subs = [];
    ring.forEach((ra, k) => {
      for (const s of directSubs[k]){
        if (m.getBondOrder(m.getBond(ra, s)) !== 1) continue; // e.g. C=O: neither axial nor equatorial
        const d = v.unit(v.sub(flat[s], flat[ra]));
        const isH = m.getAtomicNo(s) === 1;
        const br = [...reach(m, s, ra, inRing)];
        const loops = br.some(a => { for (let j = 0; j < m.getAllConnAtoms(a); j++){ const n = m.getConnAtom(a, j); if (n !== ra && inRing.has(n)) return true; } return false; });
        const group = isH ? 'H' : loops ? 'ring' : condensed(m, s, ra, br);
        subs.push({ ringPos: k + 1, ringAtom: ra, atom: s, group, isH, axial: Math.abs(d[1]) > 0.7, up: d[1] > 0 });
      }
    });
    return { label, energy, coords, isChair: sense !== 0, subs, elements: Array.from({ length: m.getAllAtoms() }, (_, a) => m.getAtomLabel(a)), molfile: m.toMolfile() };
  });

  return { ring, chairs, canFlip: !fused && chairs.length === 2 && chairs.every(c => c.isChair), fused, ringLabels };
}

// Atoms in the branch that starts at s (not crossing ring atom ra or the ring).
function reach(m, s, ra, inRing){
  const seen = new Set([s]), stack = [s];
  while (stack.length){
    const a = stack.pop();
    for (let j = 0; j < m.getAllConnAtoms(a); j++){
      const n = m.getConnAtom(a, j);
      if (n === ra || inRing.has(n) || seen.has(n)) continue;
      seen.add(n); stack.push(n);
    }
  }
  return seen;
}

export function toXYZ(elements, coords, title = ''){
  return `${elements.length}\n${title}\n` + elements.map((e, i) => `${e} ${coords[i].map(x => x.toFixed(4)).join(' ')}`).join('\n') + '\n';
}

// Frames for the flip animation: linear blend between the two aligned chairs.
export function flipFrames(a, b, n = 24){
  const frames = [];
  for (let i = 0; i <= n; i++){
    const t = 0.5 - 0.5 * Math.cos(Math.PI * i / n);
    frames.push(a.map((p, j) => [p[0] + (b[j][0] - p[0]) * t, p[1] + (b[j][1] - p[1]) * t, p[2] + (b[j][2] - p[2]) * t]));
  }
  return frames;
}
