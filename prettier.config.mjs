/** @type {import('prettier').Config} */
export default {
	semi: true,
	singleQuote: true,
	trailingComma: 'es5',
	printWidth: 100,
	tabWidth: 2,

	plugins: ['prettier-plugin-astro', 'prettier-plugin-svelte', 'prettier-plugin-tailwindcss'],

	astroAllowShorthand: true,

	svelteAllowShorthand: true,
	svelteSortOrder: 'options-scripts-markup-styles',
	svelteIndentScriptAndStyle: true,

	overrides: [
		{
			files: '*.astro',
			options: {
				parser: 'astro',
			},
		},
		{
			files: '*.svelte',
			options: {
				parser: 'svelte',
			},
		},
		{
			files: '*.{ts,tsx}',
			options: {
				parser: 'typescript',
			},
		},
	],
};
