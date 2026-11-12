// Built-in IUPAC namer for structures that PubChem doesn't have.
// Follows the IUPAC 2013 recommendations (P-14, P-29, P-31, P-41, P-44, P-45) for:
//   acyclic chains, isolated carbocycles (cycloalkanes/-alkenes) and benzene, as parents and as substituents;
//   suffixes: carboxylic acid, ester, amide, nitrile, aldehyde, ketone, alcohol/phenol, thiol, amine;
//   prefixes: halo, nitro, hydroxy, oxo, amino (and N-substituted), alkoxy/aryloxy, sulfanyl, acyl, carboxy, cyano…;
//   R/S and E/Z from OpenChemLib's CIP calculation, cis/trans for disubstituted rings.
// Anything outside that scope returns { error } so the app can say so instead of guessing.
// Every name is meant to be checked by OPSIN converting it back into a structure.

const STEMS = [null, 'meth', 'eth', 'prop', 'but', 'pent', 'hex', 'hept', 'oct', 'non', 'dec', 'undec', 'dodec', 'tridec', 'tetradec', 'pentadec', 'hexadec', 'heptadec', 'octadec', 'nonadec', 'icos',
  'henicos', 'docos', 'tricos', 'tetracos', 'pentacos', 'hexacos', 'heptacos', 'octacos', 'nonacos', 'triacont'];
const MULT = [null, '', 'di', 'tri', 'tetra', 'penta', 'hexa', 'hepta', 'octa', 'nona', 'deca', 'undeca', 'dodeca'];
const MULTX = [null, '', 'bis', 'tris', 'tetrakis', 'pentakis', 'hexakis', 'heptakis', 'octakis', 'nonakis', 'decakis'];
const HALO = { F: 'fluoro', Cl: 'chloro', Br: 'bromo', I: 'iodo' };
// seniority of suffix groups (P-41), most senior first
const SENIORITY = ['acid', 'ester', 'amide', 'nitrile', 'aldehyde', 'ketone', 'alcohol', 'thiol', 'amine'];
const T_TYPES = new Set(['acid', 'ester', 'amide', 'nitrile']); // their carbon is in a chain only as the suffix carbon
const SUFFIX = {
  acid: { chain: 'oic acid', ring: 'carboxylic acid', label: 'carboxylic acid' },
  ester: { chain: 'oate', ring: 'carboxylate', label: 'ester' },
  amide: { chain: 'amide', ring: 'carboxamide', label: 'amide' },
  nitrile: { chain: 'nitrile', ring: 'carbonitrile', label: 'nitrile' },
  aldehyde: { chain: 'al', ring: 'carbaldehyde', label: 'aldehyde' },
  ketone: { chain: 'one', ring: 'one', label: 'ketone' },
  alcohol: { chain: 'ol', ring: 'ol', label: 'alcohol' },
  thiol: { chain: 'thiol', ring: 'thiol', label: 'thiol' },
  amine: { chain: 'amine', ring: 'amine', label: 'amine' },
};
// benzene + one suffix group: retained names that are also preferred IUPAC names
const BENZENE_RETAINED = { acid: 'benzoic acid', ester: 'benzoate', amide: 'benzamide', nitrile: 'benzonitrile', aldehyde: 'benzaldehyde', alcohol: 'phenol', amine: 'aniline' };
const ACETIC = { acid: 'acetic acid', ester: 'acetate', amide: 'acetamide', nitrile: 'acetonitrile', aldehyde: 'acetaldehyde' };
const FORMIC = { acid: 'formic acid', ester: 'formate', amide: 'formamide', nitrile: 'formonitrile', aldehyde: 'formaldehyde' };

class Unsupported extends Error {}
const best_mult = (ev) => ev.mult.length;
const fail = (msg) => { throw new Unsupported(msg); };

function cmp(a, b){
  if (Array.isArray(a)){
    for (let i = 0; i < Math.max(a.length, b.length); i++){
      if (i >= a.length) return -1; if (i >= b.length) return 1;
      const c = cmp(a[i], b[i]); if (c) return c;
    }
    return 0;
  }
  if (typeof a === 'string') return a < b ? -1 : a > b ? 1 : 0;
  return a - b;
}
const stem = (n) => STEMS[n] || fail(`chains or rings longer than ${STEMS.length - 1} carbons`);
const vowelStart = (s) => /^[aeiouy]/.test(s);
function wrap(name){
  if (name.includes('{')) return `(${name})`;
  if (name.includes('[')) return `{${name}}`;
  if (name.includes('(')) return `[${name}]`;
  return `(${name})`;
}
// alphanumerical ordering key (P-14.5): ignore locants, stereo, enclosing marks and italic prefixes
function alphaKey(name){
  return name.replace(/\((?:\d+|N)?[RSEZ](?:,(?:\d+|N)?[RSEZ])*\)-/g, '').replace(/\b(tert|sec|cis|trans)-/g, '').replace(/(^|[^a-z])N-/g, '$1')
    .replace(/[^a-z]/gi, '').toLowerCase();
}
const joinLoc = (locs) => locs.join(',');

export function nameMolecule(OCL, mol){
  try {
    return new Namer(OCL, mol).run();
  } catch (e) {
    if (e instanceof Unsupported) return { error: e.message };
    console.warn(e);
    return { error: 'the built-in namer hit an unexpected problem with this structure' };
  }
}

class Namer {
  constructor(OCL, mol){
    this.OCL = OCL;
    const m = mol.getCompactCopy();
    m.ensureHelperArrays(OCL.Molecule.cHelperCIP);
    this.m = m;
    this.n = m.getAtoms(); // heavy atoms come first
    this.steps = [];
    this.warnings = [];
    this.subCache = new Map();
  }

