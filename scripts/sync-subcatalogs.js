#!/usr/bin/env node
import {
	readdirSync,
	readFileSync,
	writeFileSync,
	existsSync,
	mkdirSync,
	unlinkSync,
} from 'node:fs';
import { join, resolve, relative } from 'node:path';

const ROOT_DIR = resolve('.');
const CMS_DIR = join(ROOT_DIR, 'src', 'data', 'cms');
const LOCALES_DIR = join(ROOT_DIR, 'src', 'data', 'locales');
const BASE_LOCALE = 'it';
const BASE_LOCALES_DIR = join(LOCALES_DIR, BASE_LOCALE);
const INLANG_SETTINGS_PATH = join(ROOT_DIR, 'project.inlang', 'settings.json');
const LANG_CONFIG_PATH = join(ROOT_DIR, 'src', 'config', 'languages.json');

if (!existsSync(CMS_DIR)) {
	console.error(`❌ CMS directory not found: ${CMS_DIR}`);
	process.exit(1);
}

// 1. Determine configured locales
let allLocales = [BASE_LOCALE];
if (existsSync(LANG_CONFIG_PATH)) {
	try {
		const configured = JSON.parse(readFileSync(LANG_CONFIG_PATH, 'utf8')).map((l) => l.code);
		allLocales = Array.from(new Set([BASE_LOCALE, ...configured]));
	} catch (e) {
		console.warn('⚠️ Could not parse languages.json:', e.message);
	}
}

if (existsSync(LOCALES_DIR)) {
	const discovered = readdirSync(LOCALES_DIR, { withFileTypes: true })
		.filter((d) => d.isDirectory())
		.map((d) => d.name);
	allLocales = Array.from(new Set([...allLocales, ...discovered]));
}

console.log(`\n📦 Locale Synchronizer (CMS source -> ${BASE_LOCALES_DIR})`);
console.log(`Configured Inlang locales: ${allLocales.join(', ')} (baseLocale: "${BASE_LOCALE}")\n`);

const CANONICAL_ONLY_CATALOGS = new Set(['history.json', 'people.json']);
const IGNORED_DIRS = new Set(['icons', 'colors', 'it', 'en']);

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
	'logo',
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
	'value',
]);

/**
 * Converts native CMS data (with arrays and technical metadata)
 * into a Fink/Inlang-compatible schema where:
 * 1. Arrays are converted to indexed objects {"0": ..., "1": ...}
 * 2. Non-translatable fields (ids, icons, links, colors, coordinates) are stripped
 */
function toFinkSchema(val) {
	if (Array.isArray(val)) {
		const res = {};
		val.forEach((item, idx) => {
			const converted = toFinkSchema(item);
			if (
				converted !== undefined &&
				(typeof converted !== 'object' || Object.keys(converted).length > 0)
			) {
				res[String(idx)] = converted;
			}
		});
		return res;
	}

	if (typeof val === 'object' && val !== null) {
		const res = {};
		for (const [key, subVal] of Object.entries(val)) {
			if (NON_TRANSLATABLE_FIELDS.has(key)) {
				continue;
			}
			const converted = toFinkSchema(subVal);
			if (
				converted !== undefined &&
				(typeof converted !== 'object' || Object.keys(converted).length > 0)
			) {
				res[key] = converted;
			}
		}
		return res;
	}

	if (typeof val === 'string') {
		return val;
	}

	return undefined;
}

function getAllJsonFiles(dir, relativeTo = dir) {
	let results = [];
	const entries = readdirSync(dir, { withFileTypes: true });
	for (const entry of entries) {
		if (IGNORED_DIRS.has(entry.name)) continue;
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			results.push(...getAllJsonFiles(fullPath, relativeTo));
		} else if (entry.isFile() && entry.name.endsWith('.json')) {
			const relPath = relative(relativeTo, fullPath).replace(/\\/g, '/');
			results.push(relPath);
		}
	}
	return results;
}

const allBaseFiles = getAllJsonFiles(CMS_DIR);
let generatedCount = 0;
const allInlangCatalogKeys = [];

for (const relFile of allBaseFiles) {
	if (CANONICAL_ONLY_CATALOGS.has(relFile)) {
		continue;
	}

	const inlangKey = relFile.replace('.json', '');
	allInlangCatalogKeys.push({
		key: inlangKey,
		path: `./src/data/locales/{locale}/${relFile}`,
	});

	const cmsFilePath = join(CMS_DIR, relFile);
	const cmsContent = JSON.parse(readFileSync(cmsFilePath, 'utf8'));

	const targetFilePath = join(BASE_LOCALES_DIR, relFile);
	const targetDir = join(
		BASE_LOCALES_DIR,
		relFile.includes('/') ? relFile.slice(0, relFile.lastIndexOf('/')) : ''
	);

	if (!existsSync(targetDir)) {
		mkdirSync(targetDir, { recursive: true });
	}

	const converted = toFinkSchema(cmsContent);
	const newJson = JSON.stringify(converted, null, 2) + '\n';

	const shouldWrite =
		!existsSync(targetFilePath) || readFileSync(targetFilePath, 'utf8') !== newJson;
	if (shouldWrite) {
		writeFileSync(targetFilePath, newJson, 'utf8');
		console.log(`✨ Generated [locales/it/${relFile}] from CMS`);
		generatedCount++;
	}
}

// Clean up orphaned files in src/locales/it/ that no longer exist in CMS
if (existsSync(BASE_LOCALES_DIR)) {
	const currentItFiles = getAllJsonFiles(BASE_LOCALES_DIR);
	const validFilesSet = new Set(allInlangCatalogKeys.map((k) => k.key + '.json'));
	for (const itFile of currentItFiles) {
		if (!validFilesSet.has(itFile)) {
			unlinkSync(join(BASE_LOCALES_DIR, itFile));
			console.log(`🗑️ Removed orphaned [locales/it/${itFile}]`);
		}
	}
}

// 2. Update project.inlang/settings.json
if (existsSync(INLANG_SETTINGS_PATH)) {
	try {
		const inlangSettings = JSON.parse(readFileSync(INLANG_SETTINGS_PATH, 'utf8'));

		inlangSettings.baseLocale = BASE_LOCALE;
		inlangSettings.locales = allLocales;

		if (!inlangSettings['plugin.inlang.i18next']) {
			inlangSettings['plugin.inlang.i18next'] = {};
		}

		const pattern = {};
		for (const item of allInlangCatalogKeys) {
			pattern[item.key] = item.path;
		}

		const sortedPattern = {};
		for (const k of Object.keys(pattern).sort()) {
			sortedPattern[k] = pattern[k];
		}

		inlangSettings['plugin.inlang.i18next'].pathPattern = sortedPattern;
		writeFileSync(INLANG_SETTINGS_PATH, JSON.stringify(inlangSettings, null, 2) + '\n', 'utf8');
		console.log(
			`\n⚙️  Updated project.inlang/settings.json (baseLocale: "${BASE_LOCALE}", locales: [${allLocales.join(', ')}])`
		);
	} catch (err) {
		console.error('❌ Failed to update project.inlang/settings.json:', err.message);
	}
}

console.log(
	`\n🎉 Sync complete: ${generatedCount} files generated in locales/it/, ${allInlangCatalogKeys.length} catalogs registered for Fink.`
);
