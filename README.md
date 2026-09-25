# CISF 27

Sito web statico della **XI Conferenza Italiana Studenti di Fisica**, realizzato con [Astro](https://astro.build) + [Svelte](https://svelte.dev/), stili con [Tailwind CSS](https://tailwindcss.com/) e [daisyUI](https://daisyui.com/). La compilazione del modulo contatti è gestita tramite **Google Apps Script**.

**URL:** <https://ai-sf.it/cisf27>

---

## Quick Start

```sh
git clone git@github.com:ai-sf/cisf27.git
cd cisf27
pnpm install
```

1. **Google Apps Script** - segui la [guida](#google-apps-script-modulo-contatti) per creare il Form e pubblicare la Web App.
2. **Configura ambiente** - copia `.env.example` in `.env` e imposta `PUBLIC_GOOGLE_SCRIPT_URL` ([variabili d'ambiente](#variabili-dambiente)).
3. **Build** - `pnpm run build`. L'output statico è in `dist/`.
4. **Deploy** - carica `dist/` su Cloudflare Pages, Netlify, o qualsiasi hosting statico. Imposta `PUBLIC_GOOGLE_SCRIPT_URL` come variabile d'ambiente sulla piattaforma.

---

## Stack

| Strato               | Tecnologia                                                                     |
| -------------------- | ------------------------------------------------------------------------------ |
| Framework            | [Astro 6](https://astro.build) + [Svelte 5](https://svelte.dev/)               |
| Stili                | [Tailwind CSS 4](https://tailwindcss.com/) + [daisyUI 5](https://daisyui.com/) |
| Icone                | [Lucide](https://lucide.dev/)                                                  |
| Font                 | Nunito, Playfair Display (via Fontsource)                                      |
| CMS                  | [PagesCMS](https://pagescms.org/) / file JSON                                  |
| Backend contatti     | Google Apps Script                                                             |
| Package manager      | pnpm 11                                                                        |
| Linguaggio           | TypeScript 6                                                                   |
| Linting / formatting | ESLint 10 + Prettier 3                                                         |

---

## Struttura del progetto

```
/
├── .env                        # Variabili d'ambiente (gitignorato)
├── .env.example                # Template delle variabili d'ambiente
├── _pages.yml                  # Schema CMS PagesCMS
├── astro.config.mjs            # Configurazione Astro
├── svelte.config.js            # Configurazione Svelte
├── tsconfig.json               # Configurazione TypeScript
├── eslint.config.mjs           # ESLint flat config
├── prettier.config.mjs         # Prettier config
├── pnpm-workspace.yaml         # Pnpm workspace
├── package.json
│
├── google-apps-script/         # Backend contatti (Google Apps Script)
│   ├── .clasp.json             # Config clasp (scriptId)
│   ├── appsscript.json         # Manifest GAS
│   └── Code.js                 # Web App: doPost → Google Form
│
├── public/
│   ├── download/
│   │   └── press-kit_cisf27.pdf
│   ├── favicon.ico
│   └── robots.txt
│
├── src/
│   ├── assets/
│   │   └── images/             # Immagini caricate via CMS
│   ├── components/             # Componenti Astro / Svelte
│   ├── data/
│   │   ├── cms/                # File JSON gestiti dal CMS
│   │   ├── pageLinks.ts
│   │   ├── partners.ts
│   │   └── stats.ts
│   ├── layouts/                # Layout Astro
│   ├── pages/                  # Route
│   ├── styles/
│   ├── types/
│   └── utils/
│
├── .github/workflows/
│   └── lint.yml                # CI: formato + lint su push/PR
│
└── dist/                       # Output di build (gitignorato)
```

---

## Prerequisiti

- **Node.js** ≥ 22.12.0
- **pnpm** 11 - installa con `npm i -g pnpm` o abilita tramite [Corepack](https://nodejs.org/api/corepack.html):

  ```sh
  corepack enable
  corepack prepare pnpm@11 --activate
  ```

---

## Comandi

Tutti i comandi vanno eseguiti dalla **root del progetto**.

| Comando                 | Azione                                                |
| ----------------------- | ----------------------------------------------------- |
| `pnpm install`          | Installa le dipendenze                                |
| `pnpm run dev`          | Avvia il server di sviluppo su `localhost:4321`       |
| `pnpm run build`        | Compila il sito di produzione in `./dist/`            |
| `pnpm run preview`      | Anteprima locale della build di produzione            |
| `pnpm run astro`        | Esegue un comando Astro CLI (`astro add`, …)          |
| `pnpm run typecheck`    | Controlla i tipi con `astro check`                    |
| `pnpm run check`        | `flint` + `typecheck` (da usare prima di ogni commit) |
| `pnpm run lint`         | Controlla il codice con ESLint                        |
| `pnpm run lint:fix`     | Corregge automaticamente i problemi ESLint            |
| `pnpm run format`       | Controlla la formattazione con Prettier               |
| `pnpm run format:write` | Formatta tutti i file con Prettier                    |
| `pnpm run flint`        | `format:write` + `lint:fix` in sequenza               |

---

## Variabili d'ambiente

Il progetto necessita di una sola variabile d'ambiente, esposta al client:

```sh
PUBLIC_GOOGLE_SCRIPT_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
```

**Setup:**

```sh
cp .env.example .env
```

Modifica `.env` con l'URL del tuo deployment Google Apps Script (vedi sezione successiva).

> `.env` è gitignorato. In produzione imposta la variabile d'ambiente nella piattaforma di hosting.

---

## Google Apps Script (modulo contatti)

Il backend del form contatti risiede in `google-apps-script/` e gestisce l'invio immediato di un'email formattata tramite `MailApp.sendEmail` all'indirizzo istituzionale **`cisf27@ai-sf.it`**, con impostazione automatica del `replyTo` del mittente e **CC dinamico** in base all'argomento selezionato:

- **Sponsorizzazione** ➔ CC: `diego.ficarra@ai-sf.it`, `mariarosaria.sivo@ai-sf.it`
- **Logistica** ➔ CC: `tomislav.vojvodic@ai-sf.it`
- **Programma Scientifico** ➔ CC: `marta.grenno@ai-sf.it`, `chiara.luppino@ai-sf.it`, `ludovica.rainero@ai-sf.it`
- **Iscrizione** ➔ CC: `francesco.isgrò@ai-sf.it`, `alessandro.dagostino@ai-sf.it`
- **Altro / Fallback** ➔ CC: `francesco.isgrò@ai-sf.it`, `alessandro.dagostino@ai-sf.it`

In aggiunta, se è configurata la proprietà `FORM_ID`, i dati inviati vengono archiviati anche in un Google Form di riserva senza bloccare la consegna dell'email.

### Flusso

1. Il client (Svelte) invia una richiesta POST a `PUBLIC_GOOGLE_SCRIPT_URL` con il payload `{ nome, email, oggetto, messaggio }`.
2. La Web App `doPost(e)` valida i campi obbligatori, determina i destinatari in CC e invia l'email tramite `MailApp.sendEmail`.
3. Opzionalmente (se impostato `FORM_ID`), la risposta viene registrata nel Google Form.
4. Il webhook restituisce `{ status: "success" }` oppure `{ status: "error", message: "…" }`.

---

### Setup Iniziale & Configurazione Web App

1. **Copia il codice:**
   - Incolla il contenuto di [google-apps-script/Code.js](google-apps-script/Code.js) nell'editor di Google Apps Script (oppure usa `clasp push`).
   - Assicurati che il manifest [google-apps-script/appsscript.json](google-apps-script/appsscript.json) includa gli scope `script.send_mail` e `forms` e `executeAs: "USER_DEPLOYING"`.

2. **(Opzionale) Collega il Google Form di riserva:**
   - Se desideri salvare anche le risposte nel Form, crea un Google Form con i campi: `Nome e Cognome`, `Email`, `Oggetto` (a scelta multipla), `Messaggio`.
   - In Apps Script: **Impostazioni progetto ➔ Proprietà script (Script Properties)**.
   - Aggiungi la proprietà `FORM_ID` con l'ID del form (estratto dall'URL: `https://docs.google.com/forms/d/<FORM_ID>/edit`).

3. **Autorizzazione Permessi OAuth (FONDAMENTALE):**
   Prima di pubblicare o testare la Web App, lo script deve essere autorizzato a inviare email:
   1. Nella barra degli strumenti dell'editor Apps Script, seleziona la funzione **`authorizeScript`** dal menu a tendina delle funzioni.
   2. Clicca su **Esegui (Run)**.
   3. Comparirà il pop-up **"Autorizzazione richiesta"** (_Authorization Required_).
   4. Clicca su **"Esamina autorizzazioni"** (_Review permissions_) e seleziona l'account Google associato (`cisf27@ai-sf.it` o il proprio account).
   5. Se Google mostra la schermata _"Google non ha verificato questa app"_ (_Google hasn't verified this app_):
      - Clicca su **Avanzate** (_Advanced_ in basso a sinistra).
      - Clicca su **Apri CISF27 (non sicura)** (_Go to CISF27 (unsafe)_).
   6. Clicca su **Consenti** (_Allow_).
   7. Nel log di esecuzione in basso apparirà: `Autorizzazione completata con successo! Quota email rimanente: ...`.

4. **Distribuzione come Web App:**
   - Clicca in alto a destra su **Distribuisci ➔ Nuova distribuzione** (o _Gestisci distribuzioni_ se già esistente).
   - Tipo: **Applicazione web (Web App)**.
   - **Esegui come (Execute as):** **`Me` / `Io` (`USER_DEPLOYING`)**  
     _(⚠️ CRITICO: NON selezionare `Utente che accede all'app web` / `USER_ACCESSING`, altrimenti i visitatori anonimi del sito non potranno inviare l'email)._
   - **Chi può accedere (Who has access):** **`Chiunque` / `Anyone` (`ANYONE`)**.
   - Clicca su **Distribuisci** e copia l'**URL dell'applicazione web**.

5. **Configura la variabile d'ambiente:**
   - Inserisci l'URL in `.env` come:
     ```sh
     PUBLIC_GOOGLE_SCRIPT_URL=https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec
     ```
   - Imposta la stessa variabile anche sul pannello di hosting di produzione (es. Cloudflare Pages).

---

### Risoluzione Errori Comuni (Troubleshooting)

#### Errore: `Non hai l'autorizzazione per chiamare MailApp.sendEmail` / `You do not have permission to call MailApp.sendEmail`

> `Permessi richiesti / Required permissions: https://www.googleapis.com/auth/script.send_mail`
> `Per maggiori informazioni consulta: https://developers.google.com/apps-script/guides/support/troubleshooting#authorization-is`

Questo errore si verifica in due casi:

1. **I permessi OAuth non sono stati autorizzati**: esegui la funzione `authorizeScript` dall'editor Apps Script seguendo il passaggio 3 della guida sopra.
2. **La Web App è distribuita come "Utente che accede" anziché "Io"**:
   - Vai su **Distribuisci ➔ Gestisci distribuzioni**.
   - Clicca sull'icona della **matita (Modifica)**.
   - Assicurati che **Esegui come** sia impostato su **Io (`USER_DEPLOYING`)**.
   - Nella tendina **Versione**, seleziona **Nuova versione** (obbligatorio per applicare le modifiche al codice).
   - Clicca **Distribuisci**.

---

### Sviluppo con clasp

Per sincronizzare il codice direttamente dal terminale:

```sh
npx @google/clasp login
cd google-apps-script
npx @google/clasp push
```

> `google-apps-script/.clasp.json` contiene già lo `scriptId` del deployment corrente.
> `google-apps-script/appsscript.json` contiene il manifest con gli scope OAuth e le impostazioni Web App.

---

## CMS

Il contenuto è gestito tramite **PagesCMS**, configurato in `_pages.yml`.

- I dati risiedono in `src/data/cms/*.json` (file JSON editabili anche a mano).
- Ogni file JSON corrisponde a una sezione del CMS: `home.json`, `about.json`, `program.json`, `contacts.json`, …
- Le immagini caricate via CMS finiscono in `src/assets/images/` e vengono rinominate automaticamente.

Per modificare i contenuti: apri il sito su PagesCMS oppure modifica direttamente i file JSON in `src/data/cms/`.

---

## Guida sviluppo

```sh
# 1. Clona il repository
git clone git@github.com:ai-sf/cisf27.git
cd cisf27

# 2. Installa le dipendenze
pnpm install

# 3. Prepara l'ambiente
cp .env.example .env

# 4. Avvia il dev server
pnpm run dev

# 5. Sviluppa - tutte le modifiche sono visibili su localhost:4321

# 6. Prima del commit, esegui formato e lint
pnpm run flint
```

---

## Guida produzione

```sh
# Build statica
pnpm run build
```

L'output è in `dist/`. Puoi servire la cartella con **qualsiasi hosting statico**:

- **Cloudflare Pages** → collega il repo, build command: `pnpm run build`, output: `dist`
- **Netlify** → build command: `pnpm run build`, publish: `dist`
- **GitHub Pages** → deploy `dist/` tramite GitHub Actions

Imposta la variabile d'ambiente `PUBLIC_GOOGLE_SCRIPT_URL` nella dashboard della piattaforma di hosting.