  // ---------- perception ----------
  perceive(){
    const m = this.m, n = this.n;
    if (n === 0) fail('an empty drawing');
    this.el = []; this.nb = []; this.hc = [];
    for (let a = 0; a < n; a++){
      const el = m.getAtomLabel(a);
      if (!['C', 'N', 'O', 'S', 'F', 'Cl', 'Br', 'I'].includes(el)) fail(`the element ${el}`);
      if (m.getAtomMass(a)) fail('isotope labels');
      this.el[a] = el;
      this.hc[a] = m.getAllHydrogens(a);
      const list = [];
      for (let i = 0; i < m.getConnAtoms(a); i++){
        const b = m.getConnBond(a, i);
        list.push({ atom: m.getConnAtom(a, i), order: m.isAromaticBond(b) ? 1.5 : m.getConnBondOrder(a, i), bond: b });
      }
      this.nb[a] = list;
    }
    // one molecule only
    const seen = new Set([0]), st = [0];
    while (st.length){ const a = st.pop(); for (const x of this.nb[a]) if (!seen.has(x.atom)){ seen.add(x.atom); st.push(x.atom); } }
    if (seen.size !== n) fail('drawings with more than one separate molecule');
    // radicals
    for (let a = 0; a < n; a++) if (m.getAtomRadical(a)) fail('radicals');

    // rings: isolated carbocycles only. Found from ring bonds, because OpenChemLib's ring list stops at 7 atoms.
    this.rings = []; this.ringOf = new Array(n).fill(-1);
    const ringNb = Array.from({ length: n }, () => []);
    for (let b = 0; b < m.getBonds(); b++) if (m.isRingBond(b)){
      const x = m.getBondAtom(0, b), y = m.getBondAtom(1, b);
      if (x < n && y < n){ ringNb[x].push(y); ringNb[y].push(x); }
    }
    for (let a = 0; a < n; a++) if (ringNb[a].length > 2) fail('fused, bridged or spiro ring systems');
    for (let a = 0; a < n; a++){
      if (!ringNb[a].length || this.ringOf[a] >= 0) continue;
      const atoms = [a]; let prev = -1, cur = a;
      for (;;){
        const nx = ringNb[cur].find(x => x !== prev);
        if (nx === undefined || nx === a) break;
        atoms.push(nx); prev = cur; cur = nx;
        if (atoms.length > n) fail('this ring system');
      }
      for (const x of atoms){
        this.ringOf[x] = this.rings.length;
        if (this.el[x] !== 'C') fail('rings containing atoms other than carbon (heterocycles)');
      }
      const aromatic = atoms.every((x, i) => m.isAromaticBond(this.bondIdxRaw(x, atoms[(i + 1) % atoms.length])));
      if (!aromatic && atoms.some(x => m.isAromaticAtom(x))) fail('this aromatic ring system');
      if (aromatic && atoms.length !== 6) fail('aromatic rings other than benzene');
      this.rings.push({ atoms, aromatic, size: atoms.length });
    }

    // characteristic groups
    const fg = []; this.fgOfC = new Map(); this.consumed = new Map(); // atom -> fg index
    const C = (a) => this.el[a] === 'C';
    const nbrs = (a, pred) => this.nb[a].filter(pred);
    this.nitro = new Set();
    for (let a = 0; a < n; a++){
      if (this.el[a] !== 'N') continue;
      const os = nbrs(a, x => this.el[x.atom] === 'O');
      if (os.length){
        const cs = nbrs(a, x => C(x.atom));
        if (os.length === 2 && cs.length === 1 && os.every(x => this.nb[x.atom].length === 1)){ this.nitro.add(a); os.forEach(x => this.nitro.add(x.atom)); continue; }
        fail('N–O groups other than nitro (e.g. oximes, N-oxides)');
      }
    }
    for (let a = 0; a < n; a++){
      const ch = m.getAtomCharge(a);
      if (ch && !this.nitro.has(a)) fail('charged atoms or salts');
    }
    for (let a = 0; a < n; a++){
      if (!C(a)) continue;
      const dO = nbrs(a, x => this.el[x.atom] === 'O' && x.order === 2);
      const tN = nbrs(a, x => this.el[x.atom] === 'N' && x.order === 3);
      const other = nbrs(a, x => x.order === 2 && !['C', 'O'].includes(this.el[x.atom]));
      if (other.length) fail('C=N, C=S or similar double bonds to heteroatoms');
      if (tN.length){
        const cn = tN[0].atom;
        if (this.nb[cn].length !== 1) fail('unusual nitrile-like groups');
        fg.push({ type: 'nitrile', c: a, atoms: [cn] });
        continue;
      }
      if (!dO.length) continue;
      if (dO.length > 1) fail('carbon atoms with two C=O bonds');
      if (this.ringOf[a] >= 0){
        // ring carbonyl: ketone (heteroatom rings were rejected above)
        if (nbrs(a, x => x.order === 1 && !C(x.atom)).length) fail('unusual ring carbonyl groups');
        fg.push({ type: 'ketone', c: a, atoms: [dO[0].atom] });
        continue;
      }
      const single = nbrs(a, x => x.order === 1 && !C(x.atom));
      const cs = nbrs(a, x => C(x.atom));
      if (single.some(x => HALO[this.el[x.atom]])) fail('acid halides');
      if (single.some(x => this.el[x.atom] === 'S')) fail('thioesters');
      if (single.length > 1) fail('carbonates, carbamates and similar groups');
      const oS = single.find(x => this.el[x.atom] === 'O');
      const nS = single.find(x => this.el[x.atom] === 'N');
      if (oS){
        const o = oS.atom;
        const rest = this.nb[o].filter(x => x.atom !== a);
        if (!rest.length){ fg.push({ type: 'acid', c: a, atoms: [dO[0].atom, o] }); continue; }
        const r = rest[0].atom;
        if (!C(r)) fail('peroxy acids and similar groups');
        if (nbrs(r, x => this.el[x.atom] === 'O' && x.order === 2).length) fail('acid anhydrides');
        fg.push({ type: 'ester', c: a, atoms: [dO[0].atom, o], esterO: o, alkylC: r });
        continue;
      }
      if (nS){
        const nn = nS.atom;
        if (this.nb[nn].some(x => x.atom !== a && (this.el[x.atom] !== 'C' || x.order !== 1))) fail('unusual amide nitrogen substituents');
        if (this.nb[nn].some(x => x.atom !== a && nbrs(x.atom, y => this.el[y.atom] === 'O' && y.order === 2).length)) fail('imides');
        fg.push({ type: 'amide', c: a, atoms: [dO[0].atom, nn], n: nn });
        continue;
      }
      if (cs.length <= 1){
        if (this.hc[a] < 1 && cs.length === 1) fail('unusual carbonyl groups');
        fg.push({ type: 'aldehyde', c: a, atoms: [dO[0].atom] });
      } else fg.push({ type: 'ketone', c: a, atoms: [dO[0].atom] });
    }
    const inFg = new Set(); fg.forEach(g => { inFg.add(g.c); g.atoms.forEach(x => inFg.add(x)); });
    for (let a = 0; a < n; a++){
      const el = this.el[a];
      if (inFg.has(a) || this.nitro.has(a)) continue;
      if (el === 'O' || el === 'S'){
        const ns = this.nb[a];
        if (ns.some(x => x.order !== 1)) fail(`unusual ${el === 'O' ? 'oxygen' : 'sulfur'} groups`);
        if (ns.some(x => !C(x.atom))) fail(el === 'O' ? 'peroxides and O–N/O–S bonds' : 'S–S or S–heteroatom bonds');
        if (el === 'S' && this.hc[a] + ns.length !== 2) fail('sulfoxides, sulfones and other higher-valent sulfur');
        if (ns.length === 1) fg.push({ type: el === 'O' ? 'alcohol' : 'thiol', c: ns[0].atom, atoms: [a] });
        // two carbons: ether / sulfide, named as a prefix
      } else if (el === 'N'){
        const ns = this.nb[a];
        if (ns.some(x => x.order !== 1)) fail('imines, azo and other N double bonds');
        if (ns.some(x => !C(x.atom))) fail('hydrazines and other N–N bonds');
        // N on an acyl carbon is an amide (handled); a plain amine:
        fg.push({ type: 'amine', n: a, cs: ns.map(x => x.atom), atoms: [a] });
      } else if (HALO[el]){
        if (this.nb[a].length !== 1 || !C(this.nb[a][0].atom)) fail('halogens bonded to heteroatoms');
      }
    }
    this.fg = fg;
    fg.forEach((g, i) => { if (g.c !== undefined && T_TYPES.has(g.type)) this.fgOfC.set(g.c, g); if (g.c !== undefined && (g.type === 'aldehyde' || g.type === 'ketone')) this.fgOfC.set(g.c, g); });
    this.tCarbon = new Set(fg.filter(g => T_TYPES.has(g.type)).map(g => g.c));

    // principal group
    this.principal = SENIORITY.find(t => fg.some(g => g.type === t)) || null;
    this.pgroups = fg.filter(g => g.type === this.principal);
    this.excluded = new Set();
    if (this.principal === 'ester'){
      if (this.pgroups.length > 1) fail('molecules with more than one ester group');
      const g = this.pgroups[0];
      // the alkyl part (O–R) is named as a separate word
      const side = this.reachFrom(g.alkylC, g.esterO);
      side.forEach(a => this.excluded.add(a));
      this.excluded.add(g.esterO);
    }
    const amineN = this.principal === 'amine' ? this.pgroups : [];
    if (amineN.length > 1 && amineN.some(g => g.cs.length > 1)) fail('several amine groups when some carry extra N-substituents');
    if (this.principal === 'amide' && this.pgroups.length > 1 && this.pgroups.some(g => this.nb[g.n].length > 1)) fail('several amide groups with N-substituents');
  }

