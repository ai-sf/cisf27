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

function doGet() {
	return jsonOutput({
		status: 'active',
		service: 'CISF27 Contact Form Webhook',
		recipient: MAIN_RECIPIENT,
	});
}

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

		MailApp.sendEmail(mailOptions);

		// Opzionale: se presente FORM_ID, prova a salvare anche nel Google Form senza bloccare l'invio
		try {
			const FORM_ID = PropertiesService.getScriptProperties().getProperty('FORM_ID');
			if (FORM_ID) {
				submitToForm(FORM_ID, { nome, email, oggetto, messaggio });
			}
		} catch (formErr) {
			console.warn('Salvataggio form opzionale saltato:', formErr);
		}

		return jsonOutput({ status: 'success' });
	} catch (err) {
		console.error('Errore gestione richiesta:', err);
		return jsonOutput({ status: 'error', message: String(err.message || err) });
	}
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

function submitToForm(formId, data) {
	const fieldMap = {
		nome: 'Nome e Cognome',
		email: 'Email',
		oggetto: 'Oggetto',
		messaggio: 'Messaggio',
	};

	const form = FormApp.openById(formId);
	const formItems = form.getItems();
	const response = form.createResponse();

	Object.keys(fieldMap).forEach((field) => {
		const title = fieldMap[field];
		const value = data[field];
		const item = formItems.find(
			(i) =>
				i.getTitle().replace(/\s/g, '').trim().toLowerCase() ===
				title.replace(/\s/g, '').trim().toLowerCase()
		);
		if (item) {
			const itemType = item.getType();
			if (itemType === FormApp.ItemType.TEXT) {
				response.withItemResponse(item.asTextItem().createResponse(value));
			} else if (itemType === FormApp.ItemType.PARAGRAPH_TEXT) {
				response.withItemResponse(item.asParagraphTextItem().createResponse(value));
			} else if (itemType === FormApp.ItemType.MULTIPLE_CHOICE) {
				response.withItemResponse(item.asMultipleChoiceItem().createResponse(value));
			} else if (itemType === FormApp.ItemType.LIST) {
				response.withItemResponse(item.asListItem().createResponse(value));
			}
		}
	});

	response.submit();
}

function jsonOutput(obj) {
	return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
		ContentService.MimeType.JSON
	);
}

/**
 * Funzione di test e prima autorizzazione.
 * Esegui questa funzione dall'editor Apps Script (seleziona "authorizeScript" e clicca "Esegui" / "Run")
 * per sbloccare la schermata di autorizzazione OAuth per l'invio email e il salvataggio form.
 */
function authorizeScript() {
	const quota = MailApp.getRemainingDailyQuota();
	Logger.log('Autorizzazione completata con successo!');
	Logger.log('Destinatario principale: ' + MAIN_RECIPIENT);
	Logger.log('Quota giornaliera email rimanente per questo account: ' + quota);
}
