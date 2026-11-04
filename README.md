# CISF 27

Sito web statico della **XI Conferenza Italiana Studenti di Fisica**, realizzato con [Astro](https://astro.build) + [Svelte](https://svelte.dev/), stili con [Tailwind CSS](https://tailwindcss.com/) e [daisyUI](https://daisyui.com/). La compilazione del modulo contatti è gestita tramite **Google Apps Script**. Traduzioni gestite tramite **[Fink](https://fink.inlang.com/) (inlang)**.

**URL:** <https://ai-sf.it/cisf27>

---

## Quick Start

```sh
git clone git@github.com:ai-sf/cisf27.git
cd cisf27
pnpm install
```

1. **Google Apps Script** - segui la [guida](docs/google-apps-script.md) per creare il Form e pubblicare la Web App.
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
| Traduzioni / i18n    | [Fink](https://fink.inlang.com/) / inlang (file JSON in `src/locales/`)        |
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
├── .pages.yml                  # Schema CMS PagesCMS (punta a src/data/cms/)
├── project.inlang/             # Configurazione inlang / Fink
├── astro.config.mjs            # Configurazione Astro (routing i18n it/en)
├── svelte.config.js            # Configurazione Svelte
├── tsconfig.json               # Configurazione TypeScript
├── eslint.config.mjs           # ESLint flat config
├── prettier.config.mjs         # Prettier config
├── pnpm-workspace.yaml         # Pnpm workspace
├── package.json
│
├── docs/                       # Documentazione di dettaglio
│   ├── fink-inlang-setup.md    # Guida architettura e flusso traduzioni Fink
│   └── google-apps-script.md   # Guida completa setup, deploy e debug Apps Script
│
├── google-apps-script/         # Backend contatti (Google Apps Script)
│   ├── .clasp.json             # Config clasp (scriptId)
│   ├── appsscript.json         # Manifest GAS
│   └── Code.js                 # Web App: doPost → Invio email con CC + Google Form
│
├── public/
│   ├── favicon.ico
│   └── robots.txt
│
├── scripts/
│   ├── check-i18n.js           # Validazione parità chiavi e sintassi JSON i18n
│   └── sync-subcatalogs.js     # Generazione automatica locales/it da CMS e update inlang
│
├── src/
│   ├── assets/
│   │   └── images/             # Immagini caricate via CMS
│   ├── components/             # Componenti Astro / Svelte
│   ├── config/
│   │   └── languages.json      # Configurazione lingue attive
│   ├── data/
│   │   ├── cms/                # Dati CMS sorgente (modificabili via PagesCMS)
│   │   │   ├── structures/
│   │   │   ├── structure-categories/
│   │   │   ├── partner-categories/
│   │   │   └── people-roles/
│   │   ├── pageLinks.ts
│   │   ├── partners.ts
│   │   ├── people.ts
│   │   ├── stats.ts
│   │   └── structures.ts
│   ├── locales/                # Traduzioni e cataloghi per Fink
│   │   ├── it/                 # Generato automaticamente da sync-subcatalogs.js (baseLocale)
│   │   └── en/                 # Traduzioni in lingua inglese (gestite da Fink)
│   │   ├── stats.ts
│   │   └── structures.ts
│   ├── layouts/                # Layout Astro
│   ├── pages/                  # Route Astro (italiano e sub-route en/)
│   ├── styles/
│   ├── types/
│   └── utils/
│
├── .github/workflows/
│   ├── ci.yml                  # CI: validazione i18n, formato + lint + typecheck
│   └── deploy.yml              # Deployment automatico
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

| Comando                     | Azione                                                                      |
| --------------------------- | --------------------------------------------------------------------------- |
| `pnpm install`              | Installa le dipendenze del progetto                                         |
| `pnpm run dev`              | Avvia il server di sviluppo su `localhost:4321`                             |
| `pnpm run build`            | Compila il sito statico di produzione in `./dist/`                          |
| `pnpm run preview`          | Anteprima locale della build di produzione                                  |
| `pnpm run astro`            | Esegue un comando Astro CLI (`astro add`, …)                                |
| `pnpm run sync:subcatalogs` | Sincronizza i file delle lingue target da `it/` e aggiorna `project.inlang` |
| `pnpm run check:i18n`       | Controlla la validità JSON e la parità delle chiavi i18n                    |
| `pnpm run inlang:check`     | Valida le traduzioni con inlang CLI (sintassi, markup, variabili)           |
| `pnpm run typecheck`        | Controlla i tipi con `astro check` e `svelte-check`                         |
| `pnpm run check`            | `check:i18n` + `flint` + `typecheck` (da eseguire prima di ogni commit)     |
| `pnpm run lint`             | Controlla il codice con ESLint                                              |
| `pnpm run lint:fix`         | Corregge automaticamente i problemi ESLint                                  |
| `pnpm run format`           | Controlla la formattazione con Prettier                                     |
| `pnpm run format:write`     | Formatta tutti i file con Prettier                                          |
| `pnpm run flint`            | `format:write` + `lint:fix` in sequenza                                     |

---

## Traduzioni & Fink (inlang)

I testi dell'interfaccia e i contenuti della conferenza sono organizzati tra sorgente CMS e cataloghi di traduzione:

- `src/data/cms/`: lingua sorgente e fonte di verità autorevole, modificata direttamente tramite **PagesCMS** (senza cartelle per-lingua, con array JSON completi, ID e metadati).
- `src/locales/it/`: catalogo di riferimento per **Fink**, generato automaticamente dallo script di sincronizzazione a partire da `src/data/cms/` (array convertiti in oggetti indicizzati per compatibilità totale con plugin-json).
- `src/locales/en/`: traduzioni in lingua inglese, tradotte collaborativamente su **Fink**.

La traduzione visiva collaborativa è gestita tramite **Fink** ([https://fink.inlang.com/github.com/ai-sf/cisf27](https://fink.inlang.com/github.com/ai-sf/cisf27)).

Per la guida completa sull'architettura, sincronizzazione automatica dei sottocataloghi e aggiunta di nuove lingue, consulta [`docs/fink-inlang-setup.md`](./docs/fink-inlang-setup.md).

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

> `.env` è gitignorato. In produzione imposta la variabile d'ambiente nella dashboard della piattaforma di hosting.

---

## Google Apps Script (modulo contatti)

Il backend del form contatti risiede in [`google-apps-script/`](google-apps-script/) e gestisce l'invio immediato di un'email formattata tramite `MailApp.sendEmail` all'indirizzo istituzionale **`cisf27@ai-sf.it`**, con impostazione automatica del `replyTo` del mittente e **CC dinamico** in base all'argomento selezionato:

- **Sponsorizzazione** ➔ CC: `diego.ficarra@ai-sf.it`, `mariarosaria.sivo@ai-sf.it`
- **Logistica** ➔ CC: `tomislav.vojvodic@ai-sf.it`
- **Programma Scientifico** ➔ CC: `marta.grenno@ai-sf.it`, `chiara.luppino@ai-sf.it`, `ludovica.rainero@ai-sf.it`
- **Iscrizione** ➔ CC: `francesco.isgrò@ai-sf.it`, `alessandro.dagostino@ai-sf.it`
- **Altro / Fallback** ➔ CC: `francesco.isgrò@ai-sf.it`, `alessandro.dagostino@ai-sf.it`

Se configurata la proprietà `FORM_ID`, i messaggi vengono inoltre archiviati come risposte in un Google Form di riserva.

> 📖 **Guida Completa di Setup, Deploy e Risoluzione Errori:**  
> Consulta [`docs/google-apps-script.md`](./docs/google-apps-script.md) per istruzioni dettagliate su autorizzazioni OAuth, deploy come Web App, test diagnostici e gestione con `clasp`.

---

## CMS

I contenuti editoriali sono gestiti tramite **PagesCMS**, configurato in `.pages.yml`.

- I dati risiedono direttamente in `src/data/cms/` (file JSON editabili sia tramite interfaccia che a mano).
- Ogni file o cartella JSON corrisponde a una collezione o catalogo:
  - Cataloghi principali di pagina: `home.json`, `about.json`, `program.json`, `contacts.json`, `structures.json`, …
  - Sottocataloghi modulari: `structures/` (alloggi e sedi), `partner-categories/`, `people-roles/`, `structure-categories/`.
- Le immagini caricate tramite CMS vengono salvate in `src/assets/images/` e ottimizzate in fase di build.
- In PagesCMS la modifica agisce direttamente sui contenuti in `src/data/cms/`. Lo script `pnpm run sync:subcatalogs` genera la versione per Fink in `src/locales/it/`.

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

# 5. Sviluppa - tutte le modifiche sono visibili in tempo reale su localhost:4321

# 6. Prima di ogni commit, esegui i controlli completi di qualità
pnpm run check
```

---

## Guida produzione

```sh
# Build statica per produzione
pnpm run build
```

L'output compilato è disponibile nella cartella `dist/`. Può essere ospitato su **qualsiasi provider statico**:

- **Cloudflare Pages** → collega il repository GitHub, build command: `pnpm run build`, output directory: `dist`
- **Netlify** → build command: `pnpm run build`, publish directory: `dist`
- **GitHub Pages** → distribuzione automatica della cartella `dist/` tramite GitHub Actions

Assicurati di configurare la variabile d'ambiente `PUBLIC_GOOGLE_SCRIPT_URL` nelle impostazioni della piattaforma di hosting.
