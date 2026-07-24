'use client';

import { useEffect, useState } from 'react';
import { adminAuthHeaders, clearAdminToken, getAdminToken } from '@/lib/adminAuth';
import { saveSession } from '@/lib/session';
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
      saveSession(json.session);
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
      <div className="mx-auto max-w-md">
        <p className="eyebrow">Admin sign in</p>
        <h1 className="page-title mt-2">Chart illustrations</h1>
        <p className="lead mt-2">
          Sign in with an admin account (user_profiles.is_admin) to upload Bristol/BCS chart
          illustrations.
        </p>

        <div className="card card-pad mt-6">
          {signInError && (
            <div className="callout-alarm mb-4" role="alert">
              {signInError}
            </div>
          )}
          <div className="flex flex-col gap-4">
            <div className="field">
              <label className="label" htmlFor="charts-admin-email">
                Email
              </label>
              <input
                id="charts-admin-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                autoComplete="email"
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="charts-admin-password">
                Password
              </label>
              <input
                id="charts-admin-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                autoComplete="current-password"
              />
            </div>
            <button
              type="button"
              onClick={() => void signIn()}
              disabled={signingIn}
              className="btn-primary btn-block"
            >
              {signingIn ? 'Signing in…' : 'Sign in'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderSlot(chartType: ChartType, value: number, label: string) {
    const key = `${chartType}-${value}`;
    const currentUrl = manifest[chartType][String(value)];
    return (
      <div key={key} className="card card-pad flex items-center gap-4">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded border border-line bg-paper">
          {currentUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={currentUrl} alt={label} className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-[11px] text-ink-soft">No image</span>
          )}
        </div>
        <div className="flex-1">
          <label className="label" htmlFor={`chart-upload-${key}`}>
            {label}
          </label>
          <input
            id={`chart-upload-${key}`}
            type="file"
            accept="image/png,image/svg+xml"
            disabled={uploading[key]}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(chartType, value, file);
              e.target.value = '';
            }}
            className="input mt-1.5 text-[13px]"
          />
          {statusMsg[key] && <p className="help-text mt-1.5">{statusMsg[key]}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="eyebrow">Admin</p>
        <h1 className="page-title mt-1 text-[24px] sm:text-[26px]">Chart illustrations</h1>
        <p className="lead mt-2">
          Upload original SVG/PNG illustrations only. Never upload an existing brand&apos;s or
          body&apos;s published chart artwork.
        </p>
      </div>

      <div>
        <h2 className="section-title mb-3">Bristol stool scale (1–7)</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {BRISTOL_STOOL_TYPES.map((opt) => renderSlot('bristol', opt.value, opt.label))}
        </div>
      </div>

      <div>
        <h2 className="section-title mb-3">Body condition score (1–9)</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {BCS_LEVELS.map((opt) => renderSlot('bcs', opt.value, opt.label))}
        </div>
      </div>
    </div>
  );
}
