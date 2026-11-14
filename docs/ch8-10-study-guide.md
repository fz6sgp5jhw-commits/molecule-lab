# Ch 8 and 10: Addition reactions of alkenes, and an intro to radicals: study guide

How to solve, picture and check every problem on the Chemistry 2310 Ch 8/10 test, using Molecule Lab where it helps.

Every product below was checked against your answer key. Three checks were used:
- **App** = the Reactions engine as it is today (commit `38e1e8c`);
- **3D** = products built on an OpenChemLib 3D shape, with the less hindered face measured from that shape (see `ch8-10-app-gaps.md`, "Facial selectivity");
- **Names** = given by the app's namer, and read back by OPSIN to confirm.

Legend:
- ✅ the app already does this step;
- ⏳ planned: the session that adds it is named (S1–S5 in `ch8-10-app-gaps.md`);
- ⚠️ a doubt about the key, or a disagreement. It is listed under "Questions for Peter" in the gaps doc.

Today the app does **eliminations only**. Every addition or radical step says "not covered", so for now use this guide and the Chair/3D views. The elimination steps inside the sequences (2n–q, Q4, Q10, Q11) already work.

---

## Part 1: The six ideas that solve this whole test

1. **An alkene is a nucleophile.** The π bond's electrons attack an electrophile: H⁺, Br₂, a peracid's O, or BH₃. Ask two questions every time:
   - **Where does each piece go?** (regiochemistry)
   - **Which faces?** (stereochemistry)
2. **Regiochemistry comes from the intermediate:**
   - **Carbocation** (HX, H₃O⁺): H goes to the carbon that leaves the **more stable cation**, so the Nu ends up on the more substituted C. This is **Markovnikov**. Cations can **shift** (H⁻, CH₃⁻, ring expansion), exactly as in Ch 7 E1.
   - **Bridged halonium** (Br₂, Cl₂): no shifts. In Br₂/H₂O, **water attacks the more substituted C**, which carries more δ+. So OH goes to the more substituted C and Br to the other (Q9, 2j, 3g).
   - **Radical** (HBr with peroxides): Br• adds first, to the end that leaves the **more stable radical** (3° > 2° > 1°). So Br ends up on the **less** substituted C: **anti-Markovnikov**. Only HBr does this; HCl and HI don't.
   - **Concerted, no intermediate** (BH₃): B goes to the less substituted C, so OH ends up there (anti-Markovnikov). Nothing can rearrange.
