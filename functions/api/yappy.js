// Cloudflare Pages Function: GET /api/yappy
// Returns the Yappy number kept in the YAPPY_NUMBER variable of the Pages project, so the number
// is never committed to the repo or served inside the page HTML.
const HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex',
};

function json(body, status) {
  return new Response(JSON.stringify(body), { status, headers: HEADERS });
}

export function onRequestGet({ env }) {
  const number = (env.YAPPY_NUMBER || '').trim();
  if (!number) {
    return json({ error: 'not-configured' }, 404);
  }
  return json({ number }, 200);
}
