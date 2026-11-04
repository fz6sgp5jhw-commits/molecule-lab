# Molecule Lab

An organic chemistry homework tool. Draw a molecule to get its IUPAC name, or type a name (or SMILES) to build the structure. See it as a skeletal line drawing and as an interactive 3D model.

**Live app:** https://fz6sgp5jhw-commits.github.io/molecule-lab/

## Install on your phone

Open the link above, then:

- **iPhone / iPad (Safari):** Share → *Add to Home Screen*.
- **Android (Chrome):** menu ⋮ → *Install app* (or *Add to Home screen*).

It opens full screen like a normal app. After the first visit, drawing, the 3D viewer and the calculated facts work offline. Naming needs a connection.

## Where the answers come from

| What | Source |
|---|---|
| Formula, molar mass, R/S and E/Z, SMILES, ring sizes | Calculated in the page by [OpenChemLib](https://github.com/cheminfo/openchemlib-js) |
| Structure → IUPAC name | [PubChem PUG REST](https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest) lookup by SMILES; if PubChem has no record (or is unreachable), the app's own IUPAC 2013 namer (`namer.js`) |
| Name → structure | PubChem name lookup first, [OPSIN](https://www.ebi.ac.uk/opsin/) as fallback |
| Name check | OPSIN reads the name back into a structure, which is compared with your drawing |

The built-in namer covers chains, isolated carbon rings and benzene, with acids, esters, amides, nitriles, aldehydes, ketones, alcohols, thiols, amines, halogens, nitro, ethers and sulfides, plus R/S, E/Z and ring cis/trans. It shows the steps it used ("How this name was built"). For anything outside that (heterocycles, fused rings, more than one ester…) it says so instead of guessing.

**Chair tab:** both chair conformations of a cyclohexane-type ring, an animated ring flip, every substituent labelled axial/equatorial and up/down, and the energy difference between the chairs (MMFF94 estimate).

**Badges:** green = checked; yellow = stereo-only difference, a different tautomer, or only one source could answer; red = the check failed, so verify by hand.

## Files

No build step. Plain HTML and JS, with libraries kept as local files:

- `index.html`: the app
- `namer.js`: built-in IUPAC namer
- `chair.js`: chair conformations
- `openchemlib.js`, `resources.json`: OpenChemLib 9.25.2
- `3Dmol-min.js`: 3Dmol.js 2.5.5
- `fonts/`: Pixelify Sans, VT323, Press Start 2P (SIL OFL)
- `manifest.webmanifest`, `sw.js`, `icons/`: install and offline support

**When you change any file,** bump `VERSION` in `sw.js` so installed copies update.

Library licenses are in `licenses/`.
