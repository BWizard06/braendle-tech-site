declare global {
  interface DocumentEventMap {
    themechange: CustomEvent<'light' | 'dark'>;
  }
}

export {};
