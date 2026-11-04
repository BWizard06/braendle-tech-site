import { describe, expect, it, vi } from 'vitest';
import { handleContact, RATE_LIMIT, takeSlot, type RateLimitStore } from '../src/lib/contact/handler';
import { validateContact } from '../src/lib/contact/validate';
import { onRequestPost } from '../functions/api/contact';

class MemoryStore implements RateLimitStore {
  data = new Map<string, { value: string; ttl?: number }>();
  async get(key: string) { return this.data.get(key)?.value ?? null; }
  async put(key: string, value: string, options?: { expirationTtl?: number }) { this.data.set(key, { value, ttl: options?.expirationTtl }); }
}

const valid = { name: 'Anna Muster', email: 'anna@example.ch', message: 'Hallo Ben, ich hätte ein Projekt für dich.', locale: 'de', elapsed: 9000 };
const post = (body: unknown, headers: Record<string, string> = {}) => new Request('https://braendle.tech/api/contact', {
  method: 'POST',
  headers: { 'content-type': 'application/json', accept: 'application/json', 'cf-connecting-ip': '203.0.113.7', origin: 'https://braendle.tech', ...headers },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});
const resendOk = () => vi.fn(async () => new Response('{"id":"x"}', { status: 200 }));

describe('contact validation', () => {
  it('accepts a normal message and normalises it', () => {
    const result = validateContact({ ...valid, name: '  Anna\r\nMuster ', locale: 'en' });
    expect(result).toEqual({ ok: true, value: { name: 'Anna Muster', email: 'anna@example.ch', message: valid.message, locale: 'en' } });
  });
  it('names every invalid field', () => {
    expect(validateContact({ name: '', email: 'no-at-sign', message: 'short' })).toEqual({ ok: false, fields: ['name', 'email', 'message'] });
    expect(validateContact({ ...valid, name: 'x'.repeat(101) })).toMatchObject({ ok: false, fields: ['name'] });
    expect(validateContact({ ...valid, message: 'x'.repeat(5001) })).toMatchObject({ ok: false, fields: ['message'] });
    expect(validateContact({ ...valid, email: 'a@b' })).toMatchObject({ ok: false, fields: ['email'] });
  });
});

describe('rate limit', () => {
  it('allows three messages per hour and IP, then says when to retry', async () => {
    const store = new MemoryStore(), start = 1_000_000;
    for (let i = 0; i < 3; i++) expect((await takeSlot(store, '203.0.113.7', start + i * 60_000)).allowed).toBe(true);
    expect(await takeSlot(store, '203.0.113.7', start + 10 * 60_000)).toEqual({ allowed: false, retryAfter: 50 * 60 });
    // Another address has its own budget.
    expect((await takeSlot(store, '198.51.100.1', start + 10 * 60_000)).allowed).toBe(true);
    // An hour after the first message one slot is free again.
    expect((await takeSlot(store, '203.0.113.7', start + 60 * 60_000 + 1)).allowed).toBe(true);
  });
  it('stores a hash instead of the address and lets entries expire', async () => {
    const store = new MemoryStore();
    await takeSlot(store, '203.0.113.7', 5);
    const [[key, entry]] = [...store.data];
    expect(key).toMatch(/^contact:[0-9a-f]{32}$/);
    expect(key).not.toContain('203.0.113.7');
    expect(entry.ttl).toBe(RATE_LIMIT.windowSeconds);
  });
});

