interface GisId {
  initialize(o: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: string; itp_support?: boolean }): void;
  renderButton(el: HTMLElement, o: Record<string, unknown>): void;
  disableAutoSelect(): void;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GisId } } & typeof globalThis.google;
  }
}

let loading: Promise<GisId> | null = null;

/** Loads Google Identity Services once, only when someone opens the login sheet. */
export function loadGis(): Promise<GisId> {
  const ready = () => window.google?.accounts?.id;
  if (ready()) return Promise.resolve(ready()!);
  loading ??= new Promise<GisId>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => (ready() ? resolve(ready()!) : reject(new Error('GIS unavailable')));
    s.onerror = () => {
      loading = null;
      reject(new Error('GIS load failed'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export async function renderGoogleButton(el: HTMLElement, clientId: string, lang: string, onCredential: (jwt: string) => void): Promise<void> {
  const gis = await loadGis();
  gis.initialize({ client_id: clientId, callback: (r) => onCredential(r.credential), itp_support: true });
  gis.renderButton(el, { theme: 'filled_black', shape: 'pill', size: 'large', text: 'continue_with', locale: lang, width: 260 });
}
