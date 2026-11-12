// Reactivity analyser for the SN1/SN2/E1/E2 feature (see docs/mechanisms-plan.md, Part B).
// Pure graph logic on OpenChemLib molecules: finds leaving-group sites and their roles
// (Cα, LG, Cβ, β-H), the substrate class, flags, the carbocation score and every 1,2-shift,
// and builds product molecules with stereo set through OpenChemLib (never by swapping letters).
//
// Stereo note (spikes S1/S4, 2026-11-07): OpenChemLib recomputes parities from 2D coordinates
// when it makes an ID code, so a parity set with setAtomParity/setBondParity is only kept if we
// call setParitiesValid(0), inventCoordinates(), setStereoBondsFromParity() and then re-read the
// molecule from a molfile. buildProduct() does exactly that. Atom parities are relative to the
// order of neighbour indices, so the nucleophile takes the leaving group's atom index (same order =
// retention) and inversion is 3 − parity.

const HALO = { 9: 'F', 17: 'Cl', 35: 'Br', 53: 'I' };
// leaving-group quality, higher = better (I > Br > Cl; sulfonates best; F and OH poor)
export const LG_RANK = { OTs: 5, OMs: 5, OSO2R: 5, I: 4, Br: 3, Cl: 2, F: 0, OH: 0 };
export const LG_LABEL = { OTs: 'OTs (tosylate)', OMs: 'OMs (mesylate)', OSO2R: 'sulfonate', I: 'I', Br: 'Br', Cl: 'Cl', F: 'F', OH: 'OH' };

// A heavy-atom copy without explicit hydrogens (editor drawings may contain them).
export function prepare(OCL, mol){
  const m = mol.getCompactCopy();
  m.removeExplicitHydrogens();
  m.ensureHelperArrays(OCL.Molecule.cHelperRings);
  return m;
}

// ---------- a tiny adjacency graph, so shifts can be tried without touching OpenChemLib ----------
function toGraph(m){
  const n = m.getAtoms(), Z = [], arom = [], nb = [], order = new Map();
  for (let a = 0; a < n; a++){ Z.push(m.getAtomicNo(a)); arom.push(m.isAromaticAtom(a)); nb.push(new Set()); }
  for (let b = 0; b < m.getBonds(); b++){
    const x = m.getBondAtom(0, b), y = m.getBondAtom(1, b);
    if (x >= n || y >= n) continue;
    nb[x].add(y); nb[y].add(x);
    order.set(key(x, y), m.isAromaticBond(b) ? 1.5 : m.getBondOrder(b));
  }
  return { n, Z, arom, nb, order, dead: new Set() };
}
const key = (a, b) => a < b ? a + '-' + b : b + '-' + a;
function cloneGraph(g){ return { ...g, nb: g.nb.map(s => new Set(s)), order: new Map(g.order), dead: new Set(g.dead) }; }
function applyOps(g, ops = {}){
  const h = cloneGraph(g);
  for (const a of ops.del || []){ h.dead.add(a); for (const x of h.nb[a]){ h.nb[x].delete(a); h.order.delete(key(a, x)); } h.nb[a].clear(); }
  for (const [a, b] of ops.removeBonds || []){ h.nb[a].delete(b); h.nb[b].delete(a); h.order.delete(key(a, b)); }
  for (const [a, b, o] of ops.addBonds || []){ h.nb[a].add(b); h.nb[b].add(a); h.order.set(key(a, b), o || 1); }
  for (const [a, b, o] of ops.setOrder || []) h.order.set(key(a, b), o);
  return h;
}
const valence = (g, a) => [...g.nb[a]].reduce((s, x) => s + g.order.get(key(a, x)), 0);
// hydrogens on a carbon of the graph; the cation centre has one bond's worth fewer
const hOn = (g, a, centre) => g.Z[a] === 6 ? Math.max(0, Math.round(4 - valence(g, a) - (a === centre ? 1 : 0))) : 0;
const carbonsOn = (g, a) => [...g.nb[a]].filter(x => g.Z[x] === 6).length;
const hasPi = (g, a) => [...g.nb[a]].some(x => g.order.get(key(a, x)) > 1);
function nextToPi(g, a, except = -1){
  // allylic/benzylic: a neighbour (other than `except`) is aromatic or carries a C=C/C≡C
  return [...g.nb[a]].some(x => x !== except && g.Z[x] === 6 && (g.arom[x] || [...g.nb[x]].some(y => y !== a && g.order.get(key(x, y)) >= 2 && g.Z[y] === 6)));
}

