import type { Icon as LucideIcon } from '@lucide/astro';
import { icons } from '@lucide/astro';
import type aisfLogo from '../assets/images/partners/aisf.png';
import placeholderImg from '../assets/images/default-placeholder.svg';

type ImageMetadata = typeof aisfLogo;

export const gradientMap: Map<string, string> = new Map([
	['primary', 'from-primary to-secondary'],
	['secondary', 'from-secondary to-accent'],
	['success', 'from-success to-primary'],
	['warning', 'from-warning to-primary'],
	['info', 'from-info to-primary'],
	['neutral', 'from-neutral to-primary'],
	['accent', 'from-accent to-secondary'],
	['error', 'from-error to-primary'],
	['base-100', 'from-base-100 to-primary'],
	['base-200', 'from-base-200 to-primary'],
	['base-300', 'from-base-300 to-primary'],
	['base-content', 'from-base-content to-primary'],
	['primary-content', 'from-primary-content to-primary'],
	['secondary-content', 'from-secondary-content to-secondary'],
	['accent-content', 'from-accent-content to-accent'],
	['neutral-content', 'from-neutral-content to-neutral'],
	['info-content', 'from-info-content to-info'],
	['success-content', 'from-success-content to-success'],
	['warning-content', 'from-warning-content to-warning'],
	['error-content', 'from-error-content to-error'],
]);

export const partnerImages = import.meta.glob<{ default: ImageMetadata }>(
	'../assets/images/partners/*',
	{ eager: true, import: 'default' }
) as unknown as Record<string, ImageMetadata>;

export const structureImages = import.meta.glob<{ default: ImageMetadata }>(
	'../assets/images/structures/*',
	{ eager: true, import: 'default' }
) as unknown as Record<string, ImageMetadata>;

export const committeeImages = import.meta.glob<{ default: ImageMetadata }>(
	'../assets/images/committee/*',
	{ eager: true, import: 'default' }
) as unknown as Record<string, ImageMetadata>;

export function kebabToPascal(str: string): string {
	return str.replace(/(^|-)(\w)/g, (_, __, c) => c.toUpperCase());
}

export function resolveIcon(name?: string | undefined): typeof LucideIcon | undefined {
	if (!name) return;
	const pascal = kebabToPascal(name);
	return icons[pascal as keyof typeof icons] as typeof LucideIcon;
}

export function resolveImage(
	images: Record<string, ImageMetadata>,
	path?: string | undefined
): ImageMetadata {
	return path ? (images[path] ?? placeholderImg) : placeholderImg;
}
