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
function chiaviCandidate(secretRaw) {
  // trim(): un copia-incolla dall'interfaccia porta con se spazi o a capo
  // invisibili, e un solo byte di troppo cambia tutta la firma.
  const secret = String(secretRaw).trim();
  const senza = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  const chiavi = [];
  const aggiungi = (buf, nome) => { if (buf && buf.length) chiavi.push({ buf, nome }); };

  // Lo standard dice: togli il prefisso, decodifica da base64. Ma le
  // implementazioni divergono, quindi si provano tutte le letture
  // ragionevoli dello STESSO segreto. Non indebolisce niente: chi non ha
  // il segreto non ne indovina nessuna.
  try { aggiungi(Buffer.from(senza,  'base64'), 'base64-senza-prefisso'); } catch (e) {}
  aggiungi(Buffer.from(senza,  'utf8'),   'utf8-senza-prefisso');
  aggiungi(Buffer.from(secret, 'utf8'),   'utf8-completo');
  try { aggiungi(Buffer.from(secret, 'base64'), 'base64-completo'); } catch (e) {}
  return chiavi;
}

function confrontoSicuro(a, b) {
  const ba = Buffer.from(a); const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// Ritorna il nome della lettura del segreto che ha funzionato, oppure null.
function firmaValida(raw, headers, secret) {
  const id        = headers['webhook-id'];
  const timestamp = headers['webhook-timestamp'];
  const firme     = headers['webhook-signature'];
  if (!id || !timestamp || !firme) return null;

  // Antireplay: un avviso vecchio intercettato non deve poter essere rigiocato.
  const eta = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(eta) || eta > TOLLERANZA_SECONDI) return null;

  const daFirmare = `${id}.${timestamp}.${raw}`;
  const attese = chiaviCandidate(secret).map(k => ({
    nome: k.nome,
    firma: crypto.createHmac('sha256', k.buf).update(daFirmare).digest('base64'),
  }));

  // L'header puo contenere piu firme separate da spazio: "v1,xxx v1,yyy"
  const ricevute = String(firme).split(' ')
    .map(p => (p.includes(',') ? p.split(',')[1] : p));

  for (const a of attese) {
    for (const r of ricevute) {
      if (confrontoSicuro(a.firma, r)) return a.nome;
    }
  }
  // Nessuna corrispondenza: si restituiscono i prefissi per la diagnosi,
  // mai le firme intere.
  firmaValida.ultimaDiagnosi = {
    calcolate: attese.map(a => a.nome + '=' + a.firma.slice(0, 10)),
    ricevute: ricevute.map(r => r.slice(0, 10)),
  };
  return null;
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
  const letturaOk = firmaValida(raw, req.headers, secret);

  if (!letturaOk) {
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
      formatoSegreto: secret.startsWith('whsec_') ? 'whsec_' : 'testo',
      segretoHaSpaziEstremi: secret !== secret.trim(),
      lunghezzaSegreto: secret.trim().length,
      confronto: firmaValida.ultimaDiagnosi || null,
    }));
    res.status(401).end();
    return;
  }
  console.log('[webhook] firma OK — corpo da:', origine, '· segreto letto come:', letturaOk);

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

      // RIMBORSO. Su Polar rimborsare un ordine NON chiude l'abbonamento:
      // sono due azioni distinte. Senza questo blocco si restituisce il
      // denaro e il cliente continua ad avere accesso — verificato il
      // 16/8/2026 con un rimborso vero, l'abbonamento restava 'active'.
      case 'order.refunded': {
        const importoOk = typeof dati?.refunded_amount === 'number' &&
                          typeof dati?.total_amount === 'number';
        const pieno = dati?.status === 'refunded' ||
                      (importoOk && dati.refunded_amount >= dati.total_amount);

        if (!pieno) {
          // Parziale: non si tocca l'accesso. Restituire meta prezzo per un
          // disservizio non deve chiudere fuori chi resta cliente.
          console.warn('[webhook] rimborso PARZIALE su ordine', dati?.id,
                       '— accesso lasciato attivo, da valutare a mano');
          break;
        }
        const subId = dati?.subscription_id || null;
        if (!subId) {
          console.warn('[webhook] rimborso totale senza subscription_id su ordine', dati?.id);
          break;
        }
        await revocaAccesso(userId, { id: subId }, 'expired');
        console.log('[webhook] rimborso totale: accesso revocato per', userId);
        break;
      }

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
