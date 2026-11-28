/**
 * ============================================================================
 * CISF27 — Backend Modulo Contatti (Google Apps Script, V8)
 * ============================================================================
 * Proprietà Script supportate (Impostazioni progetto -> Proprietà script):
 *   - MAIN_RECIPIENT       : (Opzionale) Destinatario principale (default: cisf27@ai-sf.it)
 *   - FALLBACK_CC          : (Opzionale) Lista email CC di fallback separate da virgola
 *   - CC_MAP_JSON          : (Opzionale) JSON oggetto -> array/stringa email CC per smistamento
 *   - TURNSTILE_SECRET_KEY : (Consigliato) Chiave segreta Cloudflare Turnstile anti-spam
 *   - FORM_ID              : (Opzionale) ID o URL del Google Form di backup risposte
 */

const DEFAULT_MAIN_RECIPIENT = 'cisf27@ai-sf.it';
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const MAX_RAW_BODY_CHARS = 25000;
const MAX_NAME_CHARS = 256;
const MAX_EMAIL_CHARS = 254;
const MAX_SUBJECT_CHARS = 100;
const MAX_MESSAGE_CHARS = 5000;

const RATE_LIMIT_EMAIL_WINDOW_SEC = 900; // 15 min
const RATE_LIMIT_EMAIL_MAX = 3;
const RATE_LIMIT_GLOBAL_WINDOW_SEC = 600; // 10 min
const RATE_LIMIT_GLOBAL_MAX = 25;

const ALLOWED_SUBJECTS = [
	'Iscrizione',
	'Sponsorizzazione',
	'Logistica',
	'Programma Scientifico',
	'Altro',
];

// Sinonimi per ciascun campo del form del sito per facilitare l'abbinamento con le domande del Google Form
const FIELD_ALIASES = {
	nome: ['nomeecognome', 'nome', 'cognome', 'fullname', 'name', 'nominativo'],
	email: ['email', 'indirizzoemail', 'postaelettronica', 'mail'],
	oggetto: ['oggetto', 'argomento', 'motivo', 'subject', 'tipologia', 'selezionaunargomento'],
	messaggio: ['messaggio', 'testo', 'richiesta', 'message', 'note', 'contenuto'],
};

/**
 * Healthcheck minimale su GET (nessuna esposizione di indirizzi, ID o struttura interna).
 */
function doGet() {
	return jsonOutput({ status: 'active' });
}

/**
 * Gestione richieste POST (invio messaggio dal modulo contatti).
 */
