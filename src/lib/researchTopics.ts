import {
  ResearchEvidenceScope,
  ResearchTopic,
  ResearchTopicGroup,
} from './types';

export interface ResearchDiscoveryTopic {
  key: string;
  group: ResearchTopicGroup;
  label: string;
  terms: string[];
  /** Curated MeSH alternatives for the primary title/abstract terms. */
  primaryMeshTerms?: string[];
  /** Additional source-side clause that must also match. */
  contextTerms?: string[];
  /** Curated MeSH alternatives for the context title/abstract terms. */
  contextMeshTerms?: string[];
  /** Each group is ANDed; terms inside a group are ORed as PubMed MeSH filters. */
  requiredMeshGroups?: string[][];
  /** PubMed MeSH headings excluded at source for known off-topic result classes. */
  excludedMeshTerms?: string[];
  /** Older foundational work is still useful for these topics. */
  fromYear?: number;
  /** Rare conditions may legitimately be represented by case reports. */
  includeCaseReports?: boolean;
  /** Direct canine evidence or deliberately quarantined mechanistic context. */
  evidenceScope: ResearchEvidenceScope;
}

function topic(
  group: ResearchTopicGroup,
  key: string,
  label: string,
  terms: string[],
  options: Partial<Pick<
    ResearchDiscoveryTopic,
    | 'fromYear'
    | 'includeCaseReports'
    | 'contextTerms'
    | 'primaryMeshTerms'
    | 'contextMeshTerms'
    | 'requiredMeshGroups'
    | 'excludedMeshTerms'
    | 'evidenceScope'
  >> = {},
): ResearchDiscoveryTopic {
  return {
    group,
    key,
    label,
    terms,
    ...options,
    evidenceScope: options.evidenceScope ?? 'canine_direct',
  };
}

/**
 * Owner-defined research domain. Each entry becomes its own source-filtered
 * query, so Gate 1 can expose false positives at the cheapest point.
 */
