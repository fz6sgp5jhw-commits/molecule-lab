// Mechanism templates: one per mechanism, as data (see docs/mechanisms-plan.md, Part B).
// A template only talks about roles (nu, ca, lg, cb, hb), never about a particular compound, so
// the same frames work for every substrate the analyser accepts. mech-view.js draws them.
//
// Frame fields
//   text     key into data/mech-text.json → frames (dialog text + WHY pages)
//   bonds    { 'ca-lg' | 'nu-ca': 'solid' | 'partial' | 'none' }
//   charges  { role: '−' | '+' }            formal charges shown on atoms
//   deltas   { role: 'δ+' | 'δ−' }          partial charges (rule-based: electronegativity)
//   clouds   { role: 'rich' | 'some' | 'poor' }  electron density (rule-based: lone pairs, charge, δ)
//   lonePair role whose lone pair is drawn as two dots
//   arrows   [[from, to]]: 'nu' (its lone pair), 'ca-lg' (that bond), or an atom role
//   pull     0..1   how tight the pull line from Nu to Cα is (1 = it has become the bond, line hidden)
//   hill     0..1   ball position along the energy profile
//   meter    0..4   stability now (qualitative; the transition state is always the least stable point)
//   ts       true → draw ‡ brackets
//   result   true → the dialog shows the product card after the text

export const TEMPLATES = {
  SN2: {
    humps: 1,
    frames: [
      { text: 'sn2_meet',
        bonds: { 'ca-lg': 'solid', 'nu-ca': 'none' },
        charges: { nu: '−' }, deltas: { ca: 'δ+', lg: 'δ−' },
        clouds: { nu: 'rich', lg: 'some', ca: 'poor' }, lonePair: 'nu',
        arrows: [], pull: 0.15, hill: 0, meter: 3 },
      { text: 'sn2_attack',
        bonds: { 'ca-lg': 'solid', 'nu-ca': 'none' },
        charges: { nu: '−' }, deltas: { ca: 'δ+', lg: 'δ−' },
        clouds: { nu: 'rich', lg: 'some', ca: 'poor' }, lonePair: 'nu',
        arrows: [['nu', 'ca'], ['ca-lg', 'lg']], pull: 0.55, hill: 0.25, meter: 2 },
      { text: 'sn2_ts',
        bonds: { 'ca-lg': 'partial', 'nu-ca': 'partial' },
        deltas: { nu: 'δ−', lg: 'δ−', ca: 'δ+' },
        clouds: { nu: 'some', lg: 'some', ca: 'poor' },
        arrows: [], pull: 0.85, hill: 0.5, meter: 0, ts: true },
      { text: 'sn2_product',
        bonds: { 'ca-lg': 'none', 'nu-ca': 'solid' },
        charges: { lg: '−' },
        clouds: { lg: 'rich' }, lonePair: 'lg',
        arrows: [], pull: 1, hill: 1, meter: 3 },
      { text: 'sn2_result',
        bonds: { 'ca-lg': 'none', 'nu-ca': 'solid' },
        charges: { lg: '−' },
        clouds: { lg: 'rich' }, lonePair: 'lg',
        arrows: [], pull: 1, hill: 1, meter: 3, result: true },
    ],
  },
};
