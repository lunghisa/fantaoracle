// ============================================================
// FantaOracle · Riceve gli avvisi di pagamento da Polar
// ------------------------------------------------------------
// Questa funzione da e toglie l'accesso a pagamento. Chiunque riuscisse a
// farle credere di essere Polar si regalerebbe l'abbonamento. Per questo
// la PRIMA cosa che fa e verificare la firma crittografica, e se non torna
// non guarda nemmeno il contenuto.
//
// Scrive con la chiave di servizio di Supabase, che scavalca le RLS: e
// voluto. La tabella subscriptions e stata resa non scrivibile dagli utenti
// proprio perche la tocchi solo il server.
//
// Variabili d'ambiente richieste:
//   POLAR_WEBHOOK_SECRET       SEGRETA — il segreto scelto creando l'endpoint
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY  SEGRETA — scavalca ogni protezione, mai altrove
// ============================================================

import crypto from 'node:crypto';

// Serve il corpo GREZZO, byte per byte: la firma e calcolata su quello.
// Reinterpretarlo come JSON e riserializzarlo cambierebbe spazi e ordine e
// farebbe fallire la verifica.
export const config = { api: { bodyParser: false } };

const TOLLERANZA_SECONDI = 5 * 60; // avvisi piu vecchi di 5 minuti: rifiutati

// ATTENZIONE ALL'ORDINE. Il flusso va letto PRIMA di toccare req.body:
// su Vercel accedere a req.body fa digerire il corpo alla piattaforma, e
// il testo originale — l'unico su cui la firma torna — non e piu
// recuperabile. Reinventarlo con JSON.stringify quasi funziona, ed e il
// "quasi" che fa rifiutare i pagamenti veri.
async function leggiCorpoGrezzo(req) {
  const chunks = [];
  try {
    for await (const chunk of req) chunks.push(chunk);
  } catch (e) { /* flusso gia consumato */ }
  if (chunks.length) {
    return { testo: Buffer.concat(chunks).toString('utf8'), origine: 'flusso' };
  }
  if (typeof req.body === 'string')  return { testo: req.body, origine: 'stringa' };
  if (Buffer.isBuffer(req.body))     return { testo: req.body.toString('utf8'), origine: 'buffer' };
  if (req.body)                      return { testo: JSON.stringify(req.body), origine: 'ricostruito' };
  return { testo: '', origine: 'vuoto' };
}

// Standard Webhooks: si firma "{id}.{timestamp}.{corpo}" in HMAC-SHA256.
// Il segreto puo essere scritto in due modi a seconda di come lo si e
// impostato: proviamo entrambe le interpretazioni dello stesso segreto.
function chiaviCandidate(secret) {
  const pulito = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  const chiavi = [Buffer.from(pulito, 'utf8')];
  try {
    const decodificato = Buffer.from(pulito, 'base64');
    if (decodificato.length > 0 && decodificato.toString('base64').replace(/=+$/, '') === pulito.replace(/=+$/, '')) {
      chiavi.push(decodificato);
    }
  } catch (e) { /* non era base64 */ }
  return chiavi;
}

function confrontoSicuro(a, b) {
  const ba = Buffer.from(a); const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function firmaValida(raw, headers, secret) {
  const id        = headers['webhook-id'];
  const timestamp = headers['webhook-timestamp'];
  const firme     = headers['webhook-signature'];
  if (!id || !timestamp || !firme) return false;

  // Antireplay: un avviso vecchio intercettato non deve poter essere rigiocato.
  const eta = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(eta) || eta > TOLLERANZA_SECONDI) return false;

  const daFirmare = `${id}.${timestamp}.${raw}`;
  const attese = chiaviCandidate(secret)
    .map(k => crypto.createHmac('sha256', k).update(daFirmare).digest('base64'));

  // L'header puo contenere piu firme separate da spazio: "v1,xxx v1,yyy"
  return String(firme).split(' ').some(parte => {
    const valore = parte.includes(',') ? parte.split(',')[1] : parte;
    return attese.some(a => confrontoSicuro(a, valore));
  });
}

// ---------- Supabase (chiave di servizio) ----------
function db(path, opts = {}) {
  const url = `${process.env.SUPABASE_URL}/rest/v1/${path}`;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return fetch(url, {
    ...opts,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(opts.headers || {}),
    },
  });
}

// L'id utente puo arrivare da piu punti a seconda dell'evento: li proviamo
// tutti invece di fidarci di uno solo.
function trovaUserId(d) {
  return (
    d?.customer?.external_id ||
    d?.external_customer_id ||
    d?.metadata?.supabase_user_id ||
    d?.customer?.metadata?.supabase_user_id ||
    d?.checkout?.metadata?.supabase_user_id ||
    null
  );
}

