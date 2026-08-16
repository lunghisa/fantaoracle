# Pagamenti — come è messo in piedi

Aggiornato il 16.08.2026. **Questo file non contiene segreti**, e comunque
non finisce online: `.vercelignore` esclude i `.md` dal sito pubblico.
I segreti stanno solo tra le variabili d'ambiente di Vercel.

## Impianto

Incasso tramite **Polar** come *merchant of record*: è Polar il venditore
verso il cliente, quindi si accolla l'IVA europea. Scelto perché FantaOracle
vende anche in Italia; per un prodotto solo-Svizzera converrebbe Stripe.

- **Prodotto**: abbonamento ricorrente annuale, CHF 9.90 / EUR 9.90, Private
- **Prova gratuita**: NON su Polar. La gestisce l'app (`TRIAL_DAYS = 30`).
  Accenderla anche su Polar regalerebbe due mesi invece di uno, e
  smentirebbe il "nessuna carta richiesta" scritto sulla landing.

## Identificativi prodotto

| Ambiente | Product ID |
|---|---|
| Sandbox (prova) | `dd59059a-fbbc-43b1-84ed-ba209ee2ebef` |
| Produzione | `d4a87193-6e0e-4e40-a537-a5118d19db06` |

## Come funziona il giro

1. L'app chiama `POST /api/checkout` col token Supabase dell'utente
2. `api/checkout.js` **verifica lato server chi è** interrogando Supabase, poi
   crea la sessione su Polar con `external_customer_id` = id utente
3. Il cliente paga su Polar
4. Polar avvisa `POST /api/polar-webhook`
5. Il webhook **verifica la firma**, poi scrive la riga in `subscriptions`
   (prezzo e valuta congelati) e mette `profiles.plan = 'year'`
6. L'app legge `profiles.plan` e sblocca Oracle e Arena

Il punto 2 è la regola di sicurezza centrale: l'identità la decide il server.
Se la decidesse il browser, chiunque potrebbe intestarsi un abbonamento.

## Variabili d'ambiente (Vercel → Settings → Environment Variables)

| Nome | Segreta | Note |
|---|---|---|
| `SUPABASE_URL` | no | |
| `SUPABASE_ANON_KEY` | no | la stessa chiave pubblica dell'app |
| `SUPABASE_SERVICE_ROLE_KEY` | **SÌ** | scavalca le RLS: serve perché `subscriptions` non è scrivibile dagli utenti |
| `POLAR_ACCESS_TOKEN` | **SÌ** | token dell'organizzazione |
| `POLAR_WEBHOOK_SECRET` | **SÌ** | scelto creando l'endpoint webhook |
| `POLAR_PRODUCT_ID` | no | cambia tra sandbox e produzione |
| `POLAR_SERVER` | no | `sandbox` oppure `production` |
| `POLAR_SUCCESS_URL` | no | dove rientra il cliente dopo il pagamento |

## Passare da prova a produzione

1. `POLAR_SERVER` → `production`
2. `POLAR_PRODUCT_ID` → l'id di produzione (tabella sopra)
3. `POLAR_ACCESS_TOKEN` e `POLAR_WEBHOOK_SECRET` → quelli dell'account vero
   (sono diversi da quelli sandbox)
4. Ricreare l'endpoint webhook nell'account di produzione, stessa URL e
   stessi eventi
5. In `app.html`, `PAGAMENTI_ATTIVI` → `true`
6. Rilanciare un deploy

Finché `PAGAMENTI_ATTIVI` è `false`, il pubblico vede "Ti avviso" e solo
l'admin vede il bottone di pagamento: serve a provare sul sito vero senza
esporre nessun altro.

## ⚠️ Trappola trovata il 16/8: come Polar firma i webhook

Lo standard "Standard Webhooks" dice: togli il prefisso `whsec_` dal
segreto e **decodificalo da base64**, poi firma con quei byte.

**Polar non fa così.** Firma usando il **segreto intero, prefisso
`whsec_` compreso, come testo semplice UTF-8.**

Implementare la specifica alla lettera produce un webhook che rifiuta
*tutti* i pagamenti veri — il caso peggiore, perché il cliente paga e non
ottiene niente. Per questo `api/polar-webhook.js` prova tutte le letture
ragionevoli dello stesso segreto invece di sceglierne una. Non indebolisce
la sicurezza: chi non ha il segreto non ne indovina nessuna.

Se un giorno i webhook smettono di funzionare, il log stampa quale
lettura ha funzionato (`segreto letto come: ...`): è il primo posto da
guardare.

## Come si legge il corpo del messaggio

Il corpo va letto **dal flusso, prima di toccare `req.body`**. Su Vercel
accedere a `req.body` fa digerire il corpo alla piattaforma e il testo
originale — l'unico su cui la firma torna — non è più recuperabile.
Ricostruirlo con `JSON.stringify` produce qualcosa di *quasi* identico, ed
è il "quasi" che fa fallire la verifica.

## Eventi webhook attesi

`subscription.active`, `.cycled`, `.uncanceled`, `.resumed` → accesso attivo
`subscription.canceled` → accesso fino a fine periodo (NON si revoca subito)
`subscription.revoked` → accesso tolto
`subscription.past_due` → non si tocca niente, Polar riprova da solo

## Cose ancora aperte

- Verifica dell'account Polar di produzione: senza, non si incassa
- `.aab` per il Play Store: costruito, non firmato, rinviato di proposito
- Conferma dell'impianto IVA con un fiscalista prima del primo incasso vero
