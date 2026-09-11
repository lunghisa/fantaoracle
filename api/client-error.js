// Diagnostica minima: nessun nome, email, token o contenuto della rosa.
const CODES = new Set(['runtime', 'promise', 'cloud_sync']);
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).end(); return; }
  if (req.headers.origin !== 'https://fantaoracle.ch') { res.status(403).end(); return; }
  const body = req.body;
  if (!body || typeof body !== 'object' || !CODES.has(body.code)) { res.status(400).end(); return; }
  console.warn('[FantaOracle client]', JSON.stringify({ code: body.code, version: '0.8' }));
  res.status(204).end();
}
