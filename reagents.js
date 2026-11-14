// Reagent catalogue helpers for the SN1/SN2/E1/E2 feature: matching typed names and drawn
// structures to data/reagents.json, stripping metal counter-ions, and guessing the box of an
// unknown reagent (shown to the student as "estimated", never as a fact).

const METALS = new Set([3, 11, 12, 19, 20, 37, 55]); // Li, Na, Mg, K, Ca, Rb, Cs
const SUB = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9' };

export function normaliseName(s){
  return String(s).replace(/[₀-₉]/g, (c) => SUB[c]).replace(/[⁻−–]/g, '-').replace(/⁺/g, '+')
    .toLowerCase().replace(/[\s_,·.()/]/g, '');
}

// Typed name → catalogue entry (exact alias match after normalising), or null.
export function findReagent(cat, text){
  const t = normaliseName(text);
  if (!t) return null;
  return cat.reagents.find((r) => r.names.some((n) => normaliseName(n) === t) || normaliseName(r.id) === t) || null;
}
export function reagentById(cat, id){ return cat.reagents.find((r) => r.id === id) || null; }

export function findSolvent(cat, text){
  const t = normaliseName(text);
  return cat.solvents.find((s) => s.names.some((n) => normaliseName(n) === t) || normaliseName(s.id) === t) || null;
}
export function solventType(cat, text){ const s = findSolvent(cat, text); return s ? s.type : null; }

// Remove metal counter-ions: free M⁺ ions are dropped; a metal drawn bonded to O/S/N/halogen
// becomes the anion (Na–OEt → ⁻OEt), so drawn "Na⁺ ⁻OEt", "NaOEt" and typed names all match.
export function stripCounterIons(OCL, mol){
  const M = OCL.Molecule;
  const m = mol.getCompactCopy();
  m.removeExplicitHydrogens();
  m.ensureHelperArrays(M.cHelperNeighbours);
  const del = [];
  for (let a = 0; a < m.getAtoms(); a++){
    if (!METALS.has(m.getAtomicNo(a))) continue;
    for (let i = m.getConnAtoms(a) - 1; i >= 0; i--){
      const x = m.getConnAtom(a, i);
      m.setAtomCharge(x, m.getAtomCharge(x) - 1);
    }
    del.push(a);
  }
  if (del.length) m.deleteAtoms(del);
  m.ensureHelperArrays(M.cHelperNeighbours);
  return m;
}

const idCache = new Map();
function entryIds(OCL, r){
  if (!idCache.has(r.id)) idCache.set(r.id, r.smiles.map((s) => OCL.Molecule.fromSmiles(s).getIDCode()));
  return idCache.get(r.id);
}

// Drawn reagent → catalogue entry by ID code (after stripping counter-ions), or null.
export function matchMolecule(OCL, cat, mol){
  const id = stripCounterIons(OCL, mol).getIDCode();
  return cat.reagents.find((r) => entryIds(OCL, r).includes(id)) || null;
}

// Unknown reagent → { box, estimated: true, why } or null.
// Rules (plan): negative charge on O/S/N/halide → nucleophile (alkoxide/hydroxide = strong base too);
// tertiary carbon next to the charged O → bulky; neutral O–H → weak.
export function guessBox(OCL, mol){
  if (notSNEReason(OCL, mol)) return null;
  const m = stripCounterIons(OCL, mol);
  for (let a = 0; a < m.getAtoms(); a++){
    if (m.getAtomCharge(a) >= 0) continue;
    const z = m.getAtomicNo(a);
    if (z === 8){
      const c = m.getConnAtoms(a) ? m.getConnAtom(a, 0) : -1;
      let carbons = 0;
      if (c >= 0 && m.getAtomicNo(c) === 6 && m.getAtomPi(c) === 0) for (let i = 0; i < m.getConnAtoms(c); i++) if (m.getAtomicNo(m.getConnAtom(c, i)) === 6) carbons++;
      if (c >= 0 && m.getAtomicNo(c) === 6 && m.getAtomPi(c) > 0) return { box: 'nuc', estimated: true, why: 'negative O next to C=O (carboxylate-like): good nucleophile, weak base' };
      if (carbons === 3) return { box: 'bulky', estimated: true, why: 'negative O on a tertiary carbon: strong but crowded base' };
      return { box: 'nucbase', estimated: true, why: 'negative O (hydroxide/alkoxide-like): strong nucleophile and strong base' };
    }
    if ([7, 16, 17, 35, 53, 6].includes(z)) return { box: 'nuc', estimated: true, why: 'negative charge on S, N, C or a halide: good nucleophile, weak base' };
  }
  for (let a = 0; a < m.getAtoms(); a++)
    if (m.getAtomicNo(a) === 8 && m.getAtomCharge(a) === 0 && m.getAllHydrogens(a) > 0) return { box: 'weak', estimated: true, why: 'neutral O–H (water/alcohol-like): weak nucleophile and weak base' };
  return null;
}

