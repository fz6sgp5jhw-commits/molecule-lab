// SN1/SN2/E1/E2 predictions: decision-table lookup (data/rules.json) + product building.
// Deterministic: the table says which pathways happen; products come from editing the molecule
// graph (reactivity.js) and stereo is computed by OpenChemLib. Out-of-scope cases return
// { notCovered: reasonKey } instead of a guess.

import { analyse, cationPathways, alkenesFrom, alkeneProducts, buildProduct, LG_LABEL } from './reactivity.js';
import { findReagent, findSolvent } from './reagents.js';
import { findChairRings, buildChairs } from './chair.js';
import { antiConformers, cis2D } from './anti.js';

export const PATHWAYS = ['SN1', 'SN2', 'E1', 'E2'];
export const STEREOSPECIFIC = { SN2: true, E2: true, SN1: false, E1: false };
const BOX_TEXT = { nuc: 'strong nucleophile, weak base', nucbase: 'strong nucleophile and strong base', bulky: 'strong, bulky base (poor nucleophile)', weak: 'weak nucleophile, weak base', activator: 'turns OH into a leaving group' };
const CLS_TEXT = { methyl: 'methyl', 1: '1°', 2: '2°', 3: '3°', vinyl: 'vinyl', aryl: 'aryl' };

const lgKind = (lg) => lg === 'OH' ? 'OH' : /^O/.test(lg) ? 'sulfonate' : 'halide';
const matches = (want, have) => want === undefined || (Array.isArray(want) ? want.includes(have) : want === have);

export function lookupRule(rules, facts){
  return rules.rows.find((r) => Object.entries(r.when).every(([k, v]) => matches(v, facts[k]))) || null;
}

