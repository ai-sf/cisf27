import type { FormPayload, SubmitResult } from '../types/contactFrom';
import { errorContent } from '../data/cms';

export const SCRIPT_URL = import.meta.env.PUBLIC_GOOGLE_SCRIPT_URL;

export async function contactForm(data: FormPayload): Promise<SubmitResult> {
	try {
		const res = await fetch(SCRIPT_URL, {
			method: 'POST',
			// text/plain avoids a CORS preflight (Apps Script has no doOptions),
			// while still letting us read the response — unlike mode: 'no-cors'.
			headers: { 'Content-Type': 'text/plain;charset=utf-8' },
			body: JSON.stringify(data),
		});

		const json = await res.json();

		if (json.status === 'success') {
			return { success: true };
		}

		return { success: false, error: json.message ?? errorContent.defaultMessage };
	} catch (err) {
		return { success: false, error: (err as Error).message ?? errorContent.defaultMessage };
	}
}
