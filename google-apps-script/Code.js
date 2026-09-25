// Indirizzo principale di destinazione
const MAIN_RECIPIENT = 'cisf27@ai-sf.it';

// Destinatari di fallback se l'oggetto non ha una mappatura specifica
const FALLBACK_CC = ['francesco.isgrò@ai-sf.it', 'alessandro.dagostino@ai-sf.it'];

// Mappa CC in base all'oggetto selezionato nel form
const CC_MAP = {
	Sponsorizzazione: ['diego.ficarra@ai-sf.it', 'mariarosaria.sivo@ai-sf.it'],
	Logistica: ['tomislav.vojvodic@ai-sf.it'],
	'Programma Scientifico': [
		'marta.grenno@ai-sf.it',
		'chiara.luppino@ai-sf.it',
		'ludovica.rainero@ai-sf.it',
	],
	Iscrizione: ['francesco.isgrò@ai-sf.it', 'alessandro.dagostino@ai-sf.it'],
	Altro: ['francesco.isgrò@ai-sf.it', 'alessandro.dagostino@ai-sf.it'],
};

// Sinonimi per ciascun campo del form del sito per facilitare l'abbinamento con le domande del Google Form
const FIELD_ALIASES = {
	nome: ['nomeecognome', 'nome', 'cognome', 'fullname', 'name', 'nominativo'],
	email: ['email', 'indirizzoemail', 'postaelettronica', 'mail'],
	oggetto: ['oggetto', 'argomento', 'motivo', 'subject', 'tipologia', 'selezionaunargomento'],
	messaggio: ['messaggio', 'testo', 'richiesta', 'message', 'note', 'contenuto'],
};

/**
 * Gestione richieste GET (usato anche per diagnostica da browser).
 */
function doGet() {
	let formDiagnostics = null;
	try {
		const rawFormId = PropertiesService.getScriptProperties().getProperty('FORM_ID');
		if (rawFormId) {
			const cleanId = extractFormId(rawFormId);
			const form = FormApp.openById(cleanId);
			formDiagnostics = {
				configured: true,
				formId: cleanId,
				title: form.getTitle(),
				items: form.getItems().map((item) => ({
					title: item.getTitle(),
					type: String(item.getType()),
				})),
			};
		} else {
			formDiagnostics = {
				configured: false,
				message: 'FORM_ID non configurato nelle Script Properties.',
			};
		}
	} catch (err) {
		formDiagnostics = {
			configured: true,
			error: 'Errore durante accesso al Google Form: ' + String(err.message || err),
		};
	}

	return jsonOutput({
		status: 'active',
		service: 'CISF27 Contact Form Webhook',
		recipient: MAIN_RECIPIENT,
		form: formDiagnostics,
	});
}

/**
 * Gestione richieste POST (invio messaggio dal modulo contatti).
 */
function doPost(e) {
	try {
		if (!e || !e.postData || !e.postData.contents) {
			throw new Error('Nessun dato ricevuto nella richiesta');
		}

		const data = parseRequestBody(e);

		const nome = (data.nome || '').trim();
		const email = (data.email || '').trim();
		const oggetto = (data.oggetto || '').trim();
		const messaggio = (data.messaggio || '').trim();

		if (!nome || !email || !oggetto || !messaggio) {
			throw new Error(
				'Campi obbligatori mancanti: nome, email, oggetto e messaggio sono richiesti.'
			);
		}

		// Determina eventuali destinatari in CC (specifici per oggetto o fallback coordinatori)
		const ccRecipients = CC_MAP[oggetto] || FALLBACK_CC;
		const ccString = ccRecipients.join(', ');

		const subject = `[CISF27 Contatto] ${oggetto} - ${nome}`;

		const plainTextBody = `Nuovo messaggio ricevuto dal form contatti del sito CISF27:

Nome e Cognome: ${nome}
Email: ${email}
Oggetto: ${oggetto}

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
						<td style="padding: 8px 0; color: #0f172a;"><span style="background-color: #f1f5f9; padding: 4px 8px; border-radius: 4px; font-weight: 500;">${escapeHtml(oggetto)}</span></td>
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
			to: MAIN_RECIPIENT,
			replyTo: email,
			subject: subject,
			body: plainTextBody,
			htmlBody: htmlBody,
		};

		if (ccString) {
			mailOptions.cc = ccString;
		}

		// 1. Invio email
		MailApp.sendEmail(mailOptions);

		// 2. Opzionale: se presente FORM_ID, prova a salvare nel Google Form
		try {
			const rawFormId = PropertiesService.getScriptProperties().getProperty('FORM_ID');
			if (rawFormId) {
				submitToForm(rawFormId, { nome, email, oggetto, messaggio });
			}
		} catch (formErr) {
			console.error('Salvataggio form opzionale non riuscito:', formErr);
		}

		return jsonOutput({ status: 'success' });
	} catch (err) {
		console.error('Errore gestione richiesta:', err);
		return jsonOutput({ status: 'error', message: String(err.message || err) });
	}
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
		.replace(/[\s\*\:\.\-\_\(\)\[\]]/g, '')
		.trim()
		.toLowerCase();
}

/**
 * Trova la domanda corrispondente nel Google Form.
 */
function findFormItem(formItems, fieldKey) {
	const aliases = FIELD_ALIASES[fieldKey] || [fieldKey];

	// 1. Match esatto normalizzato
	for (let i = 0; i < formItems.length; i++) {
		const itemTitle = normalizeTitle(formItems[i].getTitle());
		if (aliases.includes(itemTitle)) {
			return formItems[i];
		}
	}

	// 2. Match parziale (uno contiene l'altro)
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
		const data = {};
		contents.split('&').forEach((pair) => {
			if (!pair) return;
			const [key, value] = pair.split('=');
			data[decodeURIComponent(key)] = decodeURIComponent((value || '').replace(/\+/g, ' '));
		});
		return data;
	}

	return JSON.parse(contents);
}

function escapeHtml(text) {
	return String(text)
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
 * Esegui questa funzione dall'editor Apps Script (seleziona "authorizeScript" e clicca "Esegui" / "Run")
 * per sbloccare la schermata di autorizzazione OAuth sia per l'invio email che per l'accesso a Google Forms.
 */
function authorizeScript() {
	const quota = MailApp.getRemainingDailyQuota();
	Logger.log('=== Verifica Autorizzazione CISF27 ===');
	Logger.log('Destinatario principale: ' + MAIN_RECIPIENT);
	Logger.log('Quota giornaliera email rimanente per questo account: ' + quota);

	const rawFormId = PropertiesService.getScriptProperties().getProperty('FORM_ID');
	if (rawFormId) {
		const cleanId = extractFormId(rawFormId);
		// Chiamata diretta senza try/catch: se mancano i permessi OAuth per Forms,
		// Apps Script blocca l'esecuzione e mostra il pop-up "Autorizzazione richiesta".
		const form = FormApp.openById(cleanId);
		Logger.log(
			'Google Form collegato con successo: "' + form.getTitle() + '" (ID: ' + cleanId + ')'
		);
		Logger.log('Domande rilevate nel form:');
		form.getItems().forEach((it, i) => {
			Logger.log('  ' + (i + 1) + '. [' + it.getType() + '] ' + it.getTitle());
		});
	} else {
		Logger.log('Nessun FORM_ID configurato in Proprietà script (opzionale).');
	}

	Logger.log('Autorizzazione completata con successo!');
}

/**
 * Funzione di test per verificare il salvataggio nel form dall'editor di Apps Script.
 * Esegui questa funzione direttamente con "Esegui" per testare l'inserimento nel form e visualizzare i log.
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
