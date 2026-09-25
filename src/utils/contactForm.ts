import type { FormPayload, SubmitResult } from '../types/contactFrom';
import { errorContent } from '../data/cms';

export const SCRIPT_URL = import.meta.env.PUBLIC_GOOGLE_SCRIPT_URL;

export async function contactForm(data: FormPayload): Promise<SubmitResult> {
	if (!SCRIPT_URL) {
		return {
			success: false,
			error: errorContent.defaultMessage ?? 'Endpoint del modulo non configurato.',
		};
	}

	try {
		const res = await fetch(SCRIPT_URL, {
			method: 'POST',
			// text/plain avoids a CORS preflight (Apps Script has no doOptions),
			// while still letting us read the response — unlike mode: 'no-cors'.
			headers: { 'Content-Type': 'text/plain;charset=utf-8' },
			body: JSON.stringify(data),
		});

		const contentType = res.headers.get('content-type') || '';
		if (!res.ok && !contentType.includes('application/json')) {
			return {
				success: false,
				error: errorContent.defaultMessage ?? 'Si è verificato un errore durante l’invio.',
			};
		}

		const text = await res.text();
		let json: { status?: string; message?: string } | null = null;
		try {
			json = JSON.parse(text);
		} catch {
			return {
				success: false,
				error: errorContent.defaultMessage ?? 'Risposta non valida dal server.',
			};
		}

		if (json?.status === 'success') {
			return { success: true };
		}

		return { success: false, error: json?.message ?? errorContent.defaultMessage };
	} catch (err) {
		return {
			success: false,
			error: errorContent.defaultMessage ?? (err as Error).message,
		};
	}
}
