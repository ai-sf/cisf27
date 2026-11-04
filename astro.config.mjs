// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import svelte from '@astrojs/svelte';
import fs from 'node:fs';
import path from 'node:path';

const currentTime = new Date();
const defaultLocale = 'it';

// 1. Read configured languages array
/** @type {Array<{ code: string }>} */
const configuredLanguages = JSON.parse(
	fs.readFileSync(new URL('./src/config/languages.json', import.meta.url), 'utf8')
);

// 2. Auto-discover any additional language directories in src/locales/
const localesDir = path.resolve('src/locales');

const discoveredLocales = fs.existsSync(localesDir)
	? fs
			.readdirSync(localesDir, { withFileTypes: true })
			.filter((dirent) => dirent.isDirectory() && dirent.name !== defaultLocale)
			.map((dirent) => dirent.name)
			.filter((dir) => {
				const dirPath = path.join(localesDir, dir);
				return (
					fs.existsSync(path.join(dirPath, 'conference.json')) &&
					fs.existsSync(path.join(dirPath, 'home.json'))
				);
			})
	: [];

const allLocales = Array.from(
	new Set([defaultLocale, ...configuredLanguages.map((l) => l.code), ...discoveredLocales])
);

const fallback = Object.fromEntries(
	allLocales.filter((locale) => locale !== defaultLocale).map((locale) => [locale, defaultLocale])
);

// https://astro.build/config
export default defineConfig({
	vite: {
		plugins: [tailwindcss()],
	},
	site: 'https://ai-sf.it',
	base: '/cisf27',
	i18n: {
		defaultLocale,
		locales: allLocales,
		routing: {
			prefixDefaultLocale: false,
			fallbackType: 'rewrite',
		},
		// @ts-ignore - Dynamic locales fallback mapping
		fallback,
	},
	integrations: [
		sitemap({
			serialize(item) {
				const itemURL = new URL(item.url);

				item.lastmod = currentTime.toString();
				// @ts-ignore
				item.changefreq = 'monthly';
				item.priority = 0.5;
				if (
					itemURL.pathname === '/cisf27' ||
					itemURL.pathname === '/cisf27/' ||
					itemURL.pathname === '/'
				) {
					item.priority = 1.0;
				} else {
					item.priority = 0.7;
				}

				return item;
			},
		}),
		svelte(),
	],
	prefetch: true,
	output: 'static',
});