// ---------- sites ----------
function sulfonyl(m, o){
  // O–S(=O)(=O)R → returns { type, atoms } with every atom of the leaving group, else null
  for (let i = 0; i < m.getConnAtoms(o); i++){
    const s = m.getConnAtom(o, i);
    if (m.getAtomicNo(s) !== 16) continue;
    let oxo = 0, r = -1;
    for (let j = 0; j < m.getConnAtoms(s); j++){
      const x = m.getConnAtom(s, j);
      if (x === o) continue;
      if (m.getAtomicNo(x) === 8 && m.getConnBondOrder(s, j) === 2) oxo++; else r = x;
    }
    if (oxo !== 2 || r < 0) continue;
    const atoms = [o], stack = [s], seen = new Set([o]);
    while (stack.length){ const x = stack.pop(); if (seen.has(x)) continue; seen.add(x); atoms.push(x); for (let j = 0; j < m.getConnAtoms(x); j++) stack.push(m.getConnAtom(x, j)); }
    let type = 'OSO2R';
    if (m.getAtomicNo(r) === 6 && !m.isAromaticAtom(r) && m.getConnAtoms(r) === 1) type = 'OMs';
    else if (m.isAromaticAtom(r) && atoms.length === 11) type = 'OTs'; // O, S, 2 O, 6 ring C, CH3
    return { type, atoms };
  }
  return null;
}

// analyse(OCL, mol) → { mol (prepared copy), sites: [...] }.  See siteInfo for the fields.
export function analyse(OCL, mol){
  const m = prepare(OCL, mol);
  m.ensureHelperArrays(OCL.Molecule.cHelperCIP);
  const sites = [];
  for (let a = 0; a < m.getAtoms(); a++){
    const z = m.getAtomicNo(a);
    if (HALO[z] && m.getConnAtoms(a) === 1 && m.getAtomCharge(a) === 0){
      const c = m.getConnAtom(a, 0);
      if (m.getAtomicNo(c) === 6 && m.getConnBondOrder(a, 0) === 1) sites.push(siteInfo(OCL, m, c, a, [a], HALO[z]));
    } else if (z === 8 && m.getAtomCharge(a) === 0){
      const sul = sulfonyl(m, a);
      const carbons = [];
      for (let i = 0; i < m.getConnAtoms(a); i++){ const c = m.getConnAtom(a, i); if (m.getAtomicNo(c) === 6) carbons.push(c); }
      if (sul && carbons.length === 1) sites.push(siteInfo(OCL, m, carbons[0], a, sul.atoms, sul.type));
      else if (m.getConnAtoms(a) === 1 && carbons.length === 1 && m.getAllHydrogens(a) === 1){
        const c = carbons[0];
        // alcohol only: sp3 carbon, not a phenol, enol, acid or hemiacetal
        if (!m.isAromaticAtom(c) && m.getAtomPi(c) === 0) sites.push(siteInfo(OCL, m, c, a, [a], 'OH'));
      }
    }
  }
  return { mol: m, sites };
}

