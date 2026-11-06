declare global {
  interface Window {
    turnstile?: {
      render(el: HTMLElement, opts: Record<string, unknown>): string;
      remove(id: string): void;
      reset(id: string): void;
    };
  }
}

let loading: Promise<void> | null = null;

/** Loads Cloudflare Turnstile once (only when an anonymous visitor opens the review form). */
export function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error('turnstile load failed'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export interface TurnstileWidget {
  /** Tokens are single-use: call after every submit attempt. */
  reset(): void;
  remove(): void;
}

export async function renderTurnstile(el: HTMLElement, sitekey: string, onToken: (t: string | null) => void): Promise<TurnstileWidget> {
  await loadTurnstile();
  const id = window.turnstile!.render(el, {
    sitekey,
    theme: 'dark',
    appearance: 'interaction-only',
    language: document.documentElement.lang || 'uk',
    callback: (t: string) => onToken(t),
    'expired-callback': () => onToken(null),
    'error-callback': () => onToken(null),
  });
  return { reset: () => window.turnstile?.reset(id), remove: () => window.turnstile?.remove(id) };
}
