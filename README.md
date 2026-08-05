# braendle.tech — Übergangsseite

Ein One-Pager als Zwischenlösung, bis das grosse Portfolio (`~/Desktop/projects/braendle-tech`)
fertig ist. Beide Projekte sind vollständig unabhängig: kein geteilter Code, keine geteilten
Abhängigkeiten. Aus dem Originalprojekt übernommen ist genau eine Datei, `src/assets/hero-source.png`.

**Die Quelldateien enthalten bewusst keine Kommentare.** Alles, was man über dieses Projekt
wissen muss, steht hier.

## Befehle

```bash
npm run dev        # Dev-Server
npm run build      # Produktionsbuild nach dist/
npm run preview    # Build lokal ansehen
npm test           # Unit-Tests (Vitest)
npm run test:e2e   # Browser-Tests (Playwright: Chromium, WebKit, Firefox)
npm run typecheck  # astro check
npm run bake       # Poster neu rendern (siehe unten)
```

Node 24 via mise (`mise.toml`).

## Aufbau

```
src/
  assets/            hero-source.png (Alpha-Matte, 512²) + die zwei gebackenen Poster
  components/
    islands/         HeroCanvas.tsx — die einzige React-Insel
    sections/        Hero, Stack, Work, Contact
    Logo, CornerNav, ThemeToggle
  lib/
    hero/            particles.ts (reine Geometrie), shaders.ts, palette.ts
    i18n.ts, theme.ts, anchor.ts
  content.ts         sämtliche Texte, DE + EN, an einem Ort
  pages/
    index.astro      301 auf /de/
    [lang]/index.astro
scripts/bake-poster.ts
tests/particles.test.ts   Unit-Tests der reinen Geometrie
tests/e2e/               Browser-Tests (hero.spec.ts, page.spec.ts)
```

## Der Hero

Drei Ebenen: Poster (`<picture>`, LCP-Element), leerer Mount-Container, ~1 kB Wrapper-Script.
Das Script entscheidet, ob die Insel überhaupt geladen wird, und besitzt ihren Lebenszyklus.
`three` + R3F + drei (~150 kB gzip) liegen hinter einem dynamischen Import und sind nie auf dem
kritischen Pfad.

**Was das Feld tut**

- **Zeigerfeld (Desktop, unverändert aus dem Originalprojekt):** ein Curl-Rauschfeld erzeugt
  Wirbel statt eines radialen Schubs, der Akzent geht dorthin, wo das Feld *geschert* wird —
  nicht unter den Cursor. Ohne Zeiger und ohne Scroll ist jeder Term null, der Vertex-Shader ist
  die Identität, das Feld ist exakt das Poster. Darum ist die Überblendung unsichtbar.
- **Burst (neu):** Klick oder Tap fährt eine Kurve statt einer Feder, weil sie asymmetrisch sein
  soll: **1,05 s langsam auseinander** (Smoothstep), **0,26 s halten**, **0,34 s schnell zurück**
  (kubisch, fällt sofort steil ab). Während des Bursts kippt ein Teil der Partikel in den Akzent.
  Ein Klick mitten in einem laufenden Burst setzt die Zeit nicht auf null, sondern auf die Stelle
  der Auswärtsphase mit demselben Wert (`envelopeToElapsed`, exakte Smoothstep-Umkehrung), damit
  nichts springt. Die Kurve ist in `tests/e2e/hero.spec.ts` gemessen, nicht nur behauptet: die
  Ausdehnung der Wolke wird bei 300 ms, 1000 ms, 1250 ms und 2200 ms abgetastet.
- **Ambient (nur Touch):** auf Geräten ohne Zeiger läuft eine leise Dauerbewegung, sonst stünde
  das Feld dort still. Auf dem Desktop ist nicht nur `uAmbient` null, sondern auch `uDrift`:
  der Zeiger allein irgendwo in der Hero-Sektion soll das Feld **nicht** in Bewegung setzen.
  Dort passiert nur etwas unter dem Cursor und beim Scrollen. Ein Test hält das fest, indem er
  drei Aufnahmen im Abstand von 700 ms auf Byte-Gleichheit prüft.

