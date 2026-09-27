// Amplitude Analytics (browser) — Unified SDK: analytics + session replay.
// Loaded dynamically from the client root (routes/__root.tsx) inside a
// useEffect, so this browser SDK never evaluates during SSR. Initialized once.
import * as amplitude from '@amplitude/unified';

let started = false;

export function initAmplitude(): void {
  if (started) return;
  started = true;
  const key = import.meta.env['VITE_AMPLITUDE_API_KEY'];
  if (!key) {
    console.warn('Amplitude API key missing — analytics disabled');
    return;
  }
  // Session Replay sampled at 10% — this is a payments app, so we do not record
  // every diner's bill/checkout session (owner-chosen recommended rate).
  amplitude.initAll(key, { analytics: { autocapture: true }, sessionReplay: { sampleRate: 0.1 } });
  amplitude.track('Viewed Home Page', { prompt_version: 'BA400.4' }); // helps improve this setup flow — safe to remove once you've verified the event lands
}