function doPost(e) {
	try {
		if (!e || !e.postData || typeof e.postData.contents !== 'string' || !e.postData.contents) {
			throw new Error('Nessun dato ricevuto nella richiesta.');
		}

		if (e.postData.contents.length > MAX_RAW_BODY_CHARS) {
			throw new Error('Il messaggio supera la dimensione massima consentita.');
		}

		const data = parseRequestBody(e);
		const props = PropertiesService.getScriptProperties();

		// 1. Verifica anti-bot Cloudflare Turnstile (se TURNSTILE_SECRET_KEY è configurata)
		verifyTurnstileToken_(
			props.getProperty('TURNSTILE_SECRET_KEY'),
			data.turnstileToken || data['cf-turnstile-response']
		);

		// 2. Pulizia da \r, \n, \0 (anti Header Injection) e validazione rigorosa campi
		const nome = stripControlAndHeaderChars_(data.nome);
		const email = stripControlAndHeaderChars_(data.email);
		const rawOggetto = stripControlAndHeaderChars_(data.oggetto);
		const messaggio = String(data.messaggio || '')
			.replace(/\u0000/g, '')
			.trim();

		if (!nome || !email || !rawOggetto || !messaggio) {
			throw new Error(
				'Campi obbligatori mancanti: nome, email, oggetto e messaggio sono richiesti.'
			);
		}
		if (nome.length < 2 || nome.length > MAX_NAME_CHARS) {
			throw new Error('Il nome inserito non rispetta la lunghezza consentita (2–256 caratteri).');
		}
		if (email.length > MAX_EMAIL_CHARS || !isValidSafeEmail_(email)) {
			throw new Error('Indirizzo email non valido.');
		}
		if (rawOggetto.length > MAX_SUBJECT_CHARS) {
			throw new Error('Oggetto non valido.');
		}
		if (messaggio.length < 2 || messaggio.length > MAX_MESSAGE_CHARS) {
			throw new Error(
				'Il messaggio deve essere compreso tra 2 e ' + MAX_MESSAGE_CHARS + ' caratteri.'
			);
		}

		// 3. Rate-limiting in CacheService per proteggere la quota giornaliera MailApp
		enforceContactRateLimit_(email);

		const canonicalOggetto = ALLOWED_SUBJECTS.indexOf(rawOggetto) !== -1 ? rawOggetto : 'Altro';
		const routing = loadRoutingConfig_(props);
		const ccRecipients = Object.prototype.hasOwnProperty.call(routing.ccMap, canonicalOggetto)
			? routing.ccMap[canonicalOggetto]
			: routing.fallbackCc;
		const ccString = ccRecipients.join(', ');

		const subject = `[CISF27 Contatto] ${canonicalOggetto} - ${nome}`;

		const plainTextBody = `Nuovo messaggio ricevuto dal form contatti del sito CISF27:

Nome e Cognome: ${nome}
Email: ${email}
Oggetto: ${rawOggetto}

Messaggio:
${messaggio}

---
Inviato tramite il modulo del sito https://ai-sf.it/cisf27`;

		const htmlBody = `
			<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
				<div style="border-bottom: 2px solid #0284c7; padding-bottom: 12px; margin-bottom: 20px;">
					<h2 style="color: #0f172a; margin: 0; font-size: 20px;">Nuovo Messaggio dal Sito CISF27</h2>
				</div>
				<table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
					<tr>
						<td style="padding: 8px 0; font-weight: bold; color: #475569; width: 140px;">Nome e Cognome:</td>
						<td style="padding: 8px 0; color: #0f172a;">${escapeHtml(nome)}</td>
					</tr>
					<tr>
						<td style="padding: 8px 0; font-weight: bold; color: #475569;">Email:</td>
						<td style="padding: 8px 0; color: #0284c7;"><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td>
					</tr>
					<tr>
						<td style="padding: 8px 0; font-weight: bold; color: #475569;">Oggetto:</td>
						<td style="padding: 8px 0; color: #0f172a;"><span style="background-color: #f1f5f9; padding: 4px 8px; border-radius: 4px; font-weight: 500;">${escapeHtml(rawOggetto)}</span></td>
					</tr>
				</table>
				<div style="background-color: #f8fafc; border-left: 4px solid #0284c7; padding: 16px; margin-bottom: 24px; border-radius: 4px;">
					<h4 style="margin: 0 0 8px 0; color: #334155; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em;">Messaggio:</h4>
					<p style="margin: 0; color: #1e293b; white-space: pre-wrap; line-height: 1.6;">${escapeHtml(messaggio)}</p>
				</div>
				<p style="font-size: 12px; color: #94a3b8; margin: 0; border-top: 1px solid #e2e8f0; padding-top: 12px;">
					Puoi rispondere direttamente a questa email per contattare ${escapeHtml(nome)} (${escapeHtml(email)}).
				</p>
			</div>
		`;

		const mailOptions = {
			to: routing.mainRecipient,
			replyTo: email,
			subject: subject,
			body: plainTextBody,
			htmlBody: htmlBody,
		};

		if (ccString) {
			mailOptions.cc = ccString;
		}

		// 4. Invio email
		MailApp.sendEmail(mailOptions);

		// 5. Opzionale: se presente FORM_ID, prova a salvare nel Google Form
		try {
			const rawFormId = props.getProperty('FORM_ID');
			if (rawFormId) {
				submitToForm(rawFormId, { nome, email, oggetto: canonicalOggetto, messaggio });
			}
		} catch (formErr) {
			console.error('Salvataggio form opzionale non riuscito:', formErr);
		}

		return jsonOutput({ status: 'success' });
	} catch (err) {
		console.error('Errore gestione richiesta contatti:', err);
		return jsonOutput({ status: 'error', message: String(err.message || err) });
	}
}

/**
 * Verifica server-side del token Cloudflare Turnstile (attiva se TURNSTILE_SECRET_KEY è impostata).
 */
