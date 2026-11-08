// SN1/SN2/E1/E2 predictions: decision-table lookup (data/rules.json) + product building.
// Deterministic: the table says which pathways happen; products come from editing the molecule
// graph (reactivity.js) and stereo is computed by OpenChemLib. Out-of-scope cases return
// { notCovered: reasonKey } instead of a guess.

import { analyse, cationPathways, alkenesFrom, alkeneProducts, buildProduct, LG_LABEL } from './reactivity.js';
import { findReagent, findSolvent } from './reagents.js';

export const PATHWAYS = ['SN1', 'SN2', 'E1', 'E2'];
export const STEREOSPECIFIC = { SN2: true, E2: true, SN1: false, E1: false };
const BOX_TEXT = { nuc: 'strong nucleophile, weak base', nucbase: 'strong nucleophile and strong base', bulky: 'strong, bulky base (poor nucleophile)', weak: 'weak nucleophile, weak base', activator: 'turns OH into a leaving group' };
const CLS_TEXT = { methyl: 'methyl', 1: '1°', 2: '2°', 3: '3°', vinyl: 'vinyl', aryl: 'aryl' };

const lgKind = (lg) => lg === 'OH' ? 'OH' : /^O/.test(lg) ? 'sulfonate' : 'halide';
const matches = (want, have) => want === undefined || (Array.isArray(want) ? want.includes(have) : want === have);

export function lookupRule(rules, facts){
  return rules.rows.find((r) => Object.entries(r.when).every(([k, v]) => matches(v, facts[k]))) || null;
}

function resolveReagent(cat, reagent){ return typeof reagent === 'string' ? findReagent(cat, reagent) : reagent; }

// predict(OCL, mol, reagent, { solvent, heat, site }, { rules, cat })
export function predict(OCL, mol, reagent, opts = {}, data){
  const { rules, cat } = data;
  const r = resolveReagent(cat, reagent);
  const res = { lamps: {}, reasons: [], pathways: {}, warnings: [], flags: [], path: [] };
  if (!r) return { ...res, notCovered: 'unknown_reagent' };
  const an = analyse(OCL, mol);
  const m = an.mol;
  res.sites = an.sites;
  if (!an.sites.length) return { ...res, notCovered: 'no_site' };
  if (an.sites.length > 1 && opts.site === undefined) return { ...res, needSite: true };
  const site = an.sites[opts.site || 0];
  res.site = site;
  res.flags = [...new Set(site.flags)];
  const solvent = findSolvent(cat, opts.solvent || r.solvent);
  const facts = { lg: lgKind(site.lg), cls: site.cls, ab: site.ab, box: r.box, act: r.act, solvent: solvent ? solvent.type : undefined, heat: !!opts.heat };
  res.facts = facts;
  res.path = [
    { step: 'substrate', text: `${CLS_TEXT[site.cls]} ${site.lg === 'OH' ? 'alcohol' : LG_LABEL[site.lg]}${site.allylic ? ', allylic' : ''}${site.benzylic ? ', benzylic' : ''}` },
    { step: 'reagent', text: `${r.label}: ${BOX_TEXT[r.box]}` },
    { step: 'conditions', text: `${solvent ? solvent.label + ' (polar ' + solvent.type + ')' : 'solvent unknown'}${opts.heat ? ', heat' : ''}` },
  ];
  // flags that stop the analysis before the table
  if (site.flags.includes('aryl') || site.flags.includes('vinyl')){ res.reasons.push('vinyl_aryl'); return res; }
  if (site.flags.includes('neopentyl')) return { ...res, notCovered: 'neopentyl' };
  if (site.flags.includes('poorLG')) return { ...res, notCovered: 'poor_lg' };
  if (site.flags.includes('alphaHetero') || site.flags.includes('alphaCarbonyl')) return { ...res, notCovered: 'alpha_group' };
  if (!facts.solvent) return { ...res, notCovered: 'unknown_solvent' };

  const row = lookupRule(rules, facts);
  if (!row) return { ...res, notCovered: 'no_rule' };
  if (row.notCovered) return { ...res, notCovered: row.notCovered };
  res.reasons.push(...(row.reasons || []));
  if (row.activate){
    const p = buildProduct(OCL, m, { attach: [{ to: site.lgAtom, frag: r.frag }] });
    res.activation = { product: product(p.mol, { rank: 'major', stereo: site.stereo === 'undefined' || site.stereo === 'none' ? null : 'retention' }) };
    return res;
  }

  const lamps = { ...row.lamps };
  const order = Object.keys(row.lamps);
  for (const pw of order){
    const out = { lamp: lamps[pw], stereospecific: STEREOSPECIFIC[pw], products: [], notes: [] };
    if (pw === 'SN2') sn2(OCL, m, site, r, out);
    else if (pw === 'E2') e2(OCL, m, site, r, out);
    else cationic(OCL, m, site, r, pw, out);
    if (!out.products.length){ out.lamp = 'none'; lamps[pw] = 'none'; }
    res.pathways[pw] = out;
  }
  if (!Object.values(lamps).includes('major')){
    const next = order.find((pw) => lamps[pw] === 'minor' || lamps[pw] === 'competing');
    if (next){ lamps[next] = 'major'; res.pathways[next].lamp = 'major'; res.pathways[next].notes.push('promoted'); }
  }
  for (const pw of PATHWAYS) res.lamps[pw] = lamps[pw] && lamps[pw] !== 'none' ? lamps[pw] : 'none';
  for (const pw of order) for (const n of res.pathways[pw].notes) if (/warning/.test(n) && !res.warnings.includes(n)) res.warnings.push(n);
  return res;
}

