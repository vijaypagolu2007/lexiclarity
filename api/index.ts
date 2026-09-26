let appPromise: Promise<any> | undefined;

function loadApp(): Promise<any> {
  appPromise ??= import('../server').then((module) => module.default);
  return appPromise;
}

// The Vercel rewrite passes the captured endpoint as __path. Normalize it
// back to the /api/... paths used by the Express routes.
export default async function handler(req: any, res: any) {
  try {
    const requestedPath = req.query?.__path;
    if (typeof requestedPath === 'string' && requestedPath.length > 0) {
      req.url = `/api/${requestedPath}`;
    }
    const app = await loadApp();
    return app(req, res);
  } catch (error: any) {
    console.error('[LexiClarity] API handler failed:', error);
    if (!res.headersSent) {
      return res.status(500).json({
        error: error?.message || 'The API function failed to initialize.',
      });
    }
  }
}