3. **Stereochemistry comes from how the two pieces arrive:**
   - **Syn** (same face): H₂/Pd or Ni, BH₃ then H₂O₂/OH⁻, peracid (epoxide).
   - **Anti** (opposite faces): Br₂, Br₂/H₂O, Cl₂/H₂O (the bridged ion blocks one face).
   - **Neither** (flat cation or radical): HX, H₃O⁺, HBr/ROOR. Both faces are attacked.
   - **Stereospecific** (your course's use): the mechanism fixes syn or anti. So syn and anti additions count; cation and radical additions don't. A cis alkene gives a cis epoxide, and a trans alkene gives a trans epoxide.
4. **Racemic or one isomer?**
   - Achiral alkene + achiral reagent → any chiral product forms as a **racemic mixture**. Draw one enantiomer and write "+ enantiomer" or "racemic", as the key does in 2k.
   - If the alkene already has a stereocentre (a wedge), you get **one diastereomer**, set by the less hindered face.
5. **Facial selectivity: the reagent comes in from the less crowded face.** Find the nearest big group drawn with a wedge, often on the carbon next to the C=C. The reagent adds **anti** to it (2a, 2c, 2i, 2j, 2m). For anti additions, the *first* piece (the bridged Br⁺) takes the open face, and the second piece comes from the other side.
6. **Radicals, Ch 10:**
   - **Initiation:** light, heat or peroxide splits a weak bond **homolytically** (fishhook arrows, one electron each).
   - **Propagation:** two steps that regenerate the radical.
   - **Termination:** two radicals meet.
   - Br• is very **selective**: it takes the H that leaves the most stable radical (3° C–H), because that step is uphill and its transition state looks like the radical (Hammond). Cl• is fast and **unselective**, so it gives mixtures.

**Exam routine:** *reagent → intermediate (cation / bridged / radical / concerted) → regiochemistry → syn/anti/neither → which face → racemic or single isomer → name it.*

**Ozonolysis** (O₃ then DMS, or Zn): cut every C=C and put =O on both ends. A ring C=C opens into one chain with two C=O. Number the carbons before and after (the key does this in 2l and Q11).

---

## Part 2: Problem by problem

### Q1 Epoxide hydrolase (key: intermediate = Asp ester, mechanism D, SN2)
- **How:**
  - The enzyme's Asp carboxylate (Nu) attacks one epoxide carbon **from the back**.
  - At the same time, Tyr–OH gives its H to the epoxide O, which leaves as OH.
  - That is SN2 with the strained ring as the leaving group: one step, inversion at that carbon.
  - The intermediate is the **ester** (Asp–C(=O)–O–C) on one carbon and OH on the other, **trans** to each other. Water then hydrolyses the ester, and the C–O bond on that carbon is kept, so the diol is **trans** (the product shown).
- **Why SN2 and not SN1:** the attack and the ring opening are concerted, and inversion is needed to get the trans product.
- **App:** ⏳ S2 (epoxide opening) and S4 (the `epoxideOpening` mechanism). Meanwhile, the SN2 card's backside-attack picture is the same idea.
- **Why it matters:** CYP3A4 makes the epoxide, and epoxide hydrolase turns it into a water-soluble diol you excrete. Two drugs competing for CYP3A4 is a classic drug–drug interaction.

### Q2 Major products
R/S labels below belong to the enantiomer used in the app's tests. If your drawing is the mirror image, every label flips, but the cis/trans relationships stay the same, and those relationships are what the key marks.

| | Reaction → key's product | How | App |
|---|---|---|---|
| a | 3-tBu-cyclohexene (tBu wedged) + peracid → epoxide **anti to tBu** | concerted, syn; the bulky tBu blocks its face | ⏳ S2. 3D ✅: the tBu face is 1.7× more crowded in all 8 shapes |
| b | 3,4,4-trimethylpent-2-ene + HCl → **3-chloro-2,2,3-trimethylpentane** | H⁺ to C2 → 3° cation next to tBu → Cl⁻ | ✅ (racemic, no shift). ⚠️ the key's drawing is hard to read. A methyl shift would only swap one 3° cation for another 3° one, so it doesn't happen |
| c | 4a-methyl-octalin + H₂/Pd → H's **anti to the angular CH₃** (trans-fused decalin) | syn addition to the less hindered face | ⏳ S2. ⚠️ the 3D check can't tell these faces apart, so the app will show the course rule, labelled as a rule |
| d | (E)-1-phenylpropene + HBr → **(1-bromopropyl)benzene**, racemic | H⁺ to C2 → **benzylic** cation (resonance with the ring) | ✅ |
| e | 2-methylpent-1-ene + HBr/peroxides, heat → **1-bromo-2-methylpentane**, racemic | radical: Br• adds to CH₂ → 3° radical | ✅ type “HBr, ROOR, heat” |
| f | methylcyclohexane + Br₂/light → **1-bromo-1-methylcyclohexane** | Br• takes the only 3° H | ⏳ S3 |
| g | 3-ethylpent-2-ene + H₂SO₄ (aq) → **3-ethylpentan-3-ol** | H⁺ to the CH → 3° cation → water → −H⁺ | ✅ type “H2SO4 (aq)” |
| h | cyclohexene + Br₂ (no light) → **trans-1,2-dibromocyclohexane**, racemic | bromonium, back-side Br⁻ | ⏳ S2 |
| i | 6-tBu-1-methylcyclohexene (tBu wedged) + BH₃; H₂O₂/OH⁻ → **3-tert-butyl-2-methylcyclohexan-1-ol**: (1R,2R,3R) from the (6S) alkene | B on the less substituted C (anti-Markovnikov), syn, from the face away from tBu. So OH and the new H are both anti to tBu, and the CH₃ is pushed **cis** to tBu | ⏳ S2. 3D ✅ (1.34×, 8/8) |
| j | 3-iPr-1-methylcyclopentene (iPr wedged) + Br₂/H₂O → **2-bromo-1-methyl-3-(propan-2-yl)cyclopentan-1-ol**: (1S,2S,3S) from the (3S) alkene | Br⁺ forms anti to iPr; water attacks the 3° C from the iPr face. So Br is trans to iPr and OH is cis to it | ⏳ S2. 3D ✅ (1.57×, 8/8) |
| k | (Z)-pent-2-ene + PhCO₃H → **cis-2-ethyl-3-methyloxirane**, racemic | concerted, syn: cis stays cis | ⏳ S2 (name offline ⏳ P1‑10) |
| l | 1-methylcyclohexene + O₃; DMS → **6-oxoheptanal** | ring opens: C1 becomes the ketone, C2 the aldehyde | ✅ type “1) O3 2) DMS” (the “cut and number” aid ⏳ S4) |
| m | α-pinene + H₂/Ni → **cis-pinane** (2,6,6-trimethylbicyclo[3.1.1]heptane) | H₂ adds from the face away from the CMe₂ bridge, so the CH₃ ends up on the bridge's side | ⏳ S2. 3D ✅ (1.7×) |
| n | 2,3-dimethylpentan-3-ol: H₂SO₄/Δ, then Br₂ → **2,3-dibromo-2,3-dimethylpentane** | E1 → tetrasubstituted alkene ✅, then anti addition (one stereocentre → racemic) | step 1 ✅, step 2 ⏳ S2 |
| o | methylcyclopentane: Br₂/hν → NaOEt → Cl₂/H₂O → **trans-2-chloro-1-methylcyclopentan-1-ol**, racemic | 3° bromide → E2 (Zaitsev) → chloronium, water on the 3° C | step 2 ✅, steps 1 and 3 ⏳ S3/S2 |
| p | cyclohexane: Cl₂/hν → NaOEt → O₃; DMS → **hexanedial** | one kind of H, so Cl₂'s poor selectivity doesn't matter here | steps 2 and 3 ✅, step 1 ⏳ S3 (test step 3 from cyclohexene with “O3 then DMS”) |
| q | 1-isopropylcyclohexene: BH₃; H₂O₂/HO⁻ → TsCl/py → NaOEt → **3-isopropylcyclohexene** (non-Zaitsev) | hydroboration gives **trans**-2-isopropylcyclohexanol; TsCl keeps that configuration; E2 needs OTs axial, which puts iPr axial too, so C2 has no axial H. The H must come from C6 | steps 2–3 ✅ (the trans-diaxial check gives exactly the key's alkene); step 1 ⏳ S2 |

**How to see the faces (2a, 2i, 2j, 2m) today:** draw the starting alkene, open **3D**, and turn it so you look at the flat C=C edge-on. The big group (tBu, iPr, CMe₂) sticks out on one side; the reagent comes in from the other.

### Q3 Reagents (key)
- **a.** 1-methylcyclopentene → 1-bromo-1-methylcyclopentane: **HBr** (Markovnikov).
- **b.** 2-ethylbut-1-ene → pentan-3-one: **1) O₃ 2) DMS (or Zn)**. The CH₂ end leaves as formaldehyde.
- **c.** 2-methylpent-2-ene → 3-bromo-2-methylpentane: **HBr, ROOR** (Br on the less substituted C).
- **d.** (E)-pent-2-ene → 2,3-dibromopentane: **Br₂**. If asked for stereo: anti on E gives (2R,3S) + enantiomer.
- **e.** 1-methylcyclohexene → trans-2-methylcyclohexanol: **1) BH₃·THF 2) H₂O₂/OH⁻** (syn H and OH, so CH₃ and OH end up trans).
- **f.** (Z)-pent-2-ene → cis epoxide: **PhCO₃H** (any peroxy acid, e.g. mCPBA).
- **g.** 1-methylcyclopentene → trans-2-bromo-1-methylcyclopentanol: **Br₂, H₂O**.
- **App:** a–c ✅ (type “HBr”, “1) O3 2) DMS”, “HBr, ROOR”); d–g ⏳ S2: today they say “this addition isn’t built yet” and still show the kind of addition. Once those land, draw the start, type the reagent and compare. After S5, *Plan: first → second* will find these by itself.

