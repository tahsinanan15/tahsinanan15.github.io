// Serves the site's audio and video with byte ranges. Safari only plays media from a server that answers a Range request
// with 206 and that part of the file, and the player seeks; Workers static assets answer with the whole file instead.
// wrangler.jsonc sends only the media folders through here (run_worker_first); every other file is served as a static asset.
export default {
  async fetch(req, env) {
    const res = await env.ASSETS.fetch(req);
    if (res.status !== 200 || req.method !== 'GET') return res;
    const h = new Headers(res.headers);
    h.set('accept-ranges', 'bytes');
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') || '');
    if (!m || (m[1] === '' && m[2] === '')) return new Response(res.body, { status: 200, headers: h });
    const body = await res.arrayBuffer(), size = body.byteLength;
    const start = m[1] === '' ? Math.max(0, size - +m[2]) : +m[1];   // "bytes=-500" is the last 500
    const end = m[1] === '' || m[2] === '' ? size - 1 : Math.min(+m[2], size - 1);
    if (start > end) { h.set('content-range', `bytes */${size}`); h.delete('content-length'); return new Response(null, { status: 416, headers: h }); }
    h.set('content-range', `bytes ${start}-${end}/${size}`);
    h.set('content-length', String(end - start + 1));
    return new Response(body.slice(start, end + 1), { status: 206, headers: h });
  },
};
