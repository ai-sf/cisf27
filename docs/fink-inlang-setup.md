# Guida alla Configurazione di Fink / inlang per le Traduzioni

Questo repository è configurato per la gestione visuale e collaborativa delle traduzioni tramite **[Fink di inlang](https://fink.inlang.com/)**.

---

## 1. Panoramica e Architettura

- **Editor visuale:** [Fink](https://fink.inlang.com/) — interfaccia web per traduttori che effettua direttamente commit su GitHub senza necessità di server dedicati, database o webhook.
- **Lingua base / sorgente:** Italiano (`it`) — fonte di verità autorevole gestita direttamente tramite PagesCMS (`.pages.yml`). Configurato come `baseLocale: "it"` ed escluso dai target modificabili in Fink (`locales: ["en"]`).
- **Lingue di destinazione:** Inglese (`en`) (ed eventuali lingue future configurate in Fink o in `src/config/languages.json`).
- **Formato file:** JSON (`@inlang/plugin-json`) suddiviso in 47 cataloghi modulari (cataloghi di pagina e sottocataloghi per strutture, categorie e ruoli).
- **Configurazione inlang:** [`project.inlang/settings.json`](../project.inlang/settings.json)

```
src/data/cms/
├── it/                         # Lingua base (fonte autorevole, modificabile SOLO via PagesCMS)
│   ├── structures/             # Singole strutture (combo.json, ...)
│   ├── structure-categories/   # Definizioni categorie strutture (alloggi.json, ...)
│   ├── partner-categories/     # Definizioni categorie partner (sponsor.json, ...)
│   ├── people-roles/           # Ruoli del team e dei contatti
│   └── ... (cataloghi di pagina)
└── en/                         # Traduzioni inglesi (modificabili via Fink)
    ├── structures/             # Campi tradotti delle strutture (solo testi)
    ├── structure-categories/   # Etichette tradotte delle categorie strutture
    ├── partner-categories/     # Etichette tradotte delle categorie partner
    ├── people-roles/           # Titoli e descrizioni tradotte dei ruoli
    └── ... (solo testi traducibili, senza ID o riferimenti tecnici)
```

---

## 2. Separazione dei Ruoli: PagesCMS vs. Fink

- **PagesCMS (`.pages.yml`)**:
  - Punta esclusivamente a `src/data/cms/it/...`.
  - I content manager gestiscono i contenuti in italiano, creano nuove strutture, assegnano ruoli, caricano immagini e aggiornano i dettagli dell'evento.
- **Fink by inlang (`project.inlang/settings.json`)**:
  - `baseLocale` è `"it"` (funge da colonna di riferimento in sola lettura).
  - `locales` è `["en"]` (o altre lingue target). L'italiano è escluso dalla lista `locales` per evitare che i traduttori su Fink possano modificare inavvertitamente i dati originali italiani.
  - I campi non traducibili (`id`, `role`, `icon`, `color`, `address`, `mapUrl`, `image`, ecc.) sono omessi nelle lingue di destinazione; il sistema di caricamento a runtime (`deepMerge`) eredita automaticamente tutti i dati strutturali e tecnici dal file italiano corrispondente.

---

## 3. Tradurre con Fink

Per tradurre il sito visivamente:

1. Apri Fink nel browser:
   - **Produzione (main):** [https://fink.inlang.com/github.com/ai-sf/cisf27](https://fink.inlang.com/github.com/ai-sf/cisf27)
   - **Branch specifico:** `https://fink.inlang.com/github.com/ai-sf/cisf27?branch=<nome-branch>`
2. Effettua l'accesso con il tuo account GitHub.
3. Fink caricherà automaticamente tutti i namespace definiti in `project.inlang/settings.json`, mostrando un confronto affiancato con evidenziazione automatica delle stringhe mancanti o non tradotte.
4. Al termine del salvataggio, Fink esegue un commit direttamente sul branch configurato nel repository.

---

## 4. Sincronizzazione dei Sottocataloghi (`sync:subcatalogs`)

Quando vengono aggiunti nuovi file in italiano nelle cartelle dei sottocataloghi (`structures/`, `partner-categories/`, `people-roles/`, `structure-categories/`), è sufficiente eseguire:

```bash
pnpm run sync:subcatalogs
```

Lo script si occupa di:

1. Individuare i nuovi file creati in `src/data/cms/it/`.
2. Generare i corrispettivi file per ogni lingua di destinazione (es. `en/`), estraendo solo i campi di testo traducibili e ripulendo automaticamente ID, icone e riferimenti tecnici.
3. Registrare i nuovi namespace in `project.inlang/settings.json` affinché appaiano immediatamente disponibili su Fink.

---

## 5. Aggiungere una Nuova Lingua

Per aggiungere una nuova lingua al sito (es. Spagnolo `es`):

1. **In Fink:** È possibile aggiungere una nuova lingua direttamente dall'interfaccia web di Fink.
2. **Nel Codice:**
   - Aggiungi il codice lingua a `locales` in `project.inlang/settings.json` (es. `["en", "es"]`).
   - Aggiungi i metadati in `src/config/languages.json`:
     ```json
     {
       "code": "es",
       "name": "Español",
       "badge": "ES",
       "htmlLang": "es-ES"
     }
     ```
   - Esegui `pnpm run sync:subcatalogs` per generare i file scheletro dei sottocataloghi per la nuova lingua.
3. Le route Astro, il selettore di lingua nella navbar, il menu mobile e i controlli di CI supporteranno immediatamente la nuova lingua senza ulteriori modifiche al codice.

---

## 6. Validazione Locale e CI

Per verificare la conformità e la completezza delle traduzioni prima di effettuare un commit:

```bash
# Controllo con inlang CLI (verifica sintassi, markup e selettori)
pnpm run inlang:check

# Controllo rapido parità chiavi e assenza errori di sintassi
pnpm run check:i18n
```