### Q4 Reaction map (key: I, F, C, G, A; A, C; the alcohol → 1,2-dimethylcyclopentene arrow left blank)
- **Top route:** 2,3-dimethylcyclopentanol → **I** (TsCl/py) → OTs → **F** (NaOEt) → **1,5-dimethylcyclopentene**. Zaitsev, with no cation, so no shift. ✅ App.
- **Bottom route:** alcohol → 1,2-dimethylcyclopentene. That needs a cation and a **hydride shift** to the 3° C, so it is **D (H₂SO₄/heat)**. ✅ App gives exactly that. ⚠️ The key has no letter here; confirm D.
- **From 1,5-dimethylcyclopentene:**
  - **C** (Br₂/CH₂Cl₂) → the dibromide, with Br⁺ anti to the C5 CH₃;
  - **G** (HBr/ROOR) → 1-bromo-2,3-dimethylcyclopentane (Br on the CH end);
  - **A** (HBr) → 1-bromo-1,2-dimethylcyclopentane (Br on the 3° C).
- **From 1,2-dimethylcyclopentene:** **A** (HBr) → the same 3° bromide; **C** → trans-1,2-dibromo-1,2-dimethylcyclopentane.
- **Tip:** "most efficient" means one step per arrow and no rearrangement you don't want. Ask yourself: do I want a cation (acid) or not (TsCl then base)?
- **App:** steps from the alcohol ✅; **A** (HBr) and **G** (HBr/ROOR) ✅ (the bromides form as a mixture of stereoisomers, shown without wedges); **C** (Br₂) ⏳ S2.

