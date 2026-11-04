# Guida alla Configurazione di Fink / inlang per le Traduzioni

Questo repository è configurato per la gestione visuale e collaborativa delle traduzioni tramite **[Fink di inlang](https://fink.inlang.com/)**.

---

## 1. Panoramica e Architettura

- **Editor visuale:** [Fink](https://fink.inlang.com/) — interfaccia web per traduttori che effettua direttamente commit su GitHub senza necessità di server dedicati, database o webhook.
- **Sorgente CMS (PagesCMS):** `src/data/cms/` — fonte di verità autorevole gestita direttamente tramite PagesCMS (`.pages.yml`). Non contiene cartelle per-lingua: i contenuti risiedono direttamente nella directory principale con schema JSON nativo (`list: true`, array completi, ID, icone, ecc.).
- **Directory Traduzioni (Fink):** `src/locales/`
  - `src/locales/it/`: generato automaticamente dallo script di sync a partire da `src/data/cms/`. Funge da `baseLocale` di riferimento per Fink con array convertiti in oggetti indicizzati (`{"0": ..., "1": ...}`) per compatibilità totale con `@inlang/plugin-json`.
  - `src/locales/en/`: gestito direttamente da Fink e dai traduttori.
- **Configurazione inlang:** [`project.inlang/settings.json`](../project.inlang/settings.json) (`baseLocale: "it"`, `locales: ["it", "en"]`, pathPattern: `./src/locales/{locale}/...`).

```
src/
├── data/cms/                   # Fonte primaria PagesCMS (SENZA cartelle per-lingua)
│   ├── structures/             # Singole strutture (combo.json, ...)
│   ├── structure-categories/   # Categorie strutture (alloggi.json, ...)
│   ├── partner-categories/     # Categorie partner (sponsor.json, ...)
│   ├── people-roles/           # Ruoli del team e dei contatti
│   └── ... (cataloghi di pagina con array e ID completi)
│
└── locales/                    # Cataloghi inlang / Fink
    ├── it/                     # Auto-generato dallo script di sync (baseLocale di riferimento)
    │   ├── structures/
    │   └── ... (array convertiti in {"0": ..., "1": ...}, solo testi)
    └── en/                     # Traduzioni inglesi (gestite direttamente da Fink)
        ├── structures/
        └── ...
```

---

## 2. Separazione dei Ruoli: PagesCMS vs. Fink

- **PagesCMS (`.pages.yml`)**:
  - Punta direttamente a `src/data/cms/...` (es. `src/data/cms/home.json`, `src/data/cms/structures/combo.json`).
  - Mantiene lo schema JSON nativo con array completi (`list: true`), ID strutturali, icone, colori, coordinate e riferimenti tecnici.
  - I content manager lavorano senza alcuna complessità multi-lingua o vincoli di sintassi imposti dai tool di traduzione.
- **Fink by inlang (`project.inlang/settings.json`)**:
  - Opera esclusivamente su `src/locales/{locale}/...`.
  - `baseLocale` è `"it"`, caricato da `src/locales/it/` (pulito, indicizzato e pronto per il confronto a colonne).
  - `locales` contiene tutte le lingue supportate (es. `["it", "en"]`).
  - Per l'inglese e le future lingue di destinazione, **non è necessario sincronizzare alcuno script**: Fink crea e gestisce direttamente le chiavi in `src/locales/en/`.
  - A runtime, il caricatore unificato (`deepMerge` in `src/data/cms/index.ts`) unisce automaticamente i testi tradotti di `src/locales/en/` sopra la struttura e i metadati completi di `src/data/cms/`, restituendo array nativi tipizzati ai componenti Astro.

---

## 3. Tradurre con Fink

Per tradurre il sito visivamente:

1. Apri Fink nel browser:
   - **Produzione (main):** [https://fink.inlang.com/github.com/ai-sf/cisf27](https://fink.inlang.com/github.com/ai-sf/cisf27)
   - **Branch specifico:** `https://fink.inlang.com/github.com/ai-sf/cisf27?branch=<nome-branch>`
2. Effettua l'accesso con il tuo account GitHub.
3. Fink caricherà automaticamente i cataloghi: nella colonna di sinistra vedrai il testo italiano di riferimento (da `src/locales/it/`) e nella colonna di destra potrai inserire o modificare la traduzione inglese (su `src/locales/en/`).
4. Al termine del salvataggio, Fink esegue un commit direttamente sul branch configurato nel repository.

---

## 4. Sincronizzazione Automatica (`sync:subcatalogs`)

Quando vengono modificati o aggiunti nuovi contenuti in `src/data/cms/` tramite PagesCMS, è sufficiente eseguire:

```bash
pnpm run sync:subcatalogs
```

Lo script si occupa di:

1. Leggere i dati CMS sorgente da `src/data/cms/`.
2. Convertire automaticamente gli array in oggetti indicizzati (`{"0": ..., "1": ...}`) e rimuovere metadati tecnici non traducibili.
3. Sovrascrivere `src/locales/it/` con la nuova versione pronta per Fink.
4. Aggiornare `project.inlang/settings.json` con tutti i namespace registrati.
5. **Non tocca `src/locales/en/`**: Fink rileverà automaticamente su GitHub le nuove stringhe aggiunte in `it` evidenziandole come mancanti in `en`.

### Automazione GitHub Actions (`.github/workflows/i18n-sync.yml`)

Ad ogni push o merge che modifica file in `src/data/cms/**` (ad esempio salvando modifiche da PagesCMS), la GitHub Action esegue automaticamente `pnpm run sync:subcatalogs` ed effettua il commit e push di `src/locales/it/` e `project.inlang/settings.json` con `[skip ci]`.

---

## 5. Aggiungere una Nuova Lingua

Per aggiungere una nuova lingua al sito (es. Spagnolo `es`):

1. **Nel Codice:**
   - Aggiungi i metadati in `src/config/languages.json`:
     ```json
     {
       "code": "es",
       "name": "Español",
       "badge": "ES",
       "htmlLang": "es-ES"
     }
     ```
   - Esegui `pnpm run sync:subcatalogs` per registrare la nuova lingua in `project.inlang/settings.json`.
2. **In Fink:** Apri Fink, seleziona la lingua `es` e inizia a tradurre direttamente dall'italiano.
3. Le route Astro, il selettore di lingua nella navbar, il menu mobile e i controlli di CI supporteranno immediatamente la nuova lingua senza ulteriori modifiche al codice.

---

## 6. Validazione Locale e CI

Per verificare la conformità e la completezza delle traduzioni prima di effettuare un commit:

```bash
# Controllo con inlang CLI (verifica sintassi, markup e selettori)
pnpm run inlang:check

# Controllo parità chiavi tra it ed en
pnpm run check:i18n
```