**Auf dem Handy läuft der Canvas mit dpr 2, auf dem Desktop mit 1.5.** Das sieht verkehrt herum
aus, ist aber richtig: das Handy hat ein kleines Feld auf einem dichten Display, der Desktop ein
grosses auf einem groben. Mit dem früheren Cap von 1.25 wurde das Feld auf einem 3×-Telefon um den
Faktor 2.4 hochskaliert, und genau daran sind die Brille und die Gesichtszüge verschwunden.

Der Rahmen ist `inline-size: min(100%, 30rem, 56svh)` mit `aspect-ratio: 1/1` — die Breite führt,
die Höhe folgt. Andersherum (`block-size` plus `max-inline-size`) klemmt nur die Breite, die Höhe
bleibt stehen, und der Rahmen ist nicht mehr quadratisch: Porträt aus der Mitte, Canvas über den
Bildschirmrand hinaus. Genau das ist beim Vergrössern einmal passiert und hängt jetzt im Test.

Das Alter im Hero wird zur Buildzeit aus dem Geburtsdatum in `lib/i18n.ts` gerechnet. Nach einem
Geburtstag ohne Rebuild bleibt die alte Zahl stehen.

**Die Palette wird in einem `useLayoutEffect` gesetzt, nicht in `useFrame`.** Die Uniforms des
Materials stehen per Default auf Schwarz; wer sie erst im Renderloop füllt, riskiert ein
schwarzes erstes Bild. Das war als kurzes Abdunkeln beim Laden und beim Sprachwechsel sichtbar.

**Im Dunkelmodus ist die Punktgrösse umgedreht** (`dotMin`/`dotRange` in `palette.ts`): dort
trägt die helle Haut das Bild, also bekommt sie die **grössten** Punkte und das dunkle Hemd die
kleinsten. Im Hellmodus ist es andersherum. Beide Poster werden mit derselben Zuordnung gebacken.

**Der Hautton ist absichtlich flach.** Die Vorlage hat einen Schatten im Gesicht, der als zwei
verschiedene Partikelfarben durchschlägt. `flattenTone()` in `particles.ts` faltet deshalb alles
unterhalb von `HERO_TONE_KNEE` (0.46) auf einen einzigen Wert `HERO_TONE_FLOOR` (0.08) zusammen
und hebt darüber mit `t^HERO_TONE_GAIN` an: Haut wird einfarbig, Haare, Brille, Brauen und
Schnauz bleiben. Der Exponent ist wichtig — ein Smoothstep hat direkt über dem Knie die Steigung
null, damit landete ein Ton von 0.5 bei 0.196 und war von der Haut (0.17) nicht zu unterscheiden.
Der Schnauz war schlicht weg. Kleinerer `GAIN` heisst mehr Trennung der Züge, kleineres `KNEE`
heisst mehr Modellierung im Gesicht. Jede Änderung braucht `npm run bake`.

**Regeln, die nicht gebrochen werden dürfen**

1. Der Canvas ist grösser als der Porträtrahmen, damit der Burst nicht an seiner Kante
   abgeschnitten wird. Wie viel grösser, entscheidet allein das CSS:
   `--hero-overscan: min(50%, (100vw - 100%) / 2)` in Hero.astro. Auf dem Desktop sind das 50 %
   pro Seite (Canvas doppelt so breit), auf dem Handy so viel, dass der Canvas genau bis zum
   Bildschirmrand reicht und **kein** seitlicher Überlauf entsteht. Die Insel misst das
   Verhältnis über einen `ResizeObserver` selbst, es gibt also keine zweite Zahl im JS,
   die synchron gehalten werden müsste.
2. Die Partikelfarben kommen aus `lib/hero/palette.ts` — **dieselbe** Datei, aus der die Poster
   gebacken werden. Darum können Poster und Canvas nicht auseinanderlaufen.
3. Farben werden als `Vector3` in sRGB übergeben, nie als `THREE.Color`: three linearisiert
   `Color` still (`ColorManagement` ist seit r152 an), der Shader schreibt aber direkt nach
   `gl_FragColor`. An einen eigenen `ShaderMaterial` hängt three r185 **keine**
   Colorspace-Konvertierung an — verifiziert in `WebGLProgram.js`, das
   `linearToOutputTexel` nur deklariert und nie aufruft.
