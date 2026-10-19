// Light / dark theme. The switch wipes the new theme in as a circle from the
// button using the View Transitions API, with a plain swap as fallback.
export type Theme = 'dark' | 'light';

let current: Theme = 'dark';
let change = 0;
let cancelVisual = () => {};
let deadline: ReturnType<typeof setTimeout> | undefined;

export const theme = () => current;

function apply(next: Theme) {
  current = next;
  document.documentElement.dataset.theme = next;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'dark' ? '#090d17' : '#f5f6f8');
  try {
    localStorage.setItem('sansphase-hero-theme', next);
  } catch {
    // Storage may be unavailable; the switch still works for this visit.
  }
  document.getElementById('theme')?.setAttribute('aria-pressed', String(next === 'dark'));
}

export function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem('sansphase-hero-theme');
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    // Fall through to the system preference.
  }
  return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function setTheme(next: Theme, origin?: { x: number; y: number }, reduced = false) {
  const request = ++change;
  cancelVisual(); cancelVisual = () => {}; clearTimeout(deadline);
  const start = document.startViewTransition;
  if (!origin || reduced || !start) {
    apply(next);
    return;
  }
  let committed = false;
  const commit = () => {
    if (request !== change || committed) return;
    committed = true; clearTimeout(deadline); apply(next);
  };
  // Browser snapshot capture is optional. A stalled capture must not leave the
  // button, saved preference and actual theme waiting for an animation forever.
  deadline = setTimeout(() => { cancelVisual(); commit(); }, 250);
  // Theme state is needed at startup; the optional snapshot animation is not.
  void import('./theme-transition').then(({ revealTheme }) => {
    if (request !== change || committed) return;
    cancelVisual = revealTheme(origin, commit, () => request === change);
  }).catch(commit);
}

export function initTheme() {
  apply(initialTheme());
}
