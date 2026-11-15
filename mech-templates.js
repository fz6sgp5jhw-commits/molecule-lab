// Mechanism templates: one per mechanism, as data (see docs/mechanisms-plan.md, Part B).
// A template only talks about roles, never about a particular compound, so the same frames work for
// every substrate the analyser accepts. mech-view.js draws them; reactions-ui.js fills in the roles
// for the product the student picked (no shift / hydride shift / methyl shift / ring expansion / allylic).
//
// Roles: ca (C bearing the LG), lg (LG atom), c (the C the Nu attacks / C⁺ that loses Hβ: Cα, the shifted
// C⁺, or the far allylic end), cb (Cβ), n (neighbour a group shifts from), g (shifting atom), ab/y (allyl
// middle/far end); virtual: nu, base, hb (removed β-H), gh (shifting H), hp/hx (acid H⁺ and counter-ion),
// act/ax (P or S of PBr₃/SOCl₂/TsCl and the Br/Cl it loses).
//
// Frame fields
//   text     key into data/mech-text.json → frames, or { flag: key, …, else: key } (first true flag wins)
//   if / unless   only include the frame when this flag is (not) set
//   when     { flag: { …fields } }  merged into the frame when the flag is set
//   proton   true → a proton-transfer step; "Skip proton transfers" hides it ("neglect proton transfer steps")
//   show     virtual roles drawn in this frame (added to the template's `show`); hide: roles not drawn
//            (preludes hide the main template's nu/base/gh: they belong to step 2)
//   bonds    { 'r1-r2': 'solid' (as drawn) | 'single' | 'double' | 'partial' | 'pdouble' (π half-formed) | 'none' }
//   charges  { role: '−' | '+' | '@token' }   formal charges ('' = none; tokens depend on the reagent)
//   deltas   { role: 'δ+' | 'δ−' }             partial charges (rule-based: electronegativity)
//   labels   { role: text, nuRest: text }       label overrides (e.g. OH → OH₂ after protonation)
//   lonePair role(s) whose lone pair is drawn as two dots
//   pOrbital role(s) drawn with an empty p orbital (carbocation)
//   orbitals [{ k, … }]  textbook orbital pictures (Orbitals layer); captions in mech-text.json → orbitals
//            { k: 'sigmaStar', bond: 'ca-lg' }   empty σ*: big lobe behind C, small one beyond the LG
//            { k: 'sigma', bond: 'cb-hb', cap }  a filled σ bond that donates (C–H next to C⁺ / anti to the LG)
//            { k: 'p', at, along?, faces?, cap? } a p orbital (along: lobes point at that role; faces: Nu can
//                                                come in at either lobe → racemic)
//            { k: 'hyper', at }                  empty p plus a neighbouring C–H σ lined up with it
//            { k: 'piForm' | 'pi', a, b }        side-by-side p orbitals overlapping (forming) / the π bond
//   Electron density (glow, bond clouds, dipoles) is not template data: density.js works it out from the
//   drawn atoms, bonds, charges and δ labels of each frame.
//   arrows   [[from, to]]: from = 'nu' | 'base' | 'lp:role' (a lone pair) or a bond 'r1-r2'; to = atom or bond
//   pull     0..1   pull line along the template's `pull` pair (1 = it has become the bond, line hidden)
//   move     true → the shifting group travels along its arc in this frame; moved: true → it has arrived
//   resonance { …fields }  draw a second structure (↔) with these fields changed
//   hill     0..1 or a stop: start, up1, ts1, cation, shiftTs, cation2, up2, ts2, end
//   meter    0..4 or '@c0' / '@c1' (cation stability before / after a shift, from the cation score)
//   ts       true → ‡ brackets
//   quiz     { kind: 'tap', role (or [roles], any is right), q, hide?, if? ('flag' or '!flag') } | { kind: 'yesno', answer: flag, taken?: flag, q, if? }
//   result   true → the dialog shows the product card after the text

// ---------- SN2 ----------
const SN2 = {
  humps: 1, show: ['nu'], pull: ['nu', 'ca'],
  frames: [
    { text: { activated: 'sn2_meet_act', else: 'sn2_meet' },
      bonds: { 'ca-lg': 'solid', 'nu-ca': 'none' }, orbitals: [{ k: 'sigmaStar', bond: 'ca-lg' }], 
      charges: { nu: '@nu' }, deltas: { ca: 'δ+', lg: 'δ−' },
      lonePair: 'nu',
      arrows: [], pull: 0.15, hill: 0, meter: 3,
      quiz: { kind: 'tap', role: 'ca', q: 'attack' } },
    { text: 'sn2_attack',
      bonds: { 'ca-lg': 'solid', 'nu-ca': 'none' }, orbitals: [{ k: 'sigmaStar', bond: 'ca-lg' }], 
      charges: { nu: '@nu' }, deltas: { ca: 'δ+', lg: 'δ−' },
      lonePair: 'nu',
      arrows: [['nu', 'ca'], ['ca-lg', 'lg']], pull: 0.55, hill: 0.25, meter: 2 },
    { text: 'sn2_ts',
      bonds: { 'ca-lg': 'partial', 'nu-ca': 'partial' }, orbitals: [{ k: 'p', at: 'ca', along: 'nu', cap: 'pShared' }],
      deltas: { nu: 'δ−', lg: 'δ−', ca: 'δ+' },
     
      arrows: [], pull: 0.85, hill: 0.5, meter: 0, ts: true },
    { text: 'sn2_product',
      bonds: { 'ca-lg': 'none', 'nu-ca': 'solid' },
      charges: { lg: '@lgFree' },
      lonePair: 'lg',
      arrows: [], pull: 1, hill: 1, meter: 3 },
    { text: 'sn2_result',
      bonds: { 'ca-lg': 'none', 'nu-ca': 'solid' },
      charges: { lg: '@lgFree' },
      lonePair: 'lg',
      arrows: [], pull: 1, hill: 1, meter: 3, result: true },
  ],
};

