import { resolveIcon, resolveImage, partnerImages } from '../utils/helpers';
import { partnerCategoryGlob, partnersData as cmsPartners } from './cms';

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

export const partnerCategories: PartnerCategory[] = Object.entries(partnerCategoryGlob).map(
	([, mod]) => ({
		id: mod.default.id ?? crypto.randomUUID(),
		title: mod.default.label ?? mod.default.id ?? '',
		icon: resolveIcon(mod.default.icon),
		color: mod.default.color ?? 'primary',
	})
);

export const aisfPartner: Partner = {
	name: cmsPartners.organizzatore?.aisf?.name ?? '',
	shortName: cmsPartners.organizzatore?.aisf?.shortName ?? '',
	description: cmsPartners.organizzatore?.aisf?.description,
	logo: resolveImage(partnerImages, cmsPartners.organizzatore?.aisf?.image),
	category: cmsPartners.organizzatore?.aisf?.category ?? '',
	link: cmsPartners.organizzatore?.aisf?.link ?? '',
};
export const aisfBoloPartner: Partner = {
	name: cmsPartners.organizzatore?.aisfBolo?.name ?? '',
	shortName: cmsPartners.organizzatore?.aisfBolo?.shortName ?? '',
	logo: resolveImage(partnerImages, cmsPartners.organizzatore?.aisfBolo?.image),
	category: cmsPartners.organizzatore?.aisfBolo?.category ?? '',
	link: cmsPartners.organizzatore?.aisfBolo?.link ?? '',
};

const partnersFromArray: Partner[] = (cmsPartners.partners ?? []).map((p) => ({
	name: p.name ?? '',
	shortName: p.shortName ?? p.name ?? '',
	description: p.description,
	logo: resolveImage(partnerImages, p.image),
	category: p.category ?? '',
	link: p.link ?? '',
}));

export const uniboPartner: Partner = partnersFromArray.find((p) => p.link.includes('unibo.it'))!;

export const partners: Partner[] = [aisfPartner, aisfBoloPartner, ...partnersFromArray] as const;
