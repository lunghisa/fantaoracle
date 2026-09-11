# Premier Ticino League — verifica delle opzioni

Fonte: consultazione autenticata, in sola lettura, con l'account del partecipante dell'utente. Nessuna impostazione modificata. Queste sono le opzioni osservate; non costituiscono un regolamento scritto depositato dal presidente e non sono ancora integrate nel motore FantaOracle.

- Lega: https://leghe.fantacalcio.it/premier-ticino-league/settings
- Documenti: https://leghe.fantacalcio.it/premier-ticino-league/view/documents
- Competizione aperta: Serie A gho doss la stria, ID 576368.
- Documenti: «Nessun documento di Lega».
- Accesso: le opzioni sono leggibili; avviso «Solo un admin può modificare le opzioni di lega». Download di documenti non verificabile perché l'archivio è vuoto.

## Generali e formazione

Privata, Classic, disponibilità calciatori singola, 500 crediti iniziali.
Moduli consentiti: 3-4-3, 3-5-2, 4-3-3, 4-4-2, 4-5-1, 5-2-3, 5-3-2, 5-4-1.
Rosa: P 1–8; D 8; C 8; A 6; totale 23–30.
Panchina: variabile, totale senza limite.
Switch attivo, Plus (sostituto anche di ruolo diverso con cambio modulo valido).
Rose invisibili, UNDER, formazioni nascoste: disattivati.
Termine formazione: 5 minuti prima dell'inizio delle partite.

## Sostituzioni

5 sostituzioni; illimitate disattivato. Traditional: pari ruolo, senza cambio modulo. Riserva d'ufficio disattivata. Switch Plus è distinto dalle sostituzioni ordinarie.

## Calcolo

Fonte voti: Fantacalcio. Formazione non schierata: recupera precedente.
Bonus/malus differenziati per ruolo, colonne P/D/C/A (ordine verificato visivamente):

| Evento | P | D | C | A |
|---|---:|---:|---:|---:|
| Gol segnato | 20 | 4 | 3.5 | 3 |
| Rigore segnato | 3 | 3 | 3 | 3 |
| Assist | 1 | 1 | 1 | 1 |
| Assist soft | 0.5 | 0.5 | 0.5 | 0.5 |
| Assist gold | 1.5 | 1.5 | 1.5 | 1.5 |
| Rigore parato | 3 | 3 | 3 | 3 |
| Rigore sbagliato | -3 | -3 | -3 | -3 |
| Gol subito | -1 | -1 | -1 | -1 |
| Autogol | -2 | -2 | -2 | -2 |
| Ammonizione | -0.5 | -0.5 | -0.5 | -0.5 |
| Espulsione | -1 | -1 | -1 | -1 |
| Gol vittoria/pareggio, Player of the match | 0 | 0 | 0 | 0 |

Porta inviolata: +1 portiere (unica casella sotto P).
Soglie gol: 66,72,78,84,90,96,102,108; poi ogni 6 punti.
Limita vittoria disattivato. Limita pareggio attivo, differenza >=4 nella stessa fascia; escluso sotto la prima soglia.
Autogol da totale squadra basso disattivato. Ammonito senza voto disattivato.
Punteggi F1 esposti: 25,18,12,10,8,6,4,3,2,1. Non è stata verificata l'esistenza di una competizione F1 attiva.

## Modificatori

Difesa attivo, include portiere; bonus alla propria squadra, media voti senza bonus/malus dei migliori 3 difensori + portiere. La pagina richiede almeno 4 difensori e specifica almeno 4 voti validi di difensori più quello del portiere. I 6 politici sono validi; riserve d'ufficio non valide.

| Media | Bonus |
|---|---:|
| <6 | 0 |
| >=6 e <6.25 | 1 |
| >=6.25 e <6.5 | 2 |
| >=6.5 e <6.75 | 3 |
| >=6.75 e <7 | 4 |
| >=7 e <7.25 | 6 |
| >=7.25 | 6 |

Disattivati: modificatori portiere, centrocampo, attacco, modulo; fattori rendimento, fairplay, capitano.

## Implicazioni per FantaOracle

Il motore attuale non applica questo profilo: gol fissi +3 nell'import voti, eventi non sufficientemente distinti, 5-2-3 assente, modificatore difesa e Switch Plus da integrare. Non ricostruire eventi dai soli fantavoti aggregati. Separare fonte documentale, opzioni osservate e regole effettivamente supportate. L'accesso manuale autenticato osservato non dimostra l'esistenza di un'importazione automatica cloud o di API disponibili. Non pubblicare questo profilo come impostazione universale delle leghe.
