import { committeeImages, resolveImage } from '../utils/helpers';
import { committeeRoleGlob, localizedCommitteeRoleGlob, peopleJson, getCmsData } from './cms';

export interface Person {
	name: string;
	role: string;
	image?: ImageMetadata;
	roleDescription?: string;
	email?: string;
	phone?: string;
	isCommittee: boolean;
	isContact: boolean;
}

interface RoleInfo {
	label: string;
	description?: string;
}

export function getPeople(locale?: string): Person[] {
	const people = locale ? getCmsData(locale).people : peopleJson;

	// Build role lookup from localized people-roles
	const roleLookup: Record<string, RoleInfo> = {};
	for (const [path, mod] of Object.entries(committeeRoleGlob)) {
		const base = mod.default;
		if (!base.id) continue;
		if (!locale || locale === 'it') {
			roleLookup[base.id] = {
				label: base.label ?? base.id,
				description: base.description,
			};
		} else {
			const filename = path.split('/').pop();
			const localizedKey = `../locales/${locale}/people-roles/${filename}`;
			const localizedMod = localizedCommitteeRoleGlob[localizedKey]?.default;
			roleLookup[base.id] = {
				label: localizedMod?.label ?? base.label ?? base.id,
				description: localizedMod?.description ?? base.description,
			};
		}
	}

	return (people ?? []).map((p) => {
		const roleKey = p.role ?? '';
		const roleInfo = roleLookup[roleKey];
		return {
			name: p.name ?? '',
			role: roleInfo?.label ?? roleKey,
			image: p.image ? resolveImage(committeeImages, p.image) : undefined,
			roleDescription: roleInfo?.description,
			email: p.email,
			phone: p.phone,
			isCommittee: p.isCommittee ?? false,
			isContact: p.isContact ?? false,
		};
	});
}

export function getCommitteePeople(locale?: string): Person[] {
	return getPeople(locale).filter((p) => p.isCommittee);
}

export function getContactPeople(locale?: string): Person[] {
	return getPeople(locale).filter((p) => p.isContact);
}

export const committeePeople: Person[] = getCommitteePeople();
export const contactPeople: Person[] = getContactPeople();
