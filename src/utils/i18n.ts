// @ts-check
import languagesConfig from '../config/languages.json';
import { getCmsData } from '../data/cms';

export interface LanguageInfo {
	code: string;
	name: string;
	badge: string;
	htmlLang?: string;
}

export const defaultLocale = 'it';

// Auto-discover language folders dynamically from CMS files
const cmsModules = import.meta.glob('../data/cms/*/*.json', { eager: true });
const discoveredCodes = new Set<string>();

for (const path of Object.keys(cmsModules)) {
	const match = path.match(/\/data\/cms\/([^/]+)\/([^/]+)\.json$/);
	if (match) {
		const folder = match[1];
		// A valid translation folder has conference.json and home.json
		if (
			path.endsWith(`/${folder}/conference.json`) &&
			`../data/cms/${folder}/home.json` in cmsModules
		) {
			discoveredCodes.add(folder);
		}
	}
}

const knownLangsMap = new Map<string, LanguageInfo>(languagesConfig.map((l) => [l.code, l]));

export const languages: LanguageInfo[] = Array.from(
	new Set([defaultLocale, ...languagesConfig.map((l) => l.code), ...discoveredCodes])
).map((code) => {
	const known = knownLangsMap.get(code);
	if (known) return known;
	return {
		code,
		name: code.toUpperCase(),
		badge: code.toUpperCase(),
		htmlLang: code,
	};
});

export const supportedLocales = languages.map((l) => l.code);
export type Locale = string;

/**
 * Resolves the active locale from Astro context or a locale string, falling back to defaultLocale ('it')
 */
export function getLocale(
	astroOrLocale?: { currentLocale?: string | null } | string | null
): string {
	const loc =
		typeof astroOrLocale === 'object' && astroOrLocale !== null
			? astroOrLocale.currentLocale
			: astroOrLocale;
	if (loc && supportedLocales.includes(loc)) {
		return loc;
	}
	return defaultLocale;
}

/**
 * Returns raw namespace catalog for a locale, falling back to default locale
 */
export function getNamespace<T = Record<string, unknown>>(
	namespace: string,
	locale: string = defaultLocale
): T {
	const cms = getCmsData(locale);
	return ((cms as Record<string, unknown>)[namespace] ?? {}) as T;
}

/**
 * Hook to access translations for a given locale
 */
export function useTranslations(locale: string = defaultLocale) {
	const currentLang = supportedLocales.includes(locale) ? locale : defaultLocale;
	const cms = getCmsData(currentLang);

	function t(key: string, fallbackText?: string): string {
		const parts = key.split('.');
		if (parts.length < 2) return fallbackText ?? key;
		const [namespace, ...path] = parts;
		const ns = (cms as Record<string, unknown>)[namespace];
		if (!ns) return fallbackText ?? key;
		let val: unknown = ns;
		for (const p of path) {
			if (val == null || typeof val !== 'object') return fallbackText ?? key;
			val = (val as Record<string, unknown>)[p];
		}
		return typeof val === 'string' ? val : (fallbackText ?? key);
	}

	return {
		locale: currentLang,
		t,
		raw: <T = Record<string, unknown>>(namespace: string) =>
			getNamespace<T>(namespace, currentLang),
	};
}

/**
 * Normalizes a base URL and relative path
 */
const BASE_URL = (import.meta.env.BASE_URL || '/cisf27').replace(/\/+$/, '');

/**
 * Generates localized route URL
 * Default locale 'it' -> /cisf27/path
 * Other locale 'en'    -> /cisf27/en/path
 */
export function getLocalizedHref(path: string = '', locale: string = defaultLocale): string {
	if (!path) {
		const targetLang = supportedLocales.includes(locale) ? locale : defaultLocale;
		return targetLang === defaultLocale ? `${BASE_URL}/` : `${BASE_URL}/${targetLang}/`;
	}
	if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('#')) {
		return path;
	}

	const queryIdx = path.indexOf('?');
	const hashIdx = path.indexOf('#');
	const splitIdx =
		queryIdx !== -1 && hashIdx !== -1
			? Math.min(queryIdx, hashIdx)
			: queryIdx !== -1
				? queryIdx
				: hashIdx;

	const suffix = splitIdx !== -1 ? path.slice(splitIdx) : '';
	const rawPath = splitIdx !== -1 ? path.slice(0, splitIdx) : path;

	let clean = rawPath.replace(/^\/+/, '');

	// Strip existing base prefix if passed
	const cleanBase = BASE_URL.replace(/^\/+/, '');
	if (cleanBase && (clean === cleanBase || clean.startsWith(cleanBase + '/'))) {
		clean = clean.slice(cleanBase.length).replace(/^\/+/, '');
	}

	// Strip existing locale prefix if passed
	for (const loc of supportedLocales) {
		if (clean === loc) {
			clean = '';
			break;
		}
		if (clean.startsWith(loc + '/')) {
			clean = clean.slice(loc.length + 1);
			break;
		}
	}

	const targetLang = supportedLocales.includes(locale) ? locale : defaultLocale;

	const baseRoute =
		targetLang === defaultLocale
			? clean
				? `${BASE_URL}/${clean}`
				: `${BASE_URL}/`
			: clean
				? `${BASE_URL}/${targetLang}/${clean}`
				: `${BASE_URL}/${targetLang}/`;

	return `${baseRoute}${suffix}`;
}

/**
 * Switches the locale of a given pathname, preserving sub-path
 */
export function switchLocalePath(pathname: string, targetLocale: string): string {
	let path = pathname.split('?')[0].split('#')[0];

	// Remove base URL prefix
	if (BASE_URL && path.startsWith(BASE_URL)) {
		path = path.slice(BASE_URL.length);
	}

	// Remove leading slash
	path = path.replace(/^\/+/, '');

	// Remove current locale prefix
	for (const loc of supportedLocales) {
		if (loc !== defaultLocale) {
			if (path === loc) {
				path = '';
				break;
			}
			if (path.startsWith(loc + '/')) {
				path = path.slice(loc.length + 1);
				break;
			}
		}
	}

	return getLocalizedHref(path, targetLocale);
}
