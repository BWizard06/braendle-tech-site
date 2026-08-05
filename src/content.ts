import { ageInYears, type Localized } from './lib/i18n';

const AGE = ageInYears(new Date());

export const CONTACT = {
  email: 'ben@braendle.tech',
  linkedin: 'https://www.linkedin.com/in/ben-br%C3%A4ndle-55a4a42a0/',
} as const;

export interface StackGroup {
  label: Localized;
  items: string[];
}

export interface Reference {
  name: string;
  url: string;
  role: Localized;
  body: Localized;
  bullets: Localized[];
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
  lineBefore: { de: `${AGE} Jahre alt,`, en: `${AGE} years old,` },
  lineAccent: { de: 'Fullstack', en: 'fullstack' },
  lineAfter: {
    de: ' Developer aus Herrliberg bei Zürich.',
    en: ' developer near Zurich, Switzerland.',
  },
  intro: {
    de: 'Ich baue Websites und Web-Apps: vom Interface über das Backend bis zum Server, auf dem sie laufen. Ausgebildet an der Informatikmittelschule, danach Entwickler bei der Digio AG.',
    en: 'I build websites and web apps: from the interface through the backend to the server they run on. Trained at the Informatikmittelschule, then a developer at Digio AG.',
  },
  alt: {
    de: 'Ben Brändle, ein Porträt aus einzelnen Partikeln gezeichnet',
    en: 'Ben Brändle, a portrait drawn out of individual particles',
  },
} satisfies Record<string, string | Localized>;

export const stack = {
  kicker: { de: 'Womit ich arbeite', en: 'What I work with' },
  framing: {
    de: 'Am stärksten im TypeScript-Umfeld mit unterschiedlichen Frameworks. Go als Hauptsprache im Backend.',
    en: 'Strongest in the TypeScript world, across different frameworks. Go as my main backend language.',
  },
  groups: [
    {
      label: { de: 'Interface', en: 'Interface' },
      items: ['TypeScript', 'JavaScript', 'Vue', 'Nuxt', 'React', 'Next.js', 'Astro'],
    },
    {
      label: { de: 'Backend und Daten', en: 'Backend and data' },
      items: ['Go', 'SQL', 'NoSQL'],
    },
    {
      label: { de: 'Betrieb und Deployment', en: 'Operations and deployment' },
      items: ['Docker', 'Debian', 'Traefik', 'Authelia', 'CI/CD'],
    },
    {
      label: { de: 'KI', en: 'AI' },
      items: ['Claude', 'Claude Code', 'ChatGPT', 'Higgsfield AI'],
    },
    {
      label: { de: 'Entwurf', en: 'Design' },
      items: ['Figma'],
    },
  ] satisfies StackGroup[],
};

export const work = {
  kicker: { de: 'Referenz', en: 'Reference' },
  intro: {
    de: 'Ein Projekt, Gesamtverantwortung von der Analyse bis zur Liveschaltung.',
    en: 'One project I owned on my own, from the first analysis through to go-live.',
  },
  visit: { de: 'Website ansehen', en: 'Visit the site' },
  references: [
    {
      name: 'CoRelation GmbH',
      url: 'https://corelation.ch/',
      role: {
        de: 'Relaunch der Firmenwebsite, 08/2025 bis 11/2025, live seit 11/2025',
        en: 'Company website relaunch, August to November 2025, live since 11/2025',
      },
      body: {
        de: 'Kompletter Relaunch: von der Analyse der bestehenden Seite über Konzept und Gestaltung bis zu Umsetzung, Test und Liveschaltung. Ich war allein auf dem Projekt und für Beratung, Gestaltung und Entwicklung zuständig.',
        en: 'A complete relaunch: from analysing the existing site through concept and design to build, testing and go-live. I was alone on the project and responsible for consulting, design and development.',
      },
      bullets: [
        {
          de: 'Bestehende Seite analysiert und die Schwächen in Struktur, Inhalt und Nutzerführung benannt.',
          en: 'Analysed the existing site and named the weak points in structure, content and user guidance.',
        },
        {
          de: 'Ziele, Zielgruppen und Anforderungen im direkten Gespräch mit dem Kunden erhoben und in konkrete Vorgaben übersetzt.',
          en: 'Collected goals, audiences and requirements in direct conversation with the client and turned them into concrete specifications.',
        },
        {
          de: 'Gestaltung und Informationsarchitektur entwickelt und über mehrere Feedbackrunden geschärft.',
          en: 'Developed the design and information architecture, then sharpened both over several rounds of feedback.',
        },
        {
          de: 'Umsetzung inklusive Responsive-Verhalten, Performance und Tests über Geräte und Browser hinweg.',
          en: 'Built the site, including responsive behaviour, performance and testing across devices and browsers.',
        },
      ],
    },
  ] satisfies Reference[],
};

export const contact = {
  kicker: { de: 'Kontakt', en: 'Contact' },
  lead: {
    de: 'Für ein Projekt, eine Zusammenarbeit oder eine konkrete Frage: am schnellsten per E-Mail.',
    en: 'For a project, a collaboration or a specific question, email is the fastest way.',
  },
  mail: { de: 'E-Mail Kontakt', en: 'E-Mail Contact' },
  linkedin: { de: 'LinkedIn', en: 'LinkedIn' },
  cv: { de: 'Lebenslauf (PDF)', en: 'CV (PDF)' },
  location: { de: 'Herrliberg bei Zürich, Schweiz', en: 'Herrliberg near Zurich, Switzerland' },
};