function verifyTurnstileToken_(rawSecret, rawToken) {
	const secret = String(rawSecret || '').trim();
	if (!secret) return;

	const token = String(rawToken || '').trim();
	if (!token || token.length > 4096) {
		throw new Error(
			'Verifica di sicurezza anti-bot mancante o scaduta. Ricarica la pagina o riprova.'
		);
	}

	let res;
	try {
		res = UrlFetchApp.fetch(TURNSTILE_VERIFY_URL, {
			method: 'post',
			payload: {
				secret: secret,
				response: token,
			},
			muteHttpExceptions: true,
		});
	} catch (netErr) {
		console.warn('Turnstile siteverify network outage (fail-open with rate-limit):', netErr);
		return;
	}

	const code = res.getResponseCode();
	if (code >= 500) {
		console.warn('Turnstile siteverify HTTP ' + code + ' (fail-open with rate-limit).');
		return;
	}

	let parsed = null;
	try {
		parsed = JSON.parse(res.getContentText());
	} catch (parseErr) {
		throw new Error('Risposta non valida dal servizio di verifica anti-bot. Riprova.');
	}

	if (!parsed || parsed.success !== true) {
		console.warn('Turnstile verification rejected:', parsed && parsed['error-codes']);
		throw new Error('Verifica di sicurezza anti-bot non superata o scaduta. Riprova.');
	}
}

/**
 * Rate-limiting leggero in CacheService per prevenire abusi della quota MailApp.
 */
function enforceContactRateLimit_(email) {
	try {
		const cache = CacheService.getScriptCache();
		const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, email.toLowerCase());
		const emailHash = digest
			.slice(0, 10)
			.map((b) => ((b < 0 ? b + 256 : b) < 16 ? '0' : '') + (b < 0 ? b + 256 : b).toString(16))
			.join('');

		const emailKey = 'CISF27_CONTACT_RL_E_' + emailHash;
		const globalKey = 'CISF27_CONTACT_RL_GLOBAL';

		const emailCount = parseInt(cache.get(emailKey) || '0', 10) || 0;
		if (emailCount >= RATE_LIMIT_EMAIL_MAX) {
			throw new Error(
				'Hai già inviato diversi messaggi negli ultimi minuti. Attendi qualche minuto prima di riprovare.'
			);
		}

		const globalCount = parseInt(cache.get(globalKey) || '0', 10) || 0;
		if (globalCount >= RATE_LIMIT_GLOBAL_MAX) {
			throw new Error(
				'Il modulo contatti sta ricevendo molte richieste in questo momento. Riprova tra qualche minuto oppure scrivi direttamente a cisf27@ai-sf.it.'
			);
		}

		cache.put(emailKey, String(emailCount + 1), RATE_LIMIT_EMAIL_WINDOW_SEC);
		cache.put(globalKey, String(globalCount + 1), RATE_LIMIT_GLOBAL_WINDOW_SEC);
	} catch (rlErr) {
		if (rlErr && String(rlErr.message || '').indexOf('minuti') !== -1) {
			throw rlErr;
		}
		console.warn('Rate-limit cache warning:', rlErr);
	}
}

/**
 * Carica destinatario principale e mappa CC dalle Script Properties senza esporre indirizzi personali nel codice.
 */
function loadRoutingConfig_(props) {
	const rawMain = stripControlAndHeaderChars_(props.getProperty('MAIN_RECIPIENT'));
	const mainRecipient = isValidSafeEmail_(rawMain) ? rawMain : DEFAULT_MAIN_RECIPIENT;

	const fallbackCc = parseEmailList_(props.getProperty('FALLBACK_CC'));
	const ccMap = Object.create(null);

	const rawMapJson = String(props.getProperty('CC_MAP_JSON') || '').trim();
	if (rawMapJson) {
		try {
			const parsed = JSON.parse(rawMapJson);
			if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
				Object.keys(parsed).forEach((key) => {
					const cleanKey = stripControlAndHeaderChars_(key);
					if (cleanKey) {
						ccMap[cleanKey] = parseEmailList_(parsed[key]);
					}
				});
			}
		} catch (err) {
			console.warn('CC_MAP_JSON non valido nelle Script Properties:', err);
		}
	}

	return {
		mainRecipient: mainRecipient,
		fallbackCc: fallbackCc,
		ccMap: ccMap,
	};
}

function parseEmailList_(val) {
	if (!val) return [];
	const items = Array.isArray(val) ? val : String(val).split(',');
	return items.map((item) => stripControlAndHeaderChars_(item)).filter(isValidSafeEmail_);
}

function stripControlAndHeaderChars_(val) {
	return String(val || '')
		.replace(/[\r\n\u0000]+/g, ' ')
		.trim();
}

