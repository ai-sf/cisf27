# Backend Modulo Contatti (Google Apps Script)

Il backend del modulo contatti di **CISF 27** risiede nella cartella [`google-apps-script/`](../google-apps-script/) ed è implementato come una **Google Apps Script Web App** serverless.

Riceve le richieste di contatto inviate dal form del sito web, inoltra immediatamente un'email istituzionale formattata tramite `MailApp.sendEmail` all'indirizzo **`cisf27@ai-sf.it`** impostando come `replyTo` l'email del mittente e selezionando i destinatari in **CC dinamico** in base all'argomento. In opzione, memorizza una copia delle risposte all'interno di un Google Form di riserva.

---

## 1. Smistamento Email e Indirizzi CC

Tutte le email sono inviate a **`cisf27@ai-sf.it`**. A seconda dell'argomento selezionato nel form, lo script aggiunge automaticamente in copia conoscenza (CC) i responsabili specifici del comitato:

| Argomento                 | Indirizzi in CC                                                                 |
| :------------------------ | :------------------------------------------------------------------------------ |
| **Sponsorizzazione**      | `diego.ficarra@ai-sf.it`, `mariarosaria.sivo@ai-sf.it`                          |
| **Logistica**             | `tomislav.vojvodic@ai-sf.it`                                                    |
| **Programma Scientifico** | `marta.grenno@ai-sf.it`, `chiara.luppino@ai-sf.it`, `ludovica.rainero@ai-sf.it` |
| **Iscrizione**            | `francesco.isgrò@ai-sf.it`, `alessandro.dagostino@ai-sf.it`                     |
| **Altro / Fallback**      | `francesco.isgrò@ai-sf.it`, `alessandro.dagostino@ai-sf.it`                     |

---

## 2. Setup Iniziale & Configurazione Web App

### Passo 1: Caricamento del Codice

1. Apri [Google Apps Script](https://script.google.com/) e crea un nuovo progetto (oppure sincronizza via terminale con `clasp`, vedi sezione sotto).
2. Incolla il codice di [`google-apps-script/Code.js`](../google-apps-script/Code.js) nell'editor.
3. Verifica che il file manifest [`google-apps-script/appsscript.json`](../google-apps-script/appsscript.json) includa gli scope `script.send_mail` e `forms` e la configurazione `executeAs: "USER_DEPLOYING"`.

### Passo 2: (Opzionale) Collegamento del Google Form di Riserva

Se desideri salvare le risposte anche all'interno di un Google Form di riserva:

1. Crea un Google Form con i seguenti campi: `Nome e Cognome`, `Email`, `Oggetto` (scelta multipla corrispondente agli argomenti), `Messaggio`.
2. In Apps Script: accedi a **Impostazioni progetto ➔ Proprietà script (Script Properties)**.
3. Aggiungi la proprietà `FORM_ID` con l'ID del form (estratto dall'URL di modifica: `https://docs.google.com/forms/d/<FORM_ID>/edit`).

### Passo 3: Autorizzazione Permessi OAuth (FONDAMENTALE)

Prima di pubblicare o testare la Web App, lo script deve essere espressamente autorizzato a inviare email:

