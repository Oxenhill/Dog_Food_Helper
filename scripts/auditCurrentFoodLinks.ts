import { findFoodMatches } from '../src/lib/foodNameMatching';
import { supabaseAdmin } from '../src/lib/supabase';

interface UnlinkedDog {
  id: string;
  owner_id: string | null;
  name: string;
  current_food_freetext: string;
}

interface MatchableFood {
  id: string;
  brand: string;
  name: string;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const { data: dogRows, error: dogsError } = await supabaseAdmin
    .from('dogs')
    .select('id, owner_id, name, current_food_freetext')
    .is('current_food_id', null)
    .not('current_food_freetext', 'is', null)
    .order('name');

  if (dogsError) throw dogsError;

  const { data: foodRows, error: foodsError } = await supabaseAdmin
    .from('foods')
    .select('id, brand, name')
    .eq('is_treat', false)
    .order('brand')
    .order('name');

  if (foodsError) throw foodsError;

  const dogs = (dogRows ?? []).filter(
    (dog): dog is UnlinkedDog =>
      typeof dog.current_food_freetext === 'string' &&
      dog.current_food_freetext.trim().length > 0
  );
  const foods = (foodRows ?? []) as MatchableFood[];

  for (const dog of dogs) {
    const matches = findFoodMatches(dog.current_food_freetext, foods);
    const summary = {
      dog_id: dog.id,
      dog_name: dog.name,
      freetext: dog.current_food_freetext,
      matches: matches.map((food) => ({
        food_id: food.id,
        food: `${food.brand} — ${food.name}`,
      })),
    };

    if (!apply || matches.length !== 1 || !dog.owner_id) {
      console.log(JSON.stringify({ action: 'dry_run', ...summary }));
      continue;
    }

    const [food] = matches;
    const { data, error } = await supabaseAdmin.rpc('confirm_label_food_for_dog', {
      p_owner_id: dog.owner_id,
      p_dog_id: dog.id,
      p_existing_food_id: food.id,
      p_food: null,
      p_ingredients: [],
      p_review_observation: null,
    });

    if (error) throw error;
    console.log(JSON.stringify({ action: 'linked', ...summary, result: data }));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