function isValidSafeEmail_(email) {
	return Boolean(email && /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]{2,}$/.test(email));
}

/**
 * Estrae l'ID alfanumerico pulito del form, anche se l'utente ha incollato l'URL completo.
 */
function extractFormId(raw) {
	if (!raw) return '';
	const trimmed = String(raw).trim();
	const match = trimmed.match(/\/forms\/d\/(?:e\/)?([a-zA-Z0-9_-]+)/);
	if (match && match[1]) {
		return match[1];
	}
	const idMatch = trimmed.match(/^[a-zA-Z0-9_-]{20,}$/);
	if (idMatch) {
		return idMatch[0];
	}
	return trimmed;
}

/**
 * Normalizza il testo rimuovendo spazi, asterischi (campi obbligatori), punteggiatura e convertendo in minuscolo.
 */
function normalizeTitle(title) {
	return String(title || '')
		.replace(/[\s*:.\-_()[\]]/g, '')
		.trim()
		.toLowerCase();
}

/**
 * Trova la domanda corrispondente nel Google Form.
 */
function findFormItem(formItems, fieldKey) {
	const aliases = FIELD_ALIASES[fieldKey] || [fieldKey];

	for (let i = 0; i < formItems.length; i++) {
		const itemTitle = normalizeTitle(formItems[i].getTitle());
		if (aliases.includes(itemTitle)) {
			return formItems[i];
		}
	}

	for (let i = 0; i < formItems.length; i++) {
		const itemTitle = normalizeTitle(formItems[i].getTitle());
		for (let j = 0; j < aliases.length; j++) {
			const alias = aliases[j];
			if (itemTitle.includes(alias) || alias.includes(itemTitle)) {
				return formItems[i];
			}
		}
	}

	return null;
}

/**
 * Crea la risposta per una specifica domanda del Form in base al suo tipo.
 */
function createItemResponse(item, value) {
	const itemType = item.getType();

	if (itemType === FormApp.ItemType.TEXT) {
		return item.asTextItem().createResponse(value);
	}

	if (itemType === FormApp.ItemType.PARAGRAPH_TEXT) {
		return item.asParagraphTextItem().createResponse(value);
	}

	if (itemType === FormApp.ItemType.MULTIPLE_CHOICE) {
		const mcItem = item.asMultipleChoiceItem();
		const choices = mcItem.getChoices().map((c) => c.getValue());
		const matchedChoice = choices.find((c) => normalizeTitle(c) === normalizeTitle(value));
		if (matchedChoice) {
			return mcItem.createResponse(matchedChoice);
		}
		const partial = choices.find(
			(c) =>
				c.toLowerCase().includes(value.toLowerCase()) ||
				value.toLowerCase().includes(c.toLowerCase())
		);
		return mcItem.createResponse(partial || value);
	}

	if (itemType === FormApp.ItemType.LIST) {
		const listItem = item.asListItem();
		const choices = listItem.getChoices().map((c) => c.getValue());
		const matchedChoice = choices.find((c) => normalizeTitle(c) === normalizeTitle(value));
		if (matchedChoice) {
			return listItem.createResponse(matchedChoice);
		}
		const partial = choices.find(
			(c) =>
				c.toLowerCase().includes(value.toLowerCase()) ||
				value.toLowerCase().includes(c.toLowerCase())
		);
		return listItem.createResponse(partial || value);
	}

	if (itemType === FormApp.ItemType.CHECKBOX) {
		const cbItem = item.asCheckboxItem();
		const choices = cbItem.getChoices().map((c) => c.getValue());
		const matched = choices.filter(
			(c) =>
				normalizeTitle(c) === normalizeTitle(value) || c.toLowerCase().includes(value.toLowerCase())
		);
		return cbItem.createResponse(matched.length > 0 ? matched : [value]);
	}

	return null;
}

/**
 * Salva la risposta nel Google Form collegato.
 */