// ---------- the carbocation half (SN1 and E1 share it) ----------
// After the shift (moved: true) the group sits on Cα: only the keys this case has are used.
const SHIFTED = { 'ca-lg': 'none', 'n-gh': 'none', 'ca-gh': 'solid', 'n-g': 'none', 'ca-g': 'solid' };
const FAR_FORM = { allylicFar: { bonds: { 'ca-ab': 'double', 'ab-y': 'single' } } };
const IONISE = [
  { text: { activated: 'cat_meet_act', else: 'cat_meet' },
    bonds: { 'ca-lg': 'solid', 'n-gh': 'solid' }, deltas: { ca: 'δ+', lg: 'δ−' },
    hill: 'start', meter: 3 },
  { text: 'cat_ionise',
    bonds: { 'ca-lg': 'solid', 'n-gh': 'solid' }, deltas: { ca: 'δ+', lg: 'δ−' },
    arrows: [['ca-lg', 'lg']], hill: 'up1', meter: 2 },
  { text: 'cat_ts1',
    bonds: { 'ca-lg': 'partial', 'n-gh': 'solid' }, deltas: { ca: 'δ+', lg: 'δ−' },
    hill: 'ts1', meter: 0, ts: true },
  { text: 'cat_cation',
    bonds: { 'ca-lg': 'none', 'n-gh': 'solid' }, show: ['gh'],
    charges: { ca: '+', lg: '@lgFree' }, orbitals: [{ k: 'hyper', at: 'ca' }],
    hill: 'cation', meter: '@c0',
    quiz: { kind: 'yesno', answer: 'canShift', taken: 'shift', q: 'shift', if: '!allylic' } },
  // allylic: one frame with both resonance forms
  { if: 'allylic', text: 'allyl_resonance',
    bonds: { 'ca-lg': 'none' }, charges: { ca: '+', lg: '@lgFree' }, pOrbital: 'ca',
    resonance: { bonds: { 'ca-lg': 'none', 'ca-ab': 'double', 'ab-y': 'single' }, charges: { ca: '', y: '+', lg: '' }, pOrbital: 'y' },
    hill: 'cation', meter: '@c0' },
  // the 1,2-shift, inserted only when the chosen product came from a shifted cation
  { if: 'shift', text: { shiftH: 'shift_h', shiftRing: 'shift_ring', else: 'shift_alkyl' },
    bonds: { 'ca-lg': 'none', 'n-gh': 'solid' }, show: ['gh'],
    charges: { ca: '+', lg: '@lgFree' }, pOrbital: 'ca',
    orbitals: [{ k: 'sigma', bond: 'n-gh', cap: 'sigmaShift' }, { k: 'sigma', bond: 'n-g', cap: 'sigmaShift' }],
    arrows: [['n-gh', 'ca'], ['n-g', 'ca']], hill: 'shiftTs', meter: '@c0' },
  { if: 'shift', text: { shiftH: 'shift_h_done', shiftRing: 'shift_ring_done', else: 'shift_alkyl_done' },
    move: true, bonds: SHIFTED, show: ['gh'],
    charges: { c: '+', lg: '@lgFree' }, pOrbital: 'c',
    hill: 'cation2', meter: '@c1' },
];

// ---------- SN1 ----------
const SN1 = {
  humps: 2, show: ['gh'], pull: ['nu', 'c'],
  frames: [
    ...IONISE,
    { text: { nuNeutral: 'sn1_meet_nu', else: 'sn1_meet_ion' }, moved: true, bonds: { ...SHIFTED, 'nu-c': 'none' }, show: ['nu'],
      // allylic: the + is shared, so either end is a right answer
      when: { ...FAR_FORM, allylic: { quiz: { kind: 'tap', role: ['ca', 'y'], q: 'attack_allyl', hide: ['nu'] } } },
      charges: { c: '+', nu: '@nu', lg: '@lgFree' }, lonePair: 'nu', orbitals: [{ k: 'p', at: 'c', faces: true }],
      pull: 0.3, hill: 'cation2', meter: '@c1',
      quiz: { kind: 'tap', role: 'c', q: 'attack_cation', hide: ['nu'] } },
    { text: 'sn1_attack', moved: true, bonds: { ...SHIFTED, 'nu-c': 'none' }, show: ['nu'], when: FAR_FORM,
      charges: { c: '+', nu: '@nu', lg: '@lgFree' }, lonePair: 'nu', pOrbital: 'c',
      arrows: [['nu', 'c']], pull: 0.6, hill: 'up2', meter: '@c1' },
    { text: 'sn1_ts2', moved: true, bonds: { ...SHIFTED, 'nu-c': 'partial' }, show: ['nu'], when: FAR_FORM,
      deltas: { c: 'δ+', nu: '@nuDelta' }, charges: { lg: '@lgFree' },
      pull: 0.9, hill: 'ts2', meter: 0, ts: true },
    { text: { nuNeutral: 'sn1_oxonium', else: 'sn1_product' }, moved: true, bonds: { ...SHIFTED, 'nu-c': 'solid' }, show: ['nu'], when: { ...FAR_FORM, nuNeutral: { labels: { nuRest: '@nuRestOx' } } },
      charges: { nu: '@nuAfter', lg: '@lgFree' }, pull: 1, hill: 'end', meter: 3 },
    { if: 'nuNeutral', proton: true, text: 'sn1_deprotonate', moved: true, bonds: { ...SHIFTED, 'nu-c': 'solid' }, show: ['nu'], when: FAR_FORM,
      labels: { nuRest: '@nuRestR' }, charges: { lg: '@lgFree' }, pull: 1, hill: 'end', meter: 3 },
    { text: 'sn1_result', moved: true, bonds: { ...SHIFTED, 'nu-c': 'solid' }, show: ['nu'], when: { ...FAR_FORM, nuNeutral: { labels: { nuRest: '@nuRestR' } } },
      charges: { lg: '@lgFree' }, pull: 1, hill: 'end', meter: 3, result: true },
  ],
};