function product(mol, extra){
  return { mol, idcode: mol.getIDCode(), smiles: mol.toIsomericSmiles(), ...extra };
}

// Products also carry the atoms the mechanism viewer needs to follow them (substrate indices):
// centre (the C⁺ the Nu attacks or loses its β-H next to), cationCarbons (its class), group (the shifting atom, alkyl/ring
// shifts) and beta (the carbon that loses H in E1/E2).
// Ranks products by key (descending, compared element by element): first = major,
// an exact tie at the top = competing, everything else = minor. Duplicates (same ID code) are dropped.
function rankProducts(list){
  const seen = new Set();
  const uniq = [];
  list.sort((a, b) => { for (let i = 0; i < a.key.length; i++) if (a.key[i] !== b.key[i]) return b.key[i] - a.key[i]; return 0; });
  for (const p of list){ if (seen.has(p.idcode)) continue; seen.add(p.idcode); uniq.push(p); }
  const same = (a, b) => a.key.every((x, i) => x === b.key[i]);
  uniq.forEach((p, i) => { p.rank = i === 0 ? (uniq[1] && same(uniq[0], uniq[1]) ? 'competing' : 'major') : same(p, uniq[0]) ? 'competing' : 'minor'; p.order = i + 1; });
  return uniq;
}

function sn2(OCL, m, site, r, out){
  if (!r.nu){ out.notes.push('no_nu'); return; }
  const p = buildProduct(OCL, m, { replace: [{ atom: site.lgAtom, frag: r.nu }], del: site.lgAtoms.filter((a) => a !== site.lgAtom), invert: [site.ca] });
  const stereo = site.stereo === 'undefined' ? 'no stereocentre defined' : site.stereo === 'none' ? null : 'inversion';
  out.products = rankProducts([product(p.mol, { key: [0], stereo, via: 'backside attack' })]);
}

function e2(OCL, m, site, r, out){
  const alkenes = alkenesFrom(OCL, m, site.ca, { del: site.lgAtoms });
  if (!alkenes.length){ out.notes.push('no_beta_h'); return; }
  const hofmann = r.box === 'bulky';
  const list = [];
  m.ensureHelperArrays(OCL.Molecule.cHelperParities);
  for (const al of alkenes){
    const betaDefined = [1, 2].includes(m.getAtomParity(al.beta)) && m.isAtomStereoCenter(al.beta);
    let isomers = alkeneProducts(OCL, m, al);
    if (isomers.length > 1 && betaDefined){
      isomers = [alkeneProducts(OCL, m, al, true)[0]];
      out.notes.push('e2_beta_stereo');
    }
    for (const iso of isomers) list.push(product(iso.mol, { key: [hofmann ? -al.zaitsev : al.zaitsev, iso.trans ? 1 : 0], ez: iso.ez, trans: iso.trans, zaitsev: al.zaitsev, conj: al.conj, beta: al.beta, via: hofmann ? 'Hofmann (bulky base)' : 'Zaitsev', ezNotCovered: isomers.length === 1 && betaDefined || undefined }));
  }
  out.products = rankProducts(list);
  if (site.inRing){
    const M = OCL.Molecule;
    const flat = new Set(out.products.map((p) => { const c = p.mol.getCompactCopy(); c.stripStereoInformation(); return c.getIDCode(); }));
    if (flat.size > 1) out.notes.push('ring_e2_warning');
  }
  if (out.products.some((p) => p.ez && p.trans === null)) out.notes.push('ez_tie');
}

