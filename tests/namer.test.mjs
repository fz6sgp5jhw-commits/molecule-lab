import * as OCL from '../openchemlib.js';
import { nameMolecule } from '../namer.js';
OCL.Resources.registerFromNodejs(new URL('../resources.json', import.meta.url).pathname);

// [SMILES, expected name or [accepted names]]
const cases = [
  // the user's structure
  ['ClC1CCC(C(C)CCC)CCCC1', '1-chloro-4-(pentan-2-yl)cyclooctane'],
  // alkanes and branching
  ['C', 'methane'], ['CC', 'ethane'], ['CCC', 'propane'], ['CCCCCC', 'hexane'],
  ['CC(C)CC', '2-methylbutane'], ['CC(C)(C)C', '2,2-dimethylpropane'],
  ['CCC(CC)C(C)CCC', '3-ethyl-4-methylheptane'],
  ['CCCC(C)C(CC)CC', '3-ethyl-4-methylheptane'],
  ['CC(C)C(C)(C)CC(C)C', '2,3,3,5-tetramethylhexane'],
  ['CCC(C)C(CC)CCC', '4-ethyl-3-methylheptane'],
  ['CCCCC(C(C)C)CCC', '4-(propan-2-yl)octane'],
  ['CCCCC(CC(C)C)CCCC', '5-(2-methylpropyl)nonane'],
  ['CCCCC(C(C)(C)C)CCCC', '5-tert-butylnonane'],
  ['CCC(C)C(CC)C(C)CC', '4-ethyl-3,5-dimethylheptane'],
  // halides, nitro
  ['CCl', 'chloromethane'], ['ClCCl', 'dichloromethane'], ['CCCl', 'chloroethane'], ['ClCCCl', '1,2-dichloroethane'],
  ['CC(Cl)Cl', '1,1-dichloroethane'], ['FC(Cl)Br', 'bromochlorofluoromethane'],
  ['CC(Br)CC(C)C', '2-bromo-4-methylpentane'], ['CCC[N+](=O)[O-]', '1-nitropropane'],
  ['CC(Cl)C(C)Br', '2-bromo-3-chlorobutane'],
  // alkenes / alkynes
  ['C=C', 'ethene'], ['C#C', 'ethyne'], ['C=CC', ['prop-1-ene', 'propene']], ['CC=CC', 'but-2-ene'], ['C=CC=C', 'buta-1,3-diene'],
  ['C=CCC#C', 'pent-1-en-4-yne'], ['CC(C)=CC', '2-methylbut-2-ene'], ['C/C=C/C', ['(2E)-but-2-ene', '(E)-but-2-ene']], ['C/C=C\\C', ['(2Z)-but-2-ene', '(Z)-but-2-ene']],
  ['CC/C=C/C(C)C', ['(3E)-2-methylhex-3-ene', '(E)-2-methylhex-3-ene']], ['ClC=C', 'chloroethene'],
  // rings
  ['C1CCCCC1', 'cyclohexane'], ['CC1CCCCC1', 'methylcyclohexane'], ['CC1CCCC(C)C1', '1,3-dimethylcyclohexane'],
  ['CCC1CCCC1C', '1-ethyl-2-methylcyclopentane'], ['C1CC=CCC1', 'cyclohexene'], ['ClC1CCCC=C1', ['3-chlorocyclohexene', '3-chlorocyclohex-1-ene']],
  ['CC1=CCCCC1', ['1-methylcyclohexene', '1-methylcyclohex-1-ene']], ['C1=CCC=CC1', 'cyclohexa-1,4-diene'],
  ['CCCCCCC1CC1', 'hexylcyclopropane'], ['C1CCC(CC1)C1CCCCC1', 'cyclohexylcyclohexane'],
  ['C[C@H]1CC[C@@H](C)CC1', ['cis-1,4-dimethylcyclohexane', 'trans-1,4-dimethylcyclohexane']],
  // benzene
  ['c1ccccc1', 'benzene'], ['Cc1ccccc1', ['methylbenzene', 'toluene']], ['Cc1ccc(C)cc1', '1,4-dimethylbenzene'],
  ['CCc1ccccc1Cl', '1-chloro-2-ethylbenzene'], ['Clc1cccc(Br)c1', '1-bromo-3-chlorobenzene'], ['C(c1ccccc1)c1ccccc1', 'benzylbenzene'],
  ['C1CCC(CC1)c1ccccc1', 'cyclohexylbenzene'], ['CCCCCCc1ccccc1', 'hexylbenzene'], ['O=[N+]([O-])c1ccc(C)cc1', '1-methyl-4-nitrobenzene'],
  ['CC(C)c1ccccc1', '(propan-2-yl)benzene'], ['C=Cc1ccccc1', 'ethenylbenzene'],
  // alcohols, thiols, ethers
  ['CO', 'methanol'], ['CCO', 'ethanol'], ['CCCO', 'propan-1-ol'], ['CC(O)C', 'propan-2-ol'], ['CC(C)CCO', '3-methylbutan-1-ol'],
  ['OCCO', 'ethane-1,2-diol'], ['OCC(O)CO', 'propane-1,2,3-triol'], ['ClCCO', ['2-chloroethanol', '2-chloroethan-1-ol']],
  ['CC(O)C=C', 'but-3-en-2-ol'], ['OC1CCCCC1', 'cyclohexanol'], ['CC1CCCCC1O', '2-methylcyclohexan-1-ol'], ['OC1C=CCCC1', 'cyclohex-2-en-1-ol'],
  ['Oc1ccccc1', 'phenol'], ['Cc1ccc(O)cc1', '4-methylphenol'], ['Oc1ccc(O)cc1', 'benzene-1,4-diol'], ['CCS', 'ethanethiol'],
  ['OCCc1ccccc1', ['2-phenylethanol', '2-phenylethan-1-ol']],
  ['CCOCC', 'ethoxyethane'], ['COc1ccccc1', 'methoxybenzene'], ['CC(C)OC', '2-methoxypropane'], ['CCOCCO', ['2-ethoxyethanol', '2-ethoxyethan-1-ol']],
  ['CSC', '(methylsulfanyl)methane'], ['CCCCCOC', '1-methoxypentane'], ['CC(C)(C)OC', '2-methoxy-2-methylpropane'],
  ['OCC1CCCCC1', 'cyclohexylmethanol'], ['C[C@H](O)CC', '(2S)-butan-2-ol'], ['C[C@@H](O)CC', '(2R)-butan-2-ol'],
  ['OC(C)C(C)O', 'butane-2,3-diol'], ['C[C@@H](Br)[C@H](C)Br', '(2R,3S)-2,3-dibromobutane'], ['C[C@@H](Br)[C@@H](C)Br', ['(2R,3R)-2,3-dibromobutane', '(2S,3S)-2,3-dibromobutane']],
  // amines
  ['CN', 'methanamine'], ['CCN', 'ethanamine'], ['CC(N)C', 'propan-2-amine'], ['CNC', 'N-methylmethanamine'], ['CN(C)C', 'N,N-dimethylmethanamine'],
  ['CCNC', 'N-methylethanamine'], ['CCN(C)CCC', 'N-ethyl-N-methylpropan-1-amine'], ['Nc1ccccc1', 'aniline'], ['CNc1ccccc1', 'N-methylaniline'],
  ['NCCO', ['2-aminoethanol', '2-aminoethan-1-ol']], ['NC1CCCCC1', 'cyclohexanamine'],
  // carbonyls
  ['C=O', 'formaldehyde'], ['CC=O', 'acetaldehyde'], ['CCC=O', 'propanal'], ['CC(C)CC=O', '3-methylbutanal'], ['O=CCCC=O', 'butanedial'],
  ['O=Cc1ccccc1', 'benzaldehyde'], ['O=CC1CCCCC1', 'cyclohexanecarbaldehyde'], ['CC=CC=O', 'but-2-enal'],
  ['CC(C)=O', 'propan-2-one'], ['CCC(C)=O', 'butan-2-one'], ['CC(=O)CC(C)=O', 'pentane-2,4-dione'], ['O=C1CCCCC1', 'cyclohexanone'],
  ['O=C1C=CCCC1', 'cyclohex-2-en-1-one'], ['CC(=O)c1ccccc1', ['1-phenylethanone', '1-phenylethan-1-one']], ['CC(C)C(=O)C', '3-methylbutan-2-one'],
  ['C=CC(C)=O', 'but-3-en-2-one'], ['CC(=O)CCO', '4-hydroxybutan-2-one'], ['O=CCC(C)=O', '3-oxobutanal'],
  // acids and derivatives
  ['OC=O', 'formic acid'], ['CC(O)=O', 'acetic acid'], ['CCC(O)=O', 'propanoic acid'], ['CC(C)CC(O)=O', '3-methylbutanoic acid'],
  ['OC(=O)CCCCC(O)=O', 'hexanedioic acid'], ['OC(=O)c1ccccc1', 'benzoic acid'], ['OC(=O)c1ccc(Cl)cc1', '4-chlorobenzoic acid'],
  ['OC(=O)C1CCCCC1', 'cyclohexanecarboxylic acid'], ['ClCC(O)=O', ['2-chloroacetic acid', 'chloroacetic acid']],
  ['OC(=O)c1ccccc1C(O)=O', 'benzene-1,2-dicarboxylic acid'], ['CC(O)CC(O)=O', '3-hydroxybutanoic acid'],
  ['OC(=O)CCC=O', '4-oxobutanoic acid'], ['C/C=C/C(O)=O', ['(2E)-but-2-enoic acid', '(E)-but-2-enoic acid']], ['CC(=O)Oc1ccccc1C(O)=O', '2-(acetyloxy)benzoic acid'],
  ['OC(=O)c1ccc(C=O)cc1', '4-formylbenzoic acid'], ['OC(=O)Cc1ccc(C(O)=O)cc1', '4-(carboxymethyl)benzoic acid'],
  ['CCOC(C)=O', 'ethyl acetate'], ['COC(=O)c1ccccc1', 'methyl benzoate'], ['CCCC(=O)OC', 'methyl butanoate'], ['CC(C)OC(=O)CC', 'propan-2-yl propanoate'],
  ['CC(C)(C)OC(C)=O', 'tert-butyl acetate'], ['COC(=O)C1CCCCC1', 'methyl cyclohexanecarboxylate'], ['O=COC', 'methyl formate'],
  ['CC(N)=O', 'acetamide'], ['CCC(N)=O', 'propanamide'], ['NC(=O)c1ccccc1', 'benzamide'], ['CNC(=O)CC', 'N-methylpropanamide'],
  ['CC#N', 'acetonitrile'], ['CCC#N', 'propanenitrile'], ['N#Cc1ccccc1', 'benzonitrile'], ['N#CC1CCCCC1', 'cyclohexanecarbonitrile'],
  ['OCCC#N', '3-hydroxypropanenitrile'], ['COC(=O)c1ccc(C(O)=O)cc1', '4-(methoxycarbonyl)benzoic acid'], ['NC(=O)c1ccc(C#N)cc1', '4-cyanobenzamide'],
  ['CC(=O)Nc1ccc(O)cc1', 'N-(4-hydroxyphenyl)acetamide'],
  ['C1CCCCCCC1', 'cyclooctane'], ['CC1CCCCCCCCCCC1', 'methylcyclododecane'], ['ClC1CCCCCC=C1', ['3-chlorocyclooctene', '3-chlorocyclooct-1-ene']],
  ['CC1CC1', 'methylcyclopropane'], ['C1CCC(CC1)CC1CCCC1', '(cyclopentylmethyl)cyclohexane'], ['OC1CC(C)CCC1', '3-methylcyclohexan-1-ol'],
  ['CC#CC(C)C#CCCC=CC=O', '8-methylundec-2-ene-6,9-diynal'], ['C=CC=CC#C', 'hexa-1,3-dien-5-yne'], ['C#CCC=C', 'pent-1-en-4-yne'],
  ['C#CC#C', 'buta-1,3-diyne'], ['C=CC#CC#C', 'hex-1-ene-3,5-diyne'], ['CC=CC=CC(O)=O', 'hexa-2,4-dienoic acid'],
  ['Cc1cc(C(C)(C)C)c(O)c(c1)C(C)(C)C', '2,6-di-tert-butyl-4-methylphenol'], ['CNCC(O)c1ccc(O)c(O)c1', '4-[1-hydroxy-2-(methylamino)ethyl]benzene-1,2-diol'],
  ['CC/C(C)=C/C=O', ['(2E)-3-methylpent-2-enal', '(E)-3-methylpent-2-enal']], ['COc1cc(C=O)ccc1O', '4-hydroxy-3-methoxybenzaldehyde'],
  ['N[C@@H](Cc1ccccc1)C(O)=O', '(2S)-2-amino-3-phenylpropanoic acid'], ['CC(N)Cc1ccccc1', '1-phenylpropan-2-amine'],
  ['COCCOCCOC', '1-methoxy-2-(2-methoxyethoxy)ethane'], ['O=C(c1ccccc1)c1ccccc1', 'diphenylmethanone'],
  // substituents of many kinds
  ['C=CCO', 'prop-2-en-1-ol'], ['C=CCCl', '3-chloroprop-1-ene'], ['CC(C)Cc1ccccc1', '(2-methylpropyl)benzene'],
  ['OC(=O)C(C)c1ccc(CC(C)C)cc1', '2-[4-(2-methylpropyl)phenyl]propanoic acid'],
  ['CC(C)(C)c1ccc(O)cc1', '4-tert-butylphenol'], ['Clc1ccc(CCl)cc1', '1-chloro-4-(chloromethyl)benzene'],
  ['CC(=O)c1ccc(C(O)=O)cc1', '4-acetylbenzoic acid'], ['CC(Cl)c1ccccc1', '(1-chloroethyl)benzene'],
  ['OC1CCC(CC1)C(C)(C)C', '4-tert-butylcyclohexan-1-ol'], ['CCCC(C)C1CCC(Cl)CCCC1', '1-chloro-4-(pentan-2-yl)cyclooctane'],
  ['C[C@H](CCC)C1CCC(Cl)CCCC1', '1-chloro-4-[(2R)-pentan-2-yl]cyclooctane'],
  ['CC(C)[C@@H]1CC[C@@H](C)C[C@H]1O', '(1R,2S,5R)-5-methyl-2-(propan-2-yl)cyclohexan-1-ol'],
];
// structures the namer should refuse (honestly)
const refuse = ['C1CCC2(CC1)CCCC2', 'c1ccc2ccccc2c1', 'C1CCOC1', 'c1ccncc1', 'CC(=O)Cl', 'CC[N+](C)(C)C', 'CC(=O)OC(C)=O', 'CS(C)=O', 'CC.O', 'C1CC2CCC1C2'];

let pass = 0, failN = 0;
for (const [smi, exp] of cases){
  const ok = Array.isArray(exp) ? exp : [exp];
  const r = nameMolecule(OCL, OCL.Molecule.fromSmiles(smi));
  if (r.name && ok.includes(r.name)) pass++;
  else { failN++; console.log(`FAIL ${smi}\n   got:  ${r.name || 'ERROR ' + r.error}\n   want: ${ok.join(' | ')}`); }
}
for (const smi of refuse){
  const r = nameMolecule(OCL, OCL.Molecule.fromSmiles(smi));
  if (r.error) pass++; else { failN++; console.log(`FAIL should refuse ${smi}: got ${r.name}`); }
}
console.log(`\n${pass} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
