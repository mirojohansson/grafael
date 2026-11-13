# Grafael

Hufvudstadsbladets redaktionella grafverktyg för webb och tryck.

**Online:** https://ext.dn.se/qs/widgets/patron/quickshot/mj/grafael/

## Vad verktyget gör

- **Från rådata till färdig grafik:** Klistra in tabeller direkt från Excel/Sheets eller importera `.xlsx`/`.csv`. Verktyget känner automatiskt av talformat, datum och lämplig diagramtyp.
- **Diagramtyper & anpassning:** Stapeldiagram (stående, liggande, staplade, 100 % och hierarkiska), linje-/ytediagram samt cirkel-/munkdiagram. Full kontroll över rubriker, ingresser, källfot, tidsaxlar, värdeetiketter, referenslinjer, hover-popups och enskild kategorifärgning.
- **Tryckfärdig PDF-export:** Exportera i tidningsspaltbredder (`1sp` 47,6 mm – `5sp` 254 mm) med text konverterad till vektorbanor i rent svart.
- **Webbinbäddning utan databas:** Kopiera en fristående bäddningslänk som renderar grafen responsivt i CMS-iframar med interaktiva hover-popups.

## För utvecklare – hur det är byggt

- **Stack:** React, TypeScript och Tailwind CSS, paketerat med Vite och `vite-plugin-singlefile` helt utan backend eller externa JavaScript-CDN:er.
- **Två fristående byggen:** `index.html` innehåller hela redigeraren och exportmotorn, medan delningslänkar pekar på den minimala läsarfilen `embed.html` (~157 kB gzip) som enbart laddar grafmotorn (`ChartVisualizer.tsx`) och URL-avkodaren.
- **Stateless URL-lagring:** Grafens data och konfiguration komprimeras med `lz-string` i URL-hashen (`#view=lz:...`) och saneras via schema- och prototype-pollution-kontroll vid inläsning. Bäddningsvyn skickar höjdändringar via `postMessage` (`pang-resize` och `iframe.resize`).
- **Import & vektorexport:** `xlsx` sköter kalkylbladsimport, medan `jsPDF`, `svg2pdf.js` och `opentype.js` (med lokalt inbäddade Roboto-typsnitt) genererar tryckfärdiga PDF:er direkt i webbläsaren.