function siteInfo(OCL, m, ca, lgAtom, lgAtoms, lg){
  const g = applyOps(toGraph(m), { del: lgAtoms });
  const s = { ca, lgAtom, lgAtoms, lg, lgRank: LG_RANK[lg], flags: [] };
  s.carbons = carbonsOn(g, ca);
  const aromatic = m.isAromaticAtom(ca), sp2 = m.getAtomPi(ca) > 0;
  s.cls = aromatic ? 'aryl' : sp2 ? 'vinyl' : s.carbons === 0 ? 'methyl' : String(Math.min(s.carbons, 3));
  if (aromatic || sp2) s.flags.push(aromatic ? 'aryl' : 'vinyl');
  s.benzylic = !sp2 && [...g.nb[ca]].some(x => g.arom[x]);
  s.allylic = !sp2 && [...g.nb[ca]].some(x => !g.arom[x] && g.Z[x] === 6 && [...g.nb[x]].some(y => y !== ca && g.order.get(key(x, y)) === 2 && g.Z[y] === 6));
  s.ab = s.allylic || s.benzylic;
  s.inRing = m.isRingAtom(ca);
  // other groups on Cα that change the rules (C=O, heteroatoms, a second halogen)
  for (const x of g.nb[ca]){
    if (g.Z[x] !== 6) s.flags.push('alphaHetero');
    else if ([...g.nb[x]].some(y => g.Z[y] !== 6 && g.order.get(key(x, y)) >= 2)) s.flags.push('alphaCarbonyl');
  }
  s.beta = [...g.nb[ca]].filter(x => g.Z[x] === 6).map(x => ({ atom: x, h: hOn(g, x, -1), carbons: carbonsOn(g, x) - 1, sp2: hasPi(g, x) || g.arom[x] }));
  s.betaH = s.beta.filter(b => !b.sp2).reduce((t, b) => t + b.h, 0);
  s.betaBranching = s.beta.reduce((t, b) => t + b.carbons, 0); // extra carbons on the β-carbons
  s.neopentyl = s.cls === '1' && s.beta.some(b => b.carbons === 3);
  if (s.neopentyl) s.flags.push('neopentyl');
  if (lg === 'F') s.flags.push('poorLG');
  // stereo at Cα
  const p = m.getAtomParity(ca), cip = m.getAtomCIPParity(ca);
  s.stereo = !m.isAtomStereoCenter(ca) && !(p === 1 || p === 2) ? 'none'
    : (p === 1 || p === 2) ? (m.isAtomParityPseudo(ca) ? 'cis/trans' : cip === 1 ? 'R' : cip === 2 ? 'S' : 'defined')
    : 'undefined';
  s.cationScore = sp2 || aromatic ? null : cationScore(g, ca, 0);
  return s;
}

// Carbocation stability as an integer (plan: carbons on C⁺, +1 allylic/benzylic, +1 ring-strain relief).
function cationScore(g, c, strain){ return carbonsOn(g, c) + (nextToPi(g, c) ? 1 : 0) + strain; }

// ---------- carbocation pathways: no shift, allylic resonance, every 1,2-shift that helps ----------
// Each pathway: { centre, ops (graph edits after the LG leaves), score, carbons (C's on the C⁺ → its class), shift, label, from, group, notes }
export function cationPathways(OCL, m, site){
  const g0 = applyOps(toGraph(m), { del: site.lgAtoms });
  const ca = site.ca;
  const s0 = cationScore(g0, ca, 0);
  const base = { centre: ca, ops: {}, score: s0, carbons: carbonsOn(g0, ca), shift: null, label: 'no shift' };
  const out = [base];
  const notes = [];
  // allylic resonance: the + is shared with the far end of the C=C
  for (const b of g0.nb[ca]){
    if (g0.arom[b] || g0.Z[b] !== 6) continue;
    for (const y of g0.nb[b]) if (y !== ca && g0.Z[y] === 6 && g0.order.get(key(b, y)) === 2)
      out.push({ centre: y, ops: { setOrder: [[ca, b, 2], [b, y, 1]] }, score: s0, carbons: carbonsOn(g0, y), shift: 'allylic', label: 'allylic resonance form', from: ca });
  }
  for (const n of g0.nb[ca]){
    if (g0.Z[n] !== 6 || g0.arom[n] || hasPi(g0, n)) continue;
    if (hOn(g0, n, ca) > 0){
      const sc = cationScore(g0, n, 0);
      if (sc > s0) out.push({ centre: n, ops: {}, score: sc, carbons: carbonsOn(g0, n), shift: 'H', label: 'hydride shift', from: n });
    }
    for (const gx of g0.nb[n]){
      if (gx === ca || g0.Z[gx] !== 6) continue;
      const b = m.getBond(n, gx);
      const ring = m.isRingBond(b);
      const ops = { removeBonds: [[n, gx]], addBonds: [[ca, gx, 1]] };
      if (ring){
        if (m.isRingAtom(ca) && sharesRing(m, ca, n, gx)){ notes.push('ring contraction'); continue; }
        const size = m.getBondRingSize(b);
        const sc = cationScore(applyOps(g0, ops), n, size >= 3 && size <= 5 ? 1 : 0);
        if (sc > s0) out.push({ centre: n, ops, score: sc, carbons: carbonsOn(applyOps(g0, ops), n), shift: 'ring', label: `ring expansion (${size}- to ${size + 1}-membered ring)`, from: n, group: gx, ringFrom: size });
      } else {
        const sc = cationScore(applyOps(g0, ops), n, 0);
        const what = g0.arom[gx] ? 'phenyl shift' : carbonsOn(g0, gx) === 1 ? 'methyl shift' : 'alkyl shift';
        if (sc > s0) out.push({ centre: n, ops, score: sc, carbons: carbonsOn(applyOps(g0, ops), n), shift: 'alkyl', label: what, from: n, group: gx });
      }
    }
  }
  return { pathways: out, notes };
}
function sharesRing(m, a, b, c){
  const rs = m.getRingSet();
  for (let r = 0; r < rs.getSize(); r++){ const at = rs.getRingAtoms(r); if (at.includes(a) && at.includes(b) && at.includes(c)) return true; }
  // getRingSet() only lists rings up to 7 atoms. If the migrating bond's smallest ring is bigger, we can't
  // tell, so assume it's shared (contraction isn't covered). Otherwise no listed ring holds all three: the shift
  // expands a ring that doesn't contain C+ (worksheet 5: spiro[4.5]decane → decalin), so it's allowed.
  return m.getBondRingSize(m.getBond(b, c)) > 7;
}

