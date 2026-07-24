'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authHeaders, getUserId } from '@/lib/clientAuth';
import { useEffect } from 'react';

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
  const [dateOfBirth, setDateOfBirth] = useState('');
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
          date_of_birth: dateOfBirth || undefined,
          weight_kg: weightKg ? Number(weightKg) : undefined,
          size_category: sizeCategory || undefined,
          lifestyle_role: lifestyleRole,
          work_type: workType,
          daily_exercise_hours: dailyExerciseHours ? Number(dailyExerciseHours) : undefined,
          current_food_freetext: currentFoodFreetext || undefined,
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
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-lg mx-auto bg-white rounded-lg shadow p-6 space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">Add a dog</h1>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg p-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Breed</label>
            <input
              type="text"
              value={breed}
              onChange={(e) => setBreed(e.target.value)}
              className="w-full border border-gray-300 rounded-lg p-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date of birth</label>
              <input
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                className="w-full border border-gray-300 rounded-lg p-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Weight (kg)</label>
              <input
                type="number"
                step="0.1"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                className="w-full border border-gray-300 rounded-lg p-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Size category</label>
            <select
              value={sizeCategory}
              onChange={(e) => setSizeCategory(e.target.value)}
              className="w-full border border-gray-300 rounded-lg p-2 text-sm"
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
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Lifestyle role</label>
              <select
                value={lifestyleRole}
                onChange={(e) => setLifestyleRole(e.target.value)}
                className="w-full border border-gray-300 rounded-lg p-2 text-sm"
              >
                {LIFESTYLE_ROLES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Work type</label>
              <select
                value={workType}
                onChange={(e) => setWorkType(e.target.value)}
                className="w-full border border-gray-300 rounded-lg p-2 text-sm"
              >
                {WORK_TYPES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Daily exercise (hours)
            </label>
            <input
              type="number"
              step="0.5"
              value={dailyExerciseHours}
              onChange={(e) => setDailyExerciseHours(e.target.value)}
              className="w-full border border-gray-300 rounded-lg p-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Current food</label>
            <input
              type="text"
              placeholder="e.g. Canagan Grain-Free Chicken"
              value={currentFoodFreetext}
              onChange={(e) => setCurrentFoodFreetext(e.target.value)}
              className="w-full border border-gray-300 rounded-lg p-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Monthly food budget (£, optional)
            </label>
            <input
              type="number"
              step="1"
              value={monthlyFoodBudget}
              onChange={(e) => setMonthlyFoodBudget(e.target.value)}
              className="w-full border border-gray-300 rounded-lg p-2 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Creating…' : 'Create dog profile'}
          </button>
        </form>
      </div>
    </main>
  );
}