// A drawn molecule that is not an SN/E reagent at all, so no role may be estimated for it (P0‑2):
// an O–O bond (peroxides, peracids, ozone), X–X (Br₂, Cl₂, I₂), H–H, or boron (BH₃).
// Read on the drawing as given, before explicit H's are stripped (H₂ would vanish). → 'not_sn_e_reagent' | null
const HALOGENS = new Set([9, 17, 35, 53]);
export function notSNEReason(OCL, mol){
  const m = mol.getCompactCopy();
  m.ensureHelperArrays(OCL.Molecule.cHelperNeighbours);
  for (let a = 0; a < m.getAllAtoms(); a++) if (m.getAtomicNo(a) === 5) return 'not_sn_e_reagent';
  for (let b = 0; b < m.getAllBonds(); b++){
    const x = m.getAtomicNo(m.getBondAtom(0, b)), y = m.getAtomicNo(m.getBondAtom(1, b));
    if ((x === 8 && y === 8) || (HALOGENS.has(x) && HALOGENS.has(y)) || (x === 1 && y === 1)) return 'not_sn_e_reagent';
  }
  return null;
}

// A drawn reagent that isn't in the catalogue → a temporary entry the predictor can use.
// box comes from guessBox (or the student's choice); the nucleophile is the charged atom
// (or the O of a neutral O–H), made neutral so it bonds to carbon with the right hydrogens.
export function entryFromMolecule(OCL, mol, box){
  const m = stripCounterIons(OCL, mol);
  let at = -1;
  for (let a = 0; a < m.getAtoms() && at < 0; a++) if (m.getAtomCharge(a) < 0) at = a;
  if (at < 0) for (let a = 0; a < m.getAtoms() && at < 0; a++) if (m.getAtomicNo(a) === 8 && m.getAllHydrogens(a) > 0) at = a;
  const g = guessBox(OCL, mol);
  box = box || (g && g.box);
  if (!box) return null;
  // keep the drawn form (with its charge) so the UI can show it as e.g. C₂H₅O⁻ rather than "drawn reagent"
  const smiles = [m.toIsomericSmiles()], formula = m.getMolecularFormula().formula;
  let nu = null;
  if (at >= 0){ m.setAtomCharge(at, 0); m.ensureHelperArrays(OCL.Molecule.cHelperNeighbours); nu = { mol: m, atom: at }; }
  return { id: 'custom', label: 'drawn reagent', formula, names: [], smiles, box, nu, estimated: !!g && g.box === box };
}

// A worksheet-style sequence typed on one line: "1) TsCl, py 2) NaCN, DMF", "1. PBr3 2. KOtBu",
// "1) HBr 2) NaOEt, EtOH, heat". → { steps: [{ text, reagent, solvent, heat }] } or { error }.
// Within a step, pieces are split on , / ; and each must be a known reagent, a solvent, or heat
// ("heat", "Δ", "reflux", or a temperature of 50 °C or more). No solvent → the reagent's usual one.
// Returns null when the text isn't numbered (then it's an ordinary single reagent).
const HEAT = /^(heat|Δ|delta|reflux|hot|warm|heated)$/i;
const LIGHT = /^(hv|hν|light|uv|uv light|sunlight)$/i;
const PEROXIDE = /^(roor|ro-or|peroxides?|benzoyl peroxide|\(phco2\)2)$/i;
// "A then B", "A followed by B", "A; B": the two halves of one composite step (BH₃ then H₂O₂/HO⁻, O₃ then DMS)
const HALVES = /\s*;\s*|\s+then\s+|\s+followed\s+by\s+/i;