// ---------- alkenes ----------
// alkenesFrom(OCL, m, centre, ops): every alkene from removing one β-H next to `centre`
// (E2: centre = Cα with ops.del = LG atoms; E1: the cation pathway's centre and ops).
// Returns [{ beta, ops (with the new C=C), zaitsev, conj }]; E/Z isomers are made by productsOf().
export function alkenesFrom(OCL, m, centre, ops = {}){
  const g = applyOps(toGraph(m), ops);
  const out = [];
  if (g.arom[centre] || hasPi(g, centre)) return out;
  for (const b of g.nb[centre]){
    if (g.Z[b] !== 6 || g.arom[b] || hasPi(g, b) || hOn(g, b, centre) < 1) continue;
    const ops2 = { ...ops, setOrder: [...(ops.setOrder || []), [centre, b, 2]], clear: [...(ops.clear || []), centre, b] };
    const h = applyOps(g, { setOrder: [[centre, b, 2]] });
    const subs = (carbonsOn(h, centre) - 1) + (carbonsOn(h, b) - 1);
    const conj = nextToPi(h, centre, b) || nextToPi(h, b, centre);
    out.push({ beta: b, centre, ops: ops2, zaitsev: subs + (conj ? 2 : 0), conj });
  }
  return out;
}

// ---------- product building ----------
// buildProduct(OCL, sub, ops) → { mol, map }   (map: old atom index → new index, −1 if deleted)
// ops: del [atoms], replace [{atom, frag}], attach [{to, frag}], removeBonds [[a,b]], addBonds [[a,b,order]],
//      setOrder [[a,b,order]], invert [atoms], clear [atoms], bondParity [{a,b,p}]
// frag = { smiles (Kekulé form) or mol (an OpenChemLib molecule), atom (attaching atom in the fragment) }
export function buildProduct(OCL, sub, ops = {}){
  const M = OCL.Molecule;
  const m = sub.getCompactCopy();
  m.ensureHelperArrays(M.cHelperParities);
  const n0 = m.getAllAtoms();
  const par = [], pse = [], nbrs = [];
  for (let a = 0; a < n0; a++){
    par.push(m.getAtomParity(a)); pse.push(m.isAtomParityPseudo(a));
    const l = []; for (let i = 0; i < m.getConnAtoms(a); i++) l.push(m.getConnAtom(a, i)); nbrs.push(l.sort((x, y) => x - y).join(','));
  }
  const oldBonds = [];
  for (let b = 0; b < m.getBonds(); b++) if (m.getBondOrder(b) === 2 && !m.isAromaticBond(b)) oldBonds.push({ a: m.getBondAtom(0, b), b: m.getBondAtom(1, b), p: m.getBondParity(b), pseudo: m.isBondParityPseudo(b) });

  const typeOf = (o) => o === 2 ? M.cBondTypeDouble : o === 3 ? M.cBondTypeTriple : M.cBondTypeSingle;
  const addFrag = (frag, anchor, replace) => {
    const f = frag.mol ? frag.mol.getCompactCopy() : M.fromSmiles(frag.smiles); f.ensureHelperArrays(M.cHelperNeighbours);
    const fm = [];
    for (let i = 0; i < f.getAtoms(); i++){
      if (i === frag.atom && replace){ fm[i] = anchor; m.setAtomicNo(anchor, f.getAtomicNo(i)); m.setAtomCharge(anchor, f.getAtomCharge(i)); continue; }
      fm[i] = m.addAtom(f.getAtomicNo(i)); m.setAtomCharge(fm[i], f.getAtomCharge(i));
    }
    for (let b = 0; b < f.getBonds(); b++) m.setBondType(m.addBond(fm[f.getBondAtom(0, b)], fm[f.getBondAtom(1, b)]), typeOf(f.getBondOrder(b)));
    if (!replace) m.setBondType(m.addBond(anchor, fm[frag.atom]), M.cBondTypeSingle);
  };
  for (const r of ops.replace || []) addFrag(r.frag, r.atom, true);
  for (const r of ops.attach || []) addFrag(r.frag, r.to, false);
  // getBond() reads cached neighbour arrays that go stale after deleteBond()/addBond() renumber
  // the bond table (it then returns another bond's index), so look bonds up by scanning instead.
  for (const [a, b] of ops.removeBonds || []) m.deleteBond(bondBetween(m, a, b));
  for (const [a, b, o] of ops.addBonds || []) m.setBondType(m.addBond(a, b), typeOf(o || 1));
  for (const [a, b, o] of ops.setOrder || []){
    const bi = bondBetween(m, a, b);
    if (bi < 0) throw new Error(`buildProduct: no bond ${a}-${b} to set`);
    m.setBondType(bi, typeOf(o));
  }

  const del = new Set(ops.del || []);
  const total = m.getAllAtoms();
  const map = []; let k = 0;
  for (let a = 0; a < total; a++) map.push(del.has(a) ? -1 : k++);
  if (del.size) m.deleteAtoms([...del]);
  m.ensureHelperArrays(M.cHelperParities);

  // neighbour lists in old numbering (new fragment atoms keep their own numbers ≥ n0)
  const back = []; map.forEach((nw, old) => { if (nw >= 0) back[nw] = old; });
  const nbrNow = (old) => { const a = map[old], l = []; for (let i = 0; i < m.getConnAtoms(a); i++) l.push(back[m.getConnAtom(a, i)]); return l.sort((x, y) => x - y).join(','); };
  const invert = new Set(ops.invert || []), clear = new Set(ops.clear || []);
  const keep = [];
  let pseudoLost = false;
  for (let a = 0; a < n0; a++){
    if (map[a] < 0) continue;
    let p = par[a];
    const changed = clear.has(a) || nbrNow(a) !== nbrs[a];
    if (changed){ if (pse[a] && (p === 1 || p === 2)) pseudoLost = true; p = 0; }
    else if (invert.has(a) && (p === 1 || p === 2)) p = 3 - p;
    keep.push([a, p]);
  }
  for (const [a, p] of keep){
    const q = pseudoLost && pse[a] ? 0 : p;
    m.setAtomParity(map[a], q, pse[a] && q !== 0);
  }
  for (const ob of oldBonds){
    if (map[ob.a] < 0 || map[ob.b] < 0) continue;
    const bi = m.getBond(map[ob.a], map[ob.b]);
    if (bi < 0 || m.getBondOrder(bi) !== 2) continue;
    const same = !clear.has(ob.a) && !clear.has(ob.b) && nbrNow(ob.a) === nbrs[ob.a] && nbrNow(ob.b) === nbrs[ob.b];
    m.setBondParity(bi, same ? ob.p : M.cBondParityUnknown, ob.pseudo && same);
  }
  const set = new Set();
  for (const ob of oldBonds) if (map[ob.a] >= 0 && map[ob.b] >= 0) set.add(m.getBond(map[ob.a], map[ob.b]));
  for (const bp of ops.bondParity || []){ const bi = m.getBond(map[bp.a], map[bp.b]); m.setBondParity(bi, bp.p, false); set.add(bi); }
  // a double bond whose geometry we don't know is marked "unknown", never left to the 2D layout
  for (let b = 0; b < m.getBonds(); b++) if (m.getBondOrder(b) === 2 && !m.isAromaticBond(b) && !set.has(b)) m.setBondParity(b, M.cBondParityUnknown, false);
  m.setParitiesValid(0);
  m.inventCoordinates();
  m.setStereoBondsFromParity();
  const out = M.fromMolfile(m.toMolfile());
  out.ensureHelperArrays(M.cHelperCIP);
  return { mol: out, map };
}

