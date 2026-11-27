import type { PillarKey, RadioQuestionKey, ThematicAreaId } from '../data/registrationData';

export const DRAFT_STORAGE_KEY = 'cisf27_registration_draft_v1';
export const TEST_ACCESS_STORAGE_KEY = 'cisf27_test_access_code';

// UI-advertised limits vs real validation buffer (matching backend Apps Script)
export const MOTIVATION_UI_MAX_MB = 15;
export const MOTIVATION_MAX_BYTES = 17 * 1024 * 1024; // 17 MiB real buffer

export const TALK_UI_MAX_MB = 10;
export const TALK_MAX_BYTES = 11 * 1024 * 1024; // 11 MiB real buffer

export const REGISTRATION_SCRIPT_URL = import.meta.env.PUBLIC_REGISTRATION_SCRIPT_URL as
	string | undefined;

export type RegistrationGateState =
	'loading' | 'testing' | 'before_open' | 'open' | 'closed' | 'error';

export type ServerEffectiveState = 'testing' | 'before_open' | 'open' | 'closed';

export interface RegistrationStatusResponse {
	status: 'ok' | 'error';
	effectiveState?: ServerEffectiveState;
	mode?: string;
	serverTime?: string;
	openAt?: string;
	closeAt?: string;
	message?: string;
}

export interface VerifyTestingPasscodeResult {
	ok: boolean;
	valid: boolean;
	error?: string;
}

export interface RegistrationDraft {
	// Step 0
	ruoloSpeciale: string;
	maggiorenne: '' | 'si' | 'no';
	checkCriteri: boolean;
	tipologiaQuota: string;
	subPreferenza: string;

	// Step 1
	tipoLettera: 'testo' | 'video' | 'audio' | 'canvas';
	linkProgetto: string;
	checkParallel: boolean;
	parallelReadiness: string;
	parallelTitle: string;
	parallelAbstract: string;

	// Step 2
	nome: string;
	cognome: string;
	email: string;
	codiceFiscale: string;
	cfAtipico: boolean;
	soprannome: string;
	pronomi: string;
	genere: string;
	genereSpecifica: string;
	ateneo: string;
	corsoLaurea: string;
	livelloStudio: string;
	curriculum: string;
	iscrittoAisf: string;
	comitatoLocale: string;
	neoIscritto: string;
	dettaglioWg: string;
	nextLeaders: string;
	nextLeadersLink: string;
	attivitaLc: string;
	partAisf: string;
	partIaps: string;
	orgAisf: string;
	elencoPartecipazioni: string;

	// Step 3
	pillars: Record<PillarKey, number>;
	quizRadios: Record<RadioQuestionKey, string>;
	quizScaleVal: number;
	quizScaleTouched: boolean;
	quizPostureVal: number;
	quizPostureTouched: boolean;
	manualOrderIds: ThematicAreaId[];
	isManualOrder: boolean;
	matchingAccepted: boolean;

	// Step 4
	disponibilitaMatrimoniale: string;
	matrimonialeNominativo: string;
	camereAccettate: string[];
	preferenzaCompagni: string;
	coinquiliniSpecifici: string;
	regimeAlimentare: string;
	regimeAltro: string;
	allergiePresenti: string;
	allergieElenco: string;
	allergieGravita: string;
	allergiePrecauzioni: string;
	noteSanitarie: string;
	accessibilita: string;

	// Step 5
	commentoFinale: string;
	checkPrivacy: boolean;
	checkVeridicita: boolean;
	checkPagamento: boolean;
}

export interface EncodedAttachment {
	fileName: string;
	mimeType: string;
	sizeBytes: number;
	base64Data: string;
}

export interface RegistrationPayload {
	// Gatekeeper (only populated in MODE=TESTING)
	accessCode?: string;

	// Step 0
	ruoloSpeciale: string;
	maggiorenne: boolean;
	ammissioneAutomatica: boolean;
	tipologiaQuota: string;
	subPreferenza: string;