// One step's text → { text, reagent, solvent, heat, light, peroxide } or { error }.
// Pieces are split on , / ; and each must be a known reagent, a solvent, heat (Δ, reflux, ≥ 50 °C),
// light (hν) or peroxides (ROOR). A reagent's `pairs` then picks its partner entry: HBr + ROOR → HBr/ROOR,
// Br₂ + hν → Br₂/hν, Br₂ in H₂O → bromine water, BH₃ then H₂O₂/HO⁻ → hydroboration-oxidation.
export function parseStep(cat, text){
  const body = String(text).trim().replace(/[;,]+$/, '');
  if (!body) return { error: 'empty step' };
  const whole = findReagent(cat, body);
  if (whole) return { text: body, reagent: whole, solvent: whole.solvent || null, heat: false, light: false, peroxide: false };
  const halves = body.split(HALVES).filter(Boolean);
  if (halves.length === 2){
    const a = parseStep(cat, halves[0]), b = parseStep(cat, halves[1]);
    if (a.error) return a;
    if (b.error) return b;
    const id = a.reagent.pairs && a.reagent.pairs[b.reagent.id];
    if (!id) return { error: `“${halves[1]}” isn’t a second part for ${a.reagent.label}` };
    const reagent = reagentById(cat, id);
    return { text: body, reagent, solvent: reagent.solvent || null, heat: a.heat || b.heat, light: a.light || b.light, peroxide: a.peroxide || b.peroxide };
  }
  const step = { text: body, reagent: null, solvent: null, heat: false, light: false, peroxide: false };
  for (const raw of body.split(/[,/;+]|\s+in\s+|\s+(?=\d+\s*°)/)){
    const piece = raw.trim().replace(/^(and|with)\s+/i, '');
    if (!piece) continue;
    const temp = piece.match(/^(-?\d+)\s*°?\s*C$/i);
    if (HEAT.test(piece) || (temp && Number(temp[1]) >= 50)){ step.heat = true; continue; }
    if (temp) continue;
    if (LIGHT.test(piece)){ step.light = true; continue; }
    if (PEROXIDE.test(piece)){ step.peroxide = true; continue; }
    const r = findReagent(cat, piece), s = findSolvent(cat, piece);
    if (r && !step.reagent) step.reagent = r; // the first reagent named is the reagent ("EtOH, heat")
    else if (s && !step.solvent) step.solvent = s.id; // later ones are the solvent ("NaOEt, EtOH")
    else return { error: `“${piece}” isn’t in the reagent or solvent list` };
  }
  if (!step.reagent) return { error: `no reagent found in “${body}”` };
  const pairs = step.reagent.pairs || {};
  const partner = (step.light && pairs.light) || (step.peroxide && pairs.peroxide) || (step.solvent === 'H2O' && pairs.water);
  if (partner) step.reagent = reagentById(cat, partner);
  if (!step.solvent) step.solvent = step.reagent.solvent || null;
  return step;
}

// A worksheet-style sequence typed on one line: "1) TsCl, py 2) NaCN, DMF", "1. PBr3 2. KOtBu",
// "1) HBr 2) NaOEt, EtOH, heat". → { steps: [{ text, reagent, solvent, heat, light, peroxide }] } or { error }.
// Each step is read by parseStep. A two-part reagent (BH₃, O₃: `mergeNext`) followed by its second part as the
// next numbered step ("1) BH₃ 2) H₂O₂, NaOH") is one step. No solvent → the reagent's usual one.
// Returns null when the text isn't numbered (then it's an ordinary single reagent).
export function parseSequence(cat, text){
  const t = String(text).trim();
  const parts = t.split(/(?:^|[\s;,])\(?([1-9])\s*[).:]\s*/).slice(1);
  if (parts.length < 4) return null; // fewer than two numbered steps
  const steps = [];
  let n0 = 0;
  for (let i = 0; i < parts.length; i += 2){
    const n = Number(parts[i]), body = (parts[i + 1] || '').trim().replace(/[;,]+$/, '');
    if (n !== ++n0) return { error: `steps must be numbered 1), 2), 3) in order (found ${n}) after ${n0 - 1})` };
    if (!body) return { error: `step ${n} is empty` };
    const step = parseStep(cat, body);
    if (step.error) return { error: `step ${n}: ${step.error}` };
    const prev = steps[steps.length - 1];
    const merged = prev && prev.reagent.mergeNext && prev.reagent.pairs && prev.reagent.pairs[step.reagent.id];
    if (merged){
      const reagent = reagentById(cat, merged);
      steps[steps.length - 1] = { ...prev, text: `${prev.text}; ${step.text}`, reagent, solvent: reagent.solvent || null, heat: prev.heat || step.heat };
      continue;
    }
    steps.push(step);
  }
  if (steps.length > 3) return { error: 'at most 3 steps' };
  return { steps };
}
