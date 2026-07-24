'use client';

import { useEffect, useState } from 'react';
import { ChartManifest } from './chartIllustrationStorage';

const EMPTY_MANIFEST: ChartManifest = { bristol: {}, bcs: {} };

/**
 * Fetches the public chart-illustration manifest once (GET
 * /api/charts/illustrations, no auth needed — same public-reference-data
 * trust level as `foods`). BristolChartSelector/BCSChartSelector use this to
 * render an uploaded illustration per value when one exists, falling back to
 * the existing text-only rendering when it doesn't (e.g. before any
 * illustrations have been uploaded via /admin/charts at all).
 */
export function useChartIllustrations(): ChartManifest {
  const [manifest, setManifest] = useState<ChartManifest>(EMPTY_MANIFEST);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/charts/illustrations')
      .then((res) => (res.ok ? res.json() : EMPTY_MANIFEST))
      .then((json) => {
        if (!cancelled) setManifest(json);
      })
      .catch(() => {
        if (!cancelled) setManifest(EMPTY_MANIFEST);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return manifest;
}