// ---------- E1 ----------
const E1 = {
  humps: 2, show: ['gh'], pull: ['base', 'hb'],
  frames: [
    ...IONISE,
    { text: 'e1_base', moved: true, bonds: { ...SHIFTED, 'cb-hb': 'solid' }, show: ['base', 'hb'],
      charges: { c: '+', base: '@base', lg: '@lgFree' }, lonePair: 'base', pOrbital: 'c', orbitals: [{ k: 'sigma', bond: 'cb-hb', cap: 'sigmaCH' }],
      pull: 0.3, hill: 'cation2', meter: '@c1',
      quiz: { kind: 'tap', role: 'cb', q: 'beta_e1', hide: ['hb', 'base'], if: 'major' } },
    { text: 'e1_arrows', moved: true, bonds: { ...SHIFTED, 'cb-hb': 'solid' }, show: ['base', 'hb'],
      charges: { c: '+', base: '@base', lg: '@lgFree' }, lonePair: 'base', pOrbital: 'c', orbitals: [{ k: 'sigma', bond: 'cb-hb', cap: 'sigmaCH' }],
      arrows: [['base', 'hb'], ['cb-hb', 'c-cb']], pull: 0.6, hill: 'up2', meter: '@c1' },
    { text: 'e1_ts2', moved: true, bonds: { ...SHIFTED, 'cb-hb': 'partial', 'base-hb': 'partial', 'c-cb': 'pdouble' }, show: ['base', 'hb'], orbitals: [{ k: 'piForm', a: 'c', b: 'cb' }],
      deltas: { c: 'δ+' }, charges: { lg: '@lgFree' }, pull: 0.9, hill: 'ts2', meter: 0, ts: true },
    { text: 'e1_product', moved: true, bonds: { ...SHIFTED, 'cb-hb': 'none', 'base-hb': 'solid', 'c-cb': 'double' }, show: ['base', 'hb'], orbitals: [{ k: 'pi', a: 'c', b: 'cb' }],
      charges: { base: '@baseH', lg: '@lgFree' }, labels: { baseRest: '@baseRestH' }, pull: 1, hill: 'end', meter: 3 },
    { text: 'e1_result', moved: true, bonds: { ...SHIFTED, 'cb-hb': 'none', 'base-hb': 'solid', 'c-cb': 'double' }, show: ['base', 'hb'],
      charges: { base: '@baseH', lg: '@lgFree' }, labels: { baseRest: '@baseRestH' }, pull: 1, hill: 'end', meter: 3, result: true },
  ],
};

// ---------- E2 ----------
const E2 = {
  humps: 1, show: ['base'], pull: ['base', 'hb'],
  frames: [
    { text: 'e2_meet', bonds: { 'ca-lg': 'solid' },
      charges: { base: '@base' }, deltas: { ca: 'δ+', lg: 'δ−' }, lonePair: 'base',
      hill: 'start', meter: 3,
      quiz: { kind: 'tap', role: 'cb', q: 'beta_e2', if: 'major' } },
    { text: 'e2_anti', bonds: { 'ca-lg': 'solid', 'cb-hb': 'solid' }, show: ['hb'], orbitals: [{ k: 'sigma', bond: 'cb-hb', cap: 'antiCH' }, { k: 'sigmaStar', bond: 'ca-lg' }],
      charges: { base: '@base' }, deltas: { ca: 'δ+', lg: 'δ−' }, lonePair: 'base',
      pull: 0.2, hill: 'start', meter: 3 },
    { text: 'e2_arrows', bonds: { 'ca-lg': 'solid', 'cb-hb': 'solid' }, show: ['hb'], orbitals: [{ k: 'sigma', bond: 'cb-hb', cap: 'antiCH' }, { k: 'sigmaStar', bond: 'ca-lg' }],
      charges: { base: '@base' }, deltas: { ca: 'δ+', lg: 'δ−' }, lonePair: 'base',
      arrows: [['base', 'hb'], ['cb-hb', 'ca-cb'], ['ca-lg', 'lg']], pull: 0.55, hill: 'up1', meter: 2 },
    { text: 'e2_ts', bonds: { 'ca-lg': 'partial', 'cb-hb': 'partial', 'base-hb': 'partial', 'ca-cb': 'pdouble' }, show: ['hb'], orbitals: [{ k: 'piForm', a: 'ca', b: 'cb' }],
      deltas: { base: 'δ−', lg: 'δ−' },
      pull: 0.85, hill: 'ts1', meter: 0, ts: true },
    { text: 'e2_product', bonds: { 'ca-lg': 'none', 'cb-hb': 'none', 'base-hb': 'solid', 'ca-cb': 'double' }, show: ['hb'], orbitals: [{ k: 'pi', a: 'ca', b: 'cb' }],
      charges: { base: '@baseH', lg: '@lgFree' }, labels: { baseRest: '@baseRestH' }, lonePair: 'lg',
      pull: 1, hill: 'end', meter: 3 },
    { text: { hofmann: 'e2_result_hofmann', else: 'e2_result' }, bonds: { 'ca-lg': 'none', 'cb-hb': 'none', 'base-hb': 'solid', 'ca-cb': 'double' }, show: ['hb'],
      charges: { base: '@baseH', lg: '@lgFree' }, labels: { baseRest: '@baseRestH' },
      pull: 1, hill: 'end', meter: 3, result: true },
  ],
};

export const TEMPLATES = { SN2, SN1, E1, E2 };