async function concediAccesso(userId, sub) {
  const prezzo  = typeof sub?.amount === 'number' ? sub.amount / 100 : 9.90;
  const valuta  = String(sub?.currency || 'CHF').toUpperCase();
  const ref     = sub?.id || null;
  const fine    = sub?.current_period_end || sub?.ends_at || null;

  // Esiste gia una riga per questo abbonamento? (i webhook si ripetono)
  let esistente = null;
  if (ref) {
    const r = await db(`subscriptions?provider_ref=eq.${encodeURIComponent(ref)}&select=id`);
    const righe = await r.json().catch(() => []);
    if (Array.isArray(righe) && righe.length) esistente = righe[0].id;
  }

  if (esistente) {
    await db(`subscriptions?id=eq.${esistente}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'active', ends_at: fine }),
    });
  } else {
    // Un solo abbonamento attivo per persona: chiudiamo eventuali vecchi
    // prima di inserire, altrimenti l'indice unico rifiuta la riga nuova.
    await db(`subscriptions?user_id=eq.${userId}&status=eq.active`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'expired' }),
    });
    await db('subscriptions', {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        tier: 'base',
        period: 'season',
        price: prezzo,          // congelato: non si aggiorna mai piu
        currency: valuta,
        status: 'active',
        ends_at: fine,
        provider: 'polar',
        provider_ref: ref,
      }),
    });
  }

  // Riassunto sul profilo: e questo che l'app legge per sbloccare Oracle e Arena.
  await db(`profiles?id=eq.${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({ plan: 'year', plan_tier: 'base', plan_period: 'season' }),
  });
}

async function revocaAccesso(userId, sub, statoRiga) {
  const ref = sub?.id || null;
  if (ref) {
    await db(`subscriptions?provider_ref=eq.${encodeURIComponent(ref)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: statoRiga }),
    });
  }
  await db(`profiles?id=eq.${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({ plan: 'free', plan_tier: 'free', plan_period: null }),
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).end(); return; }

  const secret = process.env.POLAR_WEBHOOK_SECRET;
  if (!secret || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.SUPABASE_URL) {
    console.error('[webhook] configurazione incompleta');
    res.status(500).end();
    return;
  }

  const { testo: raw, origine } = await leggiCorpoGrezzo(req);

  if (!firmaValida(raw, req.headers, secret)) {
    // Diagnostica volutamente prolissa: senza queste righe, capire perche
    // una firma non torna richiede tentativi alla cieca. Non si stampa mai
    // ne il segreto ne la firma per intero.
    const h = req.headers;
    console.warn('[webhook] firma non valida — diagnosi:', JSON.stringify({
      origineCorpo: origine,
      lunghezzaCorpo: raw.length,
      primi60: raw.slice(0, 60),
      headerPresenti: Object.keys(h).filter(k => k.startsWith('webhook')),
      idPresente: !!h['webhook-id'],
      timestampPresente: !!h['webhook-timestamp'],
      etaSecondi: h['webhook-timestamp']
        ? Math.abs(Math.floor(Date.now() / 1000) - Number(h['webhook-timestamp']))
        : null,
      firmaRicevutaInizio: String(h['webhook-signature'] || '').slice(0, 12),
      formatoSegreto: secret.startsWith('whsec_') ? 'whsec_' : 'testo',
    }));
    res.status(401).end();
    return;
  }
  console.log('[webhook] firma ok (corpo letto da:', origine + ')');

  let evento;
  try { evento = JSON.parse(raw); }
  catch (e) { res.status(400).end(); return; }

  const tipo = evento?.type;
  const dati = evento?.data || {};
  const userId = trovaUserId(dati);

  if (!userId) {
    // Rispondiamo 200 lo stesso: se dicessimo errore, Polar continuerebbe a
    // ritentare all'infinito un avviso che non sapremo mai collegare.
    console.error('[webhook] nessun id utente in un evento', tipo, '— sub:', dati?.id);
    res.status(200).json({ ok: true, ignorato: 'utente non identificabile' });
    return;
  }

  try {
    switch (tipo) {
      // Pagato, rinnovato, o disdetta ritirata: accesso attivo.
      case 'subscription.active':
      case 'subscription.cycled':
      case 'subscription.uncanceled':
      case 'subscription.resumed':
        await concediAccesso(userId, dati);
        break;

      // Disdetta: l'accesso resta fino a fine periodo gia pagato.
      // Si segna la riga, ma NON si toglie il piano dal profilo.
      case 'subscription.canceled':
        if (dati?.id) {
          await db(`subscriptions?provider_ref=eq.${encodeURIComponent(dati.id)}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'cancelled', ends_at: dati.current_period_end || dati.ends_at || null }),
          });
        }
        break;

      // Accesso revocato subito (rimborso, insolvenza definitiva).
      case 'subscription.revoked':
        await revocaAccesso(userId, dati, 'expired');
        break;

      // Pagamento fallito: Polar riprova da solo. Non si toglie niente ora,
      // altrimenti una carta scaduta caccerebbe fuori un cliente che paga.
      case 'subscription.past_due':
        console.warn('[webhook] pagamento in sospeso per', userId);
        break;

      default:
        break; // gli altri eventi non ci riguardano
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[webhook] errore gestendo', tipo, e.message);
    // 500 → Polar riprova piu tardi. Giusto: l'evento e valido, siamo noi
    // ad aver avuto un problema.
    res.status(500).json({ error: 'errore interno' });
  }
}
