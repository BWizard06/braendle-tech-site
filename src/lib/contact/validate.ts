export type ContactLocale = 'de' | 'en';
export type ContactField = 'name' | 'email' | 'message';
export interface ContactMessage { name: string; email: string; message: string; locale: ContactLocale }

export const LIMITS = { name: 100, email: 254, messageMin: 10, messageMax: 5000 } as const;

const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:.]{2,}$/;

/** Shared by the form and the server function; the server never trusts the browser. */
export function validateContact(input: Record<string, unknown>):
  { ok: true; value: ContactMessage } | { ok: false; fields: ContactField[] } {
  const text = (key: string) => (typeof input[key] === 'string' ? (input[key] as string) : '').trim();
  // The name ends up in the mail subject: one line, no control characters.
  const name = text('name').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ');
  const email = text('email');
  const message = text('message').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '');
  const fields: ContactField[] = [];
  if (!name || name.length > LIMITS.name) fields.push('name');
  if (email.length > LIMITS.email || !EMAIL.test(email)) fields.push('email');
  if (message.length < LIMITS.messageMin || message.length > LIMITS.messageMax) fields.push('message');
  if (fields.length) return { ok: false, fields };
  return { ok: true, value: { name, email, message, locale: input.locale === 'en' ? 'en' : 'de' } };
}
