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
  let nu = null;
  if (at >= 0){ m.setAtomCharge(at, 0); m.ensureHelperArrays(OCL.Molecule.cHelperNeighbours); nu = { mol: m, atom: at }; }
  return { id: 'custom', label: 'drawn reagent', names: [], smiles: [], box, nu, estimated: !!g && g.box === box };
}
