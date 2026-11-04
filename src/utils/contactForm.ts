import type { FormPayload, SubmitResult } from '../types/contactFrom';
import { getCmsData, errorContent } from '../data/cms';

export const SCRIPT_URL = import.meta.env.PUBLIC_GOOGLE_SCRIPT_URL;

export async function contactForm(data: FormPayload, locale?: string): Promise<SubmitResult> {
	const cms = locale ? getCmsData(locale) : undefined;
	const formTexts = cms?.contacts?.form;
	const errText = cms?.errorContent ?? errorContent;

	const endpointError = formTexts?.endpointError ?? 'Endpoint del modulo non configurato.';
	const sendError =
		formTexts?.sendError ?? errText.defaultMessage ?? 'Si è verificato un errore durante l’invio.';
	const timeoutError =
		formTexts?.timeoutError ??
		'Il server sta impiegando più tempo del previsto. Se hai già inviato il messaggio, controlla la tua casella email prima di riprovare.';

	if (!SCRIPT_URL) {
		return {
			success: false,
			error: endpointError,
		};
	}

	try {
		const res = await fetch(SCRIPT_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'text/plain;charset=utf-8' },
			body: JSON.stringify(data),
			signal: AbortSignal.timeout(60000),
		});

		const text = await res.text();

		try {
			const json = JSON.parse(text);
			if (json?.status === 'success') {
				return { success: true };
			}
			if (json?.status === 'error') {
				return { success: false, error: json.message ?? sendError };
			}
		} catch {
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

		if (res.ok) {
			return { success: true };
		}

		return {
			success: false,
			error: sendError,
		};
	} catch (err) {
		if ((err as Error).name === 'AbortError') {
			return {
				success: false,
				error: timeoutError,
			};
		}
		return {
			success: false,
			error: (err as Error).message || sendError,
		};
	}
}