1. Nella barra degli strumenti dell'editor Apps Script, seleziona la funzione **`authorizeScript`** dal menu a tendina delle funzioni.
2. Clicca su **Esegui (Run)**.
3. Comparirà il pop-up **"Autorizzazione richiesta"** (_Authorization Required_).
4. Clicca su **"Esamina autorizzazioni"** (_Review permissions_) e seleziona l'account Google associato (`cisf27@ai-sf.it` o il proprio account amministratore).
5. Se Google mostra la schermata _"Google non ha verificato questa app"_ (_Google hasn't verified this app_):
   - Clicca su **Avanzate** (_Advanced_ in basso a sinistra).
   - Clicca su **Apri CISF27 (non sicura)** (_Go to CISF27 (unsafe)_).
6. Clicca su **Consenti** (_Allow_).
7. Nel log di esecuzione in basso apparirà il messaggio: `Autorizzazione completata con successo! Quota email rimanente: ...`.

### Passo 4: Distribuzione come Web App

1. Clicca in alto a destra su **Distribuisci ➔ Nuova distribuzione** (o _Gestisci distribuzioni_ se già esistente).
2. Tipo: seleziona **Applicazione web (Web App)**.
3. **Esegui come (Execute as):** imposta tassativamente su **`Me` / `Io` (`USER_DEPLOYING`)**.  
   _(⚠️ CRITICO: NON selezionare `Utente che accede all'app web` / `USER_ACCESSING`, altrimenti i visitatori anonimi del sito non potranno inviare il form)._
4. **Chi può accedere (Who has access):** imposta su **`Chiunque` / `Anyone` (`ANYONE`)**.
5. Clicca su **Distribuisci** e copia l'**URL dell'applicazione web** (`https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec`).

### Passo 5: Configurazione della Variabile d'Ambiente

1. Inserisci l'URL in `.env` locale:
   ```sh
   PUBLIC_GOOGLE_SCRIPT_URL=https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec
   ```
2. Imposta la stessa variabile anche sul pannello di hosting di produzione (es. Cloudflare Pages, Netlify).

---

## 3. Risoluzione Errori Comuni (Troubleshooting)

### Errore: `Non hai l'autorizzazione per chiamare MailApp.sendEmail` / `You do not have permission to call MailApp.sendEmail`

> `Permessi richiesti: https://www.googleapis.com/auth/script.send_mail`  
> `Per maggiori informazioni consulta: https://developers.google.com/apps-script/guides/support/troubleshooting#authorization-is`

Questo errore si verifica in due casi:

1. **I permessi OAuth non sono stati concessi**: esegui la funzione `authorizeScript` dall'editor Apps Script seguendo il _Passo 3_ della guida sopra.
2. **La Web App è distribuita come "Utente che accede" anziché "Io"**:
   - Vai su **Distribuisci ➔ Gestisci distribuzioni**.
   - Clicca sull'icona della **matita (Modifica)**.
   - Assicurati che **Esegui come** sia impostato su **Io (`USER_DEPLOYING`)**.
   - Nella tendina **Versione**, seleziona **Nuova versione** (obbligatorio per applicare le modifiche al codice).
   - Clicca **Distribuisci**.

### Il Google Form non registra le risposte

Se le email arrivano ma le risposte non compaiono nel Google Form:

1. **Verifica diagnostica da browser**: Apri l'URL della Web App (`.../exec`) nel browser. La risposta JSON mostrerà se `FORM_ID` è configurato correttamente, se è accessibile e l'elenco delle domande rilevate.
2. **Esegui il test manuale in Apps Script**:
   - Nell'editor Google Apps Script, seleziona la funzione **`testFormSubmission`** e clicca su **Esegui**.
   - Controlla il log di esecuzione in basso: se c'è un errore o un problema di permessi, verrà mostrato il dettaglio esatto.
3. **Assicurati di aver concesso i permessi di Forms**:
   - Esegui la funzione **`authorizeScript`** per verificare che sia `MailApp` che `FormApp` abbiano ricevuto il consenso OAuth.
4. **Ricorda di creare una Nuova Versione dopo aver modificato il codice**:
   - Ogni volta che modifichi `Code.js` in Apps Script, devi andare su **Distribuisci ➔ Gestisci distribuzioni ➔ Modifica (matita) ➔ Versione: Nuova versione ➔ Distribuisci**, altrimenti la Web App continuerà a eseguire il vecchio codice.

---

## 4. Sviluppo con clasp

Per sincronizzare il codice direttamente dal terminale locale:

```sh
# Login una tantum con le credenziali Google
npx @google/clasp login

# Spostati nella cartella e invia il codice ad Apps Script
cd google-apps-script
npx @google/clasp push
```

I file di configurazione sono già presenti nel repository:

- [`google-apps-script/.clasp.json`](../google-apps-script/.clasp.json) contiene già lo `scriptId` del deployment corrente.
- [`google-apps-script/appsscript.json`](../google-apps-script/appsscript.json) contiene il manifest con gli scope OAuth e le impostazioni della Web App.
