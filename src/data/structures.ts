import { resolveIcon } from '../utils/helpers';
import {
	structureGlob,
	localizedStructureGlob,
	structureCategoryGlob,
	localizedStructureCategoryGlob,
	deepMerge,
} from './cms';

export type Structure = (typeof structureGlob)[number]['default'];

export interface StructureCategory {
	id: string;
	title: string;
	icon: ReturnType<typeof resolveIcon>;
	color: string;
}

export function getStructureCategories(locale?: string): StructureCategory[] {
	return Object.entries(structureCategoryGlob).map(([path, mod]) => {
		const base = mod.default;
		const id = base.id ?? '';
		if (!locale || locale === 'it') {
			return {
				id,
				title: base.label ?? id,
				icon: resolveIcon(base.icon),
				color: base.color ?? 'primary',
			};
		}
		const filename = path.split('/').pop();
		const localizedKey = `../../locales/${locale}/structure-categories/${filename}`;
		const localizedMod = localizedStructureCategoryGlob[localizedKey]?.default;
		return {
			id,
			title: localizedMod?.label ?? base.label ?? id,
			icon: resolveIcon(base.icon),
			color: base.color ?? 'primary',
		};
	});
}

export function getStructures(locale?: string): Structure[] {
	return Object.entries(structureGlob).map(([path, mod]) => {
		const base = mod.default;
		if (!locale || locale === 'it') {
			return base;
		}

		// Look for localized file: e.g. ./en/structures/combo.json
		const filename = path.split('/').pop();
		const localizedKey = `../../locales/${locale}/structures/${filename}`;
		const localizedMod = localizedStructureGlob[localizedKey]?.default;
		if (!localizedMod) {
			return base;
		}

		return deepMerge(base, localizedMod);
	});
}

export function getStructureById(id: string, locale?: string): Structure | undefined {
	return getStructures(locale).find((s) => s.id === id);
}

export const structures: Structure[] = getStructures();
export const structureCategories: StructureCategory[] = getStructureCategories();
