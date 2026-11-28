export const TURNSTILE_SITE_KEY =
	(import.meta.env.PUBLIC_TURNSTILE_SITE_KEY as string | undefined)?.trim() ?? '';

const TURNSTILE_SCRIPT_SRC =
	'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface TurnstileRenderOptions {
	sitekey: string;
	action?: string;
	appearance?: 'always' | 'execute' | 'interaction-only';
	execution?: 'render' | 'execute';
	callback?: (token: string) => void;
	'error-callback'?: (errorCode?: string) => boolean | void;
	'expired-callback'?: () => void;
	'timeout-callback'?: () => void;
}

interface TurnstileApi {
	render: (container: HTMLElement | string, options: TurnstileRenderOptions) => string;
	execute: (container?: HTMLElement | string, options?: Partial<TurnstileRenderOptions>) => void;
	reset: (widgetId?: string) => void;
	remove: (widgetId?: string) => void;
}

declare global {
	interface Window {
		turnstile?: TurnstileApi;
	}
}

interface WidgetCallbacks {
	onSuccess: ((token: string) => void) | null;
	onError: ((reason: string) => void) | null;
}

interface MountedWidget {
	widgetId: string;
	callbacks: WidgetCallbacks;
}

let scriptLoadPromise: Promise<TurnstileApi> | null = null;
const mountedWidgets = new WeakMap<HTMLElement, MountedWidget>();

export function hasTurnstileConfigured(): boolean {
	return TURNSTILE_SITE_KEY.length > 0;
}

function loadTurnstileApi(timeoutMs = 12000): Promise<TurnstileApi> {
	if (typeof window === 'undefined') {
		return Promise.reject(new Error('Verifica anti-bot disponibile solo nel browser.'));
	}

	if (window.turnstile) {
		return Promise.resolve(window.turnstile);
	}

	if (scriptLoadPromise) {
		return scriptLoadPromise;
	}

	scriptLoadPromise = new Promise<TurnstileApi>((resolve, reject) => {
		const timerId = window.setTimeout(() => {
			scriptLoadPromise = null;
			reject(
				new Error(
					'Impossibile caricare la verifica anti-bot Cloudflare (timeout). Disattiva eventuali blocchi script / ad-blocker per questa pagina e riprova: i tuoi dati non sono andati persi.'
				)
			);
		}, timeoutMs);

		const finishResolve = () => {
			if (window.turnstile) {
				window.clearTimeout(timerId);
				resolve(window.turnstile);
				return true;
			}
			return false;
		};

		const existing = document.querySelector<HTMLScriptElement>(
			'script[data-cisf-turnstile="true"]'
		);
		if (existing) {
			if (finishResolve()) return;
			existing.addEventListener('load', () => {
				if (!finishResolve()) {
					window.clearTimeout(timerId);
					scriptLoadPromise = null;
					reject(new Error('Libreria Cloudflare Turnstile non inizializzata. Riprova.'));
				}
			});
			existing.addEventListener('error', () => {
				window.clearTimeout(timerId);
				scriptLoadPromise = null;
				existing.remove();
				reject(
					new Error(
						'Impossibile caricare la verifica anti-bot Cloudflare. Disattiva eventuali ad-blocker o protezioni restrittive del browser e riprova: i tuoi dati sono salvi.'
					)
				);
			});
			return;
		}

		const script = document.createElement('script');
		script.src = TURNSTILE_SCRIPT_SRC;
		script.async = true;
		script.defer = true;
		script.dataset.cisfTurnstile = 'true';
		script.onload = () => {
			if (!finishResolve()) {
				window.clearTimeout(timerId);
				scriptLoadPromise = null;
				reject(new Error('Libreria Cloudflare Turnstile non disponibile dopo il caricamento.'));
			}
		};
		script.onerror = () => {
			window.clearTimeout(timerId);
			scriptLoadPromise = null;
			script.remove();
			reject(
				new Error(
					'Impossibile contattare Cloudflare Turnstile. Disattiva eventuali ad-blocker / estensioni anti-tracking per questa pagina e clicca di nuovo Invia: i tuoi dati sono salvi.'
				)
			);
		};
		document.head.appendChild(script);
	});

	return scriptLoadPromise;
}

