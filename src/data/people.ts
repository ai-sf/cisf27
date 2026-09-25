import { committeeImages, resolveImage } from '../utils/helpers';
import { committeeRoleGlob, peopleJson } from './cms';

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

const committeeRoles: Record<string, RoleInfo> = {};
for (const [, mod] of Object.entries(committeeRoleGlob)) {
	if (mod.default.id)
		committeeRoles[mod.default.id] = {
			label: mod.default.label ?? mod.default.id,
			description: mod.default.description,
		};
}

const allPeople: Person[] = peopleJson.map((p) => {
	const roleInfo = committeeRoles[p.role ?? ''];
	return {
		name: p.name ?? '',
		role: roleInfo?.label ?? p.role ?? '',
		image: p.image ? resolveImage(committeeImages, p.image) : undefined,
		roleDescription: roleInfo?.description,
		email: p.email,
		phone: p.phone,
		isCommittee: p.isCommittee ?? false,
		isContact: p.isContact ?? false,
	};
});

export const committeePeople: Person[] = allPeople.filter((p) => p.isCommittee);
export const contactPeople: Person[] = allPeople.filter((p) => p.isContact);