  nbOf(a){
    const out = [];
    for (let i = 0; i < this.m.getConnAtoms(a); i++) out.push(this.m.getConnAtom(a, i));
    return out;
  }
  bondIdxRaw(a, b){ for (let i = 0; i < this.m.getConnAtoms(a); i++) if (this.m.getConnAtom(a, i) === b) return this.m.getConnBond(a, i); return -1; }
  bondOrder(a, b){ const x = this.nb[a].find(y => y.atom === b); return x ? x.order : 0; }
  bondIdx(a, b){ const x = this.nb[a].find(y => y.atom === b); return x ? x.bond : -1; }
  reachFrom(start, block){
    const seen = new Set([start]), st = [start];
    while (st.length){
      const a = st.pop();
      for (const x of this.nb[a]) if (x.atom !== block && !seen.has(x.atom)){ seen.add(x.atom); st.push(x.atom); }
    }
    return seen;
  }

  // ---------- stereo ----------
  cip(a){ const p = this.m.getAtomCIPParity(a); return p === 1 ? 'R' : p === 2 ? 'S' : ''; }
  cipBond(a, b){
    const bi = this.bondIdx(a, b); if (bi < 0) return '';
    const p = this.m.getBondCIPParity(bi); return p === 1 ? 'E' : p === 2 ? 'Z' : '';
  }
  checkUndefinedStereo(){
    const m = this.m; let atoms = 0, bonds = 0;
    for (let a = 0; a < this.n; a++) if (m.isAtomStereoCenter(a) && m.getAtomParity(a) === 3) atoms++;
    for (let b = 0; b < m.getBonds(); b++) if (m.getBondOrder(b) === 2 && m.getBondParity(b) === 3 && !m.isAromaticBond(b)) bonds++;
    if (atoms) this.warnings.push(`${atoms} stereocentre${atoms > 1 ? 's are' : ' is'} drawn without wedges, so the name has no R/S for ${atoms > 1 ? 'them' : 'it'}.`);
    if (bonds) this.warnings.push(`${bonds} double bond${bonds > 1 ? 's have' : ' has'} no defined geometry, so the name has no E/Z for ${bonds > 1 ? 'them' : 'it'}.`);
  }

  // ---------- candidates & numbering ----------
  chainEligible(a, allowT, main){
    if (this.el[a] !== 'C' || this.ringOf[a] >= 0 || (main && this.excluded.has(a))) return false;
    if (this.tCarbon.has(a)) return allowT && this.fgOfC.get(a).type === this.principal;
    return true;
  }
  // all simple paths in the forest of eligible atoms (restricted to `pool` if given)
  chainPaths(pool, mustContain){
    const atoms = [...pool];
    const inPool = new Set(atoms);
    const paths = [];
    for (const u of atoms){
      // BFS tree from u
      const prev = new Map([[u, -1]]), q = [u];
      while (q.length){
        const a = q.shift();
        for (const x of this.nb[a]) if (inPool.has(x.atom) && !prev.has(x.atom) && this.el[x.atom] === 'C'){ prev.set(x.atom, a); q.push(x.atom); }
      }
      for (const v of prev.keys()){
        if (v < u) continue;
        const path = []; let c = v; while (c !== -1){ path.push(c); c = prev.get(c); }
        if (mustContain !== undefined && !path.includes(mustContain)) continue;
        paths.push(path);
      }
    }
    return paths;
  }

