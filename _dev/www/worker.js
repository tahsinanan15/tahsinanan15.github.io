// www.tahsinanan.com sends visitors on to tahsinanan.com, same path and query, permanently.
export default {
  fetch(req) {
    const url = new URL(req.url);
    url.hostname = 'tahsinanan.com';
    return Response.redirect(url.toString(), 301);
  },
};
