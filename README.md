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
| Structure → IUPAC name | [PubChem PUG REST](https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest) lookup by SMILES |
| Name → structure | PubChem name lookup first, [OPSIN](https://www.ebi.ac.uk/opsin/) as fallback |
| Name check | OPSIN reads the name back into a structure, which is compared with your drawing |

If neither service knows an answer, the app says so. It never makes up a name.

**Badges:** green = checked; yellow = stereo-only difference, a different tautomer, or only one source could answer; red = the check failed, so verify by hand.

## Files

No build step. Plain HTML and JS, with libraries kept as local files:

- `index.html`: the whole app
- `openchemlib.js`, `resources.json`: OpenChemLib 9.25.2
- `3Dmol-min.js`: 3Dmol.js 2.5.5
- `fonts/`: Pixelify Sans, VT323, Press Start 2P (SIL OFL)
- `manifest.webmanifest`, `sw.js`, `icons/`: install and offline support

**When you change any file,** bump `VERSION` in `sw.js` so installed copies update.

Library licenses are in `licenses/`.