  // Describe a parent (chain or ring) under one numbering.
  // ctx: { kind:'chain'|'ring', order:[atoms by locant], aromatic, fv (free-valence atom for substituents), fvOrder, from, principal (type or null), forSub }
  evaluate(ctx){
    const { order } = ctx;
    const loc = new Map(order.map((a, i) => [a, i + 1]));
    const inP = new Set(order);
    const consumed = new Set();
    const principalLocs = [];
    const nPrefixLocs = [];
    // principal groups (only for the main parent)
    if (ctx.principal){
      for (const g of this.pgroups){
        if (g.type === 'amine'){
          const c = g.cs.find(x => inP.has(x));
          if (c === undefined) continue;
          principalLocs.push(loc.get(c)); consumed.add(g.n);
          for (const o of g.cs) if (o !== c) nPrefixLocs.push({ root: o, from: g.n });
        } else if (g.type === 'alcohol' || g.type === 'thiol'){
          if (!inP.has(g.c)) continue;
          principalLocs.push(loc.get(g.c)); g.atoms.forEach(x => consumed.add(x));
        } else if (g.type === 'ketone'){
          if (!inP.has(g.c)) continue;
          principalLocs.push(loc.get(g.c)); g.atoms.forEach(x => consumed.add(x));
        } else {
          // acid, ester, amide, nitrile, aldehyde: carbon in chain, or attached to ring
          if (ctx.kind === 'chain' && inP.has(g.c)){
            principalLocs.push(loc.get(g.c)); g.atoms.forEach(x => consumed.add(x));
          } else if (ctx.kind === 'ring'){
            const att = this.nb[g.c].find(x => inP.has(x.atom));
            if (!att) continue;
            principalLocs.push(loc.get(att.atom)); consumed.add(g.c); g.atoms.forEach(x => consumed.add(x));
          } else continue;
          if (g.type === 'amide') for (const x of this.nb[g.n]) if (x.atom !== g.c) nPrefixLocs.push({ root: x.atom, from: g.n });
        }
      }
      principalLocs.sort((a, b) => a - b);
    }
    // multiple bonds inside the parent
    const mult = [], dbl = [], tri = [];
    const nP = order.length;
    if (!ctx.aromatic){
      for (let i = 0; i < nP - (ctx.kind === 'ring' ? 0 : 1); i++){
        const a = order[i], b = order[(i + 1) % nP];
        const o = this.bondOrder(a, b);
        if (o === 2 || o === 3){
          const l = ctx.kind === 'ring' && i === nP - 1 ? nP : i + 1;
          mult.push(l); (o === 2 ? dbl : tri).push(l);
        }
      }
    }
    // prefixes
    const prefixes = [];
    order.forEach((a, i) => {
      for (const x of this.nb[a]){
        const b = x.atom;
        if (inP.has(b) || consumed.has(b) || (!ctx.fv && ctx.fv !== 0 && this.excluded.has(b)) || b === ctx.from || (ctx.skip && ctx.skip.has(b))) continue;
        const s = this.subName(b, a);
        prefixes.push({ ...s, loc: String(i + 1), num: i + 1 });
      }
    });
    for (const np of nPrefixLocs){
      const s = this.subName(np.root, np.from);
      prefixes.push({ ...s, loc: 'N', num: 0 });
    }
    const prefixLocs = prefixes.filter(p => p.num).map(p => p.num).sort((a, b) => a - b);
    const alphaLocs = [...prefixes].sort((p, q) => cmp([p.key, p.num], [q.key, q.num])).map(p => p.num);
    // stereo on the parent
    const stereo = [];
    order.forEach((a, i) => { const d = this.cip(a); if (d) stereo.push({ loc: i + 1, d }); });
    if (!ctx.aromatic) for (let i = 0; i < nP - (ctx.kind === 'ring' ? 0 : 1); i++){
      const a = order[i], b = order[(i + 1) % nP];
      if (this.bondOrder(a, b) === 2){ const d = this.cipBond(a, b); if (d) stereo.push({ loc: i + 1, d }); }
    }
    // a C=C from the parent to a substituent (…ylidene): its E/Z takes the parent atom's locant, e.g. (2E)-2-propylidene…
    const inOrder = new Set(order);
    order.forEach((a, i) => { for (const x of this.nb[a]) if (!inOrder.has(x.atom) && x.atom !== ctx.from && this.bondOrder(a, x.atom) === 2){ const d = this.cipBond(a, x.atom); if (d) stereo.push({ loc: i + 1, d }); } });
    stereo.sort((p, q) => p.loc - q.loc);
    const fvLoc = ctx.fv !== undefined ? [loc.get(ctx.fv)] : [];
    return { ctx, order, loc, principalLocs, mult, dbl, tri, prefixes, prefixLocs, alphaLocs, stereo, fvLoc, consumed,
      nPrincipal: principalLocs.length };
  }

  key(ev, forSub){
    const c = ev.ctx;
    const sizeKey = -c.order.length;
    const multKey = c.aromatic ? -3 : -ev.mult.length;
    const dblKey = c.aromatic ? -3 : -ev.dbl.length;
    const stereoKey = ev.stereo.map(s => (s.d === 'R' || s.d === 'Z') ? 0 : 1);
    return [
      -ev.nPrincipal,
      forSub ? 0 : (c.kind === 'ring' ? 0 : 1),
      sizeKey, multKey, dblKey,
      ev.fvLoc, ev.principalLocs, ev.mult, ev.dbl,
      -ev.prefixes.length, ev.prefixLocs, ev.alphaLocs,
      null, // name, filled lazily
      stereoKey,
    ];
  }

