import { resolveIcon } from '../utils/helpers';
import { statsData } from './cms';

export interface Stat {
	number: string;
	label: string;
	icon?: ReturnType<typeof resolveIcon>;
}

type StatsItem = { id?: string; number?: string; label?: string; icon?: string };

function withIcons(items: StatsItem[]) {
	return items.map((item) => ({
		number: item.number ?? '',
		label: item.label ?? '',
		icon: item.icon ? resolveIcon(item.icon) : undefined,
	}));
}

export const conferenceStats: Stat[] = withIcons(statsData.conferenceStats ?? []);
export const aisfStats: Stat[] = withIcons(statsData.aisfStats ?? []);
export const iapsStats: Stat[] = withIcons(statsData.iapsStats ?? []);
