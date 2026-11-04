/** Same characters as the glyph rain, so the title decodes out of the hologram's alphabet. */
const GLYPHS = 'BENRÄDL{}<>/=;01';
const SCRAMBLE_MS = 60;

/**
 * Scrambles the heading's letters and lets them lock in one after another.
 * The accessible name stays the real text throughout (`aria-label`), every letter keeps
 * its own width so nothing shifts, and the original text node is restored at the end.
 * Returns a function that stops the effect immediately.
 */
export function decodeName(heading: HTMLElement, durationMs: number, delayMs = 0): () => void {
  const text = heading.textContent ?? '';
  if (!text.trim()) return () => {};
  heading.setAttribute('aria-label', text);
  heading.textContent = '';
  const letters: Array<{ char: string; span: HTMLSpanElement }> = [];
  text.split(' ').forEach((word, w) => {
    if (w) heading.append(' ');
    // Words stay whole: separate letter boxes would otherwise allow a break inside a word.
    const group = document.createElement('span');
    group.style.whiteSpace = 'nowrap';
    group.setAttribute('aria-hidden', 'true');
    for (const char of word) {
      const span = document.createElement('span');
      span.textContent = char;
      group.append(span);
      letters.push({ char, span });
    }
    heading.append(group);
  });
  for (const { span } of letters) {
    const width = span.getBoundingClientRect().width;
    // clip-path (unlike overflow) clips wide glyphs without moving the letter's baseline.
    Object.assign(span.style, { display: 'inline-block', width: `${width}px`, textAlign: 'center', clipPath: 'inset(0)', color: 'var(--accent)' });
  }
  const lockAt = letters.map((_, i) => delayMs + durationMs * (.15 + .85 * i / Math.max(1, letters.length - 1)));
  const start = performance.now();
  let frame = 0, lastScramble = -Infinity, finished = false;
  const restore = () => {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(frame);
    heading.textContent = text;
    heading.removeAttribute('aria-label');
  };
  const tick = (now: number) => {
    const elapsed = now - start;
    const scramble = now - lastScramble >= SCRAMBLE_MS;
    if (scramble) lastScramble = now;
    letters.forEach(({ char, span }, i) => {
      if (elapsed >= lockAt[i]!) {
        if (span.textContent !== char) { span.textContent = char; span.style.color = ''; }
      } else if (scramble && elapsed >= delayMs * .5) {
        span.textContent = GLYPHS[Math.floor(Math.random() * GLYPHS.length)]!;
      }
    });
    if (elapsed >= delayMs + durationMs + 80) restore();
    else frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return restore;
}
