const KEY = 'braendle-anchor';
const MAX_AGE = 15_000;

interface Anchor {
  id: string;
  delta: number;
  at: number;
}

function read(): Anchor | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Anchor>;
    if (typeof parsed?.id !== 'string' || typeof parsed.delta !== 'number') return null;
    if (typeof parsed.at !== 'number' || Date.now() - parsed.at > MAX_AGE) return null;
    return parsed as Anchor;
  } catch {
    return null;
  }
}

export function rememberAnchor(): void {
  const sections = Array.from(document.querySelectorAll<HTMLElement>('main > section[id]'));
  if (!sections.length) return;

  const top = window.scrollY;
  let current = sections[0]!;
  for (const section of sections) {
    if (section.offsetTop <= top + 4) current = section;
  }

  try {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({ id: current.id, delta: top - current.offsetTop, at: Date.now() }),
    );
  } catch {
    /* storage unavailable */
  }
}

export function restoreAnchor(consume: boolean): void {
  const saved = read();
  if (consume) {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* storage unavailable */
    }
  }
  if (!saved) return;

  const target = document.getElementById(saved.id);
  if (!target) return;

  window.scrollTo({ top: Math.max(0, target.offsetTop + saved.delta), behavior: 'instant' });
}
