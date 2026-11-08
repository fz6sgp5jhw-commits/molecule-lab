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
