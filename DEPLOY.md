# Deployment auf Cloudflare

Die Seite ist vollständig statisch und läuft als **Worker mit Static Assets**: Cloudflare lädt den
Inhalt von `dist/` hoch und liefert ihn aus, es gibt keinen Servercode. Das Dashboard legt neue
Git-Projekte inzwischen als Worker an, nicht mehr als Pages-Projekt.

## Die zwei Dateien, die das steuern

`wrangler.jsonc` ist die Quelle der Wahrheit:

```jsonc
{
  "name": "braendle-tech-site",
  "compatibility_date": "2026-08-05",
  "assets": { "directory": "./dist" }
}
```

Kein `main`, keine Bindings. Genau so gehört es für eine reine Auslieferung statischer Dateien.

**Diese Datei muss existieren, sonst schlägt der Deploy fehl.** Findet `wrangler deploy` keine
Konfiguration, startet es eine automatische Einrichtung, führt ungefragt `astro add cloudflare`
aus und baut neu — diesmal mit dem Cloudflare-Adapter. Der verlagert das Prerendering in die
Workers-Laufzeit, und dort gibt es kein `node:fs`. Genau daran ist der erste Versuch gescheitert.
Mit `wrangler.jsonc` im Repo passiert das nicht mehr.

`wrangler` steht als devDependency in der `package.json`, damit der Deploy auf einer gepinnten
Version läuft und nicht auf dem, was `npx` gerade zieht.

## Einstellungen im Dashboard

Im Worker unter **Settings → Build**:

| Feld | Wert |
|---|---|
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Root directory | *(leer)* |
| Branch | `main` |

Die Node-Version kommt aus `.nvmrc` (24). Environment-Variablen braucht die Seite keine.

## Von Hand deployen

Einmalig `npx wrangler login` (OAuth im Browser), danach:

```bash
npm run deploy
```

Das baut und lädt hoch. `npx wrangler deploy --dry-run` prüft die Konfiguration, ohne etwas
hochzuladen.

## Nach dem ersten Deploy prüfen

- `/` leitet ohne Verzögerung auf `/de/` weiter
- `/de/` und `/en/` laden, der Sprachumschalter behält die Leseposition
- Das Partikelporträt bewegt sich unter dem Zeiger, ein Klick löst den Burst aus
- Hell/Dunkel umschalten, neu laden — die Wahl bleibt erhalten
- **Lebenslauf DE und EN** öffnen sich im Browser-Viewer, jeweils in der richtigen Sprache
- LinkedIn und `mailto:` funktionieren

Bleibt das Feld statisch, steht der Grund im DOM:
`document.querySelector('[data-hero-visual]').dataset.heroSkip` (siehe README).

## Eigene Domain

Im Worker unter **Settings → Domains & Routes → Add → Custom domain** → `braendle.tech`, dazu
`www.braendle.tech`, falls du die Variante auch willst. Cloudflare legt die Records selbst an,
weil die Zone schon dort liegt.

> **Deine Proton-Mail bleibt unberührt.** Eine Custom Domain fasst nur die Adressrecords des
> Hostnamens an, nicht die MX-, SPF-, DKIM- oder DMARC-Einträge. Trotzdem hinterher einmal eine
> Testmail an `ben@braendle.tech` schicken.

Danach in `astro.config.mjs` prüfen, dass `site` weiterhin auf `https://braendle.tech` zeigt —
davon hängen `canonical`, `hreflang` und `sitemap-index.xml` ab.

## Wenn später ein Kontaktformular dazukommt

Dann bekommt `wrangler.jsonc` ein `main` mit einem Worker-Skript neben den Assets, und erst dann
ist der Cloudflare-Adapter für Astro ein Thema. Für den Mailversand gilt die Notiz aus dem grossen
Projekt: ein Anbieter wie Resend muss von einer **Subdomain** senden. Ein zweiter SPF-Eintrag auf
der Apex-Domain zerschiesst die Proton-Zustellbarkeit.
