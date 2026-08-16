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

---

# 🚦 Passare da prova a produzione

Da fare **solo dopo** che l'account Polar di produzione è stato verificato:
senza verifica, l'incasso non parte anche se tutto il resto è a posto.

L'ordine conta. I passi 1-5 non cambiano niente per il pubblico — è il
passo 7 che apre i pagamenti a tutti. Fino ad allora vede ancora
"Ti avviso", quindi si può sbagliare senza conseguenze.

## Stato della verifica

**Richiesta inviata e APPROVATA il 16.08.2026**, nel giro di minuti — non i
14 giorni dichiarati. Account approved, identità verificata, conto di payout
connesso.

Probabile motivo della rapidità: l'integrazione era già completa e il sito
già online. La documentazione di Polar lo dice esplicitamente — completare
l'integrazione *prima* di chiedere l'approvazione velocizza la revisione.

Cosa era già pronto al momento dell'invio (tutte le voci verdi):
prodotto, checkout via API, identità, conto di payout, descrizione, sito,
email di supporto, link LinkedIn.

⚠️ **Se Polar scrive, rispondi entro 48 ore.** La loro documentazione indica
la mancata risposta entro quel termine tra le cause di ritardo o rifiuto.
Le loro mail arrivano all'indirizzo dell'account, non a support@.

### Credenziali di produzione: già create, NON ancora su Vercel

Chiave API e segreto webhook di produzione sono stati creati il 16.08.2026 e
sono **nel gestore di password di Sacha**. Non vanno messi su Vercel prima
dell'approvazione: un token di produzione su `POLAR_SERVER=sandbox` viene
rifiutato e romperebbe il collaudo che oggi funziona.

L'endpoint webhook di produzione punta già a `fantaoracle.ch/api/polar-webhook`,
quindi in dashboard si vedranno **consegne fallite con 401**: è previsto — il
sito ha ancora il segreto della sandbox. Si sistemano da sole allo switch.

### Payout

Il franco svizzero **non era tra le valute disponibili** (solo EUR e valute
UE/SEE). Scelto **EUR** su conto **Revolut con IBAN lituano** — normale, è la
licenza bancaria di Revolut. Paese del conto dichiarato: Lituania; paese
dell'attività: Svizzera. Le vendite in CHF subiscono quindi una conversione
CHF→EUR (0,25% secondo Polar) più quella della banca al cambio in franchi.
Da chiedere al supporto Polar se il CHF sia attivabile.

## Prima di aprire al pubblico: prerequisiti

- [x] Account Polar di produzione **approvato** (16.08.2026)
- [ ] Impianto IVA confermato da un fiscalista → vedi memo in fondo
- [ ] Riga di prova cancellata da `subscriptions` (vedi "Pulizia" sotto)

## Sul sito di Polar (quello vero, non sandbox)

**1. Crea il prodotto**, identico a quello sandbox:
   abbonamento ricorrente · ogni 1 anno · **CHF 9.90 + EUR 9.90** come
   prezzi fissi separati · prova gratuita **spenta** · visibilità
   **Private**. Segnati il Product ID (quello in tabella dovrebbe già
   essere giusto: `d4a87193-6e0e-4e40-a537-a5118d19db06`).

**2. Crea il token di accesso**: Settings → Preferences → scorri in fondo
   → sezione **Developers** → `Create token`. Permessi: `checkouts:write`
   e `products:read`. **Nessuna scadenza.** Si vede una volta sola.

**3. Crea l'endpoint webhook**: Settings → **Webhooks** → Add Endpoint
   - URL: `https://fantaoracle.ch/api/polar-webhook`
   - Format: **Raw**
   - Secret: uno lungo a caso, copialo
   - Eventi: `subscription.active`, `.cycled`, `.uncanceled`, `.resumed`,
     `.canceled`, `.revoked`, `.past_due`

## Su Vercel

