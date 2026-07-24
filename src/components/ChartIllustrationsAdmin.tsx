'use client';

import { useEffect, useState } from 'react';
import { adminAuthHeaders, clearAdminToken, getAdminToken, setAdminToken } from '@/lib/adminAuth';
import { BRISTOL_STOOL_TYPES, BCS_LEVELS } from '@/lib/chartReference';
import { ChartManifest, ChartType } from '@/lib/chartIllustrationStorage';

const EMPTY_MANIFEST: ChartManifest = { bristol: {}, bcs: {} };

/**
 * Admin page (hardening item 6, flagged "nice to have" not launch-blocking):
 * upload an original SVG/PNG illustration for each Bristol stool-scale value
 * (1-7) and BCS value (1-9). Uses the same admin sign-in as the ingredient
 * review queue (src/lib/adminAuth.ts / serverAdminAuth.ts) — if already
 * signed in there, this page picks up the same session.
 *
 * IMPORTANT: only upload ORIGINAL artwork. Never upload an existing brand's
 * or body's published chart (Purina, WSAVA, the official Bristol Stool Form
 * Scale, etc.) — see src/lib/chartReference.ts's header comment. This is a
 * legal/liability requirement the code cannot verify automatically.
 */
export default function ChartIllustrationsAdmin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signInError, setSignInError] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  const [manifest, setManifest] = useState<ChartManifest>(EMPTY_MANIFEST);
  const [statusMsg, setStatusMsg] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setHasToken(!!getAdminToken());
  }, []);

  async function loadManifest() {
    const res = await fetch('/api/charts/illustrations');
    if (res.ok) setManifest(await res.json());
  }

  useEffect(() => {
    void loadManifest();
  }, []);

  async function signIn() {
    setSignInError('');
    setSigningIn(true);
    try {
      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSignInError(json.error ?? `Sign-in failed (${res.status})`);
        return;
      }
      const accessToken = json.session?.access_token;
      if (!accessToken) {
        setSignInError('Signed in, but no session token was returned — check your email confirmation status.');
        return;
      }
      setAdminToken(accessToken);
      setHasToken(true);
    } finally {
      setSigningIn(false);
    }
  }

  async function upload(chartType: ChartType, value: number, file: File) {
    const key = `${chartType}-${value}`;
    setUploading((prev) => ({ ...prev, [key]: true }));
    setStatusMsg((prev) => ({ ...prev, [key]: '' }));
    try {
      const body = new FormData();
      body.append('chart_type', chartType);
      body.append('value', String(value));
      body.append('image', file);

      const res = await fetch('/api/admin/charts/upload', {
        method: 'POST',
        headers: adminAuthHeaders(),
        body,
      });

      if (res.status === 401) {
        clearAdminToken();
        setHasToken(false);
        setSignInError('Signed in, but this account does not have admin access (or the session expired).');
        return;
      }

      const json = await res.json();
      if (!res.ok) {
        setStatusMsg((prev) => ({ ...prev, [key]: `Error: ${json.error ?? res.status}` }));
        return;
      }

      setStatusMsg((prev) => ({ ...prev, [key]: 'Uploaded' }));
      await loadManifest();
    } finally {
      setUploading((prev) => ({ ...prev, [key]: false }));
    }
  }

  if (!hasToken) {
    return (
      <div className="max-w-md space-y-3">
        <h1 className="text-xl font-bold">Chart illustrations — admin sign in</h1>
        <p className="text-sm text-gray-600">
          Sign in with an admin account (user_profiles.is_admin) to upload Bristol/BCS chart
          illustrations.
        </p>
        {signInError && <p className="text-sm text-red-600">{signInError}</p>}
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border border-gray-300 rounded-lg p-2 text-sm"
          placeholder="Email"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border border-gray-300 rounded-lg p-2 text-sm"
          placeholder="Password"
        />
        <button
          type="button"
          onClick={() => void signIn()}
          disabled={signingIn}
          className="bg-gray-800 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50"
        >
          {signingIn ? 'Signing in…' : 'Sign in'}
        </button>
      </div>
    );
  }

  function renderSlot(chartType: ChartType, value: number, label: string) {
    const key = `${chartType}-${value}`;
    const currentUrl = manifest[chartType][String(value)];
    return (
      <div key={key} className="border border-gray-200 rounded-lg p-3 flex items-center gap-4">
        <div className="w-24 h-24 flex items-center justify-center bg-gray-50 rounded border border-gray-100 shrink-0">
          {currentUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={currentUrl} alt={label} className="max-w-full max-h-full" />
          ) : (
            <span className="text-xs text-gray-400">No image</span>
          )}
        </div>
        <div className="flex-1 space-y-1">
          <div className="text-sm font-medium">{label}</div>
          <input
            type="file"
            accept="image/png,image/svg+xml"
            disabled={uploading[key]}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(chartType, value, file);
              e.target.value = '';
            }}
            className="text-xs"
          />
          {statusMsg[key] && <p className="text-xs text-gray-600">{statusMsg[key]}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-bold">Chart illustrations — admin</h1>
      <p className="text-sm text-gray-600">
        Upload original SVG/PNG illustrations only. Never upload an existing brand&apos;s or
        body&apos;s published chart artwork.
      </p>

      <div>
        <h2 className="font-semibold mb-2">Bristol stool scale (1–7)</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {BRISTOL_STOOL_TYPES.map((opt) => renderSlot('bristol', opt.value, opt.label))}
        </div>
      </div>

      <div>
        <h2 className="font-semibold mb-2">Body condition score (1–9)</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {BCS_LEVELS.map((opt) => renderSlot('bcs', opt.value, opt.label))}
        </div>
      </div>
    </div>
  );
}