// ---------- alcohol activation preludes (played before the main template, or alone for TsCl) ----------
// They run on the alcohol drawing; the lg role is the OH oxygen. The main template then draws the
// activated leaving group with the label/charges reactions-ui.js puts in `labels` / `tokens`.
const OH = { lg: 'OH' };
export const PRELUDES = {
  // HX or H₂SO₄/H₃PO₄: the OH takes a proton → OH₂⁺, and water is the leaving group
  protonate: [
    { proton: true, text: 'pro_meet', show: ['hp', 'hx'], labels: OH, bonds: { 'hp-hx': 'solid' },
      charges: { lg: '' }, deltas: { hp: 'δ+' }, lonePair: 'lg',
      hill: 'start', meter: 3 },
    { proton: true, text: 'pro_attack', show: ['hp', 'hx'], labels: OH, bonds: { 'hp-hx': 'solid' },
      charges: { lg: '' }, lonePair: 'lg',
      arrows: [['lp:lg', 'hp'], ['hp-hx', 'hx']], hill: 'start', meter: 3 },
    { proton: true, text: 'pro_done', show: ['hx'], labels: { lg: 'OH₂' }, bonds: {},
      charges: { lg: '+', hx: '−' }, deltas: { ca: 'δ+' },
      hill: 'start', meter: 2 },
  ],
  // PBr₃: O attacks P, Br⁻ leaves; the O–PBr₂ group (still carrying its H) is now the leaving group
  pbr3: [
    { text: 'pbr3_attack', show: ['act', 'ax'], labels: OH, bonds: { 'act-ax': 'solid' },
      charges: { lg: '' }, deltas: { act: 'δ+' }, lonePair: 'lg',
      arrows: [['lp:lg', 'act'], ['act-ax', 'ax']], hill: 'start', meter: 3,
      quiz: { kind: 'tap', role: 'lg', q: 'activate_o' } },
    { text: 'pbr3_done', show: ['act', 'ax'], labels: OH, bonds: { 'lg-act': 'solid' },
      charges: { lg: '+', ax: '−' }, deltas: { ca: 'δ+' },
      hill: 'start', meter: 2 },
  ],
  // SOCl₂ + pyridine: O attacks S, Cl⁻ leaves, pyridine takes the H → alkyl chlorosulfite
  socl2: [
    { text: 'socl2_attack', show: ['act', 'ax'], labels: OH, bonds: { 'act-ax': 'solid' },
      charges: { lg: '' }, deltas: { act: 'δ+' }, lonePair: 'lg',
      arrows: [['lp:lg', 'act'], ['act-ax', 'ax']], hill: 'start', meter: 3,
      quiz: { kind: 'tap', role: 'lg', q: 'activate_o' } },
    { text: 'socl2_done', show: ['act', 'ax'], labels: OH, bonds: { 'lg-act': 'solid' },
      charges: { lg: '+', ax: '−' }, hill: 'start', meter: 2 },
    { proton: true, text: 'socl2_deprot', show: ['act', 'ax'], labels: { lg: 'O' }, bonds: { 'lg-act': 'solid' },
      charges: { lg: '', ax: '−' }, deltas: { ca: 'δ+' }, hill: 'start', meter: 3 },
  ],
  // TsCl/MsCl + pyridine: same pattern at S; the C–O bond is never touched (retention)
  tscl: [
    { text: 'tscl_attack', show: ['act', 'ax'], labels: OH, bonds: { 'act-ax': 'solid' },
      charges: { lg: '' }, deltas: { act: 'δ+' }, lonePair: 'lg',
      arrows: [['lp:lg', 'act'], ['act-ax', 'ax']], hill: 'start', meter: 3,
      quiz: { kind: 'tap', role: 'lg', q: 'activate_o' } },
    { text: 'tscl_done', show: ['act', 'ax'], labels: OH, bonds: { 'lg-act': 'solid' },
      charges: { lg: '+', ax: '−' }, hill: 'up1', meter: 2 },
    { proton: true, text: 'tscl_deprot', show: ['act', 'ax'], labels: { lg: 'O' }, bonds: { 'lg-act': 'solid' },
      charges: { lg: '', ax: '−' }, hill: 'end', meter: 3 },
    { text: 'tscl_result', show: ['act'], labels: { lg: 'O' }, bonds: { 'lg-act': 'solid' },
      charges: { lg: '' }, hill: 'end', meter: 3, result: true },
  ],
};
// TsCl on its own (step 1 of a two-step sequence) is shown as a one-hump "template"
for (const fs of Object.values(PRELUDES)) for (const f of fs) f.hide = [...(f.hide || []), 'gh', 'nu', 'base'];
export const ACTIVATION = { humps: 1, frames: PRELUDES.tscl };

// ---------- Ch 8/10: additions to C=C, radical chains, epoxide opening (S4) ----------
// Roles: a, b = the two C=C carbons (a: where H⁺ / Br• / B / the bridging X ends up; b: the C⁺ or radical carbon,
// the carbon the nucleophile opens, or where B's H goes); ca = the main reacting carbon (b, or a when there is no b);
// c, n, g, gh = an optional 1,2-shift exactly as in SN1. Reagent atoms (virtual): e, ex, e2–e4, i1/i2 (initiator),
// w1/w2 (a second reagent molecule), nu. `place` puts them relative to the C=C (see mech-view.js).
// New frame fields: arrows [from, to, 'f'] = fishhook (one electron; from 'rad:role' starts at the dot),
// radical (role(s) with one dot), bridge (role bonded to a and b with a +), ts4 [4 roles] (four-centre TS),
// surface (a grey metal bar; value = its label), fragments { move: [virtual roles] } (the C=C cut, b's half moves).
// Quiz kind 'choice': { kind: 'choice', q, answer: option key } with the options in mech-text.json → quiz[q].options.

const PI = [{ k: 'pi', a: 'a', b: 'b' }];
const ADDED = { 'a-b': 'single', 'a-e': 'solid', 'e-ex': 'none' }; // H (or X) now on a; the C=C is single

