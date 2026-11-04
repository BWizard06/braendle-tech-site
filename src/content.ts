import type { Localized } from './lib/i18n';

// No public email address: the contact form replaces it.
export const CONTACT = {
  linkedin: 'https://www.linkedin.com/in/ben-br%C3%A4ndle-55a4a42a0/',
} as const;

export interface StackGroup {
  label: Localized;
  items: string[];
  /** What the 3D Ben says when he stands on this row. */
  say?: Localized;
}

export interface Reference {
  id: string;
  name: string;
  url: string;
  source?: string;
  image: string;
  imageWidth: number;
  imageHeight: number;
  alt: Localized;
  role: Localized;
  body: Localized;
  bullets: Localized[];
  visitLabel?: Localized;
  note?: Localized;
  tags?: string[];
  /** What the 3D Ben says when he stands at this project. */
  say?: Localized;
}

export const meta = {
  title: {
    de: 'Ben Brändle, Fullstack Developer in Zürich',
    en: 'Ben Brändle, fullstack developer near Zurich',
  },
  description: {
    de: 'Fullstack Developer aus Herrliberg bei Zürich. TypeScript, Vue, Nuxt, React, Astro, Go, Docker und CI/CD. Websites und Web-Apps vom Interface bis zum Server.',
    en: 'Fullstack developer near Zurich, Switzerland. TypeScript, Vue, Nuxt, React, Astro, Go, Docker and CI/CD. Websites and web apps from the interface to the server.',
  },
  skip: { de: 'Zum Inhalt springen', en: 'Skip to content' },
  home: { de: 'Startseite', en: 'Home' },
  languageName: { de: 'Deutsch', en: 'English' },
  toLight: { de: 'Zur hellen Ansicht wechseln', en: 'Switch to the light view' },
  toDark: { de: 'Zur dunklen Ansicht wechseln', en: 'Switch to the dark view' },
} satisfies Record<string, Localized>;

export const hero = {
  name: 'Ben Brändle',
  lineAccent: { de: 'Fullstack', en: 'Fullstack' },
  lineAfter: {
    de: ' Developer',
    en: ' developer',
  },
  intro: {
    de: 'Ich entwickle Websites und Web-Apps von der Benutzeroberfläche über das Backend bis hin zum Betrieb auf der Serverinfrastruktur. Abgeschlossene Informatikmittelschule in Zürich, Berufserfahrung als Softwareentwickler.',
    en: 'I develop websites and web apps, from the user interface to the backend and on to deployment on the server infrastructure. I graduated from a secondary school specializing in computer science in Zurich and have professional experience as a software developer.',
  },
  alt: {
    de: 'Ben Brändle, ein Porträt aus einzelnen Partikeln gezeichnet',
    en: 'Ben Brändle, a portrait drawn out of individual particles',
  },
} satisfies Record<string, string | Localized>;

export const stack = {
  kicker: { de: 'Technologien', en: 'Technologies' },
  say: { de: 'Damit arbeite ich am liebsten.', en: 'These are my favourite tools.' },
  framing: {
    de: 'Am stärksten im TypeScript-Umfeld mit unterschiedlichen Frameworks. Go als Hauptsprache im Backend.',
    en: 'Strongest in the TypeScript world, across different frameworks. Go as my main backend language.',
  },
  groups: [
    {
      label: { de: 'Interface', en: 'Interface' },
      items: ['TypeScript', 'JavaScript', 'Vue', 'Nuxt', 'React', 'Next.js', 'Astro'],
      say: { de: 'Alles, was man im Browser sieht und anklickt.', en: 'Everything you see and click in the browser.' },
    },
    {
      label: { de: 'Backend und Daten', en: 'Backend and data' },
      items: ['Go', 'SQL', 'NoSQL'],
      say: { de: 'Logik, Schnittstellen und Daten hinter der Oberfläche.', en: 'Logic, APIs and data behind the interface.' },
    },
    {
      label: { de: 'Betrieb und Deployment', en: 'Operations and deployment' },
      items: ['Docker', 'Debian', 'Traefik', 'Authelia', 'CI/CD'],
      say: { de: 'Vom Code bis auf den Server.', en: 'From the code all the way to the server.' },
    },
    {
      label: { de: 'KI', en: 'AI' },
      items: ['Claude Code', 'ChatGPT', 'OpenRouter', 'Higgsfield AI', 'Lumo AI'],
      say: { de: 'KI gehört fest in meinen Werkzeugkasten.', en: 'AI is a fixed part of my toolkit.' },
    },
    {
      label: { de: 'Design', en: 'Design' },
      items: ['Figma'],
      say: { de: 'Wie es aussieht, bevor es gebaut wird.', en: 'How it looks before it gets built.' },
    },
  ] satisfies StackGroup[],
};

