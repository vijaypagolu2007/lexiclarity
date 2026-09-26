import app from '../server';

// The Vercel rewrite passes the captured endpoint as __path. Normalize it
// back to the /api/... paths used by the Express routes.
export default function handler(req: any, res: any) {
  const requestedPath = req.query?.__path;
  if (typeof requestedPath === 'string' && requestedPath.length > 0) {
    req.url = `/api/${requestedPath}`;
  }
  return app(req, res);
}
