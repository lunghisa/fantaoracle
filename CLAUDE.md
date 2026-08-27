# Questo è FantaOracle — non Millièmes

App di fantacalcio, in esercizio, con pagamenti attivi. Landing su `/`, app su `/app`.

**Se stai per scrivere una cifra, un comando o un percorso, controlla di essere nella
colonna giusta.** L'altro progetto in `~/Documents/claude/milliemes` è un SaaS per condomini
svizzeri e non ha niente in comune con questo tranne il proprietario.

|  | FantaOracle (qui) | Millièmes (altrove) |
|---|---|---|
| Prezzo | **9.90 a STAGIONE**, piano unico, prova 30 gg | CHF 29.– al MESE per comunità |
| Dominio | fantaoracle.ch | milliemes.ch |
| Hosting | **Vercel** | Infomaniak Starter, sito statico |
| Pubblicazione | `vercel deploy --prod --yes` | upload FTP via Cyberduck |
| Repo | lunghisa/fantaoracle | nessuno, file locali |

Mnemonica: **Millièmes → Mese**, quindi qui è la stagione.

## Cose che si sbagliano facilmente

- **Il deploy va verificato sul sito.** Il push a volte non fa partire Vercel: dopo aver
  pubblicato, controlla che la modifica sia davvero online.
- **L'APK TWA e il keystore** stanno in `../fantaoracle-android/`, cartella separata.
- **Non premere i pulsanti di salvataggio del pannello Admin** senza che Sacha sia presente o
  lo faccia lui: sono scritture reali sui dati di produzione che alimentano l'Oracle.
- **localStorage segue il browser, non l'account**: prima di dire che un dato "si perde",
  guarda cosa è effettivamente nel cloud e cosa no.

## Contesto completo

In memoria: `project_fantaoracle_locations.md`, `project_fantaoracle_prezzi_mercato.md`,
`project_fantaoracle_sync_cloud.md`, `project_fantaoracle_consenso_fonti.md`,
`fantacalcio_listone_release_2026.md`, `project_routine_forma_voti.md`.