export const work = {
  kicker: { de: 'Projekte', en: 'Projects' },
  intro: {
    de: 'Kundenprojekte mit Gesamtverantwortung und persönliche Projekte aus eigener Begeisterung.',
    en: 'Client projects with end-to-end responsibility and personal projects driven by my own interests.',
  },
  visit: { de: 'Website ansehen', en: 'Visit the site' },
  source: { de: 'Code auf GitHub', en: 'Code on GitHub' },
  references: [
    {
      id: 'corelation',
      name: 'CoRelation GmbH',
      url: 'https://corelation.ch/',
      source: 'https://github.com/BWizard06/corelation',
      image: '/images/corelation-homepage.webp',
      imageWidth: 1280,
      imageHeight: 720,
      alt: {
        de: 'Startseite von CoRelation mit rotem Hintergrund, Logo und «From Insight to Impact»',
        en: 'CoRelation homepage with a red background, the logo and “From Insight to Impact”',
      },
      role: {
        de: 'Relaunch der Firmenwebsite, 08/2025 bis 11/2025, live seit 11/2025',
        en: 'Company website relaunch, August to November 2025, live since 11/2025',
      },
      body: {
        de: 'Kompletter Relaunch: von der Analyse der bestehenden Seite über Konzept und Gestaltung bis zu Umsetzung, Test und Liveschaltung.',
        en: 'A complete relaunch: from analysing the existing site through concept and design to build, testing and go-live.',
      },
      bullets: [
        {
          de: 'Bestehende Seite analysiert und die Schwächen in Struktur, Inhalt und Nutzerführung benannt.',
          en: 'Analysed the existing site and named the weak points in structure, content and user guidance.',
        },
        {
          de: 'Ziele, Zielgruppen und Anforderungen erhoben und in konkrete Anforderungen übersetzt.',
          en: 'Gathered goals, audiences and requirements and translated them into specific requirements.',
        },
        {
          de: 'Design und Informationsarchitektur entwickelt und über mehrere Feedbackrunden geschärft.',
          en: 'Developed the design and information architecture, then sharpened both over several rounds of feedback.',
        },
        {
          de: 'Umsetzung inklusive Responsive-Verhalten, Performance und Tests über Geräte und Browser hinweg.',
          en: 'Built the site, including responsive behaviour, performance and testing across devices and browsers.',
        },
      ],
      say: { de: 'Website einer Kommunikationsagentur.', en: 'Website for a communications agency.' },
    },
    {
      id: 'kati-schepis',
      name: 'Kati Schepis · Feng Shui',
      url: 'https://katischepis.ch/',
      source: 'https://github.com/BWizard06/fengshui',
      image: '/images/fengshui-homepage.webp',
      imageWidth: 1280,
      imageHeight: 720,
      alt: {
        de: 'Startseite von Kati Schepis mit dem Begrüssungstext und einem hellen Wohnraum',
        en: 'Kati Schepis homepage with a welcome message and a bright living room',
      },
      role: {
        de: 'Neuer Webauftritt für Feng-Shui-Beratung, live seit 10/2026',
        en: 'New website for a Feng Shui consultancy, live since 10/2026',
      },
      body: {
        de: 'Individuell entwickelter Webauftritt für Kati Schepis. Gesamtverantwortung von Konzept und Gestaltung über die Umsetzung bis zu Domain, E-Mail und Liveschaltung.',
        en: 'A custom website for Kati Schepis. End-to-end responsibility, from concept and design through development to domain setup, email and go-live.',
      },
      bullets: [
        {
          de: 'Seitenstruktur und responsives Design auf Basis der Markenwelt entwickelt und in Feedbackrunden abgestimmt.',
          en: 'Developed the site structure and responsive design around the brand identity, refining both through feedback rounds.',
        },
        {
          de: 'Website mit Astro, TypeScript und React umgesetzt, inklusive Blog und interaktivem Ba Gua.',
          en: 'Built the website with Astro, TypeScript and React, including a blog and an interactive Ba Gua.',
        },
        {
          de: 'Kontaktformular mit Resend und Newsletter mit Mailchimp angebunden, inklusive Bestätigung per E-Mail.',
          en: 'Connected the contact form to Resend and the newsletter to Mailchimp, including email confirmation.',
        },
        {
          de: 'Domain-Übertragung, geschäftliche E-Mail-Adresse und Hosting auf Cloudflare eingerichtet.',
          en: 'Set up the domain transfer, business email address and hosting on Cloudflare.',
        },
        {
          de: 'SEO-Grundlagen umgesetzt, auf verschiedenen Geräten und Browsern getestet und live geschaltet.',
          en: 'Implemented SEO basics, tested across devices and browsers, and took the site live.',
        },
      ],
      tags: ['Astro', 'TypeScript', 'React', 'Cloudflare', 'Resend', 'Mailchimp'],
      say: { de: 'Website einer Feng-Shui-Beraterin.', en: 'Website for a Feng Shui consultant.' },
    },
  ] satisfies Reference[],
};