// Bond index between atoms a and b without OpenChemLib's helper caches (safe right after edits); −1 if none.
export function bondBetween(m, a, b){
  for (let i = 0; i < m.getAllBonds(); i++){
    const x = m.getBondAtom(0, i), y = m.getBondAtom(1, i);
    if ((x === a && y === b) || (x === b && y === a)) return i;
  }
  return -1;
}

// The heavy-atom size of the branch starting at `start`, not going back through `from`.
function branchSize(m, from, start){
  const seen = new Set([from]), st = [start]; let n = 0;
  while (st.length){ const x = st.pop(); if (seen.has(x)) continue; seen.add(x); n++; for (let i = 0; i < m.getConnAtoms(x); i++) st.push(m.getConnAtom(x, i)); }
  return n;
}

// Alkene products with E/Z set explicitly. Returns 1 product (bond not stereogenic) or 2 (E and Z),
// each { mol, ez: 'E'|'Z'|null, trans: true|false|null }. `trans` = the bulkier groups on opposite sides
// (the Zaitsev/trans preference); null when the bulk comparison is a tie on either end.
export function alkeneProducts(OCL, sub, alkene, unknown = false){
  const M = OCL.Molecule;
  if (unknown){
    const u = buildProduct(OCL, sub, { ...alkene.ops, bondParity: [...(alkene.ops.bondParity || []), { a: alkene.centre, b: alkene.beta, p: M.cBondParityUnknown }] });
    return [{ mol: u.mol, map: u.map, ez: null, trans: null }];
  }
  const one = buildProduct(OCL, sub, { ...alkene.ops, bondParity: [...(alkene.ops.bondParity || []), { a: alkene.centre, b: alkene.beta, p: 1 }] });
  const A = one.map[alkene.centre], B = one.map[alkene.beta];
  const bi = one.mol.getBond(A, B);
  const bp = one.mol.getBondParity(bi);
  if (bp !== M.cBondParityEor1 && bp !== M.cBondParityZor2) return [{ mol: one.mol, map: one.map, ez: null, trans: null }];
  // a C=C inside a ring of fewer than 8 atoms can only be cis, so it has no E/Z
  if (one.mol.isRingBond(bi) && one.mol.getBondRingSize(bi) < 8) return [{ mol: one.mol, map: one.map, ez: null, trans: null }];
  const two = buildProduct(OCL, sub, { ...alkene.ops, bondParity: [...(alkene.ops.bondParity || []), { a: alkene.centre, b: alkene.beta, p: 2 }] });
  if (two.mol.getIDCode() === one.mol.getIDCode()) return [{ mol: one.mol, map: one.map, ez: null, trans: null }];
  return [one, two].map(({ mol, map }) => {
    const cip = mol.getBondCIPParity(mol.getBond(A, B));
    return { mol, map, ez: cip === 1 ? 'E' : cip === 2 ? 'Z' : null, trans: transOf(mol, A, B) };
  });
}
function transOf(m, A, B){
  const big = (x, other) => {
    const subs = []; for (let i = 0; i < m.getConnAtoms(x); i++){ const y = m.getConnAtom(x, i); if (y !== other) subs.push([y, branchSize(m, x, y)]); }
    if (!subs.length) return -1;
    if (subs.length === 2 && subs[0][1] === subs[1][1]) return null;
    return subs.sort((p, q) => q[1] - p[1])[0][0];
  };
  const sa = big(A, B), sb = big(B, A);
  if (sa === null || sb === null || sa < 0 || sb < 0) return null;
  const P = (i) => [m.getAtomX(i), m.getAtomY(i)];
  const [ax, ay] = P(A), [bx, by] = P(B);
  const side = (i) => { const [x, y] = P(i); return Math.sign((bx - ax) * (y - ay) - (by - ay) * (x - ax)); };
  return side(sa) * side(sb) < 0;
}
