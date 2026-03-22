const isDev = import.meta.env.DEV === true;

export const logger = {
  log: (...args: unknown[]): void => { if (isDev) console.log(...args); },
  warn: (...args: unknown[]): void => { if (isDev) console.warn(...args); },
  error: (...args: unknown[]): void => { console.error(...args); },
  group: (label: string): void => { if (isDev) console.group(label); },
  groupEnd: (): void => { if (isDev) console.groupEnd(); },
};