export const projectCategories = {
  client: { de: 'Kundenprojekte', en: 'Client projects' },
  personal: { de: 'Persönliche Projekte', en: 'Personal projects' },
};

export const personalProjects: Reference[] = [
  {
    id: 'lacuna',
    name: 'LACUNA',
    url: 'https://lacuna.braendle.tech/',
    source: 'https://github.com/BWizard06/Lacuna',
    image: '/images/lacuna-homepage.webp',
    imageWidth: 1265,
    imageHeight: 712,
    alt: {
      de: 'Startseite von LACUNA: eine Villa aus Holz und Naturstein über einem See im Abendlicht, mit «A world of your own.»',
      en: 'LACUNA homepage: a villa of wood and natural stone above a lake at sunset, with “A world of your own.”',
    },
    role: { de: 'Interaktive Villa-Website', en: 'Interactive villa website' },
    body: {
      de: 'Eine fiktive Luxusvilla im Tessin, als interaktive Website gestaltet. Vom Eingang bis zur Poolterrasse: Eine scrollgesteuerte Kamerafahrt, dezent bewegte Bilder und ein interaktiver Grundriss machen das Haus erlebbar.',
      en: 'A fictional luxury villa in Ticino, designed as an interactive website. From the entrance to the pool terrace: a scroll-driven camera journey, subtly moving images and an interactive floor plan bring the house to life.',
    },
    bullets: [],
    note: {
      de: 'Ein persönliches Konzeptprojekt, keine tatsächlich buchbare Unterkunft.',
      en: 'A personal concept project, not a place you can actually book.',
    },
    tags: ['Astro', 'TypeScript', 'Tailwind CSS', 'Scroll Animation', 'Higgsfield', 'Codex'],
    say: { de: 'Eine fiktive Villa im Tessin.', en: 'A fictional villa in Ticino.' },
  },
  {
    id: 'daytona',
    name: 'Daytona Experience',
    url: 'https://daytona.braendle.tech/',
    source: 'https://github.com/BWizard06/daytona-experience',
    image: '/images/daytona-homepage.webp',
    imageWidth: 1265,
    imageHeight: 712,
    alt: {
      de: 'Startseite der Daytona Experience mit einem Rennwagen und «Where every second matters»',
      en: 'Daytona Experience homepage with a racing car and “Where every second matters”',
    },
    role: { de: 'Interaktive Experience', en: 'Interactive experience' },
    body: {
      de: 'Eine meiner Lieblingsuhren, als interaktive Reise erzählt. Vom Rennsport bis ins Uhrwerk: Scrollen steuert die Szenen, Übergänge und Perspektiven.',
      en: 'One of my favourite watches, told as an interactive journey. From motor racing to the movement: scrolling controls the scenes, transitions and perspectives.',
    },
    bullets: [],
    note: {
      de: 'Ein persönliches Fanprojekt, unabhängig von Rolex.',
      en: 'A personal fan project, independent of Rolex.',
    },
    tags: ['Astro', 'JavaScript', 'Scroll Animation', 'Higgsfield', 'Codex'],
    say: { de: 'Eine Uhr als Scroll-Erlebnis.', en: 'A watch as a scroll experience.' },
  },
];