// HX and H₃O⁺ (flag water): π takes H⁺ (Markovnikov), optional shift, Nu bonds to C⁺ (water: then loses H⁺)
const ADD_HX = {
  kind: 'add', humps: 2, show: ['gh'], pull: ['nu', 'c'],
  place: { e: ['at', 'a', 0, 1.1], ex: ['at', 'a', 0, 2.25], nu: ['free', 'c', 1.45] },
  frames: [
    { text: { water: 'ahx_meet_h3o', else: 'ahx_meet' }, show: ['e', 'ex'], bonds: { 'e-ex': 'solid' }, deltas: { e: 'δ+', ex: '@exDelta' }, charges: { ex: '@exBound' },
      orbitals: PI, hill: 'start', meter: 3,
      quiz: { kind: 'tap', role: 'a', q: 'add_h', hide: ['e', 'ex'], if: '!tie' } },
    { text: 'ahx_attack', show: ['e', 'ex'], bonds: { 'e-ex': 'solid' }, deltas: { e: 'δ+', ex: '@exDelta' }, charges: { ex: '@exBound' },
      arrows: [['a-b', 'e'], ['e-ex', 'ex']], hill: 'up1', meter: 2 },
    { text: 'ahx_ts1', show: ['e', 'ex'], bonds: { 'a-b': 'pdouble', 'a-e': 'partial', 'e-ex': 'partial' }, deltas: { b: 'δ+', ex: 'δ−' },
      hill: 'ts1', meter: 0, ts: true },
    { text: 'ahx_cation', show: ['e', 'ex', 'gh'], bonds: { ...ADDED, 'n-gh': 'solid' }, charges: { ca: '+', ex: '@exFree' }, orbitals: [{ k: 'hyper', at: 'ca' }],
      hill: 'cation', meter: '@c0',
      quiz: { kind: 'yesno', answer: 'canShift', taken: 'shift', q: 'shift' } },
    { if: 'shift', text: { shiftH: 'shift_h', shiftRing: 'shift_ring', else: 'shift_alkyl' }, show: ['e', 'gh'],
      bonds: { ...ADDED, 'n-gh': 'solid' }, charges: { ca: '+' }, pOrbital: 'ca',
      orbitals: [{ k: 'sigma', bond: 'n-gh', cap: 'sigmaShift' }, { k: 'sigma', bond: 'n-g', cap: 'sigmaShift' }],
      arrows: [['n-gh', 'ca'], ['n-g', 'ca']], hill: 'shiftTs', meter: '@c0' },
    { if: 'shift', text: { shiftH: 'shift_h_done', shiftRing: 'shift_ring_done', else: 'shift_alkyl_done' }, move: true, show: ['e', 'gh'],
      bonds: { ...ADDED, ...SHIFTED }, charges: { c: '+' }, pOrbital: 'c', hill: 'cation2', meter: '@c1' },
    { text: { water: 'ahx_meet_water', else: 'ahx_meet_x' }, moved: true, show: ['e', 'nu'], bonds: { ...ADDED, ...SHIFTED, 'nu-c': 'none' },
      charges: { c: '+', nu: '@nu' }, lonePair: 'nu', orbitals: [{ k: 'p', at: 'c', faces: true }], pull: 0.3, hill: 'cation2', meter: '@c1',
      quiz: { kind: 'tap', role: 'c', q: 'attack_cation', hide: ['nu'] } },
    { text: 'ahx_nu_attack', moved: true, show: ['e', 'nu'], bonds: { ...ADDED, ...SHIFTED, 'nu-c': 'none' },
      charges: { c: '+', nu: '@nu' }, lonePair: 'nu', pOrbital: 'c', arrows: [['nu', 'c']], pull: 0.6, hill: 'up2', meter: '@c1' },
    { text: { water: 'ahx_oxonium', else: 'ahx_product' }, moved: true, show: ['e', 'nu'], bonds: { ...ADDED, ...SHIFTED, 'nu-c': 'solid' },
      charges: { nu: '@nuAfter' }, when: { water: { labels: { nuRest: '@nuRestOx' } } }, pull: 1, hill: 'end', meter: 3 },
    { if: 'water', proton: true, text: 'sn1_deprotonate', moved: true, show: ['e', 'nu'], bonds: { ...ADDED, ...SHIFTED, 'nu-c': 'solid' },
      labels: { nuRest: '@nuRestR' }, pull: 1, hill: 'end', meter: 3 },
    { text: 'add_result', moved: true, show: ['e', 'nu'], bonds: { ...ADDED, ...SHIFTED, 'nu-c': 'solid' },
      when: { water: { labels: { nuRest: '@nuRestR' } } }, pull: 1, hill: 'end', meter: 3, result: true },
  ],
};

