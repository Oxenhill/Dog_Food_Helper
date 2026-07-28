# Research layer — Gate 1 discovery dry run

> **Admin UI verification: UNVERIFIED — no authenticated browser session was confirmed for this report.**

Generated: 2026-07-28T21:44:36.823Z

- Database writes: **none**
- Embedding calls: **none**
- Claim-drafting calls: **none**
- Topic queries: **88**
- Topic coverage: **87 with candidates**, **1 with none**
- Coverage by group: A 18/18 · B 12/12 · C 14/14 · D 18/18 · E 12/12 · F 7/7 · G 6/7
- Source errors: **0**
- Unique candidates: **138**
- Cross-topic duplicates: **34**
- Access: **45 OA full text**, **93 abstract only**
- Computed grades: **A 3 · B 7 · C 4 · D 124 · E 0**
- Direct canine corpus grades: **A 3 · B 5 · C 4 · D 117 · E 0**
- Veterinary methodology grades: **A 0 · B 2 · C 0 · D 7 · E 0**
- Evidence scopes: **129 canine direct**, **9 veterinary methodology**
- Grading metadata: **127 complete**, **11 incomplete**
- Missing inputs: sample_size 11 · funding_independent 7
- Europe PMC JATS funding enrichment: **30/30 succeeded** (cap 30; 0 failed)

## Gate 2 embedding estimate (not incurred)

Hard cap: 30 documents

Estimated embedding input: 81,585 tokens

Estimated Batch API embedding cost: **$0.000816 USD** using text-embedding-3-small

Not incurred or estimated yet: Gate 3 drafting model and the relevance threshold are deliberately unset until Gate 1/2 evidence is reviewed.

## Queries and candidates

### A. Canine macronutrient requirements

Query: `"Dogs"[Mesh] AND ("macronutrient requirements"[Title/Abstract] OR "nutrient requirements"[Title/Abstract]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Canine and Feline Obesity Management.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/33653534/)
- OA full text: not available; abstract-only
- DOI: 10.1016/j.cvsm.2021.01.005 · PMID: 33653534 · PMCID: not supplied
- Journal/year: The Veterinary clinics of North America. Small animal practice · 2021
- Publication types: Journal Article, Review
- MeSH headings: Animals, Cat Diseases, Cats, Diet, Reducing, Dog Diseases, Dogs, Obesity Management, Overweight
- Study design: narrative_review
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList
#### 2. Energy requirements of adult dogs: a meta-analysis.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/25313818/)
- OA full text: [Europe PMC](https://europepmc.org/articles/PMC4196927)
- DOI: 10.1371/journal.pone.0109681 · PMID: 25313818 · PMCID: PMC4196927
- Journal/year: PloS one · 2014
- Publication types: Journal Article, Meta-Analysis, Research Support, Non-U.S. Gov't
- MeSH headings: Animal Husbandry, Animals, Body Weight, Dogs, Energy Intake, Energy Metabolism, Nutritional Requirements
- Study design: meta_analysis
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: Competing Interests: ENB is an employee of AgResearch Ltd and was contracted by WALTHAM Centre for Pet Nutrition during the course of the study. RJB and PJM are employed by the WALTHAM Centre for Pet Nutrition. AJG's Readership is funded by Royal Canin. These competing interests do not alter the authors′ adherence to PLOS ONE policies on sharing data and materials.
- Funding independent: no
- Preprint: no · Open-access full text: yes · Abstract only: no
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **A**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = meta_analysis — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = false — Europe PMC fullTextXML: JATS funding-group and structured competing-interest declaration
  - is_preprint = false — PubMed PublicationTypeList

### A. FEDIAF and AAFCO nutrient guidelines

Query: `"Dogs"[Mesh] AND ("FEDIAF nutrient guidelines"[Title/Abstract] OR "AAFCO nutrient profiles"[Title/Abstract]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Assessment of protein and amino acid concentrations and labeling adequacy of commercial vegetarian diets formulated for dogs and cats.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/26225610/)
- OA full text: not available; abstract-only
- DOI: 10.2460/javma.247.4.385 · PMID: 26225610 · PMCID: not supplied
- Journal/year: Journal of the American Veterinary Medical Association · 2015
- Publication types: Evaluation Study, Journal Article, Research Support, Non-U.S. Gov't
- MeSH headings: Animal Feed, Animal Nutritional Physiological Phenomena, Animals, Cat Diseases, Cats, Cross-Sectional Studies, Diet, Protein-Restricted, Dog Diseases, Dogs, Food Labeling, Obesity, Morbid
- Study design: cross_sectional
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = cross_sectional — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

#### 2. Amino acid digestibility and protein quality of mealworm-based ingredients using the precision-fed cecectomized rooster assay.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/36617258/)
- OA full text: not available; abstract-only
- DOI: 10.1093/jas/skad012 · PMID: 36617258 · PMCID: PMC9951253
- Journal/year: Journal of animal science · 2023
- Publication types: Clinical Trial, Veterinary, Journal Article
- MeSH headings: Animals, Cats, Dogs, Female, Male, Amino Acids, Animal Feed, Animal Nutritional Physiological Phenomena, Cat Diseases, Chickens, Diet, Digestion, Dog Diseases, Proteins, Tenebrio, Random Allocation
- Study design: clinical_trial
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = clinical_trial — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Not fetched: Gate 1 OA enrichment cap of 30 reached
  - is_preprint = false — PubMed PublicationTypeList

### A. Protein quality and digestibility

Query: `"Dogs"[Mesh] AND ("protein quality"[Title/Abstract] OR "protein digestibility"[Title/Abstract]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Amino acid digestibility and protein quality of mealworm-based ingredients using the precision-fed cecectomized rooster assay.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/36617258/)
- OA full text: not available; abstract-only
- DOI: 10.1093/jas/skad012 · PMID: 36617258 · PMCID: PMC9951253
- Journal/year: Journal of animal science · 2023
- Publication types: Clinical Trial, Veterinary, Journal Article
- MeSH headings: Animals, Cats, Dogs, Female, Male, Amino Acids, Animal Feed, Animal Nutritional Physiological Phenomena, Cat Diseases, Chickens, Diet, Digestion, Dog Diseases, Proteins, Tenebrio, Random Allocation
- Study design: clinical_trial
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = clinical_trial — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Not fetched: Gate 1 OA enrichment cap of 30 reached
  - is_preprint = false — PubMed PublicationTypeList
- Deduplication: duplicate of MED:36617258 (title similarity 1)

#### 2. Evaluation of high-protein diets differing in protein source in healthy adult dogs.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/36807528/)
- OA full text: not available; abstract-only
- DOI: 10.1093/jas/skad057 · PMID: 36807528 · PMCID: PMC10066725
- Journal/year: Journal of animal science · 2023
- Publication types: Journal Article
- MeSH headings: Dogs, Animals, Digestion, Feces, Diet, Diet, High-Protein, Amino Acids, Glutens, Animal Feed, Animal Nutritional Physiological Phenomena
- Study design: other
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Not fetched: Gate 1 OA enrichment cap of 30 reached
  - is_preprint = false — PubMed PublicationTypeList

### A. Taurine, methionine, cysteine and tryptophan

Query: `"Dogs"[Mesh] AND ("taurine"[Title/Abstract] OR "methionine"[Title/Abstract] OR "cysteine"[Title/Abstract] OR "tryptophan"[Title/Abstract]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Characteristics of Nutrition and Metabolism in Dogs and Cats.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/38625525/)
- OA full text: not available; abstract-only
- DOI: 10.1007/978-3-031-54192-6_4 · PMID: 38625525 · PMCID: 5398323
- Journal/year: Advances in experimental medicine and biology · 2024
- Publication types: Journal Article
- MeSH headings: Cats, Dogs, Animals, Niacin, Cat Diseases, Dog Diseases, Vitamins, Vitamin A, Arginine, Starch, Taurine
- Study design: other
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Not fetched: Gate 1 OA enrichment cap of 30 reached
  - is_preprint = false — PubMed PublicationTypeList

#### 2. Dietary and Nutritional Approaches to the Management of Chronic Enteropathy in Dogs and Cats.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/33131914/)
- OA full text: not available; abstract-only
- DOI: 10.1016/j.cvsm.2020.09.005 · PMID: 33131914 · PMCID: not supplied
- Journal/year: The Veterinary clinics of North America. Small animal practice · 2021
- Publication types: Journal Article, Review
- MeSH headings: Animals, Cat Diseases, Cats, Diet, Dog Diseases, Dogs, Nutritional Requirements, Protein-Losing Enteropathies
- Study design: narrative_review
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

### A. Omega-3, EPA/DHA, linoleic acid and fatty-acid ratios

Query: `"Dogs"[Mesh] AND ("omega-3"[Title/Abstract] OR "EPA DHA"[Title/Abstract] OR "linoleic acid"[Title/Abstract] OR "omega-6 omega-3 ratio"[Title/Abstract]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Canine hyperlipidaemia.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/26456868/)
- OA full text: not available; abstract-only
- DOI: 10.1111/jsap.12396 · PMID: 26456868 · PMCID: not supplied
- Journal/year: The Journal of small animal practice · 2015
- Publication types: Journal Article, Review
- MeSH headings: Animals, Atherosclerosis, Biliary Tract Diseases, Dog Diseases, Dogs, Eye Diseases, Hyperlipidemias, Insulin Resistance, Lipid Metabolism, Lipoproteins, Liver Diseases, Metabolic Networks and Pathways, Pancreatitis
- Study design: narrative_review
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

#### 2. Lipid metabolism and hyperlipidemia in dogs.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/19167915/)
- OA full text: not available; abstract-only
- DOI: 10.1016/j.tvjl.2008.10.011 · PMID: 19167915 · PMCID: not supplied
- Journal/year: Veterinary journal (London, England : 1997) · 2010
- Publication types: Journal Article, Review
- MeSH headings: Animals, Diet, Reducing, Dog Diseases, Dogs, Fatty Acids, Omega-3, Hyperlipidemias, Hypertriglyceridemia, Hypolipidemic Agents, Lipid Metabolism, Liver Diseases, Niacin, Obesity, Pancreatitis
- Study design: narrative_review
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

### A. Soluble, insoluble and fermentable dietary fibre

Query: `"Dogs"[Mesh] AND ("soluble fibre"[Title/Abstract] OR "insoluble fibre"[Title/Abstract] OR "fermentable fibre"[Title/Abstract]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Guava fibre characterization and effects on digestibility, fermentation products, gastrointestinal transit time and palatability of dry diets for dogs.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/38044537/)
- OA full text: not available; abstract-only
- DOI: 10.1111/jpn.13910 · PMID: 38044537 · PMCID: not supplied
- Journal/year: Journal of animal physiology and animal nutrition · 2024
- Publication types: Journal Article
- MeSH headings: Dogs, Animals, Psidium, Fermentation, Gastrointestinal Transit, Diet, Digestion, Feces, Animal Feed
- Study design: other
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

#### 2. Digestive sensitivity varies according to size of dogs: a review.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/27045769/)
- OA full text: not available; abstract-only
- DOI: 10.1111/jpn.12507 · PMID: 27045769 · PMCID: not supplied
- Journal/year: Journal of animal physiology and animal nutrition · 2017
- Publication types: Journal Article, Review
- MeSH headings: Animal Feed, Animals, Body Size, Diet, Dog Diseases, Dogs, Gastrointestinal Diseases
- Study design: narrative_review
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

### A. Metabolisable energy and energy requirements

Query: `"Dogs"[Mesh] AND ("metabolisable energy"[Title/Abstract] OR "metabolizable energy"[Title/Abstract] OR "energy requirement"[Title/Abstract]) AND hasabstract AND ("2000/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Management of anorexia in dogs and cats.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/17085232/)
- OA full text: not available; abstract-only
- DOI: 10.1016/j.cvsm.2006.08.001 · PMID: 17085232 · PMCID: not supplied
- Journal/year: The Veterinary clinics of North America. Small animal practice · 2006
- Publication types: Journal Article, Review
- MeSH headings: Animal Nutritional Physiological Phenomena, Animals, Anorexia, Appetite, Cat Diseases, Cats, Diet, Dog Diseases, Dogs, Food Preferences, Nutritional Support, Taste
- Study design: narrative_review
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

#### 2. Energy requirements of adult dogs: a meta-analysis.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/25313818/)
- OA full text: [Europe PMC](https://europepmc.org/articles/PMC4196927)
- DOI: 10.1371/journal.pone.0109681 · PMID: 25313818 · PMCID: PMC4196927
- Journal/year: PloS one · 2014
- Publication types: Journal Article, Meta-Analysis, Research Support, Non-U.S. Gov't
- MeSH headings: Animal Husbandry, Animals, Body Weight, Dogs, Energy Intake, Energy Metabolism, Nutritional Requirements
- Study design: meta_analysis
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: Competing Interests: ENB is an employee of AgResearch Ltd and was contracted by WALTHAM Centre for Pet Nutrition during the course of the study. RJB and PJM are employed by the WALTHAM Centre for Pet Nutrition. AJG's Readership is funded by Royal Canin. These competing interests do not alter the authors′ adherence to PLOS ONE policies on sharing data and materials.
- Funding independent: no
- Preprint: no · Open-access full text: yes · Abstract only: no
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **A**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = meta_analysis — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = false — Europe PMC fullTextXML: JATS funding-group and structured competing-interest declaration
  - is_preprint = false — PubMed PublicationTypeList
- Deduplication: duplicate of MED:25313818 (title similarity 1)

### A. Growth, maintenance and senior life-stage nutrition

Query: `"Dogs"[Mesh] AND ("growth"[Title/Abstract] OR "adult"[Title/Abstract] OR "senior"[Title/Abstract] OR "geriatric"[Title/Abstract]) AND ("nutrition"[Title/Abstract] OR "diet"[Title/Abstract] OR "feeding"[Title/Abstract]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Characteristics of the Digestive Tract of Dogs and Cats.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/38625523/)
- OA full text: not available; abstract-only
- DOI: 10.1007/978-3-031-54192-6_2 · PMID: 38625523 · PMCID: 4899902
- Journal/year: Advances in experimental medicine and biology · 2024
- Publication types: Journal Article
- MeSH headings: Humans, Cats, Dogs, Animals, Swine, Cat Diseases, Dog Diseases, Mouth, Vitamins, Mammals, Starch, Water
- Study design: other
- Species: dog (Dogs, Cats, Humans)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Not fetched: Gate 1 OA enrichment cap of 30 reached
  - is_preprint = false — PubMed PublicationTypeList

#### 2. Nutrition and Aging in Dogs and Cats.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/38625530/)
- OA full text: not available; abstract-only
- DOI: 10.1007/978-3-031-54192-6_9 · PMID: 38625530 · PMCID: 6390407
- Journal/year: Advances in experimental medicine and biology · 2024
- Publication types: Journal Article
- MeSH headings: Cats, Dogs, Animals, Cat Diseases, Quality of Life, Dog Diseases, Aging, Inflammation
- Study design: other
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Not fetched: Gate 1 OA enrichment cap of 30 reached
  - is_preprint = false — PubMed PublicationTypeList

### A. Large-breed growth and calcium:phosphorus ratio

Query: `"Dogs"[Mesh] AND ("large breed growth"[Title/Abstract] OR "giant breed growth"[Title/Abstract] OR "calcium phosphorus ratio"[Title/Abstract]) AND hasabstract AND ("2000/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Influence of number of ingredients, use of supplement and vegetarian or vegan preparation on the composition of homemade diets for dogs and cats.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/34798889/)
- OA full text: [Europe PMC](https://europepmc.org/articles/PMC8605502)
- DOI: 10.1186/s12917-021-03068-5 · PMID: 34798889 · PMCID: PMC8605502
- Journal/year: BMC veterinary research · 2021
- Publication types: Journal Article
- MeSH headings: Animal Feed, Animals, Cats, Cookbooks as Topic, Diet, Diet, Vegetarian, Dietary Supplements, Dogs, Minerals, Nutrients
- Study design: other
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: yes · Abstract only: no
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Europe PMC fullTextXML: JATS funding-group and structured competing-interest declaration
  - is_preprint = false — PubMed PublicationTypeList

#### 2. Effects of erbium,chromium:YSGG laser irradiation on canine mandibular bone.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/11577949/)
- OA full text: not available; abstract-only
- DOI: 10.1902/jop.2000.72.9.1178 · PMID: 11577949 · PMCID: not supplied
- Journal/year: Journal of periodontology · 2001
- Publication types: Journal Article, Research Support, Non-U.S. Gov't
- MeSH headings: Animals, Calcium, Chromium, Dogs, Electron Probe Microanalysis, Erbium, Hot Temperature, Lasers, Mandible, Microscopy, Electron, Scanning, Phosphorus, Thermography
- Study design: other
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

### A. Zinc, copper, iodine, selenium, vitamin D and vitamin E

Query: `"Dogs"[Mesh] AND ("zinc"[Title/Abstract] OR "copper"[Title/Abstract] OR "iodine"[Title/Abstract] OR "selenium"[Title/Abstract] OR "vitamin D"[Title/Abstract] OR "vitamin E"[Title/Abstract]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Rickets, Vitamin D, and Ca/P Metabolism.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/36446330/)
- OA full text: not available; abstract-only
- DOI: 10.1159/000527011 · PMID: 36446330 · PMCID: not supplied
- Journal/year: Hormone research in paediatrics · 2022
- Publication types: Journal Article, Review
- MeSH headings: Animals, Dogs, Humans, Cod Liver Oil, Familial Hypophosphatemic Rickets, Parathyroid Hormone, Rickets, Vitamin D, Vitamins
- Study design: narrative_review
- Species: dog (Dogs, Humans)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

#### 2. Nutritional Management for Dogs and Cats with Chronic Kidney Disease.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/33773648/)
- OA full text: not available; abstract-only
- DOI: 10.1016/j.cvsm.2021.01.007 · PMID: 33773648 · PMCID: not supplied
- Journal/year: The Veterinary clinics of North America. Small animal practice · 2021
- Publication types: Journal Article, Review
- MeSH headings: Animals, Body Composition, Cat Diseases, Cats, Diet, Dog Diseases, Dogs, Renal Insufficiency, Chronic
- Study design: narrative_review
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

### A. Body condition score, obesity and weight management

Query: `"Dogs"[Mesh] AND ("body condition score"[Title/Abstract] OR "obesity"[Title/Abstract] OR "weight management"[Title/Abstract]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Animal models of obesity and diabetes mellitus.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/29348476/)
- OA full text: not available; abstract-only
- DOI: 10.1038/nrendo.2017.161 · PMID: 29348476 · PMCID: not supplied
- Journal/year: Nature reviews. Endocrinology · 2018
- Publication types: Journal Article, Review
- MeSH headings: Animals, Body Mass Index, Diabetes Mellitus, Type 2, Disease Models, Animal, Dogs, Fishes, Haplorhini, Humans, Mice, Obesity, Rats, Risk Assessment, Sensitivity and Specificity, Swine
- Study design: narrative_review
- Species: dog (Dogs, Humans, Rodents)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

#### 2. Canine and Feline Obesity Management.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/33653534/)
- OA full text: not available; abstract-only
- DOI: 10.1016/j.cvsm.2021.01.005 · PMID: 33653534 · PMCID: not supplied
- Journal/year: The Veterinary clinics of North America. Small animal practice · 2021
- Publication types: Journal Article, Review
- MeSH headings: Animals, Cat Diseases, Cats, Diet, Reducing, Dog Diseases, Dogs, Obesity Management, Overweight
- Study design: narrative_review
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList
- Deduplication: duplicate of MED:33653534 (title similarity 1)

### A. Feeding frequency and timing

Query: `"Dogs"[Mesh] AND ("feeding frequency"[Title/Abstract] OR "meal frequency"[Title/Abstract] OR "feeding time"[Title/Abstract]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Functional properties of Ganoderma lucidum supplementation in canine nutrition.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/38417056/)
- OA full text: not available; abstract-only
- DOI: 10.1093/jas/skae051 · PMID: 38417056 · PMCID: PMC11025632
- Journal/year: Journal of animal science · 2024
- Publication types: Journal Article
- MeSH headings: Dogs, Animals, Digestion, Leukocytes, Mononuclear, Reishi, Feces, Diet, Dietary Supplements, Vaccines, Animal Feed
- Study design: other
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Not fetched: Gate 1 OA enrichment cap of 30 reached
  - is_preprint = false — PubMed PublicationTypeList

