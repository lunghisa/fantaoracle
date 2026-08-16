# FantaOracle — Note di lavoro / Handoff

> Documento di ripresa. Quando torni al progetto (anche dopo mesi), apri questo file
> e incollalo in chat: basta a ricostruire tutto il contesto in pochi secondi.

**Ultimo aggiornamento:** 16 agosto 2026
**Versione corrente:** v0.7 BETA · APK Android v3 (1.0.1)
**Dominio:** https://fantaoracle.ch — landing su `/`, app su `/app`
**Repo:** `lunghisa/fantaoracle` · **Cartella:** `~/Documents/claude/fantaoracle/`
**Hosting:** Vercel (progetto ancora chiamato `lunghi-fantacalcio`)

> I nomi vecchi — `lunghi.ch`, `lunghi-fantacalcio`, cartella su `~/Desktop/` —
> compaiono ancora qua e là in questo file: sono storia, non istruzioni.

---

## Cos'è FantaOracle

Web app di fantacalcio (Fantacalcio.it) con un motore predittivo che schiera per te.
- **Modalità Standard:** punteggi su fantamedia reale (numeri oggettivi).
- **Modalità Oracle:** previsioni per la prossima giornata, auto-correttive nel tempo.

## Architettura (vincoli da rispettare)

- ⚠️ **Aggiornato 16.08.2026 — i file si sono spostati.** `index.html` NON è più
  l'app: è la **landing di marketing** su `fantaoracle.ch/`. L'app è
  **`app.html`**, servita su `fantaoracle.ch/app` tramite una rewrite in
  `vercel.json`. Vedi `PAGAMENTI.md` per il quadro completo.
- **`app.html`** single-file: HTML/CSS/JS vanilla, nessun framework, offline-capable.
- **`api/feed.js`**: serverless function Vercel (proxy RSS affidabile).
- **`api/checkout.js`** e **`api/polar-webhook.js`**: pagamenti via Polar.
- Dipendenze esterne via CDN: SheetJS (xlsx) per i file Excel, Supabase JS per auth/cloud.
- Auth + cloud sync via Supabase. Stato namespacizzato per-lega in localStorage.
- Font: Bebas Neue + DM Sans. Stile dark premium.
- **Regola di lavoro:** modifiche incrementali, consegnare SEMPRE il file completo aggiornato.
- Sacha lavora in italiano.

## Workflow di deploy

La cartella è **`~/Documents/claude/fantaoracle/`** (non più `~/Desktop/`).
Il progetto è collegato a GitHub: **un `git push origin main` fa il deploy di
produzione**. `vercel --prod` resta un'alternativa.

```
cd ~/Documents/claude/fantaoracle
git add -A && git commit -m "..." && git push origin main
```

Dopo il deploy la CDN può servire ancora la versione vecchia per qualche
secondo: ricontrolla con un parametro tipo `?nc=123` prima di concludere che
qualcosa non ha funzionato.
Nota npm/Vercel: EACCES su `/usr/local/lib/node_modules` = permessi →
`sudo npm i -g vercel@latest` (o sposta il prefix npm in ~/.npm-global).

---

## Cosa è stato costruito (cronologia)

L'Oracle è passato da mockup a motore reale, in più passi:

1. **Oracle Engine v1 (reale).** Previsione per giocatore = fantamedia reale
   + forma (dai voti reali registrati, peso 35%) + forza avversario (rating
   attacco/difesa derivati dal listone) + casa/trasferta (±0.15) + bias appreso
   per ruolo (auto-correzione) − malus infortunio. Confidenza per ogni stima.
   Pagina Oracle reale: top picks con motivazioni, slot rischiosi, modulo
   ottimale ("Schiera Oracle" applica al campo), storico accuracy.
   Voti reali inseribili a mano o via file (FV diretto o Voto+bonus → fantavoto classic).

2. **Segnale titolarità a semaforo.** Dalle news di formazione, per ogni giocatore:
   🟢 titolare / 🟡 ballottaggio / 🔴 panchina. Influenza confidenza, punteggio
   atteso e slot rischiosi. Pallino sul campo + bordi nelle liste. Il bottone
   "Panchina auto rischi" sposta in panca infortunati E chi è dato verso la panchina.
   ⚠️ È euristico (parole chiave nelle news), non una % precisa.

