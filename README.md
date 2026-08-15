# FantaOracle

**Il fantacalcio predittivo.** Web app per Fantacalcio.it con un motore che analizza la tua rosa, prevede i punteggi della prossima giornata e ti dice come schierare per vincere.

🔗 Live: [lunghi.ch](https://www.lunghi.ch)

---

## Modalità

- **Standard** — punteggi sulla fantamedia reale stagionale. Numeri oggettivi, nessuna previsione.
- **Oracle** — previsioni per la prossima giornata che si auto-correggono nel tempo coi voti reali.

## Il motore Oracle

Per ogni giocatore stima il punteggio atteso combinando:
- fantamedia reale (con regressione per i campioni piccoli)
- forma recente dai voti reali registrati
- forza dell'avversario (rating attacco/difesa derivati dal listone)
- fattore casa/trasferta
- propensione al bonus (boom/bust vs costante)
- segnale titolarità dalle news (🟢 titolare / 🟡 dubbio / 🔴 panchina)
- malus infortunio dalle news in tempo reale
- bias appreso per ruolo tramite auto-correzione

Funzioni principali: top picks con motivazioni, slot rischiosi, modulo ottimale con
"Schiera Oracle", strategia scontro diretto contro l'avversario di giornata, analisi
post-partita dei punti lasciati in panchina, tracking dell'accuracy.

## Architettura

- **`index.html`** — app single-file in HTML/CSS/JS vanilla, senza framework, offline-capable.
- **`api/feed.js`** — serverless function (Vercel) che fa da proxy affidabile ai feed RSS.
- Auth e sincronizzazione cloud via **Supabase**. Stato per-lega in localStorage.
- Parsing Excel via **SheetJS** (CDN). Font: Bebas Neue + DM Sans.

## Deploy

```bash
vercel --prod
```

App statica + serverless function in `api/`. Nessuno step di build.

## Setup cloud (una tantum)

Migrazioni Supabase (eseguire una volta nel SQL Editor, in quest'ordine):

1. `oracle_states_setup.sql` — tabella per il sync cloud dello storico Oracle
   (senza, l'app funziona comunque ma lo storico resta locale)
2. `admin_lockdown.sql` — blindatura lato server dei privilegi admin
3. `billing_setup.sql` — prova 7 giorni e interesse abbonamento (opzionale,
   senza c'è il fallback in localStorage)

---

© 2026 Sacha Lunghi
