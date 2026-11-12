# Ch 7: Alkenes, structure and preparation: study guide

How to solve, picture and check every problem on the Chemistry 2310 Ch 7 worksheet, using Molecule Lab where it helps.

Every product and stereo answer below was checked against your answer key. Two checks were used:
- **App** = the Reactions engine (`predict.js`) as it is today;
- **3D** = a geometry check with OpenChemLib conformers and `chair.js` chairs: find the β‑H that is 180° from the leaving group, and read E/Z or the ring position from that shape.

Legend: ✅ the app gives the key's answer · ⚠️ the app shows a warning or "not covered" · ❌ the app gives a **wrong** answer (see `ch7-app-gaps.md`). Ring E2 (trans-diaxial) and the ring methyl-shift bug were fixed on 2026‑11‑11, so 9j, 9k, 9l, 10a, 10d, 13a and 13c are now ✅.

---

## Part 1: The five ideas that solve this whole worksheet

1. **Alkene stability = how many carbons sit on the C=C.**
   - tetra > tri > di > mono. Each alkyl group donates a little electron density into the π system (hyperconjugation).
   - Among disubstituted alkenes: trans > 1,1 ≈ cis. Cis groups bump into each other.
   - Ring strain beats substitution: an alkene in or on a 3‑ or 4‑membered ring is less stable than its count suggests. A C=C *inside* a 5- or 6-membered ring is normal; one *sticking out* of a small ring (exocyclic) is worse.
2. **Zaitsev's rule.** An elimination with a small base (EtO⁻, HO⁻), or any E1, gives the **most substituted** (most stable) alkene. A **bulky base** (KOtBu) grabs the most exposed H instead and gives the **less substituted (Hofmann)** alkene.
3. **E2 is one step with a strict shape.** The base pulls a β‑H while the leaving group leaves. That H and the LG must be **anti-periplanar** (180° apart in a Newman projection).
   - In open chains, this shape decides **E vs Z** (Q3, Q4b, Q5).
   - In cyclohexanes, the H and the LG must both be **axial** (trans-diaxial). This decides **which side of the ring** the C=C forms on, and can **beat Zaitsev** (Q9j, 9k, 10d, 13c).
   - Rate = k[substrate][base] (bimolecular).
4. **E1 goes through a carbocation, so it can rearrange.**
   - Acid (H₂SO₄, H₃PO₄, KHSO₄) turns OH into OH₂⁺, water leaves, and C⁺ forms. That is the slow step, so rate = k[substrate].
   - Before losing H⁺, the cation will **shift H⁻ or CH₃⁻, or expand a strained ring**, if that makes it more stable (2°→3°, 4‑ring→5‑ring).
   - It then loses the H that gives the Zaitsev alkene.
5. **When you want control, don't use acid.**
   - Convert OH into a leaving group **without** forming a cation: SOCl₂/pyridine (inversion), TsCl/pyridine (retention) or PBr₃.
   - Then do E2 with a base you choose: NaOEt for Zaitsev, KOtBu for Hofmann.
   - This avoids rearrangements and lets the chair decide the regiochemistry (Q10b–d, Q13b–c).

**Exam routine:** for every problem, say *substrate class → reagent type → mechanism → which H can leave (and does geometry restrict it?) → most stable product*. Then check it.

---

## Part 2: Problem by problem

### Q1 Chivosazole F: counting stereocentres and E/Z bonds
- **How:** a stereocentre is an sp³ carbon with 4 different groups. Look for every wedge or hash, plus any CH bearing O and two different chains. For each C=C, check that both ends carry two different groups, then compare the higher-priority group on each end (CIP). Same side = Z, opposite = E.
- **Key:** 10 stereocentres, 5 E, 4 Z (not counting the oxazole).
- **Check:** ✅ 10 stereocentres, counted by OpenChemLib on PubChem's structure.
  - ⚠️ PubChem's record for "chivosazole F" (CID 102050233) encodes **all nine** C=C as Z, which disagrees with the worksheet's drawing and with the synthesis story (the Wittig makes an E bond). OpenChemLib reads E/Z correctly on test molecules, so the problem is in that database record.
  - **Lesson:** count from the drawing your instructor gives you, not from a database.
