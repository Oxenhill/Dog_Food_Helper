'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authHeaders, getUserId } from '@/lib/clientAuth';
import { useEffect } from 'react';
import FoodPicker, { PickableFood } from '@/components/FoodPicker';

const SIZE_CATEGORIES = ['toy', 'small', 'medium', 'large', 'giant'] as const;
const LIFESTYLE_ROLES = ['pet', 'working', 'sporting', 'breeding'] as const;
const WORK_TYPES = ['none', 'gundog', 'herding', 'sled', 'protection', 'other'] as const;

/**
 * Dog profile creation form. POST /api/dogs/create has existed since Phase 1
 * but had no UI to reach it — this was flagged in BUILD_PROGRESS.md as a gap
 * ("no dog-profile-creation page... only the API route exists") and is now
 * filled in.
 */
export default function NewDogPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [breed, setBreed] = useState('');
  const [ageYears, setAgeYears] = useState('');
  const [ageMonths, setAgeMonths] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [sizeCategory, setSizeCategory] = useState<string>('');
  const [lifestyleRole, setLifestyleRole] = useState<string>('pet');
  const [workType, setWorkType] = useState<string>('none');
  const [dailyExerciseHours, setDailyExerciseHours] = useState('');
  const [currentFoodFreetext, setCurrentFoodFreetext] = useState('');
  const [selectedFood, setSelectedFood] = useState<PickableFood | null>(null);
  const [monthlyFoodBudget, setMonthlyFoodBudget] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!getUserId()) router.replace('/signin');
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/dogs/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          name,
          breed: breed || undefined,
          age_years: ageYears ? Number(ageYears) : undefined,
          age_months: ageMonths ? Number(ageMonths) : undefined,
          weight_kg: weightKg ? Number(weightKg) : undefined,
          size_category: sizeCategory || undefined,
          lifestyle_role: lifestyleRole,
          work_type: workType,
          daily_exercise_hours: dailyExerciseHours ? Number(dailyExerciseHours) : undefined,
          current_food_id: selectedFood?.id,
          current_food_freetext: selectedFood ? undefined : currentFoodFreetext || undefined,
          monthly_food_budget: monthlyFoodBudget ? Number(monthlyFoodBudget) : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? `Failed to create dog profile (${res.status})`);
        return;
      }
      router.push(`/dogs/${json.dog.id}`);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <Link href="/dogs" className="wordmark">
            <span className="wordmark-dot" />
            Bowl
          </Link>
        </div>
      </header>

      <main className="container-narrow">
        <p className="eyebrow">New profile</p>
        <h1 className="page-title mt-2">Add a dog</h1>
        <p className="lead mt-2">
          The essentials to get started — you can add allergies, health conditions and more detail
          later.
        </p>

        <div className="card card-pad mt-6">
          {error && (
            <div className="callout-alarm mb-4" role="alert">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="field">
              <label className="label" htmlFor="name">
                Name *
              </label>
              <input
                id="name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input"
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="breed">
                Breed
              </label>
              <input
                id="breed"
                type="text"
                value={breed}
                onChange={(e) => setBreed(e.target.value)}
                className="input"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="field">
                <label className="label" htmlFor="ageYears">
                  Age
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="ageYears"
                    type="number"
                    min={0}
                    value={ageYears}
                    onChange={(e) => setAgeYears(e.target.value)}
                    className="input metric"
                    placeholder="yrs"
                    aria-label="Age in years"
                  />
                  <input
                    id="ageMonths"
                    type="number"
                    min={0}
                    max={11}
                    value={ageMonths}
                    onChange={(e) => setAgeMonths(e.target.value)}
                    className="input metric"
                    placeholder="mths"
                    aria-label="Additional months"
                  />
                </div>
                <p className="help-text">Approximate is fine — years and months.</p>
              </div>
              <div className="field">
                <label className="label" htmlFor="weightKg">
                  Weight (kg)
                </label>
                <input
                  id="weightKg"
                  type="number"
                  step="0.1"
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                  className="input metric"
                />
              </div>
            </div>
            <div className="field">
              <label className="label" htmlFor="sizeCategory">
                Size category
              </label>
              <select
                id="sizeCategory"
                value={sizeCategory}
                onChange={(e) => setSizeCategory(e.target.value)}
                className="select"
              >
                <option value="">Select…</option>
                {SIZE_CATEGORIES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="field">
                <label className="label" htmlFor="lifestyleRole">
                  Lifestyle role
                </label>
                <select
                  id="lifestyleRole"
                  value={lifestyleRole}
                  onChange={(e) => setLifestyleRole(e.target.value)}
                  className="select"
                >
                  {LIFESTYLE_ROLES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="label" htmlFor="workType">
                  Work type
                </label>
                <select
                  id="workType"
                  value={workType}
                  onChange={(e) => setWorkType(e.target.value)}
                  className="select"
                >
                  {WORK_TYPES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field">
              <label className="label" htmlFor="dailyExerciseHours">
                Daily exercise (hours)
              </label>
              <input
                id="dailyExerciseHours"
                type="number"
                step="0.5"
                value={dailyExerciseHours}
                onChange={(e) => setDailyExerciseHours(e.target.value)}
                className="input metric"
              />
            </div>
            {/* Picking the real catalogue row (rather than typing a name) is
                what lets everything downstream work: free text can't be joined
                to an ingredient list, so a free-text food contributes nothing
                to working out what agrees with your dog. Free text stays
                available so an unlisted food isn't a dead end. */}
            <div className="field">
              <span className="label">Current food</span>
              {selectedFood ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[14px] font-semibold text-ink">
                    {selectedFood.brand} {selectedFood.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedFood(null)}
                    className="btn-ghost btn-sm shrink-0"
                  >
                    Change
                  </button>
                </div>
              ) : currentFoodFreetext ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[14px] text-ink">{currentFoodFreetext}</span>
                  <button
                    type="button"
                    onClick={() => setCurrentFoodFreetext('')}
                    className="btn-ghost btn-sm shrink-0"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <FoodPicker
                  type="meal"
                  onSelect={(food) => setSelectedFood(food)}
                  onSelectFreetext={(text) => setCurrentFoodFreetext(text)}
                />
              )}
              <p className="help-text">
                Optional — you can set this later from your dog&apos;s page.
              </p>
            </div>
            <div className="field">
              <label className="label" htmlFor="monthlyFoodBudget">
                Monthly food budget (£, optional)
              </label>
              <input
                id="monthlyFoodBudget"
                type="number"
                step="1"
                value={monthlyFoodBudget}
                onChange={(e) => setMonthlyFoodBudget(e.target.value)}
                className="input metric"
              />
            </div>
            <button type="submit" disabled={submitting} className="btn-primary btn-block mt-1">
              {submitting ? 'Creating…' : 'Create dog profile'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
