/**
 * Phase 4 sample research seed.
 *
 * Run with: npm run seed:phase4
 *
 * Why this is a script and not supabase/seed_phase4.sql: research_chunks
 * needs a real embedding per chunk, which requires calling an embedding API
 * (see src/lib/embeddingPipeline.ts's deviation note) — pure SQL can't do
 * that. This script calls ingestResearchDocument() directly (same function
 * the /api/research/ingest admin endpoint uses) so the seeded rows go
 * through the identical code path as any other ingested document, just with
 * review_status set straight to 'approved' since these are the initial
 * corpus and there's no separate reviewer yet.
 *
 * Content below is placeholder text (no real papers cited yet), per the
 * phase prompt — source_url values are marked as placeholders, not real
 * published sources. Needs owner input before production: replace with
 * actual cited research per topic.
 */

import { ingestResearchDocument } from '../src/lib/embeddingPipeline';
import { ResearchTopic } from '../src/lib/types';

interface SampleDoc {
  topic: ResearchTopic;
  title: string;
  source_url: string;
  text: string;
}

const SAMPLE_DOCS: SampleDoc[] = [
  {
    topic: 'gut_biome',
    title: 'Placeholder: Fibre diversity and canine gut microbiome resilience',
    source_url: 'https://example-research.placeholder/gut-biome-fibre-diversity',
    text: `Dogs fed diets with a broader diversity of fermentable fibre sources (e.g. beet pulp, chicory root inulin, pumpkin) tend to show greater gut microbiome diversity than dogs fed single-fibre-source diets. Greater microbiome diversity is associated with more stable stool consistency and faster recovery of normal stool scores after a diet transition.

Digestive upset during a food switch is common and often reflects the gut microbiome adjusting to a new substrate mix, not necessarily food unsuitability — this is consistent with the ~10-day settling window commonly used for digestive metrics post-switch.

Highly processed, single-protein-source diets with minimal fibre diversity may be easier to formulate consistently but appear to offer less resilience against transient digestive upset when food is changed again in future.`,
  },
  {
    topic: 'gut_biome',
    title: 'Placeholder: Probiotic strains and stool odour in adult dogs',
    source_url: 'https://example-research.placeholder/gut-biome-probiotics-odour',
    text: `Diets supplemented with specific Bifidobacterium and Lactobacillus strains have been associated with reductions in stool odour intensity and gas frequency in adult dogs over an 8-week feeding trial window, compared to unsupplemented control diets.

Effects were most pronounced in dogs transitioning from a diet with limited fibre content to one with added prebiotic fibre plus live probiotic cultures. No meaningful difference was observed in puppies, where digestive systems are still maturing and baseline variability is higher regardless of diet.`,
  },
  {
    topic: 'allergy',
    title: 'Placeholder: Novel protein diets and reported food-allergy symptom reduction',
    source_url: 'https://example-research.placeholder/allergy-novel-protein',
    text: `Dogs with owner-reported or vet-diagnosed food allergies to common proteins (chicken, beef, dairy) frequently show symptom improvement — reduced itching, fewer GI symptoms — when switched to a novel or hydrolysed protein source they have not previously been exposed to (e.g. venison, duck, insect protein, hydrolysed salmon).

True elimination-diet trials require strict single-protein feeding for 8-12 weeks with no treats or table scraps containing other proteins, since even small amounts of a trigger protein can maintain a reaction. Owner-reported improvement without a controlled elimination trial should be treated as suggestive, not diagnostic — this is decision-support information, not a veterinary diagnosis.`,
  },
  {
    topic: 'allergy',
    title: 'Placeholder: Grain-free diets and food sensitivity — clarifying a common misconception',
    source_url: 'https://example-research.placeholder/allergy-grain-free-misconception',
    text: `True grain allergies in dogs are uncommon relative to protein-source allergies (chicken, beef, dairy, egg). Most dogs reacting badly to a grain-inclusive diet are more likely reacting to a protein or additive within that specific product, not grain as a category.

Grain-free is not inherently more hypoallergenic — it simply substitutes a different carbohydrate source (potato, pea, lentil), and pea/legume-heavy grain-free diets carry their own separate, unrelated area of ongoing veterinary nutrition research (cardiac health) that dog owners should be aware exists, independent of the allergy question.`,
  },
  {
    topic: 'health_condition',
    title: 'Placeholder: Weight-management diets and body condition score outcomes',
    source_url: 'https://example-research.placeholder/health-condition-weight-management',
    text: `Dogs with a Body Condition Score (BCS) above 6/9 (WSAVA scale) placed on a calorie-controlled, higher-protein/lower-fat weight-management diet showed measurable BCS improvement over a 12-week period when combined with portion control, but calorie density alone (without portion discipline) did not reliably produce improvement.

Because body condition and coat changes are slow-moving signals, meaningful BCS shifts from a diet change typically aren't visible before roughly 8 weeks — consistent with the longer lag window used for body_condition_score and coat_condition metrics, as opposed to the much faster-settling digestive metrics.`,
  },
  {
    topic: 'health_condition',
    title: 'Placeholder: Joint-support nutrients in senior and large-breed diets',
    source_url: 'https://example-research.placeholder/health-condition-joint-support',
    text: `Diets supplemented with glucosamine, chondroitin, and omega-3 fatty acids (EPA/DHA) have shown associations with improved mobility scoring in senior dogs and large-breed dogs prone to earlier joint wear, over feeding trials of 3+ months.

Large and giant breeds reaching their senior life stage earlier (per breed-size-adjusted thresholds) may benefit from proactively selecting joint-support-formulated diets before clinical joint symptoms appear, rather than only after a diagnosis — though this remains a supportive/preventive consideration, not a substitute for veterinary diagnosis or treatment of a diagnosed joint condition.`,
  },
  {
    topic: 'general',
    title: 'Placeholder: Matching calorie density to activity level across life stages',
    source_url: 'https://example-research.placeholder/general-calorie-density-activity',
    text: `Energy requirements vary substantially by life stage, lifestyle role, and workload — a working or sporting dog with several hours of daily intense activity (e.g. gundog, herding, sled work) can require two to five times the resting energy requirement of a sedentary pet of the same breed and size, and benefits from calorie-dense diets to meet that need without excessive food volume.

Conversely, feeding a calorie-dense, high-fat diet formulated for working dogs to a low-activity pet risks unintended weight gain over time. Matching calorie density to actual energy expenditure — not just breed or size alone — is a foundational principle in canine nutrition guidance from veterinary nutrition bodies.`,
  },
  {
    topic: 'general',
    title: 'Placeholder: Puppy growth-rate nutrition and large-breed considerations',
    source_url: 'https://example-research.placeholder/general-puppy-growth',
    text: `Large and giant-breed puppies fed diets that promote overly rapid growth (excess calories and calcium relative to requirement) have shown associations with increased risk of developmental orthopaedic issues later in life, compared to puppies fed large-breed-specific growth formulas with controlled calcium and calorie density.

This is part of why puppy-to-adult transition timing is treated as breed-size-dependent (large/giant breeds taking 18-24 months to reach adulthood versus ~12 months for small/medium breeds) rather than a single fixed age across all dogs — the nutritional needs during that extended growth window differ meaningfully by expected adult size.`,
  },
];

async function main() {
  console.log(`Seeding ${SAMPLE_DOCS.length} Phase 4 sample research documents...`);
  let totalChunks = 0;

  for (const doc of SAMPLE_DOCS) {
    const result = await ingestResearchDocument({
      topic: doc.topic,
      title: doc.title,
      source_url: doc.source_url,
      text: doc.text,
      review_status: 'approved', // seeded corpus is marked live immediately, per phase prompt
    });
    totalChunks += result.chunk_count;
    console.log(`  - "${doc.title}" -> document_id=${result.document_id}, chunks=${result.chunk_count}`);
  }

  console.log(`Done. ${SAMPLE_DOCS.length} documents, ${totalChunks} chunks total.`);
}

main().catch((err) => {
  console.error('Phase 4 seed failed:', err);
  process.exit(1);
});
