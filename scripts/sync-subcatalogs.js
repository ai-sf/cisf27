#!/usr/bin/env node
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT_DIR = resolve('.');
const CMS_DIR = join(ROOT_DIR, 'src', 'data', 'cms');
const BASE_LANG = 'it';
const BASE_DIR = join(CMS_DIR, BASE_LANG);
const INLANG_SETTINGS_PATH = join(ROOT_DIR, 'project.inlang', 'settings.json');
const LANG_CONFIG_PATH = join(ROOT_DIR, 'src', 'config', 'languages.json');

if (!existsSync(BASE_DIR)) {
	console.error(`❌ Base directory not found: ${BASE_DIR}`);
	process.exit(1);
}

// 1. Determine target locales
let targetLocales = [];
if (existsSync(LANG_CONFIG_PATH)) {
	try {
		targetLocales = JSON.parse(readFileSync(LANG_CONFIG_PATH, 'utf8'))
			.map((l) => l.code)
			.filter((l) => l !== BASE_LANG);
	} catch (e) {
		console.warn('⚠️ Could not parse languages.json:', e.message);
	}
}

if (targetLocales.length === 0) {
	targetLocales = readdirSync(CMS_DIR, { withFileTypes: true })
		.filter((d) => d.isDirectory() && d.name !== BASE_LANG)
		.map((d) => d.name);
}

// 2. Discover all subcatalogs in it/
const subcatalogs = readdirSync(BASE_DIR, { withFileTypes: true })
	.filter((d) => d.isDirectory())
	.map((d) => d.name);

console.log(`\n📦 Subcatalog Synchronizer (Base: ${BASE_LANG})`);
console.log(`Found subcatalogs: ${subcatalogs.join(', ')}`);
console.log(`Target locales: ${targetLocales.join(', ')}\n`);

const NON_TRANSLATABLE_FIELDS = new Set([
	'id',
	'role',
	'structureId',
	'category',
	'icon',
	'sponsorIcon',
	'registerIcon',
	'color',
	'address',
	'mapUrl',
	'mapEmbedUrl',
	'embedSrc',
	'mapLink',
	'image',
	'phone',
	'whatsapp',
	'email',
	'number',
	'link',
	'href',
	'downloadUrl',
	'current',
	'time',
	'year',
	'edition',
	'step',
	'isCommittee',
	'isContact',
	'partners',
]);

function extractTranslatableFields(obj) {
	const res = {};
	for (const [k, v] of Object.entries(obj)) {
		if (!NON_TRANSLATABLE_FIELDS.has(k)) {
			res[k] = v;
		}
	}
	return res;
}

let createdCount = 0;
let syncedCount = 0;
const allSubcatalogKeys = [];

for (const sub of subcatalogs) {
	const baseSubDir = join(BASE_DIR, sub);
	const files = readdirSync(baseSubDir).filter((f) => f.endsWith('.json'));

	for (const file of files) {
		const id = file.replace('.json', '');
		const inlangKey = `${sub}/${id}`;
		allSubcatalogKeys.push({
			key: inlangKey,
			path: `./src/data/cms/{locale}/${sub}/${file}`,
		});

		const baseContent = JSON.parse(readFileSync(join(baseSubDir, file), 'utf8'));

		for (const locale of targetLocales) {
			const targetDir = join(CMS_DIR, locale, sub);
			if (!existsSync(targetDir)) {
				mkdirSync(targetDir, { recursive: true });
			}

			const targetPath = join(targetDir, file);
			if (!existsSync(targetPath)) {
				// Scaffold new file with only translatable fields
				const translatable = extractTranslatableFields(baseContent);
				writeFileSync(targetPath, JSON.stringify(translatable, null, 2) + '\n', 'utf8');
				console.log(`✨ Created [${locale}/${sub}/${file}] from ${BASE_LANG}`);
				createdCount++;
			} else {
				// Sync missing translatable keys and purge non-translatable fields
				try {
					const targetContent = JSON.parse(readFileSync(targetPath, 'utf8'));
					let updated = false;

					for (const key of Object.keys(targetContent)) {
						if (NON_TRANSLATABLE_FIELDS.has(key)) {
							delete targetContent[key];
							updated = true;
						}
					}

					for (const [key, val] of Object.entries(baseContent)) {
						if (!NON_TRANSLATABLE_FIELDS.has(key) && targetContent[key] === undefined) {
							targetContent[key] = val;
							updated = true;
						}
					}

					if (updated) {
						writeFileSync(targetPath, JSON.stringify(targetContent, null, 2) + '\n', 'utf8');
						console.log(`🔄 Synced translatable keys in [${locale}/${sub}/${file}]`);
						syncedCount++;
					}
				} catch (err) {
					console.error(`❌ Error parsing [${locale}/${sub}/${file}]:`, err.message);
				}
			}
		}
	}
}

// 3. Update project.inlang/settings.json
if (existsSync(INLANG_SETTINGS_PATH)) {
	try {
		const inlangSettings = JSON.parse(readFileSync(INLANG_SETTINGS_PATH, 'utf8'));
		if (!inlangSettings['plugin.inlang.json']) {
			inlangSettings['plugin.inlang.json'] = {};
		}
		if (!inlangSettings['plugin.inlang.json'].pathPattern) {
			inlangSettings['plugin.inlang.json'].pathPattern = {};
		}

		const pattern = inlangSettings['plugin.inlang.json'].pathPattern;
		let inlangUpdated = false;

		// Sort keys alphabetically for clean diffs
		for (const item of allSubcatalogKeys) {
			if (pattern[item.key] !== item.path) {
				pattern[item.key] = item.path;
				inlangUpdated = true;
			}
		}

		if (inlangUpdated) {
			// Sort pathPattern keys
			const sortedPattern = {};
			for (const k of Object.keys(pattern).sort()) {
				sortedPattern[k] = pattern[k];
			}
			inlangSettings['plugin.inlang.json'].pathPattern = sortedPattern;
			writeFileSync(INLANG_SETTINGS_PATH, JSON.stringify(inlangSettings, null, 2) + '\n', 'utf8');
			console.log(`⚙️  Updated project.inlang/settings.json with subcatalog pathPatterns`);
		}
	} catch (err) {
		console.error('❌ Failed to update project.inlang/settings.json:', err.message);
	}
}

console.log(
	`\n🎉 Sync complete: ${createdCount} created, ${syncedCount} updated, ${allSubcatalogKeys.length} subcatalog entries registered.`
);
