# Molecule Lab: notes for Claude Code

An organic chemistry homework tool for a student. Draw a molecule to get its IUPAC name, or type a name to get the structure, then explore it as a line drawing, a 3D model and chair conformations.
Live at https://fz6sgp5jhw-commits.github.io/molecule-lab/ (GitHub Pages serves `main` from the repo root).

**Accuracy matters more than speed.** The user is learning, and a wrong answer shown confidently is worse than "I can't do this one".

## Hard rules
- **Calculations come from code, never from guesses.** Formula, mass, stereo (R/S, E/Z), ring sizes, 3D shapes and energies come from OpenChemLib. Names come from PubChem, or from `namer.js` checked by OPSIN.
- **Never invent an answer.** If a service or rule set has no answer, say so plainly and explain why.
- **Report mistakes honestly, then fix the cause.** When a name, prediction or mechanism is wrong, fix how the app handles that whole class of case and add a test for it.
- **No build step.** The app is plain HTML plus ES modules. Libraries are shipped as local files: `openchemlib.js` (9.25.2), `resources.json`, `3Dmol-min.js` (2.5.5). Don't add npm runtime dependencies or a CDN.
- **Keep it working offline.** Every new file the page loads goes in `ASSETS` in `sw.js`. Bump `VERSION` in `sw.js` on every change, or installed phones keep the old copy.
- **Test in a headless browser before pushing.** Run `npm test` and add tests for every new feature.

## Files
| File | What it does |
|---|---|
| `index.html` | The whole UI: styles, markup and the main module script (editor, facts, 2D/3D views, naming flow, Chair tab UI) |
| `namer.js` | Built-in IUPAC 2013 namer. `nameMolecule(OCL, mol)` returns `{ name, steps, warnings }` or `{ error }` |
| `chair.js` | Chair conformations: `findChairRings`, `buildChairs` (both chairs, MMFF energies, axial/equatorial labels), `flipFrames` |
| `sw.js` | Service worker: precaches the app; PubChem and OPSIN are network-only |
| `manifest.webmanifest`, `icons/` | Installable app (display: standalone) |
| `fonts/` | Local Press Start 2P, Pixelify Sans, VT323 |
| `tests/` | `namer.test.mjs` (Node, 193 cases), `app.test.mjs` and `chair-ui.test.mjs` (Playwright, with fake PubChem/OPSIN responses), `chair.test.mjs` (energy report) |
| `docs/mechanisms-plan.md` | **Next feature:** SN1/SN2/E1/E2 learning mode. Read this before starting on it. |

## Useful OpenChemLib facts (learned the hard way)
- Call `Resources.registerFromUrl('./resources.json')` before using the conformer generator. In Node, use `Resources.registerFromNodejs(path)`.
- `getRingSet()` only lists rings of up to 7 atoms. Use `isRingBond()` for bigger rings, as `namer.js` does.
- Stereo: `getAtomCIPParity` 1 = R, 2 = S; `getBondCIPParity` 1 = E, 2 = Z.
  - `getAtomParity() === 3` together with `isAtomStereoCenter()` means a stereocentre drawn without wedges.
  - Ring cis/trans with no CIP centres shows as `isAtomParityPseudo()`.
- Conformers: `new ConformerGenerator(seed)` with `initializeConformers(mol)`, then `getNextConformerAsMolecule()`. Minimise with `new ForceFieldMMFF94(mol, 'MMFF94s+').minimise()`.
- Heavy atoms keep their indices in conformers; hydrogens are appended after them.
- Compare structures with ID codes: `getIDCode()`, or `Canonizer` with `CanonizerUtil.NOSTEREO` to ignore stereo.

## Style
Retro Windows 95 look:
- teal desktop background, grey (#c0c0c0) bevelled windows, navy title bars;
- buttons that press in when clicked;
- "VT323" font for names, formulas and SMILES; yellow tooltips;
- black 3D viewers with green terminal-style text.

It must stay readable on a phone, with no sideways scrolling at 390 px wide.

## Workflow
```bash
npm install && npx playwright install chromium   # first time only
npm test                 # starts a local server on :8765 and runs all suites
npm run test:namer       # quick, Node only
npm run serve            # look at the app at http://localhost:8765
```
Pushing to `main` deploys to GitHub Pages in about a minute.

Write commit messages that explain *why*, not just what.
