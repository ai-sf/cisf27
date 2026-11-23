/**
 * Italian Codice Fiscale algorithmic validator (Agenzia delle Entrate specification).
 * - Supports omocodia substitution letters (L, M, N, P, Q, R, S, T, U, V) in numeric positions.
 * - Verifies exact 16-character structure, calendar day bounds, 16th control character (CIN),
 *   and majority-age eligibility (boolean check only — NEVER exposes or prints age/DOB/sex).
 * - Does NOT cross-check first 6 characters against name/surname.
 */

const OMOCODIA_MAP: Record<string, string> = {
	L: '0',
	M: '1',
	N: '2',
	P: '3',
	Q: '4',
	R: '5',
	S: '6',
	T: '7',
	U: '8',
	V: '9',
};

const MONTH_INDEX_MAP: Record<string, number> = {
	A: 0, // January
	B: 1, // February
	C: 2, // March
	D: 3, // April
	E: 4, // May
	H: 5, // June
	L: 6, // July
	M: 7, // August
	P: 8, // September
	R: 9, // October
	S: 10, // November
	T: 11, // December
};

const MONTH_MAX_DAYS: Record<string, number> = {
	A: 31, // January
	B: 29, // February (leap-year inclusive)
	C: 31, // March
	D: 30, // April
	E: 31, // May
	H: 30, // June
	L: 31, // July
	M: 31, // August
	P: 30, // September
	R: 31, // October
	S: 30, // November
	T: 31, // December
};

// Odd positions (1st, 3rd, ..., 15th character -> 0-based indices 0, 2, ..., 14)
const ODD_CHAR_VALUES: Record<string, number> = {
	'0': 1,
	'1': 0,
	'2': 5,
	'3': 7,
	'4': 9,
	'5': 13,
	'6': 15,
	'7': 17,
	'8': 19,
	'9': 21,
	A: 1,
	B: 0,
	C: 5,
	D: 7,
	E: 9,
	F: 13,
	G: 15,
	H: 17,
	I: 19,
	J: 21,
	K: 2,
	L: 4,
	M: 18,
	N: 20,
	O: 11,
	P: 3,
	Q: 6,
	R: 8,
	S: 12,
	T: 14,
	U: 16,
	V: 10,
	W: 22,
	X: 25,
	Y: 24,
	Z: 23,
};

// Even positions (2nd, 4th, ..., 14th character -> 0-based indices 1, 3, ..., 13)
const EVEN_CHAR_VALUES: Record<string, number> = {
	'0': 0,
	'1': 1,
	'2': 2,
	'3': 3,
	'4': 4,
	'5': 5,
	'6': 6,
	'7': 7,
	'8': 8,
	'9': 9,
	A: 0,
	B: 1,
	C: 2,
	D: 3,
	E: 4,
	F: 5,
	G: 6,
	H: 7,
	I: 8,
	J: 9,
	K: 10,
	L: 11,
	M: 12,
	N: 13,
	O: 14,
	P: 15,
	Q: 16,
	R: 17,
	S: 18,
	T: 19,
	U: 20,
	V: 21,
	W: 22,
	X: 23,
	Y: 24,
	Z: 25,
};