function submitToForm(rawFormId, data) {
	const cleanId = extractFormId(rawFormId);
	const form = FormApp.openById(cleanId);
	const formItems = form.getItems();
	const response = form.createResponse();

	const fields = ['nome', 'email', 'oggetto', 'messaggio'];
	let matchedCount = 0;

	fields.forEach((fieldKey) => {
		const value = data[fieldKey];
		if (!value) return;

		const item = findFormItem(formItems, fieldKey);
		if (item) {
			try {
				const itemResponse = createItemResponse(item, value);
				if (itemResponse) {
					response.withItemResponse(itemResponse);
					matchedCount++;
				}
			} catch (itemErr) {
				console.warn('Errore creazione risposta per campo ' + fieldKey + ':', itemErr);
			}
		} else {
			console.warn('Campo non trovato nel Google Form per la chiave: ' + fieldKey);
		}
	});

	if (matchedCount === 0) {
		throw new Error(
			'Nessuna domanda del Google Form corrisponde ai campi del messaggio (Nome, Email, Oggetto, Messaggio).'
		);
	}

	response.submit();
	Logger.log(
		'Risposta salvata con successo nel Google Form (' + matchedCount + ' campi abbinati).'
	);
}

function parseRequestBody(e) {
	const contents = e.postData.contents;
	const type = e.postData.type || '';

	if (type.indexOf('application/x-www-form-urlencoded') !== -1) {
		const data = Object.create(null);
		contents.split('&').forEach((pair) => {
			if (!pair) return;
			const eqIdx = pair.indexOf('=');
			const rawKey = eqIdx >= 0 ? pair.slice(0, eqIdx) : pair;
			const rawVal = eqIdx >= 0 ? pair.slice(eqIdx + 1) : '';
			const key = decodeURIComponent(rawKey.replace(/\+/g, ' '));
			if (key && key !== '__proto__' && key !== 'constructor' && key !== 'prototype') {
				data[key] = decodeURIComponent(rawVal.replace(/\+/g, ' '));
			}
		});
		return data;
	}

	const parsed = JSON.parse(contents);
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new Error('Formato richiesta JSON non valido.');
	}
	return parsed;
}

function escapeHtml(text) {
	return String(text || '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

function jsonOutput(obj) {
	return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
		ContentService.MimeType.JSON
	);
}

/**
 * Funzione di test e autorizzazione permessi (OAuth).
 * Esegui questa funzione dall'editor Apps Script per sbloccare l'autorizzazione OAuth
 * per MailApp, UrlFetchApp (Turnstile) e Google Forms.
 */
function authorizeScript() {
	const props = PropertiesService.getScriptProperties();
	const routing = loadRoutingConfig_(props);
	const quota = MailApp.getRemainingDailyQuota();

	// Tocca UrlFetchApp così Apps Script richiede lo scope external_request in fase di autorizzazione
	if (typeof UrlFetchApp === 'undefined') {
		throw new Error('UrlFetchApp non disponibile.');
	}

	Logger.log('=== Verifica Autorizzazione Modulo Contatti CISF27 ===');
	Logger.log('Destinatario principale: ' + routing.mainRecipient);
	Logger.log('Quota giornaliera email rimanente: ' + quota);
	Logger.log(
		'Turnstile configurato (TURNSTILE_SECRET_KEY): ' +
			Boolean(String(props.getProperty('TURNSTILE_SECRET_KEY') || '').trim())
	);
	Logger.log('Categorie CC configurate (CC_MAP_JSON): ' + Object.keys(routing.ccMap).length);
	Logger.log('Fallback CC configurati (FALLBACK_CC): ' + routing.fallbackCc.length);

	const rawFormId = props.getProperty('FORM_ID');
	if (rawFormId) {
		const cleanId = extractFormId(rawFormId);
		const form = FormApp.openById(cleanId);
		Logger.log('Google Form collegato con successo: "' + form.getTitle() + '"');
	} else {
		Logger.log('Nessun FORM_ID configurato in Proprietà script (opzionale).');
	}

	Logger.log('Autorizzazione completata con successo!');
}

/**
 * Funzione di test per verificare il salvataggio nel form dall'editor di Apps Script.
 */
function testFormSubmission() {
	const rawFormId = PropertiesService.getScriptProperties().getProperty('FORM_ID');
	if (!rawFormId) {
		throw new Error('Nessun FORM_ID impostato in Impostazioni progetto -> Proprietà script!');
	}
	Logger.log('Avvio test sottomissione form...');
	submitToForm(rawFormId, {
		nome: 'Test CISF27',
		email: 'test@cisf27.it',
		oggetto: 'Altro',
		messaggio:
			'Messaggio di test per verificare il salvataggio automatico delle risposte nel Google Form.',
	});
	Logger.log('Test sottomissione form completato con successo!');
}
