# Using Molecule Lab for the Chemistry 2310 Ch 6 worksheet

Open the **Reactions** tab at the top of the app (or go to `…/molecule-lab/#reactions`). It shows the Draw window next to the Reactions window, so you don't have to scroll between them.

## The basic routine (every problem)
1. **Substrate:** draw it in the Draw window, or type a name or SMILES in "Build from a name". Use wedges for stereo. The editor can't draw Fischer projections, so redraw a Fischer projection with wedges first (horizontal bonds = wedges towards you, vertical bonds = dashes going away).
2. **Reagent:** type it (`NaCN`, `sodium ethoxide`, `CH3SNa`, `SOCl2`…), tap a chip, or open "Draw the reagent". Its usual solvent is filled in for you. **Change the solvent to match the problem.**
3. **Heat:** press 🔥 Heat if the problem says "heat", "Δ" or gives a temperature above room temperature.
4. **Predict.** Tap each box of the decision path (substrate → reagent → conditions → rule) to see the rule it used. Then read the lamps: bright = major, dim = minor, orange = competing, off = doesn't happen.
   - If a reagent isn't recognised, the app says so and shows the four reagent types (strong Nu/weak base, strong Nu + strong base, bulky base, weak Nu/weak base), with how to spot each and what it does. Draw the reagent and the rules estimate its type (marked *estimated*); you can pick another.
5. **Answer:** each result card shows the product, its name, R/S or E/Z, major/minor and **Stereospecific Y/N**. Press **▶ Watch** (or tap a lit lamp) to step through the mechanism, and press **WHY?** for the reasons. SN2, SN1, E1 and E2 are all animated, and so is alcohol activation (protonation by an acid, PBr₃, SOCl₂, and TsCl as step 1; the TsCl card has its own ▶ Watch).
   - Each SN1/E1 card follows its own cation: **no shift**, **hydride shift**, **methyl shift** or **ring expansion** (worksheets 4 and 5), and an allylic cation shows both resonance forms.
   - Tick **Skip proton transfers** when a question says "neglect proton transfer steps" (protonation of OH, losing H⁺ from an oxonium ion).
   - Tick **Quiz me** to be asked at key moments ("Will this cation shift?", "Tap the carbon the nucleophile attacks") before the answer is shown.
   - At the end, if another pathway also happens (e.g. E1 next to SN1), the app offers it with the reason it is minor or major.
6. **Write the answer yourself first**, then check it with the app. The "Reactivity facts" box (class, leaving group, β-H's, carbocation and possible shifts) is a good place to check your reasoning.

## Problem by problem

| Problem | What to enter | What to look for |
|---|---|---|
| **3a** 2-iodobutane (Fischer) + NaCN, DMSO | Redraw with a wedge; reagent `NaCN`, solvent DMSO | SN2 lamp; the card gives the nitrile with the opposite configuration; Stereospecific **Y** |
| **3b** 2° alcohol + SOCl₂, pyridine | Draw the alcohol with its wedge; reagent `SOCl2` (pyridine fills in) | SN2: the alkyl chloride with inversion |
| **3c** 2° allylic chloride + NaOCH₃, THF, 40 °C | Reagent `NaOCH3`; tap **THF** (the default is MeOH) | SN2 major with inversion, E2 competing, Stereospecific **Y** (as in your solutions) |
| **3d** (1-bromoethyl)benzene + CH₃OH, 80 °C | Reagent `CH3OH`, solvent MeOH, **Heat on** | SN1 major, racemic ether, Stereospecific **N**; E1 competing |
| **3e** 1-iodo-4-isopropylcyclohexane + NaN₃, DMF | Draw cis or trans with wedges; reagent `NaN3`, solvent DMF | SN2: the other diastereomer (cis ↔ trans) |
| **3f** 2° alcohol + 1) TsCl, pyridine 2) NaCN, DMF | Step 1: reagent `TsCl` → Predict → **Load into editor** on the tosylate card. Step 2: reagent `NaCN`, solvent DMF → Predict | Step 1 keeps the configuration (the C–O bond isn't touched); step 2 is SN2 with inversion |
| **4a–c** 1-(1-bromoethyl)-1-methylcyclopentane, EtOH, heat | Reagent `EtOH`, solvent EtOH, **Heat on** | SN1 cards for **no shift**, **methyl shift** and **ring expansion**: all three ethers are answers. Press **▶ Watch** on each to see its mechanism (curly arrows for 4a, 4b and 4c). The app ranks them by carbocation stability (ring expansion = major, the others minor). Your answer key lists all three without a ranking, so write all three. |
| **5** cyclohexyl/cyclopentyl bromide, EtOH, heat | Same as 4 | Shifted ether (more stable cation) = major, unshifted = minor |
| **6, 7** rank five halides | Draw all five side by side in one Draw window | The window switches to ranking mode: press **Rank by SN1 rate** or **Rank by SN2 rate**. Each place shows its reason; ties are shown as ties |
| **8** (S)-2-chloropentane + CH₃SNa, DMSO | Draw with a wedge; tap the `CH₃SNa` chip | Tap the SN2 lamp: step 2 shows the two curved arrows to copy, step 3 the transition state, and the last step the product with its R/S worked out |

## When the app says "not covered yet"
It means the rules don't cover that case, so the app won't guess. Examples: neopentyl substrates, E2 where both carbons' stereo decides E/Z, and ring contraction. Work these out from your notes or ask in class.