  // pick the best (candidate, numbering)
  best(evs, forSub, acyl){
    let best = null, bestKey = null;
    for (const ev of evs){
      const k = this.key(ev, forSub);
      if (!best){ best = ev; bestKey = k; continue; }
      let c = cmp(k.slice(0, 12), bestKey.slice(0, 12));
      if (c === 0){
        const nameOf = (e) => { try { return forSub ? this.assembleSub(e, 1, !!acyl).name : this.assemble(e).name; } catch (err) { if (err instanceof Unsupported) return '\uffff'; throw err; } };
        const n1 = nameOf(ev), n2 = nameOf(best);
        c = cmp(alphaKey(n1) + n1, alphaKey(n2) + n2) || cmp(k[13], bestKey[13]);
      }
      if (c < 0){ best = ev; bestKey = k; }
    }
    return best;
  }

  numberings(kind, atoms){
    if (kind === 'chain') return atoms.length === 1 ? [atoms] : [atoms, [...atoms].reverse()];
    const out = [], nA = atoms.length;
    for (let s = 0; s < nA; s++) for (const d of [1, -1]) out.push(Array.from({ length: nA }, (_, k) => atoms[(s + d * k + nA * 2) % nA]));
    return out;
  }

  // ---------- substituent names ----------
  subName(root, from){
    const k = root + '>' + from;
    if (this.subCache.has(k)) return this.subCache.get(k);
    if (this.building && this.building.has(k)) fail('this ring arrangement');
    (this.building ||= new Set()).add(k);
    let s;
    try { s = this.subNameInner(root, from); } finally { this.building.delete(k); }
    s.key = alphaKey(s.name);
    this.subCache.set(k, s);
    return s;
  }
  subNameInner(root, from){
    const el = this.el[root], ord = this.bondOrder(root, from);
    if (HALO[el]) return { name: HALO[el], complex: false };
    if (this.nitro.has(root)) return { name: 'nitro', complex: false };
    if (el === 'O'){
      if (ord === 2) return { name: 'oxo', complex: false };
      const other = this.nb[root].find(x => x.atom !== from);
      if (!other) return { name: 'hydroxy', complex: false };
      const c = other.atom;
      const gc = this.fgOfC.get(c);
      if (gc && gc.type === 'ester' && gc.esterO === root){
        const acyl = this.acylName(c, root);
        return { name: `${acyl.complex ? wrap(acyl.name) : acyl.name}oxy`, complex: true };
      }
      if (gc && ['aldehyde', 'ketone'].includes(gc.type) && this.isAcylRoot(c, root)){
        const acyl = this.subName(c, root);
        return { name: `${acyl.complex ? wrap(acyl.name) : acyl.name}oxy`, complex: true };
      }
      const r = this.subName(c, root);
      const m = r.name.match(/^(.*?)(tert-butyl|methyl|ethyl|propyl|butyl|phenyl)$/);
      if (m && !m[1].endsWith('cyclo')){
        // contracted alkoxy names: methoxy, ethoxy, propoxy, butoxy, phenoxy, tert-butoxy (also when substituted)
        const base = { methyl: 'methoxy', ethyl: 'ethoxy', propyl: 'propoxy', butyl: 'butoxy', phenyl: 'phenoxy', 'tert-butyl': 'tert-butoxy' }[m[2]];
        return { name: m[1] + base, complex: m[1] !== '' || r.complex };
      }
      return { name: `${r.complex ? wrap(r.name) : r.name}oxy`, complex: true };
    }
    if (el === 'S'){
      const other = this.nb[root].find(x => x.atom !== from);
      if (!other) return { name: 'sulfanyl', complex: false };
      const r = this.subName(other.atom, root);
      return { name: `${r.complex ? wrap(r.name) : r.name}sulfanyl`, complex: true };
    }
    if (el === 'N'){
      const others = this.nb[root].filter(x => x.atom !== from).map(x => x.atom);
      if (!others.length) return { name: 'amino', complex: false };
      // acylamino: -NH-C(=O)R -> "acetamido" etc.
      const isAmideC = (c) => { const g = this.fgOfC.get(c); return g && g.type === 'amide' && g.n === root; };
      const acyl = others.filter(c => this.isAcylRoot(c, root) || isAmideC(c));
      if (acyl.length === 1 && others.length === 1){
        const a = isAmideC(acyl[0]) ? this.acylName(acyl[0], root) : this.subName(acyl[0], root);
        const amido = a.name === 'formyl' ? 'formamido' : a.name === 'acetyl' ? 'acetamido' : a.name === 'benzoyl' ? 'benzamido'
          : /anoyl$|enoyl$|ynoyl$/.test(a.name) && !a.complex ? a.name.replace(/oyl$/, 'amido') : null;
        if (amido) return { name: amido, complex: false };
      }
      const subs = others.map(c => isAmideC(c) ? this.acylName(c, root) : this.subName(c, root));
      return { name: this.groupPrefixes(subs.map(s => ({ ...s, loc: null })), true) + 'amino', complex: true };
    }
    if (el !== 'C') fail(`substituents starting with ${el}`);
    // carbon roots
    const g = this.fgOfC.get(root);
    if (g && T_TYPES.has(g.type)){
      if (g.type === 'acid') return { name: 'carboxy', complex: false };
      if (g.type === 'nitrile') return { name: 'cyano', complex: false };
      if (g.type === 'amide'){
        if (this.nb[g.n].length > 1) fail('N-substituted carbamoyl groups');
        return { name: 'carbamoyl', complex: false };
      }
      if (g.type === 'ester'){
        const alk = this.subName(g.esterO, root); // "methoxy" etc.
        return { name: `${alk.complex ? wrap(alk.name) : alk.name}carbonyl`, complex: true };
      }
    }
    if (ord === 3) fail('ylidyne substituents');
    if (this.isAcylRoot(root, from)) return this.acylName(root, from);
    if (this.ringOf[root] >= 0) return this.ringSubName(root, from, ord);
    return this.chainSubName(root, from, ord);
  }
  // O/N atoms that belong to an acyl carbon itself (=O, and the ester O or amide N it is reached through)
  acylAtoms(c, from){
    const g = this.fgOfC.get(c), out = new Set();
    for (const x of this.nb[c]) if (this.el[x.atom] === 'O' && x.order === 2) out.add(x.atom);
    if (g && g.type === 'ester' && g.esterO !== from) out.add(g.esterO);
    if (g && g.type === 'amide' && g.n !== from) out.add(g.n);
    return out;
  }
  isAcylRoot(c, from){
    const g = this.fgOfC.get(c);
    return !!g && (g.type === 'aldehyde' || g.type === 'ketone') && this.ringOf[c] < 0 && this.bondOrder(c, from) === 1;
  }
  acylName(root, from){
    const others = this.nb[root].filter(x => x.atom !== from && this.el[x.atom] === 'C');
    if (!others.length) return { name: 'formyl', complex: false };
    const c2 = others[0].atom;
    if (this.ringOf[c2] >= 0){
      const r = this.rings[this.ringOf[c2]];
      const rs = this.ringSubName(c2, root, 1);
      if (r.aromatic) return { name: rs.name.replace(/phenyl$/, 'benzoyl'), complex: rs.complex, stereo: rs.stereo };
      if (rs.name === `cyclo${stem(r.size)}yl`) return { name: `cyclo${stem(r.size)}anecarbonyl`, complex: false };
      fail('substituted or unsaturated cycloalkanecarbonyl groups');
    }
    // acyclic acyl: chain starts at the carbonyl carbon (locant 1)
    const s = this.chainSubName(root, from, 1, true);
    return s;
  }