export const RESEARCH_DISCOVERY_TOPICS: ResearchDiscoveryTopic[] = [
  topic('A', 'macronutrient-requirements', 'Canine macronutrient requirements', [
    'macronutrient requirements',
    'nutrient requirements',
  ]),
  topic('A', 'fediaf-aafco-guidelines', 'FEDIAF and AAFCO nutrient guidelines', [
    'FEDIAF nutrient guidelines',
    'AAFCO nutrient profiles',
  ]),
  topic('A', 'protein-quality-digestibility', 'Protein quality and digestibility', [
    'protein quality',
    'protein digestibility',
  ]),
  topic('A', 'amino-acids', 'Taurine, methionine, cysteine and tryptophan', [
    'taurine',
    'methionine',
    'cysteine',
    'tryptophan',
  ]),
  topic('A', 'fatty-acids', 'Omega-3, EPA/DHA, linoleic acid and fatty-acid ratios', [
    'omega-3',
    'EPA DHA',
    'linoleic acid',
    'omega-6 omega-3 ratio',
  ]),
  topic('A', 'dietary-fibre-types', 'Soluble, insoluble and fermentable dietary fibre', [
    'soluble fibre',
    'insoluble fibre',
    'fermentable fibre',
  ]),
  topic('A', 'energy-requirements', 'Metabolisable energy and energy requirements', [
    'metabolisable energy',
    'metabolizable energy',
    'energy requirement',
  ], { fromYear: 2000 }),
  topic('A', 'life-stage-nutrition', 'Growth, maintenance and senior life-stage nutrition', [
    'growth',
    'adult',
    'senior',
    'geriatric',
  ], {
    contextTerms: ['nutrition', 'diet', 'feeding'],
  }),
  topic('A', 'large-breed-growth-calcium-phosphorus', 'Large-breed growth and calcium:phosphorus ratio', [
    'large breed growth',
    'giant breed growth',
    'calcium phosphorus ratio',
  ], { fromYear: 2000 }),
  topic('A', 'micronutrients', 'Zinc, copper, iodine, selenium, vitamin D and vitamin E', [
    'zinc',
    'copper',
    'iodine',
    'selenium',
    'vitamin D',
    'vitamin E',
  ]),
  topic('A', 'obesity-weight-management', 'Body condition score, obesity and weight management', [
    'body condition score',
    'obesity',
    'weight management',
  ]),
  topic('A', 'feeding-frequency-timing', 'Feeding frequency and timing', [
    'feeding frequency',
    'meal frequency',
    'feeding time',
  ]),
  topic('A', 'raw-diets', 'Raw meat-based diet adequacy and pathogen risk', [
    'raw meat based diet',
    'raw diet pathogen',
    'raw diet nutritional adequacy',
  ]),
  topic('A', 'home-prepared-diets', 'Home-prepared diet adequacy', [
    'home prepared diet',
    'homemade diet adequacy',
  ]),
  topic('A', 'grain-free-dcm', 'Grain-free diets and diet-associated dilated cardiomyopathy', [
    'grain',
    'pulse',
    'legume',
    'non-traditional diet',
  ], { contextTerms: ['dilated cardiomyopathy', 'cardiomyopathy'] }),
  topic('A', 'processing-nutrient-availability', 'Extrusion and processing effects on nutrient availability', [
    'extrusion',
    'food processing',
    'thermal processing',
  ], {
    contextTerms: ['digestibility', 'nutrient availability', 'amino acid availability'],
    primaryMeshTerms: ['Food Handling'],
    contextMeshTerms: ['Digestion'],
  }),
  topic('A', 'ultra-processed-food', 'Ultra-processed versus minimally processed pet food', [
    'ultra-processed',
    'minimally processed',
    'fresh diet',
  ], {
    contextTerms: ['pet food', 'dog food', 'canine diet'],
    contextMeshTerms: ['Animal Feed'],
  }),
  topic('A', 'palatability', 'Canine food palatability', ['food palatability', 'diet palatability']),

  topic('B', 'core-microbiome', 'Canine gut microbiome composition and core taxa', [
    'gut microbiome composition',
    'core microbiome',
    'core taxa',
  ]),
  topic('B', 'dysbiosis-index', 'Canine dysbiosis index', ['dysbiosis index']),
  topic('B', 'diet-microbiome', 'Diet effects on microbiome composition', [
    'diet',
    'dietary',
    'animal feed',
  ], {
    contextTerms: ['gut microbiome', 'gut microbiota', 'microbiome composition'],
    contextMeshTerms: ['Gastrointestinal Microbiome'],
  }),
  topic('B', 'scfa-butyrate-barrier', 'Short-chain fatty acids, butyrate and gut barrier function', [
    'short-chain fatty acids',
    'butyrate gut barrier',
  ]),
  topic('B', 'prebiotics', 'FOS, MOS, inulin, chicory and beet-pulp prebiotics', [
    'fructooligosaccharides',
    'mannan oligosaccharides',
    'inulin',
    'chicory',
    'beet pulp',
  ]),
  topic('B', 'probiotics-synbiotics', 'Probiotics and synbiotics', ['probiotic', 'synbiotic']),
  topic('B', 'fmt', 'Faecal microbiota transplantation', [
    'faecal microbiota transplantation',
    'fecal microbiota transplantation',
  ]),
  topic('B', 'gut-brain-axis', 'Gut–brain axis and canine behaviour', [
    'gut brain axis',
    'microbiome brain axis',
    'gastrointestinal microbiome',
  ], {
    contextTerms: ['behaviour', 'behavior', 'anxiety'],
    primaryMeshTerms: ['Gastrointestinal Microbiome'],
    contextMeshTerms: ['Behavior, Animal', 'Anxiety'],
  }),
  topic('B', 'antibiotic-microbiome', 'Antibiotic effects on the canine microbiome', [
    'antibiotic',
    'antimicrobial',
    'metronidazole',
    'tylosin',
  ], {
    contextTerms: [
      'microbiome change',
      'microbiota change',
      'microbiome composition',
      'microbial diversity',
      'dysbiosis',
    ],
    requiredMeshGroups: [['Gastrointestinal Microbiome']],
  }),
  topic('B', 'microbiome-variation', 'Breed, age and geographic microbiome variation', [
    'breed',
    'age',
    'geographic',
    'geographical',
  ], {
    contextTerms: ['gut microbiome', 'gut microbiota', 'microbiome variation'],
    contextMeshTerms: ['Gastrointestinal Microbiome'],
  }),
  topic('B', 'commercial-microbiome-tests', 'Commercial canine microbiome test reproducibility and validity', [
    'microbiome test',
    'dysbiosis index',
    'microbiome assay',
  ], {
    contextTerms: ['reproducibility', 'repeatability', 'clinical validity', 'validation'],
    primaryMeshTerms: ['Gastrointestinal Microbiome'],
    contextMeshTerms: ['Reproducibility of Results'],
  }),
  topic('B', 'microbiome-methodology', 'Microbiome sampling and sequencing methodology', [
    '16S',
    'shotgun metagenomic',
    'microbiome sample',
    'fecal sample',
    'faecal sample',
  ], {
    contextTerms: ['sampling', 'sequencing', 'method', 'storage', 'reproducibility'],
    primaryMeshTerms: ['Gastrointestinal Microbiome'],
    contextMeshTerms: ['Sequence Analysis, DNA', 'Specimen Handling'],
  }),

  topic('C', 'cafrs', 'Cutaneous adverse food reaction', ['cutaneous adverse food reaction']),
  topic('C', 'allergy-vs-intolerance', 'Food allergy versus intolerance', [
    'food allergy intolerance',
    'adverse food reaction',
  ]),
  topic('C', 'elimination-trial', 'Elimination diet trial methodology and duration', [
    'elimination diet trial',
    'elimination diet duration',
  ]),
  topic('C', 'hydrolysed-diets', 'Hydrolysed protein diets', ['hydrolysed protein diet', 'hydrolyzed protein diet']),
  topic('C', 'novel-protein-diets', 'Novel protein diets', ['novel protein diet']),
  topic('C', 'reported-allergens', 'Commonly reported canine food allergens', [
    'food allergy',
    'food allergen',
    'adverse food reaction',
  ], {
    contextTerms: ['beef', 'dairy', 'chicken', 'wheat', 'lamb', 'egg', 'soy'],
    primaryMeshTerms: ['Food Hypersensitivity'],
    requiredMeshGroups: [['Dog Diseases']],
    excludedMeshTerms: ['Infant', 'Child'],
  }),
  topic('C', 'protein-cross-reactivity', 'Food protein cross-reactivity', [
    'cross-reactivity',
    'cross reactivity',
  ], {
    contextTerms: ['food allergy', 'food allergen', 'food hypersensitivity'],
    contextMeshTerms: ['Food Hypersensitivity'],
    requiredMeshGroups: [['Food Hypersensitivity'], ['Dog Diseases']],
  }),
  topic('C', 'serum-ige-igg-validity', 'Validity of serum IgE and IgG food-sensitivity testing', [
    'IgE',
    'IgG',
    'serology',
  ], {
    contextTerms: ['food allergy', 'food sensitivity', 'adverse food reaction'],
    primaryMeshTerms: ['Immunoglobulin E', 'Immunoglobulin G'],
    contextMeshTerms: ['Food Hypersensitivity'],
    requiredMeshGroups: [['Dog Diseases']],
  }),
  topic('C', 'saliva-hair-validity', 'Validity of saliva and hair sensitivity testing', [
    'saliva',
    'hair',
  ], {
    contextTerms: ['food sensitivity test', 'food allergy test', 'adverse food reaction'],
    contextMeshTerms: ['Food Hypersensitivity'],
    requiredMeshGroups: [['Dog Diseases']],
  }),
  topic('C', 'patch-testing', 'Patch testing for canine food reaction', [
    'patch test',
    'patch testing',
  ], {
    contextTerms: ['food allergy', 'food reaction', 'food hypersensitivity'],
    primaryMeshTerms: ['Patch Tests'],
    contextMeshTerms: ['Food Hypersensitivity'],
  }),
  topic('C', 'undeclared-ingredients', 'Undeclared and mislabelled ingredients in commercial and elimination diets', [
    'undeclared ingredient',
    'mislabelled ingredient',
    'mislabeled ingredient',
    'label discrepancy',
  ], {
    contextTerms: ['pet food', 'dog food', 'elimination diet'],
    primaryMeshTerms: ['Food Labeling'],
  }),
  topic('C', 'atopic-dermatitis-diet', 'Canine atopic dermatitis and diet', [
    'atopic dermatitis',
  ], {
    contextTerms: ['diet', 'food allergy', 'food reaction', 'nutrition'],
    primaryMeshTerms: ['Dermatitis, Atopic'],
    contextMeshTerms: ['Food Hypersensitivity', 'Diet'],
  }),
  topic('C', 'storage-mites', 'Storage mite contamination', [
    'storage mite',
    'Tyrophagus',
    'Acarus siro',
  ], {
    contextTerms: ['food', 'feed', 'diet', 'contamination'],
    contextMeshTerms: ['Food Contamination'],
  }),
  topic('C', 'provocation-rechallenge', 'Provocation and rechallenge protocols', [
    'provocation',
    'rechallenge',
    'challenge test',
  ], {
    contextTerms: ['food allergy', 'elimination diet', 'adverse food reaction'],
    contextMeshTerms: ['Food Hypersensitivity'],
  }),

  topic('D', 'chronic-enteropathy', 'Chronic enteropathy and food-responsive enteropathy', [
    'chronic enteropathy',
    'food-responsive enteropathy',
  ]),
  topic('D', 'ibd', 'Canine inflammatory bowel disease', ['inflammatory bowel disease']),
  topic('D', 'epi', 'Exocrine pancreatic insufficiency', ['exocrine pancreatic insufficiency']),
  topic('D', 'pancreatitis-fat', 'Acute and chronic pancreatitis and dietary fat', [
    'pancreatitis',
  ], {
    contextTerms: ['dietary fat', 'low fat diet', 'fat restriction', 'nutrition'],
    primaryMeshTerms: ['Pancreatitis'],
    contextMeshTerms: ['Dietary Fats', 'Diet Therapy'],
  }),
  topic('D', 'ckd', 'Chronic kidney disease protein and phosphorus restriction', [
    'chronic kidney disease',
    'chronic renal disease',
    'renal insufficiency',
  ], {
    contextTerms: ['protein restriction', 'phosphorus restriction', 'renal diet', 'diet therapy'],
    primaryMeshTerms: ['Renal Insufficiency, Chronic'],
    contextMeshTerms: ['Diet Therapy', 'Dietary Proteins', 'Phosphorus'],
  }),
  topic('D', 'urolithiasis', 'Struvite, calcium oxalate and urate urolithiasis', [
    'struvite',
    'calcium oxalate',
    'urate',
    'urolithiasis',
  ], {
    contextTerms: ['diet', 'nutrition', 'dissolution', 'prevention'],
    primaryMeshTerms: ['Urolithiasis'],
    contextMeshTerms: ['Diet Therapy'],
  }),
  topic('D', 'hepatic-copper', 'Hepatic disease and copper storage', [
    'copper storage',
    'copper-associated hepatopathy',
    'copper associated hepatopathy',
    'copper hepatopathy',
  ], {
    contextTerms: ['diet', 'nutrition', 'copper restriction', 'liver', 'hepatic'],
    primaryMeshTerms: ['Copper'],
    contextMeshTerms: ['Liver Diseases'],
  }),
  topic('D', 'diabetes-fibre', 'Diabetes mellitus and dietary fibre', [
    'diabetes mellitus',
  ], {
    contextTerms: ['dietary fibre', 'dietary fiber', 'high fibre diet', 'high fiber diet'],
    primaryMeshTerms: ['Diabetes Mellitus'],
    contextMeshTerms: ['Dietary Fiber'],
  }),
  topic('D', 'osteoarthritis', 'Osteoarthritis, omega-3 and green-lipped mussel', [
    'osteoarthritis',
    'degenerative joint disease',
  ], {
    contextTerms: ['omega-3', 'fish oil', 'green-lipped mussel', 'Perna canaliculus'],
    primaryMeshTerms: ['Osteoarthritis'],
    contextMeshTerms: ['Fatty Acids, Omega-3'],
  }),
  topic('D', 'cognitive-dysfunction', 'Canine cognitive dysfunction and diet', [
    'cognitive dysfunction',
    'cognitive decline',
    'cognitive aging',
  ], {
    contextTerms: ['diet', 'nutrition', 'medium chain triglyceride', 'antioxidant'],
    primaryMeshTerms: ['Cognitive Dysfunction'],
    contextMeshTerms: ['Diet Therapy'],
  }),
  topic('D', 'epilepsy', 'Epilepsy, MCT and ketogenic diets', [
    'epilepsy',
    'seizure',
  ], {
    contextTerms: ['medium chain triglyceride', 'MCT diet', 'ketogenic diet'],
    primaryMeshTerms: ['Epilepsy'],
    contextMeshTerms: ['Diet, Ketogenic', 'Triglycerides'],
  }),
  topic('D', 'gdv', 'Gastric dilatation-volvulus risk and feeding practice', [
    'gastric dilatation volvulus',
    'gastric dilatation-volvulus',
    'GDV',
  ], {
    contextTerms: ['feeding', 'diet', 'meal', 'risk factor'],
    contextMeshTerms: ['Feeding Behavior'],
  }),
  topic('D', 'large-bowel-diarrhoea', 'Fibre-responsive large-bowel diarrhoea and colitis', [
    'large bowel diarrhea',
    'large bowel diarrhoea',
    'colitis',
  ], {
    contextTerms: ['dietary fibre', 'dietary fiber', 'fibre responsive', 'fiber responsive'],
    primaryMeshTerms: ['Colitis'],
    contextMeshTerms: ['Dietary Fiber'],
  }),
  topic('D', 'anal-sac-fibre', 'Anal sac disease and fibre', [
    'anal sac',
    'anal gland',
  ], {
    contextTerms: ['dietary fibre', 'dietary fiber', 'fibre', 'fiber', 'diet'],
    contextMeshTerms: ['Dietary Fiber'],
  }),
  topic('D', 'zinc-dermatosis', 'Zinc-responsive dermatosis, skin and coat', [
    'zinc responsive dermatosis',
    'zinc skin coat',
  ], { includeCaseReports: true }),
  topic('D', 'dental-health', 'Dental health and diet', [
    'dental health',
    'periodontal disease',
    'dental calculus',
    'dental plaque',
  ], {
    contextTerms: ['diet', 'food', 'feed', 'chew'],
    contextMeshTerms: ['Diet'],
  }),
  topic('D', 'cancer-cachexia', 'Cancer cachexia and nutritional support', [
    'cancer cachexia',
    'neoplasm cachexia',
    'tumour cachexia',
    'tumor cachexia',
  ], {
    contextTerms: ['nutrition', 'nutritional support', 'diet', 'cachexia'],
    primaryMeshTerms: ['Cachexia'],
    contextMeshTerms: ['Nutritional Support', 'Neoplasms'],
    includeCaseReports: true,
  }),
  topic('D', 'veterinary-diets', 'Veterinary diet evidence base and label claims', [
    'therapeutic diet',
    'veterinary diet',
    'prescription diet',
  ], {
    contextTerms: ['evidence', 'efficacy', 'label claim', 'clinical trial'],
  }),

  topic('E', 'cobalamin-folate', 'Serum cobalamin and folate in chronic enteropathy', [
    'cobalamin',
    'vitamin B12',
    'folate',
  ], {
    contextTerms: ['chronic enteropathy', 'chronic diarrhea', 'chronic diarrhoea'],
    primaryMeshTerms: ['Vitamin B 12', 'Folic Acid'],
  }),
  topic('E', 'tli', 'Trypsin-like immunoreactivity for EPI', ['trypsin-like immunoreactivity']),
  topic('E', 'cpli', 'Canine pancreatic lipase immunoreactivity', ['pancreatic lipase immunoreactivity']),
  topic('E', 'faecal-markers', 'Faecal calprotectin and alpha-1 proteinase inhibitor', [
    'faecal calprotectin',
    'fecal calprotectin',
    'alpha-1 proteinase inhibitor',
  ]),
  topic('E', 'faecal-dysbiosis-index', 'Canine faecal dysbiosis index', ['faecal dysbiosis index', 'fecal dysbiosis index']),
  topic('E', 'serum-taurine', 'Serum taurine', ['serum taurine', 'plasma taurine']),
  topic('E', 'vitamin-d-status', 'Vitamin D status', ['vitamin D status', 'serum 25-hydroxyvitamin D']),
  topic('E', 'thyroid-diet', 'Thyroid function and dietary influences', [
    'thyroid function',
    'thyroxine',
    'hypothyroidism',
  ], {
    contextTerms: ['diet', 'nutrition', 'iodine', 'food'],
    primaryMeshTerms: ['Thyroid Function Tests', 'Hypothyroidism'],
    contextMeshTerms: ['Diet', 'Iodine'],
  }),
  topic('E', 'reference-intervals', 'Biochemistry and haematology reference intervals and dietary effects', [
    'reference interval',
    'reference range',
    'clinical chemistry',
    'hematology',
    'haematology',
  ], {
    contextTerms: ['diet', 'nutrition', 'feeding', 'food'],
  }),
  topic('E', 'allergen-ige-performance', 'Allergen-specific IgE serology diagnostic performance', [
    'allergen-specific IgE',
    'serum IgE',
    'IgE serology',
  ], {
    contextTerms: ['diagnostic accuracy', 'diagnostic performance', 'sensitivity', 'specificity'],
    primaryMeshTerms: ['Immunoglobulin E'],
    contextMeshTerms: ['Sensitivity and Specificity'],
    requiredMeshGroups: [['Food Hypersensitivity'], ['Dog Diseases']],
  }),
  topic('E', 'intervention-monitoring', 'Biochemical monitoring of dietary intervention response', [
    'biochemical',
    'biomarker',
    'serum',
    'blood',
  ], {
    contextTerms: ['dietary intervention', 'diet therapy', 'diet response', 'nutritional intervention'],
    requiredMeshGroups: [['Biomarkers']],
  }),
  topic('E', 'deficiency-markers', 'Nutritional deficiency markers', [
    'deficiency marker',
    'deficiency biomarker',
    'nutritional deficiency',
  ], {
    contextTerms: ['serum', 'blood', 'plasma', 'diagnosis'],
    primaryMeshTerms: ['Nutrition Disorders'],
    contextMeshTerms: ['Biomarkers'],
  }),

  topic('F', 'diet-behaviour', 'Diet and canine behaviour', ['diet behaviour', 'nutrition behaviour']),
  topic('F', 'tryptophan-behaviour', 'Tryptophan, serotonin precursors and behaviour', [
    'tryptophan',
  ], {
    contextTerms: ['behaviour', 'behavior', 'aggression', 'anxiety'],
    primaryMeshTerms: ['Tryptophan'],
    contextMeshTerms: ['Behavior, Animal', 'Aggression', 'Anxiety'],
  }),
  topic('F', 'protein-aggression', 'Dietary protein level and aggression or reactivity', [
    'dietary protein',
    'protein level',
    'protein restriction',
  ], {
    contextTerms: ['aggression', 'reactivity'],
    primaryMeshTerms: ['Dietary Proteins'],
    contextMeshTerms: ['Aggression'],
  }),
  topic('F', 'gut-brain-anxiety', 'Gut–brain axis and anxiety', [
    'gut brain axis',
    'microbiome brain axis',
    'gastrointestinal microbiome',
  ], {
    contextTerms: ['anxiety', 'fear', 'stress', 'behaviour', 'behavior'],
    primaryMeshTerms: ['Gastrointestinal Microbiome'],
    contextMeshTerms: ['Anxiety', 'Fear', 'Behavior, Animal'],
  }),
  topic('F', 'arousal-trainability', 'Nutrition, arousal and trainability', [
    'nutrition',
    'diet',
    'feeding',
  ], {
    contextTerms: ['arousal', 'trainability', 'learning'],
    primaryMeshTerms: ['Diet'],
    contextMeshTerms: ['Learning'],
  }),
  topic('F', 'gi-pain-behaviour', 'Gastrointestinal pain as a driver of behaviour change', [
    'gastrointestinal pain',
    'abdominal pain',
  ], {
    contextTerms: ['behaviour', 'behavior', 'aggression', 'anxiety', 'behaviour change', 'behavior change'],
    primaryMeshTerms: ['Abdominal Pain'],
    contextMeshTerms: ['Behavior, Animal', 'Aggression', 'Anxiety'],
  }),
  topic('F', 'coprophagia', 'Coprophagia and diet', [
    'coprophagia',
    'coprophagy',
  ], {
    contextTerms: ['diet', 'nutrition', 'feeding', 'food'],
    contextMeshTerms: ['Diet'],
  }),

  topic('G', 'industry-funding-bias', 'Industry funding and bias in companion-animal nutrition research', [
    'industry funding',
    'conflict of interest',
    'sponsorship bias',
    'funding bias',
  ], {
    contextTerms: ['pet food', 'companion animal nutrition', 'veterinary nutrition', 'animal nutrition'],
    primaryMeshTerms: ['Conflict of Interest'],
    evidenceScope: 'veterinary_methodology',
  }),
  topic('G', 'reporting-quality', 'Evidence quality and reporting standards in veterinary nutrition', [
    'evidence quality',
    'reporting quality',
    'reporting guideline',
    'risk of bias',
  ], {
    contextTerms: ['veterinary nutrition', 'animal nutrition', 'veterinary trial', 'veterinary research'],
    contextMeshTerms: ['Veterinary Medicine'],
    excludedMeshTerms: ['Homeopathy'],
    evidenceScope: 'veterinary_methodology',
  }),
  topic('G', 'caregiver-placebo', 'Caregiver placebo effect in owner-reported outcomes', [
    'caregiver placebo effect',
    'owner placebo effect veterinary',
  ], { evidenceScope: 'veterinary_methodology' }),
  topic('G', 'blinding-control', 'Blinding and control in diet trials', [
    'blinding',
    'double blind',
    'placebo',
    'controlled trial',
  ], {
    contextTerms: ['diet trial', 'nutrition trial', 'feeding trial'],
    primaryMeshTerms: ['Double-Blind Method', 'Placebos'],
    evidenceScope: 'veterinary_methodology',
  }),
  topic('G', 'systematic-review-methods', 'Systematic review methodology in veterinary medicine', [
    'systematic review methodology',
    'systematic review reporting',
    'quality of systematic reviews',
    'meta-research',
  ], {
    contextTerms: ['veterinary', 'animal health'],
    contextMeshTerms: ['Veterinary Medicine'],
    evidenceScope: 'veterinary_methodology',
  }),
  topic('G', 'pet-food-labelling-law', 'Pet food labelling regulation and legal category terminology', [
    'pet food labelling',
    'pet food labeling',
    'animal feed labelling',
    'animal feed labeling',
  ], {
    contextTerms: ['regulation', 'legislation', 'legal', 'claim', 'terminology'],
    primaryMeshTerms: ['Food Labeling'],
    fromYear: 2009,
    evidenceScope: 'veterinary_methodology',
  }),
  topic('G', 'dna-label-verification', 'DNA-based verification of pet food ingredient labelling', [
    'DNA barcoding',
    'DNA authentication',
    'PCR identification',
    'species identification',
  ], {
    contextTerms: ['pet food', 'dog food', 'animal feed', 'ingredient labelling', 'ingredient labeling'],
    primaryMeshTerms: ['DNA Barcoding, Taxonomic'],
    contextMeshTerms: ['Food Labeling'],
    evidenceScope: 'veterinary_methodology',
  }),

];

export function legacyResearchTopic(group: ResearchTopicGroup): ResearchTopic {
  if (group === 'B') return 'gut_biome';
  if (group === 'C') return 'allergy';
  if (group === 'D' || group === 'E') return 'health_condition';
  return 'general';
}
