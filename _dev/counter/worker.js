// Tahsin's site counter. GET /hit/<key> adds one and returns { value }; GET /get returns every total in one reply.
// Only the keys the site uses can be counted, and only her site (plus localhost, for testing) can call it from a browser.
const KEYS = new Set(['visit', 'visitor', 'case', 'resume', 'contact', 'a_seen', 'b_seen', 'a_conv', 'b_conv']);
const ORIGINS = /^https:\/\/tahsinanan15\.github\.io$|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const json = (body, status = 200) => new Response(JSON.stringify(body), {
      status,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
        ...(ORIGINS.test(origin) ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {}),
      },
    });
    if (request.method !== 'GET') return json({ error: 'GET only' }, 405);
    const [, action, key] = new URL(request.url).pathname.split('/');
    try {
      if (action === 'get' && !key) {
        const { results } = await env.DB.prepare('SELECT key, value FROM counts').all();
        return json(Object.fromEntries([...KEYS].map((k) => [k, results.find((r) => r.key === k)?.value || 0])));
      }
      if (action === 'hit' && KEYS.has(key)) {
        const row = await env.DB.prepare('INSERT INTO counts (key, value) VALUES (?, 1) ON CONFLICT(key) DO UPDATE SET value = value + 1 RETURNING value').bind(key).first();
        return json({ value: row.value });
      }
      return json({ error: 'not found' }, 404);
    } catch (err) {
      console.error(JSON.stringify({ message: 'counter failed', action, key, error: String(err) }));
      return json({ error: 'counter unavailable' }, 500);
    }
  },
};
