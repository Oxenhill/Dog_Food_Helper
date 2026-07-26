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
      <div
        className="flex flex-col gap-4 rounded-xl border-4 border-alarm bg-alarm-tint p-6"
        role="alert"
      >
        <div className="flex items-center gap-3">
          <span className="text-4xl" aria-hidden>
            ⚠️
          </span>
          <h2 className="font-display text-2xl font-extrabold text-alarm-dark">
            This may need urgent veterinary attention
          </h2>
        </div>
        <p className="text-[15px] font-medium text-ink">
          You&apos;ve flagged: <span className="font-bold text-alarm-dark">{flagInfo?.label}</span>.
          Please contact your vet, or an emergency vet service if it&apos;s outside normal hours,
          rather than waiting to see if it settles.
        </p>
        <p className="text-[13px] text-ink-soft">
          Bowl is a decision-support tool, not a diagnostic or veterinary service — this
          symptom is outside what it can assess. Your vet is the right next step.
        </p>

        <div className="text-[13px] font-semibold text-alarm-dark">
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
          className="self-start text-[13px] font-semibold text-alarm-dark underline underline-offset-2"
        >
          Log a different urgent symptom
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border-2 border-alarm bg-alarm-tint p-6">
      <h2 className="font-display text-xl font-bold text-alarm-dark">Report an urgent symptom</h2>
      <p className="text-[14px] text-ink">
        Use this only for something that feels seriously wrong, not routine day-to-day logging.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {RED_FLAG_TYPES.map((flag) => (
          <button
            key={flag.value}
            type="button"
            onClick={() => handleSelect(flag.value as RedFlagType)}
            className="rounded-lg border-2 border-alarm/40 bg-surface p-4 text-left transition hover:border-alarm hover:bg-alarm-tint"
          >
            <div className="font-bold text-alarm-dark">{flag.label}</div>
            <div className="mt-1 text-[12.5px] text-ink-soft">{flag.helper}</div>
          </button>
        ))}
      </div>

      <div className="field">
        <label className="label" htmlFor="red-flag-notes">
          Notes (optional)
        </label>
        <textarea
          id="red-flag-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="textarea"
          placeholder="Anything else worth noting for your vet"
        />
      </div>
    </div>
  );
}
