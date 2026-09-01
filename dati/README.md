# Dati sorgente FantaOracle

Cartella per i file grezzi che alimentano l'app (da caricare poi in Admin):

- **Quotazioni.xlsx** — il listone ufficiale Fantacalcio.it. A ogni aggiornamento
  di mercato: sovrascrivi il file con lo stesso nome e committa — lo storico
  delle versioni resta in git.
- **Calendario** (csv/xlsx/json) — il calendario Serie A e le sue eventuali
  modifiche in stagione.
- **esempio_rose_lega.xlsx** — rose finte (squadre "Squadra Esempio NN") per
  provare l'import lega. È l'unico file di rose che può stare qui: gli export
  di leghe vere restano fuori dal repo, che è **pubblico**. Il `.gitignore`
  blocca i nomi tipici degli export.

Flusso: scarica il file aggiornato → salvalo qui (stesso nome) → caricalo in
Admin → Listino/Calendario → commit. Questa cartella è esclusa dal deploy
(.vercelignore): i file NON finiscono online su fantaoracle.ch.
