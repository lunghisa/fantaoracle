# FantaOracle — Note di lavoro / Handoff

> Documento di ripresa. Quando torni al progetto (anche dopo mesi), apri questo file
> e incollalo in chat: basta a ricostruire tutto il contesto in pochi secondi.

**Ultimo aggiornamento:** giugno 2026
**Versione corrente:** v0.7 BETA
**Dominio:** https://www.lunghi.ch · **Repo:** `lunghisa/lunghi-fantacalcio` · **Hosting:** Vercel

---

## Cos'è FantaOracle

Web app di fantacalcio (Fantacalcio.it) con un motore predittivo che schiera per te.
- **Modalità Standard:** punteggi su fantamedia reale (numeri oggettivi).
- **Modalità Oracle:** previsioni per la prossima giornata, auto-correttive nel tempo.

## Architettura (vincoli da rispettare)

- **`index.html`** single-file: HTML/CSS/JS vanilla, nessun framework, offline-capable.
- **`api/feed.js`**: serverless function Vercel (proxy RSS affidabile). NUOVA dal passo "news".
- Dipendenze esterne via CDN: SheetJS (xlsx) per i file Excel, Supabase JS per auth/cloud.
- Auth + cloud sync via Supabase. Stato namespacizzato per-lega in localStorage.
- Font: Bebas Neue + DM Sans. Stile dark premium.
- **Regola di lavoro:** modifiche incrementali, consegnare SEMPRE il file completo aggiornato.
- Sacha lavora in italiano.

## Workflow di deploy

```
# edita i file in ~/Desktop/fantaoracle/
vercel --prod      # ~10s, dalla cartella del progetto
```
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

- File extra consegnati: `oracle_states_setup.sql` (migrazione Supabase),
  `feed.js` (→ va in `~/Desktop/fantaoracle/api/feed.js`).
- `fantaoracle.html` nel Project è OBSOLETO: la fonte di verità è `index.html`.
- Leghe reali: *Fagioli per Tutti* (test) e *Premier Ticino League*.
- Sync del listone globale su cloud: verificato funzionante in produzione
  (530 giocatori sincronizzati) — nessun lavoro ulteriore necessario qui.

## Prossimi passi (candidati, in ordine)

1. **TEST SUL CAMPO** (priorità reale): caricare calendario + listone nell'Admin,
   importare la rosa, e dopo ogni giornata inserire i voti reali. Serve a far
   partire davvero l'auto-correzione e a vedere dove il modello sbaglia.
2. **Rating squadra dinamici**: oggi statici dal listone preseason; farli evolvere
   coi risultati reali (più complesso, dopo la validazione sul campo).
