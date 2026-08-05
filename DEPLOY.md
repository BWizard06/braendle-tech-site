# Deployment auf Cloudflare Pages

Statischer Build, keine Serverfunktionen. Alles unten machst du selbst im Dashboard, ich habe nur
das Repo so vorbereitet, dass keine Einstellung erraten werden muss.

## Warum Cloudflare und nicht Vercel

Die DNS von `braendle.tech` liegt bereits bei Cloudflare. Die eigene Domain anzuhängen ist damit
ein interner Schritt statt einer Nameserver-Änderung, und der Free-Tier hat kein Traffic-Limit.

Cloudflare steckt neue Entwicklung inzwischen in **Workers mit Static Assets** statt in Pages.
Für eine rein statische Seite ist Pages weiterhin in Ordnung und der kürzere Weg. Sobald ein
Kontaktformular oder eine API dazukommt, ist Workers die Variante, von der man nicht mehr
wegmigrieren muss.

## 1. Projekt anlegen

1. Cloudflare Dashboard → **Workers & Pages** → **Create** → Reiter **Pages** → **Connect to Git**
2. GitHub verbinden, Zugriff auf `BWizard06/braendle-tech-site` freigeben, Repo auswählen
3. Production branch: `main`

## 2. Build-Einstellungen

| Feld | Wert |
|---|---|
| Framework preset | Astro |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | *(leer)* |

Die Node-Version steht in `.nvmrc` (24) und wird vom Build-Image v3 übernommen. Falls der Build
doch mit einer Node-Fehlermeldung abbricht: unter **Settings → Variables and Secrets** eine
Build-Variable `NODE_VERSION` mit dem Wert `24` setzen.

Environment-Variablen braucht die Seite sonst keine.

## 3. Erster Deploy prüfen

Nach dem Build läuft sie unter `<projektname>.pages.dev`. Durchgehen:

- `/` leitet ohne Verzögerung auf `/de/` weiter
- `/de/` und `/en/` laden, der Sprachumschalter behält die Leseposition
- Das Partikelporträt bewegt sich unter dem Zeiger, ein Klick löst den Burst aus
- Hell/Dunkel umschalten, neu laden — die Wahl bleibt erhalten
- **Lebenslauf DE und EN** öffnen sich im Browser-Viewer und zeigen die richtige Sprache
- LinkedIn und `mailto:` funktionieren

Bleibt das Feld statisch, steht der Grund im DOM:
`document.querySelector('[data-hero-visual]').dataset.heroSkip` (siehe README).

## 4. Eigene Domain

**Settings → Custom domains → Set up a domain** → `braendle.tech`, dazu `www.braendle.tech`,
falls du die Variante auch willst. Cloudflare legt die nötigen Records selbst an, weil die Zone
schon dort liegt.

> **Deine Proton-Mail bleibt unberührt.** Eine Custom Domain für Pages fasst nur die
> Adressrecords des Hostnamens an, nicht die MX-, SPF-, DKIM- oder DMARC-Einträge. Trotzdem
> hinterher einmal eine Testmail an `ben@braendle.tech` schicken.

Anschliessend in `astro.config.mjs` prüfen, dass `site` weiterhin auf `https://braendle.tech`
zeigt — davon hängen die `canonical`- und `hreflang`-Links sowie `sitemap-index.xml` ab.

## 5. Danach

Jeder Push auf `main` löst einen neuen Deploy aus. Die GitHub Action (`.github/workflows/ci.yml`)
fährt vorher Typecheck, Unit-Tests, Build und die Browser-Tests in Chromium — ein roter Haken dort
heisst, dass etwas kaputt ist, auch wenn Cloudflare den Build trotzdem durchbringt.

## Wenn später ein Kontaktformular dazukommt

Dann wird aus dem statischen Projekt eines mit einer Serverfunktion. Zwei Wege:

- **Pages Functions**: ein `functions/`-Verzeichnis im Repo, kein Umzug nötig
- **Workers mit Static Assets**: der Weg, den Cloudflare weiterentwickelt

Für den Mailversand gilt die Notiz aus dem grossen Projekt: ein Anbieter wie Resend muss von einer
**Subdomain** senden. Ein zweiter SPF-Eintrag auf der Apex-Domain zerschiesst die
Proton-Zustellbarkeit.