	// Step 1
	tipoLettera: string;
	linkProgetto: string;
	motivazioneFile: EncodedAttachment | null;
	talkDisponibile: boolean;
	talkReadiness: string;
	talkTitolo: string;
	talkAbstract: string;
	talkFile: EncodedAttachment | null;

	// Step 2
	nome: string;
	cognome: string;
	email: string;
	codiceFiscale: string;
	cfAtipico: boolean;
	soprannome: string;
	pronomi: string;
	genere: string;
	genereSpecifica: string;
	ateneo: string;
	corsoLaurea: string;
	livelloStudio: string;
	curriculum: string;
	iscrittoAisf: string;
	comitatoLocale: string;
	neoIscritto: string;
	dettaglioWg: string;
	nextLeaders: string;
	nextLeadersLink: string;
	attivitaLc: string;
	partAisf: string;
	partIaps: string;
	orgAisf: string;
	elencoPartecipazioni: string;

	// Step 3
	pilastroStoria: number;
	pilastroEnergia: number;
	pilastroLavoro: number;
	pilastroRicerca: number;
	quizAnsweredCount: number;
	quizManualReorder: boolean;
	quizTop1: string;
	quizTop2: string;
	quizTop3: string;
	quizFullRanking: string[];
	quizRawAnswers: Record<string, string | number | boolean>;

	// Step 4
	alloggioMatrimoniale: string;
	alloggioMatrimonialeNominativo: string;
	alloggioCamereAccettate: string[];
	alloggioCompagniPref: string;
	alloggioCoinquiliniSpecifici: string;
	regimeAlimentare: string;
	regimeAltro: string;
	allergiePresenti: string;
	allergieElenco: string;
	allergieGravita: string;
	allergiePrecauzioni: string;
	noteSanitarie: string;
	accessibilita: string;

	// Step 5
	commentoFinale: string;
	consensoCriteri: boolean;
	consensoPrivacy: boolean;
	consensoVeridicita: boolean;
	consensoPagamento: boolean;
}

export interface SavedFileReceipt {
	kind: 'motivazione' | 'talk';
	originalName: string;
	anonName: string;
	sizeMB: string;
	sha256: string;
}

export interface RegistrationSubmitResult {
	success: boolean;
	candidateId?: string;
	isTest?: boolean;
	filesSaved?: SavedFileReceipt[];
	emailSent?: boolean;
	emailWarning?: string;
	error?: string;
}

export function isValidEmail(raw: string): boolean {
	const trimmed = raw.trim();
	return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed);
}

export function isValidHttpUrl(raw: string): boolean {
	const trimmed = raw.trim();
	if (!trimmed) return false;
	try {
		const parsed = new URL(trimmed);
		return (
			(parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname.includes('.')
		);
	} catch {
		return false;
	}
}

export function formatBytesToMB(bytes: number): string {
	return (bytes / (1024 * 1024)).toFixed(2);
}

export function encodeFileToBase64(file: File): Promise<EncodedAttachment> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const result = reader.result;
			if (typeof result !== 'string') {
				reject(new Error(`Impossibile leggere il file "${file.name}".`));
				return;
			}
			const commaIdx = result.indexOf(',');
			const base64Data = commaIdx >= 0 ? result.slice(commaIdx + 1) : result;
			resolve({
				fileName: file.name,
				mimeType: file.type || 'application/octet-stream',
				sizeBytes: file.size,
				base64Data,
			});
		};
		reader.onerror = () => {
			reject(new Error(`Errore durante la lettura del file "${file.name}".`));
		};
		reader.readAsDataURL(file);
	});
}

const VALID_SERVER_STATES: ReadonlySet<ServerEffectiveState> = new Set([
	'testing',
	'before_open',
	'open',
	'closed',
]);

function isServerEffectiveState(value: unknown): value is ServerEffectiveState {
	return typeof value === 'string' && VALID_SERVER_STATES.has(value as ServerEffectiveState);
}

function buildActionUrl(endpoint: string, queryString: string): string {
	const separator = endpoint.includes('?') ? '&' : '?';
	return `${endpoint}${separator}${queryString}`;
}