### Q5 Road map with yields (HCl 87 %; then KOtBu: 60 / 25 / 15 %)
- **Step 1:** 1,6-dimethylcyclohexene + HCl → **1-chloro-1,2-dimethylcyclohexane** (Markovnikov, 3° C). Both diastereomers form, because the cation is flat.
- **Step 2, key:** 60 % **1,2-dimethylcyclohexene** (tetrasubstituted), 25 % **1,6-dimethylcyclohexene**, 15 % **1-methyl-2-methylidenecyclohexane** (exocyclic).
- ⚠️ **Check with your instructor:**
  - KOtBu is a **bulky base**, and the usual rule (Ch 7) is that it gives mostly the **Hofmann** (least substituted, exocyclic) alkene. The app predicts that order today.
  - The key's order is what the app gives with **NaOEt**.
  - Extra subtlety the app shows: in one of the two chloride diastereomers, C2 has no H anti to the axial Cl, so that diastereomer can't make the tetrasubstituted alkene at all.
- **How to "take yields into account":** the biggest yield goes with the most favoured product under your course's rule. Never invent percentages; match the given ones to the order.
- **App:** step 1 ✅ (1-chloro-1,2-dimethylcyclohexane, both diastereomers: “mixture”); step 2 ✅ (ranks the three).

### Q6–8 Pick all that apply (key: Q6 A, D, F; Q7 B, C; Q8 B, C, F)
| Option | Q6 Markovnikov? | Q7 anti-Markovnikov? | Why |
|---|---|---|---|
| 6/7 A: 3,3-dimethylbut-1-ene, H₂SO₄ (cat), 0 °C | ✔ | | cation (it even methyl-shifts) |
| 6/7 B: BH₃; H₂O₂/OH⁻ | | ✔ | B to the less substituted C |
| 6/7 C: HBr, peroxides, heat | | ✔ | radical |
| 6/7 D: methylenecyclopentane + HI | ✔ | | 3° cation; HI has no radical path |
| 6/7 E: O₃; Zn/HOAc | | | cleavage: neither |
| 6/7 F: conc. H₂SO₄ then H₂O, heat | ✔ | | cation → OH on the 3° C |

| Q8 option | Stereospecific? | Why |
|---|---|---|
| A: HBr, peroxides | no | radical: both faces |
| B: (E)-pent-2-ene + peracid | ✔ | concerted syn: trans → trans epoxide |
| C: 1-methylcyclohexene + Br₂/H₂O | ✔ | bridged ion: anti |
| D: HCl | no | flat cation |
| E: Br₂/light on an alkane | no | radical substitution |
| F: BH₃·THF; H₂O₂/OH⁻ | ✔ | concerted syn |

- **App:** ✅ every addition card says *Intermediate*, *Regiochemistry* and *Stereospecific?* (Q6/Q7 options A–F, also for B and Q8's S2 reagents, which aren't built yet but are classified). Products for Q8 B, C, F ⏳ S2. ⏳ S5 *Classify* checks a whole list at once.

