/**
 * The ordered ingredient list — the primary information about a food.
 *
 * Label order is meaningful (descending inclusion by weight), so this renders
 * as an ordered list and never re-sorts, groups or filters. Compound
 * ingredients nest, because that is where a beef-flavoured food's hidden
 * chicken actually appears — flattening or omitting them would hide exactly the
 * detail an owner needs.
 *
 * HONESTY RULES, all load-bearing:
 *  - An inclusion percentage is shown ONLY when the label printed one. The
 *    absence of a percentage is never filled in from position.
 *  - When no ingredient list has been recorded, this says so plainly. It never
 *    fabricates, estimates or part-fills a list.
 */

'use client';

import type { FoodFullIngredient } from '@/lib/foodFull';
import { categoryLabel } from '@/lib/ingredientCategories';

function IngredientRow({
  ingredient,
  nested,
}: {
  ingredient: FoodFullIngredient;
  nested?: boolean;
}) {
  return (
    <li className={nested ? 'py-1' : 'hairline py-2.5 first:border-0 first:pt-0'}>
      <div className="flex items-baseline justify-between gap-3">
        <span className={nested ? 'text-[13.5px] text-ink-soft' : 'text-[15px] text-ink'}>
          {!nested && <span className="metric mr-2 text-ink-soft">{ingredient.position}.</span>}
          {ingredient.name}
          {ingredient.note && (
            <span className="muted text-[12.5px]"> — {ingredient.note}</span>
          )}
        </span>
        {ingredient.inclusion_pct !== null && (
          <span className="metric shrink-0 text-[13px] font-semibold text-ink">
            {ingredient.inclusion_pct}%
          </span>
        )}
      </div>

      {ingredient.category && !nested && (
        <p className="help-text mt-0.5">{categoryLabel(ingredient.category)}</p>
      )}

      {ingredient.sub_ingredients.length > 0 && (
        <div className="mt-1.5 border-l-2 border-line pl-3">
          <p className="eyebrow mb-1">Contains</p>
          <ul>
            {ingredient.sub_ingredients.map((sub, i) => (
              <IngredientRow key={`${sub.name}-${i}`} ingredient={sub} nested />
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

export interface IngredientListProps {
  ingredients: FoodFullIngredient[];
  /** Brand + name, used only in the empty-state copy. */
  foodLabel?: string;
}

export default function IngredientList({ ingredients, foodLabel }: IngredientListProps) {
  if (ingredients.length === 0) {
    return (
      <div className="callout-info">
        <p className="font-semibold text-ink">No ingredient list recorded yet</p>
        <p className="mt-1">
          We haven&apos;t transcribed the ingredient list for{' '}
          {foodLabel ? <strong>{foodLabel}</strong> : 'this food'} yet, so we can&apos;t show you
          what&apos;s in it. We only ever show ingredients copied directly from the
          manufacturer&apos;s label — we won&apos;t guess. Check the packet or the brand&apos;s own
          page in the meantime.
        </p>
      </div>
    );
  }

  const anyPercentages = ingredients.some(
    (i) => i.inclusion_pct !== null || i.sub_ingredients.some((s) => s.inclusion_pct !== null)
  );

  return (
    <div>
      <ol>
        {ingredients.map((ingredient) => (
          <IngredientRow key={`${ingredient.position}-${ingredient.name}`} ingredient={ingredient} />
        ))}
      </ol>
      <p className="help-text mt-3">
        Listed in the manufacturer&apos;s own order, which runs from most to least by weight.
        {anyPercentages
          ? ' Percentages are shown only where the label prints them.'
          : ' This label doesn’t print inclusion percentages, so none are shown.'}
      </p>
    </div>
  );
}