  // ring as a substituent: attachment atom gets locant 1
  ringSubName(root, from, ord){
    const r = this.rings[this.ringOf[root]];
    const evs = [];
    for (const order of this.numberings('ring', r.atoms)) if (order[0] === root)
      evs.push(this.evaluate({ kind: 'ring', order, aromatic: r.aromatic, fv: root, from, principal: null }));
    const ev = this.best(evs, true);
    return this.assembleSub(ev, ord, false);
  }
  // acyclic substituent: longest chain through the attachment atom
  chainSubName(root, from, ord, acyl){
    const pool = [...this.reachFrom(root, from)].filter(a => this.chainEligible(a, false) || (acyl && a === root));
    let paths = this.chainPaths(new Set(pool), root);
    if (acyl) paths = paths.filter(p => p[0] === root || p[p.length - 1] === root);
    const evs = [];
    for (const p of paths) for (const order of this.numberings('chain', p)){
      if (acyl && order[0] !== root) continue;
      evs.push(this.evaluate({ kind: 'chain', order, aromatic: false, fv: root, from, principal: null, skip: acyl ? this.acylAtoms(root, from) : null }));
    }
    if (!evs.length) fail('this substituent');
    const ev = this.best(evs, true, acyl);
    return this.assembleSub(ev, ord, acyl);
  }

  // ---------- assembling names ----------
  // group identical prefixes and order them alphabetically: "2,2-dimethyl-4-(propan-2-yl)"
  groupPrefixes(prefixes, noLocants){
    const groups = new Map();
    for (const p of prefixes){
      const id = p.name;
      if (!groups.has(id)) groups.set(id, { ...p, locs: [] });
      groups.get(id).locs.push(p);
    }
    const list = [...groups.values()].sort((a, b) => cmp(a.key, b.key) || cmp(a.name, b.name));
    let out = '';
    list.forEach((g, i) => {
      const nCount = g.locs.length;
      const locs = g.locs.map(p => p.loc).sort((a, b) => (a === 'N' ? 0 : +a) - (b === 'N' ? 0 : +b));
      const mult = g.complex ? (nCount > 1 ? MULTX[nCount] : '') : MULT[nCount];
      if (mult === undefined) fail('more than ten identical substituents');
      const nm = g.complex ? wrap(g.name) : g.name;
      const piece = (noLocants || locs[0] === null ? '' : joinLoc(locs) + '-') + (mult ? mult + (/^(tert|sec)-/.test(nm) ? '-' : '') : '') + nm;
      if (i > 0 && /^[\dN]/.test(piece)) out += '-';
      out += piece;
    });
    return out;
  }

  // unsaturation + suffix on a stem, e.g. "but-3-en-2-ol", "buta-1,3-diene", "cyclohexanone"
  stemWithEndings(base, ev, suffix, opts){
    const { omitMultLocs, omitSuffixLocs } = opts;
    const nE = ev.dbl.length, nY = ev.tri.length;
    let s = base;
    // "a" is added to the stem when the first ending starts with a multiplier: buta-1,3-diene, but undec-2-ene-6,9-diyne
    if (nE > 1 || (!nE && nY > 1)) s += 'a';
    const loc = (l) => omitMultLocs ? '' : `-${joinLoc(l)}-`;
    if (!nE && !nY) s += 'an';
    if (nE){
      s += loc(ev.dbl) + MULT[nE] + 'en';
      // the "e" of "ene" is kept before a consonant (…ene-6,9-diyne) and elided before "yne" or a vowel
      if (nY && nY > 1) s += 'e';
    }
    if (nY) s += loc(ev.tri) + MULT[nY] + 'yn';
    if (!suffix){ return s + 'e'; }
    const { word, locs } = suffix;
    const nS = locs.length;
    const multS = MULT[nS];
    const full = (multS || '') + word;
    const showLocs = !omitSuffixLocs;
    if (!vowelStart(full)) s += 'e';
    return s + (showLocs ? `-${joinLoc(locs)}-` : '') + full;
  }