3. **Cloud sync dello storico Oracle.** Voti reali e calibrazione sincronizzati
   su Supabase (tabella `oracle_states`), per-lega, cross-device.
   → RICHIEDE la migrazione SQL: vedi `oracle_states_setup.sql` (eseguire una
   volta nel SQL Editor di Supabase). Se la tabella manca, leghe/rose si
   sincronizzano comunque; l'Oracle resta locale.

4. **Fattore cold-start.** Accurato dalla 1ª giornata: regressione per piccoli
   campioni (FM su poche presenze → stima prudente), propensione al bonus
   (FM−MV → boom/bust vs costante), reidratazione dei metadati dal listone.

5. **Strategia scontro diretto.** Scegli l'avversario di giornata (dalle
   fantasquadre del listone): proiezione XI tuo vs suo, verdetto
   favorito/equilibrio/sfavorito + consiglio (gioca sicuro / alza la varianza),
   jolly dalla panchina, top 3 minacce avversarie.

6. **Post-partita "punti lasciati in panchina".** Confronta la formazione
   impostata con l'XI ottimale a posteriori (sui voti reali). Contatore
   stagionale + dettaglio per giornata con chi dovevi schierare.

7. **Onboarding / empty-state.** A rosa vuota: intro di benvenuto con value prop
   + 3 passi. Calendario empty-state reso informativo invece di "non disponibile".

8. **Proxy news affidabile.** `api/feed.js` su Vercel sostituisce i proxy CORS
   pubblici instabili (whitelist host, cache edge 5min). I proxy pubblici restano
   come fallback. Rende robusti news / allerte infortuni / titolarità.

9. **Clean sheet (P/D).** L'Oracle confronta il rating difensivo della propria
   squadra con quello offensivo dell'avversario (già calcolati in
   `computeTeamRatings`) e modula il punteggio atteso di conseguenza, con nota
   esplicita tra i motivi ("🛡️ clean sheet probabile..." / "difesa a rischio...").

10. **Rigoristi designati.** Pannello in Admin → Listone ("🎯 RIGORISTI
    DESIGNATI"): righe `Squadra: Nome`. Il salvataggio aggiorna il listone
    attivo su Supabase (flag `rigorista` dentro il campo `players` già
    sincronizzato, nessuna tabella nuova); l'Oracle applica un bonus (+0.35)
    ai giocatori marcati.

---

## Stato / cose da ricordare

- Migrazioni SQL nel repo, da eseguire una volta nel SQL Editor di Supabase:
  `oracle_states_setup.sql`, `billing_setup.sql`, `admin_lockdown.sql`,
  `subscriptions_setup.sql`. Tutte già eseguite ad agosto 2026.
- I `.sql` e i `.md` restano in git ma **non** vanno sul web (`.vercelignore`):
  descrivono il modello di sicurezza, non sono contenuto del sito.
- La fonte di verità dell'app è **`app.html`** (dal 16.08.2026; prima era
  `index.html`, che ora è la landing).
- Leghe reali: *Fagioli per Tutti* (test) e *Premier Ticino League*.
- Sync del listone globale su cloud: verificato funzionante in produzione
  (530 giocatori sincronizzati) — nessun lavoro ulteriore necessario qui.

## Prossimi passi (candidati, in ordine)

1. **TEST SUL CAMPO** (priorità reale): caricare calendario + listone nell'Admin,
   importare la rosa, e dopo ogni giornata inserire i voti reali. Serve a far
   partire davvero l'auto-correzione e a vedere dove il modello sbaglia.
2. **Rating squadra dinamici**: oggi statici dal listone preseason; farli evolvere
   coi risultati reali (più complesso, dopo la validazione sul campo).

---

# ⚠️ DA FARE A INIZIO STAGIONE 2027/28