4. `vite.resolve.dedupe: ['three']` muss bleiben: `drei → stats-gl` zieht eine zweite Kopie von
   `three` nach, und zwei Modulinstanzen brechen jedes `instanceof`.
5. `prefers-reduced-motion` ist ein eigener Pfad, kein Nachtrag: die Insel wird gar nicht erst
   geladen, das Poster bleibt stehen.

**Wenn das Feld sich nicht bewegt**

Die Insel wird bewusst nicht in jeder Umgebung geladen. Wird sie übersprungen, steht der Grund
im DOM auf `[data-hero-visual]`:

```js
document.querySelector('[data-hero-visual]').dataset.heroSkip
```

| Wert | Bedeutung |
|---|---|
| `undefined` | nicht übersprungen — die Insel läuft |
| `reduced-motion` | das System meldet „Bewegung reduzieren" (macOS: Systemeinstellungen → Bedienungshilfen → Anzeige → Bewegung reduzieren) |
| `no-webgl` | der Browser liefert keinen WebGL-Kontext, meist bei deaktivierter Hardwarebeschleunigung |
| `load-failed` | der Chunk konnte nicht geladen werden, Details in der Konsole |

`npm run test:e2e` fährt das in Chromium, WebKit und Firefox durch: mounten, Hover-Reaktion,
Klick-Burst, Rückfederung, Touch-Tap, und dass Reduced Motion beim Poster bleibt.

**Poster neu backen** — nötig nach jeder Änderung an `particles.ts` (Stride, Jitter, Punktgrösse,
Dissolve) oder an `palette.ts`:

```bash
npm run bake
```

Rendert `hero-poster-light.png` und `hero-poster-dark.png` mit derselben Sampling-Funktion, die
auch der Canvas benutzt. 25'782 Partikel bei Stride 2.

## Hell und Dunkel

Tokens über `light-dark()` in `global.css`, Systemvorgabe als Standard. Ein Inline-Script im
`<head>` setzt `data-theme` vor dem ersten Paint, wenn eine Wahl im `localStorage` liegt — darum
gibt es kein Aufblitzen.

Das Poster existiert in zwei Fassungen, geladen wird aber immer nur eine: `<picture>` wählt über
`prefers-color-scheme`, und ein zweites Inline-Script direkt hinter dem Element korrigiert die
Wahl, falls eine manuelle Einstellung gespeichert ist. Beim Umschalten zur Laufzeit tauscht
`syncPoster()` die Quelle.

Im Dunkelmodus ist die Tonwertzuordnung umgedreht: Tonwert 0 (helle Haut) wird hell, Tonwert 1
(dunkles Hemd) wird gedämpft. Die naive Umkehrung würde ein Negativ ergeben, in dem das Hemd
leuchtet und das Gesicht verschwindet.

## Farbe

Ein Akzent, aus dem Lebenslauf übernommen: dessen Akzentton `#2e7d9a` liegt auf dem warmen Papier
bei 4.45:1 und damit knapp unter AA, deshalb steht im Hellmodus `#26708c` (5.32:1) und im
Dunkelmodus `#5fb3d1` (8.29:1). Derselbe Ton trägt auch die Partikel unter dem Zeiger und im
Burst. Tinte und Papier sind unverändert; wer das Navy `#16304a` des Lebenslaufs auch als
Textfarbe will, tauscht `--fg` (12.93:1 auf dem Papier, geprüft).

## Zweisprachigkeit

`prefixDefaultLocale: true`, `redirectToDefaultLocale: **false**`. Das ist kein Versehen:
mit `true` erzeugt Astros i18n-Middleware selbst eine `/`-Route, verdrängt `src/pages/index.astro`
(Buildwarnung "conflicts with higher priority route") und schreibt ein
`<meta http-equiv="refresh" content="2;url=/de/">` — **zwei Sekunden Leerseite** auf der ersten
URL, die überhaupt jemand tippt. Astros Redirect-Template koppelt die Verzögerung an den
Statuscode (`delay = status === 302 ? 2 : 0`). Mit `false` gewinnt `src/pages/index.astro`, das
mit **301** weiterleitet, und die Verzögerung ist 0. Nach jeder Änderung an der i18n-Konfiguration
`cat dist/index.html` prüfen.

