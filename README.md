# Grafael

Hufvudstadsbladets redaktionella grafverktyg för webb och tryck. Byggt med React, TypeScript, Tailwind CSS och Vite — helt utan backend eller externa JavaScript-CDN:er.

## Funktioner

- **Snabb dataimport & tabell:** Klistra in data direkt från Excel/Google Sheets/CSV eller importera `.xlsx`, `.xls` och `.csv`. Automatisk identifiering av kolumner, talformat, datum och lämplig diagramtyp, samt sortering direkt i tabellen.
- **Diagramtyper:**
  - **Stapeldiagram:** Stående och liggande, grupperade, staplade, 100 % staplade samt hierarkiska kategorier/undergrupper.
  - **Linjediagram:** Linjer, punkter, fyllda ytor, staplade ytor och hantering av luckor i tidsserier.
  - **Cirkel- & munkdiagram:** Cirkel, munkdiagram, halvcirkel samt proportionell storlek vid flera diagram.
- **Typografi & layout (`Text`, `Popuper`, `Färger`, `Rutnät`):**
  - Anpassningsbara rubriker, ingresser, källhänvisningar och teckenförklaring.
  - Avancerad datum- och tidsaxelhantering med förenklade axeletiketter och fullständiga datum i hover-popups.
  - Värdeetiketter (inkl. vertikal `-90°`-rotation), referenslinjer och möjlighet att framhäva enskilda staplar/kategorier med egen färg.
  - Klick på element i diagrammet i redigeringsläget hoppar automatiskt till rätt inställningsflik.
  - Stöd för ljust och mörkt läge samt **Ångra / Gör om** (`Ctrl/Cmd + Z`, `Ctrl/Cmd + Shift + Z` / `Ctrl/Cmd + Y`).
- **Tryckfärdig PDF-export:** Exportera direkt i redaktionella spaltbredder (`1sp` 47,6 mm till `5sp` 254 mm) med vektoriserad text i rent svart via `jsPDF`, `svg2pdf.js` och `opentype.js` med inbäddade Roboto-typsnitt.
- **Lättviktig webbinbäddning utan databas:**
  - Delningslänkar komprimerar hela grafens data och inställningar i URL-hashen (`#view=lz:...`) via `lz-string`.
  - Redaktören jobbar i `index.html`, medan *"Kopiera länk"* pekar på den fristående läsarfilen `embed.html` (~534 kB / ~157 kB gzippad) utan exportbibliotek eller redigerings-UI.
  - Stöder responsiv breddanpassning och automatisk höjdrapportering för CMS-iframar (`pang-resize` och `iframe.resize`).

## Arkitektur & säkerhet

Verktyget byggs med `vite-plugin-singlefile` till två självständiga, färdigkompilerade HTML-filer:

| Fil | Syfte | Innehåll |
| --- | --- | --- |
| `index.html` | Redaktörsverktyg | Fullständig redigerare, Excel-import, PDF/SVG-vektorexport samt bakåtkompatibel `#view=`-visning |
| `embed.html` | Inbäddning i artiklar | Minimal läsarmotor (`ChartVisualizer`, `lz-string`, hover-popups och iframe-resize) |

- **Inga externa JS-CDN:er:** All JavaScript, CSS och exporttypsnitt paketeras lokalt i bygget (inget Babel i webbläsaren, inget `unsafe-eval`).
- **Säkerhetsvalidering:** URL-laddade tillstånd saneras via schema- och gränsvalidering samt skydd mot prototype pollution (`sanitizeChartState` / `isSafeKey`).

## Kom igång lokalt

Kräver [Node.js](https://nodejs.org/).

```bash
# Installera beroenden
npm install

# Starta lokal utvecklingsserver (http://localhost:3000)
npm run dev

# Typkontroll (TypeScript)
npm run lint

# Bygg produktionsfiler (skapar dist/ och kopierar till deploy/)
npm run build

# Förhandsgranska färdigt bygge lokalt
npm run preview
```

## Publicering (FTP / statisk webbserver)

Efter `npm run build` finns de två färdigkompilerade filerna i både `dist/` och `deploy/`:

- `index.html`
- `embed.html`

Ladda upp **enbart dessa två filer** till önskad katalog på webbservern/FTP:n (t.ex. `/qs/widgets/patron/quickshot/mj/grafael/`). Källkodsfilerna (`src/`, `package.json`, rotmappens `index.html`) ska inte laddas upp till produktionsservern.

> **Obs om CSP (Content Security Policy):** Både `index.html` och `embed.html` har inbäddade `<script type="module">` och `<style>`-taggar, vilket kräver att servern tillåter inline-skript/stilar (eller att man byter till en vanlig delad Vite-build utan `vite-plugin-singlefile`). Gränssnittet hämtar även Roboto-CSS från `fonts.googleapis.com` / `fonts.gstatic.com`, med automatisk fallback till systemtypsnitt om dessa blockeras.

## Projektstruktur

```text
├── index.html               # Utvecklingsmall för redigeraren
├── embed.html               # Utvecklingsmall för inbäddningsläget
├── vite.config.ts           # Vite + vite-plugin-singlefile (index & embed)
├── package.json
├── deploy/                  # Färdigbyggda fristående HTML-filer redo för FTP
│   ├── index.html
│   └── embed.html
└── src/
    ├── main.tsx             # React-montering för redigeraren
    ├── embedMain.tsx        # React-montering för embed.html
    ├── App.tsx              # Redigerar-UI, dataimport & PDF-vektorexport
    ├── EmbedApp.tsx         # Lättviktig läsarvy för embed.html
    ├── ChartVisualizer.tsx  # SVG-grafmotor & hover-popups
    ├── chartUtils.ts        # Delade formatters, datumtolkning & URL-kodning
    └── index.css            # Tailwind CSS v4
```