// X₂ (and X₂/H₂O, flag water): bridged halonium ion, then X⁻ (or water) opens it from the back: anti
const HALONIUM = {
  kind: 'add', humps: 2, pull: ['nu', 'b'],
  place: { e: ['at', 'mid', 0, 1.0], ex: ['at', 'mid', 0, 2.15], nu: ['free', 'b', 1.35, 'down'] },
  frames: [
    { text: 'hal_meet', show: ['e', 'ex'], bonds: { 'e-ex': 'solid' }, deltas: { e: 'δ+', ex: 'δ−' }, orbitals: PI, hill: 'start', meter: 3 },
    { text: 'hal_attack', show: ['e', 'ex'], bonds: { 'e-ex': 'solid' }, deltas: { e: 'δ+', ex: 'δ−' }, lonePair: 'e',
      arrows: [['a-b', 'e'], ['lp:e', 'b'], ['e-ex', 'ex']], hill: 'up1', meter: 2 },
    { text: 'hal_ts1', show: ['e', 'ex'], bonds: { 'a-b': 'pdouble', 'a-e': 'partial', 'b-e': 'partial', 'e-ex': 'partial' }, deltas: { e: 'δ+', ex: 'δ−' },
      hill: 'ts1', meter: 0, ts: true },
    { text: 'hal_ion', show: ['e', 'ex'], bridge: 'e', bonds: { 'a-b': 'single' }, charges: { ex: '−' }, hill: 'cation', meter: 2 },
    { text: { water: 'hal_meet_water', else: 'hal_meet_x' }, show: ['e', 'nu'], bridge: 'e', bonds: { 'a-b': 'single', 'nu-b': 'none' }, deltas: { b: 'δ+' },
      charges: { nu: '@nu' }, lonePair: 'nu', pull: 0.3, hill: 'cation', meter: 2,
      quiz: { kind: 'choice', q: 'hal_face', answer: 'back', hide: ['nu'], if: '!water' },
      when: { water: { quiz: { kind: 'tap', role: 'b', q: 'water_carbon', hide: ['nu'], if: '!tie' } } } },
    { text: 'hal_open', show: ['e', 'nu'], bridge: 'e', bonds: { 'a-b': 'single', 'nu-b': 'none' }, deltas: { b: 'δ+' },
      charges: { nu: '@nu' }, lonePair: 'nu', arrows: [['nu', 'b'], ['b-e', 'e']], pull: 0.6, hill: 'up2', meter: 2 },
    { text: 'hal_ts2', show: ['e', 'nu'], bonds: { 'a-b': 'single', 'a-e': 'solid', 'b-e': 'partial', 'nu-b': 'partial' }, deltas: { e: 'δ−', nu: '@nuDelta', b: 'δ+' },
      pull: 0.9, hill: 'ts2', meter: 0, ts: true },
    { text: { water: 'hal_oxonium', else: 'hal_product' }, show: ['e', 'nu'], bonds: { 'a-b': 'single', 'a-e': 'solid', 'nu-b': 'solid' },
      charges: { nu: '@nuAfter' }, when: { water: { labels: { nuRest: '@nuRestOx' } } }, pull: 1, hill: 'end', meter: 3 },
    { if: 'water', proton: true, text: 'sn1_deprotonate', show: ['e', 'nu'], bonds: { 'a-b': 'single', 'a-e': 'solid', 'nu-b': 'solid' },
      labels: { nuRest: '@nuRestR' }, pull: 1, hill: 'end', meter: 3 },
    { text: 'add_result', show: ['e', 'nu'], bonds: { 'a-b': 'single', 'a-e': 'solid', 'nu-b': 'solid' },
      when: { water: { labels: { nuRest: '@nuRestR' } } }, pull: 1, hill: 'end', meter: 3, result: true },
  ],
};

// HBr / ROOR: radical chain, anti-Markovnikov. Initiation RO–OR → 2 RO•; RO• + H–Br → ROH + Br•;
// propagation 1: Br• adds to a (the CH₂ end) → radical on b; propagation 2: b• + H–Br → product + Br•
const CHAIN = ['i1', 'i2', 'e'];
const HBR_RADICAL = {
  kind: 'add', humps: 2,
  place: { ex: ['at', 'a', 0, 1.15], e: ['at', 'a', 0, 2.25], i1: ['at', 'a', -1.15, 2.25], i2: ['at', 'a', -2.3, 2.25], w1: ['at', 'b', 0.2, -1.15], w2: ['at', 'b', 0.2, -2.25] },
  frames: [
    { text: 'hbr_init', show: ['i1', 'i2', 'e', 'ex'], bonds: { 'i1-i2': 'solid', 'e-ex': 'solid' },
      arrows: [['i1-i2', 'i1', 'f'], ['i1-i2', 'i2', 'f']], hill: 'start', meter: 3 },
    { text: 'hbr_ro', show: ['i1', 'i2', 'e', 'ex'], bonds: { 'e-ex': 'solid' }, radical: ['i1', 'i2'],
      arrows: [['rad:i1', 'i1-e', 'f'], ['e-ex', 'i1-e', 'f'], ['e-ex', 'ex', 'f']], hill: 'start', meter: 3 },
    { text: 'hbr_br', show: ['i1', 'i2', 'e', 'ex'], bonds: { 'i1-e': 'solid' }, radical: ['ex', 'i2'], orbitals: PI, hill: 'start', meter: 3,
      quiz: { kind: 'tap', role: 'a', q: 'br_end', if: '!tie' } },
    { text: 'hbr_add', show: ['ex'], hide: CHAIN, radical: ['ex'],
      arrows: [['rad:ex', 'a-ex', 'f'], ['a-b', 'a-ex', 'f'], ['a-b', 'b', 'f']], hill: 'up1', meter: 2 },
    { text: 'hbr_radical', show: ['ex'], bonds: { 'a-b': 'single', 'a-ex': 'solid' }, radical: ['b'], hill: 'cation', meter: '@c0' },
    { text: 'hbr_prop2', show: ['ex', 'w1', 'w2'], bonds: { 'a-b': 'single', 'a-ex': 'solid', 'w1-w2': 'solid' }, radical: ['b'],
      arrows: [['rad:b', 'b-w1', 'f'], ['w1-w2', 'b-w1', 'f'], ['w1-w2', 'w2', 'f']], hill: 'up2', meter: '@c0' },
    { text: 'hbr_chain', show: ['ex', 'w1', 'w2'], bonds: { 'a-b': 'single', 'a-ex': 'solid', 'b-w1': 'solid' }, radical: ['w2'], hill: 'end', meter: 3 },
    { text: 'add_result', show: ['ex', 'w1'], bonds: { 'a-b': 'single', 'a-ex': 'solid', 'b-w1': 'solid' }, hill: 'end', meter: 3, result: true },
  ],
};