### Q9 Which mechanism for Cl₂/H₂O on 1-methylcyclohex-1-ene? (key: E)
- **Look for three things:**
  1. The π bond attacks Cl **while** Cl–Cl breaks, and a lone pair of Cl closes the three-membered **chloronium** ion. E is the only one whose first step shows both arrows.
  2. **Water attacks the more substituted carbon** (C1, with the CH₃), from the face opposite the Cl⁺.
  3. The product therefore has OH on C1 and Cl on C2, **trans**.
- **Wrong answers:**
  - A: no ring-closing arrow.
  - B, C, D, F: one arrow from the wrong atom, or water on the wrong carbon or the wrong face.
- **App:** ⏳ S4 `halohydrin` mechanism, with the quiz "Which carbon does water attack?".

### Q10 Methylcyclohexane → trans-2-bromo-1-methylcyclohexanol (key: Br₂/hν; NaOEt/EtOH; Br₂/H₂O)
- **Work backwards:**
  - A trans bromohydrin comes from **Br₂/H₂O** on an alkene, with OH on the 3° C, so the alkene is **1-methylcyclohexene**.
  - That comes from E2 of **1-bromo-1-methylcyclohexane** with a small base (Zaitsev).
  - That comes from **Br₂/hν**, which picks the 3° H.
- Note: the question says "cyclohexane" but draws methylcyclohexane ⚠️.
- **App:** step 2 ✅; steps 1 and 3 ⏳ S3/S2; the whole route by itself ⏳ S5 (forward planner).

### Q11 2,2-Dimethylcyclopentan-1-ol → heptane-2,6-dione (key: H₂SO₄ (cat)/Δ; O₃, DMS)
- **Work backwards:** two C=O groups 4 carbons apart in a 7-carbon chain come from opening a **ring** C=O pair, so the alkene is **1,2-dimethylcyclopentene**.
- That alkene comes from the alcohol by E1 with a **methyl shift** (2° → 3° cation): Ch 7 Q9l/Q13a.
- **App:** step 1 ✅ (the methyl-shift E1); step 2 ✅ (type “1) H2SO4, heat 2) O3 then DMS”); the whole route by itself ⏳ S5.

---

## Part 3: Why addition reactions and radicals matter
- **Making things from alkenes.** Ch 7 made C=C bonds; Ch 8 turns them into alcohols, halides, epoxides, diols and carbonyls. Most syntheses (Q10, Q11) are "make an alkene, then add to it".
- **Drug metabolism (Q1).** CYP enzymes epoxidise alkenes, and epoxide hydrolase opens them. Some epoxides are toxic or cancer-causing (e.g. from benzo[a]pyrene in smoke) precisely because they are good SN2 electrophiles for DNA.
- **Hydrogenation in industry:** margarine (vegetable oils + H₂/Ni) and the hydrogenation step in many drug syntheses. Facial selectivity (2c, 2m) decides which stereoisomer you get.
- **Radicals everywhere:** polymerisation (polyethylene and PVC are radical chain reactions), rancid fats (oxygen radicals at allylic C–H), the ozone layer (Cl• from CFCs breaks O₃ in a chain), and the antioxidants vitamin E and BHT, which stop radical chains.
- **Ozonolysis** was historically how chemists found *where* a C=C was: cut it and identify the pieces.

## Part 4: Study plan for this chapter
1. **Day 1: regiochemistry.** Make a three-column table (cation / bridged / radical or concerted) and put every reagent from Q3, Q4 and Q6–7 in it. Redo Q6–7 from the table.
2. **Day 2: stereochemistry.** Syn vs anti, racemic vs one isomer: redo 2h, 2k, Q3d–g and Q8. For each, say "syn/anti/neither" before you draw.
3. **Day 3: faces.** 2a, 2c, 2i, 2j, 2m: in the **3D** view, find the big group, then draw the reagent arriving from the other side. Then Q9 (find the arrow that closes the ring).
4. **Day 4: radicals.** Write initiation, two propagation steps and one termination step for 2e and 2f with fishhooks. Explain in one sentence why Br₂ is selective.
5. **Day 5: synthesis.** Q4, Q10, Q11, 2n–q. Work backwards and say why each reagent (not another one) is needed.
6. **Mistakes list:** write down each rule you missed, and redo those problems two days later.