  assembleSub(ev, ord, acyl){
    const c = ev.ctx, nP = ev.order.length;
    const fv = ev.fvLoc[0];
    let name, complex = false;
    const pre = this.groupPrefixes(nP === 1 && c.kind === 'chain' ? ev.prefixes.map(p => ({ ...p, loc: null })) : ev.prefixes);
    const stereo = ev.stereo.length ? `(${ev.stereo.map(s => s.loc + s.d).join(',')})-` : '';
    if (c.kind === 'ring'){
      if (c.aromatic){
        if (ord === 2) fail('benzylidene-type substituents');
        name = 'phenyl';
      } else {
        const base = 'cyclo' + stem(nP);
        const yl = ord === 2 ? 'ylidene' : 'yl';
        if (!ev.mult.length) name = base + yl;
        else name = this.stemWithEndings(base, ev, null, {}).replace(/e$/, '') + `-1-${yl}`;
      }
    } else if (acyl){
      if (nP === 1) name = 'formyl';
      else if (nP === 2 && !ev.mult.length) name = 'acetyl';
      else name = this.stemWithEndings(stem(nP), ev, null, {}).replace(/e$/, '') + 'oyl';
    } else {
      const yl = ord === 2 ? 'ylidene' : 'yl';
      if (!ev.mult.length && fv === 1) name = stem(nP) + yl;
      else if (nP === 2 && ev.mult.length) name = stem(nP) + (ev.dbl.length ? 'en' : 'yn') + yl;
      else name = this.stemWithEndings(stem(nP), ev, null, {}).replace(/e$/, '') + `-${fv}-${yl}`;
      // retained preferred prefixes
      if (name === '2-methylpropan-2-yl' || (name === 'propan-2-yl' && pre === '2-methyl')) { /* handled below */ }
    }
    let full = pre + name;
    if (full === '2-methylpropan-2-yl') full = 'tert-butyl';
    if (full === 'phenylmethyl' && !stereo) full = 'benzyl';
    if (full === 'benzylidene') fail('benzylidene');
    full = stereo + full;
    complex = /[\d(]/.test(full) || ev.prefixes.length > 0 && !/^tert-butyl$|^benzyl$/.test(full);
    if (full === 'tert-butyl' || full === 'benzyl') complex = false;
    return { name: full, complex, stereo };
  }

  assemble(ev){
    const c = ev.ctx, nP = ev.order.length, type = this.principal;
    const count = ev.principalLocs.length;
    const parts = { pre: '', parent: '', stereo: '' };
    let prefixes = ev.prefixes;
    let name;
    // locant omission rules
    const chainTerminal = c.kind === 'chain' && ['acid', 'ester', 'amide', 'nitrile', 'aldehyde'].includes(type);
    const prefixCount = prefixes.length;
    if (c.kind === 'ring' && c.aromatic && count === 1 && BENZENE_RETAINED[type] && ev.principalLocs[0] === 1){
      // phenol, aniline, benzoic acid, …
      name = this.groupPrefixes(prefixes) + BENZENE_RETAINED[type];
    } else if (c.kind === 'chain' && nP <= 2 && count === 1 && (nP === 1 ? FORMIC : ACETIC)[type] && !ev.mult.length && (nP === 2 ? ev.principalLocs[0] === 1 : true)){
      const pre = this.groupPrefixes(prefixes, nP === 1);
      name = pre + (nP === 1 ? FORMIC : ACETIC)[type];
    } else {
      const base = c.kind === 'ring' ? 'cyclo' + stem(nP) : stem(nP);
      let omitPrefixLocs = false, omitSuffixLocs = chainTerminal, omitMultLocs = false;
      if (c.kind === 'chain' && nP === 1){ omitPrefixLocs = true; omitSuffixLocs = true; }
      if (c.kind === 'chain' && nP === 2){
        omitMultLocs = true;
        if (count === 1) omitSuffixLocs = true;
        if (count === 0 && prefixCount === 1) omitPrefixLocs = true;
      }
      if (c.kind === 'ring'){
        const ringMult = c.aromatic ? 0 : best_mult(ev);
        if (ringMult === 0 && count + prefixCount === 1){ omitPrefixLocs = true; omitSuffixLocs = true; }
        if (ringMult === 1 && count === 0) omitMultLocs = true;
      }
      const pre = this.groupPrefixes(prefixes.map(p => omitPrefixLocs && p.loc !== 'N' ? { ...p, loc: null } : p), false);
      let parentName;
      if (c.aromatic){
        parentName = 'benzene' + (count ? (omitSuffixLocs ? '' : `-${joinLoc(ev.principalLocs)}-`) + MULT[count] + SUFFIX[type].ring : '');
      } else {
        const word = count ? (c.kind === 'ring' ? SUFFIX[type].ring : SUFFIX[type].chain) : null;
        parentName = this.stemWithEndings(base, ev, word ? { word, locs: ev.principalLocs } : null, { omitMultLocs, omitSuffixLocs });
      }
      name = pre + parentName;
    }
    if (type === 'ester' && count){
      const g = this.pgroups[0];
      const alk = this.subName(g.alkylC, g.esterO);
      name = `${alk.name} ${name}`;
    }
    const stereo = this.parentStereo(ev);
    return { name: (stereo ? stereo + '-' : '') + name };
  }

  parentStereo(ev){
    const items = ev.stereo.map(s => `${s.loc}${s.d}`);
    const nLoc = ev.order.length;
    // simple parents: drop locants when there is only one possible position (e.g. ethene)
    if (!items.length) return this.cisTrans || '';
    if (ev.ctx.kind === 'chain' && nLoc === 2) return `(${ev.stereo.map(s => s.d).join(',')})`;
    return `(${items.join(',')})`;
  }

  // ---------- main ----------
  run(){
    this.perceive();
    this.checkUndefinedStereo();
    const evs = [];
    const principal = this.principal;
    // chains
    const pool = new Set();
    for (let a = 0; a < this.n; a++) if (this.chainEligible(a, true, true)) pool.add(a);
    let firstErr = null;
    const tryEval = (ctx) => { try { evs.push(this.evaluate(ctx)); } catch (e) { if (!(e instanceof Unsupported)) throw e; firstErr ||= e; } };
    for (const p of this.chainPaths(pool)) for (const order of this.numberings('chain', p))
      tryEval({ kind: 'chain', order, aromatic: false, principal });
    // rings
    for (const r of this.rings){
      if (r.atoms.some(a => this.excluded.has(a))) continue;
      for (const order of this.numberings('ring', r.atoms)) tryEval({ kind: 'ring', order, aromatic: r.aromatic, principal });
    }
    if (!evs.length) throw firstErr || new Unsupported('this structure');
    const best = this.best(evs, false);
    if (principal && !best.nPrincipal) fail('this arrangement of functional groups');
    this.resolveCisTrans(best);
    const { name } = this.assemble(best);
    this.explain(best, evs, name);
    return { name, steps: this.steps, warnings: this.warnings };
  }

  // cis/trans for a parent ring whose stereo can't be expressed with R/S (e.g. 1,4-dimethylcyclohexane)
  resolveCisTrans(ev){
    this.cisTrans = '';
    if (ev.ctx.kind !== 'ring' || ev.ctx.aromatic) return;
    const m = this.m;
    const pseudo = ev.order.filter(a => m.getAtomParity(a) && (m.getAtomParity(a) === 1 || m.getAtomParity(a) === 2) && !this.cip(a));
    if (!pseudo.length) return;
    if (pseudo.length !== 2){ this.warnings.push('The ring’s relative stereo (cis/trans) isn’t included in this name.'); return; }
    try {
      const conf = new this.OCL.ConformerGenerator(1).getOneConformerAsMolecule(this.m.getCompactCopy());
      const ringAtoms = ev.order;
      const P = (a) => [conf.getAtomX(a), conf.getAtomY(a), conf.getAtomZ(a)];
      const ps = ringAtoms.map(P);
      const cen = ps.reduce((s, p) => [s[0] + p[0] / ps.length, s[1] + p[1] / ps.length, s[2] + p[2] / ps.length], [0, 0, 0]);
      let nrm = [0, 0, 0];
      for (let i = 0; i < ps.length; i++){
        const a = ps[i].map((x, k) => x - cen[k]), b = ps[(i + 1) % ps.length].map((x, k) => x - cen[k]);
        nrm = [nrm[0] + a[1] * b[2] - a[2] * b[1], nrm[1] + a[2] * b[0] - a[0] * b[2], nrm[2] + a[0] * b[1] - a[1] * b[0]];
      }
      const face = (a) => {
        // the non-hydrogen, non-ring substituent of this ring atom
        const inR = new Set(ringAtoms);
        let sub = -1;
        for (let i = 0; i < conf.getAllConnAtoms(a); i++){ const x = conf.getConnAtom(a, i); if (!inR.has(x) && conf.getAtomicNo(x) !== 1){ sub = x; break; } }
        if (sub < 0) return 0;
        const d = P(sub).map((x, k) => x - P(a)[k]);
        return Math.sign(d[0] * nrm[0] + d[1] * nrm[1] + d[2] * nrm[2]);
      };
      const f = pseudo.map(face);
      if (f[0] && f[1]) this.cisTrans = f[0] === f[1] ? 'cis' : 'trans';
    } catch { this.warnings.push('The ring’s relative stereo (cis/trans) couldn’t be worked out.'); }
  }

  explain(best, evs, finalName){
    const c = best.ctx, type = this.principal, nP = best.order.length;
    const S = this.steps;
    if (type) S.push(`Principal characteristic group: ${SUFFIX[type].label}, so the name ends in “-${c.kind === 'ring' ? SUFFIX[type].ring : SUFFIX[type].chain}”${type === 'ester' ? ' (the O–alkyl part is named first, as a separate word)' : ''}.`);
    else S.push('No suffix group (halogens, ethers and nitro groups are always prefixes), so the name is the parent hydride plus prefixes.');
    const otherKinds = evs.some(e => e.ctx.kind !== c.kind && e.nPrincipal === best.nPrincipal);
    if (c.kind === 'ring'){
      S.push(`Parent: the ${c.aromatic ? 'benzene ring' : `${nP}-membered carbon ring (cyclo${stem(nP)}${best.mult.length ? 'ene' : 'ane'})`}.` +
        (otherKinds ? ' Under the 2013 IUPAC rules a ring is preferred to a chain (older textbooks sometimes pick the longer chain instead).' : ''));
    } else {
      const longer = evs.filter(e => e.ctx.kind === 'chain' && e.order.length > nP);
      S.push(`Parent chain: ${nP} carbon${nP > 1 ? 's' : ''} (${stem(nP)}ane)` + (type && best.nPrincipal ? `, the longest chain that carries the principal group${longer.length ? '; a longer chain exists but doesn’t include it' : ''}.` : ', the longest chain.') +
        (evs.some(e => e.ctx.kind === 'chain' && e.order.length === nP && e.prefixes.length < best.prefixes.length) ? ' Of the equally long chains, this one has the most substituents.' : ''));
    }
    // why this numbering
    const same = evs.filter(e => e.ctx.kind === c.kind && new Set(e.order).size === nP && e.order.every(a => best.loc.has(a)) && e !== best);
    const labels = ['principal group', '', '', '', '', 'free valence', 'principal group (suffix)', 'multiple bonds', 'double bonds', '', 'all prefixes together', 'the prefix cited first alphabetically (here, ' + '{FIRST}' + ')', '', 'stereo (R before S, Z before E)'];
    // the deciding rule is the last one needed to beat the closest competing numbering
    let deciding = -1;
    const kb = this.key(best, false);
    for (const e of same){
      const ke = this.key(e, false);
      for (let i = 5; i < 14; i++){ if (i === 12) continue; if (cmp(kb[i], ke[i])){ deciding = Math.max(deciding, i); break; } }
    }
    const reason = deciding >= 0 ? labels[deciding] : '';
    const locSummary = [best.principalLocs.length ? `suffix at ${joinLoc(best.principalLocs)}` : '', best.mult.length && !c.aromatic ? `multiple bonds at ${joinLoc(best.mult)}` : '', best.prefixLocs.length ? `prefixes at ${joinLoc(best.prefixLocs)}` : ''].filter(Boolean).join(', ');
    const first = [...best.prefixes].sort((p, q) => cmp(p.key, q.key))[0];
    const why = reason.replace('{FIRST}', first ? first.name : '');
    if (locSummary && /\d/.test(finalName.replace(/^\([^)]*\)-/, ''))) S.push(`Numbering: ${locSummary}.` + (why ? ` The numbering is decided by lowest locants for ${why}.` : ''));
    if (best.prefixes.length > 1){
      const names = [...new Map(best.prefixes.map(p => [p.name, p])).values()].sort((a, b) => cmp(a.key, b.key)).map(p => p.name);
      if (names.length > 1) S.push(`Prefixes in alphabetical order, ignoring di-, tri-, bis- and tert-: ${names.join(', ')}.`);
    }
    if (best.stereo.length || this.cisTrans) S.push('Stereodescriptors come from the CIP rules, calculated by OpenChemLib' + (this.cisTrans ? ' (cis/trans from the 3D shape, since this ring has no R/S centres)' : '') + '.');
  }
}