#### 2. Prey tells, large herbivores fear the human 'super predator'.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/34981219/)
- OA full text: not available; abstract-only
- DOI: 10.1007/s00442-021-05080-w · PMID: 34981219 · PMCID: 4100875
- Journal/year: Oecologia · 2022
- Publication types: Journal Article
- MeSH headings: Animals, Carnivora, Deer, Dogs, Food Chain, Herbivory, Humans, Predatory Behavior, Wolves
- Study design: other
- Species: dog (Dogs, Humans)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Not fetched: Gate 1 OA enrichment cap of 30 reached
  - is_preprint = false — PubMed PublicationTypeList

### A. Raw meat-based diet adequacy and pathogen risk

Query: `"Dogs"[Mesh] AND ("raw meat based diet"[Title/Abstract] OR "raw diet pathogen"[Title/Abstract] OR "raw diet nutritional adequacy"[Title/Abstract]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Anti-microbial resistance of Salmonella isolates from raw meat-based dog food in Japan.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/35077028/)
- OA full text: [Europe PMC](https://europepmc.org/articles/PMC9122446)
- DOI: 10.1002/vms3.739 · PMID: 35077028 · PMCID: PMC9122446
- Journal/year: Veterinary medicine and science · 2022
- Publication types: Journal Article, Research Support, Non-U.S. Gov't
- MeSH headings: Animal Feed, Animals, Anti-Bacterial Agents, Dogs, Drug Resistance, Multiple, Bacterial, Japan, Meat, Salmonella, Salmonella enterica, Tetracyclines
- Study design: other
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: Japan Pet Care Association
- Competing-interests declaration: CONFLICT OF INTEREST The authors have no conflict of interest to declare.
- Funding independent: not supplied
- Preprint: no · Open-access full text: yes · Abstract only: no
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Europe PMC fullTextXML: JATS funding-group and structured competing-interest declaration
  - is_preprint = false — PubMed PublicationTypeList

#### 2. The effect of a kibble diet versus a raw meat-based diet on energy metabolism biomarkers in dogs.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/41046069/)
- OA full text: not available; abstract-only
- DOI: 10.1016/j.tvjl.2025.106462 · PMID: 41046069 · PMCID: not supplied
- Journal/year: Veterinary journal (London, England : 1997) · 2025
- Publication types: Journal Article, Randomized Controlled Trial, Veterinary
- MeSH headings: Diet, Male, Female, Animals, Dogs, Animal Feed, Meat, Biomarkers, Energy Metabolism, Blood Glucose, Insulin
- Study design: rct
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **B**
- Grading inputs complete: **no**
- Missing grading inputs: sample_size, funding_independent
- Grading input provenance:
  - study_design = rct — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

### A. Home-prepared diet adequacy

Query: `"Dogs"[Mesh] AND ("home prepared diet"[Title/Abstract] OR "homemade diet adequacy"[Title/Abstract]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Influence of number of ingredients, use of supplement and vegetarian or vegan preparation on the composition of homemade diets for dogs and cats.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/34798889/)
- OA full text: [Europe PMC](https://europepmc.org/articles/PMC8605502)
- DOI: 10.1186/s12917-021-03068-5 · PMID: 34798889 · PMCID: PMC8605502
- Journal/year: BMC veterinary research · 2021
- Publication types: Journal Article
- MeSH headings: Animal Feed, Animals, Cats, Cookbooks as Topic, Diet, Diet, Vegetarian, Dietary Supplements, Dogs, Minerals, Nutrients
- Study design: other
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: yes · Abstract only: no
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Europe PMC fullTextXML: JATS funding-group and structured competing-interest declaration
  - is_preprint = false — PubMed PublicationTypeList
- Deduplication: duplicate of MED:34798889 (title similarity 1)

#### 2. Concentrations of macronutrients, minerals and heavy metals in home-prepared diets for adult dogs and cats.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/31506479/)
- OA full text: [Europe PMC](https://europepmc.org/articles/PMC6736975)
- DOI: 10.1038/s41598-019-49087-z · PMID: 31506479 · PMCID: PMC6736975
- Journal/year: Scientific reports · 2019
- Publication types: Journal Article
- MeSH headings: Animal Feed, Animals, Cats, Dogs, Metals, Heavy, Minerals, Nutrients
- Study design: other
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: yes · Abstract only: no
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Europe PMC fullTextXML: JATS funding-group and structured competing-interest declaration
  - is_preprint = false — PubMed PublicationTypeList

### A. Grain-free diets and diet-associated dilated cardiomyopathy

Query: `"Dogs"[Mesh] AND ("grain"[Title/Abstract] OR "pulse"[Title/Abstract] OR "legume"[Title/Abstract] OR "non-traditional diet"[Title/Abstract]) AND ("dilated cardiomyopathy"[Title/Abstract] OR "cardiomyopathy"[Title/Abstract]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Retrospective study of dilated cardiomyopathy in dogs.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/33345431/)
- OA full text: [Europe PMC](https://europepmc.org/articles/PMC7848368)
- DOI: 10.1111/jvim.15972 · PMID: 33345431 · PMCID: PMC7848368
- Journal/year: Journal of veterinary internal medicine · 2021
- Publication types: Journal Article
- MeSH headings: Animals, Cardiomyopathy, Dilated, Cat Diseases, Cats, Dog Diseases, Dogs, Echocardiography, Retrospective Studies
- Study design: other
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: Barkley Fund
- Competing-interests declaration: CONFLICT OF INTEREST DECLARATION In the last 3 years, Dr. Freeman has received research funding from, given sponsored lectures for, and/or provided professional services to Aratana Therapeutics, Elanco, Hill's Pet Nutrition, Nestlé Purina PetCare, P&G Pet Care (now Mars), and Royal Canin. In the last 3 years, Dr. Rush has received research funding from, given sponsored lectures for, and/or provided professional services to Aratana Therapeutics, Boehringer Ingelheim, Elanco, IDEXX, Nestlé Purina PetCare, and Royal Canin.
- Funding independent: no
- Preprint: no · Open-access full text: yes · Abstract only: no
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = false — Europe PMC fullTextXML: JATS funding-group and structured competing-interest declaration
  - is_preprint = false — PubMed PublicationTypeList

#### 2. Review of canine dilated cardiomyopathy in the wake of diet-associated concerns.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/32542359/)
- OA full text: [Europe PMC](https://europepmc.org/articles/PMC7447921)
- DOI: 10.1093/jas/skaa155 · PMID: 32542359 · PMCID: PMC7447921
- Journal/year: Journal of animal science · 2020
- Publication types: Journal Article, Review
- MeSH headings: Animals, Breeding, Cardiomyopathy, Dilated, Diet, Dog Diseases, Dogs, Edible Grain
- Study design: narrative_review
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: BSM Partners
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: yes · Abstract only: no
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Europe PMC fullTextXML: JATS funding-group and structured competing-interest declaration
  - is_preprint = false — PubMed PublicationTypeList

### A. Extrusion and processing effects on nutrient availability

Query: `"Dogs"[Mesh] AND ("extrusion"[Title/Abstract] OR "food processing"[Title/Abstract] OR "thermal processing"[Title/Abstract] OR "Food Handling"[Mesh]) AND ("digestibility"[Title/Abstract] OR "nutrient availability"[Title/Abstract] OR "amino acid availability"[Title/Abstract] OR "Digestion"[Mesh]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Soybean meal and poultry offal meal effects on digestibility of adult dogs diets: Systematic review.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/34043623/)
- OA full text: [Europe PMC](https://europepmc.org/articles/PMC8158863)
- DOI: 10.1371/journal.pone.0249321 · PMID: 34043623 · PMCID: PMC8158863
- Journal/year: PloS one · 2021
- Publication types: Journal Article, Systematic Review
- MeSH headings: Animal Feed, Animals, Databases, Factual, Diet, Digestion, Dogs, Meat Proteins, Soybean Proteins, Glycine max
- Study design: systematic_review
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: Competing Interests: The authors have declared that no competing interests exist.
- Funding independent: not supplied
- Preprint: no · Open-access full text: yes · Abstract only: no
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **A**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = systematic_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Europe PMC fullTextXML: JATS funding-group and structured competing-interest declaration
  - is_preprint = false — PubMed PublicationTypeList

#### 2. Nutrient and Maillard reaction product concentrations of commercially available pet foods and treats.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/36082767/)
- OA full text: not available; abstract-only
- DOI: 10.1093/jas/skac305 · PMID: 36082767 · PMCID: PMC9667973
- Journal/year: Journal of animal science · 2022
- Publication types: Journal Article
- MeSH headings: Cats, Dogs, Animals, Glycation End Products, Advanced, Animal Feed, Lysine, Cat Diseases, Dog Diseases, Nutrients, Diet, Maillard Reaction, Furaldehyde, Digestion
- Study design: other
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Not fetched: Gate 1 OA enrichment cap of 30 reached
  - is_preprint = false — PubMed PublicationTypeList

### A. Ultra-processed versus minimally processed pet food

Query: `"Dogs"[Mesh] AND ("ultra-processed"[Title/Abstract] OR "minimally processed"[Title/Abstract] OR "fresh diet"[Title/Abstract]) AND ("pet food"[Title/Abstract] OR "dog food"[Title/Abstract] OR "canine diet"[Title/Abstract] OR "Animal Feed"[Mesh]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. The Rise of Fresh Foods.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/40675824/)
- OA full text: not available; abstract-only
- DOI: 10.1016/j.cvsm.2025.06.007 · PMID: 40675824 · PMCID: not supplied
- Journal/year: The Veterinary clinics of North America. Small animal practice · 2025
- Publication types: Journal Article, Review
- MeSH headings: Animals, Animal Feed, Animal Nutritional Physiological Phenomena, Dogs, Diet, Cats
- Study design: narrative_review
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

#### 2. Raw Foods: A Second Look.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/40675823/)
- OA full text: not available; abstract-only
- DOI: 10.1016/j.cvsm.2025.06.004 · PMID: 40675823 · PMCID: not supplied
- Journal/year: The Veterinary clinics of North America. Small animal practice · 2025
- Publication types: Journal Article, Review
- MeSH headings: Animals, Dogs, Cats, Animal Feed, Cooking, Raw Foods, Animal Nutritional Physiological Phenomena, Food Handling
- Study design: narrative_review
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

### A. Canine food palatability

Query: `"Dogs"[Mesh] AND ("food palatability"[Title/Abstract] OR "diet palatability"[Title/Abstract]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Sensory analysis of pet foods.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/24497160/)
- OA full text: not available; abstract-only
- DOI: 10.1002/jsfa.6597 · PMID: 24497160 · PMCID: not supplied
- Journal/year: Journal of the science of food and agriculture · 2014
- Publication types: Journal Article, Review
- MeSH headings: Animals, Cats, Diet, Dogs, Food Analysis, Food Preferences, Humans, Odorants, Pets, Taste
- Study design: narrative_review
- Species: dog (Dogs, Cats, Humans)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

#### 2. Vegan versus meat-based pet foods: Owner-reported palatability behaviours and implications for canine and feline welfare.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/34133456/)
- OA full text: [Europe PMC](https://europepmc.org/articles/PMC8208530)
- DOI: 10.1371/journal.pone.0253292 · PMID: 34133456 · PMCID: PMC8208530
- Journal/year: PloS one · 2021
- Publication types: Comparative Study, Journal Article, Research Support, Non-U.S. Gov't
- MeSH headings: Adolescent, Adult, Aged, Animal Feed, Animal Welfare, Animals, Cats, Diet, Vegan, Dogs, Feeding Behavior, Female, Food Quality, Humans, Male, Meat, Middle Aged, Pets, Young Adult
- Study design: comparative_study
- Species: dog (Dogs, Cats, Humans)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: Proveg International Oct2019-0000000286 https://orcid.org/0000-0002-9753-6199 Knight Andrew This research and its publication open access was funded by food awareness organisation ProVeg International ( https://proveg.com ). AK received this award ID: Oct2019-0000000286. However, this funder played no role in study conceptualisation, design, data collection and analysis, preparation of the resultant manuscript nor decisions relating to publication. We are grateful for their financial support.
- Competing-interests declaration: Competing Interests: No authors have competing interests.
- Funding independent: not supplied
- Preprint: no · Open-access full text: yes · Abstract only: no
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = comparative_study — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Europe PMC fullTextXML: JATS funding-group and structured competing-interest declaration
  - is_preprint = false — PubMed PublicationTypeList

### B. Canine gut microbiome composition and core taxa

Query: `"Dogs"[Mesh] AND ("gut microbiome composition"[Title/Abstract] OR "core microbiome"[Title/Abstract] OR "core taxa"[Title/Abstract]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Insights into the gut-kidney axis and implications for chronic kidney disease management in cats and dogs.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/38897377/)
- OA full text: not available; abstract-only
- DOI: 10.1016/j.tvjl.2024.106181 · PMID: 38897377 · PMCID: not supplied
- Journal/year: Veterinary journal (London, England : 1997) · 2024
- Publication types: Journal Article, Review
- MeSH headings: Animals, Cats, Dogs, Dog Diseases, Renal Insufficiency, Chronic, Cat Diseases, Gastrointestinal Microbiome, Kidney, Dysbiosis
- Study design: narrative_review
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

#### 2. Gallbladder microbiota in healthy dogs and dogs with mucocele formation.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/36763596/)
- OA full text: [Europe PMC](https://europepmc.org/articles/PMC9916591)
- DOI: 10.1371/journal.pone.0281432 · PMID: 36763596 · PMCID: PMC9916591
- Journal/year: PloS one · 2023
- Publication types: Journal Article, Research Support, Non-U.S. Gov't, Research Support, N.I.H., Extramural
- MeSH headings: Dogs, Animals, Gallbladder, Mucocele, RNA, Ribosomal, 16S, Bile, Gallbladder Diseases, Microbiota, Bile Duct Diseases, Dog Diseases
- Study design: other
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: Competing Interests: The authors have declared that no competing interests exist.
- Funding independent: not supplied
- Preprint: no · Open-access full text: yes · Abstract only: no
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Europe PMC fullTextXML: JATS funding-group and structured competing-interest declaration
  - is_preprint = false — PubMed PublicationTypeList

### B. Canine dysbiosis index

Query: `"Dogs"[Mesh] AND ("dysbiosis index"[Title/Abstract]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Analysis of the gut microbiome in dogs and cats.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/34514619/)
- OA full text: [Europe PMC](https://europepmc.org/articles/PMC9292158)
- DOI: 10.1111/vcp.13031 · PMID: 34514619 · PMCID: PMC9292158
- Journal/year: Veterinary clinical pathology · 2022
- Publication types: Journal Article, Review
- MeSH headings: Animals, Cat Diseases, Cats, Dog Diseases, Dogs, Dysbiosis, Feces, Gastrointestinal Microbiome
- Study design: narrative_review
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: DISCLOSURE The author is an employee of the Gastrointestinal Laboratory at Texas A&M University that offers microbiome and gastrointestinal function testing on a fee‐for‐service basis.
- Funding independent: not supplied
- Preprint: no · Open-access full text: yes · Abstract only: no
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Europe PMC fullTextXML: JATS funding-group and structured competing-interest declaration
  - is_preprint = false — PubMed PublicationTypeList

#### 2. Impact of Changes in Gastrointestinal Microbiota in Canine and Feline Digestive Diseases.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/33131916/)
- OA full text: not available; abstract-only
- DOI: 10.1016/j.cvsm.2020.09.004 · PMID: 33131916 · PMCID: not supplied
- Journal/year: The Veterinary clinics of North America. Small animal practice · 2021
- Publication types: Journal Article, Review
- MeSH headings: Animals, Cat Diseases, Cats, Diarrhea, Dog Diseases, Dogs, Dysbiosis, Gastrointestinal Microbiome
- Study design: narrative_review
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

### B. Diet effects on microbiome composition

Query: `"Dogs"[Mesh] AND ("diet"[Title/Abstract] OR "dietary"[Title/Abstract] OR "animal feed"[Title/Abstract]) AND ("gut microbiome"[Title/Abstract] OR "gut microbiota"[Title/Abstract] OR "microbiome composition"[Title/Abstract] OR "Gastrointestinal Microbiome"[Mesh]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. The Gut Microbiome of Dogs and Cats, and the Influence of Diet.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/33653538/)
- OA full text: not available; abstract-only
- DOI: 10.1016/j.cvsm.2021.01.002 · PMID: 33653538 · PMCID: not supplied
- Journal/year: The Veterinary clinics of North America. Small animal practice · 2021
- Publication types: Journal Article, Review
- MeSH headings: Animals, Cat Diseases, Cats, Diet, Dog Diseases, Dogs, Gastrointestinal Microbiome, Prebiotics
- Study design: narrative_review
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

#### 2. Insights into the gut-kidney axis and implications for chronic kidney disease management in cats and dogs.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/38897377/)
- OA full text: not available; abstract-only
- DOI: 10.1016/j.tvjl.2024.106181 · PMID: 38897377 · PMCID: not supplied
- Journal/year: Veterinary journal (London, England : 1997) · 2024
- Publication types: Journal Article, Review
- MeSH headings: Animals, Cats, Dogs, Dog Diseases, Renal Insufficiency, Chronic, Cat Diseases, Gastrointestinal Microbiome, Kidney, Dysbiosis
- Study design: narrative_review
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList
- Deduplication: duplicate of MED:38897377 (title similarity 1)

### B. Short-chain fatty acids, butyrate and gut barrier function

Query: `"Dogs"[Mesh] AND ("short-chain fatty acids"[Title/Abstract] OR "butyrate gut barrier"[Title/Abstract]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. The Gut Microbiome of Dogs and Cats, and the Influence of Diet.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/33653538/)
- OA full text: not available; abstract-only
- DOI: 10.1016/j.cvsm.2021.01.002 · PMID: 33653538 · PMCID: not supplied
- Journal/year: The Veterinary clinics of North America. Small animal practice · 2021
- Publication types: Journal Article, Review
- MeSH headings: Animals, Cat Diseases, Cats, Diet, Dog Diseases, Dogs, Gastrointestinal Microbiome, Prebiotics
- Study design: narrative_review
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList
- Deduplication: duplicate of MED:33653538 (title similarity 1)

#### 2. Characteristics of the Digestive Tract of Dogs and Cats.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/38625523/)
- OA full text: not available; abstract-only
- DOI: 10.1007/978-3-031-54192-6_2 · PMID: 38625523 · PMCID: 4899902
- Journal/year: Advances in experimental medicine and biology · 2024
- Publication types: Journal Article
- MeSH headings: Humans, Cats, Dogs, Animals, Swine, Cat Diseases, Dog Diseases, Mouth, Vitamins, Mammals, Starch, Water
- Study design: other
- Species: dog (Dogs, Cats, Humans)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Not fetched: Gate 1 OA enrichment cap of 30 reached
  - is_preprint = false — PubMed PublicationTypeList
- Deduplication: duplicate of MED:38625523 (title similarity 1)

### B. FOS, MOS, inulin, chicory and beet-pulp prebiotics

Query: `"Dogs"[Mesh] AND ("fructooligosaccharides"[Title/Abstract] OR "mannan oligosaccharides"[Title/Abstract] OR "inulin"[Title/Abstract] OR "chicory"[Title/Abstract] OR "beet pulp"[Title/Abstract]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Digestive sensitivity varies according to size of dogs: a review.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/27045769/)
- OA full text: not available; abstract-only
- DOI: 10.1111/jpn.12507 · PMID: 27045769 · PMCID: not supplied
- Journal/year: Journal of animal physiology and animal nutrition · 2017
- Publication types: Journal Article, Review
- MeSH headings: Animal Feed, Animals, Body Size, Diet, Dog Diseases, Dogs, Gastrointestinal Diseases
- Study design: narrative_review
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList
- Deduplication: duplicate of MED:27045769 (title similarity 1)

#### 2. Fructo-oligosaccharide effects on serum cholesterol levels. An overview.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/26016937/)
- OA full text: not available; abstract-only
- DOI: 10.1590/s0102-865020150050000009 · PMID: 26016937 · PMCID: not supplied
- Journal/year: Acta cirurgica brasileira · 2015
- Publication types: Journal Article, Review
- MeSH headings: Animals, Cholesterol, Dietary Supplements, Dogs, Dyslipidemias, Humans, Lipid Metabolism, Oligosaccharides, Rats, Reproducibility of Results, Treatment Outcome
- Study design: narrative_review
- Species: dog (Dogs, Humans, Rodents)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

### B. Probiotics and synbiotics

Query: `"Dogs"[Mesh] AND ("probiotic"[Title/Abstract] OR "synbiotic"[Title/Abstract]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Value of Probiotics in Canine and Feline Gastroenterology.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/33187621/)
- OA full text: not available; abstract-only
- DOI: 10.1016/j.cvsm.2020.09.011 · PMID: 33187621 · PMCID: not supplied
- Journal/year: The Veterinary clinics of North America. Small animal practice · 2021
- Publication types: Journal Article, Review
- MeSH headings: Animals, Cat Diseases, Cats, Diarrhea, Dog Diseases, Dogs, Inflammatory Bowel Diseases, Probiotics
- Study design: narrative_review
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

#### 2. European Network for Optimization of Veterinary Antimicrobial Therapy (ENOVAT) guidelines for antimicrobial use in canine acute diarrhoea.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/39074542/)
- OA full text: not available; abstract-only
- DOI: 10.1016/j.tvjl.2024.106208 · PMID: 39074542 · PMCID: not supplied
- Journal/year: Veterinary journal (London, England : 1997) · 2024
- Publication types: Journal Article, Practice Guideline
- MeSH headings: Animals, Dogs, Diarrhea, Dog Diseases, Probiotics, Anti-Infective Agents, Anti-Bacterial Agents, Europe, Acute Disease
- Study design: guideline
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = guideline — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

### B. Faecal microbiota transplantation

Query: `"Dogs"[Mesh] AND ("faecal microbiota transplantation"[Title/Abstract] OR "fecal microbiota transplantation"[Title/Abstract]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Analysis of the gut microbiome in dogs and cats.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/34514619/)
- OA full text: [Europe PMC](https://europepmc.org/articles/PMC9292158)
- DOI: 10.1111/vcp.13031 · PMID: 34514619 · PMCID: PMC9292158
- Journal/year: Veterinary clinical pathology · 2022
- Publication types: Journal Article, Review
- MeSH headings: Animals, Cat Diseases, Cats, Dog Diseases, Dogs, Dysbiosis, Feces, Gastrointestinal Microbiome
- Study design: narrative_review
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: DISCLOSURE The author is an employee of the Gastrointestinal Laboratory at Texas A&M University that offers microbiome and gastrointestinal function testing on a fee‐for‐service basis.
- Funding independent: not supplied
- Preprint: no · Open-access full text: yes · Abstract only: no
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Europe PMC fullTextXML: JATS funding-group and structured competing-interest declaration
  - is_preprint = false — PubMed PublicationTypeList
- Deduplication: duplicate of MED:34514619 (title similarity 1)

#### 2. Fecal microbiota transplantation in puppies with canine parvovirus infection.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/29460302/)
- OA full text: [Europe PMC](https://europepmc.org/articles/PMC5867004)
- DOI: 10.1111/jvim.15072 · PMID: 29460302 · PMCID: PMC5867004
- Journal/year: Journal of veterinary internal medicine · 2018
- Publication types: Journal Article, Randomized Controlled Trial
- MeSH headings: Animals, Diarrhea, Dog Diseases, Dogs, Fecal Microbiota Transplantation, Gastrointestinal Hemorrhage, Parvoviridae Infections, Parvovirus, Canine, Treatment Outcome
- Study design: rct
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: yes · Abstract only: no
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **B**
- Grading inputs complete: **no**
- Missing grading inputs: sample_size, funding_independent
- Grading input provenance:
  - study_design = rct — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Europe PMC fullTextXML: JATS funding-group and structured competing-interest declaration
  - is_preprint = false — PubMed PublicationTypeList

### B. Gut–brain axis and canine behaviour

Query: `"Dogs"[Mesh] AND ("gut brain axis"[Title/Abstract] OR "microbiome brain axis"[Title/Abstract] OR "gastrointestinal microbiome"[Title/Abstract] OR "Gastrointestinal Microbiome"[Mesh]) AND ("behaviour"[Title/Abstract] OR "behavior"[Title/Abstract] OR "anxiety"[Title/Abstract] OR "Behavior, Animal"[Mesh] OR "Anxiety"[Mesh]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Targeting the Gut-Brain Axis: Pharmacological Modulation of the Microbiome for Neurological and Behavioural Disorders in Companion Animals.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/42485503/)
- OA full text: not available; abstract-only
- DOI: 10.1002/vms3.71105 · PMID: 42485503 · PMCID: PMC13390968
- Journal/year: Veterinary medicine and science · 2026
- Publication types: Journal Article, Review
- MeSH headings: Animals, Dogs, Cats, Gastrointestinal Microbiome, Cat Diseases, Dog Diseases, Nervous System Diseases, Mental Disorders, Pets, Brain, Prebiotics
- Study design: narrative_review
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Not fetched: Gate 1 OA enrichment cap of 30 reached
  - is_preprint = false — PubMed PublicationTypeList

#### 2. Nutritional Management of Behavior and Brain Disorders in Dogs and Cats.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/33773649/)
- OA full text: not available; abstract-only
- DOI: 10.1016/j.cvsm.2021.01.011 · PMID: 33773649 · PMCID: not supplied
- Journal/year: The Veterinary clinics of North America. Small animal practice · 2021
- Publication types: Journal Article, Review
- MeSH headings: Animals, Anxiety, Behavior, Animal, Brain Diseases, Cat Diseases, Cats, Dog Diseases, Dogs
- Study design: narrative_review
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

### B. Antibiotic effects on the canine microbiome

Query: `"Dogs"[Mesh] AND ("antibiotic"[Title/Abstract] OR "antimicrobial"[Title/Abstract] OR "metronidazole"[Title/Abstract] OR "tylosin"[Title/Abstract]) AND ("microbiome change"[Title/Abstract] OR "microbiota change"[Title/Abstract] OR "microbiome composition"[Title/Abstract] OR "microbial diversity"[Title/Abstract] OR "dysbiosis"[Title/Abstract]) AND ("Gastrointestinal Microbiome"[Mesh]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Evidence-based use of biotics in the management of gastrointestinal disorders in dogs and cats.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/39545596/)
- OA full text: not available; abstract-only
- DOI: 10.1002/vetr.4916 · PMID: 39545596 · PMCID: not supplied
- Journal/year: The Veterinary record · 2024
- Publication types: Journal Article, Review
- MeSH headings: Animals, Dogs, Cats, Dog Diseases, Cat Diseases, Gastrointestinal Diseases, Evidence-Based Medicine, Probiotics, Gastrointestinal Microbiome, Prebiotics
- Study design: narrative_review
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

#### 2. Beneficial effects of probiotics on dysbiosis of gut microbiota induced by antibiotic treatment in healthy dogs.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/40347600/)
- OA full text: not available; abstract-only
- DOI: 10.1016/j.rvsc.2025.105674 · PMID: 40347600 · PMCID: not supplied
- Journal/year: Research in veterinary science · 2025
- Publication types: Journal Article
- MeSH headings: Animals, Dogs, Probiotics, Gastrointestinal Microbiome, Dysbiosis, Anti-Bacterial Agents, Male, Feces
- Study design: other
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

### B. Breed, age and geographic microbiome variation

Query: `"Dogs"[Mesh] AND ("breed"[Title/Abstract] OR "age"[Title/Abstract] OR "geographic"[Title/Abstract] OR "geographical"[Title/Abstract]) AND ("gut microbiome"[Title/Abstract] OR "gut microbiota"[Title/Abstract] OR "microbiome variation"[Title/Abstract] OR "Gastrointestinal Microbiome"[Mesh]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Dogs' Microbiome From Tip to Toe.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/34509665/)
- OA full text: not available; abstract-only
- DOI: 10.1016/j.tcam.2021.100584 · PMID: 34509665 · PMCID: not supplied
- Journal/year: Topics in companion animal medicine · 2021
- Publication types: Journal Article, Review
- MeSH headings: Animals, Dogs, Microbiota
- Study design: narrative_review
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

#### 2. Gut microbiota of humans, dogs and cats: current knowledge and future opportunities and challenges.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/25414978/)
- OA full text: not available; abstract-only
- DOI: 10.1017/s0007114514002943 · PMID: 25414978 · PMCID: not supplied
- Journal/year: The British journal of nutrition · 2015
- Publication types: Journal Article, Review
- MeSH headings: Animal Welfare, Animals, Cats, Diet, Dogs, Gastrointestinal Tract, Health Promotion, Humans, Intestinal Mucosa, Intestines, Microbiota, Nutrition Policy, Pets, Species Specificity
- Study design: narrative_review
- Species: dog (Dogs, Cats, Humans)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

### B. Commercial canine microbiome test reproducibility and validity

Query: `"Dogs"[Mesh] AND ("microbiome test"[Title/Abstract] OR "dysbiosis index"[Title/Abstract] OR "microbiome assay"[Title/Abstract] OR "Gastrointestinal Microbiome"[Mesh]) AND ("reproducibility"[Title/Abstract] OR "repeatability"[Title/Abstract] OR "clinical validity"[Title/Abstract] OR "validation"[Title/Abstract] OR "Reproducibility of Results"[Mesh]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Analysis of the gut microbiome in dogs and cats.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/34514619/)
- OA full text: [Europe PMC](https://europepmc.org/articles/PMC9292158)
- DOI: 10.1111/vcp.13031 · PMID: 34514619 · PMCID: PMC9292158
- Journal/year: Veterinary clinical pathology · 2022
- Publication types: Journal Article, Review
- MeSH headings: Animals, Cat Diseases, Cats, Dog Diseases, Dogs, Dysbiosis, Feces, Gastrointestinal Microbiome
- Study design: narrative_review
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: DISCLOSURE The author is an employee of the Gastrointestinal Laboratory at Texas A&M University that offers microbiome and gastrointestinal function testing on a fee‐for‐service basis.
- Funding independent: not supplied
- Preprint: no · Open-access full text: yes · Abstract only: no
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Europe PMC fullTextXML: JATS funding-group and structured competing-interest declaration
  - is_preprint = false — PubMed PublicationTypeList
- Deduplication: duplicate of MED:34514619 (title similarity 1)

#### 2. A dysbiosis index to assess microbial changes in fecal samples of dogs with chronic inflammatory enteropathy.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/29040443/)
- OA full text: not available; abstract-only
- DOI: 10.1093/femsec/fix136 · PMID: 29040443 · PMCID: not supplied
- Journal/year: FEMS microbiology ecology · 2017
- Publication types: Journal Article
- MeSH headings: Algorithms, Animals, Bacteria, Dog Diseases, Dogs, Dysbiosis, Feces, Female, Inflammatory Bowel Diseases, Male, Microbiota, Real-Time Polymerase Chain Reaction
- Study design: other
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

### B. Microbiome sampling and sequencing methodology

Query: `"Dogs"[Mesh] AND ("16S"[Title/Abstract] OR "shotgun metagenomic"[Title/Abstract] OR "microbiome sample"[Title/Abstract] OR "fecal sample"[Title/Abstract] OR "faecal sample"[Title/Abstract] OR "Gastrointestinal Microbiome"[Mesh]) AND ("sampling"[Title/Abstract] OR "sequencing"[Title/Abstract] OR "method"[Title/Abstract] OR "storage"[Title/Abstract] OR "reproducibility"[Title/Abstract] OR "Sequence Analysis, DNA"[Mesh] OR "Specimen Handling"[Mesh]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Analysis of the gut microbiome in dogs and cats.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/34514619/)
- OA full text: [Europe PMC](https://europepmc.org/articles/PMC9292158)
- DOI: 10.1111/vcp.13031 · PMID: 34514619 · PMCID: PMC9292158
- Journal/year: Veterinary clinical pathology · 2022
- Publication types: Journal Article, Review
- MeSH headings: Animals, Cat Diseases, Cats, Dog Diseases, Dogs, Dysbiosis, Feces, Gastrointestinal Microbiome
- Study design: narrative_review
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: DISCLOSURE The author is an employee of the Gastrointestinal Laboratory at Texas A&M University that offers microbiome and gastrointestinal function testing on a fee‐for‐service basis.
- Funding independent: not supplied
- Preprint: no · Open-access full text: yes · Abstract only: no
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Europe PMC fullTextXML: JATS funding-group and structured competing-interest declaration
  - is_preprint = false — PubMed PublicationTypeList
- Deduplication: duplicate of MED:34514619 (title similarity 1)

#### 2. Cross-comparison of gut metagenomic profiling strategies.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/39505993/)
- OA full text: [Europe PMC](https://europepmc.org/articles/PMC11541596)
- DOI: 10.1038/s42003-024-07158-6 · PMID: 39505993 · PMCID: PMC11541596
- Journal/year: Communications biology · 2024
- Publication types: Journal Article, Comparative Study, Research Support, Non-U.S. Gov't
- MeSH headings: Metagenomics, Animals, Gastrointestinal Microbiome, Dogs, Feces, Computational Biology, Software, Sequence Analysis, DNA, High-Throughput Nucleotide Sequencing, Metagenome, Gene Library
- Study design: comparative_study
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: yes · Abstract only: no
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = comparative_study — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Europe PMC fullTextXML: JATS funding-group and structured competing-interest declaration
  - is_preprint = false — PubMed PublicationTypeList

### C. Cutaneous adverse food reaction

Query: `"Dogs"[Mesh] AND ("cutaneous adverse food reaction"[Title/Abstract]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Results of food challenge in dogs with cutaneous adverse food reactions.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/33830555/)
- OA full text: not available; abstract-only
- DOI: 10.1111/vde.12953 · PMID: 33830555 · PMCID: not supplied
- Journal/year: Veterinary dermatology · 2021
- Publication types: Journal Article
- MeSH headings: Allergens, Animals, Dog Diseases, Dogs, Food Hypersensitivity, Pruritus, Retrospective Studies
- Study design: other
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

#### 2. IgE reactivity to milk components in dogs with cutaneous adverse food reactions.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/34373420/)
- OA full text: [Europe PMC](https://europepmc.org/articles/PMC8569881)
- DOI: 10.1292/jvms.21-0162 · PMID: 34373420 · PMCID: PMC8569881
- Journal/year: The Journal of veterinary medical science · 2021
- Publication types: Journal Article
- MeSH headings: Allergens, Animals, Cattle, Cattle Diseases, Dog Diseases, Dogs, Immunoglobulin E, Lactoglobulins, Milk, Milk Hypersensitivity
- Study design: other
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: yes · Abstract only: no
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Europe PMC fullTextXML: JATS funding-group and structured competing-interest declaration
  - is_preprint = false — PubMed PublicationTypeList

### C. Food allergy versus intolerance

Query: `"Dogs"[Mesh] AND ("food allergy intolerance"[Title/Abstract] OR "adverse food reaction"[Title/Abstract]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Adverse Food Reactions in Dogs and Cats.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/41391959/)
- OA full text: not available; abstract-only
- DOI: 10.1016/j.cvsm.2025.11.003 · PMID: 41391959 · PMCID: not supplied
- Journal/year: The Veterinary clinics of North America. Small animal practice · 2026
- Publication types: Journal Article, Review
- MeSH headings: Animals, Cats, Dogs, Cat Diseases, Dog Diseases, Food Hypersensitivity, Animal Feed, Gastrointestinal Diseases
- Study design: narrative_review
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

#### 2. Adverse food reactions: Pathogenesis, clinical signs, diagnosis and alternatives to elimination diets.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/29871756/)
- OA full text: not available; abstract-only
- DOI: 10.1016/j.tvjl.2018.04.014 · PMID: 29871756 · PMCID: not supplied
- Journal/year: Veterinary journal (London, England : 1997) · 2018
- Publication types: Journal Article, Review
- MeSH headings: Allergens, Animals, Cat Diseases, Cats, Diet, Dog Diseases, Dogs, Food Hypersensitivity
- Study design: narrative_review
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

### C. Elimination diet trial methodology and duration

Query: `"Dogs"[Mesh] AND ("elimination diet trial"[Title/Abstract] OR "elimination diet duration"[Title/Abstract]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Adverse Food Reactions in Dogs and Cats.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/41391959/)
- OA full text: not available; abstract-only
- DOI: 10.1016/j.cvsm.2025.11.003 · PMID: 41391959 · PMCID: not supplied
- Journal/year: The Veterinary clinics of North America. Small animal practice · 2026
- Publication types: Journal Article, Review
- MeSH headings: Animals, Cats, Dogs, Cat Diseases, Dog Diseases, Food Hypersensitivity, Animal Feed, Gastrointestinal Diseases
- Study design: narrative_review
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList
- Deduplication: duplicate of MED:41391959 (title similarity 1)

#### 2. An open-label clinical trial to evaluate the efficacy of an elemental diet for the diagnosis of adverse food reactions in dogs.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/37621253/)
- OA full text: not available; abstract-only
- DOI: 10.1111/vde.13198 · PMID: 37621253 · PMCID: not supplied
- Journal/year: Veterinary dermatology · 2024
- Publication types: Journal Article
- MeSH headings: Humans, Dogs, Animals, Food Hypersensitivity, Prospective Studies, Animal Feed, Dog Diseases, Pruritus, Allergens
- Study design: other
- Species: dog (Dogs, Humans)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

### C. Hydrolysed protein diets

Query: `"Dogs"[Mesh] AND ("hydrolysed protein diet"[Title/Abstract] OR "hydrolyzed protein diet"[Title/Abstract]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. The Use of Diets in the Diagnosis and Treatment of Common Gastrointestinal Diseases in Dogs and Cats.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/38625524/)
- OA full text: not available; abstract-only
- DOI: 10.1007/978-3-031-54192-6_3 · PMID: 38625524 · PMCID: 9308422
- Journal/year: Advances in experimental medicine and biology · 2024
- Publication types: Journal Article
- MeSH headings: Cats, Dogs, Humans, Animals, Cat Diseases, Acute Disease, Pancreatitis, Dog Diseases, Diet, Gastrointestinal Diseases, Diarrhea, Inflammatory Bowel Diseases
- Study design: other
- Species: dog (Dogs, Cats, Humans)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Not fetched: Gate 1 OA enrichment cap of 30 reached
  - is_preprint = false — PubMed PublicationTypeList

#### 2. Effects of metronidazole on the fecal microbiome and metabolome in healthy dogs.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/32856349/)
- OA full text: [Europe PMC](https://europepmc.org/articles/PMC7517498)
- DOI: 10.1111/jvim.15871 · PMID: 32856349 · PMCID: PMC7517498
- Journal/year: Journal of veterinary internal medicine · 2020
- Publication types: Clinical Trial, Veterinary, Journal Article
- MeSH headings: Animals, Dogs, Feces, Metabolome, Metronidazole, Microbiota, Prospective Studies, RNA, Ribosomal, 16S
- Study design: clinical_trial
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: CONFLICT OF INTEREST DECLARATION Rachel Pilla, Amanda B. Blake, Mohammad R. Khattab, Jonathan A. Lidbury, Jörg M. Steiner, and Jan S. Suchodolski are employed by the Gastrointestinal Laboratory at Texas A&M University, which provides assay for intestinal function and microbiota analysis on a fee‐for‐service basis. Frederic P. Gaschen, James W. Barr, Erin Olson, Julia Honneffer, Blake C. Guard, Dean Villanueva, and Mustafa K. AlShawaqfeh have no conflicts to declare.
- Funding independent: not supplied
- Preprint: no · Open-access full text: yes · Abstract only: no
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = clinical_trial — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Europe PMC fullTextXML: JATS funding-group and structured competing-interest declaration
  - is_preprint = false — PubMed PublicationTypeList

### C. Novel protein diets

Query: `"Dogs"[Mesh] AND ("novel protein diet"[Title/Abstract]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Dietary and Nutritional Approaches to the Management of Chronic Enteropathy in Dogs and Cats.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/33131914/)
- OA full text: not available; abstract-only
- DOI: 10.1016/j.cvsm.2020.09.005 · PMID: 33131914 · PMCID: not supplied
- Journal/year: The Veterinary clinics of North America. Small animal practice · 2021
- Publication types: Journal Article, Review
- MeSH headings: Animals, Cat Diseases, Cats, Diet, Dog Diseases, Dogs, Nutritional Requirements, Protein-Losing Enteropathies
- Study design: narrative_review
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList
- Deduplication: duplicate of MED:33131914 (title similarity 1)

#### 2. Undeclared animal species in dry and wet novel and hydrolyzed protein diets for dogs and cats detected by microarray analysis.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/29945610/)
- OA full text: [Europe PMC](https://europepmc.org/articles/PMC6020431)
- DOI: 10.1186/s12917-018-1528-7 · PMID: 29945610 · PMCID: PMC6020431
- Journal/year: BMC veterinary research · 2018
- Publication types: Journal Article
- MeSH headings: Animal Feed, Animals, Cats, Chickens, Dogs, Food Contamination, Food Labeling, Meat, Oligonucleotide Array Sequence Analysis, Proteins, Swine, Turkeys
- Study design: other
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: yes · Abstract only: no
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Europe PMC fullTextXML: JATS funding-group and structured competing-interest declaration
  - is_preprint = false — PubMed PublicationTypeList

### C. Commonly reported canine food allergens

Query: `"Dogs"[Mesh] AND ("food allergy"[Title/Abstract] OR "food allergen"[Title/Abstract] OR "adverse food reaction"[Title/Abstract] OR "Food Hypersensitivity"[Mesh]) AND ("beef"[Title/Abstract] OR "dairy"[Title/Abstract] OR "chicken"[Title/Abstract] OR "wheat"[Title/Abstract] OR "lamb"[Title/Abstract] OR "egg"[Title/Abstract] OR "soy"[Title/Abstract]) AND ("Dog Diseases"[Mesh]) NOT ("Infant"[Mesh] OR "Child"[Mesh]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Detection of chicken DNA in commercial dog foods.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/35264164/)
- OA full text: [Europe PMC](https://europepmc.org/articles/PMC8905904)
- DOI: 10.1186/s12917-022-03200-z · PMID: 35264164 · PMCID: PMC8905904
- Journal/year: BMC veterinary research · 2022
- Publication types: Journal Article
- MeSH headings: Animal Feed, Animals, Chickens, DNA, Dog Diseases, Dogs, Food Hypersensitivity, Proteins
- Study design: other
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: yes · Abstract only: no
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Europe PMC fullTextXML: JATS funding-group and structured competing-interest declaration
  - is_preprint = false — PubMed PublicationTypeList

#### 2. Food antigen-specific IgE in dogs with suspected food hypersensitivity.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/33276389/)
- OA full text: not available; abstract-only
- DOI: 10.1055/a-1274-9210 · PMID: 33276389 · PMCID: not supplied
- Journal/year: Tierarztliche Praxis. Ausgabe K, Kleintiere/Heimtiere · 2020
- Publication types: Journal Article
- MeSH headings: Allergens, Animals, Dog Diseases, Dogs, Edible Grain, Food Hypersensitivity, Immunoglobulin E, Immunologic Techniques, Meat, Soy Foods
- Study design: other
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

### C. Food protein cross-reactivity

Query: `"Dogs"[Mesh] AND ("cross-reactivity"[Title/Abstract] OR "cross reactivity"[Title/Abstract]) AND ("food allergy"[Title/Abstract] OR "food allergen"[Title/Abstract] OR "food hypersensitivity"[Title/Abstract] OR "Food Hypersensitivity"[Mesh]) AND ("Food Hypersensitivity"[Mesh]) AND ("Dog Diseases"[Mesh]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Food antigen-specific IgE in dogs with suspected food hypersensitivity.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/33276389/)
- OA full text: not available; abstract-only
- DOI: 10.1055/a-1274-9210 · PMID: 33276389 · PMCID: not supplied
- Journal/year: Tierarztliche Praxis. Ausgabe K, Kleintiere/Heimtiere · 2020
- Publication types: Journal Article
- MeSH headings: Allergens, Animals, Dog Diseases, Dogs, Edible Grain, Food Hypersensitivity, Immunoglobulin E, Immunologic Techniques, Meat, Soy Foods
- Study design: other
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList
- Deduplication: duplicate of MED:33276389 (title similarity 1)

#### 2. Extensive protein hydrolyzation is indispensable to prevent IgE-mediated poultry allergen recognition in dogs and cats.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/28818076/)
- OA full text: [Europe PMC](https://europepmc.org/articles/PMC5561598)
- DOI: 10.1186/s12917-017-1183-4 · PMID: 28818076 · PMCID: PMC5561598
- Journal/year: BMC veterinary research · 2017
- Publication types: Journal Article
- MeSH headings: Allergens, Animal Feed, Animals, Cat Diseases, Cats, Chickens, Dog Diseases, Dogs, Enzyme-Linked Immunosorbent Assay, Epitopes, Feathers, Food Hypersensitivity, Immunoglobulin E
- Study design: other
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: yes · Abstract only: no
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Europe PMC fullTextXML: JATS funding-group and structured competing-interest declaration
  - is_preprint = false — PubMed PublicationTypeList

### C. Validity of serum IgE and IgG food-sensitivity testing

Query: `"Dogs"[Mesh] AND ("IgE"[Title/Abstract] OR "IgG"[Title/Abstract] OR "serology"[Title/Abstract] OR "Immunoglobulin E"[Mesh] OR "Immunoglobulin G"[Mesh]) AND ("food allergy"[Title/Abstract] OR "food sensitivity"[Title/Abstract] OR "adverse food reaction"[Title/Abstract] OR "Food Hypersensitivity"[Mesh]) AND ("Dog Diseases"[Mesh]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Dietary hypersensitivity in cats and dogs.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/21073096/)
- OA full text: not available; abstract-only
- DOI: not supplied · PMID: 21073096 · PMCID: not supplied
- Journal/year: Tijdschrift voor diergeneeskunde · 2010
- Publication types: Journal Article, Review
- MeSH headings: Animals, Cat Diseases, Cats, Diagnosis, Differential, Dog Diseases, Dogs, Food Hypersensitivity, Immunoglobulin E, Inflammatory Bowel Diseases
- Study design: narrative_review
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

#### 2. Food antigen-specific IgE in dogs with suspected food hypersensitivity.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/33276389/)
- OA full text: not available; abstract-only
- DOI: 10.1055/a-1274-9210 · PMID: 33276389 · PMCID: not supplied
- Journal/year: Tierarztliche Praxis. Ausgabe K, Kleintiere/Heimtiere · 2020
- Publication types: Journal Article
- MeSH headings: Allergens, Animals, Dog Diseases, Dogs, Edible Grain, Food Hypersensitivity, Immunoglobulin E, Immunologic Techniques, Meat, Soy Foods
- Study design: other
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList
- Deduplication: duplicate of MED:33276389 (title similarity 1)

### C. Validity of saliva and hair sensitivity testing

Query: `"Dogs"[Mesh] AND ("saliva"[Title/Abstract] OR "hair"[Title/Abstract]) AND ("food sensitivity test"[Title/Abstract] OR "food allergy test"[Title/Abstract] OR "adverse food reaction"[Title/Abstract] OR "Food Hypersensitivity"[Mesh]) AND ("Dog Diseases"[Mesh]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Adverse Food Reactions in Dogs and Cats.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/41391959/)
- OA full text: not available; abstract-only
- DOI: 10.1016/j.cvsm.2025.11.003 · PMID: 41391959 · PMCID: not supplied
- Journal/year: The Veterinary clinics of North America. Small animal practice · 2026
- Publication types: Journal Article, Review
- MeSH headings: Animals, Cats, Dogs, Cat Diseases, Dog Diseases, Food Hypersensitivity, Animal Feed, Gastrointestinal Diseases
- Study design: narrative_review
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList
- Deduplication: duplicate of MED:41391959 (title similarity 1)

#### 2. Adverse food reactions: Pathogenesis, clinical signs, diagnosis and alternatives to elimination diets.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/29871756/)
- OA full text: not available; abstract-only
- DOI: 10.1016/j.tvjl.2018.04.014 · PMID: 29871756 · PMCID: not supplied
- Journal/year: Veterinary journal (London, England : 1997) · 2018
- Publication types: Journal Article, Review
- MeSH headings: Allergens, Animals, Cat Diseases, Cats, Diet, Dog Diseases, Dogs, Food Hypersensitivity
- Study design: narrative_review
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList
- Deduplication: duplicate of MED:29871756 (title similarity 1)

### C. Patch testing for canine food reaction

Query: `"Dogs"[Mesh] AND ("patch test"[Title/Abstract] OR "patch testing"[Title/Abstract] OR "Patch Tests"[Mesh]) AND ("food allergy"[Title/Abstract] OR "food reaction"[Title/Abstract] OR "food hypersensitivity"[Title/Abstract] OR "Food Hypersensitivity"[Mesh]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Combined prick and patch tests for diagnosis of food hypersensitivity in dogs with chronic pruritus.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/35014738/)
- OA full text: not available; abstract-only
- DOI: 10.1111/vde.13055 · PMID: 35014738 · PMCID: not supplied
- Journal/year: Veterinary dermatology · 2022
- Publication types: Journal Article
- MeSH headings: Animals, Dermatitis, Atopic, Dog Diseases, Dogs, Food Hypersensitivity, Humans, Patch Tests, Pruritus
- Study design: other
- Species: dog (Dogs, Humans)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

#### 2. Adverse food reactions: Pathogenesis, clinical signs, diagnosis and alternatives to elimination diets.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/29871756/)
- OA full text: not available; abstract-only
- DOI: 10.1016/j.tvjl.2018.04.014 · PMID: 29871756 · PMCID: not supplied
- Journal/year: Veterinary journal (London, England : 1997) · 2018
- Publication types: Journal Article, Review
- MeSH headings: Allergens, Animals, Cat Diseases, Cats, Diet, Dog Diseases, Dogs, Food Hypersensitivity
- Study design: narrative_review
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList
- Deduplication: duplicate of MED:29871756 (title similarity 1)

### C. Undeclared and mislabelled ingredients in commercial and elimination diets

Query: `"Dogs"[Mesh] AND ("undeclared ingredient"[Title/Abstract] OR "mislabelled ingredient"[Title/Abstract] OR "mislabeled ingredient"[Title/Abstract] OR "label discrepancy"[Title/Abstract] OR "Food Labeling"[Mesh]) AND ("pet food"[Title/Abstract] OR "dog food"[Title/Abstract] OR "elimination diet"[Title/Abstract]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Nutritional concepts for the veterinary practitioner.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/24951339/)
- OA full text: not available; abstract-only
- DOI: 10.1016/j.cvsm.2014.03.009 · PMID: 24951339 · PMCID: not supplied
- Journal/year: The Veterinary clinics of North America. Small animal practice · 2014
- Publication types: Journal Article, Review
- MeSH headings: Animal Feed, Animal Nutritional Physiological Phenomena, Animals, Cat Diseases, Cats, Diet, Dog Diseases, Dogs, Food Labeling, Nutrition Assessment, Nutritional Requirements
- Study design: narrative_review
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

#### 2. Undeclared animal species in dry and wet novel and hydrolyzed protein diets for dogs and cats detected by microarray analysis.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/29945610/)
- OA full text: [Europe PMC](https://europepmc.org/articles/PMC6020431)
- DOI: 10.1186/s12917-018-1528-7 · PMID: 29945610 · PMCID: PMC6020431
- Journal/year: BMC veterinary research · 2018
- Publication types: Journal Article
- MeSH headings: Animal Feed, Animals, Cats, Chickens, Dogs, Food Contamination, Food Labeling, Meat, Oligonucleotide Array Sequence Analysis, Proteins, Swine, Turkeys
- Study design: other
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: yes · Abstract only: no
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Europe PMC fullTextXML: JATS funding-group and structured competing-interest declaration
  - is_preprint = false — PubMed PublicationTypeList
- Deduplication: duplicate of MED:29945610 (title similarity 1)

### C. Canine atopic dermatitis and diet

Query: `"Dogs"[Mesh] AND ("atopic dermatitis"[Title/Abstract] OR "Dermatitis, Atopic"[Mesh]) AND ("diet"[Title/Abstract] OR "food allergy"[Title/Abstract] OR "food reaction"[Title/Abstract] OR "nutrition"[Title/Abstract] OR "Food Hypersensitivity"[Mesh] OR "Diet"[Mesh]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Canine atopic dermatitis: detailed guidelines for diagnosis and allergen identification.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/26260508/)
- OA full text: [Europe PMC](https://europepmc.org/articles/PMC4531508)
- DOI: 10.1186/s12917-015-0515-5 · PMID: 26260508 · PMCID: PMC4531508
- Journal/year: BMC veterinary research · 2015
- Publication types: Journal Article, Review
- MeSH headings: Allergens, Animals, Dermatitis, Atopic, Dog Diseases, Dogs, Practice Guidelines as Topic
- Study design: narrative_review
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: Competing interests The authors declare that they have no competing interests.
- Funding independent: not supplied
- Preprint: no · Open-access full text: yes · Abstract only: no
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Europe PMC fullTextXML: JATS funding-group and structured competing-interest declaration
  - is_preprint = false — PubMed PublicationTypeList

#### 2. 2023 AAHA Management of Allergic Skin Diseases in Dogs and Cats Guidelines.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/37883677/)
- OA full text: not available; abstract-only
- DOI: 10.5326/jaaha-ms-7396 · PMID: 37883677 · PMCID: not supplied
- Journal/year: Journal of the American Animal Hospital Association · 2023
- Publication types: Journal Article
- MeSH headings: Humans, Animals, Cats, Dogs, Dermatitis, Atopic, Cat Diseases, Dog Diseases, Pruritus, Food Hypersensitivity, Allergens
- Study design: other
- Species: dog (Dogs, Cats, Humans)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

### C. Storage mite contamination

Query: `"Dogs"[Mesh] AND ("storage mite"[Title/Abstract] OR "Tyrophagus"[Title/Abstract] OR "Acarus siro"[Title/Abstract]) AND ("food"[Title/Abstract] OR "feed"[Title/Abstract] OR "diet"[Title/Abstract] OR "contamination"[Title/Abstract] OR "Food Contamination"[Mesh]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Tyrophagus putrescentiae mites grown in dog food cultures and the effect mould growth has on mite survival and reproduction.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/19719462/)
- OA full text: not available; abstract-only
- DOI: 10.1111/j.1365-3164.2009.00778.x · PMID: 19719462 · PMCID: not supplied
- Journal/year: Veterinary dermatology · 2010
- Publication types: Journal Article
- MeSH headings: Animal Feed, Animals, Dogs, Female, Fungi, Mites, Reproduction
- Study design: other
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

#### 2. House dust and storage mite contamination of dry dog food stored in open bags and sealed boxes in 10 domestic households.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/21106038/)
- OA full text: not available; abstract-only
- DOI: 10.1111/j.1365-3164.2010.00931.x · PMID: 21106038 · PMCID: not supplied
- Journal/year: Veterinary dermatology · 2011
- Publication types: Journal Article
- MeSH headings: Acaridae, Allergens, Animal Feed, Animals, Antigens, Dermatophagoides, Arthropod Proteins, Cysteine Endopeptidases, Dermatitis, Atopic, Dog Diseases, Dogs, Dust, Food Contamination, Humidity, Pyroglyphidae, Temperature
- Study design: other
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

### C. Provocation and rechallenge protocols

Query: `"Dogs"[Mesh] AND ("provocation"[Title/Abstract] OR "rechallenge"[Title/Abstract] OR "challenge test"[Title/Abstract]) AND ("food allergy"[Title/Abstract] OR "elimination diet"[Title/Abstract] OR "adverse food reaction"[Title/Abstract] OR "Food Hypersensitivity"[Mesh]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Food allergy in dogs and cats; current perspectives on etiology, diagnosis, and management.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/36917613/)
- OA full text: not available; abstract-only
- DOI: 10.2460/javma.22.12.0548 · PMID: 36917613 · PMCID: not supplied
- Journal/year: Journal of the American Veterinary Medical Association · 2023
- Publication types: Journal Article
- MeSH headings: Cats, Animals, Dogs, Cat Diseases, Dog Diseases, Food Hypersensitivity, Pruritus, Urticaria
- Study design: other
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

#### 2. Adverse Food Reactions in Dogs and Cats.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/41391959/)
- OA full text: not available; abstract-only
- DOI: 10.1016/j.cvsm.2025.11.003 · PMID: 41391959 · PMCID: not supplied
- Journal/year: The Veterinary clinics of North America. Small animal practice · 2026
- Publication types: Journal Article, Review
- MeSH headings: Animals, Cats, Dogs, Cat Diseases, Dog Diseases, Food Hypersensitivity, Animal Feed, Gastrointestinal Diseases
- Study design: narrative_review
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList
- Deduplication: duplicate of MED:41391959 (title similarity 1)

### D. Chronic enteropathy and food-responsive enteropathy

Query: `"Dogs"[Mesh] AND ("chronic enteropathy"[Title/Abstract] OR "food-responsive enteropathy"[Title/Abstract]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Value of Probiotics in Canine and Feline Gastroenterology.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/33187621/)
- OA full text: not available; abstract-only
- DOI: 10.1016/j.cvsm.2020.09.011 · PMID: 33187621 · PMCID: not supplied
- Journal/year: The Veterinary clinics of North America. Small animal practice · 2021
- Publication types: Journal Article, Review
- MeSH headings: Animals, Cat Diseases, Cats, Diarrhea, Dog Diseases, Dogs, Inflammatory Bowel Diseases, Probiotics
- Study design: narrative_review
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList
- Deduplication: duplicate of MED:33187621 (title similarity 1)

#### 2. Narrative review of therapies for chronic enteropathies in dogs and cats.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/30523666/)
- OA full text: [Europe PMC](https://europepmc.org/articles/PMC6335544)
- DOI: 10.1111/jvim.15345 · PMID: 30523666 · PMCID: PMC6335544
- Journal/year: Journal of veterinary internal medicine · 2019
- Publication types: Journal Article, Review
- MeSH headings: Animals, Anti-Infective Agents, Cat Diseases, Cats, Chronic Disease, Complementary Therapies, Dog Diseases, Dogs, Immunosuppressive Agents, Intestinal Diseases
- Study design: narrative_review
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: yes · Abstract only: no
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Europe PMC fullTextXML: JATS funding-group and structured competing-interest declaration
  - is_preprint = false — PubMed PublicationTypeList

### D. Canine inflammatory bowel disease

Query: `"Dogs"[Mesh] AND ("inflammatory bowel disease"[Title/Abstract]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Comparative pathophysiology and management of protein-losing enteropathy.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/30762910/)
- OA full text: [Europe PMC](https://europepmc.org/articles/PMC6430879)
- DOI: 10.1111/jvim.15406 · PMID: 30762910 · PMCID: PMC6430879
- Journal/year: Journal of veterinary internal medicine · 2019
- Publication types: Journal Article, Review
- MeSH headings: Animals, Dog Diseases, Dogs, Humans, Inflammatory Bowel Diseases, Lymphangiectasis, Intestinal, Lymphatic System, Protein-Losing Enteropathies
- Study design: narrative_review
- Species: dog (Dogs, Humans)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: yes · Abstract only: no
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Europe PMC fullTextXML: JATS funding-group and structured competing-interest declaration
  - is_preprint = false — PubMed PublicationTypeList

#### 2. Value of Probiotics in Canine and Feline Gastroenterology.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/33187621/)
- OA full text: not available; abstract-only
- DOI: 10.1016/j.cvsm.2020.09.011 · PMID: 33187621 · PMCID: not supplied
- Journal/year: The Veterinary clinics of North America. Small animal practice · 2021
- Publication types: Journal Article, Review
- MeSH headings: Animals, Cat Diseases, Cats, Diarrhea, Dog Diseases, Dogs, Inflammatory Bowel Diseases, Probiotics
- Study design: narrative_review
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList
- Deduplication: duplicate of MED:33187621 (title similarity 1)

### D. Exocrine pancreatic insufficiency

Query: `"Dogs"[Mesh] AND ("exocrine pancreatic insufficiency"[Title/Abstract]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Exocrine pancreatic insufficiency in dogs and cats.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/37944252/)
- OA full text: not available; abstract-only
- DOI: 10.2460/javma.23.09.0505 · PMID: 37944252 · PMCID: not supplied
- Journal/year: Journal of the American Veterinary Medical Association · 2024
- Publication types: Journal Article
- MeSH headings: Cats, Dogs, Animals, Cat Diseases, Dysbiosis, Dog Diseases, Exocrine Pancreatic Insufficiency, Pancreas
- Study design: other
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

#### 2. Diabetes mellitus and pancreatitis--cause or effect?

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/25586806/)
- OA full text: not available; abstract-only
- DOI: 10.1111/jsap.12295 · PMID: 25586806 · PMCID: not supplied
- Journal/year: The Journal of small animal practice · 2015
- Publication types: Journal Article, Review
- MeSH headings: Acute Disease, Animals, Cat Diseases, Cats, Chronic Disease, Diabetes Complications, Diabetes Mellitus, Dog Diseases, Dogs, Pancreas
- Study design: narrative_review
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

### D. Acute and chronic pancreatitis and dietary fat

Query: `"Dogs"[Mesh] AND ("pancreatitis"[Title/Abstract] OR "Pancreatitis"[Mesh]) AND ("dietary fat"[Title/Abstract] OR "low fat diet"[Title/Abstract] OR "fat restriction"[Title/Abstract] OR "nutrition"[Title/Abstract] OR "Dietary Fats"[Mesh] OR "Diet Therapy"[Mesh]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Lipid metabolism and hyperlipidemia in dogs.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/19167915/)
- OA full text: not available; abstract-only
- DOI: 10.1016/j.tvjl.2008.10.011 · PMID: 19167915 · PMCID: not supplied
- Journal/year: Veterinary journal (London, England : 1997) · 2010
- Publication types: Journal Article, Review
- MeSH headings: Animals, Diet, Reducing, Dog Diseases, Dogs, Fatty Acids, Omega-3, Hyperlipidemias, Hypertriglyceridemia, Hypolipidemic Agents, Lipid Metabolism, Liver Diseases, Niacin, Obesity, Pancreatitis
- Study design: narrative_review
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList
- Deduplication: duplicate of MED:19167915 (title similarity 1)

#### 2. Nutritional management of pancreatitis and concurrent disease in dogs and cats.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/38569533/)
- OA full text: not available; abstract-only
- DOI: 10.2460/javma.23.11.0641 · PMID: 38569533 · PMCID: not supplied
- Journal/year: Journal of the American Veterinary Medical Association · 2024
- Publication types: Journal Article, Review
- MeSH headings: Animals, Cats, Dogs, Cat Diseases, Pancreatitis, Dog Diseases, Animal Nutritional Physiological Phenomena, Animal Feed, Diet
- Study design: narrative_review
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

### D. Chronic kidney disease protein and phosphorus restriction

Query: `"Dogs"[Mesh] AND ("chronic kidney disease"[Title/Abstract] OR "chronic renal disease"[Title/Abstract] OR "renal insufficiency"[Title/Abstract] OR "Renal Insufficiency, Chronic"[Mesh]) AND ("protein restriction"[Title/Abstract] OR "phosphorus restriction"[Title/Abstract] OR "renal diet"[Title/Abstract] OR "diet therapy"[Title/Abstract] OR "Diet Therapy"[Mesh] OR "Dietary Proteins"[Mesh] OR "Phosphorus"[Mesh]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Chronic kidney disease in dogs and cats.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/22720808/)
- OA full text: not available; abstract-only
- DOI: 10.1016/j.cvsm.2012.04.008 · PMID: 22720808 · PMCID: not supplied
- Journal/year: The Veterinary clinics of North America. Small animal practice · 2012
- Publication types: Journal Article, Review
- MeSH headings: Acid-Base Imbalance, Animals, Cat Diseases, Cats, Disease Progression, Dog Diseases, Dogs, Kidney Failure, Chronic, Nutritional Support, Prevalence, Water-Electrolyte Imbalance
- Study design: narrative_review
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

#### 2. Update on Mineral and Bone Disorders in Chronic Kidney Disease.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/27436330/)
- OA full text: not available; abstract-only
- DOI: 10.1016/j.cvsm.2016.06.003 · PMID: 27436330 · PMCID: not supplied
- Journal/year: The Veterinary clinics of North America. Small animal practice · 2016
- Publication types: Journal Article, Review
- MeSH headings: Animals, Cat Diseases, Cats, Chronic Kidney Disease-Mineral and Bone Disorder, Dog Diseases, Dogs, Renal Insufficiency, Chronic
- Study design: narrative_review
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

### D. Struvite, calcium oxalate and urate urolithiasis

Query: `"Dogs"[Mesh] AND ("struvite"[Title/Abstract] OR "calcium oxalate"[Title/Abstract] OR "urate"[Title/Abstract] OR "urolithiasis"[Title/Abstract] OR "Urolithiasis"[Mesh]) AND ("diet"[Title/Abstract] OR "nutrition"[Title/Abstract] OR "dissolution"[Title/Abstract] OR "prevention"[Title/Abstract] OR "Diet Therapy"[Mesh]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Urolithiasis.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/26002797/)
- OA full text: not available; abstract-only
- DOI: 10.1016/j.cvsm.2015.03.001 · PMID: 26002797 · PMCID: not supplied
- Journal/year: The Veterinary clinics of North America. Small animal practice · 2015
- Publication types: Journal Article, Review
- MeSH headings: Animals, Cat Diseases, Cats, Dog Diseases, Dogs, Urolithiasis
- Study design: narrative_review
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

#### 2. ACVIM Small Animal Consensus Recommendations on the Treatment and Prevention of Uroliths in Dogs and Cats.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/27611724/)
- OA full text: [Europe PMC](https://europepmc.org/articles/PMC5032870)
- DOI: 10.1111/jvim.14559 · PMID: 27611724 · PMCID: PMC5032870
- Journal/year: Journal of veterinary internal medicine · 2016
- Publication types: Journal Article, Consensus Statement
- MeSH headings: Animals, Cat Diseases, Cats, Dog Diseases, Dogs, Lithotripsy, Societies, Scientific, United States, Urolithiasis, Veterinary Medicine
- Study design: other
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: yes · Abstract only: no
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Europe PMC fullTextXML: JATS funding-group and structured competing-interest declaration
  - is_preprint = false — PubMed PublicationTypeList

### D. Hepatic disease and copper storage

Query: `"Dogs"[Mesh] AND ("copper storage"[Title/Abstract] OR "copper-associated hepatopathy"[Title/Abstract] OR "copper associated hepatopathy"[Title/Abstract] OR "copper hepatopathy"[Title/Abstract] OR "Copper"[Mesh]) AND ("diet"[Title/Abstract] OR "nutrition"[Title/Abstract] OR "copper restriction"[Title/Abstract] OR "liver"[Title/Abstract] OR "hepatic"[Title/Abstract] OR "Liver Diseases"[Mesh]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Canine Copper-Associated Hepatitis.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/28063745/)
- OA full text: not available; abstract-only
- DOI: 10.1016/j.cvsm.2016.11.011 · PMID: 28063745 · PMCID: not supplied
- Journal/year: The Veterinary clinics of North America. Small animal practice · 2017
- Publication types: Journal Article, Review
- MeSH headings: Animals, Biomarkers, Chelating Agents, Copper, Dog Diseases, Dogs, Hepatitis, Animal, Humans, Penicillamine
- Study design: narrative_review
- Species: dog (Dogs, Humans)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

#### 2. Copper-associated Chronic Hepatitis in Dogs.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/41076361/)
- OA full text: not available; abstract-only
- DOI: 10.1016/j.cvsm.2025.08.010 · PMID: 41076361 · PMCID: not supplied
- Journal/year: The Veterinary clinics of North America. Small animal practice · 2025
- Publication types: Journal Article, Review
- MeSH headings: Animals, Dogs, Dog Diseases, Copper, Hepatitis, Chronic, Genetic Predisposition to Disease
- Study design: narrative_review
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

### D. Diabetes mellitus and dietary fibre

Query: `"Dogs"[Mesh] AND ("diabetes mellitus"[Title/Abstract] OR "Diabetes Mellitus"[Mesh]) AND ("dietary fibre"[Title/Abstract] OR "dietary fiber"[Title/Abstract] OR "high fibre diet"[Title/Abstract] OR "high fiber diet"[Title/Abstract] OR "Dietary Fiber"[Mesh]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Effect of a homemade diet compared to a commercial diet on glycaemic variability and glycaemic control assessed by continuous glucose monitoring system in diabetic dogs: a randomised crossover study.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/40843644/)
- OA full text: [Europe PMC](https://europepmc.org/articles/PMC12883309)
- DOI: 10.1111/jsap.70022 · PMID: 40843644 · PMCID: PMC12883309
- Journal/year: The Journal of small animal practice · 2026
- Publication types: Journal Article, Randomized Controlled Trial, Veterinary
- MeSH headings: Animals, Dogs, Cross-Over Studies, Male, Female, Blood Glucose, Dog Diseases, Animal Feed, Glycemic Control, Diabetes Mellitus, Diet, Prospective Studies, Dietary Fiber, Insulin, Continuous Glucose Monitoring
- Study design: rct
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: Conflict of interest No conflicts of interest have been declared.
- Funding independent: not supplied
- Preprint: no · Open-access full text: yes · Abstract only: no
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **B**
- Grading inputs complete: **no**
- Missing grading inputs: sample_size, funding_independent
- Grading input provenance:
  - study_design = rct — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Europe PMC fullTextXML: JATS funding-group and structured competing-interest declaration
  - is_preprint = false — PubMed PublicationTypeList

#### 2. Effects of pea with barley and less-processed maize on glycaemic control in diabetic dogs.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/30132436/)
- OA full text: not available; abstract-only
- DOI: 10.1017/s000711451800171x · PMID: 30132436 · PMCID: not supplied
- Journal/year: The British journal of nutrition · 2018
- Publication types: Clinical Trial, Veterinary, Comparative Study, Journal Article, Research Support, Non-U.S. Gov't
- MeSH headings: Animals, Area Under Curve, Blood Glucose, Diabetes Mellitus, Diet, Dietary Carbohydrates, Dietary Fiber, Dietary Proteins, Dogs, Double-Blind Method, Fasting, Female, Fructosamine, Hordeum, Hyperglycemia, Hypoglycemia, Hypoglycemic Agents, Male, Pisum sativum, Random Allocation, Starch, Zea mays
- Study design: comparative_study
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = comparative_study — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

### D. Osteoarthritis, omega-3 and green-lipped mussel

Query: `"Dogs"[Mesh] AND ("osteoarthritis"[Title/Abstract] OR "degenerative joint disease"[Title/Abstract] OR "Osteoarthritis"[Mesh]) AND ("omega-3"[Title/Abstract] OR "fish oil"[Title/Abstract] OR "green-lipped mussel"[Title/Abstract] OR "Perna canaliculus"[Title/Abstract] OR "Fatty Acids, Omega-3"[Mesh]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. A 2022 Systematic Review and Meta-Analysis of Enriched Therapeutic Diets and Nutraceuticals in Canine and Feline Osteoarthritis.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/36142319/)
- OA full text: [Europe PMC](https://europepmc.org/articles/PMC9499673)
- DOI: 10.3390/ijms231810384 · PMID: 36142319 · PMCID: PMC9499673
- Journal/year: International journal of molecular sciences · 2022
- Publication types: Journal Article, Meta-Analysis, Systematic Review
- MeSH headings: Animals, Biological Products, Cannabidiol, Cat Diseases, Cats, Chondroitin, Collagen, Dietary Supplements, Dog Diseases, Dogs, Glucosamine, Osteoarthritis
- Study design: meta_analysis
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: yes · Abstract only: no
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **A**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = meta_analysis — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Europe PMC fullTextXML: JATS funding-group and structured competing-interest declaration
  - is_preprint = false — PubMed PublicationTypeList

#### 2. Exploring the efficacy and optimal dosages of omega-3 supplementation for companion animals.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/40495687/)
- OA full text: not available; abstract-only
- DOI: 10.1017/s0954422425100115 · PMID: 40495687 · PMCID: not supplied
- Journal/year: Nutrition research reviews · 2025
- Publication types: Journal Article, Review
- MeSH headings: Animals, Dogs, Dietary Supplements, Fatty Acids, Omega-3, Pets, Cats, Eicosapentaenoic Acid, Dog Diseases, Osteoarthritis, Cardiovascular Diseases, Cat Diseases, Chronic Disease, Docosahexaenoic Acids, Gastrointestinal Diseases
- Study design: narrative_review
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

### D. Canine cognitive dysfunction and diet

Query: `"Dogs"[Mesh] AND ("cognitive dysfunction"[Title/Abstract] OR "cognitive decline"[Title/Abstract] OR "cognitive aging"[Title/Abstract] OR "Cognitive Dysfunction"[Mesh]) AND ("diet"[Title/Abstract] OR "nutrition"[Title/Abstract] OR "medium chain triglyceride"[Title/Abstract] OR "antioxidant"[Title/Abstract] OR "Diet Therapy"[Mesh]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Nutrition and Aging in Dogs and Cats.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/38625530/)
- OA full text: not available; abstract-only
- DOI: 10.1007/978-3-031-54192-6_9 · PMID: 38625530 · PMCID: 6390407
- Journal/year: Advances in experimental medicine and biology · 2024
- Publication types: Journal Article
- MeSH headings: Cats, Dogs, Animals, Cat Diseases, Quality of Life, Dog Diseases, Aging, Inflammation
- Study design: other
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Not fetched: Gate 1 OA enrichment cap of 30 reached
  - is_preprint = false — PubMed PublicationTypeList
- Deduplication: duplicate of MED:38625530 (title similarity 1)

#### 2. Cognitive dysfunction syndrome: a disease of canine and feline brain aging.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/22720812/)
- OA full text: not available; abstract-only
- DOI: 10.1016/j.cvsm.2012.04.003 · PMID: 22720812 · PMCID: not supplied
- Journal/year: The Veterinary clinics of North America. Small animal practice · 2012
- Publication types: Journal Article, Review
- MeSH headings: Aging, Animals, Behavior, Animal, Cat Diseases, Cats, Cognition, Cognition Disorders, Complementary Therapies, Diet Therapy, Dog Diseases, Dogs, Neuroprotective Agents
- Study design: narrative_review
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

### D. Epilepsy, MCT and ketogenic diets

Query: `"Dogs"[Mesh] AND ("epilepsy"[Title/Abstract] OR "seizure"[Title/Abstract] OR "Epilepsy"[Mesh]) AND ("medium chain triglyceride"[Title/Abstract] OR "MCT diet"[Title/Abstract] OR "ketogenic diet"[Title/Abstract] OR "Diet, Ketogenic"[Mesh] OR "Triglycerides"[Mesh]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Dietary medium chain triglycerides for management of epilepsy: New data from human, dog, and rodent studies.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/34169513/)
- OA full text: [Europe PMC](https://europepmc.org/articles/PMC8453917)
- DOI: 10.1111/epi.16972 · PMID: 34169513 · PMCID: PMC8453917
- Journal/year: Epilepsia · 2021
- Publication types: Journal Article, Research Support, Non-U.S. Gov't, Review
- MeSH headings: Animals, Anticonvulsants, Decanoic Acids, Diet, Ketogenic, Dogs, Epilepsy, Glucose, Humans, Ketone Bodies, Rodentia, Seizures, Triglycerides
- Study design: narrative_review
- Species: dog (Dogs, Humans, Rodents)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: yes · Abstract only: no
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Europe PMC fullTextXML: JATS funding-group and structured competing-interest declaration
  - is_preprint = false — PubMed PublicationTypeList

#### 2. Medium-chain triglycerides dietary supplement improves cognitive abilities in canine epilepsy.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/33268017/)
- OA full text: not available; abstract-only
- DOI: 10.1016/j.yebeh.2020.107608 · PMID: 33268017 · PMCID: not supplied
- Journal/year: Epilepsy & behavior : E&B · 2021
- Publication types: Journal Article, Multicenter Study, Randomized Controlled Trial, Research Support, Non-U.S. Gov't
- MeSH headings: Animals, Cognition, Dietary Supplements, Dogs, Epilepsy, Humans, Prospective Studies, Triglycerides
- Study design: rct
- Species: dog (Dogs, Humans)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **B**
- Grading inputs complete: **no**
- Missing grading inputs: sample_size, funding_independent
- Grading input provenance:
  - study_design = rct — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

### D. Gastric dilatation-volvulus risk and feeding practice

Query: `"Dogs"[Mesh] AND ("gastric dilatation volvulus"[Title/Abstract] OR "gastric dilatation-volvulus"[Title/Abstract] OR "GDV"[Title/Abstract]) AND ("feeding"[Title/Abstract] OR "diet"[Title/Abstract] OR "meal"[Title/Abstract] OR "risk factor"[Title/Abstract] OR "Feeding Behavior"[Mesh]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. An Internet-based survey of risk factors for surgical gastric dilatation-volvulus in dogs.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/22657929/)
- OA full text: not available; abstract-only
- DOI: 10.2460/javma.240.12.1456 · PMID: 22657929 · PMCID: not supplied
- Journal/year: Journal of the American Veterinary Medical Association · 2012
- Publication types: Journal Article
- MeSH headings: Animal Feed, Animals, Cross-Sectional Studies, Digestion, Dog Diseases, Dogs, Female, Gastric Dilatation, Health Surveys, Internet, Intestinal Volvulus, Male, Risk Factors, Sex Factors, Surveys and Questionnaires
- Study design: cross_sectional
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = cross_sectional — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

#### 2. Evaluation of splenectomy as a risk factor for gastric dilatation-volvulus.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/22852571/)
- OA full text: not available; abstract-only
- DOI: 10.2460/javma.241.4.461 · PMID: 22852571 · PMCID: not supplied
- Journal/year: Journal of the American Veterinary Medical Association · 2012
- Publication types: Journal Article
- MeSH headings: Animals, Case-Control Studies, Dog Diseases, Dogs, Female, Gastric Dilatation, Male, Retrospective Studies, Risk Factors, Splenectomy
- Study design: case_control
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **C**
- Grading inputs complete: **no**
- Missing grading inputs: sample_size
- Grading input provenance:
  - study_design = case_control — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

### D. Fibre-responsive large-bowel diarrhoea and colitis

Query: `"Dogs"[Mesh] AND ("large bowel diarrhea"[Title/Abstract] OR "large bowel diarrhoea"[Title/Abstract] OR "colitis"[Title/Abstract] OR "Colitis"[Mesh]) AND ("dietary fibre"[Title/Abstract] OR "dietary fiber"[Title/Abstract] OR "fibre responsive"[Title/Abstract] OR "fiber responsive"[Title/Abstract] OR "Dietary Fiber"[Mesh]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Microbiome function underpins the efficacy of a fiber-supplemented dietary intervention in dogs with chronic large bowel diarrhea.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/35751094/)
- OA full text: [Europe PMC](https://europepmc.org/articles/PMC9233311)
- DOI: 10.1186/s12917-022-03315-3 · PMID: 35751094 · PMCID: PMC9233311
- Journal/year: BMC veterinary research · 2022
- Publication types: Journal Article
- MeSH headings: Animals, Diarrhea, Diet, Dietary Fiber, Dog Diseases, Dogs, Feces, Indoles, Inflammation, Microbiota, Prospective Studies
- Study design: other
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: yes · Abstract only: no
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Europe PMC fullTextXML: JATS funding-group and structured competing-interest declaration
  - is_preprint = false — PubMed PublicationTypeList

#### 2. A prospective multicenter study of the efficacy of a fiber-supplemented dietary intervention in dogs with chronic large bowel diarrhea.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/35751062/)
- OA full text: [Europe PMC](https://europepmc.org/articles/PMC9229818)
- DOI: 10.1186/s12917-022-03302-8 · PMID: 35751062 · PMCID: PMC9229818
- Journal/year: BMC veterinary research · 2022
- Publication types: Journal Article, Multicenter Study
- MeSH headings: Animals, Antioxidants, Diarrhea, Dietary Fiber, Dogs, Nausea, Polyphenols, Prospective Studies, Quality of Life, Vomiting
- Study design: other
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: yes · Abstract only: no
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Europe PMC fullTextXML: JATS funding-group and structured competing-interest declaration
  - is_preprint = false — PubMed PublicationTypeList

### D. Anal sac disease and fibre

Query: `"Dogs"[Mesh] AND ("anal sac"[Title/Abstract] OR "anal gland"[Title/Abstract]) AND ("dietary fibre"[Title/Abstract] OR "dietary fiber"[Title/Abstract] OR "fibre"[Title/Abstract] OR "fiber"[Title/Abstract] OR "diet"[Title/Abstract] OR "Dietary Fiber"[Mesh]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. A Dog's Dinner: Factors affecting food choice and feeding practices for UK dog owners feeding raw meat-based or conventional cooked diets.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/35994979/)
- OA full text: not available; abstract-only
- DOI: 10.1016/j.prevetmed.2022.105741 · PMID: 35994979 · PMCID: not supplied
- Journal/year: Preventive veterinary medicine · 2022
- Publication types: Journal Article
- MeSH headings: Dogs, Animals, Animal Feed, Food Preferences, Diet, Meat, Meals, Surveys and Questionnaires, United Kingdom
- Study design: other
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

#### 2. Efficacy of an oral chew containing fibre and Bacillus velezensis C-3102 in the management of anal sac impaction in dogs.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/39377170/)
- OA full text: [Europe PMC](https://europepmc.org/articles/PMC11696473)
- DOI: 10.1111/vde.13304 · PMID: 39377170 · PMCID: PMC11696473
- Journal/year: Veterinary dermatology · 2025
- Publication types: Journal Article
- MeSH headings: Animals, Dogs, Dog Diseases, Anal Sacs, Male, Female, Bacillus, Probiotics, Dietary Fiber, Administration, Oral, Prospective Studies, Treatment Outcome
- Study design: other
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: yes · Abstract only: no
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Europe PMC fullTextXML: JATS funding-group and structured competing-interest declaration
  - is_preprint = false — PubMed PublicationTypeList

### D. Zinc-responsive dermatosis, skin and coat

Query: `"Dogs"[Mesh] AND ("zinc responsive dermatosis"[Title/Abstract] OR "zinc skin coat"[Title/Abstract]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication])`

#### 1. Pinnal Parakeratotic Hyperkeratosis Consistent With Zinc-Responsive Dermatosis in 16 French Bulldogs.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/41367222/)
- OA full text: not available; abstract-only
- DOI: 10.1111/vde.70039 · PMID: 41367222 · PMCID: not supplied
- Journal/year: Veterinary dermatology · 2026
- Publication types: Journal Article
- MeSH headings: Animals, Dogs, Dog Diseases, Zinc, Male, Female, Retrospective Studies, Parakeratosis, Dietary Supplements, Skin
- Study design: other
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

#### 2. Localized parakeratotic hyperkeratosis in sixteen Boston terrier dogs.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/27620706/)
- OA full text: not available; abstract-only
- DOI: 10.1111/vde.12369 · PMID: 27620706 · PMCID: not supplied
- Journal/year: Veterinary dermatology · 2016
- Publication types: Journal Article
- MeSH headings: Administration, Oral, Animals, Dog Diseases, Dogs, Female, Male, Parakeratosis, Retrospective Studies, Skin Diseases, Skin Diseases, Genetic, Zinc
- Study design: other
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

### D. Dental health and diet

Query: `"Dogs"[Mesh] AND ("dental health"[Title/Abstract] OR "periodontal disease"[Title/Abstract] OR "dental calculus"[Title/Abstract] OR "dental plaque"[Title/Abstract]) AND ("diet"[Title/Abstract] OR "food"[Title/Abstract] OR "feed"[Title/Abstract] OR "chew"[Title/Abstract] OR "Diet"[Mesh]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. A review of the frequency and impact of periodontal disease in dogs.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/32955734/)
- OA full text: not available; abstract-only
- DOI: 10.1111/jsap.13218 · PMID: 32955734 · PMCID: not supplied
- Journal/year: The Journal of small animal practice · 2020
- Publication types: Journal Article, Review
- MeSH headings: Animals, Dog Diseases, Dogs, Periodontal Diseases, Periodontitis, Quality of Life, Retrospective Studies
- Study design: narrative_review
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

#### 2. Diet and Dental Disease in Exotic Companion Mammals.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/40413136/)
- OA full text: not available; abstract-only
- DOI: 10.1016/j.cvex.2025.04.002 · PMID: 40413136 · PMCID: not supplied
- Journal/year: The veterinary clinics of North America. Exotic animal practice · 2025
- Publication types: Journal Article, Review
- MeSH headings: Animals, Diet, Animal Feed, Stomatognathic Diseases, Pets, Dogs, Cats, Animal Nutritional Physiological Phenomena, Rabbits
- Study design: narrative_review
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

### D. Cancer cachexia and nutritional support

Query: `"Dogs"[Mesh] AND ("cancer cachexia"[Title/Abstract] OR "neoplasm cachexia"[Title/Abstract] OR "tumour cachexia"[Title/Abstract] OR "tumor cachexia"[Title/Abstract] OR "Cachexia"[Mesh]) AND ("nutrition"[Title/Abstract] OR "nutritional support"[Title/Abstract] OR "diet"[Title/Abstract] OR "cachexia"[Title/Abstract] OR "Nutritional Support"[Mesh] OR "Neoplasms"[Mesh]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication])`

#### 1. Anorexia and the Cancer Patient.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/31176457/)
- OA full text: not available; abstract-only
- DOI: 10.1016/j.cvsm.2019.04.008 · PMID: 31176457 · PMCID: not supplied
- Journal/year: The Veterinary clinics of North America. Small animal practice · 2019
- Publication types: Journal Article, Review
- MeSH headings: Animals, Anorexia, Antineoplastic Combined Chemotherapy Protocols, Appetite Stimulants, Cachexia, Cannabidiol, Cat Diseases, Cats, Chronic Disease, Dog Diseases, Dogs, Neoplasms, Quality of Life
- Study design: narrative_review
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

#### 2. Cachexia and sarcopenia: emerging syndromes of importance in dogs and cats.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/22111652/)
- OA full text: not available; abstract-only
- DOI: 10.1111/j.1939-1676.2011.00838.x · PMID: 22111652 · PMCID: not supplied
- Journal/year: Journal of veterinary internal medicine · 2012
- Publication types: Journal Article, Review
- MeSH headings: Animals, Cachexia, Cat Diseases, Cats, Dog Diseases, Dogs, Sarcopenia
- Study design: narrative_review
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

### D. Veterinary diet evidence base and label claims

Query: `"Dogs"[Mesh] AND ("therapeutic diet"[Title/Abstract] OR "veterinary diet"[Title/Abstract] OR "prescription diet"[Title/Abstract]) AND ("evidence"[Title/Abstract] OR "efficacy"[Title/Abstract] OR "label claim"[Title/Abstract] OR "clinical trial"[Title/Abstract]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Vegan versus meat-based dog food: Guardian-reported indicators of health.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/35417464/)
- OA full text: [Europe PMC](https://europepmc.org/articles/PMC9007375)
- DOI: 10.1371/journal.pone.0265662 · PMID: 35417464 · PMCID: PMC9007375
- Journal/year: PloS one · 2022
- Publication types: Journal Article, Research Support, Non-U.S. Gov't
- MeSH headings: Animal Feed, Animals, Diet, Diet, Vegan, Dogs, Humans, Meat, Vegans
- Study design: other
- Species: dog (Dogs, Humans)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: Proveg International Oct2019-0000000286 https://orcid.org/0000-0002-9753-6199 Knight Andrew This research and its publication open access was funded by food awareness organisation ProVeg International ( https://proveg.com ). AK received this award ID: Oct2019- 0000000286. However, this funder played no role in study conceptualisation, design, data collection and analysis, preparation of the resultant manuscript nor decisions relating to publication. We are grateful for their financial support.
- Competing-interests declaration: Competing Interests: The authors have declared that no competing interests exist.
- Funding independent: not supplied
- Preprint: no · Open-access full text: yes · Abstract only: no
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Europe PMC fullTextXML: JATS funding-group and structured competing-interest declaration
  - is_preprint = false — PubMed PublicationTypeList

#### 2. Effect of Laparoscopic-assisted Gastropexy on Gastrointestinal Transit Time in Dogs.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/28940749/)
- OA full text: [Europe PMC](https://europepmc.org/articles/PMC5697196)
- DOI: 10.1111/jvim.14816 · PMID: 28940749 · PMCID: PMC5697196
- Journal/year: Journal of veterinary internal medicine · 2017
- Publication types: Journal Article
- MeSH headings: Animals, Dog Diseases, Dogs, Female, Gastrointestinal Transit, Gastropexy, Laparoscopy, Male, Prospective Studies, Stomach Volvulus, Wireless Technology
- Study design: other
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: Conflict of Interest Declaration Dr. Marks is a member of the Nestlé Purina Advisory Board.
- Funding independent: no
- Preprint: no · Open-access full text: yes · Abstract only: no
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = false — Europe PMC fullTextXML: JATS funding-group and structured competing-interest declaration
  - is_preprint = false — PubMed PublicationTypeList

### E. Serum cobalamin and folate in chronic enteropathy

Query: `"Dogs"[Mesh] AND ("cobalamin"[Title/Abstract] OR "vitamin B12"[Title/Abstract] OR "folate"[Title/Abstract] OR "Vitamin B 12"[Mesh] OR "Folic Acid"[Mesh]) AND ("chronic enteropathy"[Title/Abstract] OR "chronic diarrhea"[Title/Abstract] OR "chronic diarrhoea"[Title/Abstract]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Comparison of a chlorambucil-prednisolone combination with an azathioprine-prednisolone combination for treatment of chronic enteropathy with concurrent protein-losing enteropathy in dogs: 27 cases (2007-2010).

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/23725434/)
- OA full text: not available; abstract-only
- DOI: 10.2460/javma.242.12.1705 · PMID: 23725434 · PMCID: not supplied
- Journal/year: Journal of the American Veterinary Medical Association · 2013
- Publication types: Journal Article
- MeSH headings: Animals, Azathioprine, Chlorambucil, Chronic Disease, Dog Diseases, Dogs, Drug Therapy, Combination, Intestinal Diseases, Prednisolone, Retrospective Studies
- Study design: other
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

#### 2. Prevalence and clinical relevance of hypercobalaminaemia in dogs and cats.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/33129556/)
- OA full text: not available; abstract-only
- DOI: 10.1016/j.tvjl.2020.105547 · PMID: 33129556 · PMCID: not supplied
- Journal/year: Veterinary journal (London, England : 1997) · 2020
- Publication types: Journal Article
- MeSH headings: Adrenal Insufficiency, Animals, Cat Diseases, Cats, Dog Diseases, Dogs, Gastrointestinal Diseases, Hyperthyroidism, Pancreatitis, Retrospective Studies, Vitamin B 12
- Study design: other
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

### E. Trypsin-like immunoreactivity for EPI

Query: `"Dogs"[Mesh] AND ("trypsin-like immunoreactivity"[Title/Abstract]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Exocrine pancreatic insufficiency in dogs and cats.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/37944252/)
- OA full text: not available; abstract-only
- DOI: 10.2460/javma.23.09.0505 · PMID: 37944252 · PMCID: not supplied
- Journal/year: Journal of the American Veterinary Medical Association · 2024
- Publication types: Journal Article
- MeSH headings: Cats, Dogs, Animals, Cat Diseases, Dysbiosis, Dog Diseases, Exocrine Pancreatic Insufficiency, Pancreas
- Study design: other
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList
- Deduplication: duplicate of MED:37944252 (title similarity 1)

#### 2. Diagnosis of pancreatitis in dogs and cats.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/25586803/)
- OA full text: not available; abstract-only
- DOI: 10.1111/jsap.12274 · PMID: 25586803 · PMCID: not supplied
- Journal/year: The Journal of small animal practice · 2015
- Publication types: Journal Article, Review
- MeSH headings: Amylases, Animals, Cat Diseases, Cats, Dog Diseases, Dogs, Lipase, Pancreas, Pancreatitis, Trypsin
- Study design: narrative_review
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

### E. Canine pancreatic lipase immunoreactivity

Query: `"Dogs"[Mesh] AND ("pancreatic lipase immunoreactivity"[Title/Abstract]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Diagnosis of pancreatitis in dogs and cats.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/25586803/)
- OA full text: not available; abstract-only
- DOI: 10.1111/jsap.12274 · PMID: 25586803 · PMCID: not supplied
- Journal/year: The Journal of small animal practice · 2015
- Publication types: Journal Article, Review
- MeSH headings: Amylases, Animals, Cat Diseases, Cats, Dog Diseases, Dogs, Lipase, Pancreas, Pancreatitis, Trypsin
- Study design: narrative_review
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList
- Deduplication: duplicate of MED:25586803 (title similarity 1)

#### 2. Fuzapladib in a randomized controlled multicenter masked study in dogs with presumptive acute onset pancreatitis.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/37811705/)
- OA full text: [Europe PMC](https://europepmc.org/articles/PMC10658511)
- DOI: 10.1111/jvim.16897 · PMID: 37811705 · PMCID: PMC10658511
- Journal/year: Journal of veterinary internal medicine · 2023
- Publication types: Randomized Controlled Trial, Veterinary, Multicenter Study, Journal Article
- MeSH headings: Animals, Dogs, Acute Disease, C-Reactive Protein, Cytokines, Dog Diseases, Inflammation, Pancreatitis, Anti-Inflammatory Agents
- Study design: rct
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: Ishihara Sangyo Kaisha, Ltd.
- Competing-interests declaration: CONFLICT OF INTEREST DECLARATION Drs Y. Noshiro, Y. Domen and H. Shikama are employed by Ishihara Sangyo Kaisha Limited. Ishihara Sangyo Kaisha Limited owns the intellectual property and patents associated with fuzapladib sodium. Drs H. Sedlacek and S. Bienhoff are employed by the Contract Research Organization (CRO) that received compensation for conducting the study. Dr. Chantal Lainesse is employed by IntegRxal Consulting Strategies, Inc. and received payments for writing and editorial services. Drs K. Doucette and D. Bledsoe received payments as independent consultants and service providers to Ishihara Sangyo Kaisha Limited. Dr. Steiner also serves as a paid consultant for IDEXX Laboratories, the manufacturer of the Spec cPL and SNAP cPL assays and for Ishihara Sangyo Kaisha, Ltd (ISK) as well as ISK Animal Health LLC, the manufacturer of fuzapladib.
- Funding independent: no
- Preprint: no · Open-access full text: yes · Abstract only: no
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **C**
- Grading inputs complete: **no**
- Missing grading inputs: sample_size
- Grading input provenance:
  - study_design = rct — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = false — Europe PMC fullTextXML: JATS funding-group and structured competing-interest declaration
  - is_preprint = false — PubMed PublicationTypeList

### E. Faecal calprotectin and alpha-1 proteinase inhibitor

Query: `"Dogs"[Mesh] AND ("faecal calprotectin"[Title/Abstract] OR "fecal calprotectin"[Title/Abstract] OR "alpha-1 proteinase inhibitor"[Title/Abstract]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Clinical utility of currently available biomarkers in inflammatory enteropathies of dogs.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/30222209/)
- OA full text: [Europe PMC](https://europepmc.org/articles/PMC6189362)
- DOI: 10.1111/jvim.15247 · PMID: 30222209 · PMCID: PMC6189362
- Journal/year: Journal of veterinary internal medicine · 2018
- Publication types: Journal Article, Review
- MeSH headings: Animals, Biomarkers, Chronic Disease, Dog Diseases, Dogs, Inflammation, Intestinal Diseases
- Study design: narrative_review
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: yes · Abstract only: no
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Not fetched: Gate 1 OA enrichment cap of 30 reached
  - is_preprint = false — PubMed PublicationTypeList

#### 2. Pre-clinical enteropathy in healthy soft-coated wheaten terriers.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/39968924/)
- OA full text: [Europe PMC](https://europepmc.org/articles/PMC11836878)
- DOI: 10.1111/jvim.17293 · PMID: 39968924 · PMCID: PMC11836878
- Journal/year: Journal of veterinary internal medicine · 2025
- Publication types: Journal Article
- MeSH headings: Animals, Dogs, Dog Diseases, Feces, Female, Male, Leukocyte L1 Antigen Complex, Protein-Losing Enteropathies, Prospective Studies, Bile Acids and Salts, Permeability, Capsule Endoscopy
- Study design: other
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: yes · Abstract only: no
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Not fetched: Gate 1 OA enrichment cap of 30 reached
  - is_preprint = false — PubMed PublicationTypeList

### E. Canine faecal dysbiosis index

Query: `"Dogs"[Mesh] AND ("faecal dysbiosis index"[Title/Abstract] OR "fecal dysbiosis index"[Title/Abstract]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Effects of metronidazole on the fecal microbiome and metabolome in healthy dogs.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/32856349/)
- OA full text: [Europe PMC](https://europepmc.org/articles/PMC7517498)
- DOI: 10.1111/jvim.15871 · PMID: 32856349 · PMCID: PMC7517498
- Journal/year: Journal of veterinary internal medicine · 2020
- Publication types: Clinical Trial, Veterinary, Journal Article
- MeSH headings: Animals, Dogs, Feces, Metabolome, Metronidazole, Microbiota, Prospective Studies, RNA, Ribosomal, 16S
- Study design: clinical_trial
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: CONFLICT OF INTEREST DECLARATION Rachel Pilla, Amanda B. Blake, Mohammad R. Khattab, Jonathan A. Lidbury, Jörg M. Steiner, and Jan S. Suchodolski are employed by the Gastrointestinal Laboratory at Texas A&M University, which provides assay for intestinal function and microbiota analysis on a fee‐for‐service basis. Frederic P. Gaschen, James W. Barr, Erin Olson, Julia Honneffer, Blake C. Guard, Dean Villanueva, and Mustafa K. AlShawaqfeh have no conflicts to declare.
- Funding independent: not supplied
- Preprint: no · Open-access full text: yes · Abstract only: no
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = clinical_trial — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Europe PMC fullTextXML: JATS funding-group and structured competing-interest declaration
  - is_preprint = false — PubMed PublicationTypeList
- Deduplication: duplicate of MED:32856349 (title similarity 1)

#### 2. Safety profile and effects on the peripheral immune response of fecal microbiota transplantation in clinically healthy dogs.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/38613431/)
- OA full text: [Europe PMC](https://europepmc.org/articles/PMC11099722)
- DOI: 10.1111/jvim.17061 · PMID: 38613431 · PMCID: PMC11099722
- Journal/year: Journal of veterinary internal medicine · 2024
- Publication types: Journal Article, Clinical Trial, Veterinary
- MeSH headings: Animals, Dogs, Fecal Microbiota Transplantation, Female, Male, Feces, Prospective Studies, Cytokines, Dysbiosis, Gastrointestinal Microbiome
- Study design: clinical_trial
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: yes · Abstract only: no
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = clinical_trial — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Not fetched: Gate 1 OA enrichment cap of 30 reached
  - is_preprint = false — PubMed PublicationTypeList

### E. Serum taurine

Query: `"Dogs"[Mesh] AND ("serum taurine"[Title/Abstract] OR "plasma taurine"[Title/Abstract]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Comparison of echocardiographic measurements and cardiac biomarkers in healthy dogs eating nontraditional or traditional diets.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/36482834/)
- OA full text: [Europe PMC](https://europepmc.org/articles/PMC9889624)
- DOI: 10.1111/jvim.16606 · PMID: 36482834 · PMCID: PMC9889624
- Journal/year: Journal of veterinary internal medicine · 2023
- Publication types: Comparative Study, Journal Article
- MeSH headings: Animals, Dogs, Biomarkers, Cardiomyopathy, Dilated, Cross-Sectional Studies, Diet, Dog Diseases, Echocardiography, Prospective Studies
- Study design: comparative_study
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: yes · Abstract only: no
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = comparative_study — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Not fetched: Gate 1 OA enrichment cap of 30 reached
  - is_preprint = false — PubMed PublicationTypeList

#### 2. Longitudinal assessment of taurine and amino acid concentrations in dogs fed a green lentil diet.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/34747447/)
- OA full text: not available; abstract-only
- DOI: 10.1093/jas/skab315 · PMID: 34747447 · PMCID: PMC8763241
- Journal/year: Journal of animal science · 2021
- Publication types: Journal Article, Randomized Controlled Trial, Veterinary
- MeSH headings: Amino Acids, Animal Feed, Animals, Diet, Dogs, Female, Lens Plant, Taurine
- Study design: rct
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **B**
- Grading inputs complete: **no**
- Missing grading inputs: sample_size, funding_independent
- Grading input provenance:
  - study_design = rct — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Not fetched: Gate 1 OA enrichment cap of 30 reached
  - is_preprint = false — PubMed PublicationTypeList

### E. Vitamin D status

Query: `"Dogs"[Mesh] AND ("vitamin D status"[Title/Abstract] OR "serum 25-hydroxyvitamin D"[Title/Abstract]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Current knowledge of vitamin D in dogs.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/27171904/)
- OA full text: not available; abstract-only
- DOI: 10.1080/10408398.2016.1171202 · PMID: 27171904 · PMCID: not supplied
- Journal/year: Critical reviews in food science and nutrition · 2017
- Publication types: Journal Article, Review
- MeSH headings: Animals, Diet, Dog Diseases, Dogs, Humans, Reference Values, Vitamin D, Vitamin D Deficiency, Vitamins
- Study design: narrative_review
- Species: dog (Dogs, Humans)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

#### 2. Vitamin D status in dogs with babesiosis.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/31038320/)
- OA full text: [Europe PMC](https://europepmc.org/articles/PMC6494922)
- DOI: 10.4102/ojvr.v86i1.1644 · PMID: 31038320 · PMCID: PMC6494922
- Journal/year: The Onderstepoort journal of veterinary research · 2019
- Publication types: Journal Article
- MeSH headings: Animals, Babesiosis, Case-Control Studies, Dog Diseases, Dogs, Female, Male, Prospective Studies, South Africa, Vitamin D
- Study design: case_control
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: yes · Abstract only: no
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **C**
- Grading inputs complete: **no**
- Missing grading inputs: sample_size
- Grading input provenance:
  - study_design = case_control — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Not fetched: Gate 1 OA enrichment cap of 30 reached
  - is_preprint = false — PubMed PublicationTypeList

### E. Thyroid function and dietary influences

Query: `"Dogs"[Mesh] AND ("thyroid function"[Title/Abstract] OR "thyroxine"[Title/Abstract] OR "hypothyroidism"[Title/Abstract] OR "Thyroid Function Tests"[Mesh] OR "Hypothyroidism"[Mesh]) AND ("diet"[Title/Abstract] OR "nutrition"[Title/Abstract] OR "iodine"[Title/Abstract] OR "food"[Title/Abstract] OR "Diet"[Mesh] OR "Iodine"[Mesh]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Congenital hypothyroidism of dogs and cats: a review.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/21541884/)
- OA full text: not available; abstract-only
- DOI: 10.1080/00480169.2011.567964 · PMID: 21541884 · PMCID: not supplied
- Journal/year: New Zealand veterinary journal · 2011
- Publication types: Journal Article, Review
- MeSH headings: Animals, Cat Diseases, Cats, Congenital Hypothyroidism, Dog Diseases, Dogs
- Study design: narrative_review
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

#### 2. Dietary hyperthyroidism in dogs.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/22931400/)
- OA full text: not available; abstract-only
- DOI: 10.1111/j.1748-5827.2011.01189.x · PMID: 22931400 · PMCID: not supplied
- Journal/year: The Journal of small animal practice · 2012
- Publication types: Journal Article
- MeSH headings: Animal Feed, Animal Nutritional Physiological Phenomena, Animals, Dog Diseases, Dogs, Female, Hyperthyroidism, Male, Thyroxine
- Study design: other
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

### E. Biochemistry and haematology reference intervals and dietary effects

Query: `"Dogs"[Mesh] AND ("reference interval"[Title/Abstract] OR "reference range"[Title/Abstract] OR "clinical chemistry"[Title/Abstract] OR "hematology"[Title/Abstract] OR "haematology"[Title/Abstract]) AND ("diet"[Title/Abstract] OR "nutrition"[Title/Abstract] OR "feeding"[Title/Abstract] OR "food"[Title/Abstract]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Dietary hyperthyroidism in dogs.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/22931400/)
- OA full text: not available; abstract-only
- DOI: 10.1111/j.1748-5827.2011.01189.x · PMID: 22931400 · PMCID: not supplied
- Journal/year: The Journal of small animal practice · 2012
- Publication types: Journal Article
- MeSH headings: Animal Feed, Animal Nutritional Physiological Phenomena, Animals, Dog Diseases, Dogs, Female, Hyperthyroidism, Male, Thyroxine
- Study design: other
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList
- Deduplication: duplicate of MED:22931400 (title similarity 1)

#### 2. Zinc Concentration in Blood Serum of Healthy Dogs.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/36224317/)
- OA full text: not available; abstract-only
- DOI: 10.1007/s12011-022-03441-x · PMID: 36224317 · PMCID: 6930867
- Journal/year: Biological trace element research · 2023
- Publication types: Journal Article
- MeSH headings: Male, Dogs, Female, Animals, Serum, Zinc, Health Status
- Study design: other
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Not fetched: Gate 1 OA enrichment cap of 30 reached
  - is_preprint = false — PubMed PublicationTypeList

### E. Allergen-specific IgE serology diagnostic performance

Query: `"Dogs"[Mesh] AND ("allergen-specific IgE"[Title/Abstract] OR "serum IgE"[Title/Abstract] OR "IgE serology"[Title/Abstract] OR "Immunoglobulin E"[Mesh]) AND ("diagnostic accuracy"[Title/Abstract] OR "diagnostic performance"[Title/Abstract] OR "sensitivity"[Title/Abstract] OR "specificity"[Title/Abstract] OR "Sensitivity and Specificity"[Mesh]) AND ("Food Hypersensitivity"[Mesh]) AND ("Dog Diseases"[Mesh]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Food antigen-specific IgE in dogs with suspected food hypersensitivity.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/33276389/)
- OA full text: not available; abstract-only
- DOI: 10.1055/a-1274-9210 · PMID: 33276389 · PMCID: not supplied
- Journal/year: Tierarztliche Praxis. Ausgabe K, Kleintiere/Heimtiere · 2020
- Publication types: Journal Article
- MeSH headings: Allergens, Animals, Dog Diseases, Dogs, Edible Grain, Food Hypersensitivity, Immunoglobulin E, Immunologic Techniques, Meat, Soy Foods
- Study design: other
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList
- Deduplication: duplicate of MED:33276389 (title similarity 1)

#### 2. IgE sensitivity to Malassezia pachydermatis and mite allergens in dogs with atopic dermatitis.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/32492589/)
- OA full text: not available; abstract-only
- DOI: 10.1016/j.vetimm.2020.110070 · PMID: 32492589 · PMCID: not supplied
- Journal/year: Veterinary immunology and immunopathology · 2020
- Publication types: Journal Article
- MeSH headings: Allergens, Animals, Cell Extracts, Dermatitis, Atopic, Dog Diseases, Dogs, Food Hypersensitivity, Fungal Proteins, Immunoglobulin E, Intradermal Tests, Malassezia, Mites
- Study design: other
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

### E. Biochemical monitoring of dietary intervention response

Query: `"Dogs"[Mesh] AND ("biochemical"[Title/Abstract] OR "biomarker"[Title/Abstract] OR "serum"[Title/Abstract] OR "blood"[Title/Abstract]) AND ("dietary intervention"[Title/Abstract] OR "diet therapy"[Title/Abstract] OR "diet response"[Title/Abstract] OR "nutritional intervention"[Title/Abstract]) AND ("Biomarkers"[Mesh]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Domestic dogs maintain clinical, nutritional, and hematological health outcomes when fed a commercial plant-based diet for a year.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/38625934/)
- OA full text: [Europe PMC](https://europepmc.org/articles/PMC11020905)
- DOI: 10.1371/journal.pone.0298942 · PMID: 38625934 · PMCID: PMC11020905
- Journal/year: PloS one · 2024
- Publication types: Journal Article
- MeSH headings: Humans, Adult, Animals, Dogs, Prospective Studies, Diet, Plant-Based, Diet, Amino Acids, Canidae, Animal Feed, Biomarkers, Outcome Assessment, Health Care
- Study design: other
- Species: dog (Dogs, Humans)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: yes · Abstract only: no
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Not fetched: Gate 1 OA enrichment cap of 30 reached
  - is_preprint = false — PubMed PublicationTypeList

#### 2. Association of serum calprotectin (S100A8/A9) concentrations and idiopathic hyperlipidemia in Miniature Schnauzers.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/30788872/)
- OA full text: [Europe PMC](https://europepmc.org/articles/PMC6430953)
- DOI: 10.1111/jvim.15460 · PMID: 30788872 · PMCID: PMC6430953
- Journal/year: Journal of veterinary internal medicine · 2019
- Publication types: Journal Article
- MeSH headings: Animals, Biomarkers, Cholesterol, Diet, Fat-Restricted, Dog Diseases, Dogs, Female, Hyperlipidemias, Leukocyte L1 Antigen Complex, Male, Pedigree, S100A12 Protein, Triglycerides
- Study design: other
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: yes · Abstract only: no
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Not fetched: Gate 1 OA enrichment cap of 30 reached
  - is_preprint = false — PubMed PublicationTypeList

### E. Nutritional deficiency markers

Query: `"Dogs"[Mesh] AND ("deficiency marker"[Title/Abstract] OR "deficiency biomarker"[Title/Abstract] OR "nutritional deficiency"[Title/Abstract] OR "Nutrition Disorders"[Mesh]) AND ("serum"[Title/Abstract] OR "blood"[Title/Abstract] OR "plasma"[Title/Abstract] OR "diagnosis"[Title/Abstract] OR "Biomarkers"[Mesh]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Review of cobalamin status and disorders of cobalamin metabolism in dogs.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/31758868/)
- OA full text: [Europe PMC](https://europepmc.org/articles/PMC6979111)
- DOI: 10.1111/jvim.15638 · PMID: 31758868 · PMCID: PMC6979111
- Journal/year: Journal of veterinary internal medicine · 2020
- Publication types: Journal Article, Review
- MeSH headings: Animals, Biomarkers, Dog Diseases, Dogs, Vitamin B 12, Vitamin B 12 Deficiency
- Study design: narrative_review
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: yes · Abstract only: no
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Not fetched: Gate 1 OA enrichment cap of 30 reached
  - is_preprint = false — PubMed PublicationTypeList

#### 2. [Cobalamin deficiency in dogs and cats].

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/30541171/)
- OA full text: not available; abstract-only
- DOI: 10.15654/tpk-180458 · PMID: 30541171 · PMCID: not supplied
- Journal/year: Tierarztliche Praxis. Ausgabe K, Kleintiere/Heimtiere · 2018
- Publication types: Journal Article, Review
- MeSH headings: Animals, Cat Diseases, Cats, Dog Diseases, Dogs, Vitamin B 12, Vitamin B 12 Deficiency
- Study design: narrative_review
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

### F. Diet and canine behaviour

Query: `"Dogs"[Mesh] AND ("diet behaviour"[Title/Abstract] OR "nutrition behaviour"[Title/Abstract]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. A review of the frequency and impact of periodontal disease in dogs.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/32955734/)
- OA full text: not available; abstract-only
- DOI: 10.1111/jsap.13218 · PMID: 32955734 · PMCID: not supplied
- Journal/year: The Journal of small animal practice · 2020
- Publication types: Journal Article, Review
- MeSH headings: Animals, Dog Diseases, Dogs, Periodontal Diseases, Periodontitis, Quality of Life, Retrospective Studies
- Study design: narrative_review
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList
- Deduplication: duplicate of MED:32955734 (title similarity 1)

### F. Tryptophan, serotonin precursors and behaviour

Query: `"Dogs"[Mesh] AND ("tryptophan"[Title/Abstract] OR "Tryptophan"[Mesh]) AND ("behaviour"[Title/Abstract] OR "behavior"[Title/Abstract] OR "aggression"[Title/Abstract] OR "anxiety"[Title/Abstract] OR "Behavior, Animal"[Mesh] OR "Aggression"[Mesh] OR "Anxiety"[Mesh]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Characteristics of Nutrition and Metabolism in Dogs and Cats.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/38625525/)
- OA full text: not available; abstract-only
- DOI: 10.1007/978-3-031-54192-6_4 · PMID: 38625525 · PMCID: 5398323
- Journal/year: Advances in experimental medicine and biology · 2024
- Publication types: Journal Article
- MeSH headings: Cats, Dogs, Animals, Niacin, Cat Diseases, Dog Diseases, Vitamins, Vitamin A, Arginine, Starch, Taurine
- Study design: other
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Not fetched: Gate 1 OA enrichment cap of 30 reached
  - is_preprint = false — PubMed PublicationTypeList
- Deduplication: duplicate of MED:38625525 (title similarity 1)

#### 2. Roles of Nutrients in the Brain Development, Cognitive Function, and Mood of Dogs and Cats.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/38625529/)
- OA full text: not available; abstract-only
- DOI: 10.1007/978-3-031-54192-6_8 · PMID: 38625529 · PMCID: 6546231
- Journal/year: Advances in experimental medicine and biology · 2024
- Publication types: Journal Article
- MeSH headings: Female, Pregnancy, Cats, Dogs, Animals, Cat Diseases, Dog Diseases, Cognition, Nutrients, Amino Acids, Brain, Amines, Glycine, Taurine, Serine, Lipids
- Study design: other
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Not fetched: Gate 1 OA enrichment cap of 30 reached
  - is_preprint = false — PubMed PublicationTypeList

### F. Dietary protein level and aggression or reactivity

Query: `"Dogs"[Mesh] AND ("dietary protein"[Title/Abstract] OR "protein level"[Title/Abstract] OR "protein restriction"[Title/Abstract] OR "Dietary Proteins"[Mesh]) AND ("aggression"[Title/Abstract] OR "reactivity"[Title/Abstract] OR "Aggression"[Mesh]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Association Between Protein Content in Dry Dog Food and Aggression in Golden Retriever Dogs.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/40531088/)
- OA full text: not available; abstract-only
- DOI: 10.5326/jaaha-ms-7477 · PMID: 40531088 · PMCID: not supplied
- Journal/year: Journal of the American Animal Hospital Association · 2025
- Publication types: Journal Article
- MeSH headings: Animals, Dogs, Animal Feed, Aggression, Male, Female, Dietary Proteins, Behavior, Animal, Diet, Surveys and Questionnaires, Animal Nutritional Physiological Phenomena, Prospective Studies
- Study design: other
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

#### 2. Serum IgE cross-reactivity between fish and chicken meats in dogs.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/30378189/)
- OA full text: not available; abstract-only
- DOI: 10.1111/vde.12691 · PMID: 30378189 · PMCID: not supplied
- Journal/year: Veterinary dermatology · 2019
- Publication types: Journal Article
- MeSH headings: Animals, Chickens, Cross Reactions, Dermatitis, Atopic, Dogs, Enzyme-Linked Immunosorbent Assay, Fishes, Food Hypersensitivity, Gadus morhua, Immunoblotting, Immunoglobulin E, Meat, Meat Proteins, Salmon
- Study design: other
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

### F. Gut–brain axis and anxiety

Query: `"Dogs"[Mesh] AND ("gut brain axis"[Title/Abstract] OR "microbiome brain axis"[Title/Abstract] OR "gastrointestinal microbiome"[Title/Abstract] OR "Gastrointestinal Microbiome"[Mesh]) AND ("anxiety"[Title/Abstract] OR "fear"[Title/Abstract] OR "stress"[Title/Abstract] OR "behaviour"[Title/Abstract] OR "behavior"[Title/Abstract] OR "Anxiety"[Mesh] OR "Fear"[Mesh] OR "Behavior, Animal"[Mesh]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Nutritional Management of Behavior and Brain Disorders in Dogs and Cats.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/33773649/)
- OA full text: not available; abstract-only
- DOI: 10.1016/j.cvsm.2021.01.011 · PMID: 33773649 · PMCID: not supplied
- Journal/year: The Veterinary clinics of North America. Small animal practice · 2021
- Publication types: Journal Article, Review
- MeSH headings: Animals, Anxiety, Behavior, Animal, Brain Diseases, Cat Diseases, Cats, Dog Diseases, Dogs
- Study design: narrative_review
- Species: dog (Dogs, Cats)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList
- Deduplication: duplicate of MED:33773649 (title similarity 1)

#### 2. Gut microbiota composition is related to anxiety and aggression scores in companion dogs.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/40624095/)
- OA full text: [Europe PMC](https://europepmc.org/articles/PMC12234828)
- DOI: 10.1038/s41598-025-06178-4 · PMID: 40624095 · PMCID: PMC12234828
- Journal/year: Scientific reports · 2025
- Publication types: Journal Article
- MeSH headings: Animals, Dogs, Gastrointestinal Microbiome, Aggression, Anxiety, Pets, Behavior, Animal, Male, Feces, Female
- Study design: other
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: yes · Abstract only: no
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Not fetched: Gate 1 OA enrichment cap of 30 reached
  - is_preprint = false — PubMed PublicationTypeList

### F. Nutrition, arousal and trainability

Query: `"Dogs"[Mesh] AND ("nutrition"[Title/Abstract] OR "diet"[Title/Abstract] OR "feeding"[Title/Abstract] OR "Diet"[Mesh]) AND ("arousal"[Title/Abstract] OR "trainability"[Title/Abstract] OR "learning"[Title/Abstract] OR "Learning"[Mesh]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Nutrients, Cognitive Function, and Brain Aging: What We Have Learned from Dogs.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/34842769/)
- OA full text: [Europe PMC](https://europepmc.org/articles/PMC8628994)
- DOI: 10.3390/medsci9040072 · PMID: 34842769 · PMCID: PMC8628994
- Journal/year: Medical sciences (Basel, Switzerland) · 2021
- Publication types: Journal Article, Review
- MeSH headings: Aging, Alzheimer Disease, Animals, Atrophy, Brain, Cognition, Dogs, Humans, Nutrients
- Study design: narrative_review
- Species: dog (Dogs, Humans)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: yes · Abstract only: no
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Not fetched: Gate 1 OA enrichment cap of 30 reached
  - is_preprint = false — PubMed PublicationTypeList

#### 2. Canine olfactory detection and its relevance to medical detection.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/34412582/)
- OA full text: [Europe PMC](https://europepmc.org/articles/PMC8375464)
- DOI: 10.1186/s12879-021-06523-8 · PMID: 34412582 · PMCID: PMC8375464
- Journal/year: BMC infectious diseases · 2021
- Publication types: Journal Article, Review
- MeSH headings: Animals, Dogs, Learning, Odorants, Smell
- Study design: narrative_review
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: yes · Abstract only: no
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = narrative_review — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Not fetched: Gate 1 OA enrichment cap of 30 reached
  - is_preprint = false — PubMed PublicationTypeList

### F. Gastrointestinal pain as a driver of behaviour change

Query: `"Dogs"[Mesh] AND ("gastrointestinal pain"[Title/Abstract] OR "abdominal pain"[Title/Abstract] OR "Abdominal Pain"[Mesh]) AND ("behaviour"[Title/Abstract] OR "behavior"[Title/Abstract] OR "aggression"[Title/Abstract] OR "anxiety"[Title/Abstract] OR "behaviour change"[Title/Abstract] OR "behavior change"[Title/Abstract] OR "Behavior, Animal"[Mesh] OR "Aggression"[Mesh] OR "Anxiety"[Mesh]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Functional dyspepsia: from human to dog, a retrospective study of 29 cases illustrating a complex entity.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/41074059/)
- OA full text: [Europe PMC](https://europepmc.org/articles/PMC12512554)
- DOI: 10.1186/s12917-025-05038-7 · PMID: 41074059 · PMCID: PMC12512554
- Journal/year: BMC veterinary research · 2025
- Publication types: Journal Article
- MeSH headings: Animals, Dogs, Dyspepsia, Dog Diseases, Retrospective Studies, Female, Male, Humans, Abdominal Pain
- Study design: other
- Species: dog (Dogs, Humans)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: yes · Abstract only: no
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Not fetched: Gate 1 OA enrichment cap of 30 reached
  - is_preprint = false — PubMed PublicationTypeList

#### 2. Clinical outcome in 23 dogs with exocrine pancreatic carcinoma.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/32803885/)
- OA full text: not available; abstract-only
- DOI: 10.1111/vco.12645 · PMID: 32803885 · PMCID: not supplied
- Journal/year: Veterinary and comparative oncology · 2021
- Publication types: Journal Article
- MeSH headings: Animals, Carcinoma, Dog Diseases, Dogs, Female, Male, Neoplasm Staging, Pancreatic Neoplasms, Retrospective Studies
- Study design: other
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

### F. Coprophagia and diet

Query: `"Dogs"[Mesh] AND ("coprophagia"[Title/Abstract] OR "coprophagy"[Title/Abstract]) AND ("diet"[Title/Abstract] OR "nutrition"[Title/Abstract] OR "feeding"[Title/Abstract] OR "food"[Title/Abstract] OR "Diet"[Mesh]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. The paradox of canine conspecific coprophagy.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/29851313/)
- OA full text: [Europe PMC](https://europepmc.org/articles/PMC5980124)
- DOI: 10.1002/vms3.92 · PMID: 29851313 · PMCID: PMC5980124
- Journal/year: Veterinary medicine and science · 2018
- Publication types: Journal Article, Research Support, Non-U.S. Gov't
- MeSH headings: Animals, Coprophagia, Dogs, Female, Intestinal Diseases, Parasitic, Male
- Study design: other
- Species: dog (Dogs)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: yes · Abstract only: no
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Not fetched: Gate 1 OA enrichment cap of 30 reached
  - is_preprint = false — PubMed PublicationTypeList

#### 2. Mapping the canine gut microbiome: insights from the Dog Aging Project.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/42156772/)
- OA full text: not available; abstract-only
- DOI: 10.1038/s41467-026-73193-y · PMID: 42156772 · PMCID: PMC13381875
- Journal/year: Nature communications · 2026
- Publication types: Journal Article
- MeSH headings: Animals, Dogs, Aging, Gastrointestinal Microbiome, Feces, Female, Male, Metagenomics, Diet, Cohort Studies, Humans, Pets
- Study design: cohort
- Species: dog (Dogs, Humans)
- Evidence scope: canine direct
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **C**
- Grading inputs complete: **no**
- Missing grading inputs: sample_size
- Grading input provenance:
  - study_design = cohort — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Not fetched: Gate 1 OA enrichment cap of 30 reached
  - is_preprint = false — PubMed PublicationTypeList

### G. Industry funding and bias in companion-animal nutrition research

Query: `("Dogs"[Mesh] OR "Veterinary Medicine"[Mesh]) AND ("industry funding"[Title/Abstract] OR "conflict of interest"[Title/Abstract] OR "sponsorship bias"[Title/Abstract] OR "funding bias"[Title/Abstract] OR "Conflict of Interest"[Mesh]) AND ("pet food"[Title/Abstract] OR "companion animal nutrition"[Title/Abstract] OR "veterinary nutrition"[Title/Abstract] OR "animal nutrition"[Title/Abstract]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

No candidates returned.

### G. Evidence quality and reporting standards in veterinary nutrition

Query: `("Dogs"[Mesh] OR "Veterinary Medicine"[Mesh]) AND ("evidence quality"[Title/Abstract] OR "reporting quality"[Title/Abstract] OR "reporting guideline"[Title/Abstract] OR "risk of bias"[Title/Abstract]) AND ("veterinary nutrition"[Title/Abstract] OR "animal nutrition"[Title/Abstract] OR "veterinary trial"[Title/Abstract] OR "veterinary research"[Title/Abstract] OR "Veterinary Medicine"[Mesh]) NOT ("Homeopathy"[Mesh]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Completeness of reporting of systematic reviews in the animal health literature: A meta-research study.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/34438246/)
- OA full text: not available; abstract-only
- DOI: 10.1016/j.prevetmed.2021.105472 · PMID: 34438246 · PMCID: not supplied
- Journal/year: Preventive veterinary medicine · 2021
- Publication types: Journal Article, Meta-Analysis
- MeSH headings: Animals, Bias, Research Design, Systematic Reviews as Topic, Veterinary Medicine
- Study design: meta_analysis
- Species: not supplied (no structured species term)
- Evidence scope: veterinary methodology
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = meta_analysis — PubMed PublicationTypeList and MeSH headings
  - species = null — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

#### 2. Introduction to systematic reviews in animal agriculture and veterinary medicine.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/24905991/)
- OA full text: not available; abstract-only
- DOI: 10.1111/zph.12128 · PMID: 24905991 · PMCID: not supplied
- Journal/year: Zoonoses and public health · 2014
- Publication types: Journal Article, Research Support, Non-U.S. Gov't, Systematic Review
- MeSH headings: Agriculture, Animals, Meta-Analysis as Topic, Review Literature as Topic, Selection Bias, Veterinary Medicine
- Study design: systematic_review
- Species: not supplied (no structured species term)
- Evidence scope: veterinary methodology
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = systematic_review — PubMed PublicationTypeList and MeSH headings
  - species = null — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

### G. Caregiver placebo effect in owner-reported outcomes

Query: `("Dogs"[Mesh] OR "Veterinary Medicine"[Mesh]) AND ("caregiver placebo effect"[Title/Abstract] OR "owner placebo effect veterinary"[Title/Abstract]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Effect of analgesic therapy on clinical outcome measures in a randomized controlled trial using client-owned dogs with hip osteoarthritis.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/23035739/)
- OA full text: [Europe PMC](https://europepmc.org/articles/PMC3527270)
- DOI: 10.1186/1746-6148-8-185 · PMID: 23035739 · PMCID: PMC3527270
- Journal/year: BMC veterinary research · 2012
- Publication types: Journal Article, Randomized Controlled Trial, Research Support, Non-U.S. Gov't
- MeSH headings: Analgesics, Opioid, Animals, Anti-Inflammatory Agents, Non-Steroidal, Body Temperature, Carbazoles, Dog Diseases, Dogs, Double-Blind Method, Female, Heart Rate, Indazoles, Lameness, Animal, Male, Osteoarthritis, Hip, Pain, Phenylurea Compounds, Placebo Effect, Respiration, Tramadol, Treatment Outcome
- Study design: rct
- Species: dog (Dogs)
- Evidence scope: veterinary methodology
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: yes · Abstract only: no
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **B**
- Grading inputs complete: **no**
- Missing grading inputs: sample_size, funding_independent
- Grading input provenance:
  - study_design = rct — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Not fetched: Gate 1 OA enrichment cap of 30 reached
  - is_preprint = false — PubMed PublicationTypeList

#### 2. Caregiver placebo effect for dogs with lameness from osteoarthritis.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/23113523/)
- OA full text: not available; abstract-only
- DOI: 10.2460/javma.241.10.1314 · PMID: 23113523 · PMCID: not supplied
- Journal/year: Journal of the American Veterinary Medical Association · 2012
- Publication types: Journal Article
- MeSH headings: Animals, Biomechanical Phenomena, Caregivers, Dog Diseases, Dogs, Lameness, Animal, Observer Variation, Osteoarthritis, Placebo Effect, Veterinarians
- Study design: other
- Species: dog (Dogs)
- Evidence scope: veterinary methodology
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

### G. Blinding and control in diet trials

Query: `("Dogs"[Mesh] OR "Veterinary Medicine"[Mesh]) AND ("blinding"[Title/Abstract] OR "double blind"[Title/Abstract] OR "placebo"[Title/Abstract] OR "controlled trial"[Title/Abstract] OR "Double-Blind Method"[Mesh] OR "Placebos"[Mesh]) AND ("diet trial"[Title/Abstract] OR "nutrition trial"[Title/Abstract] OR "feeding trial"[Title/Abstract]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Randomized controlled trial demonstrates nutritional management is superior to metronidazole for treatment of acute colitis in dogs.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/36191142/)
- OA full text: not available; abstract-only
- DOI: 10.2460/javma.22.08.0349 · PMID: 36191142 · PMCID: not supplied
- Journal/year: Journal of the American Veterinary Medical Association · 2022
- Publication types: Randomized Controlled Trial, Veterinary, Journal Article, Research Support, Non-U.S. Gov't
- MeSH headings: Dogs, Animals, Metronidazole, Psyllium, Dysbiosis, Cryptosporidiosis, Cryptosporidium, Colitis, Dog Diseases
- Study design: rct
- Species: dog (Dogs)
- Evidence scope: veterinary methodology
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **B**
- Grading inputs complete: **no**
- Missing grading inputs: sample_size, funding_independent
- Grading input provenance:
  - study_design = rct — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

#### 2. The fecal metabolomic signature of a plant-based (vegan) diet compared to an animal-based diet in healthy adult client-owned dogs.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/40036327/)
- OA full text: [Europe PMC](https://europepmc.org/articles/PMC12056932)
- DOI: 10.1093/jas/skaf054 · PMID: 40036327 · PMCID: PMC12056932
- Journal/year: Journal of animal science · 2025
- Publication types: Journal Article
- MeSH headings: Animals, Dogs, Feces, Male, Female, Animal Feed, Metabolome, Animal Nutritional Physiological Phenomena, Diet, Vegan, Double-Blind Method, Diet, Longitudinal Studies, Metabolomics
- Study design: other
- Species: dog (Dogs)
- Evidence scope: veterinary methodology
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: yes · Abstract only: no
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Not fetched: Gate 1 OA enrichment cap of 30 reached
  - is_preprint = false — PubMed PublicationTypeList

### G. Systematic review methodology in veterinary medicine

Query: `("Dogs"[Mesh] OR "Veterinary Medicine"[Mesh]) AND ("systematic review methodology"[Title/Abstract] OR "systematic review reporting"[Title/Abstract] OR "quality of systematic reviews"[Title/Abstract] OR "meta-research"[Title/Abstract]) AND ("veterinary"[Title/Abstract] OR "animal health"[Title/Abstract] OR "Veterinary Medicine"[Mesh]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Completeness of reporting of systematic reviews in the animal health literature: A meta-research study.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/34438246/)
- OA full text: not available; abstract-only
- DOI: 10.1016/j.prevetmed.2021.105472 · PMID: 34438246 · PMCID: not supplied
- Journal/year: Preventive veterinary medicine · 2021
- Publication types: Journal Article, Meta-Analysis
- MeSH headings: Animals, Bias, Research Design, Systematic Reviews as Topic, Veterinary Medicine
- Study design: meta_analysis
- Species: not supplied (no structured species term)
- Evidence scope: veterinary methodology
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = meta_analysis — PubMed PublicationTypeList and MeSH headings
  - species = null — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList
- Deduplication: duplicate of MED:34438246 (title similarity 1)

#### 2. Journal instructions to authors submitting veterinary systematic reviews are inconsistent and often inadequate.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/39892401/)
- OA full text: not available; abstract-only
- DOI: 10.2460/ajvr.24.10.0304 · PMID: 39892401 · PMCID: not supplied
- Journal/year: American journal of veterinary research · 2025
- Publication types: Journal Article
- MeSH headings: Veterinary Medicine, Systematic Reviews as Topic, Periodicals as Topic, Publishing, Guidelines as Topic, Editorial Policies, Animals
- Study design: other
- Species: not supplied (no structured species term)
- Evidence scope: veterinary methodology
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = null — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

### G. Pet food labelling regulation and legal category terminology

Query: `("Dogs"[Mesh] OR "Veterinary Medicine"[Mesh]) AND ("pet food labelling"[Title/Abstract] OR "pet food labeling"[Title/Abstract] OR "animal feed labelling"[Title/Abstract] OR "animal feed labeling"[Title/Abstract] OR "Food Labeling"[Mesh]) AND ("regulation"[Title/Abstract] OR "legislation"[Title/Abstract] OR "legal"[Title/Abstract] OR "claim"[Title/Abstract] OR "terminology"[Title/Abstract]) AND hasabstract AND ("2009/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Composition, disintegrative properties, and labeling compliance of commercially available taurine and carnitine dietary products.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/19210238/)
- OA full text: not available; abstract-only
- DOI: 10.2460/javma.234.2.209 · PMID: 19210238 · PMCID: not supplied
- Journal/year: Journal of the American Veterinary Medical Association · 2009
- Publication types: Journal Article, Research Support, Non-U.S. Gov't
- MeSH headings: Animal Feed, Animals, Arsenic, Carnitine, Cats, Dogs, Food Contamination, Food Labeling, Mercury, Selenium, Taurine, United States, United States Food and Drug Administration
- Study design: other
- Species: dog (Dogs, Cats)
- Evidence scope: veterinary methodology
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList

### G. DNA-based verification of pet food ingredient labelling

Query: `("Dogs"[Mesh] OR "Veterinary Medicine"[Mesh]) AND ("DNA barcoding"[Title/Abstract] OR "DNA authentication"[Title/Abstract] OR "PCR identification"[Title/Abstract] OR "species identification"[Title/Abstract] OR "DNA Barcoding, Taxonomic"[Mesh]) AND ("pet food"[Title/Abstract] OR "dog food"[Title/Abstract] OR "animal feed"[Title/Abstract] OR "ingredient labelling"[Title/Abstract] OR "ingredient labeling"[Title/Abstract] OR "Food Labeling"[Mesh]) AND hasabstract AND ("2010/01/01"[Date - Publication] : "2026/12/31"[Date - Publication]) NOT "Case Reports"[Publication Type]`

#### 1. Undeclared animal species in dry and wet novel and hydrolyzed protein diets for dogs and cats detected by microarray analysis.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/29945610/)
- OA full text: [Europe PMC](https://europepmc.org/articles/PMC6020431)
- DOI: 10.1186/s12917-018-1528-7 · PMID: 29945610 · PMCID: PMC6020431
- Journal/year: BMC veterinary research · 2018
- Publication types: Journal Article
- MeSH headings: Animal Feed, Animals, Cats, Chickens, Dogs, Food Contamination, Food Labeling, Meat, Oligonucleotide Array Sequence Analysis, Proteins, Swine, Turkeys
- Study design: other
- Species: dog (Dogs, Cats)
- Evidence scope: veterinary methodology
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: yes · Abstract only: no
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Europe PMC fullTextXML: JATS funding-group and structured competing-interest declaration
  - is_preprint = false — PubMed PublicationTypeList
- Deduplication: duplicate of MED:29945610 (title similarity 1)

#### 2. Isolation of Campylobacter spp. from Client-Owned Dogs and Cats, and Retail Raw Meat Pet Food in the Manawatu, New Zealand.

- Discovery source: [PubMed](https://pubmed.ncbi.nlm.nih.gov/27860343/)
- OA full text: not available; abstract-only
- DOI: 10.1111/zph.12323 · PMID: 27860343 · PMCID: not supplied
- Journal/year: Zoonoses and public health · 2017
- Publication types: Journal Article, Research Support, Non-U.S. Gov't
- MeSH headings: Animal Feed, Animals, Campylobacter, Campylobacter Infections, Cat Diseases, Cats, Dog Diseases, Dogs, Food Microbiology, New Zealand, Pets, Zoonoses
- Study design: other
- Species: dog (Dogs, Cats)
- Evidence scope: veterinary methodology
- Sample size: not supplied by source metadata
- Funding declaration: not supplied
- Competing-interests declaration: not supplied
- Funding independent: not supplied
- Preprint: no · Open-access full text: no · Abstract only: yes
- Retracted: no · checked 2026-07-28T21:44:36.823Z
- Computed evidence grade: **D**
- Grading inputs complete: **yes**
- Missing grading inputs: none
- Grading input provenance:
  - study_design = other — PubMed PublicationTypeList and MeSH headings
  - species = dog — PubMed MeSH DescriptorName
  - sample_size = null — Unavailable as structured PubMed/Europe PMC metadata
  - funding_independent = null — Unavailable: Europe PMC does not expose OA fullTextXML
  - is_preprint = false — PubMed PublicationTypeList
