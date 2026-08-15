# Dati sorgente FantaOracle

Cartella per i file grezzi che alimentano l'app (da caricare poi in Admin):

- **Quotazioni.xlsx** — il listone ufficiale Fantacalcio.it. A ogni aggiornamento
  di mercato: sovrascrivi il file con lo stesso nome e committa — lo storico
  delle versioni resta in git.
- **Calendario** (csv/xlsx/json) — il calendario Serie A e le sue eventuali
  modifiche in stagione.

Flusso: scarica il file aggiornato → salvalo qui (stesso nome) → caricalo in
Admin → Listino/Calendario → commit. Questa cartella è esclusa dal deploy
(.vercelignore): i file NON finiscono online su fantaoracle.ch.
