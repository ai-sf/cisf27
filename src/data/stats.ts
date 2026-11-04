import { resolveIcon } from '../utils/helpers';
import { getCmsData, statsData } from './cms';

export interface Stat {
	number: string;
	label: string;
	icon?: ReturnType<typeof resolveIcon>;
}

type StatsItem = { id?: string; number?: string; label?: string; icon?: string };

function projectStats(baseItems: StatsItem[] = [], locItems: StatsItem[] = []): Stat[] {
	const locById = new Map(locItems.filter((i) => i.id).map((i) => [i.id, i]));

	return baseItems.map((baseItem, index) => {
		const locItem = (baseItem.id ? locById.get(baseItem.id) : undefined) ?? locItems[index];
		return {
			number: baseItem.number ?? '',
			icon: baseItem.icon ? resolveIcon(baseItem.icon) : undefined,
			label: locItem?.label ?? baseItem.label ?? '',
		};
	});
}

export function getStats(locale?: string) {
	const base = statsData;
	const localized = locale && locale !== 'it' ? getCmsData(locale).statsData : base;

	return {
		conferenceStats: projectStats(base.conferenceStats, localized.conferenceStats),
		aisfStats: projectStats(base.aisfStats, localized.aisfStats),
		iapsStats: projectStats(base.iapsStats, localized.iapsStats),
	};
}

export const conferenceStats: Stat[] = projectStats(
	statsData.conferenceStats,
	statsData.conferenceStats
);
export const aisfStats: Stat[] = projectStats(statsData.aisfStats, statsData.aisfStats);
export const iapsStats: Stat[] = projectStats(statsData.iapsStats, statsData.iapsStats);
