import type { CmsData } from '../../types/cms';
import _conference from './conference.json';
import _home from './home.json';
import _about from './about.json';
import _structures from './structures.json';
import _program from './program.json';
import _pricing from './pricing.json';
import _contacts from './contacts.json';
import _error from './error.json';
import _sponsor from './sponsor.json';
import _theme from './theme.json';
import _bologna from './bologna.json';
import _thesis from './thesis.json';
import _history from './history.json';
import _iaps from './iaps.json';
import _footer from './footer.json';
import _nav from './nav.json';
import _partners from './partners.json';
import _people from './people.json';
import _pageLinks from './pageLinks.json';
import _stats from './stats.json';

export const conference = _conference as CmsData<typeof _conference>;
export const home = _home as CmsData<typeof _home>;
export const about = _about as CmsData<typeof _about>;
export const structuresData = _structures as CmsData<typeof _structures>;
export const programData = _program as CmsData<typeof _program>;
export const pricing = _pricing as CmsData<typeof _pricing>;
export const contacts = _contacts as CmsData<typeof _contacts>;
export const errorContent = _error as CmsData<typeof _error>;
export const sponsor = _sponsor as CmsData<typeof _sponsor>;
export const themeData = _theme as CmsData<typeof _theme>;
export const bolognaData = _bologna as CmsData<typeof _bologna>;
export const thesisContent = _thesis as CmsData<typeof _thesis>;
export const history = _history as CmsData<typeof _history>;
export const iaps = _iaps as CmsData<typeof _iaps>;
export const footer = _footer as CmsData<typeof _footer>;
export const nav = _nav as CmsData<typeof _nav>;
export const partnersData = _partners as CmsData<typeof _partners>;
export const peopleJson = _people as CmsData<typeof _people>;
export const pageLinksData = _pageLinks as CmsData<typeof _pageLinks>;
export const statsData = _stats as CmsData<typeof _stats>;

export const partnerCategoryGlob = import.meta.glob<{
	default: { id?: string; label?: string; icon?: string; color?: string };
}>('./partner-categories/*.json', {
	eager: true,
});

export const committeeRoleGlob = import.meta.glob<{
	default: { id?: string; label?: string; description?: string };
}>('./people-roles/*.json', {
	eager: true,
});

export const structureGlob = import.meta.glob<{
	default: {
		id?: string;
		label?: string;
		category?: string;
		address?: string;
		mapUrl?: string;
		mapEmbedUrl?: string;
		description?: string;
		distance?: string;
		capacity?: string;
		rooms?: string;
		price?: string;
		phone?: string;
		whatsapp?: string;
		email?: string;
		features?: string[];
		image?: string;
	};
}>('./structures/*.json', {
	eager: true,
});

export const structureCategoryGlob = import.meta.glob<{
	default: { id?: string; label?: string; icon?: string; color?: string };
}>('./structure-categories/*.json', {
	eager: true,
});
