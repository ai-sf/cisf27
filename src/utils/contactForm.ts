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
			signal: AbortSignal.timeout(60000),
		});

		const text = await res.text();

		// 1. Prova a verificare se la risposta è JSON valido con status 'success'
		try {
			const json = JSON.parse(text);
			if (json?.status === 'success') {
				return { success: true };
			}
			if (json?.status === 'error') {
				return { success: false, error: json.message ?? errorContent.defaultMessage };
			}
		} catch {
			// Non è JSON. Verifica se è il noto artefatto HTML restituito dal server di redirect di Google
			// (es. "Sorry, unable to open the file at this time", logo Drive, o 404 dell'echo server).
			// Poiché Google Apps Script esegue doPost() PRIMA del redirect, sia l'email che il form sono già stati inviati.
			if (
				text.includes('<!DOCTYPE') &&
				(text.includes('drive-logo') ||
					text.includes('google') ||
					text.includes('docs.google.com') ||
					res.status === 404)
			) {
				return { success: true };
			}
		}

		// Se lo status HTTP era OK o un redirect completato
		if (res.ok) {
			return { success: true };
		}

		return {
			success: false,
			error: errorContent.defaultMessage ?? 'Si è verificato un errore durante l’invio.',
		};
	} catch (err) {
		if ((err as Error).name === 'AbortError') {
			return {
				success: false,
				error:
					'Il server sta impiegando più tempo del previsto. Se hai già inviato il messaggio, controlla la tua casella email prima di riprovare.',
			};
		}
		return {
			success: false,
			error: (err as Error).message || errorContent.defaultMessage,
		};
	}
}
