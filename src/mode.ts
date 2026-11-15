/** True for a URL with `?demo`. */
export function isDemoUrl(search: string): boolean {
  return new URLSearchParams(search).has('demo');
}

/**
 * Demo mode: opened with `?demo`. It uses its own IndexedDB database filled with sample
 * workouts, and syncing is turned off, so it never touches real data or a real sheet.
 */
export const DEMO = typeof location !== 'undefined' && isDemoUrl(location.search);
