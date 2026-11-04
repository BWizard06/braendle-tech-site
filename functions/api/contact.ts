// Cloudflare Pages Function: POST /api/contact.
// Needs the secret RESEND_API_KEY, the variable CONTACT_TO (recipient) and the KV binding
// CONTACT_RATE_LIMIT in the Pages project.
import { handleContact, type ContactEnv } from '../../src/lib/contact/handler';

export const onRequestPost = ({ request, env }: { request: Request; env: ContactEnv }) => handleContact(request, env);