/** Speech bubbles of the 3D Ben (stations and rows carry their own lines). */
export const companion = {
  hint: { de: 'Psst … klick mich mal an!', en: 'Psst … try clicking me!' },
  hintTouch: { de: 'Psst … tipp mich mal an!', en: 'Psst … try tapping me!' },
  contact: { de: 'Schreib mir, ich freu mich!', en: 'Drop me a line!' },
  thanks: { de: 'Danke für deine Nachricht!', en: 'Thanks for your message!' },
  tricks: {
    dance_06: { de: 'Kurze Tanzpause!', en: 'Quick dance break!' },
    flip: { de: 'Hab ich lange geübt.', en: 'Took me ages to learn.' },
    front_kick_02: { de: 'Hiyaa!', en: 'Hiyaa!' },
    'press-up': { de: 'Zwischendurch ein paar Liegestütze.', en: 'Time for a few push-ups.' },
    play_video_game: { de: 'Nur noch eine Runde!', en: 'Just one more round!' },
  },
} satisfies Record<string, Localized | Record<string, Localized>>;

export const contact = {
  kicker: { de: 'Kontakt', en: 'Contact' },
  lead: {
    de: 'Projekte, Kooperationen oder berufliche Anfragen: Schreib mir direkt hier.',
    en: 'Projects, collaborations or job inquiries: send me a message right here.',
  },
  write: { de: 'Nachricht schreiben', en: 'Write a message' },
  form: {
    name: { de: 'Name', en: 'Name' },
    email: { de: 'E-Mail', en: 'Email' },
    message: { de: 'Nachricht', en: 'Message' },
    submit: { de: 'Nachricht senden', en: 'Send message' },
    privacy: {
      de: 'Ich nutze deine Angaben nur, um dir zu antworten.',
      en: 'I only use your details to reply to you.',
    },
    sending: { de: 'Wird gesendet …', en: 'Sending …' },
    success: {
      de: 'Danke! Deine Nachricht ist angekommen, ich melde mich bald.',
      en: 'Thank you! Your message has arrived, I’ll get back to you soon.',
    },
    invalid: {
      de: 'Bitte prüfe Name, E-Mail und Nachricht (mindestens 10 Zeichen).',
      en: 'Please check your name, email and message (at least 10 characters).',
    },
    limited: {
      de: 'Du hast in der letzten Stunde schon drei Nachrichten geschickt. Versuch es in {minutes} Min. wieder oder schreib mir auf LinkedIn.',
      en: 'You’ve already sent three messages in the last hour. Try again in {minutes} min or message me on LinkedIn.',
    },
    failed: {
      de: 'Das hat leider nicht geklappt. Versuch es später nochmals oder schreib mir auf LinkedIn.',
      en: 'Sorry, that didn’t work. Please try again later or message me on LinkedIn.',
    },
  },
  linkedin: { de: 'LinkedIn', en: 'LinkedIn' },
  cv: { de: 'Lebenslauf (PDF)', en: 'CV (PDF)' },
  location: { de: 'Herrliberg bei Zürich, Schweiz', en: 'Herrliberg near Zurich, Switzerland' },
};
