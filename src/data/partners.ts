import { resolveIcon, resolveImage, partnerImages } from '../utils/helpers';
import {
	partnerCategoryGlob,
	localizedPartnerCategoryGlob,
	partnersData as cmsPartners,
	getCmsData,
} from './cms';

import type { ImageMetadata } from '../types/astro';

export interface Partner {
	name: string;
	shortName: string;
	description?: string;
	logo: ImageMetadata;
	category: string;
	link: string;
}

export interface PartnerCategory {
	id: string;
	title: string;
	icon: ReturnType<typeof resolveIcon>;
	color: string;
}

export function getPartnerCategories(locale?: string): PartnerCategory[] {
	return Object.entries(partnerCategoryGlob).map(([path, mod]) => {
		const base = mod.default;
		const id = base.id ?? crypto.randomUUID();
		if (!locale || locale === 'it') {
			return {
				id,
				title: base.label ?? id,
				icon: resolveIcon(base.icon),
				color: base.color ?? 'primary',
			};
		}
		const filename = path.split('/').pop();
		const localizedKey = `../locales/${locale}/partner-categories/${filename}`;
		const localizedMod = localizedPartnerCategoryGlob[localizedKey]?.default;
		return {
			id,
			title: localizedMod?.label ?? base.label ?? id,
			icon: resolveIcon(base.icon),
			color: base.color ?? 'primary',
		};
	});
}

export function getPartners(locale?: string): Partner[] {
	const data = locale ? getCmsData(locale).partnersData : cmsPartners;
	const aisf: Partner = {
		name: data.organizzatore?.aisf?.name ?? '',
		shortName: data.organizzatore?.aisf?.shortName ?? '',
		description: data.organizzatore?.aisf?.description,
		logo: resolveImage(partnerImages, data.organizzatore?.aisf?.image),
		category: data.organizzatore?.aisf?.category ?? '',
		link: data.organizzatore?.aisf?.link ?? '',
	};
	const aisfBolo: Partner = {
		name: data.organizzatore?.aisfBolo?.name ?? '',
		shortName: data.organizzatore?.aisfBolo?.shortName ?? '',
		logo: resolveImage(partnerImages, data.organizzatore?.aisfBolo?.image),
		category: data.organizzatore?.aisfBolo?.category ?? '',
		link: data.organizzatore?.aisfBolo?.link ?? '',
	};

	const partnersFromArray: Partner[] = (data.partners ?? []).map((p) => ({
		name: p.name ?? '',
		shortName: p.shortName ?? p.name ?? '',
		description: 'description' in p ? (p.description as string | undefined) : undefined,
		logo: resolveImage(partnerImages, p.image),
		category: p.category ?? '',
		link: p.link ?? '',
	}));

	return [aisf, aisfBolo, ...partnersFromArray];
}

export const partnerCategories: PartnerCategory[] = getPartnerCategories();
export const aisfPartner: Partner = getPartners()[0];
export const aisfBoloPartner: Partner = getPartners()[1];
export const partners: Partner[] = getPartners();
export const uniboPartner: Partner = partners.find((p) => p.link.includes('unibo.it'))!;
