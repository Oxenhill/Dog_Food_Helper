// Chart reference data for Phase 2 (Bristol-style stool score & canine BCS)
//
// IMPORTANT — see /BUILD_PROGRESS.md "Needs owner input":
// No original commissioned illustrations exist yet for either chart. Per the
// architecture doc §4 and legal review §6, the platform must NEVER embed any
// existing brand's or body's chart artwork (Purina, Royal Canin, WSAVA, the
// official Bristol Stool Form Scale, etc. are all proprietary/licensed).
// Until original illustrations are commissioned, these charts render as plain
// text/label selections only — no images sourced from the web as a substitute.
//
// Wording below is original, written from the underlying clinical/descriptive
// criteria (stool firmness/shape/moisture; rib palpability/waist/tuck) — these
// are facts, not owned by anyone; only specific published artwork is protected.

export interface ChartOption {
  value: number;
  label: string;
  description: string;
}

// Source: stool-chart-descriptions.md — original wording, not copied from any
// single existing chart. DB value stored in dog_log_entries.raw_value is the
// string form of `value` (e.g. "2"), under metric = 'stool_score'.
export const BRISTOL_STOOL_TYPES: ChartOption[] = [
  {
    value: 1,
    label: 'Type 1 — Very hard and dry',
    description:
      'Small, hard lumps, individually separate, similar to hard pellets. No visible surface moisture. Crumbles rather than holding together. Often linked to dehydration or low fibre.',
  },
  {
    value: 2,
    label: 'Type 2 — Firm, segmented, ideal',
    description:
      'Firm but not hard, holding a clear log/sausage shape with visible segmentation. Slight surface sheen but no wet residue left behind. The commonly cited "ideal" consistency.',
  },
  {
    value: 3,
    label: 'Type 3 — Soft, holds shape',
    description:
      'Soft but still clearly log-shaped. Holds its form well, less defined segmentation than Type 2. Leaves a very slight moist mark when picked up.',
  },
  {
    value: 4,
    label: 'Type 4 — Very soft, loses shape when lifted',
    description:
      'Very moist, has a rough log shape when first passed but loses that form and flattens when picked up or moved.',
  },
  {
    value: 5,
    label: 'Type 5 — Piles rather than a log shape',
    description:
      'Distinctly wet, forms soft piles or blobs rather than a continuous log. Individual "pieces" still distinguishable but with no firm structure. Leaves clear residue.',
  },
  {
    value: 6,
    label: 'Type 6 — Loose, unformed',
    description:
      'Takes the shape of whatever surface it lands on rather than holding any independent form. Some texture still visible; more liquid than solid.',
  },
  {
    value: 7,
    label: 'Type 7 — Watery, no solid form',
    description:
      'Entirely liquid in appearance, with no distinguishable solid texture or shape at all — pools rather than spreads or piles.',
  },
];

export const STOOL_SCORE_IDEAL = 2;

// Original 9-point body-condition wording, grounded in the standard clinical
// assessment criteria (rib palpability, waist from above, abdominal tuck from
// the side) used across veterinary BCS systems generally — not copied from
// any single body's published chart/artwork. DB value stored as `raw_value`
// under metric = 'body_condition_score'.
export const BCS_LEVELS: ChartOption[] = [
  {
    value: 1,
    label: '1 — Emaciated',
    description:
      'Ribs, spine and pelvic bones visible from a distance with no palpable fat. Severe abdominal tuck and pronounced hourglass waist.',
  },
  {
    value: 2,
    label: '2 — Very thin',
    description:
      'Ribs, spine and pelvic bones easily visible with minimal fat covering. Pronounced waist and abdominal tuck.',
  },
  {
    value: 3,
    label: '3 — Thin',
    description:
      'Ribs easily palpable with minimal fat covering. Tops of the spinous processes visible. Obvious waist and abdominal tuck.',
  },
  {
    value: 4,
    label: '4 — Underweight',
    description:
      'Ribs easily palpable with a slight fat covering. Waist clearly visible from above. Abdominal tuck evident.',
  },
  {
    value: 5,
    label: '5 — Ideal',
    description:
      'Ribs palpable without excess fat covering. Waist observed behind the ribs when viewed from above. Abdomen tucked up when viewed from the side.',
  },
  {
    value: 6,
    label: '6 — Slightly overweight',
    description:
      'Ribs palpable with a slight excess fat covering. Waist discernible but not prominent. Abdominal tuck present but faint.',
  },
  {
    value: 7,
    label: '7 — Overweight',
    description:
      'Ribs difficult to palpate under moderate fat cover. Waist barely visible or absent from above. Abdominal tuck minimal or absent.',
  },
  {
    value: 8,
    label: '8 — Obese',
    description:
      'Ribs not palpable, or palpable only with firm pressure, under a heavy fat cover. No waist, no abdominal tuck. Fat deposits over the back and base of tail.',
  },
  {
    value: 9,
    label: '9 — Severely obese',
    description:
      'Massive fat deposits over the chest, spine and base of tail. No waist or abdominal tuck. Abdomen may be visibly distended.',
  },
];

export const BCS_IDEAL = 5;

// Good/questionable/poor descriptions for the four wellness_indicator_reference
// metrics — see architecture doc §4. Flagged as a draft taxonomy: the
// architecture doc notes this "needs real research input... before it's just
// guessed" (§4). These are a reasonable starting point, not sourced from a
// specific research document yet — see BUILD_PROGRESS.md.
export const WELLNESS_INDICATOR_DESCRIPTIONS: Record<
  'coat_condition' | 'stool_odor' | 'gas_frequency' | 'gas_odor',
  Record<'good' | 'questionable' | 'poor', string>
> = {
  coat_condition: {
    good: 'Shiny, soft, no bald or flaky patches',
    questionable: 'Slightly dull or dry in places, occasional flaking',
    poor: 'Dull, flaky, brittle, or noticeably excessive shedding',
  },
  stool_odor: {
    good: 'Mild, typical odour for this dog',
    questionable: 'Stronger than usual',
    poor: 'Foul or acrid, clearly different from normal',
  },
  gas_frequency: {
    good: 'Infrequent, in line with normal for this dog',
    questionable: 'Noticeably more frequent than usual',
    poor: 'Frequent, near-constant',
  },
  gas_odor: {
    good: 'Mild or unnoticeable',
    questionable: 'Stronger than usual',
    poor: 'Strong and unpleasant, clearly different from normal',
  },
};

export const WELLNESS_LEVEL_OPTIONS: { value: 'good' | 'questionable' | 'poor'; label: string }[] = [
  { value: 'good', label: 'Good' },
  { value: 'questionable', label: 'Questionable' },
  { value: 'poor', label: 'Poor' },
];

export const RED_FLAG_TYPES: { value: string; label: string; helper: string }[] = [
  { value: 'blood_in_stool', label: 'Blood in stool', helper: 'Any visible blood, fresh or dark/tarry' },
  { value: 'repeated_vomiting', label: 'Repeated vomiting', helper: 'More than one episode, or unable to keep water down' },
  { value: 'severe_lethargy', label: 'Severe lethargy', helper: 'Unusually unresponsive, weak, or won’t get up' },
  { value: 'other_urgent', label: 'Something else urgent', helper: 'Anything else that feels seriously wrong' },
];
