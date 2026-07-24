import { Dog, Food, LifeStage, SizeCategory } from './types';
import { ageInMonths, deriveLifeStage } from './lifeStage';

/**
 * Nutritional fit scoring (Phase 3)
 *
 * Per the phase prompt: score foods on calorie density (calories_per_kg) vs.
 * expected requirements, driven by size_category/life_stage/lifestyle_role/
 * work_type/daily_exercise_hours (architecture doc §4/§5), plus age/size
 * suitability against the food's own `suitable_age_*`/`suitable_size_*`
 * fields. Returns 0-1.
 *
 * Schema honesty note (logged to BUILD_PROGRESS.md too): the architecture
 * doc says nutritional_fit should rest on AAFCO/WSAVA nutrient profiles, but
 * `foods` (Part A) has no protein/fat/fibre/moisture columns — only
 * calories_per_kg and the suitability range fields. So this Phase 3
 * implementation approximates AAFCO/WSAVA-style adequacy the only way the
 * current schema supports: (a) age/size suitability, which foods already
 * declare directly, and (b) calorie-density-to-energy-need matching, using
 * the standard veterinary RER/DER formula (WSAVA/NRC) as the basis for what
 * "energy need" means. True per-nutrient AAFCO minimum checking would need a
 * Part A schema extension (protein/fat/etc. columns on `foods`) — flagged as
 * a follow-up, not guessed at here.
 */

const SIZE_ORDER: Record<SizeCategory, number> = {
  toy: 0,
  small: 1,
  medium: 2,
  large: 3,
  giant: 4,
};

/**
 * Resting Energy Requirement, kcal/day: RER = 70 * bodyweight_kg^0.75.
 * Standard veterinary nutrition formula (WSAVA Global Nutrition Guidelines,
 * NRC "Nutrient Requirements of Dogs and Cats") — the real methodological
 * basis for the DER calculation below.
 */
export function calculateRER(weightKg: number): number {
  return 70 * Math.pow(weightKg, 0.75);
}

/**
 * DER multiplier bands (RER * multiplier = Daily Energy Requirement).
 *
 * There is no single official multiplier table any more than there's an
 * official set of recommendation-scoring weights (see Part C item 4's own
 * "designed, not purely research-derived" caveat) — commonly-cited veterinary
 * nutrition ranges are used here (NRC 2006 growth ~2.0x; typical adult pet
 * ~1.4-1.8x; working/sporting dogs 2-5x depending on workload/intensity).
 * Kept as one named, documented function rather than scattered magic numbers
 * so it's easy to revisit after a proper vet/nutrition review.
 */
export function getDerMultiplier(
  lifeStage: LifeStage | null,
  lifestyleRole: string,
  workType: string,
  dailyExerciseHours: number | null | undefined
): number {
  if (lifeStage === 'puppy') return 2.0;
  if (lifeStage === 'senior') return 1.4;

  const hours = dailyExerciseHours ?? 1;

  if (lifestyleRole === 'working' || lifestyleRole === 'sporting') {
    if (workType === 'sled' || workType === 'herding') {
      return hours >= 4 ? 4.5 : hours >= 2 ? 3.2 : 2.2;
    }
    if (workType === 'gundog' || workType === 'protection') {
      return hours >= 4 ? 3.5 : hours >= 2 ? 2.6 : 2.0;
    }
    // work_type 'other' or unspecified but role is working/sporting
    return hours >= 3 ? 2.6 : 2.0;
  }

  if (lifestyleRole === 'breeding') return 1.8;

  // pet (default)
  if (hours >= 3) return 1.8;
  if (hours >= 1) return 1.6;
  return 1.4;
}

export interface DerResult {
  der: number; // kcal/day
  rer: number;
  multiplier: number;
  lifeStage: LifeStage | null;
  weightAssumed: boolean; // true if dog.weight_kg was missing and a fallback was used
  weightKg: number;
}

const FALLBACK_WEIGHT_KG = 15; // rough median-dog fallback; only used if weight_kg is unset

/** Computes a dog's DER once — this needs a DB round-trip (life_stage), so
 * callers should call it once per request and reuse the result across foods. */