// X₂ / light on an alkane: initiation X–X → 2 X•; X• takes the weakest C–H; R• + X–X → R–X + X• (chain)
const RADICAL_SUB = {
  kind: 'add', humps: 2,
  place: { e: ['free', 'a', 0.8], i1: ['beyond', 'e', 1.1, 'a'], i2: ['beyond', 'i1', 1.15, 'e'], w1: ['free', 'a', 1.25], w2: ['beyond', 'w1', 1.15, 'a'] },
  frames: [
    { text: 'rad_init', show: ['e', 'i1', 'i2'], bonds: { 'a-e': 'solid', 'i1-i2': 'solid' },
      arrows: [['i1-i2', 'i1', 'f'], ['i1-i2', 'i2', 'f']], hill: 'start', meter: 3 },
    { text: 'rad_x', show: ['e', 'i1', 'i2'], bonds: { 'a-e': 'solid' }, radical: ['i1', 'i2'], hill: 'start', meter: 3,
      quiz: { kind: 'tap', role: 'a', q: 'which_h', hide: ['e'] } },
    { text: 'rad_abstract', show: ['e', 'i1', 'i2'], bonds: { 'a-e': 'solid' }, radical: ['i1', 'i2'],
      arrows: [['rad:i1', 'e-i1', 'f'], ['a-e', 'e-i1', 'f'], ['a-e', 'a', 'f']], hill: 'up1', meter: 2 },
    { text: 'rad_carbon', show: ['e', 'i1', 'i2'], bonds: { 'e-i1': 'solid' }, radical: ['a', 'i2'], hill: 'cation', meter: '@c0' },
    { text: 'rad_prop2', show: ['e', 'i1', 'w1', 'w2'], bonds: { 'e-i1': 'solid', 'w1-w2': 'solid' }, radical: ['a'],
      arrows: [['rad:a', 'a-w1', 'f'], ['w1-w2', 'a-w1', 'f'], ['w1-w2', 'w2', 'f']], hill: 'up2', meter: '@c0' },
    { text: 'rad_chain', show: ['e', 'i1', 'w1', 'w2'], bonds: { 'e-i1': 'solid', 'a-w1': 'solid' }, radical: ['w2'], hill: 'end', meter: 3 },
    { text: 'add_result', show: ['w1'], bonds: { 'a-w1': 'solid' }, hill: 'end', meter: 3, result: true },
  ],
};

// BH₃: four-centre TS (B to a, the less substituted C; H to b, same face), then H₂O₂/HO⁻ swaps B for OH (retention)
const HYDROBORATION = {
  kind: 'add', humps: 1,
  place: { e: ['at', 'a', 0, 1.1], ex: ['at', 'b', 0, 1.1] },
  frames: [
    { text: 'hb_meet', show: ['e', 'ex'], bonds: { 'e-ex': 'solid' }, deltas: { e: 'δ+', ex: 'δ−' }, orbitals: PI, hill: 'start', meter: 3,
      quiz: { kind: 'tap', role: 'a', q: 'boron_carbon', hide: ['e', 'ex'], if: '!tie' } },
    { text: 'hb_arrows', show: ['e', 'ex'], bonds: { 'e-ex': 'solid' }, deltas: { e: 'δ+', ex: 'δ−' },
      arrows: [['a-b', 'e'], ['e-ex', 'b']], hill: 'up1', meter: 2 },
    { text: 'hb_ts', show: ['e', 'ex'], bonds: { 'a-b': 'pdouble', 'a-e': 'partial', 'b-ex': 'partial', 'e-ex': 'partial' }, ts4: ['a', 'e', 'ex', 'b'], deltas: { b: 'δ+', e: 'δ−' },
      hill: 'ts1', meter: 0, ts: true,
      quiz: { kind: 'choice', q: 'same_face', answer: 'same' } },
    { text: 'hb_borane', show: ['e', 'ex'], bonds: { 'a-b': 'single', 'a-e': 'solid', 'b-ex': 'solid' }, hill: 'end', meter: 3 },
    { text: 'hb_ox', show: ['e', 'ex'], bonds: { 'a-b': 'single', 'a-e': 'solid', 'b-ex': 'solid' }, labels: { e: 'OH' }, hill: 'end', meter: 3 },
    { text: 'add_result', show: ['e', 'ex'], bonds: { 'a-b': 'single', 'a-e': 'solid', 'b-ex': 'solid' }, labels: { e: 'OH' }, hill: 'end', meter: 3, result: true },
  ],
};

// H₂ on a metal: H–H splits on the surface, the C=C lies on its less crowded face, both H's added from the metal side (syn)
const HYDROGENATION = {
  kind: 'add', humps: 1,
  place: { e: ['at', 'a', 0, 1.0], ex: ['at', 'b', 0, 1.0] },
  frames: [
    { text: 'hyd_h2', show: ['e', 'ex'], bonds: { 'e-ex': 'solid' }, surface: '@cat', orbitals: PI, hill: 'start', meter: 3 },
    { text: { faceSame: 'hyd_split_same', faceMix: 'hyd_split_mix', else: 'hyd_split' }, show: ['e', 'ex'], surface: '@cat', orbitals: PI, hill: 'up1', meter: 2,
      quiz: { kind: 'choice', q: 'metal_face', answer: 'less', if: '!faceSame' } },
    { text: 'hyd_deliver', show: ['e', 'ex'], bonds: { 'a-b': 'pdouble', 'a-e': 'partial', 'b-ex': 'partial' }, surface: '@cat', hill: 'ts1', meter: 1 },
    { text: 'hyd_product', show: ['e', 'ex'], bonds: { 'a-b': 'single', 'a-e': 'solid', 'b-ex': 'solid' }, hill: 'end', meter: 3 },
    { text: 'add_result', show: ['e', 'ex'], bonds: { 'a-b': 'single', 'a-e': 'solid', 'b-ex': 'solid' }, hill: 'end', meter: 3, result: true },
  ],
};

