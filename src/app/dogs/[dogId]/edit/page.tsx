'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authHeaders, getUserId } from '@/lib/clientAuth';
import { dobToAge } from '@/lib/lifeStage';
import { Dog } from '@/lib/types';

const SIZE_CATEGORIES = ['toy', 'small', 'medium', 'large', 'giant'] as const;
const LIFESTYLE_ROLES = ['pet', 'working', 'sporting', 'breeding'] as const;
const WORK_TYPES = ['none', 'gundog', 'herding', 'sled', 'protection', 'other'] as const;

/**
 * Dog profile edit form. Mirrors dogs/new/page.tsx's field set and styling,
 * but loads the existing profile via GET /api/dogs/[dogId] and pre-fills the
 * form, then submits changes via PUT /api/dogs/[dogId] (both routes already
 * existed — this is the first UI entry point for PUT). life_stage is
 * intentionally not editable here: it's system-derived from date_of_birth /
 * size_category, and the PUT route re-derives and rejects direct writes to
 * it server-side (see src/app/api/dogs/[dogId]/route.ts).
 */
export default function EditDogPage({ params }: { params: { dogId: string } }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

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
  const [monthlyFoodBudget, setMonthlyFoodBudget] = useState('');

  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!getUserId()) {
      router.replace('/signin');
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/dogs/${params.dogId}`, { headers: authHeaders() });
        const json = await res.json();
        if (!res.ok) {
          setLoadError(json.error ?? `Failed to load dog (${res.status})`);
          return;
        }
        const dog = json as Dog;
        setName(dog.name ?? '');
        setBreed(dog.breed ?? '');
        if (dog.date_of_birth) {
          const age = dobToAge(dog.date_of_birth);
          setAgeYears(String(age.years));
          setAgeMonths(String(age.months));
        }
        setWeightKg(dog.weight_kg != null ? String(dog.weight_kg) : '');
        setSizeCategory(dog.size_category ?? '');
        setLifestyleRole(dog.lifestyle_role ?? 'pet');
        setWorkType(dog.work_type ?? 'none');
        setDailyExerciseHours(
          dog.daily_exercise_hours != null ? String(dog.daily_exercise_hours) : ''
        );
        setCurrentFoodFreetext(dog.current_food_freetext ?? '');
        setMonthlyFoodBudget(
          dog.monthly_food_budget != null ? String(dog.monthly_food_budget) : ''
        );
      } catch {
        setLoadError('Something went wrong loading this dog. Please try again.');
      } finally {
        setLoading(false);
      }
    })();
  }, [params.dogId, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch(`/api/dogs/${params.dogId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          name,
          breed: breed || undefined,
          age_years: ageYears !== '' ? Number(ageYears) : undefined,
          age_months: ageMonths !== '' ? Number(ageMonths) : undefined,
          weight_kg: weightKg ? Number(weightKg) : undefined,
          size_category: sizeCategory || undefined,
          lifestyle_role: lifestyleRole,
          work_type: workType,
          daily_exercise_hours: dailyExerciseHours ? Number(dailyExerciseHours) : undefined,
          // current_food is intentionally not submitted — see the field below.
          monthly_food_budget: monthlyFoodBudget ? Number(monthlyFoodBudget) : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? `Failed to update dog profile (${res.status})`);
        return;
      }
      router.push(`/dogs/${params.dogId}`);
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
            Dog Food Helper
          </Link>
        </div>
      </header>

      <main className="container-narrow">
        <Link
          href={`/dogs/${params.dogId}`}
          className="muted text-[13px] font-semibold text-pine hover:underline"
        >
          ← Back to profile
        </Link>
        <p className="eyebrow mt-4">Edit profile</p>
        <h1 className="page-title mt-2">{name ? `Edit ${name}` : 'Edit profile'}</h1>

        {loading && <p className="muted mt-6">Loading…</p>}

        {!loading && loadError && (
          <div className="callout-alarm mt-6" role="alert">
            {loadError}
          </div>
        )}

        {!loading && !loadError && (
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
              {/* Current food is deliberately NOT editable here any more.
                  Changing it is a dated event, not a profile field: the switch
                  has to close the previous food's period and open the new
                  one, or `dogs.current_food_id` drifts out of step with
                  `dog_food_events` and every log attributed from it becomes
                  wrong. The dog's page owns that action. */}
              <div className="field">
                <span className="label">Current food</span>
                <p className="text-[14px] text-ink">
                  {currentFoodFreetext || 'Not recorded'}
                </p>
                <p className="help-text">
                  Changed foods? Record it on your dog&apos;s page so we know when the change
                  happened — that&apos;s what lets us compare before and after.
                </p>
                <Link
                  href={`/dogs/${params.dogId}`}
                  className="mt-1 inline-block text-[13px] font-semibold text-pine hover:underline"
                >
                  Go to {name || 'your dog'}&apos;s page →
                </Link>
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
                {submitting ? 'Saving…' : 'Save changes'}
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