Deutsch ist die Quelle, `pick()` fällt bei leerem englischem Feld auf Deutsch zurück.

**`<ClientRouter />` überträgt die Attribute des `<html>`-Elements aus dem neuen Dokument.**
`data-theme` wird dort clientseitig gesetzt, steht also nicht im Server-HTML und ist nach jedem
Swap weg. Das Inline-Script im `<head>` hängt sich deshalb zusätzlich an `astro:after-swap` und
setzt es erneut, bevor gezeichnet wird. Ohne das wechselt der Sprachwechsel nebenbei das Theme.

**Jedes Setup-Script bindet höchstens einmal.** `astro:page-load` feuert auch beim ersten Laden;
zusammen mit einem `DOMContentLoaded`-Fallback bindet ein Handler zweimal, und beim Theme-Toggle
heben sich zwei Klick-Listener exakt auf: der Schalter tut dann gar nichts mehr. Alle Setups
merken sich deshalb das Element, an das sie gebunden haben, und steigen bei einem zweiten Aufruf
aus (`bound`, `installed`, `revealed`).

Der Sprachwechsel wirft den Leser nicht an den Seitenanfang zurück. `<ClientRouter />` macht
daraus einen DOM-Tausch statt eines Neuladens, und `lib/anchor.ts` merkt sich beim Klick den
obersten sichtbaren `<section id>` plus den Versatz darin in der `sessionStorage`. Wiederhergestellt
wird in **`astro:after-swap`**, also vor dem ersten Paint des neuen Dokuments: dadurch sieht man
nicht mehr kurz den Hero und scrollt dann. Abschnittsbasiert statt pixelbasiert, weil die deutschen
und englischen Texte unterschiedlich lang sind. Zwei Tests halten das fest: die Position bleibt auf
80 px genau erhalten, und der Scrollwert fällt während des Wechsels nie unter 200 px.

## Referenzprojekte erweitern

`work.references` in `src/content.ts` ist ein Array. Ein weiterer Eintrag (etwa die Feng-Shui-Seite,
sobald sie live ist) braucht keine Codeänderung — Name, URL, Rolle, Fliesstext, Stichpunkte,
jeweils DE und EN.

## Der Lebenslauf

`lib/cv.ts` löst den Link pro Sprache auf: `/cv-ben-braendle.pdf` für Deutsch,
`/cv-ben-braendle-en.pdf` für Englisch. Eine reine Zuordnung, **kein Zugriff auf das Dateisystem**:
`node:fs` gibt es in der Workers-Laufzeit nicht, und sobald der Cloudflare-Adapter im Spiel ist,
läuft das Prerendering genau dort. Statt eines stillen Rückfalls auf die deutsche Fassung lädt ein
Test für beide Sprachen die verlinkte URL und verlangt Status 200 mit PDF-Content-Type: fehlt eine
Datei, wird der Build rot statt heimlich falsch.

## Offen

- **Deployment:** Cloudflare Pages mit Git-Anbindung, Schritt für Schritt in
  [DEPLOY.md](DEPLOY.md). Bewusst **ohne** wrangler-Konfiguration im Repo. Der Build ist statisch,
  `dist/` läuft aber auf jedem Host.
- `public/cv-ben-braendle.pdf` ist die sanitisierte Fassung ohne Adresse und Telefonnummer. Das
  **Geburtsdatum steht noch drin**, bewusste Entscheidung, Stand 2026-08-05.
- Beide Lebensläufe liegen im Repo und sind damit öffentlich, bewusste Entscheidung.
  `lib/cv.ts` fällt automatisch auf die deutsche Fassung zurück, falls eine Sprachvariante fehlt.
- Kein Impressum: die Seite ist ein One-Pager ohne Unterseiten.
- Ein Kontaktformular ist vorgesehen, aber nicht gebaut. Der Kontaktblock ist so aufgebaut, dass
  eines darunter passt, ohne den Rest anzufassen.
