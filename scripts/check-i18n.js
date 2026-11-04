#!/usr/bin/env node
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT_DIR = resolve('.');
const LOCALES_DIR = join(ROOT_DIR, 'src', 'locales');
const BASE_LANG = 'it';

if (!existsSync(LOCALES_DIR)) {
	console.error(`Error: Locales directory not found at ${LOCALES_DIR}`);
	process.exit(1);
}

const baseDir = join(LOCALES_DIR, BASE_LANG);
if (!existsSync(baseDir)) {
	console.error(`Error: Base language directory not found at ${baseDir}`);
	process.exit(1);
}

function getCatalogFiles(dir, relativeTo = dir) {
	let results = [];
	const entries = readdirSync(dir, { withFileTypes: true });
	for (const entry of entries) {
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			results.push(...getCatalogFiles(fullPath, relativeTo));
		} else if (entry.isFile() && entry.name.endsWith('.json')) {
			const relPath = fullPath.slice(relativeTo.length + 1).replace(/\\/g, '/');
			results.push(relPath);
		}
	}
	return results;
}

const baseFiles = getCatalogFiles(baseDir);

// 1. Read languages from configuration
let configuredLangs = [];
const langConfigPath = join(ROOT_DIR, 'src', 'config', 'languages.json');
if (existsSync(langConfigPath)) {
	try {
		configuredLangs = JSON.parse(readFileSync(langConfigPath, 'utf8')).map((l) => l.code);
	} catch (e) {
		console.warn('Warning: Could not parse languages.json:', e.message);
	}
}

// 2. Auto-discover any other language directories (containing conference.json & home.json)
const TARGET_LANGS = Array.from(
	new Set([
		...configuredLangs.filter((l) => l !== BASE_LANG),
		...readdirSync(LOCALES_DIR, { withFileTypes: true })
			.filter((dirent) => dirent.isDirectory() && dirent.name !== BASE_LANG)
			.map((dirent) => dirent.name)
			.filter((dir) => {
				const dirPath = join(LOCALES_DIR, dir);
				return (
					existsSync(join(dirPath, 'conference.json')) && existsSync(join(dirPath, 'home.json'))
				);
			}),
	])
);

let totalErrors = 0;
let totalCheckedKeys = 0;

function flattenKeys(obj, prefix = '') {
	let keys = {};
	if (Array.isArray(obj)) {
		obj.forEach((item, idx) => {
			const fullKey = prefix ? `${prefix}.${idx}` : String(idx);
			if (item !== null && typeof item === 'object') {
				Object.assign(keys, flattenKeys(item, fullKey));
			} else {
				keys[fullKey] = item;
			}
		});
	} else if (obj !== null && typeof obj === 'object') {
		for (const [k, v] of Object.entries(obj)) {
			const fullKey = prefix ? `${prefix}.${k}` : k;
			if (v !== null && typeof v === 'object') {
				Object.assign(keys, flattenKeys(v, fullKey));
			} else {
				keys[fullKey] = v;
			}
		}
	}
	return keys;
}

const CANONICAL_ONLY_CATALOGS = new Set(['people.json', 'history.json']);

console.log(`\n🔍 Checking i18n translation catalogs (Base: ${BASE_LANG})...\n`);

for (const file of baseFiles) {
	const component = file.replace('.json', '');

	if (CANONICAL_ONLY_CATALOGS.has(file)) {
		console.log(`ℹ️  [${component}] Canonical base catalog (shared across all locales)`);
		continue;
	}

	const basePath = join(baseDir, file);

	let baseData;
	try {
		baseData = JSON.parse(readFileSync(basePath, 'utf8'));
	} catch (err) {
		console.error(`❌ [${BASE_LANG}/${file}] Invalid JSON:`, err.message);
		totalErrors++;
		continue;
	}

	const baseFlat = flattenKeys(baseData);
	const baseKeySet = new Set(Object.keys(baseFlat));
	totalCheckedKeys += baseKeySet.size;

	for (const targetLang of TARGET_LANGS) {
		const targetPath = join(LOCALES_DIR, targetLang, file);

		if (!existsSync(targetPath)) {
			console.error(`❌ [${targetLang}/${file}] Missing translation file!`);
			totalErrors++;
			continue;
		}

		let targetData;
		try {
			targetData = JSON.parse(readFileSync(targetPath, 'utf8'));
		} catch (err) {
			console.error(`❌ [${targetLang}/${file}] Invalid JSON:`, err.message);
			totalErrors++;
			continue;
		}

		const targetFlat = flattenKeys(targetData);
		const targetKeySet = new Set(Object.keys(targetFlat));

		// Canonical non-translatable fields that are maintained in `it` only
		const NON_TRANSLATABLE_KEYS = new Set([
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
			'value',
			'logo',
		]);

		const NON_TRANSLATABLE_FULL_KEYS = new Set([
			'title',
			'location',
			'organizzatore.aisf.name',
			'organizzatore.aisf.shortName',
			'organizzatore.aisfBolo.name',
			'organizzatore.aisfBolo.shortName',
		]);

		const isNonTranslatable = (k) => {
			if (NON_TRANSLATABLE_FULL_KEYS.has(k)) return true;
			const parts = k.split('.');
			return parts.some((p) => NON_TRANSLATABLE_KEYS.has(p));
		};

		// Check for missing keys (omitted non-translatable metadata is allowed)
		const missing = [];
		for (const key of baseKeySet) {
			if (!targetKeySet.has(key) && !isNonTranslatable(key)) {
				missing.push(key);
			}
		}

		// Check for extraneous keys
		const extra = [];
		for (const key of targetKeySet) {
			if (!baseKeySet.has(key)) {
				extra.push(key);
			}
		}

		// Invariant check: structural IDs must remain identical to base locale
		const idMismatches = [];
		for (const key of baseKeySet) {
			if (key.endsWith('.id') || key === 'id') {
				if (targetFlat[key] !== undefined && targetFlat[key] !== baseFlat[key]) {
					idMismatches.push(`${key} (base: "${baseFlat[key]}", translated: "${targetFlat[key]}")`);
				}
			}
		}

		if (missing.length > 0) {
			console.error(`⚠️  [${targetLang}/${file}] Missing ${missing.length} key(s):`);
			for (const k of missing.slice(0, 10)) {
				console.error(`    - ${k}`);
			}
			if (missing.length > 10) {
				console.error(`    ... and ${missing.length - 10} more`);
			}
			totalErrors += missing.length;
		}

		if (extra.length > 0) {
			console.warn(`ℹ️  [${targetLang}/${file}] Extraneous ${extra.length} key(s) not in base:`);
			for (const k of extra.slice(0, 5)) {
				console.warn(`    + ${k}`);
			}
		}

		if (idMismatches.length > 0) {
			console.error(`❌ [${targetLang}/${file}] Structural ID(s) modified in translation:`);
			for (const m of idMismatches) {
				console.error(`    * ${m}`);
			}
			totalErrors += idMismatches.length;
		}

		if (missing.length === 0 && extra.length === 0 && idMismatches.length === 0) {
			console.log(
				`✅ [${component}] ${BASE_LANG} ↔ ${targetLang} (${baseKeySet.size} keys in sync)`
			);
		}
	}
}

console.log('\n----------------------------------------');
if (totalErrors > 0) {
	console.error(`❌ i18n validation failed with ${totalErrors} issue(s).\n`);
	process.exit(1);
} else {
	console.log(
		`✨ All ${baseFiles.length} translation catalogs verified successfully (${totalCheckedKeys} keys checked).\n`
	);
	process.exit(0);
}
