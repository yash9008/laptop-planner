const paths = {
  home:'m3 10 9-7 9 7v10H3V10Zm6 10v-7h6v7', today:'M9 6h12M9 12h12M9 18h12M3 6l1 1 2-2M3 12l1 1 2-2M3 18l1 1 2-2',
  focus:'M4 5h13v10H4V5Zm13 2h2a3 3 0 0 1 0 6h-2M2 20h18', archive:'M3 4h18v4H3V4Zm2 4v12h14V8M9 12h6',
  sidebar:'M3 4h18v16H3V4Zm6 0v16', filter:'M3 5h18M6 12h12M10 19h4', board:'M3 4h18v16H3V4Zm6 0v16m6-16v16', search:'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5 12 6 6',

  play: 'm8 4 13 8-13 8V4Z', pause: 'M8 4v16M16 4v16', repeat: 'm17 2 4 4-4 4M3 11V8a2 2 0 0 1 2-2h16M7 22l-4-4 4-4m14-1v3a2 2 0 0 1-2 2H3',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5',
  calendar: 'M5 5h14a2 2 0 0 1 2 2v13H3V7a2 2 0 0 1 2-2ZM7 2v6m10-6v6M3 11h18M7 15h3m4 0h3',
  plus: 'M12 5v14M5 12h14', left: 'm14 6-6 6 6 6', right: 'm10 6 6 6-6 6',
  up: 'm6 14 6-6 6 6', down: 'm6 10 6 6 6-6',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v6h4',
  check: 'm5 12 4 4L19 6', close: 'm6 6 12 12M6 18 18 6',
  trash: 'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',
  grip: 'M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01',
  dots: 'M5 12h.01M12 12h.01M19 12h.01',
  leaf: 'M19 3C7 3 3 8 5 14s13 6 14-11ZM5 19l9-9',
  settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-6v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2',
  storage: 'M4 4h16v16H4V4Zm0 8h16M8 8h.01M8 16h.01',
  arrow: 'M5 12h14m-5-5 5 5-5 5', note: 'M5 3h14v18H5V3Zm4 5h6m-6 4h6m-6 4h4',
} as const;
export function Icon({ name, size = 20 }: { name: keyof typeof paths; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