Settings → **Environments** → clicca la riga **Production** → lì ci sono
le variabili (non c'è una voce di menù separata "Environment Variables").

**4.** Modifica queste quattro:

| Variabile | Nuovo valore |
|---|---|
| `POLAR_SERVER` | `production` |
| `POLAR_PRODUCT_ID` | id del prodotto di produzione |
| `POLAR_ACCESS_TOKEN` | token creato al passo 2 |
| `POLAR_WEBHOOK_SECRET` | segreto scelto al passo 3 |

`SUPABASE_*` e `POLAR_SUCCESS_URL` restano invariate.

## Nel codice

**5.** In `app.html`: `const PAGAMENTI_ATTIVI = false` → **`true`**

**6.** `git push origin main` (le variabili entrano in funzione solo al
   deploy successivo).

## Collaudo, prima di dirlo a qualcuno

**7.** Da admin premi il bottone di pagamento e **compra davvero** con la
   tua carta: 9.90 veri. Poi controlla, in quest'ordine:

```bash
# a) il webhook è arrivato e la firma è passata
vercel logs $(vercel ls lunghi-fantacalcio | grep Production | head -1 | awk '{print $3}') | grep webhook
# atteso: "[webhook] firma OK"
```

```sql
-- b) la riga c'è, col prezzo congelato
select u.email, s.price, s.currency, s.status
  from public.subscriptions s join auth.users u on u.id = s.user_id
 where s.status = 'active';
```

**8.** Poi **rimborsa te stesso** dalla dashboard Polar. Attenzione: le
   commissioni sulla transazione **non tornano indietro** (circa 1 CHF).
   È il prezzo del collaudo, ed è il più conveniente che ci sia.

⚠️ Il rimborso genera `subscription.revoked`: verifica che il tuo accesso
   torni a `free`. Essendo admin non te ne accorgi dall'interfaccia —
   guarda la tabella.

## Pulizia prima dell'apertura

```sql
-- toglie le righe di prova
delete from public.subscriptions where provider = 'polar';

-- rimette a posto i profili rimasti segnati come paganti
update public.profiles p
   set plan = 'free', plan_tier = 'free', plan_period = null
 where p.plan <> 'free'
   and not exists (select 1 from public.subscriptions s
                    where s.user_id = p.id and s.status = 'active');
```

## Se qualcosa va storto: tornare indietro

Rimettere `PAGAMENTI_ATTIVI = false` e ripubblicare. In trenta secondi il
pubblico rivede "Ti avviso" e nessuno può più pagare. Chi ha già pagato
mantiene l'accesso: la riga in `subscriptions` resta.

## Interruttore, per capirlo a colpo d'occhio

| `PAGAMENTI_ATTIVI` | Pubblico | Admin |
|---|---|---|
| `false` | "Ti avviso" | bottone 🧪 di collaudo |
| `true` | "Abbonati — 9.90" | idem |

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

## 🔴 PROCEDURA: come si rimborsa un cliente

Rimborsare i soldi **non chiude l'abbonamento**. Sono due azioni distinte, e
saltare la seconda significa restituire il denaro lasciando il prodotto
attivo — e lasciare in piedi un rinnovo automatico che riaddebitera l'anno
dopo un cliente convinto di aver chiuso.

**Fai sempre entrambe:**

1. **Sales → Orders** → l'ordine → **Refund**
   - l'importo proposto e al NETTO dell'imposta (es. 9.16 su 9.90): e giusto
     cosi, il cliente riceve comunque 9.90. Non alzarlo.
   - se c'e un'opzione **Revoke Benefits**, ATTIVALA: fa fare a Polar anche
     il passo 2
2. **Sales → Subscriptions** → l'abbonamento → **Cancel Subscription**

Il passo 2 genera `subscription.revoked`, che il webhook gestisce e che
chiude l'accesso. Verificato piu volte il 16/8/2026.

Verifica finale a database:

```sql
select s.status, p.plan from public.subscriptions s
  left join public.profiles p on p.id = s.user_id
 where s.provider_ref = '<id abbonamento>';
-- atteso: expired / free
```

## Nota: `order.refunded` non arriva sempre

Il webhook gestisce anche `order.refunded` come rete di sicurezza, ma il
16/8 quell'evento **non e stato consegnato** dopo un rimborso reale (nella
lista Deliveries comparivano solo gli eventi `subscription.*`). Probabile
legame con il flag `Revoke Benefits: False` sul rimborso.

Quindi: **non contare su `order.refunded`.** La procedura affidabile e quella
sopra, in due passi.

## ⚠️ Trappola trovata il 16/8: rimborsare NON toglie l'accesso

Su Polar **rimborsare un ordine e revocare un abbonamento sono due azioni
distinte**. Verificato con un rimborso vero: i 9.90 sono tornati indietro e
l'abbonamento e rimasto `active`. Il cliente avrebbe continuato a usare
l'Oracle gratis.

Per questo il webhook gestisce anche `order.refunded`, e **quell'evento va
spuntato nella configurazione dell'endpoint su Polar**: senza, il codice non
viene mai chiamato.

Un rimborso **parziale** invece NON toglie l'accesso di proposito: restituire
meta prezzo per un disservizio non deve chiudere fuori chi resta cliente.
Viene solo scritto un avviso nei log.

## Eventi webhook attesi

Da spuntare tutti nella configurazione dell'endpoint:

`subscription.active`, `.cycled`, `.uncanceled`, `.resumed` → accesso attivo
`subscription.canceled` → accesso fino a fine periodo (NON si revoca subito)
`subscription.revoked` → accesso tolto
`subscription.past_due` → non si tocca niente, Polar riprova da solo
`order.refunded` → se totale, accesso tolto; se parziale, solo un avviso

## Cose ancora aperte

- Verifica dell'account Polar di produzione: senza, non si incassa
- `.aab` per il Play Store: costruito, non firmato, rinviato di proposito
- Conferma dell'impianto IVA con un fiscalista prima del primo incasso vero