async function fetchTextWithTimeout(
	url: string,
	init: RequestInit,
	timeoutMs: number
): Promise<{ response: Response; rawText: string }> {
	const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
	const timerId = controller ? globalThis.setTimeout(() => controller.abort(), timeoutMs) : null;

	try {
		const response = await fetch(url, {
			...init,
			...(controller ? { signal: controller.signal } : {}),
		});
		const rawText = await response.text();
		return { response, rawText };
	} finally {
		if (timerId !== null) {
			globalThis.clearTimeout(timerId);
		}
	}
}

export async function fetchRegistrationStatus(): Promise<RegistrationStatusResponse> {
	const endpoint = REGISTRATION_SCRIPT_URL?.trim();

	if (!endpoint) {
		return {
			status: 'error',
			message:
				'Endpoint di registrazione non configurato (variabile PUBLIC_REGISTRATION_SCRIPT_URL mancante). In sviluppo locale imposta il file .env e riavvia pnpm dev; in produzione contatta cisf27@ai-sf.it.',
		};
	}

	try {
		const { response, rawText } = await fetchTextWithTimeout(
			buildActionUrl(endpoint, 'action=status'),
			{
				method: 'GET',
				credentials: 'omit',
				redirect: 'follow',
				cache: 'no-store',
			},
			15000
		);

		if (!response.ok) {
			return {
				status: 'error',
				message: `Il server di verifica stato ha risposto con HTTP ${response.status}. Riprova tra qualche istante.`,
			};
		}

		let parsed: {
			status?: string;
			effectiveState?: unknown;
			mode?: string;
			serverTime?: string;
			openAt?: string;
			closeAt?: string;
			message?: string;
		};

		try {
			parsed = JSON.parse(rawText);
		} catch {
			return {
				status: 'error',
				message:
					'Risposta inattesa dal server di registrazione (formato non JSON). Riprova tra qualche istante.',
			};
		}

		if (parsed.status === 'ok' && isServerEffectiveState(parsed.effectiveState)) {
			return {
				status: 'ok',
				effectiveState: parsed.effectiveState,
				mode: typeof parsed.mode === 'string' ? parsed.mode : undefined,
				serverTime: typeof parsed.serverTime === 'string' ? parsed.serverTime : undefined,
				openAt: typeof parsed.openAt === 'string' ? parsed.openAt : undefined,
				closeAt: typeof parsed.closeAt === 'string' ? parsed.closeAt : undefined,
			};
		}

		return {
			status: 'error',
			message:
				parsed.message ||
				'Impossibile determinare lo stato attuale delle candidature. Riprova tra qualche istante.',
		};
	} catch (err) {
		const errorObj = err as Error;
		if (errorObj.name === 'AbortError' || errorObj.name === 'TimeoutError') {
			return {
				status: 'error',
				message:
					'Timeout di connessione durante la verifica dello stato delle candidature. Controlla la connessione e riprova.',
			};
		}

		return {
			status: 'error',
			message:
				errorObj.message ||
				'Errore di rete durante la verifica dello stato delle candidature. Riprova tra qualche istante.',
		};
	}
}