/**
 * Obtains a fresh, single-use Cloudflare Turnstile token on demand (`execution: 'execute'`,
 * `appearance: 'interaction-only'`). Returns `''` immediately if `PUBLIC_TURNSTILE_SITE_KEY`
 * is not configured so local development and fallback deployments never break.
 */
export async function obtainTurnstileToken(
	container: HTMLElement | null,
	action: string,
	challengeTimeoutMs = 90000
): Promise<string> {
	if (!hasTurnstileConfigured()) {
		return '';
	}

	if (!container) {
		throw new Error(
			'Contenitore di verifica anti-bot non pronto nella pagina. Riprova tra un istante.'
		);
	}

	const api = await loadTurnstileApi();

	let mounted = mountedWidgets.get(container);
	if (!mounted) {
		const callbacks: WidgetCallbacks = {
			onSuccess: null,
			onError: null,
		};
		const widgetId = api.render(container, {
			sitekey: TURNSTILE_SITE_KEY,
			action,
			appearance: 'interaction-only',
			execution: 'execute',
			callback: (token: string) => {
				callbacks.onSuccess?.(token);
			},
			'error-callback': (code?: string) => {
				callbacks.onError?.(
					`Verifica anti-bot Cloudflare non riuscita${code ? ` (codice ${code})` : ''}. Riprova tra qualche secondo.`
				);
				return true;
			},
			'expired-callback': () => {
				callbacks.onError?.('Il controllo di sicurezza è scaduto: clicca di nuovo Invia.');
			},
			'timeout-callback': () => {
				callbacks.onError?.(
					'Tempo scaduto per la spunta di sicurezza Cloudflare: clicca di nuovo Invia.'
				);
			},
		});
		mounted = { widgetId, callbacks };
		mountedWidgets.set(container, mounted);
	}

	const activeWidget = mounted;

	return new Promise<string>((resolve, reject) => {
		const timerId = window.setTimeout(() => {
			activeWidget.callbacks.onSuccess = null;
			activeWidget.callbacks.onError = null;
			try {
				api.reset(activeWidget.widgetId);
			} catch {
				// Ignore widget reset errors
			}
			reject(
				new Error(
					'Verifica di sicurezza Cloudflare scaduta (attesa oltre 90 secondi). Se è comparsa la casella di verifica sopra il pulsante, spuntala e clicca di nuovo Invia: i tuoi dati sono salvi.'
				)
			);
		}, challengeTimeoutMs);

		activeWidget.callbacks.onSuccess = (token: string) => {
			window.clearTimeout(timerId);
			activeWidget.callbacks.onSuccess = null;
			activeWidget.callbacks.onError = null;
			resolve(token);
		};

		activeWidget.callbacks.onError = (reason: string) => {
			window.clearTimeout(timerId);
			activeWidget.callbacks.onSuccess = null;
			activeWidget.callbacks.onError = null;
			try {
				api.reset(activeWidget.widgetId);
			} catch {
				// Ignore widget reset errors
			}
			reject(new Error(reason));
		};

		try {
			api.reset(activeWidget.widgetId);
			api.execute(activeWidget.widgetId);
		} catch (execErr) {
			window.clearTimeout(timerId);
			activeWidget.callbacks.onSuccess = null;
			activeWidget.callbacks.onError = null;
			reject(
				new Error(
					(execErr as Error).message ||
						'Impossibile avviare la verifica di sicurezza Cloudflare. Riprova.'
				)
			);
		}
	});
}

export function cleanupTurnstileContainer(container: HTMLElement | null): void {
	if (!container || typeof window === 'undefined' || !window.turnstile) return;
	const mounted = mountedWidgets.get(container);
	if (!mounted) return;
	try {
		window.turnstile.remove?.(mounted.widgetId);
	} catch {
		// Ignore cleanup errors
	}
	mountedWidgets.delete(container);
}