export async function calculateDER(dog: Dog): Promise<DerResult> {
  const lifeStage = await deriveLifeStage(dog.date_of_birth, dog.size_category);
  const weightAssumed = dog.weight_kg == null;
  const weightKg = dog.weight_kg ?? FALLBACK_WEIGHT_KG;
  const rer = calculateRER(weightKg);
  const multiplier = getDerMultiplier(
    lifeStage,
    dog.lifestyle_role,
    dog.work_type,
    dog.daily_exercise_hours
  );
  return { der: rer * multiplier, rer, multiplier, lifeStage, weightAssumed, weightKg };
}

interface EnergyBand {
  min: number;
  ideal: number;
  max: number;
}

/**
 * Maps energy need per kg bodyweight (kcal/kg/day) to a target calorie-density
 * band for food selection. This is the mechanism behind "a working gundog and
 * a sedentary pet should score differently" — high energy-need dogs are
 * scored toward calorie-dense foods (less volume needed per feed), low
 * energy-need dogs toward more moderate density (avoid overfeeding on small
 * portions). Bands are a designed heuristic, not an official density
 * standard (see module-level note).
 */
function getTargetCalorieBand(energyPerKg: number): EnergyBand {
  if (energyPerKg < 60) return { min: 2800, ideal: 3300, max: 3700 };
  if (energyPerKg < 90) return { min: 3300, ideal: 3650, max: 4000 };
  if (energyPerKg < 130) return { min: 3600, ideal: 3950, max: 4300 };
  return { min: 3900, ideal: 4350, max: 4800 };
}

function scoreCalorieDensity(foodCaloriesPerKg: number | null | undefined, band: EnergyBand): number {
  if (!foodCaloriesPerKg) return 0.5; // unknown density on the food record — neutral, not penalised
  const distance = Math.abs(foodCaloriesPerKg - band.ideal);
  const halfWidth = band.max - band.ideal;
  const score = 1 - distance / (halfWidth * 2);
  return Math.max(0, Math.min(1, score));
}

function scoreSizeSuitability(dogSize: SizeCategory | null | undefined, food: Food): number {
  if (!dogSize) return 0.5;
  const dogRank = SIZE_ORDER[dogSize];
  const minRank = food.suitable_size_min ? SIZE_ORDER[food.suitable_size_min] : SIZE_ORDER.toy;
  const maxRank = food.suitable_size_max ? SIZE_ORDER[food.suitable_size_max] : SIZE_ORDER.giant;
  if (dogRank >= minRank && dogRank <= maxRank) return 1;
  const distance = dogRank < minRank ? minRank - dogRank : dogRank - maxRank;
  return Math.max(0, 1 - distance * 0.4);
}

function scoreAgeSuitability(ageMonths: number | null, food: Food): number {
  if (ageMonths === null) return 0.5;
  const min = food.suitable_age_min_months ?? 0;
  const max = food.suitable_age_max_months ?? 999;
  if (ageMonths >= min && ageMonths <= max) return 1;
  const distance = ageMonths < min ? min - ageMonths : ageMonths - max;
  return Math.max(0, 1 - distance / 12); // full credit lost roughly a year out of range
}

export interface NutritionalFitResult {
  score: number;
  calorieDensityScore: number;
  ageSuitabilityScore: number;
  sizeSuitabilityScore: number;
}

/** Pure/sync per-food scoring — call calculateDER(dog) once per request and
 * reuse it here for every candidate food, rather than re-deriving life_stage
 * (a DB call) per food. */
export function scoreNutritionalFitForFood(dog: Dog, food: Food, der: DerResult): NutritionalFitResult {
  const energyPerKg = der.der / der.weightKg;
  const band = getTargetCalorieBand(energyPerKg);
  const calorieDensityScore = scoreCalorieDensity(food.calories_per_kg, band);

  const ageMonths = dog.date_of_birth ? ageInMonths(dog.date_of_birth) : null;
  const ageSuitabilityScore = scoreAgeSuitability(ageMonths, food);
  const sizeSuitabilityScore = scoreSizeSuitability(dog.size_category, food);

  const score = 0.5 * calorieDensityScore + 0.3 * ageSuitabilityScore + 0.2 * sizeSuitabilityScore;

  return { score, calorieDensityScore, ageSuitabilityScore, sizeSuitabilityScore };
}