// Substrate flags that decide before the table is read (shared with the "Which pathway wins?" grid):
// { reason } = no reaction, with that reason; { notCovered } = out of scope; null = read the table.
export function flagStop(flags){
  if (flags.includes('aryl') || flags.includes('vinyl')) return { reason: 'vinyl_aryl' };
  if (flags.includes('neopentyl')) return { notCovered: 'neopentyl' };
  if (flags.includes('poorLG')) return { notCovered: 'poor_lg' };
  if (flags.includes('alphaHetero') || flags.includes('alphaCarbonyl')) return { notCovered: 'alpha_group' };
  return null;
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
  const stop = flagStop(site.flags);
  if (stop && stop.reason){ res.reasons.push(stop.reason); return res; }
  if (stop) return { ...res, notCovered: stop.notCovered };
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

// Ring E2: the leaving group and the β-H must both be axial (trans-diaxial = anti-periplanar).
// Both chairs come from chair.js (3D + MMFF94s+); on adjacent ring carbons two axial bonds always point
// opposite ways, so "LG axial + axial H on a neighbouring ring carbon" is exactly the anti-periplanar pair.
// Returns null when the check can't run (no chair ring, fused/bridged rings, 3D failed), { undefinedStereo }
// when a ring stereocentre is drawn without wedges (the chair would be a guess), else
// { ring, chairs: [{ label, dE, lgAxial, anti: [β ring atoms] }] }.
export function ringAntiCheck(OCL, m, site){
  const ring = findChairRings(OCL, m).find((rg) => rg.includes(site.ca));
  if (!ring) return null;
  m.ensureHelperArrays(OCL.Molecule.cHelperParities);
  // Axial/equatorial depends on the *relative* configuration, so with two or more ring stereocentres every one
  // must be drawn with wedges. A single undrawn stereocentre is fine: both mirror images react the same way.
  const centres = ring.filter((a) => m.isAtomStereoCenter(a));
  if (centres.length > 1 && centres.some((a) => ![1, 2].includes(m.getAtomParity(a)))) return { undefinedStereo: true };
  const r = buildChairs(OCL, m, ring);
  if (r.error || r.fused) return null;
  let good = r.chairs.filter((c) => c.isChair);
  if (!good.length) return null;
  const min = Math.min(...good.map((c) => c.energy));
  good = good.map((c) => ({ label: c.label, subs: c.subs, dE: c.energy - min }));
  if (good.length === 1){
    // the other chair is so strained that MMFF relaxes it out of the chair (twist-boat). A ring flip
    // swaps every axial/equatorial position and keeps each group on its face, so derive it exactly.
    const c = good[0];
    good.push({ label: c.label === 'A' ? 'B' : 'A', subs: c.subs.map((s) => ({ ...s, axial: !s.axial })), dE: null });
  }
  const nextToCa = new Set(ring.filter((a) => a !== site.ca && m.getBond(a, site.ca) >= 0));
  const chairs = good.map((c) => {
    const lg = c.subs.find((s) => s.ringAtom === site.ca && s.atom === site.lgAtom);
    const anti = new Set();
    if (lg && lg.axial) for (const s of c.subs) if (s.isH && s.axial && s.up !== lg.up && nextToCa.has(s.ringAtom)) anti.add(s.ringAtom);
    return { label: c.label, dE: c.dE, lgAxial: !!(lg && lg.axial), anti: [...anti] };
  }).sort((a, b) => (a.dE ?? Infinity) - (b.dE ?? Infinity));
  return { ring, chairs };
}

function chairText(chk, lg, blockedBetter){
  const lgName = LG_LABEL[lg] || lg;
  const parts = chk.chairs.map((c) => `chair ${c.label} (${c.dE === null ? 'much less stable: it twists out of the chair' : c.dE < 0.05 ? 'more stable' : '+' + c.dE.toFixed(1) + ' kcal/mol'}):${lgName} ${c.lgAxial ? 'axial' : 'equatorial'}, ${!c.lgAxial ? 'so no E2 from this chair' : c.anti.length ? `${c.anti.length === 1 ? 'one neighbouring ring carbon has' : 'both neighbouring ring carbons have'} an axial H anti to it` : 'but no neighbouring ring carbon has an axial H'}`);
  return parts.join('; ') + '.' + (blockedBetter ? ' So the C=C can’t form toward the more substituted carbon, even though Zaitsev would prefer it.' : '');
}

function e2(OCL, m, site, r, out){
  let alkenes = alkenesFrom(OCL, m, site.ca, { del: site.lgAtoms });
  if (!alkenes.length){ out.notes.push('no_beta_h'); return; }
  let checked = false, onlyAnti = false;
  if (site.inRing){
    const chk = ringAntiCheck(OCL, m, site);
    if (chk && chk.chairs){
      checked = true;
      const ok = new Set(chk.chairs.flatMap((c) => c.anti));
      const inRing = new Set(chk.ring);
      // a β-carbon outside the ring can always turn an H anti to the leaving group (free rotation)
      const allowed = alkenes.filter((al) => !inRing.has(al.beta) || ok.has(al.beta));
      const blocked = alkenes.filter((al) => !allowed.includes(al));
      const best = (l) => Math.max(-Infinity, ...l.map((al) => al.zaitsev));
      out.chairCheck = { chairs: chk.chairs, blocked: blocked.map((al) => al.beta), text: chairText(chk, site.lg, r.box !== 'bulky' && best(blocked) > best(allowed)) };
      out.notes.push('ring_e2_checked');
      alkenes = allowed;
      if (!alkenes.length){ out.notes.push('ring_e2_no_anti'); return; }
      if (blocked.length && alkenes.length === 1) onlyAnti = true;
    }
  }
  const hofmann = r.box === 'bulky';
  const list = [];
  m.ensureHelperArrays(OCL.Molecule.cHelperParities);
  const antiTexts = [];
  for (const al of alkenes){
    const betaDefined = [1, 2].includes(m.getAtomParity(al.beta)) && m.isAtomStereoCenter(al.beta);
    let isomers = alkeneProducts(OCL, m, al);
    let ezNotCovered = false, geo = null;
    if (isomers.length > 1){
      geo = antiGeometry(OCL, m, site, al, isomers);
      if (geo && geo.isomers){ isomers = geo.isomers; antiTexts.push({ subs: al.zaitsev - (al.conj ? 2 : 0), text: geo.text }); }
      else if (geo && geo.undrawn){ if (!out.notes.includes('e2_stereo_undrawn')) out.notes.push('e2_stereo_undrawn'); geo = null; }
      else if (betaDefined){
        // the 3D check failed: E and Z both possible on paper, but the β stereocentre decides; don't guess
        geo = null; ezNotCovered = true;
        isomers = [alkeneProducts(OCL, m, al, true)[0]];
        if (!out.notes.includes('e2_beta_stereo')) out.notes.push('e2_beta_stereo');
      }
    }
    for (const iso of isomers) list.push(product(iso.mol, { key: [hofmann ? -al.zaitsev : al.zaitsev, geo ? iso.ezScore : iso.trans ? 1 : 0], ez: iso.ez, trans: iso.trans, zaitsev: al.zaitsev, conj: al.conj, beta: al.beta, via: onlyAnti ? 'trans-diaxial (the only anti-periplanar β-H)' : (hofmann ? 'Hofmann (bulky base)' : 'Zaitsev') + (checked ? ', trans-diaxial' : ''), ezNotCovered: ezNotCovered || undefined, anti: iso.anti }));
  }
  if (antiTexts.length){
    const SUBS = ['', 'monosubstituted', 'disubstituted', 'trisubstituted', 'tetrasubstituted'];
    antiTexts.sort((a, b) => b.subs - a.subs);
    const many = antiTexts.length > 1;
    out.antiCheck = { text: antiTexts.map((t) => (many ? `${SUBS[t.subs] || ''} C=C: `.replace(/^./, (c) => c.toUpperCase()) : '') + t.text).join(' ') };
    out.notes.push('e2_anti_checked');
  }
  out.products = rankProducts(list);
  if (site.inRing && !checked){
    const M = OCL.Molecule;
    const flat = new Set(out.products.map((p) => { const c = p.mol.getCompactCopy(); c.stripStereoInformation(); return c.getIDCode(); }));
    if (flat.size > 1) out.notes.push('ring_e2_warning');
  }
  if (out.products.some((p) => p.ez && p.trans === null && !p.anti)) out.notes.push('ez_tie');
}

// Open-chain E2 that can give E or Z: which one(s) the anti-periplanar geometry allows, from 3D conformers
// (anti.js). Each option is the lowest-energy conformer with a β-H at ~180° to the LG; the groups' relation
// in that shape (gauche → cis, anti → trans) picks the isomer. With one β-H and both carbons' configurations
// drawn, E2 is stereospecific: one isomer only. With two β-H's both form; the one from the lower-energy
// reacting conformer is major. → { isomers (with ezScore, anti), text } | { undrawn } | null (3D failed)
function antiGeometry(OCL, m, site, al, isomers){
  const nH = m.getAllHydrogens(al.beta);
  const undrawnCentre = (x) => m.isAtomStereoCenter(x) && ![1, 2].includes(m.getAtomParity(x));
  if (nH === 1 && (undrawnCentre(site.ca) || undrawnCentre(al.beta))) return { undrawn: true };
  const a = antiConformers(OCL, m, site.ca, site.lgAtom, al.beta);
  if (a.error || !a.ref) return null;
  const tagged = isomers.map((iso) => {
    const c = cis2D(iso.mol, iso.map[site.ca], iso.map[al.beta], iso.map[a.ref.ga], iso.map[a.ref.gb]);
    const opt = a.options.find((o) => o.cis === c);
    return opt ? { ...iso, anti: { dE: +opt.dE.toFixed(2), one: nH === 1 } } : null;
  }).filter(Boolean);
  if (!tagged.length) return null;
  const lg = LG_LABEL[site.lg] || site.lg;
  let text;
  if (tagged.length === 1){
    tagged[0].ezScore = 1;
    const other = isomers.find((x) => x.ez !== tagged[0].ez);
    text = `The β-carbon has only one H. In the conformer where that H is anti to ${lg}, the groups line up to give the (${tagged[0].ez}) alkene, so E2 makes only (${tagged[0].ez})${other ? `; (${other.ez}) would need the H and ${lg} on the same side (syn), which E2 can’t do` : ''}.`;
  } else {
    tagged.sort((x, y) => x.anti.dE - y.anti.dE);
    const gap = tagged[1].anti.dE;
    // a gap this small is within MMFF noise: fall back to the bulk rule (trans > cis)
    const close = gap < 0.15;
    tagged.forEach((t, i) => { t.ezScore = close ? (t.trans ? 1 : 0) : i === 0 ? 1 : 0; });
    text = `Two conformers put a β-H anti to ${lg}. The one leading to (${tagged[0].ez}) is ${close ? 'about as stable as' : gap.toFixed(1) + ' kcal/mol more stable than'} the one leading to (${tagged[1].ez}), so ${close ? 'the bulk rule decides' : `(${tagged[0].ez}) is major`}.`;
  }
  return { isomers: tagged, text };
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
  return runSequence(OCL, mol, steps, data).steps.filter((s) => s.res).map((s) => s.res);
}

// The same, with everything the chain view needs. picks[k] (an ID code) continues from a different
// (minor) product of step k instead of the major one. A step that is out of scope, gives no reaction
// or needs a site choice stops the chain there: { stop: reasonKey }, and the later steps aren't run.
// → { steps: [{ input, res, options: [{ pw, product }], chosen, stop }], stopped: index | null }
export function runSequence(OCL, mol, steps, data, picks = []){
  const out = [];
  let cur = mol, stopped = null;
  for (let k = 0; k < steps.length; k++){
    const s = steps[k];
    if (stopped !== null){ out.push({ input: null, res: null, options: [], chosen: null, stop: 'sequence_not_run' }); continue; }
    const res = predict(OCL, cur, s.reagent, s, data);
    const options = stepOptions(res);
    const chosen = options.find((o) => picks[k] && o.product.idcode === picks[k]) || options[0] || null;
    let stop = null;
    if (res.notCovered) stop = res.notCovered;
    else if (res.needSite) stop = 'sequence_site';
    else if (!chosen) stop = res.reasons.includes('vinyl_aryl') ? 'vinyl_aryl' : 'sequence_no_reaction';
    out.push({ input: cur, res, options, chosen, stop });
    if (stop){ stopped = k; continue; }
    cur = chosen.product.mol;
  }
  return { steps: out, stopped };
}
// every product a step can continue from: the activation product, else the lit pathways' products,
// major pathway first (so options[0] is the major product)
export function stepOptions(res){
  if (res.activation) return [{ pw: 'activation', product: res.activation.product }];
  const order = { major: 0, competing: 1, minor: 2 };
  const pws = PATHWAYS.filter((p) => res.lamps && res.lamps[p] && res.lamps[p] !== 'none' && res.pathways[p]).sort((a, b) => order[res.lamps[a]] - order[res.lamps[b]]);
  return pws.flatMap((pw) => res.pathways[pw].products.map((product) => ({ pw, product })));
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