describe('POST /api/contact', () => {
  it('sends the message through Resend with a reply-to', async () => {
    const send = resendOk();
    const response = await handleContact(post(valid), { RESEND_API_KEY: 're_test', CONTACT_TO: 'inbox@example.ch', CONTACT_RATE_LIMIT: new MemoryStore() }, { send });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    const [url, init] = send.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer re_test');
    const mail = JSON.parse(String(init.body));
    expect(mail).toMatchObject({
      from: 'braendle.tech <website@braendle.tech>', to: ['inbox@example.ch'], reply_to: 'anna@example.ch', subject: 'Kontaktformular: Anna Muster',
    });
    expect(mail.text).toContain(valid.message);
  });
  it('blocks the fourth message within the hour without calling Resend', async () => {
    const send = resendOk(), env = { RESEND_API_KEY: 're_test', CONTACT_TO: 'inbox@example.ch', CONTACT_RATE_LIMIT: new MemoryStore() };
    for (let i = 0; i < 3; i++) expect((await handleContact(post(valid), env, { send, now: 1000 + i })).status).toBe(200);
    const blocked = await handleContact(post(valid), env, { send, now: 2000 });
    expect(blocked.status).toBe(429);
    // The first message (t = 1 s) frees its slot an hour later; this one comes 1 s after it.
    expect(blocked.headers.get('retry-after')).toBe('3599');
    expect(await blocked.json()).toMatchObject({ ok: false, error: 'rate_limited', retryAfter: 3599 });
    expect(send).toHaveBeenCalledTimes(3);
  });
  it('quietly drops honeypot and instant submissions', async () => {
    const send = resendOk(), store = new MemoryStore(), env = { RESEND_API_KEY: 're_test', CONTACT_TO: 'inbox@example.ch', CONTACT_RATE_LIMIT: store };
    expect((await handleContact(post({ ...valid, website: 'spam.example' }), env, { send })).status).toBe(200);
    expect((await handleContact(post({ ...valid, elapsed: 300 }), env, { send })).status).toBe(200);
    expect(send).not.toHaveBeenCalled();
    expect(store.data.size).toBe(0);
  });
  it('rejects invalid input, foreign origins and oversized bodies', async () => {
    const send = resendOk(), env = { RESEND_API_KEY: 're_test', CONTACT_TO: 'inbox@example.ch', CONTACT_RATE_LIMIT: new MemoryStore() };
    const invalid = await handleContact(post({ ...valid, email: 'nope' }), env, { send });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ error: 'invalid', fields: ['email'] });
    expect((await handleContact(post(valid, { origin: 'https://evil.example' }), env, { send })).status).toBe(403);
    expect((await handleContact(post('{not json'), env, { send })).status).toBe(400);
    expect((await handleContact(post({ ...valid, message: 'x'.repeat(40_000) }), env, { send })).status).toBe(413);
    expect(send).not.toHaveBeenCalled();
  });
  it('stays closed without its key, its recipient or its rate limit store', async () => {
    const send = resendOk();
    expect((await handleContact(post(valid), { RESEND_API_KEY: 're_test', CONTACT_TO: 'inbox@example.ch' }, { send })).status).toBe(503);
    expect((await handleContact(post(valid), { RESEND_API_KEY: 're_test', CONTACT_RATE_LIMIT: new MemoryStore() }, { send })).status).toBe(503);
    expect((await handleContact(post(valid), { CONTACT_RATE_LIMIT: new MemoryStore() }, { send })).status).toBe(503);
    expect(send).not.toHaveBeenCalled();
  });
  it('reports a Resend failure', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const send = vi.fn(async () => new Response('{"message":"domain not verified"}', { status: 403 }));
    const response = await handleContact(post(valid), { RESEND_API_KEY: 're_test', CONTACT_TO: 'inbox@example.ch', CONTACT_RATE_LIMIT: new MemoryStore() }, { send });
    expect(response.status).toBe(502);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
  it('answers a plain form post without JavaScript with a page in the visitor’s language', async () => {
    const send = resendOk();
    const form = (fields: Record<string, string>) => new Request('https://braendle.tech/api/contact', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'cf-connecting-ip': '203.0.113.9' },
      body: new URLSearchParams(fields).toString(),
    });
    const response = await handleContact(form({ name: 'Anna', email: 'anna@example.ch', message: 'Hello Ben, nice website!', locale: 'en' }),
      { RESEND_API_KEY: 're_test', CONTACT_TO: 'inbox@example.ch', CONTACT_RATE_LIMIT: new MemoryStore() }, { send });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    const page = await response.text();
    expect(page).toContain('lang="en"');
    expect(page).toContain('href="/en/#kontakt"');
    expect(send).toHaveBeenCalledTimes(1);
    // The Pages Function hands requests to the same handler (here: rejected before sending).
    const rejected = await onRequestPost({ request: form({ name: '', locale: 'de' }), env: {} });
    expect(rejected.status).toBe(400);
    expect(await rejected.text()).toContain('Zurück zur Website');
  });
});