function cationic(OCL, m, site, r, pw, out){
  const { pathways, notes } = cationPathways(OCL, m, site);
  if (notes.length) out.notes.push(...new Set(notes.map((n) => n.replace(/ /g, '_') + '_not_covered')));
  out.cations = pathways.map(({ centre, score, shift, label }) => ({ centre, score, shift, label }));
  const list = [];
  if (pw === 'SN1'){
    if (!r.nu){ out.notes.push('no_nu'); return; }
    for (const c of pathways){
      const p = buildProduct(OCL, m, { del: site.lgAtoms, ...c.ops, attach: [{ to: c.centre, frag: r.nu }] });
      const nc = p.map[c.centre];
      const racemic = p.mol.isAtomStereoCenter(nc);
      list.push(product(p.mol, { key: [c.score], via: c.label, cationScore: c.score, cationCarbons: c.carbons, shift: c.shift, centre: c.centre, group: c.group, stereo: racemic ? 'racemic' : null }));
    }
  } else {
    if (site.allylic){ out.notes.push('allylic_e1'); return; }
    for (const c of pathways){
      for (const al of alkenesFrom(OCL, m, c.centre, { del: site.lgAtoms, ...c.ops })){
        for (const iso of alkeneProducts(OCL, m, al))
          list.push(product(iso.mol, { key: [c.score, al.zaitsev, iso.trans ? 1 : 0], ez: iso.ez, trans: iso.trans, zaitsev: al.zaitsev, beta: al.beta, via: c.label, cationScore: c.score, cationCarbons: c.carbons, shift: c.shift, centre: c.centre, group: c.group }));
      }
    }
    if (!list.length) out.notes.push('no_beta_h');
  }
  out.products = rankProducts(list);
}

// Several steps in a row (e.g. 1) TsCl, pyridine 2) NaCN, DMSO). Each step works on the major
// product of the step before. steps: [{ reagent, solvent, heat, site }]
export function predictSequence(OCL, mol, steps, data){
  const out = [];
  let cur = mol;
  for (const s of steps){
    const res = predict(OCL, cur, s.reagent, s, data);
    out.push(res);
    const next = res.activation ? res.activation.product : majorProduct(res);
    if (!next) break;
    cur = next.mol;
  }
  return out;
}
export function majorProduct(res){
  const pw = PATHWAYS.find((p) => res.lamps[p] === 'major');
  return pw && res.pathways[pw] && res.pathways[pw].products[0] || null;
}

// ---------- ranking mode (worksheet problems 6 and 7) ----------
// rankSN1 / rankSN2 (OCL, mols) → [{ index, place, reason, none }] in order, ties share a place.
function bestSite(OCL, mol){
  const an = analyse(OCL, mol);
  const sites = an.sites.filter((s) => s.lg !== 'OH');
  return sites.sort((a, b) => b.lgRank - a.lgRank)[0] || null;
}
function rank(items){
  const ok = items.filter((x) => !x.none).sort((a, b) => { for (let i = 0; i < a.key.length; i++) if (a.key[i] !== b.key[i]) return b.key[i] - a.key[i]; return 0; });
  let place = 0;
  ok.forEach((x, i) => { if (i === 0 || x.key.some((v, k) => v !== ok[i - 1].key[k])) place = i + 1; x.place = place; });
  return [...ok, ...items.filter((x) => x.none).map((x) => ({ ...x, place: null }))];
}
export function rankSN1(OCL, mols){
  return rank(mols.map((mol, index) => {
    const s = bestSite(OCL, mol);
    if (!s) return { index, none: true, reason: 'no leaving group' };
    if (s.cationScore === null) return { index, none: true, reason: 'vinyl/aryl: no carbocation' };
    if (s.cationScore < 2) return { index, none: true, reason: `${CLS_TEXT[s.cls]} carbocation is too unstable: essentially no SN1` };
    return { index, key: [s.cationScore, s.lgRank], reason: `carbocation score ${s.cationScore} (${CLS_TEXT[s.cls]}${s.ab ? ', ' + (s.allylic ? 'allylic' : 'benzylic') : ''}), leaving group ${LG_LABEL[s.lg]}` };
  }));
}
const STERIC = { methyl: 3, 1: 2, 2: 1 };
export function rankSN2(OCL, mols){
  return rank(mols.map((mol, index) => {
    const s = bestSite(OCL, mol);
    if (!s) return { index, none: true, reason: 'no leaving group' };
    if (!(s.cls in STERIC)) return { index, none: true, reason: s.cls === '3' ? '3°: backside attack blocked, no SN2' : 'vinyl/aryl: no SN2' };
    return { index, key: [STERIC[s.cls], s.ab ? 1 : 0, -s.betaBranching, s.lgRank], reason: `${CLS_TEXT[s.cls]}${s.ab ? ' (' + (s.allylic ? 'allylic' : 'benzylic') + ' boost)' : ''}, ${s.betaBranching} extra carbon(s) on the β-carbons${s.neopentyl ? ' (neopentyl: very slow)' : ''}, leaving group ${LG_LABEL[s.lg]}` };
  }));
}
