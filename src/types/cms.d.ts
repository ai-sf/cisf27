export type CmsData<T> = T extends string
	? string | undefined
	: T extends unknown[]
		? CmsData<T[number]>[]
		: T extends Record<string, unknown>
			? { [K in keyof T]?: CmsData<T[K]> } & Record<string, string | undefined>
			: T;