// Peroxy acid: concerted "butterfly" transfer of one O, four arrows → epoxide (syn) + carboxylic acid
// e = the O that moves, ex = the other peroxide O, e2 = C(=O)R, e3 = its C=O oxygen, e4 = the O–H hydrogen
const PERACID_RING = { 'e-ex': 'solid', 'ex-e2': 'solid', 'e2-e3': 'double', 'e3-e4': 'partial', 'e4-e': 'solid' };
const ACID_AFTER = { 'a-b': 'single', 'a-e': 'solid', 'b-e': 'solid', 'ex-e2': 'double', 'e2-e3': 'single', 'e3-e4': 'solid' };
const EPOXIDATION = {
  kind: 'add', humps: 1,
  place: { e: ['at', 'mid', 0, 1.1], ex: ['at', 'mid', -0.81, 1.69], e2: ['at', 'mid', -0.5, 2.64], e3: ['at', 'mid', 0.5, 2.64], e4: ['at', 'mid', 0.81, 1.69] },
  frames: [
    { text: 'epo_meet', show: ['e', 'ex', 'e2', 'e3', 'e4'], bonds: PERACID_RING, deltas: { e: 'δ+' }, orbitals: PI, hill: 'start', meter: 3 },
    { text: 'epo_arrows', show: ['e', 'ex', 'e2', 'e3', 'e4'], bonds: PERACID_RING,
      arrows: [['a-b', 'e'], ['e-ex', 'ex-e2'], ['e2-e3', 'e3-e4'], ['e4-e', 'b-e']], hill: 'up1', meter: 2 },
    { text: 'epo_ts', show: ['e', 'ex', 'e2', 'e3', 'e4'], bonds: { 'a-b': 'pdouble', 'a-e': 'partial', 'b-e': 'partial', 'e-ex': 'partial', 'ex-e2': 'pdouble', 'e2-e3': 'pdouble', 'e3-e4': 'partial', 'e4-e': 'partial' },
      hill: 'ts1', meter: 0, ts: true },
    { text: 'epo_product', show: ['e', 'ex', 'e2', 'e3', 'e4'], bonds: ACID_AFTER, hill: 'end', meter: 3 },
    { text: 'add_result', show: ['e'], bonds: { 'a-b': 'single', 'a-e': 'solid', 'b-e': 'solid' }, hill: 'end', meter: 3, result: true },
  ],
};

// O₃ then DMS: one summary frame; the molozonide / ozonide are in the WHY pages, not drawn
const OZONOLYSIS = {
  kind: 'add', humps: 1,
  place: { e: ['at', 'a', 0, 1.05], ex: ['at', 'b', 0, 1.05] },
  frames: [
    { text: 'ozo_meet', orbitals: PI, hill: 'start', meter: 3 },
    { text: { multi: 'ozo_cut_multi', else: 'ozo_cut' }, show: ['e', 'ex'], bonds: { 'a-b': 'none', 'a-e': 'double', 'b-ex': 'double' }, fragments: { move: ['ex'] }, hill: 'end', meter: 3 },
    { text: 'add_result', show: ['e', 'ex'], bonds: { 'a-b': 'none', 'a-e': 'double', 'b-ex': 'double' }, fragments: { move: ['ex'] }, hill: 'end', meter: 3, result: true },
  ],
};

// Epoxide + H₃O⁺ (flag acid: the ring O takes H⁺ first) or HO⁻: SN2 from the back at ca, the C–O bond breaks,
// lg = the ring O (it stays on the other carbon, b). Same arrows as the Q1 enzyme (an acid on O, a Nu at the back).
const EPOXIDE_OPENING = {
  humps: 1, show: ['nu'], pull: ['nu', 'ca'],
  frames: [
    { if: 'acid', proton: true, text: 'eo_protonate', show: ['hp', 'hx'], hide: ['nu'], bonds: { 'hp-hx': 'solid' }, charges: { hx: '+' }, lonePair: 'lg',
      arrows: [['lp:lg', 'hp'], ['hp-hx', 'hx']], hill: 'start', meter: 3 },
    { text: { acid: 'eo_meet_acid', else: 'eo_meet' }, bonds: { 'ca-lg': 'solid', 'nu-ca': 'none' }, orbitals: [{ k: 'sigmaStar', bond: 'ca-lg' }],
      charges: { nu: '@nu', lg: '@lgOn' }, labels: { lg: '@lgLabel' }, deltas: { ca: 'δ+' }, lonePair: 'nu', pull: 0.15, hill: 'start', meter: 3,
      quiz: { kind: 'tap', role: 'ca', q: 'epox_attack', hide: ['nu'], if: '!tie' } },
    { text: 'eo_attack', bonds: { 'ca-lg': 'solid', 'nu-ca': 'none' }, orbitals: [{ k: 'sigmaStar', bond: 'ca-lg' }],
      charges: { nu: '@nu', lg: '@lgOn' }, labels: { lg: '@lgLabel' }, deltas: { ca: 'δ+' }, lonePair: 'nu',
      arrows: [['nu', 'ca'], ['ca-lg', 'lg']], pull: 0.55, hill: 'up1', meter: 2 },
    { text: 'eo_ts', bonds: { 'ca-lg': 'partial', 'nu-ca': 'partial' }, labels: { lg: '@lgLabel' }, deltas: { nu: '@nuDelta', lg: 'δ−', ca: 'δ+' },
      pull: 0.85, hill: 'ts1', meter: 0, ts: true },
    { text: { acid: 'eo_open_acid', else: 'eo_open_base' }, bonds: { 'ca-lg': 'none', 'nu-ca': 'solid' }, labels: { lg: '@lgLabel', nuRest: '@nuRestOpen' },
      charges: { nu: '@nuAfter', lg: '@lgAfter' }, pull: 1, hill: 'end', meter: 3 },
    { proton: true, text: { acid: 'sn1_deprotonate', else: 'eo_protonate_o' }, bonds: { 'ca-lg': 'none', 'nu-ca': 'solid' }, labels: { lg: 'OH', nuRest: 'H' },
      pull: 1, hill: 'end', meter: 3 },
    { text: 'eo_result', bonds: { 'ca-lg': 'none', 'nu-ca': 'solid' }, labels: { lg: 'OH', nuRest: 'H' }, pull: 1, hill: 'end', meter: 3, result: true },
  ],
};

// template name in data/additions.json → viewer template (+ flags it sets)
export const ADD_TEMPLATES = {
  addHX: { t: ADD_HX }, hydration: { t: ADD_HX, flags: { water: true } },
  halonium: { t: HALONIUM }, halohydrin: { t: HALONIUM, flags: { water: true } },
  hbrRadical: { t: HBR_RADICAL }, radicalHalogenation: { t: RADICAL_SUB },
  hydroboration: { t: HYDROBORATION }, hydrogenation: { t: HYDROGENATION },
  epoxidation: { t: EPOXIDATION }, ozonolysis: { t: OZONOLYSIS }, epoxideOpening: { t: EPOXIDE_OPENING },
};