const STANDARD_CF_REGEX =
	/^[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/;

export interface CodiceFiscaleValidationResult {
	valid: boolean;
	isMinor?: boolean;
	error?: string;
}

export function normalizeCodiceFiscale(raw: string): string {
	return raw.toUpperCase().replace(/\s+/g, '');
}

function decodeOmocodiaDigit(ch: string): string {
	return OMOCODIA_MAP[ch] ?? ch;
}

function hasValidCin(cleaned: string): boolean {
	let sum = 0;
	for (let i = 0; i < 15; i++) {
		const ch = cleaned[i];
		const value = i % 2 === 0 ? ODD_CHAR_VALUES[ch] : EVEN_CHAR_VALUES[ch];
		if (value === undefined) return false;
		sum += value;
	}
	const expectedControlChar = String.fromCharCode(65 + (sum % 26));
	return cleaned[15] === expectedControlChar;
}

/**
 * Checks whether a structurally valid Italian Codice Fiscale corresponds to a minor (< 18 years)
 * as of `referenceDate` (defaults to today). Returns `false` whenever the check cannot be
 * reliably performed (atypical/foreign CF, incomplete or invalid CF, invalid calendar date).
 * Never returns or logs the decoded age or date of birth.
 */
export function isMinorFromCodiceFiscale(
	raw: string,
	isAtipico: boolean,
	referenceDate: Date = new Date()
): boolean {
	if (isAtipico) return false;

	const cleaned = normalizeCodiceFiscale(raw);
	if (cleaned.length !== 16 || !STANDARD_CF_REGEX.test(cleaned) || !hasValidCin(cleaned)) {
		return false;
	}

	const yearTwoDigit = parseInt(
		decodeOmocodiaDigit(cleaned[6]) + decodeOmocodiaDigit(cleaned[7]),
		10
	);
	const monthIndex = MONTH_INDEX_MAP[cleaned[8]];
	const dayRaw = parseInt(decodeOmocodiaDigit(cleaned[9]) + decodeOmocodiaDigit(cleaned[10]), 10);
	const day = dayRaw > 40 ? dayRaw - 40 : dayRaw;

	if (Number.isNaN(yearTwoDigit) || monthIndex === undefined || Number.isNaN(day) || day < 1) {
		return false;
	}

	const refYear = referenceDate.getFullYear();
	const refMonth = referenceDate.getMonth();
	const refDay = referenceDate.getDate();
	const refTwoDigit = refYear % 100;

	let birthYear = yearTwoDigit <= refTwoDigit ? 2000 + yearTwoDigit : 1900 + yearTwoDigit;

	// Roll back a century if the decoded 20xx calendar date lies in the future
	if (
		birthYear > refYear ||
		(birthYear === refYear && (monthIndex > refMonth || (monthIndex === refMonth && day > refDay)))
	) {
		birthYear -= 100;
	}

	// Verify exact calendar validity (e.g. rejects Feb 29 on a non-leap year)
	const decodedDate = new Date(birthYear, monthIndex, day);
	if (
		decodedDate.getFullYear() !== birthYear ||
		decodedDate.getMonth() !== monthIndex ||
		decodedDate.getDate() !== day
	) {
		return false;
	}

	const eighteenthBirthday = new Date(birthYear + 18, monthIndex, day);
	const today = new Date(refYear, refMonth, refDay);
	return eighteenthBirthday > today;
}

export function validateCodiceFiscale(
	raw: string,
	isAtipico: boolean
): CodiceFiscaleValidationResult {
	const cleaned = normalizeCodiceFiscale(raw);

	if (!cleaned) {
		return { valid: false, error: 'Campo richiesto' };
	}

	if (isAtipico) {
		if (!/^[A-Z0-9\-/]+$/.test(cleaned) || !/[A-Z0-9]/.test(cleaned)) {
			return {
				valid: false,
				error: 'Inserisci un codice identificativo alfanumerico valido',
			};
		}
		return { valid: true };
	}

	if (cleaned.length !== 16) {
		return {
			valid: false,
			error:
				'Il Codice Fiscale italiano deve avere 16 caratteri (oppure spunta la casella per CF estero/atipico)',
		};
	}

	if (!STANDARD_CF_REGEX.test(cleaned)) {
		return {
			valid: false,
			error:
				'Formato Codice Fiscale non valido (verifica i caratteri o spunta la casella per CF estero/atipico)',
		};
	}

	// Verify day bounds after decoding potential omocodia characters (positions 9-10, 0-based)
	const monthCode = cleaned[8];
	const dayRaw = parseInt(decodeOmocodiaDigit(cleaned[9]) + decodeOmocodiaDigit(cleaned[10]), 10);
	const day = dayRaw > 40 ? dayRaw - 40 : dayRaw;
	const maxDays = MONTH_MAX_DAYS[monthCode] ?? 31;

	if (Number.isNaN(day) || day < 1 || day > maxDays) {
		return {
			valid: false,
			error: 'Codice Fiscale non valido (verifica le cifre inserite)',
		};
	}

	if (!hasValidCin(cleaned)) {
		return {
			valid: false,
			error:
				'Carattere di controllo (16° carattere) non valido: ricontrolla il Codice Fiscale inserito',
		};
	}

	if (isMinorFromCodiceFiscale(cleaned, false)) {
		return {
			valid: false,
			isMinor: true,
			error:
				'Dal Codice Fiscale inserito risulta che non sei ancora maggiorenne. Ricontrolla il codice oppure scrivi a cisf27@ai-sf.it.',
		};
	}

	return { valid: true };
}
