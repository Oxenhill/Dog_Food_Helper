'use client';

import { useState } from 'react';
import { authHeaders } from '@/lib/clientAuth';
import { RED_FLAG_TYPES } from '@/lib/chartReference';
import { RedFlagType } from '@/lib/types';

/**
 * Red-flag escalation UI (architecture doc §9 / legal review §1).
 *
 * Deliberately styled nothing like routine logging — urgent red/amber
 * palette, larger type, the "contact your vet" response fires immediately
 * on selection, client-side, and does NOT wait on the server round-trip
 * (Part B: "should trigger the UI response immediately client-side, not
 * wait on a server round-trip").
 *
 * Wording stays in "this may need urgent veterinary attention" territory,
 * not diagnostic language — Veterinary Surgeons Act 1966 risk, legal review §1.
 */
export default function RedFlagForm({ dogId }: { dogId: string }) {
  const [selectedFlag, setSelectedFlag] = useState<RedFlagType | null>(null);
  const [notes, setNotes] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  function handleSelect(flagType: RedFlagType) {
    // Show the urgent response immediately — before any network call.
    setSelectedFlag(flagType);
    void persist(flagType);
  }

  async function persist(flagType: RedFlagType) {
    setSaveState('saving');
    try {
      const res = await fetch('/api/red-flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ dog_id: dogId, flag_type: flagType, notes: notes || undefined }),
      });
      if (!res.ok) {
        setSaveState('error');
        return;
      }
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  }

  if (selectedFlag) {
    const flagInfo = RED_FLAG_TYPES.find((f) => f.value === selectedFlag);
    return (
      <div className="border-4 border-red-600 bg-red-50 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <span className="text-4xl" aria-hidden>
            ⚠️
          </span>
          <h2 className="text-2xl font-extrabold text-red-800">
            This may need urgent veterinary attention
          </h2>
        </div>
        <p className="text-red-900 font-medium">
          You&apos;ve flagged: <span className="font-bold">{flagInfo?.label}</span>. Please contact
          your vet, or an emergency vet service if it&apos;s outside normal hours, rather than
          waiting to see if it settles.
        </p>
        <p className="text-red-800 text-sm">
          Dog Food Helper is a decision-support tool, not a diagnostic or veterinary service — this
          symptom is outside what it can assess. Your vet is the right next step.
        </p>

        <div className="text-sm text-red-700">
          {saveState === 'saving' && 'Saving this to your dog’s record…'}
          {saveState === 'saved' && 'Recorded to your dog’s record.'}
          {saveState === 'error' && 'Recorded on-screen — the save to your record failed, please try again.'}
        </div>

        <button
          type="button"
          onClick={() => {
            setSelectedFlag(null);
            setNotes('');
            setSaveState('idle');
          }}
          className="text-sm text-red-700 underline"
        >
          Log a different urgent symptom
        </button>
      </div>
    );
  }

  return (
    <div className="border-2 border-red-300 bg-red-50/50 rounded-xl p-6 space-y-4">
      <h2 className="text-xl font-bold text-red-800">Report an urgent symptom</h2>
      <p className="text-sm text-gray-700">
        Use this only for something that feels seriously wrong, not routine day-to-day logging.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {RED_FLAG_TYPES.map((flag) => (
          <button
            key={flag.value}
            type="button"
            onClick={() => handleSelect(flag.value as RedFlagType)}
            className="text-left border-2 border-red-400 bg-white hover:bg-red-100 rounded-lg p-4 transition"
          >
            <div className="font-bold text-red-800">{flag.label}</div>
            <div className="text-xs text-gray-600 mt-1">{flag.helper}</div>
          </button>
        ))}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full border border-gray-300 rounded-lg p-2 text-sm"
          placeholder="Anything else worth noting for your vet"
        />
      </div>
    </div>
  );
}
