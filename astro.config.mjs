// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

import svelte from '@astrojs/svelte';

const currentTime = new Date();

// https://astro.build/config
export default defineConfig({
	vite: {
		plugins: [tailwindcss()],
	},
	site: 'https://ai-sf.it',
	base: '/cisf27',
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
