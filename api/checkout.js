// ============================================================
// FantaOracle · Crea la sessione di pagamento su Polar
// ------------------------------------------------------------
// Regola di sicurezza che governa tutto questo file:
// l'identita di chi compra la decide il SERVER, leggendola dal token
// Supabase di chi chiama. Il browser non puo dire "attiva l'abbonamento
// per l'utente X" — altrimenti chiunque potrebbe farsi attivare, o far
// attivare a un altro, un abbonamento che non ha pagato.
//
// Variabili d'ambiente richieste (Vercel → Settings → Environment Variables):
//   SUPABASE_URL           es. https://xxxx.supabase.co
//   SUPABASE_ANON_KEY      chiave pubblica (la stessa che usa l'app)
//   POLAR_ACCESS_TOKEN     SEGRETA — token organizzazione Polar
//   POLAR_PRODUCT_ID       id del prodotto (non segreto)
//   POLAR_SERVER           'sandbox' (default) oppure 'production'
//   POLAR_SUCCESS_URL      opzionale, dove torna il cliente dopo il pagamento
// ============================================================

const POLAR_API = {
  sandbox: 'https://sandbox-api.polar.sh',
  production: 'https://api.polar.sh',
};

export default async function handler(req, res) {
  // Nessun CORS permissivo qui: questa funzione la chiama solo la nostra
  // app, dallo stesso dominio. Aprirla a tutti su un endpoint autenticato
  // sarebbe un regalo a chi passa di li.
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'metodo non consentito' });
    return;
  }

  const SUPABASE_URL      = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
  const POLAR_TOKEN       = process.env.POLAR_ACCESS_TOKEN;
  const PRODUCT_ID        = process.env.POLAR_PRODUCT_ID;
  const SERVER            = process.env.POLAR_SERVER === 'production' ? 'production' : 'sandbox';
  const SUCCESS_URL       = process.env.POLAR_SUCCESS_URL || 'https://fantaoracle.ch/app?abbonamento=ok';

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !POLAR_TOKEN || !PRODUCT_ID) {
    console.error('[checkout] configurazione incompleta: controlla le variabili d\'ambiente su Vercel');
    res.status(500).json({ error: 'configurazione incompleta' });
    return;
  }

  // 1) Chi sei davvero? Lo chiediamo a Supabase, non al browser.
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) { res.status(401).json({ error: 'non autenticato' }); return; }

  let user;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!r.ok) { res.status(401).json({ error: 'sessione non valida' }); return; }
    user = await r.json();
  } catch (e) {
    console.error('[checkout] Supabase non raggiungibile:', e.message);
    res.status(502).json({ error: 'servizio non raggiungibile' });
    return;
  }
  if (!user || !user.id) { res.status(401).json({ error: 'sessione non valida' }); return; }

  // 2) Sessione di pagamento. L'id utente viaggia in DUE posti:
  //    - external_customer_id: e il campo che Polar ci ripete nei webhook
  //    - metadata: rete di sicurezza, nel caso il primo non tornasse indietro
  //    Con uno solo dei due, un cambio di formato lato Polar ci lascerebbe
  //    con pagamenti incassati e nessun modo di sapere di chi sono.
  try {
    const r = await fetch(`${POLAR_API[SERVER]}/v1/checkouts/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${POLAR_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        products: [PRODUCT_ID],
        external_customer_id: user.id,
        customer_email: user.email || undefined,
        success_url: SUCCESS_URL,
        metadata: { supabase_user_id: user.id },
      }),
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.url) {
      // Il dettaglio finisce nei log di Vercel, non nella risposta:
      // al browser non si raccontano i problemi interni.
      console.error('[checkout] Polar ha rifiutato:', r.status, JSON.stringify(data).slice(0, 600));
      res.status(502).json({ error: 'pagamento non disponibile' });
      return;
    }

    res.status(200).json({ url: data.url });
  } catch (e) {
    console.error('[checkout] errore:', e.message);
    res.status(502).json({ error: 'pagamento non disponibile' });
  }
}
