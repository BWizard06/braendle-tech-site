# Deployment auf Cloudflare Pages

Die Seite ist vollständig statisch: Cloudflare baut sie bei jedem Push und liefert den Inhalt von
`dist/` aus. Kein Servercode, keine Bindings, keine Adapter.

## Projekt anlegen

Pages mit Git-Anbindung gibt es weiterhin, es ist im Dashboard nur nicht mehr prominent — der
Weg führt über **Create application**, nicht über den grossen Workers-Knopf.

1. Cloudflare Dashboard → **Workers & Pages**
2. **Create application** → Reiter **Pages** → **Connect to Git**
3. GitHub verbinden, Zugriff auf `BWizard06/braendle-tech-site` freigeben, Repo auswählen
4. Production branch: `main`

## Build-Einstellungen

| Feld | Wert |
|---|---|
| Framework preset | Astro |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | *(leer)* |

Die Node-Version kommt aus `.nvmrc` (24); das Build-Image v3 hat sonst 22.16 als Standard.
Environment-Variablen braucht die Seite keine.

## Warum hier keine wrangler-Datei liegt

Der erste Versuch lief über einen **Worker** statt über Pages. Dessen Deploy-Befehl ist
`npx wrangler deploy`, und ohne Konfigurationsdatei startet wrangler eine automatische
Einrichtung: es führte ungefragt `astro add cloudflare` aus und baute mit dem Adapter neu, der
das Prerendering in die Workers-Laufzeit verlagert — wo es kein `node:fs` gibt. Daran ist der
Build gescheitert.

**Pages ruft wrangler gar nicht auf**, lädt einfach das Build-Verzeichnis hoch. Eine
wrangler-Konfiguration wäre hier nicht nur überflüssig, sondern falsch: für Pages müsste sie
`pages_build_output_dir` enthalten, und Workers-Schlüssel wie `assets` oder `main` gelten dort
nicht. Deshalb liegt keine im Repo. Die Build-Einstellungen stehen im Dashboard.

Für einen Deploy von Hand (ohne Git-Anbindung) gibt es trotzdem einen Weg: einmal
`npx wrangler login`, dann `npm run deploy` — das ruft `wrangler pages deploy ./dist` auf.

## Nach dem ersten Deploy prüfen

Die Seite läuft dann unter `<projektname>.pages.dev`:

- `/` leitet ohne Verzögerung auf `/de/` weiter
- `/de/` und `/en/` laden, der Sprachumschalter behält die Leseposition
- Das Partikelporträt bewegt sich unter dem Zeiger, ein Klick löst den Burst aus
- Hell/Dunkel umschalten, neu laden — die Wahl bleibt erhalten
- **Lebenslauf DE und EN** öffnen sich im Browser-Viewer, jeweils in der richtigen Sprache
- LinkedIn und `mailto:` funktionieren

Bleibt das Feld statisch, steht der Grund im DOM:
`document.querySelector('[data-hero-visual]').dataset.heroSkip` (siehe README).

## Eigene Domain

**Settings → Custom domains → Set up a domain** → `braendle.tech`, dazu `www.braendle.tech`,
falls du die Variante auch willst. Cloudflare legt die Records selbst an, weil die Zone schon
dort liegt.

> **Deine Proton-Mail bleibt unberührt.** Eine Custom Domain fasst nur die Adressrecords des
> Hostnamens an, nicht die MX-, SPF-, DKIM- oder DMARC-Einträge. Trotzdem hinterher einmal eine
> Testmail an `ben@braendle.tech` schicken.

Danach in `astro.config.mjs` prüfen, dass `site` weiterhin auf `https://braendle.tech` zeigt —
davon hängen `canonical`, `hreflang` und `sitemap-index.xml` ab.

## Danach

Jeder Push auf `main` löst einen neuen Deploy aus. Die GitHub Action
(`.github/workflows/ci.yml`) fährt vorher Typecheck, Unit-Tests, Build und die Browser-Tests in
Chromium.

## Wenn später ein Kontaktformular dazukommt

Dann kommt ein `functions/`-Verzeichnis ins Repo (Pages Functions) — ein Umzug ist dafür nicht
nötig. Für den Mailversand gilt die Notiz aus dem grossen Projekt: ein Anbieter wie Resend muss
von einer **Subdomain** senden. Ein zweiter SPF-Eintrag auf der Apex-Domain zerschiesst die
Proton-Zustellbarkeit.
