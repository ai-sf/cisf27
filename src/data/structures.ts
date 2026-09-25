import { resolveIcon } from '../utils/helpers';
import { structureGlob, structureCategoryGlob } from './cms';

export type Structure = (typeof structureGlob)[number]['default'];

export const structures: Structure[] = Object.entries(structureGlob).map(([, mod]) => mod.default);

export function getStructureById(id: string): Structure | undefined {
	return structures.find((s) => s.id === id);
}

export const structureCategories = Object.entries(structureCategoryGlob).map(([, mod]) => ({
	id: mod.default.id,
	title: mod.default.label,
	icon: resolveIcon(mod.default.icon),
	color: mod.default.color,
}));
