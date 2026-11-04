import { validateContact, type ContactLocale, type ContactMessage } from './validate';

/** The part of a Cloudflare KV namespace the rate limit needs. */
export interface RateLimitStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export interface ContactEnv {
  /** Secret: Resend API key. */
  RESEND_API_KEY?: string;
  /** KV binding that remembers recent messages per IP address. */
  CONTACT_RATE_LIMIT?: RateLimitStore;
  /** Recipient. Set in Cloudflare so the address never appears on the site or in the repository. */
  CONTACT_TO?: string;
  /** Optional override for the verified Resend sender. */
  CONTACT_FROM?: string;
}

/** At most `max` messages per IP address within `windowSeconds`. */
export const RATE_LIMIT = { max: 3, windowSeconds: 3600 } as const;
const MAX_BODY = 32_000;
/** People need longer than this to fill in the form; faster posts come from bots. */
const MIN_FILL_MS = 2500;
const DEFAULT_FROM = 'braendle.tech <website@braendle.tech>';

type Outcome = 'ok' | 'invalid' | 'forbidden' | 'too_large' | 'unavailable' | 'rate_limited' | 'failed';

const PAGES: Record<ContactLocale, Record<'ok' | 'error' | 'rate_limited' | 'back', string>> = {
  de: {
    ok: 'Danke! Deine Nachricht ist angekommen, ich melde mich bald.',
    error: 'Das hat leider nicht geklappt. Versuch es später nochmals oder schreib mir auf LinkedIn.',
    rate_limited: 'Du hast in der letzten Stunde schon drei Nachrichten geschickt. Versuch es später wieder oder schreib mir auf LinkedIn.',
    back: 'Zurück zur Website',
  },
  en: {
    ok: 'Thank you! Your message has arrived, I’ll get back to you soon.',
    error: 'Sorry, that didn’t work. Please try again later or message me on LinkedIn.',
    rate_limited: 'You’ve already sent three messages in the last hour. Please try again later or message me on LinkedIn.',
    back: 'Back to the website',
  },
};

/**
 * POST /api/contact: validates the message, allows three per IP address and hour (Cloudflare
 * KV) and forwards it through Resend. Answers JSON for the enhanced form, a small page for a
 * plain form post without JavaScript.
 */
export async function handleContact(
  request: Request,
  env: ContactEnv,
  options: { now?: number; send?: typeof fetch } = {},
): Promise<Response> {
  const now = options.now ?? Date.now();
  const send = options.send ?? fetch;
  const json = (request.headers.get('accept') ?? '').includes('application/json');
  let locale: ContactLocale = 'de';
  const answer = (status: number, outcome: Outcome, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) =>
    reply(json, status, outcome, locale, extra, headers);

  // Only the site's own form may post here.
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return answer(403, 'forbidden');

  const body = await request.text().catch(() => '');
  if (body.length > MAX_BODY) return answer(413, 'too_large');
  const raw = parseBody(body, request.headers.get('content-type') ?? '');
  if (!raw) return answer(400, 'invalid');
  if (raw.locale === 'en') locale = 'en';

  // A filled honeypot or an instant submit: report success, send nothing.
  const elapsed = raw.elapsed === undefined ? undefined : Number(raw.elapsed);
  if ((typeof raw.website === 'string' && raw.website.trim()) || (elapsed !== undefined && elapsed < MIN_FILL_MS)) {
    return answer(200, 'ok');
  }

  const check = validateContact(raw);
  if (!check.ok) return answer(400, 'invalid', { fields: check.fields });
  // Without its key, recipient or rate limit the form stays closed rather than unprotected.
  if (!env.RESEND_API_KEY || !env.CONTACT_TO || !env.CONTACT_RATE_LIMIT) return answer(503, 'unavailable');

  let slot: { allowed: boolean; retryAfter: number };
  try {
    slot = await takeSlot(env.CONTACT_RATE_LIMIT, request.headers.get('cf-connecting-ip') ?? 'unknown', now);
  } catch (error) {
    console.error('[contact] Rate limit store failed', error);
    return answer(503, 'unavailable');
  }
  if (!slot.allowed) {
    return answer(429, 'rate_limited', { retryAfter: slot.retryAfter }, { 'retry-after': String(slot.retryAfter) });
  }

  const delivered = await deliver(check.value, env, send).catch((error: unknown) => {
    console.error('[contact] Resend request failed', error);
    return false;
  });
  return delivered ? answer(200, 'ok') : answer(502, 'failed');
}

/**
 * Sliding window per IP address. The address itself is never stored, only a hash, and every
 * entry expires an hour after the last message. KV is eventually consistent, so two posts in
 * the same second from different locations may both pass; that is fine for a contact form.
 */
export async function takeSlot(store: RateLimitStore, ip: string, now: number): Promise<{ allowed: boolean; retryAfter: number }> {
  const key = `contact:${await fingerprint(ip)}`;
  const windowMs = RATE_LIMIT.windowSeconds * 1000;
  let stamps: number[] = [];
  try {
    const stored: unknown = JSON.parse((await store.get(key)) ?? '[]');
    if (Array.isArray(stored)) stamps = stored.filter((t): t is number => typeof t === 'number' && t > now - windowMs);
  } catch {
    // An unreadable entry counts as empty.
  }
  stamps.sort((a, b) => a - b);
  if (stamps.length >= RATE_LIMIT.max) {
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((stamps[0]! + windowMs - now) / 1000)) };
  }
  stamps.push(now);
  await store.put(key, JSON.stringify(stamps), { expirationTtl: RATE_LIMIT.windowSeconds });
  return { allowed: true, retryAfter: 0 };
}

async function fingerprint(ip: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`braendle.tech/contact ${ip}`));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

function parseBody(body: string, type: string): Record<string, unknown> | undefined {
  try {
    if (type.includes('application/json')) {
      const value: unknown = JSON.parse(body);
      return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
    }
    return Object.fromEntries(new URLSearchParams(body));
  } catch {
    return undefined;
  }
}

async function deliver(message: ContactMessage, env: ContactEnv, send: typeof fetch): Promise<boolean> {
  const response = await send('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: env.CONTACT_FROM || DEFAULT_FROM,
      to: [env.CONTACT_TO],
      reply_to: message.email,
      subject: `Kontaktformular: ${message.name}`,
      text: [
        message.message,
        '',
        '—',
        `${message.name} <${message.email}>`,
        `Sprache: ${message.locale === 'en' ? 'Englisch' : 'Deutsch'}`,
        'Gesendet über das Kontaktformular auf braendle.tech',
      ].join('\n'),
    }),
  });
  if (!response.ok) console.error('[contact] Resend answered', response.status, (await response.text()).slice(0, 300));
  return response.ok;
}

function reply(
  json: boolean,
  status: number,
  outcome: Outcome,
  locale: ContactLocale,
  extra: Record<string, unknown>,
  headers: Record<string, string>,
): Response {
  const common = { 'cache-control': 'no-store', ...headers };
  if (json) {
    const body = outcome === 'ok' ? { ok: true } : { ok: false, error: outcome, ...extra };
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...common } });
  }
  const copy = PAGES[locale];
  const text = outcome === 'ok' ? copy.ok : outcome === 'rate_limited' ? copy.rate_limited : copy.error;
  const page = `<!doctype html><html lang="${locale}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>braendle.tech</title>`
    + `<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1.25rem;line-height:1.6">`
    + `<p>${text}</p><p><a href="/${locale}/#kontakt">${copy.back}</a></p></body></html>`;
  return new Response(page, { status, headers: { 'content-type': 'text/html; charset=utf-8', ...common } });
}