export async function verifyTestingPasscode(code: string): Promise<VerifyTestingPasscodeResult> {
	const trimmed = code.trim();
	if (!trimmed) {
		return {
			ok: true,
			valid: false,
			error: 'Inserisci il codice di accesso testing.',
		};
	}

	const endpoint = REGISTRATION_SCRIPT_URL?.trim();
	if (!endpoint) {
		return {
			ok: false,
			valid: false,
			error:
				'Endpoint di registrazione non configurato (variabile PUBLIC_REGISTRATION_SCRIPT_URL mancante).',
		};
	}

	try {
		const url = buildActionUrl(endpoint, `action=verify&code=${encodeURIComponent(trimmed)}`);
		const { response, rawText } = await fetchTextWithTimeout(
			url,
			{
				method: 'GET',
				credentials: 'omit',
				redirect: 'follow',
				cache: 'no-store',
			},
			15000
		);

		if (!response.ok) {
			return {
				ok: false,
				valid: false,
				error: `Il server ha risposto con HTTP ${response.status}. Riprova tra qualche istante.`,
			};
		}

		let parsed: { status?: string; valid?: boolean; message?: string };
		try {
			parsed = JSON.parse(rawText);
		} catch {
			return {
				ok: false,
				valid: false,
				error: 'Risposta non valida dal server durante la verifica del codice.',
			};
		}

		if (parsed.status === 'ok') {
			return {
				ok: true,
				valid: parsed.valid === true,
			};
		}

		return {
			ok: false,
			valid: false,
			error: parsed.message || 'Errore durante la verifica del codice di accesso.',
		};
	} catch (err) {
		const errorObj = err as Error;
		if (errorObj.name === 'AbortError' || errorObj.name === 'TimeoutError') {
			return {
				ok: false,
				valid: false,
				error: 'Timeout durante la verifica del codice di accesso. Riprova.',
			};
		}

		return {
			ok: false,
			valid: false,
			error: errorObj.message || 'Errore di rete durante la verifica del codice di accesso.',
		};
	}
}

export async function submitRegistration(
	payload: RegistrationPayload
): Promise<RegistrationSubmitResult> {
	const endpoint = REGISTRATION_SCRIPT_URL?.trim();

	if (!endpoint) {
		return {
			success: false,
			error:
				'Endpoint di registrazione non configurato (variabile PUBLIC_REGISTRATION_SCRIPT_URL mancante). Contatta cisf27@ai-sf.it.',
		};
	}

	try {
		// Use text/plain;charset=utf-8 to avoid CORS OPTIONS preflight against Google Apps Script
		// while still receiving and parsing the real JSON response (NO mode: 'no-cors'!).
		const { response, rawText } = await fetchTextWithTimeout(
			endpoint,
			{
				method: 'POST',
				credentials: 'omit',
				redirect: 'follow',
				headers: {
					'Content-Type': 'text/plain;charset=utf-8',
				},
				body: JSON.stringify(payload),
			},
			360000
		);

		if (!response.ok) {
			return {
				success: false,
				error: `Il server ha risposto con stato HTTP ${response.status}. Riprova tra qualche istante o scrivi a cisf27@ai-sf.it.`,
			};
		}

		let parsed: {
			status?: string;
			candidateId?: string;
			isTest?: boolean;
			filesSaved?: SavedFileReceipt[];
			emailSent?: boolean;
			emailWarning?: string;
			message?: string;
		};

		try {
			parsed = JSON.parse(rawText);
		} catch {
			return {
				success: false,
				error:
					'Risposta inattesa dal server di registrazione (formato non JSON). La tua candidatura potrebbe non essere stata salvata: controlla la tua email prima di riprovare o contatta cisf27@ai-sf.it.',
			};
		}

		if (parsed.status === 'success' && parsed.candidateId) {
			return {
				success: true,
				candidateId: parsed.candidateId,
				isTest: parsed.isTest === true,
				filesSaved: Array.isArray(parsed.filesSaved) ? parsed.filesSaved : [],
				emailSent: parsed.emailSent !== false,
				emailWarning: parsed.emailWarning,
			};
		}

		return {
			success: false,
			error:
				parsed.message ||
				'Si è verificato un errore durante il salvataggio della candidatura sul server.',
		};
	} catch (err) {
		const errorObj = err as Error;
		if (errorObj.name === 'AbortError' || errorObj.name === 'TimeoutError') {
			return {
				success: false,
				error:
					'Timeout di connessione (oltre 120 secondi). Se avevi allegato un file pesante, verifica prima la tua casella email (anche Spam) per vedere se la candidatura è arrivata, altrimenti riduci la dimensione del file o usa un link esterno e riprova.',
			};
		}

		return {
			success: false,
			error:
				errorObj.message ||
				'Errore di rete durante la comunicazione con il server AISF. Controlla la connessione e riprova.',
		};
	}
}
