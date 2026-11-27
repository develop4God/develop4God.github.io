// Cloudflare Pages Function: POST /api/client-error
// Receives a small error report from the donation page and writes it as one structured console line,
// which Cloudflare keeps as a function log. Nothing personal is accepted: only a fixed stage, an optional
// frequency and quantity, and a short message. The user agent is read from the request headers.
const STAGES = ['sdk', 'render', 'capture', 'subscribe'];
const FREQUENCIES = ['once', 'monthly', 'yearly'];
const MAX_BODY_BYTES = 2048;
const MAX_MESSAGE = 300;
const MAX_USER_AGENT = 200;
const MAX_QUANTITY = 10000;

const HEADERS = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex',
};

function reply(status) {
  return new Response(null, { status, headers: HEADERS });
}

// eslint-disable-next-line no-control-regex -- stripping control characters is the point
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;

function clean(text, limit) {
  return text.replace(CONTROL_CHARACTERS, ' ').slice(0, limit);
}

// Returns the validated report, or null when the payload is not exactly what the page sends.
function parseReport(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return null;
  const { stage, frequency, quantity, message } = body;
  if (!STAGES.includes(stage)) return null;
  if (frequency !== undefined && !FREQUENCIES.includes(frequency)) return null;
  if (quantity !== undefined && !(Number.isInteger(quantity) && quantity >= 1 && quantity <= MAX_QUANTITY)) return null;
  if (typeof message !== 'string') return null;
  return { stage, frequency, quantity, message: clean(message, MAX_MESSAGE) };
}

// A cross-site page must not be able to write into the log. A missing Origin (some beacons) is allowed.
function isSameSite(request) {
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin;
}

export async function onRequestPost({ request }) {
  if (!isSameSite(request)) return reply(403);
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return reply(413);
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return reply(400);
  }
  const report = parseReport(body);
  if (!report) return reply(400);
  console.log(JSON.stringify({
    event: 'client_error',
    ...report,
    userAgent: clean(request.headers.get('user-agent') || '', MAX_USER_AGENT),
  }));
  return reply(204);
}