Cose che si rompono in silenzio quando cambia la stagione. Nessuna dà errore:
smettono solo di funzionare, e te ne accorgi settimane dopo.

## 1. Le venti squadre di Serie A (news)

In `app.html` c'è `SQUADRE_SERIE_A`, l'elenco delle 20 squadre. Serve a
riconoscere quali notizie riguardano il tuo campionato: quelle che non nominano
nessuna squadra di A vengono **scartate**, non retrocesse in fondo.

L'elenco è **copiato a mano** dal calendario, non letto dal CSV a ogni avvio.

**Quindi:** quando carichi `dati/calendario_serie_a_2027-28.csv`, aggiorna anche
`SQUADRE_SERIE_A` in `app.html`.

Se te ne dimentichi: le **neopromosse** vengono scambiate per squadre estere e
tutte le loro notizie spariscono, mentre le **retrocesse** continuano a passare.
Nessun messaggio di errore, solo notizie che mancano.

Per rigenerare l'elenco dal calendario nuovo:

```bash
cd ~/Documents/claude/fantaoracle
python3 -c "
import csv
t=set()
for r in list(csv.reader(open('dati/calendario_serie_a_2027-28.csv')))[1:]:
    t.add(r[2].strip()); t.add(r[3].strip())
print(sorted(t))
print(len(t),'squadre')
"
```

Controlla anche `RE_SERIE_MINORI` e `RE_ESTERO`: se una tua squadra retrocede,
il suo nome resta in `SQUADRE_SERIE_A` e va tolto, altrimenti le notizie di
Serie B che la nominano rientrerebbero (il veto sulle serie minori le blocca
comunque, ma meglio l'elenco pulito).

## 2. Le fonti news muoiono senza avvisare

Due sono già cadute così: **FantaGazzetta** (dominio morto, ago 2026) e
**Fantacalcio.it** (feed rimosso, ago 2026 — rispondeva `200 OK` servendo una
pagina "404 pagina non trovata", quindi zero notizie e nessun errore).

I siti fantacalcistici stanno chiudendo gli RSS per portare traffico al sito.
Se un giorno vedi meno pastiglie colorate del solito, è questo.

Per verificarle tutte in un colpo:

```bash
UA='FantaOracle/1.0 (+https://fantaoracle.ch)'
for u in \
  https://www.fantamaster.it/feed/ \
  https://www.sosfanta.com/feed/ \
  https://www.gazzetta.it/rss/calcio.xml \
  https://www.calciomercato.it/feed/ \
  https://www.ansa.it/sito/notizie/sport/calcio/calcio_rss.xml \
  https://www.spaziocalcio.it/feed ; do
  n=$(curl -s -L --max-time 10 -A "$UA" "$u" | grep -c "<item")
  echo "$n notizie — $u"
done
```

Una fonte con **0 notizie è morta**, anche se risponde 200. Aggiungerne di
nuove richiede due modifiche: `NEWS_FEEDS` in `app.html` **e** `ALLOWED_HOSTS`
in `api/feed.js`. Se salti la seconda, il proxy la blocca.

## 3. La casella di posta

`support@fantaoracle.ch` — creata il 16.08.2026 su **Infomaniak**, pacchetto
**Starter** (1 indirizzo), **gratuito, durata 1 anno**.

**Controlla ad agosto 2027 che non si rinnovi a pagamento** senza accorgertene.
Il servizio mail è separato da quello di `milliemes.ch`, quindi i due progetti
restano indipendenti.

L'indirizzo è quello dichiarato a Polar come contatto di supporto: se lo cambi
qui, cambialo anche là, altrimenti i clienti scrivono a una casella morta.

## 4. La prova gratuita e i prezzi

- `TRIAL_DAYS` in `app.html` (oggi 30 giorni) deve restare coerente con i testi
  della landing in `index.html`, che dicono "1 mese" in tre punti.
- Il prezzo 9.90 è scritto sia nelle card dell'app sia su Polar: se lo cambi,
  cambialo in entrambi. Chi ha già pagato tiene il suo, il prezzo è congelato
  nella tabella `subscriptions` (vedi `PAGAMENTI.md`).