- **Why it matters:** chivosazoles are myxobacterial macrolides that bind **actin** (the cell's skeleton), which is why they kill cancer cells and fungi.
  - The synthesis is a lesson in alkene control. The Wittig reaction sets one E bond, and the Stille coupling joins two pieces *without* scrambling a Z bond.
  - Change one C=C and you have a different, often inactive, compound. That is why E/Z matters outside of exams.

### Q2 Naming alkenes (key: a‑C, b‑F, c‑D, d‑F)
- **Rules:**
  - The main chain must contain the C=C, even if a longer chain exists elsewhere.
  - Number so the C=C gets the lowest locant.
  - Then E/Z: compare CIP priorities on each alkene carbon.
  - In ring alkenes, C1 and C2 are the alkene carbons, numbered so the substituents get low numbers. In Q2d the OH gets C1 (in "‑ol" names it outranks the ene), giving 3‑methylcyclohex‑2‑en‑1‑ol.
- **App:** draw it, then read the name. ✅ All four structures and stereo descriptors match. The app writes 2013 IUPAC style, so you have to translate:
  - `propan-2-yl` = isopropyl, `2-methylpropyl` = isobutyl;
  - `hept-3-ene` = 3‑heptene;
  - and the order of substituents changes (alphabetical by the full prefix name).
  - Example: app `(3E)-3-ethyl-2,6,6-trimethyl-4-(propan-2-yl)hept-3-ene` = key `(3E)-3-Ethyl-4-isopropyl-2,6,6-trimethyl-3-heptene`.
- **2b trap:** on C4, both branches start with CH₂. Go one atom further: isobutyl's next carbon is CH(C,C) and beats CH₂(C). Isobutyl and F end up on the same side → **Z**.

### Q3 2‑Bromobutane → (E)‑2‑butene: which Newman conformation? (key: 4)
- **How:** E2 needs H and Br anti (180°). For the **E** alkene, the two CH₃ groups must *also* be anti. Find the projection where Br and an H are opposite each other **and** the two CH₃ are opposite each other: that is 4.
- **3D:** both (E)- and (Z)-but-2-ene (and but‑1‑ene) can form from some anti conformer. E wins because its conformer has the CH₃ groups apart, which is lower in energy.
- **App:** ✅ the E2 note now says this: "two conformers put a β-H anti to Br; the one leading to (E) is 0.6 kcal/mol more stable".
- **App:** ⚠️ there is no Newman view yet (the tab says "soon"). Use the 3D model with *Spin* off and look down the C2–C3 bond.

### Q4 Zaitsev predictions (key: a‑D, b‑F, c‑B)
- **a.** 3‑ethyl‑2‑methylhexan‑3‑ol with H₂SO₄ and heat: E1 through a 3° cation. Losing the H from the isopropyl CH gives the **tetrasubstituted** 3‑ethyl‑2‑methylhex‑2‑ene. ✅ App.
- **b.** 3‑chloro‑4‑methylhexane with NaOH: E2 Zaitsev gives 3‑methylhex‑3‑ene (trisubstituted beats disubstituted), and the key says **E**. ✅ App. With no wedges it lists both (3E) and (3Z), with (3E) first by the bulk rule, and a note that E2 is stereospecific here, so you should add wedges for the one answer.
  - **Deeper:** the (3R,4R)/(3S,4S) diastereomer can only give **E**, while (3R,4S)/(3S,4R) can only give **Z**. ✅ App: draw the wedges and it gives just that one, with a note saying why (the one β-H anti to Cl). "E" is the right answer for an unspecified starting material, but on an exam with wedges, draw the Newman projection.
- **c.** 2,5‑dimethyl‑1‑propylcyclohexan‑1‑ol with acid: 3° cation; the ring H next to the methyl gives the tetrasubstituted ring alkene (B). ✅ App. The two minor exocyclic alkenes are now named (2E)- and (2Z)-1,4-dimethyl-2-propylidenecyclohexane; they used to share one name.

### Q5 Optically active 3‑chloro‑4‑cyclohexylheptane + NaOH (key: product B (E), rate law E, mechanism E2)
- **How:**
  - A strong base on a 2° halide gives **E2**, and rate = k[NaOH][substrate].
  - Both carbons are stereocentres, so the anti-periplanar shape fixes the geometry.
  - Put H (on C4) and Cl (on C3) anti in a Newman projection, and see where cyclohexyl and ethyl end up: on opposite sides → **(E)‑4‑cyclohexylhept‑3‑ene**.
- **Check:** 3D ✅ gives (3E) in every conformer that can react. ✅ App (since P0‑3): draw (3S,4S) (SMILES `CCC[C@H]([C@H](CC)Cl)C1CCCCC1`) with NaOH and it gives [(3E)-hept-3-en-4-yl]cyclohexane as major, and the note explains that C4 has only one H, so only E can form. The (3S,4R) diastereomer gives only Z.
- **Transition-state drawing (part e):** dotted C–H and C–Cl bonds, a dotted C=C forming, δ⁻ on the base's O and on Cl, all inside brackets marked ‡.
- **Note:** options E and F on the worksheet are identical (a typo).

### Q6 3,4‑Dimethylhexan‑3‑ol, H₂SO₄, heat (key: A, rate B, E1)
- **How:** OH is protonated, water leaves to give a 3° cation, and the H next door leaves to give the **tetrasubstituted (E)‑3,4‑dimethylhex‑3‑ene**. The E isomer keeps the two ethyls apart.
- Rate = k[1]: H₂SO₄ is a catalyst, and the slow step involves only the substrate.
- **Energy profile (part a):** three humps, with valleys for the protonated alcohol and the carbocation. The **tallest hump is water leaving**; label that Eₐ. The product sits lowest.
- **App:** ✅ (3E)-3,4-dimethylhex-3-ene major. The ▶ Watch on the E1 card animates the steps and the energy hill.

### Q7 1‑(1‑Bromoethyl)‑1‑methylcyclobutane, heat (key: E, mechanism F)
- **How:**
  - Br leaves and gives a 2° cation next to a strained 4‑ring.
  - A ring bond shifts, the ring **expands to 5**, and the cation becomes 3°.
  - Losing an H gives tetrasubstituted 1,2‑dimethylcyclopentene. Two wins at once: less strain and a more stable cation.
- **App:** ✅ E1 major product = 1,2‑dimethylcyclopentene "via ring expansion". Use reagent `EtOH` or `H2O` with Heat on.
  - ⚠️ The app shows SN1 as major and E1 as "competing" even with heat. The question expects E1, because heat with no nucleophile means elimination.

### Q8 Which alkene is more stable? (key: a A, b A, c B, d B, e A, f B)
| | Winner | Reason |
|---|---|---|
| a | 3‑methylpent‑2‑ene | tri > di |
| b | ethylidenecyclopentane | tri > di (4‑methylcyclohexene) |
| c | cyclohexene | internal ring alkene in a strain-free ring beats a C=C sticking out of a 5‑ring |
| d | 1‑methylcyclopentene | tri (inside ring) > 1,1‑di (exocyclic) |
| e | (E)‑3,4‑dimethylhex‑3‑ene | both tetra; E keeps the two ethyls apart |
| f | 1‑ethylcyclopentene | the C=C on a cyclobutane is strained |

- **App:** ⚠️ there is no "compare stability" tool yet. The app names both isomers correctly, but you have to judge stability yourself.

### Q9 Major elimination products
| | Substrate → product | How | App |
|---|---|---|---|
| a | decalin‑4a‑ol + H₂SO₄ → Δ⁹⁽¹⁰⁾‑octalin (tetrasubstituted, at the ring fusion) | E1 at a 3° centre | ✅ product right, but no name offline (fused rings) |
| b | 2‑cyclopentylpropan‑2‑ol + H₃PO₄ → isopropylidenecyclopentane | E1, tetrasubstituted | ✅ |
| c | 2,4‑dimethylpentan‑3‑ol + H₂SO₄ → 2,4‑dimethylpent‑2‑ene | E1 (2°→3° hydride shift gives the same alkene) | ✅ |
| d | 1‑bromo‑3‑methylbutane + NaOEt → 3‑methylbut‑1‑ene | only one β carbon | ✅ but the app (correctly) says SN2 is the *overall* major product with NaOEt; the question asks only for elimination |
| e | 2‑bromo‑3‑methylbutane → 2‑methylbut‑2‑ene | E2 Zaitsev | ✅ |
| f | 2‑bromo‑2‑methylbutane → 2‑methylbut‑2‑ene | E2 Zaitsev | ✅ |
| g | (bromomethyl)cyclohexane → methylenecyclohexane | only β‑H is on the ring CH | ✅ (same SN2 note as d) |
| h | 1‑bromo‑1‑methylcyclohexane → 1‑methylcyclohexene | ring H's are axial in one chair | ✅ |
| i | **cis**‑1‑Br‑2‑tBu → 1‑tBu‑cyclohexene (major) | tBu equatorial → Br axial; axial H's on both sides → Zaitsev | ✅ (3D agrees) |
| j | **trans**‑1‑Br‑2‑tBu → **3**‑tBu‑cyclohexene | Br is equatorial in the good chair; in the flipped chair its axial partner on C2 isn't an H → only C6 can react | ✅ 3‑tBu, with a green note explaining both chairs (fixed 2026‑11‑11) |
| k | 1‑Br(hash)‑2‑Me(wedge)‑4‑tBu(wedge) → 5‑tBu‑3‑methylcyclohexene | tBu locks the ring: Br equatorial. The ring flip puts Br axial, but the axial group on C2 is CH₃, not H → elimination away from the methyl | ✅ trans-diaxial (fixed 2026‑11‑11) |
| l | 2,2‑dimethylcyclopentanol + H₂SO₄ → 1,2‑dimethylcyclopentene | 2° cation, methyl shift → 3°, tetrasubstituted alkene | ✅ (was a bug that showed an alkane; fixed 2026‑11‑11) |
| m | spiro[3.5]nonan‑5‑ol + H₂SO₄ → bicyclo[4.3.0]non‑1(6)‑ene | ring expansion 4→5, then tetrasubstituted alkene | ✅ product, but no name offline |
| n | bicyclic alcohol + KHSO₄, 150 °C | 2° cation, Wagner–Meerwein alkyl shift in the bicycle, then loss of H⁺ | ⚠️ KHSO₄ isn't a known reagent; bridged rings aren't covered |

**How to "see" 9j and 9k:** draw the substrate, open **Chair**, press **⟲ Ring flip** and read the ax/eq labels.
- Find the chair where the Br is **axial**.
- In that chair, look at the two neighbouring ring carbons: only one whose **axial** position holds an **H** can lose it.
- The tBu group makes the other chair very costly. The reaction still goes through it, just slowly.

### Q10 Pick the reagents (key: a D; b A then B; c A then B; d A then B)
- **a.** 2,2‑dimethylcyclohexanol needs the alkene *between* the old C–OH carbon and the CMe₂ carbon, with a methyl moved. That requires a carbocation and a **methyl shift** → H₂SO₄ and heat (D). ✅ App (after the 9l fix).
- **b.** Same starting material, but this time *no* methyl shift is wanted → SOCl₂/pyridine (Cl, no cation), then KOtBu (E2). ✅ App gives 3,3‑dimethylcyclohexene.
- **c.** Primary alcohol: no cation is possible → SOCl₂, then KOtBu, the bulky base that prefers E2 over SN2. ✅ App: E2 major.
- **d.** SOCl₂ inverts the C–O carbon, so Cl ends up axial with an axial H anti only on the tBu side. ✅ App: only the tBu-side alkene, via the trans-diaxial check.

### Q11 E1 rate, neutral conditions (key: 3 I > 5 Br > 2 Cl > 1 F > 4 OH)
- Same carbocation every time, so only the leaving group matters: I⁻ > Br⁻ > Cl⁻ ≫ F⁻.
- OH⁻ is too strong a base to leave without acid.
- **App:** ✅ draw all five, then **Rank by SN1 rate** (E1 has the same slow step). OH shows as "no leaving group", i.e. last.

### Q12 E1 rate with acid (key: 3 > 4 > 5 > 1 > 2)
- 3 is 3° **and** allylic (resonance), the best cation.
- 4 is 3°.
- 5 and 1 are both 2°, but 5 can hydride-shift to a 3° cation.
- 2 is 1°, so no E1.
- **App:** ⚠️ ranking can't treat OH as protonated yet, so every alcohol comes back "no leaving group".

### Q13 Syntheses
- **a.** 2,2‑dimethylcyclopentanol → 1,2‑dimethylcyclopentene: H₂SO₄ and heat (methyl shift). ✅ App (after the 9l fix).
- **b.** 2‑methylhexan‑3‑ol → 2‑methylhex‑2‑ene **without acid**: make a leaving group (TsCl/pyridine or SOCl₂/pyridine), then E2.
  - ⚠️ **Check this one with your instructor.** The key uses **KOtBu**, but a bulky base gives the *Hofmann* product, 2‑methylhex‑3‑ene. The app predicts exactly that.
  - **NaOEt/EtOH** gives the wanted Zaitsev product (the app agrees). This is a good question to ask in class.
- **c.** All-cis 3‑tBu‑2‑methylcyclohexanol → the alkene on the side *away* from the methyl. SOCl₂/pyridine (inversion puts Cl axial and trans to CH₃), then KOtBu.
  - In the locked chair, C2's axial position holds the CH₃, so only C4's axial H is anti.
  - TsCl followed by NaI (SN2, inversion) is the key's alternative.
  - ✅ App: "trans-diaxial (the only anti-periplanar β-H)". Try **TsCl** then KOtBu too: TsCl keeps the configuration, so the OTs can go axial *with* an axial H on C2, and both alkenes become possible. That is why the key's route uses SOCl₂ (or TsCl then NaI), which invert.

---

## Part 3: Why alkenes and eliminations matter
- **Making alkenes is how chemists set up everything else.** C=C bonds are the handles for the next chapters: addition of HX, H₂O, Br₂, epoxidation, hydrogenation.
- **Industry:** ethylene and propylene are the most-produced organic chemicals, made by cracking (an elimination at high temperature) and turned into polyethylene and polypropylene.
- **Medicines and natural products:** E/Z geometry changes shape, and shape changes biology.
  - Chivosazole's actin binding depends on its alkene geometry.
  - Tamoxifen (a breast-cancer drug) is used as one specific isomer about its C=C.
- **The tert‑butyl "lock"** in Q9i–k, 10d and 13c is a real research tool. Chemists put a tBu group on a ring to freeze one chair so they can study axial vs equatorial reactivity.

## Part 4: Study plan for this chapter
1. **Day 1:** stability (Q8) and naming (Q2). Draw each Q8 pair; count the substituents out loud.
2. **Day 2:** E2 geometry. Q3 and Q5 with Newman projections drawn by hand. Then 9i–k in the **Chair** tab: find the axial Br and its axial H neighbours.
3. **Day 3:** E1 and rearrangements: Q6, 7, 9l–m. Use ▶ Watch in the Reactions tab.
4. **Day 4:** strategy: Q10 and 13. For each, say *why* acid would fail (rearrangement, wrong regiochemistry) before choosing reagents.
5. **Mistakes list:** write down each rule you missed, and redo those problems 2 days later.
