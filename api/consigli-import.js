// ============================================================
// Import automatico del consenso fonti — per la routine cloud
// ============================================================
//
// La routine legge gli articoli (SOS Fanta, FantaMaster...) e manda qui le
// fasce, senza passaggi manuali: POST con la chiave condivisa, righe in
// testo semplice, e la giornata finisce in global_consigli come se fosse
// stata pubblicata dal pannello admin.
//
// Sicurezza: la chiave sta in CONSIGLI_IMPORT_KEY (env Vercel, la imposta
// Sacha). È una chiave a privilegio minimo: permette SOLO di scrivere
// consigli — non tocca listone, voti, utenti o pagamenti. La scrittura sul
// database usa la service key lato server, mai esposta.
//
// Richiesta:
//   POST /api/consigli-import
//   Authorization: Bearer <CONSIGLI_IMPORT_KEY>
//   { "giornata": 2, "righe": "Inter: Lautaro Martinez: 1: T\nRoma: ..." }
//
// Risposta: { ok, giornata, abbinati, nonAbbinati: [...] } — la routine può
// leggere i non abbinati e correggersi da sola al giro successivo.

function norm(s) {
  return (s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}
function cognome(name) {
  const parts = (name || '').trim().split(/\s+/).filter(w => w.length > 2);
  return norm(parts.length ? parts[parts.length - 1] : (name || ''));
}
// Stessa logica anti-omonimi del client: nome esatto, poi cognome se unico,
// poi l'iniziale a sciogliere il dubbio ("Lautaro Martinez" → "Martinez L.").
function abbina(candidati, nomeInput) {
  const n = norm(nomeInput);
  const esatto = candidati.find(p => norm(p.name) === n);
  if (esatto) return esatto;
  const cogIn = cognome(nomeInput);
  const perCognome = candidati.filter(p => {
    const a = norm(p.name), c = cognome(p.name);
    if (a === n) return true;
    if (c.length >= 4 && n.includes(c)) return true;
    if (cogIn.length >= 4 && a.includes(cogIn)) return true;
    return false;
  });
  if (perCognome.length === 1) return perCognome[0];
  if (perCognome.length > 1) {
    const iniziali = (nomeInput || '').trim().split(/\s+/).map(w => norm(w).charAt(0)).filter(Boolean);
    const perIniziale = perCognome.filter(p => {
      const m = (p.name || '').match(/\b([A-Za-z])\.\s*$/);
      return m && iniziali.includes(m[1].toLowerCase());
    });
    if (perIniziale.length === 1) return perIniziale[0];
  }
  return null;
}

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

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'solo POST' }); return; }

  const attesa = process.env.CONSIGLI_IMPORT_KEY;
  if (!attesa) { res.status(503).json({ error: 'CONSIGLI_IMPORT_KEY non configurata' }); return; }
  const auth = String(req.headers.authorization || '');
  if (auth !== 'Bearer ' + attesa) { res.status(401).json({ error: 'chiave mancante o errata' }); return; }

  const body = req.body || {};
  const giornata = parseInt(body.giornata, 10);
  const righe = String(body.righe || '');
  if (!giornata || giornata < 1 || giornata > 50) { res.status(400).json({ error: 'giornata mancante o non valida' }); return; }
  if (!righe.trim()) { res.status(400).json({ error: 'righe mancanti' }); return; }

  try {
    // Il listone attivo: serve per abbinare i nomi alle chiavi dei giocatori.
    const r = await db('global_listino?is_active=eq.true&select=players&order=uploaded_at.desc&limit=1');
    if (!r.ok) throw new Error('lettura listone fallita: ' + r.status);
    const rows = await r.json();
    const players = (rows[0] && rows[0].players) || [];
    if (players.length === 0) { res.status(409).json({ error: 'nessun listone attivo nel cloud' }); return; }
    const giocatori = players.filter(p => p && p.name)
      .map(p => ({ key: norm(p.name), name: p.name, team: p.team || '' }));

    const consigli = {};
    const nonAbbinati = [];
    righe.split(/\r?\n/).forEach(line => {
      if (!line.trim()) return;
      const parts = line.split(':').map(x => x.trim());
      if (parts.length < 3) { nonAbbinati.push(line.trim()); return; }
      const team = norm(parts[0]);
      const name = parts[1];
      const fascia = parseInt(parts[2], 10);
      const titRaw = (parts[3] || '').toUpperCase();
      const tit = titRaw === 'T' ? 'in' : titRaw === 'D' ? 'doubt' : null;
      if (!team || !name || ![1, 2, 3].includes(fascia)) { nonAbbinati.push(line.trim()); return; }
      const squadra = giocatori.filter(g => norm(g.team) === team);
      const hit = abbina(squadra, name) || abbina(giocatori, name);
      if (!hit) { nonAbbinati.push(name); return; }
      consigli[hit.key] = { fascia, tit, name: hit.name, team: hit.team };
    });

    const count = Object.keys(consigli).length;
    if (count === 0) { res.status(422).json({ error: 'nessuna riga abbinata al listone', nonAbbinati }); return; }

    const up = await db('global_consigli?on_conflict=giornata', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({
        giornata,
        consigli,
        players_count: count,
        uploaded_at: new Date().toISOString(),
      }),
    });
    if (!up.ok) {
      const t = await up.text();
      throw new Error('scrittura fallita: ' + up.status + ' ' + t.slice(0, 200));
    }

    console.log('[consigli-import] G' + giornata + ': ' + count + ' abbinati, ' + nonAbbinati.length + ' scartati');
    res.status(200).json({ ok: true, giornata, abbinati: count, nonAbbinati });
  } catch (e) {
    console.error('[consigli-import]', e.message || e);
    res.status(500).json({ error: 'errore interno' });
  }
}
