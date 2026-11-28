<script lang="ts">
	import { onMount, tick } from 'svelte';
	import Sortable from 'sortablejs';
	import {
		GripVertical,
		Upload,
		X,
		Check,
		AlertTriangle,
		RotateCcw,
		Copy,
		FileText,
		ArrowRight,
		ArrowLeft,
		Trash2,
		Clock,
		Calendar,
		Lock,
		ExternalLink,
		LogOut,
	} from '@lucide/svelte';
	import MathFormula from './MathFormula.svelte';
	import {
		AUTO_ADMISSION_ROLES,
		COMITATI_LOCALI_OPTIONS,
		GASO_LABELS,
		GASO_SHORT_LABELS,
		LIVELLI_STUDIO_OPTIONS,
		POSTURE_SLIDER_CONFIG,
		REGISTRATION_STEPS,
		RUOLI_SPECIALI_OPTIONS,
		SCALE_SLIDER_CONFIG,
		THEMATIC_AREAS,
		computeQuizMatching,
		type PillarKey,
		type RadioQuestionKey,
		type ThematicArea,
		type ThematicAreaId,
	} from '../data/registrationData';
	import {
		isMinorFromCodiceFiscale,
		normalizeCodiceFiscale,
		validateCodiceFiscale,
	} from '../utils/codiceFiscale';
	import {
		DRAFT_STORAGE_KEY,
		MOTIVATION_MAX_BYTES,
		MOTIVATION_UI_MAX_MB,
		TALK_MAX_BYTES,
		TALK_UI_MAX_MB,
		TEST_ACCESS_STORAGE_KEY,
		encodeFileToBase64,
		fetchRegistrationStatus,
		formatBytesToMB,
		isValidEmail,
		isValidHttpUrl,
		submitRegistration,
		verifyTestingPasscode,
		type RegistrationDraft,
		type RegistrationGateState,
		type RegistrationPayload,
		type SavedFileReceipt,
	} from '../utils/registrationForm';
	import {
		cleanupTurnstileContainer,
		hasTurnstileConfigured,
		obtainTurnstileToken,
	} from '../utils/turnstile';

	const defaultBase = import.meta.env.BASE_URL.replace(/\/$/, '');

	let {
		criteriPdfUrl = `${defaultBase}/docs/Criteri_di_selezione_CISF27.pdf`,
		codiceEticoPdfUrl = `${defaultBase}/docs/Codice_Etico_CISF27.pdf`,
		criteriPageUrl = `${defaultBase}/criteri`,
		criteriPublicUrlLabel = 'ai-sf.it/cisf27/criteri',
		conferenceTitle = 'CISF27',
		conferenceLocation = 'Bologna',
		conferenceDates = '19–23 aprile 2027',
		contactEmail = 'cisf27@ai-sf.it',
		priceWithAccommodation = '€120',
		priceWithoutAccommodation = '€70',
		accommodationName = 'Combo Bologna',
	}: {
		criteriPdfUrl?: string;
		codiceEticoPdfUrl?: string;
		criteriPageUrl?: string;
		criteriPublicUrlLabel?: string;
		conferenceTitle?: string;
		conferenceLocation?: string;
		conferenceDates?: string;
		contactEmail?: string;
		priceWithAccommodation?: string;
		priceWithoutAccommodation?: string;
		accommodationName?: string;
	} = $props();

	const totalSteps = REGISTRATION_STEPS.length;

	// Gatekeeper lifecycle state (server-authoritative via Google Apps Script CONFIG tab)
	let hydrated = $state(false);
	let loadingSlow = $state(false);
	let gateState = $state<RegistrationGateState>('loading');
	let gateError = $state<string | null>(null);
	let serverOffsetMs = $state(0);
	let openAtIso = $state<string | null>(null);
	let closeAtIso = $state<string | null>(null);
	let nowServerMs = $state(Date.now());

	// Testing mode unlock state (passcode persisted ONLY in sessionStorage, never localStorage)
	let showTesterAccess = $state(false);
	let testingUnlocked = $state(false);
	let testingAccessCode = $state('');
	let passcodeInput = $state('');
	let verifyingPasscode = $state(false);
	let passcodeError = $state<string | null>(null);

	const showWizard = $derived(gateState === 'open' || (gateState === 'testing' && testingUnlocked));

	const openAtMs = $derived.by(() => {
		if (!openAtIso) return NaN;
		return Date.parse(openAtIso);
	});

	const formattedOpenAtRome = $derived.by(() => {
		if (!openAtIso || isNaN(openAtMs)) return null;
		const formatted = new Intl.DateTimeFormat('it-IT', {
			timeZone: 'Europe/Rome',
			weekday: 'long',
			day: 'numeric',
			month: 'long',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
		}).format(new Date(openAtMs));
		return formatted.charAt(0).toUpperCase() + formatted.slice(1);
	});

	const formattedCloseAtRome = $derived.by(() => {
		if (!closeAtIso) return null;
		const closeMs = Date.parse(closeAtIso);
		if (isNaN(closeMs)) return null;
		return new Intl.DateTimeFormat('it-IT', {
			timeZone: 'Europe/Rome',
			day: 'numeric',
			month: 'long',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
		}).format(new Date(closeMs));
	});

	const countdownParts = $derived.by(() => {
		if (isNaN(openAtMs)) return null;
		const remainingMs = Math.max(0, openAtMs - nowServerMs);
		const totalSeconds = Math.ceil(remainingMs / 1000);
		const days = Math.floor(totalSeconds / 86400);
		const hours = Math.floor((totalSeconds % 86400) / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const seconds = totalSeconds % 60;
		return {
			days: String(days).padStart(2, '0'),
			hours: String(hours).padStart(2, '0'),
			minutes: String(minutes).padStart(2, '0'),
			seconds: String(seconds).padStart(2, '0'),
		};
	});

	// Navigation & UI state
	let currentStep = $state(0);
	let showCriteriModal = $state(false);
	let draftRestored = $state(false);
	let confirmClearDraft = $state(false);
	let draftLoaded = $state(false);
	let errors = $state<Record<string, string>>({});
	let stepErrorBanner = $state<string | null>(null);

	// Submission state
	let submitting = $state(false);
	let submitStage = $state('');
	let submitProgress = $state(0);
	let submitError = $state<string | null>(null);
	let successReceipt = $state<{
		candidateId: string;
		isTest?: boolean;
		filesSaved: SavedFileReceipt[];
		emailSent: boolean;
		emailWarning?: string;
	} | null>(null);
	let copiedReceipt = $state(false);
	let turnstileContainerEl = $state<HTMLDivElement | null>(null);

	$effect(() => {
		const el = turnstileContainerEl;
		return () => cleanupTurnstileContainer(el);
	});

	// Step 0 fields
	let ruoloSpeciale = $state('');
	let maggiorenne = $state<'' | 'si' | 'no'>('');
	let checkCriteri = $state(false);
	let tipologiaQuota = $state('');
	let subPreferenza = $state('pref_con_letto');

	// Step 1 fields
	let tipoLettera = $state<'testo' | 'video' | 'audio' | 'canvas'>('testo');
	let motivazioneFile = $state<File | null>(null);
	let motivazioneDragOver = $state(false);
	let linkProgetto = $state('');
	let checkParallel = $state(false);
	let parallelReadiness = $state('si_definito');
	let parallelTitle = $state('');
	let parallelAbstract = $state('');
	let talkFile = $state<File | null>(null);

	// Step 2 fields
	let nome = $state('');
	let cognome = $state('');
	let email = $state('');
	let codiceFiscale = $state('');
	let cfAtipico = $state(false);
	let soprannome = $state('');
	let pronomi = $state('');
	let genere = $state('');
	let genereSpecifica = $state('');
	let ateneo = $state('');
	let corsoLaurea = $state('');
	let livelloStudio = $state('');
	let curriculum = $state('');
	let iscrittoAisf = $state('');
	let comitatoLocale = $state('');
	let neoIscritto = $state('');
	let dettaglioWg = $state('');
	let nextLeaders = $state('');
	let nextLeadersLink = $state('');
	let attivitaLc = $state('');
	let partAisf = $state('');
	let partIaps = $state('');
	let orgAisf = $state('');
	let elencoPartecipazioni = $state('');

	// Step 3 fields
	let pillars = $state<Record<PillarKey, number>>({
		storia: 2,
		energia: 2,
		lavoro: 2,
		ricerca: 2,
	});
	let quizRadios = $state<Record<RadioQuestionKey, string>>({
		q1: '',
		q2: '',
		q3: '',
		q5: '',
		q6: '',
		q7: '',
		q8: '',
		q9: '',
		q11: '',
		q12: '',
	});
	let quizScaleVal = $state(3);
	let quizScaleTouched = $state(false);
	let quizPostureVal = $state(2);
	let quizPostureTouched = $state(false);
	let manualOrderIds = $state<ThematicAreaId[]>(THEMATIC_AREAS.map((a) => a.id));
	let isManualOrder = $state(false);
	let matchingAccepted = $state(false);

	// Sortable container ref
	let rankingListEl = $state<HTMLDivElement | null>(null);

	// Step 4 fields
	let disponibilitaMatrimoniale = $state('');
	let matrimonialeNominativo = $state('');
	let camereAccettate = $state<string[]>(['Doppia', 'Tripla', 'Quadrupla']);
	let preferenzaCompagni = $state('');
	let coinquiliniSpecifici = $state('');
	let regimeAlimentare = $state('');
	let regimeAltro = $state('');
	let allergiePresenti = $state('');
	let allergieElenco = $state('');
	let allergieGravita = $state('');
	let allergiePrecauzioni = $state('');
	let noteSanitarie = $state('');
	let accessibilita = $state('');

	// Step 5 fields
	let commentoFinale = $state('');
	let checkPrivacy = $state(false);
	let checkVeridicita = $state(false);
	let checkPagamento = $state(false);

	// File input DOM refs for reset
	let motivazioneInputEl = $state<HTMLInputElement | null>(null);
	let talkInputEl = $state<HTMLInputElement | null>(null);

	// Derived flags
	const isAutoAdmissionRole = $derived(AUTO_ADMISSION_ROLES.includes(ruoloSpeciale));
	const hasSpecialNationalRole = $derived(ruoloSpeciale !== '' && ruoloSpeciale !== 'nessuno');
	const specialNationalRoleLabel = $derived(
		RUOLI_SPECIALI_OPTIONS.find((opt) => opt.value === ruoloSpeciale)?.label ?? ''
	);
	const showAisfMemberFields = $derived(iscrittoAisf === 'si');
	const showBolognaNotice = $derived(showAisfMemberFields && comitatoLocale === 'BOLOGNA');
	const showWgDetailField = $derived(showAisfMemberFields && ruoloSpeciale === 'working_group');
	const showNextLeadersLinkField = $derived(showAisfMemberFields && nextLeaders === 'si');
	const needElencoPartecipazioni = $derived(
		showAisfMemberFields &&
			((partAisf !== '' && partAisf !== 'mai') ||
				(partIaps !== '' && partIaps !== 'mai') ||
				(orgAisf !== '' && orgAisf !== 'mai'))
	);
	const showAccommodationCard = $derived(tipologiaQuota !== 'senza_letto');
	const cfIndicatesMinor = $derived(
		!cfAtipico && isMinorFromCodiceFiscale(codiceFiscale, cfAtipico)
	);

	// Quiz computed results
	const quizResult = $derived(
		computeQuizMatching(
			quizRadios,
			quizScaleVal,
			quizScaleTouched,
			quizPostureVal,
			quizPostureTouched,
			pillars
		)
	);

	const displayedAreas = $derived<ThematicArea[]>(
		isManualOrder
			? manualOrderIds
					.map((id) => THEMATIC_AREAS.find((a) => a.id === id))
					.filter((a): a is ThematicArea => a !== undefined)
			: quizResult.sortedAreas
	);

	const canAcceptRanking = $derived(quizResult.answeredCount === 12);

	const summaryQuotaText = $derived.by(() => {
		if (tipologiaQuota === 'con_letto')
			return `Con Alloggio Garantito — ${priceWithAccommodation} (${accommodationName})`;
		if (tipologiaQuota === 'senza_letto')
			return `Senza Alloggio — ${priceWithoutAccommodation} (Autonomo)`;
		if (tipologiaQuota === 'indifferente') {
			const subMap: Record<string, string> = {
				pref_con_letto: 'preferenza con alloggio',
				pref_senza_letto: 'preferenza senza alloggio',
				pref_pura: '100% indifferente',
			};
			return `Indifferente / Flessibile (${priceWithAccommodation} o ${priceWithoutAccommodation} — ${subMap[subPreferenza] ?? 'flessibile'})`;
		}
		return 'Non selezionata';
	});

	const summaryParallelText = $derived.by(() => {
		if (!checkParallel) return 'No Parallel / Talk';
		return parallelReadiness === 'forse_in_corso'
			? `Sì / Forse in via di definizione — "${parallelTitle || 'Titolo da inserire'}"`
			: `Sì, proposta strutturata — "${parallelTitle || 'Titolo da inserire'}"`;
	});

	// Force AISF membership = 'si' whenever a national special role is selected in Step 1
	$effect(() => {
		if (hasSpecialNationalRole && iscrittoAisf !== 'si') {
			iscrittoAisf = 'si';
			clearFieldError('iscritto_aisf');
		}
	});

	function clearFieldError(fieldId: string) {
		if (errors[fieldId]) {
			const next = { ...errors };
			delete next[fieldId];
			errors = next;
			if (Object.keys(next).length === 0) {
				stepErrorBanner = null;
			}
		}
	}

	function buildDraftSnapshot(): RegistrationDraft {
		return {
			ruoloSpeciale,
			maggiorenne,
			checkCriteri,
			tipologiaQuota,
			subPreferenza,
			tipoLettera,
			linkProgetto,
			checkParallel,
			parallelReadiness,
			parallelTitle,
			parallelAbstract,
			nome,
			cognome,
			email,
			codiceFiscale,
			cfAtipico,
			soprannome,
			pronomi,
			genere,
			genereSpecifica,
			ateneo,
			corsoLaurea,
			livelloStudio,
			curriculum,
			iscrittoAisf,
			comitatoLocale,
			neoIscritto,
			dettaglioWg,
			nextLeaders,
			nextLeadersLink,
			attivitaLc,
			partAisf,
			partIaps,
			orgAisf,
			elencoPartecipazioni,
			pillars: { ...pillars },
			quizRadios: { ...quizRadios },
			quizScaleVal,
			quizScaleTouched,
			quizPostureVal,
			quizPostureTouched,
			manualOrderIds: [...manualOrderIds],
			isManualOrder,
			matchingAccepted,
			disponibilitaMatrimoniale,
			matrimonialeNominativo,
			camereAccettate: [...camereAccettate],
			preferenzaCompagni,
			coinquiliniSpecifici,
			regimeAlimentare,
			regimeAltro,
			allergiePresenti,
			allergieElenco,
			allergieGravita,
			allergiePrecauzioni,
			noteSanitarie,
			accessibilita,
			commentoFinale,
			checkPrivacy,
			checkVeridicita,
			checkPagamento,
		};
	}

	function applyDraft(draft: Partial<RegistrationDraft>) {
		if (typeof draft.ruoloSpeciale === 'string') ruoloSpeciale = draft.ruoloSpeciale;
		if (draft.maggiorenne === '' || draft.maggiorenne === 'si' || draft.maggiorenne === 'no') {
			maggiorenne = draft.maggiorenne;
		}
		if (typeof draft.checkCriteri === 'boolean') checkCriteri = draft.checkCriteri;
		if (typeof draft.tipologiaQuota === 'string') tipologiaQuota = draft.tipologiaQuota;
		if (typeof draft.subPreferenza === 'string') subPreferenza = draft.subPreferenza;

		if (
			draft.tipoLettera === 'testo' ||
			draft.tipoLettera === 'video' ||
			draft.tipoLettera === 'audio' ||
			draft.tipoLettera === 'canvas'
		) {
			tipoLettera = draft.tipoLettera;
		}
		if (typeof draft.linkProgetto === 'string') linkProgetto = draft.linkProgetto;
		if (typeof draft.checkParallel === 'boolean') checkParallel = draft.checkParallel;
		if (typeof draft.parallelReadiness === 'string') parallelReadiness = draft.parallelReadiness;
		if (typeof draft.parallelTitle === 'string') parallelTitle = draft.parallelTitle;
		if (typeof draft.parallelAbstract === 'string') parallelAbstract = draft.parallelAbstract;

		if (typeof draft.nome === 'string') nome = draft.nome;
		if (typeof draft.cognome === 'string') cognome = draft.cognome;
		if (typeof draft.email === 'string') email = draft.email;
		if (typeof draft.codiceFiscale === 'string') codiceFiscale = draft.codiceFiscale;
		if (typeof draft.cfAtipico === 'boolean') cfAtipico = draft.cfAtipico;
		if (typeof draft.soprannome === 'string') soprannome = draft.soprannome;
		if (typeof draft.pronomi === 'string') pronomi = draft.pronomi;
		if (typeof draft.genere === 'string') genere = draft.genere;
		if (typeof draft.genereSpecifica === 'string') genereSpecifica = draft.genereSpecifica;
		if (typeof draft.ateneo === 'string') ateneo = draft.ateneo;
		if (typeof draft.corsoLaurea === 'string') corsoLaurea = draft.corsoLaurea;
		if (typeof draft.livelloStudio === 'string') livelloStudio = draft.livelloStudio;
		if (typeof draft.curriculum === 'string') curriculum = draft.curriculum;
		if (typeof draft.iscrittoAisf === 'string') iscrittoAisf = draft.iscrittoAisf;
		if (typeof draft.comitatoLocale === 'string') comitatoLocale = draft.comitatoLocale;
		if (typeof draft.neoIscritto === 'string') neoIscritto = draft.neoIscritto;
		if (typeof draft.dettaglioWg === 'string') dettaglioWg = draft.dettaglioWg;
		if (typeof draft.nextLeaders === 'string') nextLeaders = draft.nextLeaders;
		if (typeof draft.nextLeadersLink === 'string') nextLeadersLink = draft.nextLeadersLink;
		if (typeof draft.attivitaLc === 'string') attivitaLc = draft.attivitaLc;
		if (typeof draft.partAisf === 'string') partAisf = draft.partAisf;
		if (typeof draft.partIaps === 'string') partIaps = draft.partIaps;
		if (typeof draft.orgAisf === 'string') orgAisf = draft.orgAisf;
		if (typeof draft.elencoPartecipazioni === 'string')
			elencoPartecipazioni = draft.elencoPartecipazioni;

		if (draft.pillars && typeof draft.pillars === 'object') {
			pillars = {
				storia: Number(draft.pillars.storia ?? 2),
				energia: Number(draft.pillars.energia ?? 2),
				lavoro: Number(draft.pillars.lavoro ?? 2),
				ricerca: Number(draft.pillars.ricerca ?? 2),
			};
		}
		if (draft.quizRadios && typeof draft.quizRadios === 'object') {
			quizRadios = {
				q1: String(draft.quizRadios.q1 ?? ''),
				q2: String(draft.quizRadios.q2 ?? ''),
				q3: String(draft.quizRadios.q3 ?? ''),
				q5: String(draft.quizRadios.q5 ?? ''),
				q6: String(draft.quizRadios.q6 ?? ''),
				q7: String(draft.quizRadios.q7 ?? ''),
				q8: String(draft.quizRadios.q8 ?? ''),
				q9: String(draft.quizRadios.q9 ?? ''),
				q11: String(draft.quizRadios.q11 ?? ''),
				q12: String(draft.quizRadios.q12 ?? ''),
			};
		}
		if (typeof draft.quizScaleVal === 'number') quizScaleVal = draft.quizScaleVal;
		if (typeof draft.quizScaleTouched === 'boolean') quizScaleTouched = draft.quizScaleTouched;
		if (typeof draft.quizPostureVal === 'number') quizPostureVal = draft.quizPostureVal;
		if (typeof draft.quizPostureTouched === 'boolean')
			quizPostureTouched = draft.quizPostureTouched;
		if (
			Array.isArray(draft.manualOrderIds) &&
			draft.manualOrderIds.length === THEMATIC_AREAS.length
		) {
			const validIds = new Set(THEMATIC_AREAS.map((a) => a.id));
			const filtered = draft.manualOrderIds.filter((id): id is ThematicAreaId => validIds.has(id));
			if (filtered.length === THEMATIC_AREAS.length) {
				manualOrderIds = filtered;
			}
		}
		if (typeof draft.isManualOrder === 'boolean') isManualOrder = draft.isManualOrder;
		if (typeof draft.matchingAccepted === 'boolean') matchingAccepted = draft.matchingAccepted;

		if (typeof draft.disponibilitaMatrimoniale === 'string')
			disponibilitaMatrimoniale = draft.disponibilitaMatrimoniale;
		if (typeof draft.matrimonialeNominativo === 'string')
			matrimonialeNominativo = draft.matrimonialeNominativo;
		if (Array.isArray(draft.camereAccettate)) {
			camereAccettate = draft.camereAccettate.filter((c) => typeof c === 'string');
		}
		if (typeof draft.preferenzaCompagni === 'string') preferenzaCompagni = draft.preferenzaCompagni;
		if (typeof draft.coinquiliniSpecifici === 'string')
			coinquiliniSpecifici = draft.coinquiliniSpecifici;
		if (typeof draft.regimeAlimentare === 'string') regimeAlimentare = draft.regimeAlimentare;
		if (typeof draft.regimeAltro === 'string') regimeAltro = draft.regimeAltro;
		if (typeof draft.allergiePresenti === 'string') allergiePresenti = draft.allergiePresenti;
		if (typeof draft.allergieElenco === 'string') allergieElenco = draft.allergieElenco;
		if (typeof draft.allergieGravita === 'string') allergieGravita = draft.allergieGravita;
		if (typeof draft.allergiePrecauzioni === 'string')
			allergiePrecauzioni = draft.allergiePrecauzioni;
		if (typeof draft.noteSanitarie === 'string') noteSanitarie = draft.noteSanitarie;
		if (typeof draft.accessibilita === 'string') accessibilita = draft.accessibilita;

		if (typeof draft.commentoFinale === 'string') commentoFinale = draft.commentoFinale;
		if (typeof draft.checkPrivacy === 'boolean') checkPrivacy = draft.checkPrivacy;
		if (typeof draft.checkVeridicita === 'boolean') checkVeridicita = draft.checkVeridicita;
		if (typeof draft.checkPagamento === 'boolean') checkPagamento = draft.checkPagamento;
	}

	function resetAllFields() {
		ruoloSpeciale = '';
		maggiorenne = '';
		checkCriteri = false;
		tipologiaQuota = '';
		subPreferenza = 'pref_con_letto';

		tipoLettera = 'testo';
		motivazioneFile = null;
		linkProgetto = '';
		checkParallel = false;
		parallelReadiness = 'si_definito';
		parallelTitle = '';
		parallelAbstract = '';
		talkFile = null;
		if (motivazioneInputEl) motivazioneInputEl.value = '';
		if (talkInputEl) talkInputEl.value = '';

		nome = '';
		cognome = '';
		email = '';
		codiceFiscale = '';
		cfAtipico = false;
		soprannome = '';
		pronomi = '';
		genere = '';
		genereSpecifica = '';
		ateneo = '';
		corsoLaurea = '';
		livelloStudio = '';
		curriculum = '';
		iscrittoAisf = '';
		comitatoLocale = '';
		neoIscritto = '';
		dettaglioWg = '';
		nextLeaders = '';
		nextLeadersLink = '';
		attivitaLc = '';
		partAisf = '';
		partIaps = '';
		orgAisf = '';
		elencoPartecipazioni = '';

		pillars = { storia: 2, energia: 2, lavoro: 2, ricerca: 2 };
		quizRadios = {
			q1: '',
			q2: '',
			q3: '',
			q5: '',
			q6: '',
			q7: '',
			q8: '',
			q9: '',
			q11: '',
			q12: '',
		};
		quizScaleVal = 3;
		quizScaleTouched = false;
		quizPostureVal = 2;
		quizPostureTouched = false;
		manualOrderIds = THEMATIC_AREAS.map((a) => a.id);
		isManualOrder = false;
		matchingAccepted = false;

		disponibilitaMatrimoniale = '';
		matrimonialeNominativo = '';
		camereAccettate = ['Doppia', 'Tripla', 'Quadrupla'];
		preferenzaCompagni = '';
		coinquiliniSpecifici = '';
		regimeAlimentare = '';
		regimeAltro = '';
		allergiePresenti = '';
		allergieElenco = '';
		allergieGravita = '';
		allergiePrecauzioni = '';
		noteSanitarie = '';
		accessibilita = '';

		commentoFinale = '';
		checkPrivacy = false;
		checkVeridicita = false;
		checkPagamento = false;

		errors = {};
		stepErrorBanner = null;
		submitError = null;
		currentStep = 0;
	}

	function clearSavedDraft() {
		try {
			localStorage.removeItem(DRAFT_STORAGE_KEY);
		} catch {
			// Ignore storage errors
		}
		resetAllFields();
		draftRestored = false;
		confirmClearDraft = false;
	}

	async function loadGateStatus() {
		gateState = 'loading';
		loadingSlow = false;
		gateError = null;
		passcodeError = null;

		const slowTimer = window.setTimeout(() => {
			if (gateState === 'loading') {
				loadingSlow = true;
			}
		}, 5000);

		try {
			const res = await fetchRegistrationStatus();
			if (res.status !== 'ok' || !res.effectiveState) {
				console.warn('[CISF27 Gatekeeper] Status check failed:', res.message);
				gateState = 'error';
				gateError =
					res.message ??
					'Impossibile verificare lo stato delle candidature in questo momento. Riprova tra qualche istante.';
				return;
			}

			const parsedServerTime = res.serverTime ? Date.parse(res.serverTime) : NaN;
			serverOffsetMs = !isNaN(parsedServerTime) ? parsedServerTime - Date.now() : 0;
			nowServerMs = Date.now() + serverOffsetMs;
			openAtIso = res.openAt ?? null;
			closeAtIso = res.closeAt ?? null;

			if (res.effectiveState === 'testing') {
				let storedCode = '';
				try {
					storedCode = sessionStorage.getItem(TEST_ACCESS_STORAGE_KEY)?.trim() ?? '';
				} catch {
					// Ignore sessionStorage restrictions
				}

				if (storedCode) {
					const verifyRes = await verifyTestingPasscode(storedCode);
					if (verifyRes.ok && verifyRes.valid) {
						testingAccessCode = storedCode;
						testingUnlocked = true;
						gateState = 'testing';
						return;
					}
					if (verifyRes.ok && !verifyRes.valid) {
						try {
							sessionStorage.removeItem(TEST_ACCESS_STORAGE_KEY);
						} catch {
							// Ignore
						}
						testingAccessCode = '';
						testingUnlocked = false;
					} else {
						testingAccessCode = '';
						testingUnlocked = false;
						showTesterAccess = true;
						passcodeError =
							verifyRes.error ?? 'Impossibile rivalidare il codice di accesso testing. Riprova.';
					}
				} else {
					testingAccessCode = '';
					testingUnlocked = false;
				}

				gateState = 'testing';
				return;
			}

			// Outside testing mode, discard any leftover session testing passcode
			try {
				sessionStorage.removeItem(TEST_ACCESS_STORAGE_KEY);
			} catch {
				// Ignore
			}
			testingAccessCode = '';
			testingUnlocked = false;
			gateState = res.effectiveState;
		} catch (err) {
			console.error('[CISF27 Gatekeeper] Unexpected error while loading gate status:', err);
			gateState = 'error';
			gateError =
				err instanceof Error && err.message
					? err.message
					: 'Errore imprevisto durante la comunicazione con il server AISF. Riprova tra qualche istante.';
		} finally {
			window.clearTimeout(slowTimer);
			loadingSlow = false;
		}
	}

	async function handleTestPasscodeSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (verifyingPasscode) return;

		const trimmed = passcodeInput.trim();
		if (!trimmed) {
			passcodeError = 'Inserisci la passphrase di accesso fornita dal Comitato Organizzatore.';
			return;
		}

		verifyingPasscode = true;
		passcodeError = null;

		try {
			const verifyRes = await verifyTestingPasscode(trimmed);
			if (verifyRes.ok && verifyRes.valid) {
				try {
					sessionStorage.setItem(TEST_ACCESS_STORAGE_KEY, trimmed);
				} catch {
					// Ignore sessionStorage unavailability
				}
				testingAccessCode = trimmed;
				testingUnlocked = true;
				passcodeInput = '';
				passcodeError = null;
				await tick();
				window.scrollTo({ top: 0, behavior: 'smooth' });
			} else if (verifyRes.ok && !verifyRes.valid) {
				passcodeError = 'Passphrase non valida. Verifica il codice ricevuto dal CO e riprova.';
			} else {
				passcodeError =
					verifyRes.error ?? 'Errore durante la verifica della passphrase. Riprova tra poco.';
			}
		} finally {
			verifyingPasscode = false;
		}
	}

	function exitTestingMode() {
		try {
			sessionStorage.removeItem(TEST_ACCESS_STORAGE_KEY);
		} catch {
			// Ignore
		}
		testingUnlocked = false;
		testingAccessCode = '';
		passcodeInput = '';
		passcodeError = null;
		submitError = null;
		window.scrollTo({ top: 0, behavior: 'smooth' });
	}

	// Restore draft and query authoritative gate status on mount
	onMount(() => {
		hydrated = true;
		try {
			const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
			if (raw) {
				const parsed = JSON.parse(raw) as Partial<RegistrationDraft>;
				if (parsed && typeof parsed === 'object') {
					applyDraft(parsed);
					draftRestored = true;
				}
			}
		} catch {
			// Ignore corrupted localStorage draft
		} finally {
			draftLoaded = true;
		}

		try {
			const params = new URLSearchParams(window.location.search);
			if (params.get('beta') === '1' || params.get('test') === '1') {
				showTesterAccess = true;
			}
		} catch {
			// Ignore URL parsing errors
		}

		void loadGateStatus();
	});

	// Server-synchronized live countdown while waiting for OPEN_AT
	$effect(() => {
		if (gateState !== 'before_open') return;
		const targetMs = openAtMs;
		if (isNaN(targetMs)) return;

		const tickCountdown = () => {
			const currentServerNow = Date.now() + serverOffsetMs;
			nowServerMs = currentServerNow;
			if (currentServerNow >= targetMs) {
				gateState = 'open';
			}
		};

		tickCountdown();
		const intervalId = window.setInterval(tickCountdown, 1000);
		return () => {
			window.clearInterval(intervalId);
		};
	});

	// Auto-save draft whenever reactive form values change (only while wizard is active)
	$effect(() => {
		const snapshot = buildDraftSnapshot();
		if (!draftLoaded || !showWizard || successReceipt) return;
		try {
			localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(snapshot));
		} catch {
			// Ignore quota / private browsing errors
		}
	});

	// Initialize SortableJS on the 14 thematic areas whenever Step 3 is mounted
	$effect(() => {
		if (currentStep !== 3 || !rankingListEl) return;

		const container = rankingListEl;
		const sortable = Sortable.create(container, {
			animation: 180,
			handle: '.drag-handle',
			ghostClass: 'opacity-40',
			chosenClass: 'ring-2',
			dragClass: 'shadow-xl',
			forceFallback: false,
			scroll: true,
			scrollSensitivity: 60,
			scrollSpeed: 12,
			onEnd(evt) {
				const { oldIndex, newIndex, item, from } = evt;
				if (oldIndex === undefined || newIndex === undefined || oldIndex === newIndex) return;

				// Revert SortableJS DOM mutation synchronously so Svelte 5 keyed {#each} stays in sync
				const referenceNode = from.children[oldIndex + (newIndex < oldIndex ? 1 : 0)] ?? null;
				from.insertBefore(item, referenceNode);

				// Apply reorder to Svelte reactive state
				const currentIds = displayedAreas.map((a) => a.id);
				const [moved] = currentIds.splice(oldIndex, 1);
				if (moved) {
					currentIds.splice(newIndex, 0, moved);
					manualOrderIds = currentIds;
					isManualOrder = true;
					matchingAccepted = false;
				}
			},
		});

		return () => {
			sortable.destroy();
		};
	});

	function clearQuizErrors() {
		const next = { ...errors };
		let changed = false;
		for (const key of Object.keys(next)) {
			if (key.startsWith('quiz_')) {
				delete next[key];
				changed = true;
			}
		}
		if (changed) {
			errors = next;
			if (Object.keys(next).length === 0) stepErrorBanner = null;
		}
	}

	function moveThematicItem(index: number, direction: -1 | 1) {
		const targetIndex = index + direction;
		const currentIds = displayedAreas.map((a) => a.id);
		if (targetIndex < 0 || targetIndex >= currentIds.length) return;
		const temp = currentIds[index];
		currentIds[index] = currentIds[targetIndex];
		currentIds[targetIndex] = temp;
		manualOrderIds = currentIds;
		isManualOrder = true;
		matchingAccepted = false;
	}

	function restoreQuizOrder() {
		isManualOrder = false;
		manualOrderIds = quizResult.sortedAreas.map((a) => a.id);
		matchingAccepted = false;
	}

	function acceptMatchingRanking() {
		if (!canAcceptRanking) {
			matchingAccepted = false;
			errors = {
				...errors,
				quiz_matching: 'Completa tutte le 12 sfide del quiz prima di confermare l’ordinamento.',
			};
			return;
		}
		matchingAccepted = true;
		clearQuizErrors();
	}

	function onQuizInteraction() {
		matchingAccepted = false;
		if (!isManualOrder) {
			manualOrderIds = quizResult.sortedAreas.map((a) => a.id);
		}
		clearFieldError('quiz_matching');
	}

	function handleMotivazioneFile(file: File | null) {
		clearFieldError('motivazione_file');
		clearFieldError('motivazione_required');
		if (!file) {
			motivazioneFile = null;
			if (motivazioneInputEl) motivazioneInputEl.value = '';
			return;
		}
		if (file.size > MOTIVATION_MAX_BYTES) {
			motivazioneFile = null;
			if (motivazioneInputEl) motivazioneInputEl.value = '';
			errors = {
				...errors,
				motivazione_file: `Il file "${file.name}" pesa ${formatBytesToMB(file.size)} MB e supera il limite massimo di ${MOTIVATION_UI_MAX_MB} MB. Per video HD o file più pesanti, caricalo su Drive/YouTube non in elenco e inserisci il link nel campo "Link esterno" qui sotto!`,
			};
			return;
		}
		motivazioneFile = file;
	}

	function handleMotivazioneDrop(e: DragEvent) {
		e.preventDefault();
		motivazioneDragOver = false;
		const file = e.dataTransfer?.files?.[0] ?? null;
		if (file) handleMotivazioneFile(file);
	}

	function handleTalkFile(file: File | null) {
		clearFieldError('talk_file');
		if (!file) {
			talkFile = null;
			if (talkInputEl) talkInputEl.value = '';
			return;
		}
		if (file.size > TALK_MAX_BYTES) {
			talkFile = null;
			if (talkInputEl) talkInputEl.value = '';
			errors = {
				...errors,
				talk_file: `L'allegato "${file.name}" pesa ${formatBytesToMB(file.size)} MB e supera il limite massimo di ${TALK_UI_MAX_MB} MB.`,
			};
			return;
		}
		talkFile = file;
	}

	function toggleCameraType(type: string) {
		if (camereAccettate.includes(type)) {
			camereAccettate = camereAccettate.filter((c) => c !== type);
		} else {
			camereAccettate = [...camereAccettate, type];
		}
		clearFieldError('camere_accettate');
	}

	function handleCfInput(e: Event) {
		const target = e.currentTarget as HTMLInputElement;
		codiceFiscale = normalizeCodiceFiscale(target.value);
		clearFieldError('codice_fiscale');
	}

	// =========================================================================
	// RIGOROUS STEP-BY-STEP VALIDATION (NO RED ASTERISKS)
	// =========================================================================
	function validateStep(stepIndex: number): Record<string, string> {
		const stepErrors: Record<string, string> = {};

		if (stepIndex === 0) {
			if (!ruoloSpeciale) {
				stepErrors.ruolo_speciale =
					'Campo richiesto: seleziona un ruolo o nessun ruolo / neo-iscrittə';
			}
			if (!maggiorenne) {
				stepErrors.maggiorenne = 'Campo richiesto: indica se sei maggiorenne';
			} else if (maggiorenne !== 'si') {
				stepErrors.maggiorenne =
					'La candidatura a CISF27 è riservata esclusivamente a persone maggiorenni: non è possibile procedere.';
			}
			if (!checkCriteri) {
				stepErrors.check_criteri = 'Campo richiesto: conferma di aver preso visione dei criteri';
			}
			if (!tipologiaQuota) {
				stepErrors.tipologia_quota = 'Campo richiesto: seleziona una tipologia di partecipazione';
			} else if (tipologiaQuota === 'indifferente' && !subPreferenza) {
				stepErrors.sub_preferenza = 'Campo richiesto';
			}
		}

		if (stepIndex === 1) {
			const trimmedLink = linkProgetto.trim();

			if (motivazioneFile && motivazioneFile.size > MOTIVATION_MAX_BYTES) {
				stepErrors.motivazione_file = `Il file supera il limite di ${MOTIVATION_UI_MAX_MB} MB: usa il campo Link esterno qui sotto.`;
			}

			if (trimmedLink && !isValidHttpUrl(trimmedLink)) {
				stepErrors.link_progetto =
					'Inserisci un URL valido completo di https:// (es. https://drive.google.com/...)';
			}

			if (!isAutoAdmissionRole) {
				const hasValidFile =
					motivazioneFile !== null && motivazioneFile.size <= MOTIVATION_MAX_BYTES;
				const hasValidLink = trimmedLink.length > 0 && isValidHttpUrl(trimmedLink);
				if (!hasValidFile && !hasValidLink) {
					stepErrors.motivazione_required =
						'Carica un file di motivazione (max 15 MB) oppure inserisci un link esterno valido qui sotto';
				}
			}

			if (checkParallel) {
				if (!parallelReadiness) {
					stepErrors.parallel_readiness = 'Campo richiesto';
				}
				if (!parallelTitle.trim()) {
					stepErrors.parallel_title = 'Campo richiesto';
				}
				if (!parallelAbstract.trim()) {
					stepErrors.parallel_abstract = 'Campo richiesto';
				}
				if (talkFile && talkFile.size > TALK_MAX_BYTES) {
					stepErrors.talk_file = `Il file allegato supera il limite massimo di ${TALK_UI_MAX_MB} MB`;
				}
			}
		}

		if (stepIndex === 2) {
			if (!nome.trim()) stepErrors.nome = 'Campo richiesto';
			if (!cognome.trim()) stepErrors.cognome = 'Campo richiesto';
			if (!email.trim()) {
				stepErrors.email = 'Campo richiesto';
			} else if (!isValidEmail(email)) {
				stepErrors.email = 'Inserisci un indirizzo email valido';
			}

			const cfCheck = validateCodiceFiscale(codiceFiscale, cfAtipico);
			if (!cfCheck.valid) {
				stepErrors.codice_fiscale = cfCheck.error ?? 'Codice Fiscale non valido';
			}

			if (!genere) {
				stepErrors.genere = 'Campo richiesto';
			} else if (genere === 'Altro' && !genereSpecifica.trim()) {
				stepErrors.genere_specifica = 'Campo richiesto';
			}

			if (!ateneo.trim()) stepErrors.ateneo = 'Campo richiesto';
			if (!corsoLaurea.trim()) stepErrors.corso_laurea = 'Campo richiesto';
			if (!livelloStudio) stepErrors.livello_studio = 'Campo richiesto';
			if (!curriculum.trim()) stepErrors.curriculum = 'Campo richiesto';
			if (!iscrittoAisf) stepErrors.iscritto_aisf = 'Campo richiesto';

			if (iscrittoAisf === 'si') {
				if (!comitatoLocale) stepErrors.comitato_locale = 'Campo richiesto';
				if (!neoIscritto) stepErrors.neo_iscritto = 'Campo richiesto';
				if (ruoloSpeciale === 'working_group' && !dettaglioWg.trim()) {
					stepErrors.dettaglio_wg = 'Campo richiesto';
				}
				if (!nextLeaders) {
					stepErrors.next_leaders = 'Campo richiesto';
				} else if (nextLeaders === 'si' && !nextLeadersLink.trim()) {
					stepErrors.next_leaders_link = 'Campo richiesto';
				}
				if (!attivitaLc.trim()) stepErrors.attivita_lc = 'Campo richiesto';
				if (!partAisf) stepErrors.part_aisf = 'Campo richiesto';
				if (!partIaps) stepErrors.part_iaps = 'Campo richiesto';
				if (!orgAisf) stepErrors.org_aisf = 'Campo richiesto';

				const needsElenco =
					(partAisf !== '' && partAisf !== 'mai') ||
					(partIaps !== '' && partIaps !== 'mai') ||
					(orgAisf !== '' && orgAisf !== 'mai');
				if (needsElenco && !elencoPartecipazioni.trim()) {
					stepErrors.elenco_partecipazioni = 'Campo richiesto';
				}
			}
		}

		if (stepIndex === 3) {
			if (quizResult.answeredCount < 12) {
				const radioKeys: RadioQuestionKey[] = [
					'q1',
					'q2',
					'q3',
					'q5',
					'q6',
					'q7',
					'q8',
					'q9',
					'q11',
					'q12',
				];
				for (const rk of radioKeys) {
					if (!quizRadios[rk]) {
						stepErrors[`quiz_${rk}`] = 'Rispondi a questa sfida';
					}
				}
				if (!quizScaleTouched) {
					stepErrors.quiz_q4 = 'Sposta lo slider per rispondere';
				}
				if (!quizPostureTouched) {
					stepErrors.quiz_q10 = 'Sposta lo slider per rispondere';
				}
				stepErrors.quiz_matching = 'Completa tutte le 12 sfide del quiz prima di proseguire.';
			} else if (!matchingAccepted) {
				stepErrors.quiz_matching =
					'Clicca "Accetta Questo Ordinamento" qui sopra per confermare la tua classifica delle 14 aree prima di proseguire.';
			}
		}

		if (stepIndex === 4) {
			if (tipologiaQuota !== 'senza_letto') {
				if (!disponibilitaMatrimoniale) {
					stepErrors.disponibilita_matrimoniale = 'Campo richiesto';
				} else if (
					disponibilitaMatrimoniale === 'disponibile_solo_persona_specifica' &&
					!matrimonialeNominativo.trim()
				) {
					stepErrors.matrimoniale_nominativo = 'Campo richiesto per questa opzione';
				}

				if (camereAccettate.length === 0) {
					stepErrors.camere_accettate = 'Seleziona almeno una tipologia di camera';
				}
				if (!preferenzaCompagni) {
					stepErrors.preferenza_compagni = 'Campo richiesto';
				}
			}

			if (!regimeAlimentare) {
				stepErrors.regime_alimentare = 'Campo richiesto';
			} else if (regimeAlimentare === 'altro' && !regimeAltro.trim()) {
				stepErrors.regime_altro = 'Campo richiesto';
			}

			if (!allergiePresenti) {
				stepErrors.allergie_presenti = 'Campo richiesto';
			} else if (allergiePresenti === 'si') {
				if (!allergieElenco.trim()) stepErrors.allergie_elenco = 'Campo richiesto';
				if (!allergieGravita) stepErrors.allergie_gravita = 'Campo richiesto';
				if (!allergiePrecauzioni.trim()) stepErrors.allergie_precauzioni = 'Campo richiesto';
			}
		}

		if (stepIndex === 5) {
			if (!checkPrivacy) stepErrors.check_privacy = 'Consenso richiesto per procedere';
			if (!checkVeridicita) stepErrors.check_veridicita = 'Dichiarazione richiesta per procedere';
			if (!checkPagamento) stepErrors.check_pagamento = 'Presa visione richiesta per procedere';
		}

		return stepErrors;
	}

	async function scrollToFirstError(stepErrors: Record<string, string>) {
		await tick();
		const firstKey = Object.keys(stepErrors)[0];
		if (!firstKey) return;
		const el = document.querySelector(`[data-field-id="${firstKey}"]`);
		if (el) {
			el.scrollIntoView({ behavior: 'smooth', block: 'center' });
		}
	}

	async function goToStep(targetStep: number) {
		if (targetStep < 0 || targetStep >= totalSteps) return;

		// Moving backwards is always allowed without blocking
		if (targetStep <= currentStep) {
			errors = {};
			stepErrorBanner = null;
			currentStep = targetStep;
			await tick();
			window.scrollTo({ top: 80, behavior: 'smooth' });
			return;
		}

		// Moving forward validates every step from currentStep up to targetStep - 1
		for (let s = currentStep; s < targetStep; s++) {
			const stepErrors = validateStep(s);
			const count = Object.keys(stepErrors).length;
			if (count > 0) {
				currentStep = s;
				errors = stepErrors;
				stepErrorBanner =
					s === 3 && stepErrors.quiz_matching
						? stepErrors.quiz_matching
						: `Controlla ${count === 1 ? 'il campo evidenziato' : `i ${count} campi evidenziati`} in rosso prima di proseguire.`;
				await scrollToFirstError(stepErrors);
				return;
			}
		}

		errors = {};
		stepErrorBanner = null;
		currentStep = targetStep;
		await tick();
		window.scrollTo({ top: 80, behavior: 'smooth' });
	}

	async function handleFinalSubmit() {
		if (submitting) return;
		submitError = null;

		// Validate ALL steps 0..5 before sending
		for (let s = 0; s < totalSteps; s++) {
			const stepErrors = validateStep(s);
			const count = Object.keys(stepErrors).length;
			if (count > 0) {
				currentStep = s;
				errors = stepErrors;
				stepErrorBanner = `Prima di inviare, completa ${count === 1 ? 'il campo mancante' : `i ${count} campi mancanti`} nella Pagina ${s + 1} (${REGISTRATION_STEPS[s].fullLabel}).`;
				await scrollToFirstError(stepErrors);
				return;
			}
		}

		errors = {};
		stepErrorBanner = null;
		submitting = true;
		submitProgress = 15;
		submitStage = 'Preparazione dei dati della candidatura...';

		try {
			let encodedMotivazione = null;
			if (motivazioneFile) {
				submitProgress = 35;
				submitStage = `Codifica sicura dell'allegato motivazionale (${formatBytesToMB(motivazioneFile.size)} MB)... non chiudere la pagina`;
				encodedMotivazione = await encodeFileToBase64(motivazioneFile);
			}

			let encodedTalk = null;
			if (checkParallel && talkFile) {
				submitProgress = 55;
				submitStage = `Codifica sicura dell'allegato talk (${formatBytesToMB(talkFile.size)} MB)... non chiudere la pagina`;
				encodedTalk = await encodeFileToBase64(talkFile);
			}

			let turnstileToken = '';
			if (hasTurnstileConfigured()) {
				submitProgress = 68;
				submitStage = 'Verifica anti-bot Cloudflare in corso...';
				turnstileToken = await obtainTurnstileToken(turnstileContainerEl, 'cisf27_registration');
			}

			const orderedAreas = displayedAreas;
			const payload: RegistrationPayload = {
				...(gateState === 'testing' && testingUnlocked && testingAccessCode
					? { accessCode: testingAccessCode }
					: {}),
				...(turnstileToken ? { turnstileToken } : {}),
				ruoloSpeciale,
				maggiorenne: maggiorenne === 'si',
				ammissioneAutomatica: isAutoAdmissionRole,
				tipologiaQuota,
				subPreferenza: tipologiaQuota === 'indifferente' ? subPreferenza : '',

				tipoLettera,
				linkProgetto: linkProgetto.trim(),
				motivazioneFile: encodedMotivazione,
				talkDisponibile: checkParallel,
				talkReadiness: checkParallel ? parallelReadiness : '',
				talkTitolo: checkParallel ? parallelTitle.trim() : '',
				talkAbstract: checkParallel ? parallelAbstract.trim() : '',
				talkFile: encodedTalk,

				nome: nome.trim(),
				cognome: cognome.trim(),
				email: email.trim(),
				codiceFiscale: normalizeCodiceFiscale(codiceFiscale),
				cfAtipico,
				soprannome: soprannome.trim(),
				pronomi: pronomi.trim(),
				genere,
				genereSpecifica: genere === 'Altro' ? genereSpecifica.trim() : '',
				ateneo: ateneo.trim(),
				corsoLaurea: corsoLaurea.trim(),
				livelloStudio,
				curriculum: curriculum.trim(),
				iscrittoAisf,
				comitatoLocale: iscrittoAisf === 'si' ? comitatoLocale : '',
				neoIscritto: iscrittoAisf === 'si' ? neoIscritto : '',
				dettaglioWg:
					iscrittoAisf === 'si' && ruoloSpeciale === 'working_group' ? dettaglioWg.trim() : '',
				nextLeaders: iscrittoAisf === 'si' ? nextLeaders : '',
				nextLeadersLink:
					iscrittoAisf === 'si' && nextLeaders === 'si' ? nextLeadersLink.trim() : '',
				attivitaLc: iscrittoAisf === 'si' ? attivitaLc.trim() : '',
				partAisf: iscrittoAisf === 'si' ? partAisf : '',
				partIaps: iscrittoAisf === 'si' ? partIaps : '',
				orgAisf: iscrittoAisf === 'si' ? orgAisf : '',
				elencoPartecipazioni: needElencoPartecipazioni ? elencoPartecipazioni.trim() : '',

				pilastroStoria: pillars.storia,
				pilastroEnergia: pillars.energia,
				pilastroLavoro: pillars.lavoro,
				pilastroRicerca: pillars.ricerca,
				quizAnsweredCount: quizResult.answeredCount,
				quizManualReorder: isManualOrder,
				quizTop1: orderedAreas[0]?.name ?? '',
				quizTop2: orderedAreas[1]?.name ?? '',
				quizTop3: orderedAreas[2]?.name ?? '',
				quizFullRanking: orderedAreas.map((a) => `${a.id}:${a.name}`),
				quizRawAnswers: {
					...quizRadios,
					q4_scale: quizScaleVal,
					q4_touched: quizScaleTouched,
					q10_posture: quizPostureVal,
					q10_touched: quizPostureTouched,
				},

				alloggioMatrimoniale: showAccommodationCard
					? disponibilitaMatrimoniale
					: 'N/A (Senza Alloggio)',
				alloggioMatrimonialeNominativo:
					showAccommodationCard && disponibilitaMatrimoniale !== 'non_disponibile'
						? matrimonialeNominativo.trim()
						: '',
				alloggioCamereAccettate: showAccommodationCard ? [...camereAccettate] : [],
				alloggioCompagniPref: showAccommodationCard ? preferenzaCompagni : '',
				alloggioCoinquiliniSpecifici: showAccommodationCard ? coinquiliniSpecifici.trim() : '',
				regimeAlimentare,
				regimeAltro: regimeAlimentare === 'altro' ? regimeAltro.trim() : '',
				allergiePresenti,
				allergieElenco: allergiePresenti === 'si' ? allergieElenco.trim() : '',
				allergieGravita: allergiePresenti === 'si' ? allergieGravita : '',
				allergiePrecauzioni: allergiePresenti === 'si' ? allergiePrecauzioni.trim() : '',
				noteSanitarie: noteSanitarie.trim(),
				accessibilita: accessibilita.trim(),

				commentoFinale: commentoFinale.trim(),
				consensoCriteri: checkCriteri,
				consensoPrivacy: checkPrivacy,
				consensoVeridicita: checkVeridicita,
				consensoPagamento: checkPagamento,
			};

			submitProgress = 75;
			submitStage =
				'Caricamento allegati e registrazione in corso sui server AISF... non chiudere la pagina e aspetta almeno 6 minuti!';

			const result = await submitRegistration(payload);

			if (result.success && result.candidateId) {
				submitProgress = 100;
				submitStage = 'Registrazione completata!';
				// Clear localStorage ONLY after confirmed server success
				try {
					localStorage.removeItem(DRAFT_STORAGE_KEY);
				} catch {
					// Ignore storage error
				}
				draftRestored = false;
				successReceipt = {
					candidateId: result.candidateId,
					isTest: result.isTest === true || gateState === 'testing',
					filesSaved: result.filesSaved ?? [],
					emailSent: result.emailSent !== false,
					emailWarning: result.emailWarning,
				};
			} else {
				submitError =
					result.error ??
					`Si è verificato un errore imprevisto durante l’invio. I tuoi dati non sono stati persi: riprova oppure scrivi a ${contactEmail}.`;
			}
		} catch (err) {
			submitError =
				(err as Error).message ||
				`Errore durante la preparazione o trasmissione della candidatura. Riprova o contatta ${contactEmail}.`;
		} finally {
			submitting = false;
		}
	}

	async function copyReceiptId(id: string) {
		try {
			await navigator.clipboard.writeText(id);
			copiedReceipt = true;
			setTimeout(() => {
				copiedReceipt = false;
			}, 2500);
		} catch {
			// Ignore clipboard unavailability
		}
	}

	function closeSuccessAndRestart() {
		successReceipt = null;
		resetAllFields();
		window.scrollTo({ top: 0, behavior: 'smooth' });
	}
</script>

<div
	class="cisf-registration-root text-base-content w-full overflow-x-hidden"
	data-cisf-hydrated={hydrated ? 'true' : 'false'}
>
	<!-- HERO BANNER -->
	<section class="mx-auto max-w-4xl px-4 pt-8 pb-3 text-center">
		<div
			class="badge badge-primary badge-soft border-primary/25 text-secondary mb-3 gap-2 rounded-full px-3.5 py-1 text-xs font-bold tracking-wider uppercase"
		>
			<svg class="h-3.5 w-3.5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
				/>
			</svg>
			{conferenceLocation} • {conferenceDates}
		</div>

		<h1
			class="font-playfair-display text-3xl font-extrabold tracking-tight text-secondary sm:text-5xl"
		>
			Candidatura <span
				class="bg-linear-to-r from-primary via-accent to-warning bg-clip-text text-transparent"
				>{conferenceTitle}</span
			>
		</h1>
		<p class="mx-auto mt-2 max-w-2xl text-base font-medium text-gray-600 sm:text-lg">
			Conferenza Italiana Studenti di Fisica — <span class="font-bold text-gray-800">AISF</span>
		</p>

		<!-- Avviso Lingua Ufficiale -->
		<div
			class="mt-3 inline-flex max-w-full flex-wrap items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white/90 px-4 py-2 text-xs text-gray-700 shadow-2xs"
		>
			<span class="font-bold text-primary">🇮🇹 Lingua ufficiale: Italiano</span>
			<span class="hidden text-gray-300 sm:inline">|</span>
			<span>
				La Conferenza sarà interamente tenuta in lingua italiana senza traduzioni:
				<strong>è richiesta un'ottima padronanza</strong> almeno passiva
				<strong>dell'italiano</strong> per partecipare.
			</span>
		</div>

		<!-- BANNER MODALITÀ TESTING ATTIVA -->
		{#if gateState === 'testing' && testingUnlocked}
			<div
				role="status"
				class="mx-auto mt-4 flex max-w-3xl flex-col items-start justify-between gap-3 rounded-xl border-2 border-purple-400 bg-purple-50 px-4 py-3 text-left text-xs font-semibold text-purple-950 shadow-xs sm:flex-row sm:items-center"
			>
				<div class="leading-relaxed">
					🧪 <strong>MODALITÀ TESTING ATTIVA</strong> — I dati inviati finiscono nell'archivio di prova
					e non valgono come candidatura ufficiale.
				</div>
				<button
					type="button"
					onclick={exitTestingMode}
					class="btn btn-xs min-h-9 shrink-0 self-end border border-purple-300 bg-white font-bold text-purple-900 hover:bg-purple-100 sm:self-center"
				>
					<LogOut class="size-3.5" />
					Esci da modalità test
				</button>
			</div>
		{/if}

		<!-- MINI-BANNER BOZZA LOCALE RIPRISTINATA -->
		{#if showWizard && draftRestored}
			<div
				class="mx-auto mt-4 flex max-w-3xl flex-col items-start justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50/90 px-4 py-3 text-left text-xs text-blue-950 shadow-2xs sm:flex-row sm:items-center"
			>
				<div class="flex items-start gap-2.5 leading-relaxed">
					<span class="shrink-0 text-base leading-none">💾</span>
					<span>
						Bozza locale ripristinata automaticamente – ricordati solo di
						<strong>ricaricare eventuali file allegati</strong> prima dell'invio!
					</span>
				</div>
				<div class="flex shrink-0 items-center gap-2 self-end sm:self-center">
					{#if !confirmClearDraft}
						<button
							type="button"
							onclick={() => (confirmClearDraft = true)}
							class="btn btn-xs min-h-9 border border-blue-300 bg-white text-blue-900 hover:bg-blue-100"
						>
							<Trash2 class="size-3.5" />
							Svuota bozza
						</button>
					{:else}
						<span class="font-bold text-red-800">Confermi?</span>
						<button
							type="button"
							onclick={clearSavedDraft}
							class="btn btn-xs btn-error min-h-9 text-white"
						>
							Sì, svuota
						</button>
						<button
							type="button"
							onclick={() => (confirmClearDraft = false)}
							class="btn btn-xs min-h-9 border border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
						>
							Annulla
						</button>
					{/if}
				</div>
			</div>
		{/if}

		<!-- STEPPER 6 FASI (VISIBILE SOLO CON WIZARD ATTIVO) -->
		{#if showWizard}
			<nav aria-label="Avanzamento candidatura" class="mx-auto mt-7 max-w-3xl">
				<div class="relative flex items-center justify-between">
					<div
						class="absolute top-1/2 left-0 z-0 h-1 w-full -translate-y-1/2 rounded bg-gray-200"
					></div>
					<div
						class="absolute top-1/2 left-0 z-0 h-1 -translate-y-1/2 rounded bg-primary transition-all duration-300"
						style="width: {(currentStep / (totalSteps - 1)) * 100}%"
					></div>

					{#each REGISTRATION_STEPS as step (step.index)}
						<button
							type="button"
							onclick={() => goToStep(step.index)}
							aria-current={currentStep === step.index ? 'step' : undefined}
							class="group relative z-10 flex min-h-11 min-w-11 cursor-pointer flex-col items-center justify-center focus:outline-hidden"
						>
							<div
								class="flex h-9 w-9 items-center justify-center rounded-full border-2 text-xs font-bold transition group-hover:scale-105 {currentStep ===
								step.index
									? 'border-base-100 bg-primary text-primary-content shadow-md'
									: step.index < currentStep
										? 'border-white bg-emerald-600 text-white shadow-xs'
										: 'border-gray-300 bg-white text-gray-600 shadow-xs'}"
							>
								{#if step.index < currentStep}
									<Check class="size-4" />
								{:else}
									{step.number}
								{/if}
							</div>
							<span
								class="mt-1.5 hidden text-[11px] sm:block {currentStep === step.index
									? 'font-bold text-secondary'
									: step.index < currentStep
										? 'font-semibold text-emerald-800'
										: 'font-semibold text-gray-500'}"
							>
								{step.shortLabel}
							</span>
						</button>
					{/each}
				</div>

				<!-- Mobile active step label -->
				<div class="mt-2.5 flex justify-center sm:hidden">
					<span
						class="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-white px-3.5 py-1 text-xs font-bold text-secondary shadow-2xs"
					>
						Step {currentStep + 1} di {totalSteps} — {REGISTRATION_STEPS[currentStep].fullLabel}
					</span>
				</div>
			</nav>
		{/if}
	</section>

	<!-- MAIN FORM CONTAINER -->
	<main class="mx-auto max-w-4xl px-4 pt-4">
		{#if !showWizard}
			{#if gateState === 'loading'}
				<!-- STATO: CARICAMENTO GATEKEEPER -->
				<div
					class="rounded-2xl border border-primary/20 bg-base-100 shadow-lg mx-auto mb-8 max-w-2xl p-8 text-center sm:p-12"
					role="status"
					aria-live="polite"
				>
					<span class="loading loading-spinner loading-lg text-primary"></span>
					<p class="mt-4 text-sm font-bold text-secondary sm:text-base">
						Verifica stato candidature in corso...
					</p>
					<p class="mt-1 text-xs text-gray-500">
						Sincronizzazione con i server ufficiali AISF in corso.
					</p>
					{#if loadingSlow}
						<div
							class="mt-5 rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-xs text-amber-950"
						>
							<p class="font-semibold">La risposta del server sta impiegando più del previsto.</p>
							<p class="mt-1 text-[11px] text-amber-900/90">
								Controlla la connessione o che estensioni/ad-blocker non stiano bloccando
								<code>script.google.com</code>.
							</p>
							<button
								type="button"
								onclick={() => void loadGateStatus()}
								class="btn btn-primary btn-outline btn-sm mt-3 min-h-10 rounded-xl px-4 text-xs font-bold"
							>
								<RotateCcw class="size-3.5" />
								Riprova subito
							</button>
						</div>
					{/if}
					<div
						id="cisf-hydration-fallback"
						class="mt-5 hidden rounded-xl border border-red-200 bg-red-50/90 p-4 text-xs text-red-950"
					>
						<p class="font-bold text-primary">
							Il caricamento del modulo sembra bloccato nel browser.
						</p>
						<p class="mt-1 text-[11px] leading-relaxed text-red-900">
							Prova a ricaricare la pagina (svuotando la cache con <strong>Cmd+Shift+R</strong> /
							<strong>Ctrl+Shift+R</strong>) oppure apri la pagina in finestra in incognito.
						</p>
						<button
							id="cisf-hydration-reload-btn"
							type="button"
							onclick={() => window.location.reload()}
							class="btn btn-primary btn-sm mt-3 min-h-10 rounded-xl px-4 text-xs font-bold text-white"
						>
							Ricarica la pagina
						</button>
					</div>
				</div>
			{:else if gateState === 'error'}
				<!-- STATO: ERRORE VERIFICA GATEKEEPER -->
				<div
					class="rounded-2xl border border-primary/20 bg-base-100 shadow-lg mx-auto mb-8 max-w-2xl p-6 text-center sm:p-10"
					role="alert"
				>
					<div
						class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 text-red-700"
					>
						<AlertTriangle class="size-7" />
					</div>
					<h2 class="font-playfair-display text-2xl font-bold text-secondary sm:text-3xl">
						Impossibile verificare lo stato delle candidature
					</h2>
					<p class="mx-auto mt-3 max-w-lg text-xs leading-relaxed text-gray-700 sm:text-sm">
						{gateError ??
							'Si è verificato un problema temporaneo durante la comunicazione con il server.'}
					</p>
					<div class="mt-6 flex flex-wrap items-center justify-center gap-3">
						<button
							type="button"
							onclick={() => void loadGateStatus()}
							class="btn btn-primary min-h-11 rounded-xl px-6 text-xs font-bold text-white shadow-sm"
						>
							<RotateCcw class="size-4" />
							Riprova
						</button>
						<a
							href={`mailto:${contactEmail}`}
							class="btn min-h-11 rounded-xl border border-gray-300 bg-white px-5 text-xs font-bold text-secondary hover:bg-gray-50"
						>
							Scrivi a {contactEmail}
						</a>
					</div>
				</div>
			{:else if gateState === 'before_open'}
				<!-- STATO: CONTO ALLA ROVESCIA APERTURA AUTOMATICA -->
				<div
					class="rounded-2xl border border-primary/20 bg-base-100 shadow-lg mx-auto mb-8 max-w-3xl p-6 text-center sm:p-10"
				>
					<div
						class="mx-auto mb-4 inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-3.5 py-1 text-xs font-bold text-amber-900"
					>
						<Clock class="size-3.5 text-primary" />
						Apertura programmata
					</div>
					<h2 class="font-playfair-display text-2xl font-extrabold text-secondary sm:text-3xl">
						Le candidature CISF27 apriranno presto!
					</h2>

					{#if formattedOpenAtRome}
						<p class="mt-3 text-sm font-semibold text-gray-800 sm:text-base">
							Apertura ufficiale:
							<span class="font-extrabold text-primary">{formattedOpenAtRome}</span>
							<span class="text-xs font-medium text-gray-500">(ora italiana)</span>
						</p>
					{/if}

					{#if countdownParts}
						<div
							class="mx-auto mt-6 grid max-w-md grid-cols-4 gap-2.5 sm:gap-4"
							aria-label="Conto alla rovescia apertura candidature"
						>
							<div
								class="rounded-2xl border border-primary/20 bg-base-200/60 px-2 py-3.5 shadow-2xs"
							>
								<div class="font-mono text-2xl font-extrabold text-secondary sm:text-4xl">
									{countdownParts.days}
								</div>
								<div class="mt-1 text-[10px] font-bold tracking-wider text-gray-600 uppercase">
									Giorni
								</div>
							</div>
							<div
								class="rounded-2xl border border-primary/20 bg-base-200/60 px-2 py-3.5 shadow-2xs"
							>
								<div class="font-mono text-2xl font-extrabold text-secondary sm:text-4xl">
									{countdownParts.hours}
								</div>
								<div class="mt-1 text-[10px] font-bold tracking-wider text-gray-600 uppercase">
									Ore
								</div>
							</div>
							<div
								class="rounded-2xl border border-primary/20 bg-base-200/60 px-2 py-3.5 shadow-2xs"
							>
								<div class="font-mono text-2xl font-extrabold text-secondary sm:text-4xl">
									{countdownParts.minutes}
								</div>
								<div class="mt-1 text-[10px] font-bold tracking-wider text-gray-600 uppercase">
									Minuti
								</div>
							</div>
							<div
								class="rounded-2xl border border-primary/20 bg-base-200/60 px-2 py-3.5 shadow-2xs"
							>
								<div class="font-mono text-2xl font-extrabold text-primary sm:text-4xl">
									{countdownParts.seconds}
								</div>
								<div class="mt-1 text-[10px] font-bold tracking-wider text-gray-600 uppercase">
									Secondi
								</div>
							</div>
						</div>
						<p class="mt-3 text-[11px] text-gray-500">
							Il modulo si sbloccherà automaticamente allo scoccare dell'orario ufficiale
							(sincronizzato con il server).
						</p>
					{/if}
				</div>
			{:else if gateState === 'closed'}
				<!-- STATO: CANDIDATURE CHIUSE -->
				<div
					class="rounded-2xl border border-primary/20 bg-base-100 shadow-lg mx-auto mb-8 max-w-3xl p-6 text-center sm:p-10"
				>
					<div
						class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 text-primary"
					>
						<Calendar class="size-7" />
					</div>
					<h2 class="font-playfair-display text-2xl font-extrabold text-secondary sm:text-3xl">
						Candidature CISF27 Chiuse
					</h2>
					<p class="mx-auto mt-2 max-w-xl text-xs leading-relaxed text-gray-700 sm:text-sm">
						Il periodo di raccolta delle candidature per la
						<strong
							>Conferenza Italiana Studenti di Fisica — {conferenceTitle}
							{conferenceLocation}</strong
						>
						è terminato{#if formattedCloseAtRome}
							&nbsp;(chiusura: <strong>{formattedCloseAtRome}</strong>, ora italiana){/if}. Grazie
						di cuore a tuttə per l'entusiasmo!
					</p>

					<div
						class="mx-auto mt-6 max-w-2xl rounded-2xl border border-amber-200 bg-amber-50/75 p-5 text-left text-xs leading-relaxed text-amber-950 sm:text-sm"
					>
						<h3 class="mb-2.5 text-sm font-extrabold text-secondary">Prossime tappe ufficiali</h3>
						<ul class="list-inside list-disc space-y-1.5 text-gray-800">
							<li>
								<strong>Esiti a gennaio 2027:</strong> il Comitato Organizzatore valuterà le motivazioni
								in doppio cieco e comunicherà gli esiti ufficiali via email a tuttə lə candidatə.
							</li>
							<li>
								<strong>1 settimana per il pagamento:</strong> le persone selezionate avranno
								<strong>7 giorni</strong> dalla comunicazione per confermare il posto versando la quota
								(e regolarizzando l'iscrizione AISF se non ancora attiva).
							</li>
							<li>
								<strong>Unico ripescaggio ufficiale:</strong> eventuali posti non confermati entro i termini
								verranno riassegnati tramite l'unico ripescaggio ufficiale previsto dai Criteri.
							</li>
						</ul>
					</div>

					<div class="mt-6 flex flex-wrap items-center justify-center gap-2.5">
						<a
							href={criteriPageUrl}
							class="btn btn-primary btn-soft btn-sm border-primary/30 text-secondary hover:text-primary-content min-h-11 rounded-xl px-4 text-xs font-bold"
						>
							<ExternalLink class="size-4" />
							Pagina Criteri &amp; Etica
						</a>
						<a
							href={criteriPdfUrl}
							target="_blank"
							rel="noopener noreferrer"
							class="btn btn-primary btn-outline btn-sm min-h-11 rounded-xl px-4 text-xs font-bold"
						>
							<FileText class="size-4" />
							PDF Criteri Ufficiali
						</a>
						<a
							href={codiceEticoPdfUrl}
							target="_blank"
							rel="noopener noreferrer"
							class="btn btn-secondary btn-outline btn-sm min-h-11 rounded-xl px-4 text-xs font-bold"
						>
							<FileText class="size-4" />
							PDF Codice Etico
						</a>
					</div>

					<p class="mt-6 text-xs text-gray-600">
						Hai bisogno di assistenza o devi segnalare una rettifica a una candidatura già inviata?
						Scrivi al Comitato Organizzatore:
						<a href={`mailto:${contactEmail}`} class="font-bold text-primary underline"
							>{contactEmail}</a
						>
					</p>
				</div>
			{:else if gateState === 'testing'}
				<!-- STATO: MODALITÀ TESTING (BLOCCATA PER IL PUBBLICO, SBLOCCABILE DAI TESTER) -->
				<div
					class="rounded-2xl border border-primary/20 bg-base-100 shadow-lg mx-auto mb-8 max-w-3xl p-6 text-center sm:p-10"
				>
					<div
						class="mx-auto mb-4 inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-3.5 py-1 text-xs font-bold text-amber-900"
					>
						<Clock class="size-3.5 text-primary" />
						In preparazione
					</div>
					<h2 class="font-playfair-display text-2xl font-extrabold text-secondary sm:text-3xl">
						Le candidature apriranno presto
					</h2>
					<p class="mx-auto mt-3 max-w-xl text-xs leading-relaxed text-gray-700 sm:text-sm">
						Stiamo aggiustando gli ultimi dettagli del portale di iscrizione... <strong
							>Stay tuned!</strong
						>
					</p>

					<!-- AREA RISERVATA TESTER -->
					<div class="mt-8 border-t border-gray-200/80 pt-5">
						{#if !showTesterAccess}
							<button
								type="button"
								onclick={() => (showTesterAccess = true)}
								class="btn btn-ghost btn-xs min-h-9 text-xs font-semibold text-gray-500 hover:bg-gray-100 hover:text-gray-800"
							>
								<Lock class="size-3.5" />
								Accesso area test
							</button>
						{:else}
							<form
								onsubmit={handleTestPasscodeSubmit}
								class="mx-auto max-w-md rounded-2xl border border-purple-200 bg-purple-50/50 p-4 text-left sm:p-5"
							>
								<div class="mb-2 flex items-center justify-between gap-2">
									<label
										for="input-test-passcode"
										class="flex items-center gap-1.5 text-xs font-bold text-purple-950"
									>
										<Lock class="size-3.5 text-purple-700" />
										Accesso area test riservata
									</label>
									<button
										type="button"
										onclick={() => {
											showTesterAccess = false;
											passcodeError = null;
										}}
										aria-label="Chiudi accesso area test"
										class="btn btn-ghost btn-xs text-gray-500 hover:text-gray-800"
									>
										<X class="size-3.5" />
									</button>
								</div>
								<p class="mb-3 text-[11px] leading-relaxed text-purple-900/85">
									Inserisci la passphrase fornita dal CO per accedere al modulo in modalità di
									prova.
								</p>
								<div class="flex flex-col gap-2 sm:flex-row">
									<input
										id="input-test-passcode"
										type="password"
										autocomplete="off"
										bind:value={passcodeInput}
										oninput={() => (passcodeError = null)}
										disabled={verifyingPasscode}
										placeholder="Passphrase testing..."
										class="input input-bordered min-h-11 flex-1 rounded-xl border-purple-300 bg-white text-xs text-gray-900 sm:text-sm"
									/>
									<button
										type="submit"
										disabled={verifyingPasscode}
										class="btn min-h-11 rounded-xl border-0 bg-purple-700 px-5 text-xs font-bold text-white hover:bg-purple-800 disabled:opacity-60"
									>
										{#if verifyingPasscode}
											<span class="loading loading-spinner loading-xs"></span>
											Verifica...
										{:else}
											Sblocca
										{/if}
									</button>
								</div>
								{#if passcodeError}
									<p role="alert" class="mt-2 text-xs font-semibold text-red-700">
										{passcodeError}
									</p>
								{/if}
							</form>
						{/if}
					</div>
				</div>
			{/if}
		{/if}

		<!-- =================================================================== -->
		<!-- SCHERMATA 1 / STEP 0: CRITERI DI SELEZIONE, REGOLAMENTO & QUOTA     -->
		<!-- =================================================================== -->
		{#if showWizard && currentStep === 0}
			<div class="rounded-2xl border border-primary/20 bg-base-100 shadow-lg mb-8 p-5 sm:p-10">
				<!-- DISCLAIMER TEMPO STIMATO & SALVATAGGIO AUTOMATICO -->
				<div
					class="mb-6 flex items-start gap-3 rounded-xl border border-amber-300/80 bg-linear-to-r from-amber-50/90 to-orange-50/70 p-4 text-xs leading-relaxed text-amber-950 shadow-2xs sm:text-sm"
				>
					<span class="mt-0.5 shrink-0 text-lg leading-none" aria-hidden="true">⏱️</span>
					<p>
						<strong>Tempo stimato: ~10–15 minuti</strong> (esclusa la preparazione della motivazione
						creativa). Le tue risposte vengono salvate automaticamente su questo browser man mano
						che compili: <strong>leggi pure Pagina 1 e 2 per vedere cosa serve</strong>, prepara con
						calma la tua motivazione e torna qui quando sei prontə! ✨
					</p>
				</div>

				<div class="mb-6 flex flex-wrap items-center justify-between gap-4">
					<div class="flex items-center gap-3">
						<div
							class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-sm font-bold text-amber-800"
						>
							01
						</div>
						<div>
							<h2 class="font-playfair-display text-2xl font-bold text-secondary sm:text-3xl">
								Criteri di Selezione &amp; Tipologia Quota
							</h2>
							<p class="text-xs text-gray-600 sm:text-sm">
								Leggi i punti cardine approvati dal Comitato Organizzatore (CO) prima di candidarti
							</p>
						</div>
					</div>
					<div class="flex flex-wrap items-center gap-2">
						<button
							type="button"
							onclick={() => (showCriteriModal = true)}
							class="btn btn-sm min-h-11 border border-amber-300 bg-amber-50 text-xs font-bold text-amber-900 hover:bg-amber-100"
						>
							<FileText class="size-4 text-amber-700" />
							Sintesi &amp; Codice Etico
						</button>
						<a
							href={criteriPdfUrl}
							target="_blank"
							rel="noopener noreferrer"
							class="btn btn-primary btn-outline btn-sm min-h-11 text-xs font-bold"
						>
							<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
								/>
							</svg>
							PDF Criteri Ufficiali
						</a>
						<a
							href={codiceEticoPdfUrl}
							target="_blank"
							rel="noopener noreferrer"
							class="btn btn-secondary btn-outline btn-sm min-h-11 text-xs font-bold"
						>
							<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
								/>
							</svg>
							PDF Codice Etico
						</a>
					</div>
				</div>

				<!-- HIGHLIGHTS VISIVI A GRIGLIA -->
				<div class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
					<div class="rounded-xl border border-gray-200 bg-white p-4">
						<div class="mb-1 flex items-center gap-2 text-sm font-bold text-primary">
							<svg class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
								/>
							</svg>
							Quote Minime per Comitato
						</div>
						<p class="text-xs text-gray-600">
							Ogni Comitato Locale ha garantiti <strong>almeno 5 posti</strong> (Presidente
							compresə). Al Comitato Locale di <strong>AISF Calabria</strong> sono riservati
							<strong>almeno 8 posti</strong> per supportare l'organizzazione di CISF28!
						</p>
					</div>

					<div class="rounded-xl border border-gray-200 bg-white p-4">
						<div class="mb-1 flex items-center gap-2 text-sm font-bold text-secondary">
							<svg class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
								/>
							</svg>
							Passano in Automatico
						</div>
						<p class="text-xs text-gray-600">
							I membri del Comitato Esecutivo (EC) di AISF, lə Presidentə dei Comitati Locali (LC),
							fino a 5 membri della commissione Fisicaffè indicatə da EC e la persona vincitrice
							dell'Open Call della Redazione di Fisicaffè†.
						</p>
					</div>

					<div class="rounded-xl border border-gray-200 bg-white p-4">
						<div class="mb-1 flex items-center gap-2 text-sm font-bold text-amber-800">
							<svg class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
								/>
							</svg>
							Parità di Genere
						</div>
						<p class="text-xs text-gray-600">
							Il CO si impegna attivamente a <strong>raggiungere</strong> la parità di genere. Chi non
							seleziona polarità maschile o femminile sarà tutelatə garantendo la piena inclusione statistica.
						</p>
					</div>

					<div class="rounded-xl border border-gray-200 bg-white p-4">
						<div class="mb-1 flex items-center gap-2 text-sm font-bold text-accent">
							<svg class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M13 10V3L4 14h7v7l9-11h-7z"
								/>
							</svg>
							Più Candidature = Più Posti!
						</div>
						<p class="text-xs text-gray-600">
							I posti extra quota vengono ripartiti
							<strong>in proporzione al numero di candidature presentate</strong> da ciascun LC: incoraggia
							ognunə nel tuo dipartimento a candidarsi!
						</p>
					</div>

					<div class="rounded-xl border border-gray-200 bg-white p-4">
						<div class="mb-1 flex items-center gap-2 text-sm font-bold text-purple-800">
							<svg class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
								/>
							</svg>
							Tempistiche di Pagamento
						</div>
						<p class="text-xs text-gray-600">
							Esiti comunicati a <strong>gennaio 2027</strong>. <strong>1 sola settimana</strong>
							per confermare il posto pagando la quota. Seguirà
							<strong>un solo ripescaggio ufficiale</strong>.
						</p>
					</div>

					<div class="rounded-xl border border-gray-200 bg-white p-4">
						<div class="mb-1 flex items-center gap-2 text-sm font-bold text-emerald-800">
							<svg class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
								/>
							</svg>
							Iscrizione AISF &amp; Quote
						</div>
						<p class="text-xs text-gray-600">
							Obbligatoria per partecipare. Se non sei ancora iscrittə, potrai regolarizzare la
							quota associativa contestualmente al pagamento della CISF27 una volta selezionatə.
							<em
								>Le quote di partecipazione e iscrizione AISF non sono in alcun caso rimborsabili.</em
							>
						</p>
					</div>
				</div>

				<div class="mb-5 space-y-1 text-[11px] text-gray-500 italic">
					<div>
						* Per tutti i punti indicati, il Comitato Organizzatore si avvale della facoltà di
						effettuare eventuali aggiustamenti, rimanendo il più possibile fedele a quanto
						stabilito. Il
						<a
							href={`${criteriPageUrl}#codice-etico`}
							target="_blank"
							rel="noopener noreferrer"
							class="font-bold text-primary underline">Codice Etico ufficiale</a
						>
						è consultabile pubblicamente sul sito della conferenza.
					</div>
					<div class="font-semibold text-secondary not-italic">
						† La persona vincitrice dell'Open Call della Redazione di Fisicaffè riceverà d'ufficio
						un posto a CISF non conteggiato nei 170 partecipanti.
					</div>
				</div>

				<!-- Ruoli Associativi Nazionali AISF -->
				<div class="mb-5" data-field-id="ruolo_speciale">
					<label
						for="select-ruolo-speciale"
						class="mb-1.5 block text-xs font-bold text-gray-800 sm:text-sm"
					>
						Ricopri attualmente un ruolo associativo speciale in AISF al livello nazionale?
					</label>
					<select
						id="select-ruolo-speciale"
						bind:value={ruoloSpeciale}
						onchange={() => clearFieldError('ruolo_speciale')}
						class="select select-bordered min-h-11 w-full rounded-xl bg-white text-xs text-gray-900 sm:text-sm {errors.ruolo_speciale
							? 'border-red-600 ring-1 ring-red-600'
							: 'border-gray-300'}"
					>
						<option value="" disabled>Seleziona (ness)un ruolo speciale</option>
						{#each RUOLI_SPECIALI_OPTIONS as opt (opt.value)}
							<option value={opt.value}>{opt.label}</option>
						{/each}
					</select>
					{#if errors.ruolo_speciale}
						<p class="mt-1 text-xs font-semibold text-red-700">{errors.ruolo_speciale}</p>
					{/if}
				</div>

				<!-- Requisito di Età: Maggiore Età (Bloccante se No) -->
				<div class="mb-6" data-field-id="maggiorenne">
					<p class="mb-2 block text-xs font-bold text-gray-800 sm:text-sm">
						Sei maggiorenne (hai già compiuto 18 anni)?
					</p>
					<div
						class="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2 {errors.maggiorenne
							? 'rounded-xl ring-2 ring-red-600 ring-offset-2'
							: ''}"
					>
						<label
							class="flex min-h-13 cursor-pointer items-center gap-2.5 rounded-xl border-2 p-3 font-bold transition {maggiorenne ===
							'si'
								? 'border-emerald-500 bg-emerald-50 text-emerald-950'
								: 'border-gray-200 bg-white text-gray-800 hover:border-emerald-400'}"
						>
							<input
								type="radio"
								name="maggiorenne"
								value="si"
								bind:group={maggiorenne}
								onchange={() => clearFieldError('maggiorenne')}
								class="radio radio-primary radio-sm border-gray-400 bg-white checked:border-primary"
							/>
							<span>Sì, sono maggiorenne (≥ 18 anni)</span>
						</label>

						<label
							class="flex min-h-13 cursor-pointer items-center gap-2.5 rounded-xl border-2 p-3 font-bold transition {maggiorenne ===
							'no'
								? 'border-red-600 bg-red-50 text-red-950'
								: 'border-gray-200 bg-white text-gray-800 hover:border-red-400'}"
						>
							<input
								type="radio"
								name="maggiorenne"
								value="no"
								bind:group={maggiorenne}
								onchange={() => clearFieldError('maggiorenne')}
								class="radio radio-primary radio-sm border-gray-400 bg-white checked:border-primary"
							/>
							<span>No, sono minorenne (&lt; 18 anni)</span>
						</label>
					</div>

					{#if maggiorenne === 'no'}
						<div
							role="alert"
							class="mt-3 flex items-start gap-2.5 rounded-xl border-2 border-red-400 bg-red-50 p-4 text-xs leading-relaxed text-red-950 shadow-2xs"
						>
							<AlertTriangle class="mt-0.5 size-5 shrink-0 text-red-700" />
							<div>
								<strong class="text-sm text-red-900">
									Impossibile procedere: candidatura riservata a persone maggiorenni.
								</strong>
								<p class="mt-1">
									Per ragioni legali, assicurative e logistiche (incluso il pernottamento al Combo
									Bologna e le responsabilità durante la conferenza), non è possibile inviare la
									candidatura tramite questo modulo se non sei maggiorenne. Se compirai 18 anni
									prima dell'inizio della conferenza (19 aprile 2027) o per situazioni particolari,
									contatta il Comitato Organizzatore scrivendo a
									<a
										href={`mailto:${contactEmail}`}
										class="font-bold text-primary underline hover:text-secondary">{contactEmail}</a
									>.
								</p>
							</div>
						</div>
					{/if}

					{#if errors.maggiorenne && maggiorenne !== 'no'}
						<p class="mt-1.5 text-xs font-semibold text-red-700">{errors.maggiorenne}</p>
					{/if}
				</div>

				<!-- Cause di Rigetto Immediato e Irrevocabile -->
				<div class="mb-6 rounded-xl border border-red-200 bg-red-50/80 p-5">
					<div class="mb-2 flex items-center gap-2 text-sm font-bold text-primary">
						<AlertTriangle class="size-5 shrink-0 text-red-700" />
						Cause di Rigetto Immediato e Irrevocabile (Criteri Ufficiali)
					</div>
					<ul class="list-inside list-disc space-y-1.5 text-xs text-red-950">
						<li>
							<strong
								>Motivazione personale (in qualunque formato: testo, video, audio o tavola grafica)
								con chiaro ed evidente utilizzo passivo di IA</strong
							>
							senza apporto personale o autentico: l'AI è un ottimo strumento di supporto, ma vogliamo
							ascoltare e vedere la vostra voce, le vostre imperfezioni, le vostre idee e il vostro entusiasmo
							reale!
						</li>
						<li>
							<strong>Dichiarazioni mendaci o false</strong> su dati anagrafici, ruoli, attività nel proprio
							LC o iscrizioni.
						</li>
						<li>
							<strong>Mancata regolarizzazione dell'iscrizione ad AISF</strong> al momento del pagamento
							della quota CISF27.
						</li>
						<li>
							<strong>Insulti, minacce, messaggi di odio, ingiurie o propaganda</strong> di
							qualunque tipo in contrasto con lo statuto AISF e il
							<a
								href={`${criteriPageUrl}#codice-etico`}
								target="_blank"
								rel="noopener noreferrer"
								class="font-bold text-red-900 underline">Codice Etico</a
							>.
						</li>
					</ul>
				</div>

				<!-- Dichiarazione di Presa Visione Criteri -->
				<div class="mb-6" data-field-id="check_criteri">
					<label
						class="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border bg-white p-4 shadow-2xs transition hover:bg-gray-50/60 {errors.check_criteri
							? 'border-red-600 ring-1 ring-red-600'
							: 'border-gray-200'}"
					>
						<input
							type="checkbox"
							id="check-criteri"
							bind:checked={checkCriteri}
							onchange={() => clearFieldError('check_criteri')}
							class="checkbox checkbox-primary checkbox-sm mt-0.5 border-gray-400 bg-white checked:border-primary checked:bg-primary"
						/>
						<span class="text-xs leading-relaxed font-medium text-gray-800 sm:text-sm">
							Dichiaro di aver preso visione dei
							<a
								href={criteriPdfUrl}
								target="_blank"
								rel="noopener noreferrer"
								onclick={(e) => e.stopPropagation()}
								class="font-bold text-primary underline">Criteri di Selezione CISF27</a
							>, delle scadenze e del
							<a
								href={`${criteriPageUrl}#codice-etico`}
								target="_blank"
								rel="noopener noreferrer"
								onclick={(e) => e.stopPropagation()}
								class="font-bold text-primary underline">Codice Etico</a
							>.
						</span>
					</label>
					{#if errors.check_criteri}
						<p class="mt-1 text-xs font-semibold text-red-700">{errors.check_criteri}</p>
					{/if}
				</div>

				<!-- SCELTA TIPOLOGIA DI CANDIDATURA (ALLOGGIO & QUOTA) -->
				<div class="mb-6 border-t border-gray-200 pt-5" data-field-id="tipologia_quota">
					<h3 class="mb-2 flex items-center gap-2 text-base font-bold text-secondary">
						<span>🏷️</span> Seleziona la Tipologia di Partecipazione Desiderata
					</h3>
					<div
						class="mb-5 flex items-start gap-3 rounded-xl border border-base-300 bg-base-200/60 p-4 text-xs text-stone-800 shadow-xs sm:text-sm"
					>
						<span class="mt-0.5 shrink-0 text-lg leading-none select-none" aria-hidden="true"
							>👉🏼</span
						>
						<div class="leading-relaxed">
							<span class="font-bold text-secondary">Form Unificato con opzione Flessibile:</span>
							Puoi candidarti direttamente per una delle due tariffe o scegliere l'opzione
							<strong>"Indifferente / Flessibile"</strong> per dare massima libertà al CO e aumentare
							le tue probabilità di selezione!
						</div>
					</div>

					<div
						class="grid grid-cols-1 gap-4 rounded-2xl md:grid-cols-3 {errors.tipologia_quota
							? 'ring-2 ring-red-600 ring-offset-2'
							: ''}"
					>
						<!-- Opzione 1: Con Alloggio -->
						<label
							class="relative flex cursor-pointer flex-col rounded-2xl border-2 bg-white p-5 shadow-xs transition hover:border-secondary {tipologiaQuota ===
							'con_letto'
								? 'border-primary bg-red-50/20'
								: 'border-gray-200'}"
						>
							<input
								type="radio"
								name="tipologia_quota"
								value="con_letto"
								bind:group={tipologiaQuota}
								onchange={() => clearFieldError('tipologia_quota')}
								class="sr-only"
							/>
							<div class="mb-2 flex items-center justify-between">
								<span
									class="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold tracking-wider text-primary uppercase"
									>150 Posti</span
								>
								<span
									class="flex h-5 w-5 items-center justify-center rounded-full border-2 {tipologiaQuota ===
									'con_letto'
										? 'border-primary bg-primary'
										: 'border-gray-300 bg-white'}"
								>
									<span class="h-2 w-2 rounded-full bg-white"></span>
								</span>
							</div>
							<div class="mb-1 text-xl font-bold text-secondary">Con Alloggio</div>
							<div class="mb-2 text-2xl font-extrabold text-primary">{priceWithAccommodation}</div>
							<p class="mt-1 flex-1 text-xs text-gray-600">
								Pernottamento incluso per tutte le 4 notti presso il <strong
									>{accommodationName}</strong
								>
								(camere doppie, triple, quadruple con bagno privato).
							</p>
							<div class="mt-4 flex items-baseline justify-between border-t border-gray-100 pt-3">
								<span class="text-xs font-medium text-gray-500">Formula All-Inclusive</span>
								<span class="text-xs font-bold text-primary">Combo</span>
							</div>
						</label>

						<!-- Opzione 2: Senza Alloggio -->
						<label
							class="relative flex cursor-pointer flex-col rounded-2xl border-2 bg-white p-5 shadow-xs transition hover:border-amber-600 {tipologiaQuota ===
							'senza_letto'
								? 'border-amber-600 bg-amber-50/30'
								: 'border-gray-200'}"
						>
							<input
								type="radio"
								name="tipologia_quota"
								value="senza_letto"
								bind:group={tipologiaQuota}
								onchange={() => clearFieldError('tipologia_quota')}
								class="sr-only"
							/>
							<div class="mb-2 flex items-center justify-between">
								<span
									class="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold tracking-wider text-amber-800 uppercase"
									>15 + 5 Posti</span
								>
								<span
									class="flex h-5 w-5 items-center justify-center rounded-full border-2 {tipologiaQuota ===
									'senza_letto'
										? 'border-amber-700 bg-amber-700'
										: 'border-gray-300 bg-white'}"
								>
									<span class="h-2 w-2 rounded-full bg-white"></span>
								</span>
							</div>
							<div class="mb-1 text-xl font-bold text-secondary">Senza Alloggio</div>
							<div class="mb-2 text-2xl font-extrabold text-amber-700">
								{priceWithoutAccommodation}
							</div>
							<p class="mt-1 flex-1 text-xs text-gray-600">
								Partecipazione a tutti gli eventi, conferenze e kit con pernottamento autonomo (20
								posti totali: 15 a bando nazionale + 5 riservati agli Ausiliari dell'LC Bologna a
								quota ridotta).
							</p>
							<div class="mt-4 flex items-baseline justify-between border-t border-gray-100 pt-3">
								<span class="text-xs font-medium text-gray-500">Quota Agevolata</span>
								<span class="text-xs font-bold text-amber-800">Autonomo</span>
							</div>
						</label>

						<!-- Opzione 3: Indifferente -->
						<label
							class="relative flex cursor-pointer flex-col rounded-2xl border-2 p-5 shadow-xs transition hover:border-emerald-500 {tipologiaQuota ===
							'indifferente'
								? 'border-emerald-600 bg-emerald-50/80'
								: 'border-emerald-200 bg-emerald-50/30'}"
						>
							<input
								type="radio"
								name="tipologia_quota"
								value="indifferente"
								bind:group={tipologiaQuota}
								onchange={() => clearFieldError('tipologia_quota')}
								class="sr-only"
							/>
							<div class="mb-2 flex items-center justify-between">
								<span
									class="rounded-full bg-emerald-200 px-2.5 py-0.5 text-xs font-extrabold tracking-wider text-emerald-900 uppercase"
									>Flessibile ✨</span
								>
								<span
									class="flex h-5 w-5 items-center justify-center rounded-full border-2 {tipologiaQuota ===
									'indifferente'
										? 'border-emerald-600 bg-emerald-600'
										: 'border-emerald-500 bg-white'}"
								>
									<span class="h-2 w-2 rounded-full bg-white"></span>
								</span>
							</div>
							<div class="mb-1 text-xl font-bold text-emerald-950">Indifferente</div>
							<div class="mb-2 text-lg font-bold text-gray-700">
								{priceWithAccommodation} o {priceWithoutAccommodation}
							</div>
							<p class="mt-1 flex-1 text-xs text-emerald-900/85">
								Accetti indifferentemente entrambe le soluzioni: il CO assegnerà la tariffa in base
								alle disponibilità residue per accogliere il massimo numero di partecipanti.
							</p>
							<div
								class="mt-4 flex items-baseline justify-between border-t border-emerald-200 pt-3"
							>
								<span class="text-xs font-bold text-emerald-800">Massimizza ammissione</span>
								<span class="text-xs font-bold text-emerald-700">Consigliato</span>
							</div>
						</label>
					</div>

					{#if errors.tipologia_quota}
						<p class="mt-2 text-xs font-semibold text-red-700">{errors.tipologia_quota}</p>
					{/if}

					<!-- Preferenza secondaria per Indifferente -->
					{#if tipologiaQuota === 'indifferente'}
						<div
							class="mt-4 rounded-xl border border-emerald-300 bg-white p-4 text-xs"
							data-field-id="sub_preferenza"
						>
							<p class="mb-2 font-bold text-emerald-950">
								Pur essendo flessibile, quale sarebbe la tua preferenza ideale di massima?
							</p>
							<div class="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:gap-6">
								<label class="flex min-h-11 cursor-pointer items-center gap-2 text-gray-800">
									<input
										type="radio"
										name="sub_preferenza"
										value="pref_con_letto"
										bind:group={subPreferenza}
										onchange={() => clearFieldError('sub_preferenza')}
										class="radio radio-primary radio-sm border-gray-400 bg-white checked:border-primary"
									/>
									<span>Preferirei <span class="font-bold">con</span> alloggio</span>
								</label>
								<label class="flex min-h-11 cursor-pointer items-center gap-2 text-gray-800">
									<input
										type="radio"
										name="sub_preferenza"
										value="pref_senza_letto"
										bind:group={subPreferenza}
										onchange={() => clearFieldError('sub_preferenza')}
										class="radio radio-primary radio-sm border-gray-400 bg-white checked:border-primary"
									/>
									<span>Preferirei <span class="font-bold">senza</span> alloggio</span>
								</label>
								<label class="flex min-h-11 cursor-pointer items-center gap-2 text-gray-800">
									<input
										type="radio"
										name="sub_preferenza"
										value="pref_pura"
										bind:group={subPreferenza}
										onchange={() => clearFieldError('sub_preferenza')}
										class="radio radio-primary radio-sm border-gray-400 bg-white checked:border-primary"
									/>
									<span>Nessuna preferenza (100% indifferente)</span>
								</label>
							</div>
							{#if errors.sub_preferenza}
								<p class="mt-1 text-xs font-semibold text-red-700">{errors.sub_preferenza}</p>
							{/if}
						</div>
					{/if}
				</div>

				<!-- Avvertenza di Responsabilità -->
				<div
					class="mt-6 flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50/80 p-3.5 text-xs text-amber-950 shadow-2xs"
				>
					<span class="shrink-0 text-sm font-black text-amber-700">❗</span>
					<div>
						<strong>Avvertenza di Responsabilità &amp; Correttezza:</strong> Ricordiamo che, in base
						ai criteri di selezione ufficiali CISF27,
						<em
							>qualsiasi dichiarazione non veritiera o mendace comporterà l'immediato e irrevocabile
							rigetto della candidatura</em
						>. Se durante la compilazione o dopo l'invio ti accorgi di aver commesso un errore
						materiale involontario, contatta tempestivamente il CO all'indirizzo
						<a
							href={`mailto:${contactEmail}`}
							class="font-bold text-secondary underline hover:text-primary">{contactEmail}</a
						>
						per rettificare i dati!
					</div>
				</div>

				{#if stepErrorBanner}
					<div
						role="alert"
						class="mt-5 flex items-start gap-2.5 rounded-xl border border-red-300 bg-red-50 p-3.5 text-xs font-semibold text-red-900"
					>
						<AlertTriangle class="mt-0.5 size-4 shrink-0 text-red-700" />
						<span>{stepErrorBanner}</span>
					</div>
				{/if}

				<div class="mt-8 flex flex-col items-end gap-2">
					<button
						type="button"
						disabled={maggiorenne === 'no'}
						onclick={() => goToStep(1)}
						class="btn btn-primary min-h-12 rounded-xl px-6 text-sm font-bold text-white shadow-md disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-600 disabled:shadow-none"
					>
						Continua: Ma tu... chi sei?!
						<ArrowRight class="size-4" />
					</button>
					{#if maggiorenne === 'no'}
						<p class="text-xs font-semibold text-red-700">
							Non è possibile proseguire con la candidatura se sei minorenne.
						</p>
					{/if}
				</div>
			</div>
		{/if}

		<!-- =================================================================== -->
		<!-- SCHERMATA 2 / STEP 1: LETTERA MOTIVAZIONALE & PROPOSTA CREATIVA     -->
		<!-- =================================================================== -->
		{#if showWizard && currentStep === 1}
			<div class="rounded-2xl border border-primary/20 bg-base-100 shadow-lg mb-8 p-5 sm:p-10">
				<div class="mb-6 flex items-center gap-3">
					<div
						class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-100 text-sm font-bold text-purple-900"
					>
						02
					</div>
					<div>
						<h2 class="font-playfair-display text-2xl font-bold text-secondary sm:text-3xl">
							Motivazione Creativa &amp; Proposta di Talk
						</h2>
						<p class="text-xs text-gray-600 sm:text-sm">
							Presenta chi sei, il tuo entusiasmo scientifico e perché vuoi vivere la CISF27 a
							Bologna
						</p>
					</div>
				</div>

				<!-- Nota Informativa per Ruoli con Ammissione di Diritto -->
				{#if isAutoAdmissionRole}
					<div
						class="mb-5 flex items-start gap-2.5 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-xs text-emerald-950"
					>
						<span class="shrink-0 text-base">✨</span>
						<div>
							<strong>Nota di servizio istituzionale:</strong>
							In virtù del ruolo che ricopri (come stabilito dai Criteri di Selezione), per te la
							<em>motivazione creativa</em> è <strong>FACOLTATIVA</strong>! Se desideri comunque
							condividere le tue idee per la conferenza o proporre una parallel session o un talk,
							il tuo contributo sarà caldamente apprezzato dal CO.
						</div>
					</div>
				{/if}

				<!-- Guida Strategica alla Motivazione -->
				<div
					class="mb-4 space-y-3 rounded-xl border border-blue-200 bg-linear-to-r from-blue-50 to-indigo-50 p-4 text-xs text-blue-950 shadow-2xs sm:p-5"
				>
					<div class="flex items-center gap-2 text-sm font-bold text-blue-900">
						<svg
							class="h-4 w-4 shrink-0 text-blue-700"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
						Come sfruttare al meglio lo spazio (e tutelare la valutazione anonima):
					</div>

					<p class="leading-relaxed text-blue-900/90">
						La tua motivazione verrà valutata in <strong>modalità anonima</strong>. Nei passaggi
						successivi ti chiederemo già tutti i dati formali e logistici:
						<strong
							>ti chiediamo quindi di <u>NON</u> inserire nella motivazione i tuoi dati identificativi
							o un elenco burocratico del CV</strong
						>:
					</p>

					<div class="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2">
						<div class="rounded-lg border border-blue-200/80 bg-white/85 p-3">
							<div class="mb-1.5 flex items-center gap-1.5 font-bold text-red-800">
								<span>🚫</span> Cosa NON inserire qui (te lo chiediamo dopo):
							</div>
							<ul class="space-y-1 text-[11px] text-gray-700">
								<li>
									🙅🏼‍♂️ <strong>Identità &amp; Ateneo:</strong> evita nome, cognome e città/università del
									tuo LC (per garantire il doppio cieco!)
								</li>
								<li>
									🙅🏿 <strong>Elenco cariche &amp; Storico:</strong> ruoli formali in AISF/IAPS e lista
									di conferenze passate (Step 3)
								</li>
								<li>
									🙅🏻‍♀️ <strong>Logistica, Camere &amp; Diete:</strong> preferenze alloggio, coinquilini,
									allergie e accessibilità (Step 5)
								</li>
							</ul>
						</div>

						<div class="rounded-lg border border-indigo-300 bg-white/95 p-3 shadow-2xs">
							<div class="mb-1.5 flex items-center gap-1.5 font-bold text-emerald-800">
								<span>🎯</span> Su cosa concentrarti (ciò che la commissione premia):
							</div>
							<ul class="space-y-1 text-[11px] text-gray-800">
								<li>
									✓ <strong>La tua vocazione scientifica:</strong> cosa ti accende nella fisica e quali
									temi/pilastri di CISF27 ti incuriosiscono di più
								</li>
								<li>
									✓ <strong>Il tema <em>«Perché fisica? Che ci faccio?»</em>:</strong> le tue domande
									sul futuro e la voglia di fare rete con studentə da tutta Italia
								</li>
								<li>
									✓ <strong>Spunti propositivi:</strong> idee, domande o contributi attivi che vorresti
									portare nelle plenarie, tavole rotonde e discussioni
								</li>
							</ul>
						</div>
					</div>
					<p class="mt-2 text-[11px] font-bold text-blue-800">
						👉🏼 Concentrati sulla tua motivazione, curiosità, aspettative e sull'energia che desideri
						portare a Bologna!
					</p>
				</div>

				<!-- NOTA SULL'ANONIMATO (OBBLIGATORIA) -->
				<div
					class="mb-6 flex items-start gap-2.5 rounded-xl border border-emerald-300 bg-emerald-50/80 p-4 text-xs leading-relaxed text-emerald-950 shadow-2xs"
				>
					<span class="shrink-0 text-base">🔒</span>
					<div>
						<strong>Nota sull'anonimato:</strong> garantiamo quanto più possibile l'anonimato e l'imparzialità,
						anche per i video e mini-podcast. Il file viene rinominato automaticamente con un codice anonimo
						senza nome, ateneo o LC; qualora un revisore dovesse riconoscerti, la valutazione verrà subito
						riassegnata a un membro terzo indipendente.
					</div>
				</div>

				<!-- FORMATI ACCETTATI -->
				<div class="mb-4">
					<p class="mb-2 block text-xs font-bold text-gray-800 sm:text-sm">
						Scegli come esprimere la tua proposta motivazionale:
					</p>
					<div class="grid grid-cols-2 gap-2.5 text-xs sm:grid-cols-4">
						{#each [{ val: 'testo', label: '✍🏼 Lettera' }, { val: 'video', label: '🎥 Video' }, { val: 'audio', label: '🎙️ Mini-Podcast' }, { val: 'canvas', label: '🎨 Canvas' }] as fmt (fmt.val)}
							<label
								class="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border bg-white px-3 py-2.5 font-semibold text-gray-800 transition hover:border-primary {tipoLettera ===
								fmt.val
									? 'border-primary bg-red-50/25 text-secondary'
									: 'border-gray-300'}"
							>
								<input
									type="radio"
									name="tipo_lettera"
									value={fmt.val}
									bind:group={tipoLettera}
									class="radio radio-primary radio-sm border-gray-400 bg-white checked:border-primary"
								/>
								<span>{fmt.label}</span>
							</label>
						{/each}
					</div>
					<p class="mt-2 text-[11px] text-gray-600">
						💡 <strong
							>Progetti tecnici o repository (es. GitHub, paper, portfolio, progetto web):</strong
						>
						sono un <em>allegato complementare facoltativo</em> molto gradito, che puoi inserire come
						link di supporto nello spazio apposito sottostante!
					</p>
				</div>

				<!-- Guida Contestuale alle Lunghezze Consigliate (Zona Aurea) -->
				<div
					class="mb-5 rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-xs text-amber-950 shadow-2xs"
				>
					{#if tipoLettera === 'testo'}
						<div class="space-y-1.5">
							<div class="flex items-center gap-1.5 text-sm font-bold text-secondary">
								<span>✍🏼</span> Lettera: Misura Umana &amp; "Zona Aurea"
							</div>
							<p class="leading-relaxed">
								Cerca di essere umano con la lunghezza: non fissiamo un tetto massimo numerico
								rigido per non castrare la tua espressione, ma attenzione,
								<strong
									>una motivazione troppo corta, telegrafica o superficiale subirà un malus nella
									valutazione</strong
								>.
							</p>
							<div
								class="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300/60 bg-white/90 p-2.5"
							>
								<span class="font-bold text-primary">✨ Zona Aurea consigliata:</span>
								<span class="font-bold text-gray-800"
									>350 – 700 parole (~1 facciata standard A4)</span
								>
							</div>
						</div>
					{:else if tipoLettera === 'video'}
						<div class="space-y-1.5">
							<div class="flex items-center gap-1.5 text-sm font-bold text-secondary">
								<span>🎥</span> Video: Naturalezza &amp; Durata Ideale
							</div>
							<p class="leading-relaxed">
								Sii spontaneə e concentratə: non serve un cortometraggio cinematografico, ma un
								video di appena 15-20 secondi privo di reale contenuto subirà un malus.
							</p>
							<div
								class="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300/60 bg-white/90 p-2.5"
							>
								<span class="font-bold text-primary">✨ Zona Aurea consigliata:</span>
								<span class="font-bold text-gray-800">1:30 – 3:00 minuti</span>
							</div>
						</div>
					{:else if tipoLettera === 'audio'}
						<div class="space-y-1.5">
							<div class="flex items-center gap-1.5 text-sm font-bold text-secondary">
								<span>🎙️</span> Audio / Podcast: Ritmo &amp; Calore della Voce
							</div>
							<p class="leading-relaxed">
								Raccontati come a un amico davanti a un caffè: niente audiolibri interminabili, ma
								neanche un messaggio vocale da 30 secondi che comporterebbe un malus.
							</p>
							<div
								class="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300/60 bg-white/90 p-2.5"
							>
								<span class="font-bold text-primary">✨ Zona Aurea consigliata:</span>
								<span class="font-bold text-gray-800">2:00 – 4:00 minuti</span>
							</div>
						</div>
					{:else}
						<div class="space-y-1.5">
							<div class="flex items-center gap-1.5 text-sm font-bold text-secondary">
								<span>🎨</span> Tavola Grafica / Canvas: Sintesi Visiva &amp; Cura
							</div>
							<p class="leading-relaxed">
								«Un'immagine vale più di mille parole»: non mandare una presentazione di 40 slide,
								ma nemmeno una singola immagine vuota con un post-it che riceverebbe un malus.
							</p>
							<div
								class="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300/60 bg-white/90 p-2.5"
							>
								<span class="font-bold text-primary">✨ Zona Aurea consigliata:</span>
								<span class="font-bold text-gray-800"
									>1 – 2 tavole / 5 – 8 slide ad alta densità visiva o testuale</span
								>
							</div>
						</div>
					{/if}
				</div>

				<!-- Originalità e Creatività -->
				<div
					class="mb-6 flex items-start gap-2 rounded-xl border border-purple-200 bg-purple-50/70 p-3.5 text-xs text-purple-950 shadow-2xs"
				>
					<span class="shrink-0 text-base">💡</span>
					<div>
						<strong>La creatività verrà premiata!</strong>
						Qualunque formato tu scelga, l'originalità e l'autenticità riceveranno un punteggio premiante
						dalla commissione. Anche se decidi di scrivere una
						<strong>lettera classica</strong>, ricorda che può essere realizzata in mille modi
						originali (struttura, aneddoti personali, forma epistolare, registro brillante,
						dialoghi...): stupiscici!
					</div>
				</div>

				<!-- UPLOAD FILE CREATIVO -->
				<div class="mb-6" data-field-id="motivazione_required">
					<div data-field-id="motivazione_file">
						<label for="input-file-motivazione" class="mb-2 block text-sm font-bold text-secondary">
							Carica la tua Motivazione Creativa
							<span class="text-[11px] font-semibold text-gray-500">
								{isAutoAdmissionRole
									? '(Facoltativa per il tuo ruolo associativo)'
									: '(Obbligatoria, salvo invio tramite link esterno sottostante)'}
							</span>
						</label>

						<div
							role="region"
							aria-label="Area caricamento file motivazione"
							ondragover={(e) => {
								e.preventDefault();
								motivazioneDragOver = true;
							}}
							ondragleave={() => (motivazioneDragOver = false)}
							ondrop={handleMotivazioneDrop}
							class="rounded-2xl border-2 border-dashed p-6 text-center transition {motivazioneDragOver
								? 'border-primary bg-red-50/40'
								: errors.motivazione_file || errors.motivazione_required
									? 'border-red-600 bg-red-50/20'
									: motivazioneFile
										? 'border-emerald-500 bg-emerald-50/30'
										: 'border-primary/40 bg-white hover:border-primary'}"
						>
							<input
								bind:this={motivazioneInputEl}
								type="file"
								id="input-file-motivazione"
								class="sr-only"
								onchange={(e) => {
									const input = e.currentTarget as HTMLInputElement;
									handleMotivazioneFile(input.files?.[0] ?? null);
								}}
							/>
							<label for="input-file-motivazione" class="block cursor-pointer">
								<Upload
									class="mx-auto mb-2 size-10 {motivazioneFile
										? 'text-emerald-600'
										: 'text-primary/60'}"
								/>
								{#if motivazioneFile}
									<p class="text-sm font-extrabold break-all text-emerald-800">
										File selezionato: {motivazioneFile.name} ({formatBytesToMB(
											motivazioneFile.size
										)} MB)
									</p>
								{:else}
									<p class="text-sm font-bold text-gray-800">
										Trascina qui il tuo file o clicca per sfogliare
									</p>
								{/if}
								<p class="mt-1 text-xs text-gray-600">
									<strong>
										PDF, PPTX, MP4, HTML,
										<span class="font-serif inline-block uppercase select-none">
											L<span class="-mr-[0.15em] -ml-[0.32em] align-[0.25em] text-[0.75em]">a</span
											>T<span class="-mr-[0.12em] -ml-[0.16em] align-[-0.22em]">e</span>X
										</span>
										(con istruzioni di build), archivio (.zip, .tar.gz), ecc.
									</strong>
									— Limite allegato diretto: <strong>max {MOTIVATION_UI_MAX_MB} MB</strong>.
								</p>
								<p class="mt-1 text-[11px] font-medium text-amber-900">
									📹 Per video HD o file superiori a {MOTIVATION_UI_MAX_MB} MB, usa il campo
									<strong>Link esterno</strong> qui sotto (es. Google Drive, YouTube non in elenco, Canva).
								</p>
								<span
									class="mt-3 inline-flex min-h-11 items-center justify-center rounded-xl border px-4 py-2 text-xs font-bold {motivazioneFile
										? 'border-emerald-300 bg-emerald-100 text-emerald-900'
										: 'border-gray-300 bg-gray-100 text-gray-800 hover:bg-gray-200'}"
								>
									{motivazioneFile ? 'Cambia file' : 'Scegli file dal computer'}
								</span>
							</label>

							{#if motivazioneFile}
								<div class="mt-3">
									<button
										type="button"
										onclick={() => handleMotivazioneFile(null)}
										class="btn btn-xs min-h-9 border border-red-200 bg-white text-red-700 hover:bg-red-50"
									>
										<X class="size-3.5" />
										Rimuovi allegato
									</button>
								</div>
							{/if}
						</div>

						{#if errors.motivazione_file}
							<p class="mt-1.5 text-xs font-semibold text-red-700">{errors.motivazione_file}</p>
						{/if}
						{#if errors.motivazione_required}
							<p class="mt-1.5 text-xs font-semibold text-red-700">{errors.motivazione_required}</p>
						{/if}
					</div>
				</div>

				<!-- BOX LINK ESTERNO -->
				<div
					class="mb-6 rounded-xl border bg-gray-50/80 p-4 {errors.link_progetto
						? 'border-red-500'
						: 'border-gray-200'}"
					data-field-id="link_progetto"
				>
					<label
						for="link-progetto-multimediale"
						class="mb-1.5 block text-xs font-bold text-gray-800 sm:text-sm"
					>
						{#if isAutoAdmissionRole}
							Link esterno (Facoltativo per il tuo ruolo associativo — utile per video o progetti
							complementari)
						{:else}
							Link esterno (Obbligatorio se non carichi un file sopra; altrimenti facoltativo per
							progetti complementari)
						{/if}
					</label>
					<input
						type="url"
						id="link-progetto-multimediale"
						bind:value={linkProgetto}
						oninput={() => {
							clearFieldError('link_progetto');
							clearFieldError('motivazione_required');
						}}
						placeholder="https://... (Sito web, Google Drive, YouTube non in elenco, Canva, GitHub...)"
						class="input input-bordered min-h-11 w-full rounded-xl bg-white text-xs text-gray-900 sm:text-sm {errors.link_progetto
							? 'border-red-600 ring-1 ring-red-600'
							: 'border-gray-300'}"
					/>
					<span class="mt-1 block text-[11px] text-gray-600">
						Assicurati che il link sia accessibile senza richiesta di accesso (es. permessi
						'Chiunque abbia il link può visualizzare').
					</span>
					{#if errors.link_progetto}
						<p class="mt-1 text-xs font-semibold text-red-700">{errors.link_progetto}</p>
					{/if}
				</div>

				<!-- PARALLEL SESSION & SCIENTIFIC TALK PROPOSAL -->
				<div class="mb-6 rounded-xl border border-amber-200 bg-amber-50/50 p-4 sm:p-5">
					<label class="flex min-h-11 cursor-pointer items-start gap-3">
						<input
							type="checkbox"
							id="check-parallel"
							bind:checked={checkParallel}
							onchange={() => {
								clearFieldError('parallel_readiness');
								clearFieldError('parallel_title');
								clearFieldError('parallel_abstract');
								clearFieldError('talk_file');
							}}
							class="checkbox checkbox-primary checkbox-sm mt-1 border-gray-400 bg-white checked:border-primary checked:bg-primary"
						/>
						<div>
							<span class="text-xs font-bold text-secondary sm:text-sm">
								Sarei disponibile a presentare una Parallel Session o un Talk Scientifico durante la
								conferenza (Facoltativo)
							</span>
							<p class="mt-0.5 text-xs text-gray-700">
								La disponibilità a tenere un talk è un elemento premiante nella griglia di
								selezione! Può essere un estratto della tua tesi triennale o magistrale, un progetto
								di ricerca personale, oppure un talk divulgativo o associativo.
							</p>
						</div>
					</label>

					{#if checkParallel}
						<div class="mt-4 space-y-4 border-t border-amber-200/70 pt-4">
							<div data-field-id="parallel_readiness">
								<label
									for="select-parallel-readiness"
									class="mb-1 block text-xs font-bold text-secondary"
								>
									Stato attuale della proposta di intervento:
								</label>
								<select
									id="select-parallel-readiness"
									bind:value={parallelReadiness}
									onchange={() => clearFieldError('parallel_readiness')}
									class="select select-bordered min-h-11 w-full rounded-xl bg-white text-xs text-gray-900 sm:text-sm {errors.parallel_readiness
										? 'border-red-600 ring-1 ring-red-600'
										: 'border-amber-300'}"
								>
									<option value="si_definito"
										>Sì, proposta già strutturata (lavoro/ricerca pronto o in fase avanzata)</option
									>
									<option value="forse_in_corso"
										>Sì / Forse in via di definizione (tesi o progetto in corso, confermerò i
										dettagli entro marzo)</option
									>
								</select>
								<p class="mt-1 text-[11px] text-amber-900">
									💡 Anche un "Forse / In via di definizione" accompagnato da un titolo chiaro e da
									un abstract preliminare ben strutturato verrà pienamente valorizzato dalla
									Commissione Scientifica!
								</p>
								{#if errors.parallel_readiness}
									<p class="mt-1 text-xs font-semibold text-red-700">
										{errors.parallel_readiness}
									</p>
								{/if}
							</div>

							<div data-field-id="parallel_title">
								<label
									for="input-parallel-title"
									class="mb-1 block text-xs font-bold text-secondary"
								>
									Titolo provvisorio del Talk / Parallel Session:
								</label>
								<input
									type="text"
									id="input-parallel-title"
									bind:value={parallelTitle}
									oninput={() => clearFieldError('parallel_title')}
									placeholder="Es. Modellizzazione stocastica di sistemi complessi / Fisica dei rivelatori di particelle..."
									class="input input-bordered min-h-11 w-full rounded-xl bg-white text-xs text-gray-900 sm:text-sm {errors.parallel_title
										? 'border-red-600 ring-1 ring-red-600'
										: 'border-amber-300'}"
								/>
								{#if errors.parallel_title}
									<p class="mt-1 text-xs font-semibold text-red-700">{errors.parallel_title}</p>
								{/if}
							</div>

							<div data-field-id="parallel_abstract">
								<label
									for="input-parallel-abstract"
									class="mb-1 block text-xs font-bold text-secondary"
								>
									Abstract sintetico o riassunto di massima dell'intervento:
								</label>
								<textarea
									id="input-parallel-abstract"
									rows="3"
									bind:value={parallelAbstract}
									oninput={() => clearFieldError('parallel_abstract')}
									placeholder="Spiega sinteticamente l'argomento, il livello scientifico e il target del pubblico (va benissimo anche una versione preliminare)..."
									class="textarea textarea-bordered w-full rounded-xl bg-white text-xs text-gray-900 sm:text-sm {errors.parallel_abstract
										? 'border-red-600 ring-1 ring-red-600'
										: 'border-amber-300'}"></textarea>
								{#if errors.parallel_abstract}
									<p class="mt-1 text-xs font-semibold text-red-700">{errors.parallel_abstract}</p>
								{/if}
							</div>

							<div data-field-id="talk_file">
								<p class="mb-1.5 block text-xs font-bold text-amber-950">
									Hai già delle slide, un paper o un poster pronto? (Facoltativo — max
									{TALK_UI_MAX_MB} MB)
								</p>
								<div class="flex flex-wrap items-center gap-3">
									<input
										bind:this={talkInputEl}
										id="input-talk-file"
										type="file"
										onchange={(e) => {
											const input = e.currentTarget as HTMLInputElement;
											handleTalkFile(input.files?.[0] ?? null);
										}}
										class="peer sr-only"
									/>
									<label
										for="input-talk-file"
										class="btn btn-sm min-h-11 cursor-pointer rounded-xl px-4 text-xs font-bold shadow-2xs transition peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-1 {errors.talk_file
											? 'border-red-600 bg-red-50/40 text-red-900 hover:bg-red-50'
											: talkFile
												? 'border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
												: 'border-amber-300 bg-white text-secondary hover:border-primary hover:bg-amber-50/70'}"
									>
										<Upload class="size-4 shrink-0" />
										{#if talkFile}
											<span>Cambia file</span>
										{:else}
											<span>Scegli file (max {TALK_UI_MAX_MB} MB)</span>
										{/if}
									</label>
									{#if talkFile}
										<div
											class="flex max-w-full flex-wrap items-center gap-2.5 rounded-xl border border-emerald-300 bg-emerald-50/80 px-3 py-2 text-xs text-emerald-950 shadow-2xs"
										>
											<FileText class="size-4 shrink-0 text-emerald-700" />
											<div class="min-w-0 flex-1 leading-snug">
												<span class="font-bold break-all text-emerald-900">{talkFile.name}</span>
												<span class="ml-1 whitespace-nowrap text-emerald-800/90">
													({formatBytesToMB(talkFile.size)} MB)
												</span>
											</div>
											<button
												type="button"
												onclick={() => handleTalkFile(null)}
												class="btn btn-xs min-h-9 shrink-0 rounded-lg border border-red-200 bg-white text-red-700 hover:bg-red-50"
											>
												<X class="size-3.5" />
												Rimuovi
											</button>
										</div>
									{/if}
								</div>
								{#if errors.talk_file}
									<p class="mt-1 text-xs font-semibold text-red-700">{errors.talk_file}</p>
								{/if}
							</div>
						</div>
					{/if}
				</div>

				<!-- Avvertenza di Responsabilità -->
				<div
					class="mt-6 flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50/80 p-3.5 text-xs text-amber-950 shadow-2xs"
				>
					<span class="shrink-0 text-sm font-black text-amber-700">❗</span>
					<div>
						<strong>Avvertenza di Responsabilità &amp; Correttezza:</strong> Ricordiamo che, in base
						ai criteri di selezione ufficiali CISF27,
						<em
							>qualsiasi dichiarazione non veritiera o mendace comporterà l'immediato e irrevocabile
							rigetto della candidatura</em
						>. Se durante la compilazione o dopo l'invio ti accorgi di aver commesso un errore
						materiale involontario, contatta tempestivamente il CO all'indirizzo
						<a
							href={`mailto:${contactEmail}`}
							class="font-bold text-secondary underline hover:text-primary">{contactEmail}</a
						>
						per rettificare i dati!
					</div>
				</div>

				{#if stepErrorBanner}
					<div
						role="alert"
						class="mt-5 flex items-start gap-2.5 rounded-xl border border-red-300 bg-red-50 p-3.5 text-xs font-semibold text-red-900"
					>
						<AlertTriangle class="mt-0.5 size-4 shrink-0 text-red-700" />
						<span>{stepErrorBanner}</span>
					</div>
				{/if}

				<div class="mt-8 flex flex-wrap items-center justify-between gap-3">
					<button
						type="button"
						onclick={() => goToStep(0)}
						class="btn min-h-12 rounded-xl border border-gray-300 bg-white px-5 text-xs font-bold text-gray-700 hover:bg-gray-100"
					>
						<ArrowLeft class="size-4" />
						Indietro: Criteri &amp; Quota
					</button>
					<button
						type="button"
						onclick={() => goToStep(2)}
						class="btn btn-primary min-h-12 rounded-xl px-6 text-sm font-bold text-white shadow-md"
					>
						Continua: Anagrafica &amp; Percorso
						<ArrowRight class="size-4" />
					</button>
				</div>
			</div>
		{/if}

		<!-- =================================================================== -->
		<!-- SCHERMATA 3 / STEP 2: DATI ANAGRAFICI, ACCADEMICI & RUOLI AISF      -->
		<!-- =================================================================== -->
		{#if showWizard && currentStep === 2}
			<div class="rounded-2xl border border-primary/20 bg-base-100 shadow-lg mb-8 p-5 sm:p-10">
				<div class="mb-6 flex items-center gap-3">
					<div
						class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-sm font-bold text-primary"
					>
						03
					</div>
					<div>
						<h2 class="font-playfair-display text-2xl font-bold text-secondary sm:text-3xl">
							Dati Anagrafici &amp; Esperienze Associative
						</h2>
						<p class="text-xs text-gray-600 sm:text-sm">
							Inserisci i tuoi dati e il percorso associativo in AISF / IAPS
						</p>
					</div>
				</div>

				<!-- 1. ANAGRAFICA PERSONALE -->
				<div class="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
					<div data-field-id="nome">
						<label for="input-nome" class="mb-1 block text-xs font-bold text-gray-800">
							Nome (da documento)
						</label>
						<input
							type="text"
							id="input-nome"
							bind:value={nome}
							oninput={() => clearFieldError('nome')}
							placeholder="Es. Laura"
							autocomplete="given-name"
							class="input input-bordered min-h-11 w-full rounded-xl bg-white text-xs text-gray-900 sm:text-sm {errors.nome
								? 'border-red-600 ring-1 ring-red-600'
								: 'border-gray-300'}"
						/>
						{#if errors.nome}
							<p class="mt-1 text-xs font-semibold text-red-700">{errors.nome}</p>
						{/if}
					</div>

					<div data-field-id="cognome">
						<label for="input-cognome" class="mb-1 block text-xs font-bold text-gray-800">
							Cognome (da documento)
						</label>
						<input
							type="text"
							id="input-cognome"
							bind:value={cognome}
							oninput={() => clearFieldError('cognome')}
							placeholder="Es. Bassi"
							autocomplete="family-name"
							class="input input-bordered min-h-11 w-full rounded-xl bg-white text-xs text-gray-900 sm:text-sm {errors.cognome
								? 'border-red-600 ring-1 ring-red-600'
								: 'border-gray-300'}"
						/>
						{#if errors.cognome}
							<p class="mt-1 text-xs font-semibold text-red-700">{errors.cognome}</p>
						{/if}
					</div>
				</div>

				<!-- Email + Codice Fiscale -->
				<div class="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
					<div data-field-id="email">
						<label for="input-email" class="mb-1 block text-xs font-bold text-gray-800">
							Email per comunicazioni CISF27
						</label>
						<input
							type="email"
							id="input-email"
							bind:value={email}
							oninput={() => clearFieldError('email')}
							placeholder="laura.bassi@yahoo.it"
							autocomplete="email"
							class="input input-bordered min-h-11 w-full rounded-xl bg-white text-xs text-gray-900 sm:text-sm {errors.email
								? 'border-red-600 ring-1 ring-red-600'
								: 'border-gray-300'}"
						/>
						<span class="mt-1 block text-[11px] text-gray-500">
							Tutte le notifiche e l'esito arriveranno qui.
						</span>
						{#if errors.email}
							<p class="mt-1 text-xs font-semibold text-red-700">{errors.email}</p>
						{/if}
					</div>

					<div data-field-id="codice_fiscale">
						<label for="input-codice-fiscale" class="mb-1 block text-xs font-bold text-gray-800">
							Codice Fiscale
						</label>
						<input
							type="text"
							id="input-codice-fiscale"
							value={codiceFiscale}
							oninput={handleCfInput}
							maxlength={cfAtipico ? 32 : 16}
							placeholder={cfAtipico ? 'Codice fiscale estero / atipico' : 'Es. BSSLRA01A41A944X'}
							autocomplete="off"
							spellcheck="false"
							class="input input-bordered min-h-11 w-full rounded-xl bg-white font-mono text-xs tracking-wider text-gray-900 uppercase sm:text-sm {errors.codice_fiscale
								? 'border-red-600 ring-1 ring-red-600'
								: 'border-gray-300'}"
						/>
						<label
							class="mt-2 flex min-h-9 cursor-pointer items-center gap-2 text-[11px] text-gray-700"
						>
							<input
								type="checkbox"
								id="check-cf-atipico"
								bind:checked={cfAtipico}
								onchange={() => clearFieldError('codice_fiscale')}
								class="checkbox checkbox-primary checkbox-xs border-gray-400 bg-white checked:border-primary checked:bg-primary"
							/>
							<span>Ho un Codice Fiscale estero / provvisorio / atipico</span>
						</label>
						{#if cfIndicatesMinor}
							<div
								role="alert"
								class="mt-2 flex items-start gap-2 rounded-xl border-2 border-red-400 bg-red-50 p-3 text-xs leading-relaxed text-red-950"
							>
								<AlertTriangle class="mt-0.5 size-4 shrink-0 text-red-700" />
								<div>
									<strong class="text-red-900">Attenzione — Verifica maggiore età:</strong>
									dal Codice Fiscale inserito risulta che non hai ancora compiuto 18 anni. La candidatura
									tramite questo modulo è riservata esclusivamente a persone maggiorenni: ricontrolla
									il codice inserito oppure, per casi particolari (es. 18 anni compiuti prima del 19 aprile
									2027), scrivi a
									<a
										href={`mailto:${contactEmail}`}
										class="font-bold text-primary underline hover:text-secondary">{contactEmail}</a
									>.
								</div>
							</div>
						{:else if errors.codice_fiscale}
							<p class="mt-1 text-xs font-semibold text-red-700">{errors.codice_fiscale}</p>
						{/if}
					</div>
				</div>

				<!-- Soprannome & Pronomi (Facoltativi) -->
				<div class="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
					<div>
						<div class="mb-1 flex items-center justify-between gap-2">
							<label for="input-soprannome" class="block text-xs font-bold text-gray-700">
								Soprannome per il Badge (Facoltativo)
							</label>
							<span class="text-[10px] font-bold text-accent uppercase">Nuovo!</span>
						</div>
						<input
							type="text"
							id="input-soprannome"
							bind:value={soprannome}
							placeholder="Come vuoi essere chiamatə alla conferenza?"
							class="input input-bordered min-h-11 w-full rounded-xl border-amber-300 bg-white text-xs text-gray-900 sm:text-sm"
						/>
						<span class="mt-1 block text-[11px] text-gray-500">
							Verrà stampato sul badge accanto al tuo nome.
						</span>
					</div>

					<div>
						<label for="input-pronomi" class="mb-1 block text-xs font-bold text-gray-700">
							Pronomi (Facoltativo)
						</label>
						<input
							type="text"
							id="input-pronomi"
							bind:value={pronomi}
							placeholder="Es. lui, lei, lə, they/them/theirs..."
							class="input input-bordered min-h-11 w-full rounded-xl border-gray-300 bg-white text-xs text-gray-900 sm:text-sm"
						/>
						<span class="mt-1 block text-[11px] text-gray-500">
							Come preferisci che ci si rivolga a te?
						</span>
					</div>
				</div>

				<!-- Identità di Genere -->
				<div
					class="mb-6 rounded-xl border bg-gray-50/80 p-4 sm:p-5 {errors.genere
						? 'border-red-500'
						: 'border-gray-200'}"
					data-field-id="genere"
				>
					<p class="mb-2.5 block text-xs font-bold text-gray-800 sm:text-sm">
						Con quale identità di genere ti identifichi?
					</p>

					<div class="mb-3 grid grid-cols-2 gap-2 text-xs font-medium sm:grid-cols-5">
						{#each [{ val: 'Donna', label: 'Donna (F)', span: '' }, { val: 'Uomo', label: 'Uomo (M)', span: '' }, { val: 'Non-binario', label: 'Non-binariə', span: '' }, { val: 'Altro', label: 'Altro', span: '' }, { val: 'Preferisco non dirlo', label: 'Preferisco non dirlo', span: 'col-span-2 sm:col-span-1' }] as g (g.val)}
							<label
								class="{g.span} flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border bg-white p-2.5 text-gray-800 transition-colors hover:border-gray-400 {genere ===
								g.val
									? 'border-primary bg-red-50/25 font-bold'
									: 'border-gray-200'}"
							>
								<input
									type="radio"
									name="genere"
									value={g.val}
									bind:group={genere}
									onchange={() => {
										clearFieldError('genere');
										clearFieldError('genere_specifica');
									}}
									class="radio radio-primary radio-sm border-gray-400 bg-white checked:border-primary"
								/>
								<span>{g.label}</span>
							</label>
						{/each}
					</div>

					{#if errors.genere}
						<p class="mb-2 text-xs font-semibold text-red-700">{errors.genere}</p>
					{/if}

					{#if genere === 'Altro'}
						<div
							class="mb-3 space-y-1.5 rounded-lg border border-primary/40 bg-white p-3.5 shadow-xs"
							data-field-id="genere_specifica"
						>
							<label for="input-genere-altro" class="block text-xs font-bold text-secondary">
								Specifica la tua identità di genere:
							</label>
							<input
								type="text"
								id="input-genere-altro"
								bind:value={genereSpecifica}
								oninput={() => clearFieldError('genere_specifica')}
								placeholder="Es. Agender, Genderfluid..."
								class="input input-bordered min-h-11 w-full rounded-lg bg-white text-xs text-gray-900 sm:text-sm {errors.genere_specifica
									? 'border-red-600 ring-1 ring-red-600'
									: 'border-gray-300'}"
							/>
							<p class="text-[11px] text-gray-500">
								Questa informazione ci aiuta a mantenere parità, rappresentatività e rispetto per
								tuttə.
							</p>
							{#if errors.genere_specifica}
								<p class="text-xs font-semibold text-red-700">{errors.genere_specifica}</p>
							{/if}
						</div>
					{/if}

					<div class="text-[11px] leading-tight text-gray-600">
						<strong>Trasparenza Parità CO:</strong> I criteri prevedono la parità di genere. Chi non indica
						la polarità M/F sarà valutatə in vista della tutela statistica nella selezione.
					</div>
				</div>

				<!-- 2. PERCORSO ACCADEMICO -->
				<div class="mb-6 border-t border-gray-200 pt-5">
					<h3 class="mb-3 text-sm font-bold tracking-wider text-secondary uppercase">
						Percorso Accademico &amp; Livello di Studio
					</h3>
					<div class="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
						<div data-field-id="ateneo">
							<label for="input-ateneo" class="mb-1 block text-xs font-bold text-gray-800">
								Ateneo / Università di Appartenenza
							</label>
							<input
								type="text"
								id="input-ateneo"
								bind:value={ateneo}
								oninput={() => clearFieldError('ateneo')}
								placeholder="Es. Università della Calabria"
								class="input input-bordered min-h-11 w-full rounded-xl bg-white text-xs text-gray-900 sm:text-sm {errors.ateneo
									? 'border-red-600 ring-1 ring-red-600'
									: 'border-gray-300'}"
							/>
							{#if errors.ateneo}
								<p class="mt-1 text-xs font-semibold text-red-700">{errors.ateneo}</p>
							{/if}
						</div>

						<div data-field-id="corso_laurea">
							<label for="input-corso-laurea" class="mb-1 block text-xs font-bold text-gray-800">
								Nome completo Corso di Laurea
							</label>
							<input
								type="text"
								id="input-corso-laurea"
								bind:value={corsoLaurea}
								oninput={() => clearFieldError('corso_laurea')}
								placeholder="Es. Laurea in Astronomia, LM in Fisica del Sistema Terra..."
								class="input input-bordered min-h-11 w-full rounded-xl bg-white text-xs text-gray-900 sm:text-sm {errors.corso_laurea
									? 'border-red-600 ring-1 ring-red-600'
									: 'border-gray-300'}"
							/>
							{#if errors.corso_laurea}
								<p class="mt-1 text-xs font-semibold text-red-700">{errors.corso_laurea}</p>
							{/if}
						</div>
					</div>

					<div class="mb-4" data-field-id="livello_studio">
						<label for="select-livello-studio" class="mb-1 block text-xs font-bold text-gray-800">
							Livello di Studio Attuale
						</label>
						<select
							id="select-livello-studio"
							bind:value={livelloStudio}
							onchange={() => clearFieldError('livello_studio')}
							class="select select-bordered min-h-11 w-full rounded-xl bg-white text-xs text-gray-900 sm:text-sm {errors.livello_studio
								? 'border-red-600 ring-1 ring-red-600'
								: 'border-gray-300'}"
						>
							<option value="" disabled>Seleziona il tuo livello di studio attuale</option>
							{#each LIVELLI_STUDIO_OPTIONS as opt (opt.value)}
								<option value={opt.value}>{opt.label}</option>
							{/each}
						</select>
						{#if errors.livello_studio}
							<p class="mt-1 text-xs font-semibold text-red-700">{errors.livello_studio}</p>
						{/if}
					</div>

					<div data-field-id="curriculum">
						<label for="input-curriculum" class="mb-1 block text-xs font-bold text-gray-800">
							Curriculum / Campo o Gruppo di Ricerca
						</label>
						<input
							type="text"
							id="input-curriculum"
							bind:value={curriculum}
							oninput={() => clearFieldError('curriculum')}
							placeholder="Es. Advanced Methods in Particle Physics, Magnetoidrodinamica tra Io e Giove..."
							class="input input-bordered min-h-11 w-full rounded-xl bg-white text-xs text-gray-900 sm:text-sm {errors.curriculum
								? 'border-red-600 ring-1 ring-red-600'
								: 'border-gray-300'}"
						/>
						{#if errors.curriculum}
							<p class="mt-1 text-xs font-semibold text-red-700">{errors.curriculum}</p>
						{/if}
					</div>
				</div>

				<!-- 3. APPARTENENZA AISF & RUOLI ASSOCIATIVI -->
				<div class="mb-6 border-t border-gray-200 pt-5">
					<h3 class="mb-3 text-sm font-bold tracking-wider text-secondary uppercase">
						Appartenenza ad AISF &amp; Incarichi Istituzionali
					</h3>

					<div class="mb-4" data-field-id="iscritto_aisf">
						<label for="select-iscritto-aisf" class="mb-1 block text-xs font-bold text-gray-800">
							Sei iscrittə ad AISF?
						</label>
						<select
							id="select-iscritto-aisf"
							bind:value={iscrittoAisf}
							disabled={hasSpecialNationalRole}
							onchange={() => clearFieldError('iscritto_aisf')}
							class="select select-bordered min-h-11 w-full rounded-xl text-xs sm:text-sm {hasSpecialNationalRole
								? 'cursor-not-allowed border-emerald-300 bg-emerald-50/70 font-semibold text-emerald-950 disabled:border-emerald-300 disabled:bg-emerald-50/70 disabled:text-emerald-950 disabled:opacity-100'
								: errors.iscritto_aisf
									? 'border-red-600 bg-white text-gray-900 ring-1 ring-red-600'
									: 'border-gray-300 bg-white text-gray-900'}"
						>
							<option value="" disabled>Seleziona un'opzione</option>
							<option value="si"
								>Sì, sono regolarmente iscrittə / ho già pagato il contributo associativo</option
							>
							{#if !hasSpecialNationalRole}
								<option value="in_corso"
									>No, mi iscriverò solo se selezionatə contestualmente al pagamento della quota
									CISF27</option
								>
							{/if}
						</select>
						{#if hasSpecialNationalRole}
							<div
								class="mt-2 rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-[11px] leading-relaxed text-emerald-950"
							>
								🔒 <strong>Obbligatorio «Sì»:</strong> nella <strong>Pagina 1</strong> hai indicato
								di ricoprire un ruolo associativo speciale nazionale [<em
									>{specialNationalRoleLabel}</em
								>], che presuppone l'iscrizione attiva ad AISF. Se hai selezionato quel ruolo per
								errore, torna alla Pagina 1 per modificarlo.
							</div>
						{:else}
							<span class="mt-1 block text-[11px] text-gray-500">
								L'iscrizione ad AISF è obbligatoria per partecipare alla conferenza.
							</span>
						{/if}
						{#if errors.iscritto_aisf}
							<p class="mt-1 text-xs font-semibold text-red-700">{errors.iscritto_aisf}</p>
						{/if}
					</div>

					{#if showAisfMemberFields}
						<!-- Comitato Locale + Neo-iscritto -->
						<div class="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
							<div data-field-id="comitato_locale">
								<label
									for="select-comitato-locale"
									class="mb-1 block text-xs font-bold text-gray-800"
								>
									Comitato Locale di Appartenenza
								</label>
								<select
									id="select-comitato-locale"
									bind:value={comitatoLocale}
									onchange={() => clearFieldError('comitato_locale')}
									class="select select-bordered min-h-11 w-full rounded-xl bg-white text-xs text-gray-900 sm:text-sm {errors.comitato_locale
										? 'border-red-600 ring-1 ring-red-600'
										: 'border-gray-300'}"
								>
									<option value="" disabled>Seleziona il tuo Comitato Locale</option>
									{#each COMITATI_LOCALI_OPTIONS as lc (lc.value)}
										<option value={lc.value}>{lc.label}</option>
									{/each}
								</select>
								{#if errors.comitato_locale}
									<p class="mt-1 text-xs font-semibold text-red-700">{errors.comitato_locale}</p>
								{/if}
							</div>

							<div data-field-id="neo_iscritto">
								<label for="select-neo-iscritto" class="mb-1 block text-xs font-bold text-gray-800">
									Sei neo-iscrittə?
								</label>
								<select
									id="select-neo-iscritto"
									bind:value={neoIscritto}
									onchange={() => clearFieldError('neo_iscritto')}
									class="select select-bordered min-h-11 w-full rounded-xl bg-white text-xs text-gray-900 sm:text-sm {errors.neo_iscritto
										? 'border-red-600 ring-1 ring-red-600'
										: 'border-gray-300'}"
								>
									<option value="" disabled>Seleziona</option>
									<option value="neo_iscritto">Sì</option>
									<option value="nessuno">No</option>
								</select>
								{#if errors.neo_iscritto}
									<p class="mt-1 text-xs font-semibold text-red-700">{errors.neo_iscritto}</p>
								{/if}
							</div>
						</div>

						<!-- Nota Bologna Ausiliari -->
						{#if showBolognaNotice}
							<div
								class="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-950 shadow-2xs"
							>
								📌 <strong
									>Nota per i soci di AISF Bologna (Candidatura Ordinaria vs. 5 Ausiliari CO):</strong
								>
								Compila regolarmente questo form anche se intendi candidarti al bando interno per i
								<strong>5 posti da Ausiliariə dell'LC Bologna</strong>! Le due graduatorie sono
								coordinate: se verrai selezionatə come Ausiliariə, entrerai nei 5 posti dedicati e
								la tua candidatura ordinaria verrà assorbita d'ufficio lasciando libero il posto per
								gli altri soci bolognesi (e viceversa, se non rientrassi tra i 5 Ausiliari,
								concorrerai regolarmente nella graduatoria ordinaria CISF27!).
								<strong
									>Le candidature per gli Ausiliari apriranno indicativamente tra dicembre e
									gennaio.</strong
								>
							</div>
						{/if}

						<!-- DETTAGLIO WORKING GROUP (se ruoloSpeciale === 'working_group') -->
						{#if showWgDetailField}
							<div
								class="mb-4 rounded-xl border border-primary/30 bg-red-50/30 p-4"
								data-field-id="dettaglio_wg"
							>
								<label
									for="input-dettaglio-wg"
									class="mb-1.5 block text-xs font-bold text-secondary"
								>
									Specifica il Working Group nazionale di cui fai parte:
								</label>
								<input
									type="text"
									id="input-dettaglio-wg"
									bind:value={dettaglioWg}
									oninput={() => clearFieldError('dettaglio_wg')}
									placeholder="Es. WG PR, WG Eventi, WG IT..."
									class="input input-bordered min-h-11 w-full rounded-xl bg-white text-xs text-gray-900 sm:text-sm {errors.dettaglio_wg
										? 'border-red-600 ring-1 ring-red-600'
										: 'border-gray-300'}"
								/>
								{#if errors.dettaglio_wg}
									<p class="mt-1 text-xs font-semibold text-red-700">{errors.dettaglio_wg}</p>
								{/if}
							</div>
						{/if}

						<!-- AISF NEXT LEADERS -->
						<div class="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
							<div data-field-id="next_leaders">
								<label for="select-next-leaders" class="mb-1 block text-xs font-bold text-gray-800">
									Hai scritto e pubblicato un articolo per Forbes <em>Next Leaders</em>?
								</label>
								<select
									id="select-next-leaders"
									bind:value={nextLeaders}
									onchange={() => {
										clearFieldError('next_leaders');
										clearFieldError('next_leaders_link');
									}}
									class="select select-bordered min-h-11 w-full rounded-xl bg-white text-xs text-gray-900 sm:text-sm {errors.next_leaders
										? 'border-red-600 ring-1 ring-red-600'
										: 'border-gray-300'}"
								>
									<option value="" disabled>Seleziona un'opzione</option>
									<option value="no">No</option>
									<option value="si">Sì</option>
								</select>
								{#if errors.next_leaders}
									<p class="mt-1 text-xs font-semibold text-red-700">{errors.next_leaders}</p>
								{/if}
							</div>

							{#if showNextLeadersLinkField}
								<div data-field-id="next_leaders_link">
									<label
										for="input-next-leaders-link"
										class="mb-1 block text-xs font-bold text-secondary"
									>
										Titolo e/o link all'articolo Next Leaders (per verifica):
									</label>
									<input
										type="text"
										id="input-next-leaders-link"
										bind:value={nextLeadersLink}
										oninput={() => clearFieldError('next_leaders_link')}
										placeholder="Titolo dell'articolo e/o link"
										class="input input-bordered min-h-11 w-full rounded-xl bg-white text-xs text-gray-900 sm:text-sm {errors.next_leaders_link
											? 'border-red-600 ring-1 ring-red-600'
											: 'border-gray-300'}"
									/>
									{#if errors.next_leaders_link}
										<p class="mt-1 text-xs font-semibold text-red-700">
											{errors.next_leaders_link}
										</p>
									{/if}
								</div>
							{/if}
						</div>

						<!-- Attività nel LC -->
						<div class="mb-6" data-field-id="attivita_lc">
							<label for="textarea-attivita-lc" class="mb-1 block text-xs font-bold text-gray-800">
								Attività (o non) nel tuo LC:
							</label>
							<textarea
								id="textarea-attivita-lc"
								rows="3"
								bind:value={attivitaLc}
								oninput={() => clearFieldError('attivita_lc')}
								placeholder="Racconta con la massima trasparenza e serenità la tua partecipazione nel tuo LC: sei neo-iscrittə, partecipi alle riunioni/eventi locali, sei nel CdP o hai organizzato iniziative, oppure sei semplicemente un socio curioso? Sii onestə..."
								class="textarea textarea-bordered w-full rounded-xl bg-white text-xs text-gray-900 sm:text-sm {errors.attivita_lc
									? 'border-red-600 ring-1 ring-red-600'
									: 'border-gray-300'}"></textarea>
							{#if errors.attivita_lc}
								<p class="mt-1 text-xs font-semibold text-red-700">{errors.attivita_lc}</p>
							{/if}
							<div
								class="mt-2 rounded-lg border border-amber-200 bg-amber-50/70 p-2.5 text-[11px] leading-relaxed text-amber-900"
							>
								🔍 <strong>Nota di trasparenza &amp; verifica:</strong> A tutela della correttezza della
								selezione, per le candidature vincitrici la veridicità di quanto dichiarato sull'attività
								locale potrà essere verificata direttamente dal CO con i Presidenti, i membri del CdP
								locale di riferimento o con l'EC.
							</div>
						</div>

						<!-- 4. Partecipazioni Pregresse -->
						<div class="mb-6 border-t border-gray-200 pt-5">
							<h3 class="mb-2 text-sm font-bold tracking-wider text-secondary uppercase">
								Partecipazioni ad Eventi Nazionali o Internazionali (AISF / IAPS)
							</h3>
							<p class="mb-4 text-xs text-gray-600">
								Indica in modo trasparente le tue precedenti esperienze associative:
							</p>

							<div class="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
								<div data-field-id="part_aisf">
									<label for="select-part-aisf" class="mb-1 block text-xs font-bold text-gray-800">
										Partecipazioni a CISF passate:
									</label>
									<select
										id="select-part-aisf"
										bind:value={partAisf}
										onchange={() => {
											clearFieldError('part_aisf');
											clearFieldError('elenco_partecipazioni');
										}}
										class="select select-bordered min-h-11 w-full rounded-xl bg-white text-xs text-gray-900 {errors.part_aisf
											? 'border-red-600 ring-1 ring-red-600'
											: 'border-gray-300'}"
									>
										<option value="" disabled>Seleziona un'opzione</option>
										<option value="piu_volte">Ho partecipato a 2 o più CISF</option>
										<option value="1_volta">Ho partecipato a 1 CISF</option>
										<option value="mai">Nessuna partecipazione (Prima volta!)</option>
									</select>
									{#if errors.part_aisf}
										<p class="mt-1 text-xs font-semibold text-red-700">{errors.part_aisf}</p>
									{/if}
								</div>

								<div data-field-id="part_iaps">
									<label for="select-part-iaps" class="mb-1 block text-xs font-bold text-gray-800">
										Altre partecipazioni (inter)nazionali (es. LoT, SIPE, ICPS...):
									</label>
									<select
										id="select-part-iaps"
										bind:value={partIaps}
										onchange={() => {
											clearFieldError('part_iaps');
											clearFieldError('elenco_partecipazioni');
										}}
										class="select select-bordered min-h-11 w-full rounded-xl bg-white text-xs text-gray-900 {errors.part_iaps
											? 'border-red-600 ring-1 ring-red-600'
											: 'border-gray-300'}"
									>
										<option value="" disabled>Seleziona un'opzione</option>
										<option value="piu_volte">Ho partecipato a 2 o più eventi non-CISF</option>
										<option value="1_volta">Ho partecipato a 1 evento non-CISF</option>
										<option value="mai">Nessuna partecipazione</option>
									</select>
									{#if errors.part_iaps}
										<p class="mt-1 text-xs font-semibold text-red-700">{errors.part_iaps}</p>
									{/if}
								</div>

								<div data-field-id="org_aisf">
									<label for="select-org-aisf" class="mb-1 block text-xs font-bold text-gray-800">
										Esperienze in Comitati Organizzatori (CO):
									</label>
									<select
										id="select-org-aisf"
										bind:value={orgAisf}
										onchange={() => {
											clearFieldError('org_aisf');
											clearFieldError('elenco_partecipazioni');
										}}
										class="select select-bordered min-h-11 w-full rounded-xl bg-white text-xs text-gray-900 {errors.org_aisf
											? 'border-red-600 ring-1 ring-red-600'
											: 'border-gray-300'}"
									>
										<option value="" disabled>Seleziona un'opzione</option>
										<option value="nazionale_internazionale"
											>Membro CO per eventi (inter)nazionali</option
										>
										<option value="mai">Nessuna esperienza organizzativa</option>
									</select>
									{#if errors.org_aisf}
										<p class="mt-1 text-xs font-semibold text-red-700">{errors.org_aisf}</p>
									{/if}
								</div>
							</div>

							{#if needElencoPartecipazioni}
								<div
									class="rounded-xl border border-gray-200 bg-gray-50 p-3.5"
									data-field-id="elenco_partecipazioni"
								>
									<label
										for="textarea-elenco-partecipazioni"
										class="mb-1 block text-xs font-bold text-gray-800"
									>
										Dettaglia sinteticamente conferenze ed edizioni a cui hai partecipato o
										collaborato:
									</label>
									<textarea
										id="textarea-elenco-partecipazioni"
										rows="2"
										bind:value={elencoPartecipazioni}
										oninput={() => clearFieldError('elenco_partecipazioni')}
										placeholder="Es. CISF26 Roma Tre (partecipante), ICPS 2026 Rabat (speaker talk), Staff locale PLANCKS..."
										class="textarea textarea-bordered w-full rounded-xl bg-white text-xs text-gray-900 sm:text-sm {errors.elenco_partecipazioni
											? 'border-red-600 ring-1 ring-red-600'
											: 'border-gray-300'}"></textarea>
									{#if errors.elenco_partecipazioni}
										<p class="mt-1 text-xs font-semibold text-red-700">
											{errors.elenco_partecipazioni}
										</p>
									{/if}
								</div>
							{/if}
						</div>
					{/if}
				</div>

				<!-- Avvertenza di Responsabilità -->
				<div
					class="mt-6 flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50/80 p-3.5 text-xs text-amber-950 shadow-2xs"
				>
					<span class="shrink-0 text-sm font-black text-amber-700">❗</span>
					<div>
						<strong>Avvertenza di Responsabilità &amp; Correttezza:</strong> Ricordiamo che, in base
						ai criteri di selezione ufficiali CISF27,
						<em
							>qualsiasi dichiarazione non veritiera o mendace comporterà l'immediato e irrevocabile
							rigetto della candidatura</em
						>. Se durante la compilazione o dopo l'invio ti accorgi di aver commesso un errore
						materiale involontario, contatta tempestivamente il CO all'indirizzo
						<a
							href={`mailto:${contactEmail}`}
							class="font-bold text-secondary underline hover:text-primary">{contactEmail}</a
						>
						per rettificare i dati!
					</div>
				</div>

				{#if stepErrorBanner}
					<div
						role="alert"
						class="mt-5 flex items-start gap-2.5 rounded-xl border border-red-300 bg-red-50 p-3.5 text-xs font-semibold text-red-900"
					>
						<AlertTriangle class="mt-0.5 size-4 shrink-0 text-red-700" />
						<span>{stepErrorBanner}</span>
					</div>
				{/if}

				<div class="mt-8 flex flex-wrap items-center justify-between gap-3">
					<button
						type="button"
						onclick={() => goToStep(1)}
						class="btn min-h-12 rounded-xl border border-gray-300 bg-white px-5 text-xs font-bold text-gray-700 hover:bg-gray-100"
					>
						<ArrowLeft class="size-4" />
						Indietro: Motivazione &amp; Talk
					</button>
					<button
						type="button"
						onclick={() => goToStep(3)}
						class="btn btn-primary min-h-12 rounded-xl px-6 text-sm font-bold text-white shadow-md"
					>
						Continua: Temi &amp; Fisse
						<ArrowRight class="size-4" />
					</button>
				</div>
			</div>
		{/if}

		<!-- =================================================================== -->
		<!-- SCHERMATA 4 / STEP 3: PILASTRI TEMATICI & QUIZ QUIRKY VISITE/LAB    -->
		<!-- =================================================================== -->
		{#if showWizard && currentStep === 3}
			<div class="rounded-2xl border border-primary/20 bg-base-100 shadow-lg mb-8 p-5 sm:p-10">
				<div class="mb-4 flex items-center gap-3">
					<div
						class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-sm font-bold text-amber-900"
					>
						04
					</div>
					<div>
						<h2 class="font-playfair-display text-2xl font-bold text-secondary sm:text-3xl">
							Le Traiettorie della Fisica: Quanto ti gasano? 🐂
						</h2>
						<p class="text-xs text-gray-600 sm:text-sm">
							Se sei un <MathFormula expr={'\\mathbb{T}^2'} /> sei prontə a gasarti con noi!
						</p>
					</div>
				</div>

				<!-- 4 PILASTRI UFFICIALI CISF27 -->
				<h3 class="mb-3 flex items-center gap-2 text-base font-bold text-secondary">
					<span>🏛️</span> I 4 Pilastri Ufficiali di CISF27
				</h3>

				{#each [{ key: 'storia' as PillarKey, num: 'Pilastro 1', title: 'Storia, Impatto & Responsabilità Comunitaria', desc: 'Dalle figure storiche bolognesi (Laura Bassi, Guglielmo Marconi, ecc.) al ruolo etico e sociale del fisico nella comunità.', rangeClass: 'range-primary', tagClass: 'text-primary', badgeClass: 'badge-primary badge-soft' }, { key: 'energia' as PillarKey, num: 'Pilastro 2', title: 'Energia, Clima & Sostenibilità', desc: 'Transizione energetica, fusione nucleare, rinnovabili, atmosfera e il contributo scientifico verso un futuro sostenibile.', rangeClass: 'range-warning [--range-thumb:var(--color-base-100)]', tagClass: 'text-warning', badgeClass: 'badge-warning badge-soft' }, { key: 'lavoro' as PillarKey, num: 'Pilastro 3', title: 'Lavoro, Carriera & Opportunità Future', desc: 'Tavole rotonde con aziende, figure di spicco nel mondo industriale, programmazione, data science, brevetti e spin-off.', rangeClass: 'range-success', tagClass: 'text-success', badgeClass: 'badge-success badge-soft' }, { key: 'ricerca' as PillarKey, num: 'Pilastro 4', title: 'Ricerca di Frontiera & Centri del Territorio', desc: 'Fisica fondamentale, HPC scientifico, ottica quantistica e cooperazione con i grandi poli scientifici felsinei.', rangeClass: 'range-info', tagClass: 'text-info', badgeClass: 'badge-info badge-soft' }] as pillar (pillar.key)}
					<div class="mb-5 rounded-xl border border-gray-200 bg-white p-4 shadow-2xs">
						<div class="mb-3 flex flex-wrap items-start justify-between gap-2">
							<div class="min-w-0 flex-1">
								<span class="text-xs font-bold tracking-wider uppercase {pillar.tagClass}">
									{pillar.num}
								</span>
								<h4 class="text-base font-bold text-secondary">{pillar.title}</h4>
								<p class="text-xs text-gray-600">{pillar.desc}</p>
							</div>
							<span
								class="badge shrink-0 rounded-full px-2.5 py-1 text-xs font-bold {pillar.badgeClass}"
							>
								{GASO_LABELS[pillars[pillar.key]]}
							</span>
						</div>

						<!-- Millimetric slider-to-label alignment: 5 steps => px-[10%] + grid-cols-5 -->
						<div class="w-full">
							<div class="px-[10%]">
								<input
									type="range"
									aria-label={pillar.title}
									min="0"
									max="4"
									step="1"
									bind:value={pillars[pillar.key]}
									oninput={onQuizInteraction}
									class="range range-sm w-full {pillar.rangeClass}"
								/>
							</div>
							<div
								class="mt-1 grid grid-cols-5 text-center text-[10px] leading-tight font-bold text-gray-500"
							>
								{#each GASO_SHORT_LABELS as lbl, i (i)}
									<span class={pillars[pillar.key] === i ? 'text-gray-900' : ''}>{lbl}</span>
								{/each}
							</div>
						</div>
					</div>
				{/each}

				<!-- MINI-QUIZ QUIRKY (12 SFIDE) -->
				<div class="mt-8 border-t-2 border-dashed border-gray-200 pt-6">
					<div class="mb-2 flex flex-wrap items-center justify-between gap-2">
						<h3
							class="font-playfair-display flex items-center gap-2 text-lg font-bold text-secondary"
						>
							<span>🔮</span> Il Mini-Quiz Quirky: Che fisica scorre nelle tue vene?
						</h3>
						<span
							class="rounded-full border border-red-200 bg-red-100 px-3 py-1 text-[11px] font-bold text-primary"
						>
							Secret Matcher
						</span>
					</div>
					<p class="mb-6 text-xs leading-relaxed text-gray-600">
						<strong
							>Rispondi d'istinto come ragioni sotto pressione nelle 12 sfide qui sotto (6 scenari
							di vita + 6 lampi creativi)!</strong
						>
						Il nostro algoritmo quirky analizzerà la tua naturale postura intellettuale (e il tuo livello
						di gaso 🐂) per ordinare le <strong>14 macro-aree tematiche</strong> delle visite scientifiche
						senza alcuno spoiler sulle sedi. Potrai poi confermare la classifica o riordinarla liberamente!
					</p>

					<!-- Q1 -->
					<div
						data-field-id="quiz_q1"
						class="mb-5 rounded-xl border bg-white p-4 shadow-2xs {errors.quiz_q1
							? 'border-red-600 ring-1 ring-red-600'
							: 'border-gray-200'}"
					>
						<div class="mb-2 flex items-center justify-between gap-2">
							<span
								class="rounded bg-red-100 px-2 py-0.5 text-[10px] font-extrabold tracking-wider text-primary uppercase"
								>Scenario 01 • Notte Fonda</span
							>
							<span class="text-[10px] font-semibold text-gray-400">Reazione istintiva</span>
						</div>
						<div class="mb-2.5 text-xs font-bold text-secondary sm:text-sm">
							1. Qual è la tua reazione naturale davanti a un apparecchio che emette strani sibili e
							scintille intermittenti alle due di notte?
						</div>
						<div class="space-y-2 text-xs">
							<label
								class="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition hover:bg-gray-50 {quizRadios.q1 ===
								'astro,app'
									? 'border-primary bg-red-50/25'
									: 'border-transparent hover:border-gray-200'}"
							>
								<input
									type="radio"
									name="quiz_q1"
									value="astro,app"
									bind:group={quizRadios.q1}
									onchange={() => {
										clearFieldError('quiz_q1');
										onQuizInteraction();
									}}
									class="radio radio-primary radio-sm mt-0.5 border-gray-400 bg-white checked:border-primary"
								/>
								<span
									><strong>A)</strong> Accendo un oscilloscopio e sintonizzo un'antenna a dipolo artigianale:
									voglio analizzare lo spettro in frequenza del segnale radio emesso.</span
								>
							</label>
							<label
								class="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition hover:bg-gray-50 {quizRadios.q1 ===
								'hpc,comp'
									? 'border-primary bg-red-50/25'
									: 'border-transparent hover:border-gray-200'}"
							>
								<input
									type="radio"
									name="quiz_q1"
									value="hpc,comp"
									bind:group={quizRadios.q1}
									onchange={() => {
										clearFieldError('quiz_q1');
										onQuizInteraction();
									}}
									class="radio radio-primary radio-sm mt-0.5 border-gray-400 bg-white checked:border-primary"
								/>
								<span
									><strong>B)</strong> Apro il terminale e lancio una simulazione Monte Carlo o una rete
									neurale per predire la distribuzione di probabilità del tempo al guasto catastrofico.</span
								>
							</label>
							<label
								class="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition hover:bg-gray-50 {quizRadios.q1 ===
								'part,teo'
									? 'border-primary bg-red-50/25'
									: 'border-transparent hover:border-gray-200'}"
							>
								<input
									type="radio"
									name="quiz_q1"
									value="part,teo"
									bind:group={quizRadios.q1}
									onchange={() => {
										clearFieldError('quiz_q1');
										onQuizInteraction();
									}}
									class="radio radio-primary radio-sm mt-0.5 border-gray-400 bg-white checked:border-primary"
								/>
								<span
									><strong>C)</strong> Verifico con uno scintillatore plastico se l'intenso
									gradiente di campo elettrico locale sta innescando cascate ionizzanti o produzione
									di coppie
									<MathFormula expr="e^+e^-" />.</span
								>
							</label>
							<label
								class="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition hover:bg-gray-50 {quizRadios.q1 ===
								'env,geo_atm'
									? 'border-primary bg-red-50/25'
									: 'border-transparent hover:border-gray-200'}"
							>
								<input
									type="radio"
									name="quiz_q1"
									value="env,geo_atm"
									bind:group={quizRadios.q1}
									onchange={() => {
										clearFieldError('quiz_q1');
										onQuizInteraction();
									}}
									class="radio radio-primary radio-sm mt-0.5 border-gray-400 bg-white checked:border-primary"
								/>
								<span
									><strong>D)</strong> Monitoro la dispersione degli aerosol, il particolato e la concentrazione
									di ozono troposferico nella stanza: la chimica-fisica dell'aria viene prima di tutto.</span
								>
							</label>
							<label
								class="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition hover:bg-gray-50 {quizRadios.q1 ===
								'mat,cond'
									? 'border-primary bg-red-50/25'
									: 'border-transparent hover:border-gray-200'}"
							>
								<input
									type="radio"
									name="quiz_q1"
									value="mat,cond"
									bind:group={quizRadios.q1}
									onchange={() => {
										clearFieldError('quiz_q1');
										onQuizInteraction();
									}}
									class="radio radio-primary radio-sm mt-0.5 border-gray-400 bg-white checked:border-primary"
								/>
								<span
									><strong>E)</strong> Isolo il componente fuso per esaminare al microscopio i difetti
									reticolari, le giunzioni semiconduttrici e il breakdown dielettrico dei nanostrati.</span
								>
							</label>
							<label
								class="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition hover:bg-gray-50 {quizRadios.q1 ===
								'did,geo_oce'
									? 'border-primary bg-red-50/25'
									: 'border-transparent hover:border-gray-200'}"
							>
								<input
									type="radio"
									name="quiz_q1"
									value="did,geo_oce"
									bind:group={quizRadios.q1}
									onchange={() => {
										clearFieldError('quiz_q1');
										onQuizInteraction();
									}}
									class="radio radio-primary radio-sm mt-0.5 border-gray-400 bg-white checked:border-primary"
								/>
								<span
									><strong>F)</strong> Improvviso una dimostrazione-spettacolo per i coinquilini: accosto
									una bacinella d'acqua salata alla scarica per mostrare dal vivo onde superficiali, correnti
									elettrolitiche marine e gli esperimenti storici del '700!</span
								>
							</label>
							<label
								class="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition hover:bg-gray-50 {quizRadios.q1 ===
								'bio,geo_sol'
									? 'border-primary bg-red-50/25'
									: 'border-transparent hover:border-gray-200'}"
							>
								<input
									type="radio"
									name="quiz_q1"
									value="bio,geo_sol"
									bind:group={quizRadios.q1}
									onchange={() => {
										clearFieldError('quiz_q1');
										onQuizInteraction();
									}}
									class="radio radio-primary radio-sm mt-0.5 border-gray-400 bg-white checked:border-primary"
								/>
								<span
									><strong>G)</strong> Misuro l'accoppiamento vibrazionale con il pavimento e la risposta
									fisiologica ed elettrofisiologica del mio sistema nervoso sottoposto allo stress acustico.</span
								>
							</label>
						</div>
						{#if errors.quiz_q1}
							<p class="mt-2 text-xs font-semibold text-red-700">{errors.quiz_q1}</p>
						{/if}
					</div>

					<!-- Q2 -->
					<div
						data-field-id="quiz_q2"
						class="mb-5 rounded-xl border bg-linear-to-r from-amber-50/60 via-white to-red-50/40 p-4 shadow-2xs {errors.quiz_q2
							? 'border-red-600 ring-1 ring-red-600'
							: 'border-amber-200'}"
					>
						<div class="mb-2 flex items-center justify-between gap-2">
							<span
								class="rounded bg-amber-200 px-2 py-0.5 text-[10px] font-extrabold tracking-wider text-amber-950 uppercase"
								>⚡ Blitz 02 • Associazione Lampo</span
							>
							<span class="text-[10px] font-bold text-amber-800">+1000 Aura Check</span>
						</div>
						<div class="mb-2.5 text-xs font-bold text-secondary sm:text-sm">
							2. Non pensarci più di 2 secondi: quale di questi concetti ti dà immediatamente +1000
							punti aura appena lo senti nominare nei corridoi?
						</div>
						<div class="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
							{#each [{ val: 'teo,part', label: '✨ Rottura spontanea di simmetria' }, { val: 'hpc,cond', label: '🧠 Supremazia quantistica & Qubit' }, { val: 'astro,teo', label: '🕳️ Orizzonte degli eventi & Quasar' }, { val: 'cond,mat', label: '💎 Superconduttori & Grafene twistato' }, { val: 'geo_atm,geo_oce,env', label: '🌊 Cicloni extratropicali & Correnti abissali' }, { val: 'bio,app', label: '🧬 Adroterapia & Reti neurali biologiche' }, { val: 'geo_sol,comp', label: '🌋 Faglie sismiche & Attrattori strani' }, { val: 'did,comp', label: '📜 Paradossi epistemologici & Storia' }] as opt (opt.val)}
								<label
									class="flex min-h-13 cursor-pointer items-center justify-center rounded-xl border p-2.5 text-center font-bold transition hover:border-primary {quizRadios.q2 ===
									opt.val
										? 'border-primary bg-red-50 text-secondary ring-1 ring-primary'
										: 'border-gray-200 bg-white text-gray-800'}"
								>
									<input
										type="radio"
										name="quiz_q2"
										value={opt.val}
										bind:group={quizRadios.q2}
										onchange={() => {
											clearFieldError('quiz_q2');
											onQuizInteraction();
										}}
										class="sr-only"
									/>
									<span>{opt.label}</span>
								</label>
							{/each}
						</div>
						{#if errors.quiz_q2}
							<p class="mt-2 text-xs font-semibold text-red-700">{errors.quiz_q2}</p>
						{/if}
					</div>

					<!-- Q3 -->
					<div
						data-field-id="quiz_q3"
						class="mb-5 rounded-xl border bg-white p-4 shadow-2xs {errors.quiz_q3
							? 'border-red-600 ring-1 ring-red-600'
							: 'border-gray-200'}"
					>
						<div class="mb-2 flex items-center justify-between gap-2">
							<span
								class="rounded bg-red-100 px-2 py-0.5 text-[10px] font-extrabold tracking-wider text-primary uppercase"
								>Scenario 03 • Sotto i Portici</span
							>
							<span class="text-[10px] font-semibold text-gray-400"
								>Setup sperimentale d'emergenza</span
							>
						</div>
						<div class="mb-2.5 text-xs font-bold text-secondary sm:text-sm">
							3. Un varco spazio-temporale grande quanto una tigella si apre sotto i Portici di
							Bologna per 10 minuti. Che esperimento piazzi al volo?
						</div>
						<div class="space-y-2 text-xs">
							<label
								class="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition hover:bg-gray-50 {quizRadios.q3 ===
								'part,app'
									? 'border-primary bg-red-50/25'
									: 'border-transparent hover:border-gray-200'}"
							>
								<input
									type="radio"
									name="quiz_q3"
									value="part,app"
									bind:group={quizRadios.q3}
									onchange={() => {
										clearFieldError('quiz_q3');
										onQuizInteraction();
									}}
									class="radio radio-primary radio-sm mt-0.5 border-gray-400 bg-white checked:border-primary"
								/>
								<span
									><strong>A)</strong> Piazzo un calorimetro compatto e tracciatori al silicio per scovare
									i decadimenti di neutrini sterili o bosoni esotici scaturiti dal bordo del cunicolo.</span
								>
							</label>
							<label
								class="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition hover:bg-gray-50 {quizRadios.q3 ===
								'hpc,teo'
									? 'border-primary bg-red-50/25'
									: 'border-transparent hover:border-gray-200'}"
							>
								<input
									type="radio"
									name="quiz_q3"
									value="hpc,teo"
									bind:group={quizRadios.q3}
									onchange={() => {
										clearFieldError('quiz_q3');
										onQuizInteraction();
									}}
									class="radio radio-primary radio-sm mt-0.5 border-gray-400 bg-white checked:border-primary"
								/>
								<span
									><strong>B)</strong> Acquisisco terabyte di telemetria quantistica per ricostruire
									su supercomputer se la sezione spaziale della gola del varco è omeomorfa a un toro
									<MathFormula expr={'\\mathbb{T}^2'} />.</span
								>
							</label>
							<label
								class="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition hover:bg-gray-50 {quizRadios.q3 ===
								'astro,geo_sol'
									? 'border-primary bg-red-50/25'
									: 'border-transparent hover:border-gray-200'}"
							>
								<input
									type="radio"
									name="quiz_q3"
									value="astro,geo_sol"
									bind:group={quizRadios.q3}
									onchange={() => {
										clearFieldError('quiz_q3');
										onQuizInteraction();
									}}
									class="radio radio-primary radio-sm mt-0.5 border-gray-400 bg-white checked:border-primary"
								/>
								<span
									><strong>C)</strong> Punto uno spettrografo e un sismometro-gravimetro laser nel varco:
									voglio misurare il redshift dei fotoni cosmici e sondare la struttura interna e tettonica
									di esopianeti rocciosi all'altro capo del cosmo!</span
								>
							</label>
							<label
								class="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition hover:bg-gray-50 {quizRadios.q3 ===
								'geo_atm,geo_oce'
									? 'border-primary bg-red-50/25'
									: 'border-transparent hover:border-gray-200'}"
							>
								<input
									type="radio"
									name="quiz_q3"
									value="geo_atm,geo_oce"
									bind:group={quizRadios.q3}
									onchange={() => {
										clearFieldError('quiz_q3');
										onQuizInteraction();
									}}
									class="radio radio-primary radio-sm mt-0.5 border-gray-400 bg-white checked:border-primary"
								/>
								<span
									><strong>D)</strong> Installo microbarometri, anemometri sonici e sensori di marea per
									registrare le onde di gravità atmosferiche e le perturbazioni idrodinamiche su oceani,
									correnti e falde acquifere.</span
								>
							</label>
							<label
								class="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition hover:bg-gray-50 {quizRadios.q3 ===
								'did,comp'
									? 'border-primary bg-red-50/25'
									: 'border-transparent hover:border-gray-200'}"
							>
								<input
									type="radio"
									name="quiz_q3"
									value="did,comp"
									bind:group={quizRadios.q3}
									onchange={() => {
										clearFieldError('quiz_q3');
										onQuizInteraction();
									}}
									class="radio radio-primary radio-sm mt-0.5 border-gray-400 bg-white checked:border-primary"
								/>
								<span
									><strong>E)</strong> Chiamo a raccolta gli umarell e gli studenti di passaggio: improvviso
									un esperimento pubblico partecipato con pendoli, puntatori laser e cronometri, studiando
									la sincronizzazione collettiva della folla!</span
								>
							</label>
							<label
								class="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition hover:bg-gray-50 {quizRadios.q3 ===
								'mat,cond'
									? 'border-primary bg-red-50/25'
									: 'border-transparent hover:border-gray-200'}"
							>
								<input
									type="radio"
									name="quiz_q3"
									value="mat,cond"
									bind:group={quizRadios.q3}
									onchange={() => {
										clearFieldError('quiz_q3');
										onQuizInteraction();
									}}
									class="radio radio-primary radio-sm mt-0.5 border-gray-400 bg-white checked:border-primary"
								/>
								<span
									><strong>F)</strong> Raccolgo la condensa esotica depositata sul selciato dei portici
									per caratterizzare metamateriali nanostrutturati a indice di rifrazione negativo.</span
								>
							</label>
							<label
								class="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition hover:bg-gray-50 {quizRadios.q3 ===
								'bio,env'
									? 'border-primary bg-red-50/25'
									: 'border-transparent hover:border-gray-200'}"
							>
								<input
									type="radio"
									name="quiz_q3"
									value="bio,env"
									bind:group={quizRadios.q3}
									onchange={() => {
										clearFieldError('quiz_q3');
										onQuizInteraction();
									}}
									class="radio radio-primary radio-sm mt-0.5 border-gray-400 bg-white checked:border-primary"
								/>
								<span
									><strong>G)</strong> Esamino la radioprotezione dell'area e l'effetto della curvatura
									metrica sul folding proteico e sulle membrane cellulari di campioni biologici.</span
								>
							</label>
						</div>
						{#if errors.quiz_q3}
							<p class="mt-2 text-xs font-semibold text-red-700">{errors.quiz_q3}</p>
						{/if}
					</div>

					<!-- Q4 (Slider Cosmico — 6 steps => px-[8.333%] + grid-cols-6) -->
					<div
						data-field-id="quiz_q4"
						class="mb-5 rounded-xl border bg-linear-to-r from-amber-50/60 via-white to-red-50/40 p-4 shadow-2xs {errors.quiz_q4
							? 'border-red-600 ring-1 ring-red-600'
							: 'border-amber-200'}"
					>
						<div class="mb-2 flex flex-wrap items-center justify-between gap-2">
							<span
								class="rounded bg-amber-200 px-2 py-0.5 text-[10px] font-extrabold tracking-wider text-amber-950 uppercase"
								>🎚️ Blitz 04 • Slider Cosmico</span
							>
							<span
								class="bg-primary text-primary-content rounded-full px-2.5 py-0.5 text-[11px] font-bold"
							>
								{SCALE_SLIDER_CONFIG[quizScaleVal]?.label}
							</span>
						</div>
						<div class="mb-2 text-xs font-bold text-secondary sm:text-sm">
							4. Trascina lo zoom sull'ordine di grandezza spaziale che ti fa battere più forte il
							cuore quando studi un sistema fisico:
						</div>
						<div class="w-full">
							<div class="px-[8.333%]">
								<input
									type="range"
									aria-label="Slider Cosmico delle Scale Spaziali"
									min="0"
									max="5"
									step="1"
									bind:value={quizScaleVal}
									onpointerdown={() => {
										quizScaleTouched = true;
										clearFieldError('quiz_q4');
										onQuizInteraction();
									}}
									oninput={() => {
										quizScaleTouched = true;
										clearFieldError('quiz_q4');
										onQuizInteraction();
									}}
									onchange={() => {
										quizScaleTouched = true;
										clearFieldError('quiz_q4');
										onQuizInteraction();
									}}
									class="range range-primary range-sm my-2 w-full [--range-fill:0]"
								/>
							</div>
							<div class="mt-1 grid grid-cols-6 text-center text-[10px] font-bold text-gray-600">
								<div class="px-0.5">
									<MathFormula expr={'10^{-18}\\text{ m}'} />
									<span class="block text-[9px] font-normal">Quark &amp; Nucleo</span>
								</div>
								<div class="px-0.5">
									<MathFormula expr={'10^{-9}\\text{ m}'} />
									<span class="block text-[9px] font-normal">Atomi &amp; Nano</span>
								</div>
								<div class="px-0.5">
									<MathFormula expr={'10^{-6}\\text{ m}'} />
									<span class="block text-[9px] font-normal">Cellule &amp; Bio</span>
								</div>
								<div class="px-0.5">
									<MathFormula expr={'10^{0}\\text{ m}'} />
									<span class="block text-[9px] font-normal">Banco Ottico &amp; Lab</span>
								</div>
								<div class="px-0.5">
									<MathFormula expr={'10^{7}\\text{ m}'} />
									<span class="block text-[9px] font-normal">Pianeta, Mare &amp; Clima</span>
								</div>
								<div class="px-0.5">
									<MathFormula expr={'10^{26}\\text{ m}'} />
									<span class="block text-[9px] font-normal">Cosmo &amp; Galassie</span>
								</div>
							</div>
						</div>
						{#if !quizScaleTouched}
							<p class="mt-2 text-[11px] font-medium text-amber-800">
								👆 Tocca o trascina lo slider per confermare la tua scelta (anche se resti sulla
								posizione attuale).
							</p>
						{/if}
						{#if errors.quiz_q4}
							<p class="mt-1 text-xs font-semibold text-red-700">{errors.quiz_q4}</p>
						{/if}
					</div>

					<!-- Q5 -->
					<div
						data-field-id="quiz_q5"
						class="mb-5 rounded-xl border bg-white p-4 shadow-2xs {errors.quiz_q5
							? 'border-red-600 ring-1 ring-red-600'
							: 'border-gray-200'}"
					>
						<div class="mb-2 flex items-center justify-between gap-2">
							<span
								class="rounded bg-red-100 px-2 py-0.5 text-[10px] font-extrabold tracking-wider text-primary uppercase"
								>Scenario 05 • Dinamica da Buffet</span
							>
							<span class="text-[10px] font-semibold text-gray-400">170 fisici vs Crescentine</span>
						</div>
						<div class="mb-2.5 text-xs font-bold text-secondary sm:text-sm">
							5. Al buffet della conferenza con 170 fisici affamati davanti a vassoi di lasagne e
							crescentine calde, qual è la tua postura intellettuale?
						</div>
						<div class="space-y-2 text-xs">
							{#each [{ val: 'hpc,cond', letter: 'A)', text: 'Simulo al volo la calca al buffet come un gas di fermioni fortemente correlati su reticolo (modello di Hubbard), calcolando via codice il cammino minimo verso la teglia!' }, { val: 'astro,geo_atm', letter: 'B)', text: "Mi posiziono nel fuoco acustico della sala e sfrutto i moti convettivi del vapore delle lasagne per triangolare l'arrivo delle teglie appena sfornate." }, { val: 'part,teo', letter: 'C)', text: "Approccio quantistico-relativistico: ogni crescentina è in sovrapposizione coerente di stati finché l'operatore forchetta non fa collassare la funzione d'onda nel mio piatto." }, { val: 'env,geo_oce', letter: 'D)', text: "Analizzo il bilancio energetico, l'impronta idrica e carbonica della filiera e il suo impatto sul ciclo idrologico e marino, verificando la sostenibilità termodinamica del catering." }, { val: 'did,app', letter: 'E)', text: 'Un esperimento di reologia applicata: dimostro il comportamento dei fluidi non-newtoniani spalmando lo squacquerone tra gli applausi dei tavoli vicini!' }, { val: 'mat,geo_sol', letter: 'F)', text: 'Studio la transizione vetrosa, la porosità alveolare e il modulo di taglio elastico della crosta croccante in funzione del gradiente di raffreddamento.' }, { val: 'bio,comp', letter: 'G)', text: 'Osservo la cinetica metabolica della folla e la transizione di fase di swarming collettivo (effetto stormo) attorno alla sorgente calorica primaria.' }] as opt (opt.val)}
								<label
									class="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition hover:bg-gray-50 {quizRadios.q5 ===
									opt.val
										? 'border-primary bg-red-50/25'
										: 'border-transparent hover:border-gray-200'}"
								>
									<input
										type="radio"
										name="quiz_q5"
										value={opt.val}
										bind:group={quizRadios.q5}
										onchange={() => {
											clearFieldError('quiz_q5');
											onQuizInteraction();
										}}
										class="radio radio-primary radio-sm mt-0.5 border-gray-400 bg-white checked:border-primary"
									/>
									<span><strong>{opt.letter}</strong> {opt.text}</span>
								</label>
							{/each}
						</div>
						{#if errors.quiz_q5}
							<p class="mt-2 text-xs font-semibold text-red-700">{errors.quiz_q5}</p>
						{/if}
					</div>

					<!-- Q6 -->
					<div
						data-field-id="quiz_q6"
						class="mb-5 rounded-xl border bg-linear-to-r from-amber-50/60 via-white to-red-50/40 p-4 shadow-2xs {errors.quiz_q6
							? 'border-red-600 ring-1 ring-red-600'
							: 'border-amber-200'}"
					>
						<div class="mb-2 flex items-center justify-between gap-2">
							<span
								class="rounded bg-amber-200 px-2 py-0.5 text-[10px] font-extrabold tracking-wider text-amber-950 uppercase"
								>🗿 Blitz 06 • Oggetto Totem</span
							>
							<span class="text-[10px] font-bold text-amber-800">Scegli la tua reliquia</span>
						</div>
						<div class="mb-2.5 text-xs font-bold text-secondary sm:text-sm">
							6. Devi affrontare un'intera settimana chiusə in dipartimento: puoi portare con te un
							solo "Totem sacro". Quale scegli?
						</div>
						<div class="grid grid-cols-1 gap-2.5 text-xs sm:grid-cols-3">
							{#each [{ val: 'app,part,cond', title: '🔧 Nastro Kapton, Saldatore & BNC', desc: 'Se non ha cavi coassiali, vuoto ultra-spinto e rumore elettronico da schermare non mi diverto.' }, { val: 'hpc,comp,astro', title: '💻 Terminale SSH & GPU Cluster', desc: 'Script Python/C++, nodi di calcolo parallelo che macinano nella notte e grafici da plottare.' }, { val: 'teo,did', title: '🖍️ Gessi Hagoromo & Lavagna', desc: 'Tensori, integrali sui cammini, caffè amaro e accesi dibattiti sui fondamenti concettuali.' }, { val: 'geo_sol,geo_atm,geo_oce,env', title: '🌍 Sensori Lidar, Boe & Sismografi', desc: 'Il mio laboratorio è il pianeta intero: crosta terrestre, correnti marine e dinamica atmosferica.' }, { val: 'mat,cond,bio', title: '🔬 Pinzette Ottiche & Camera Pulita', desc: 'Manipolare singoli fotoni, nanostrutture, film sottili e sistemi biofisici su scala micrometrica.' }, { val: 'astro,part,did', title: '🔭 Cupola, Parabola & Cielo Stellato', desc: "Scrutare l'universo profondo, i raggi cosmici e raccontare le meraviglie del cosmo a chiunque." }] as opt (opt.val)}
								<label
									class="flex min-h-15 cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition hover:border-primary {quizRadios.q6 ===
									opt.val
										? 'border-primary bg-red-50/30 ring-1 ring-primary'
										: 'border-gray-200 bg-white'}"
								>
									<input
										type="radio"
										name="quiz_q6"
										value={opt.val}
										bind:group={quizRadios.q6}
										onchange={() => {
											clearFieldError('quiz_q6');
											onQuizInteraction();
										}}
										class="radio radio-primary radio-sm mt-0.5 border-gray-400 bg-white checked:border-primary"
									/>
									<div>
										<div class="font-bold text-secondary">{opt.title}</div>
										<div class="text-[11px] text-gray-600">{opt.desc}</div>
									</div>
								</label>
							{/each}
						</div>
						{#if errors.quiz_q6}
							<p class="mt-2 text-xs font-semibold text-red-700">{errors.quiz_q6}</p>
						{/if}
					</div>

					<!-- Q7 -->
					<div
						data-field-id="quiz_q7"
						class="mb-5 rounded-xl border bg-white p-4 shadow-2xs {errors.quiz_q7
							? 'border-red-600 ring-1 ring-red-600'
							: 'border-gray-200'}"
					>
						<div class="mb-2 flex items-center justify-between gap-2">
							<span
								class="rounded bg-red-100 px-2 py-0.5 text-[10px] font-extrabold tracking-wider text-primary uppercase"
								>Scenario 07 • Vita da Fuorisede</span
							>
							<span class="text-[10px] font-semibold text-gray-400"
								>Pioggia &amp; Autobus fantasma</span
							>
						</div>
						<div class="mb-2.5 text-xs font-bold text-secondary sm:text-sm">
							7. Lunedì mattina di diluvio universale a Bologna, lezione tra 15 minuti e l'autobus
							sul tabellone elettronico evapora nel nulla. Che fai?
						</div>
						<div class="space-y-2 text-xs">
							<label
								class="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition hover:bg-gray-50 {quizRadios.q7 ===
								'astro,teo'
									? 'border-primary bg-red-50/25'
									: 'border-transparent hover:border-gray-200'}"
							>
								<input
									type="radio"
									name="quiz_q7"
									value="astro,teo"
									bind:group={quizRadios.q7}
									onchange={() => {
										clearFieldError('quiz_q7');
										onQuizInteraction();
									}}
									class="radio radio-primary radio-sm mt-0.5 border-gray-400 bg-white checked:border-primary"
								/>
								<span
									><strong>A)</strong> Guardo le nubi con filosofia cosmologica: se i fotoni della CMB
									hanno viaggiato per 13.8 miliardi di anni, il docente può aspettarmi 10 minuti nel mio
									cono luce.</span
								>
							</label>
							<label
								class="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition hover:bg-gray-50 {quizRadios.q7 ===
								'hpc,comp'
									? 'border-primary bg-red-50/25'
									: 'border-transparent hover:border-gray-200'}"
							>
								<input
									type="radio"
									name="quiz_q7"
									value="hpc,comp"
									bind:group={quizRadios.q7}
									onchange={() => {
										clearFieldError('quiz_q7');
										onQuizInteraction();
									}}
									class="radio radio-primary radio-sm mt-0.5 border-gray-400 bg-white checked:border-primary"
								/>
								<span
									><strong>B)</strong> Interrogo i dati open-data del traffico cittadino e ricalcolo al
									volo il cammino minimo stocastico sotto i portici per ottimizzare i tempi di percorrenza.</span
								>
							</label>
							<label
								class="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition hover:bg-gray-50 {quizRadios.q7 ===
								'part,app'
									? 'border-primary bg-red-50/25'
									: 'border-transparent hover:border-gray-200'}"
							>
								<input
									type="radio"
									name="quiz_q7"
									value="part,app"
									bind:group={quizRadios.q7}
									onchange={() => {
										clearFieldError('quiz_q7');
										onQuizInteraction();
									}}
									class="radio radio-primary radio-sm mt-0.5 border-gray-400 bg-white checked:border-primary"
								/>
								<span
									><strong>C)</strong> Scatto a piedi in regime ultra-relativistico facendo slalom tra
									i passanti: puro studio sperimentale di sezione d'urto e parametro d'impatto!</span
								>
							</label>
							<label
								class="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition hover:bg-gray-50 {quizRadios.q7 ===
								'geo_atm,env'
									? 'border-primary bg-red-50/25'
									: 'border-transparent hover:border-gray-200'}"
							>
								<input
									type="radio"
									name="quiz_q7"
									value="geo_atm,env"
									bind:group={quizRadios.q7}
									onchange={() => {
										clearFieldError('quiz_q7');
										onQuizInteraction();
									}}
									class="radio radio-primary radio-sm mt-0.5 border-gray-400 bg-white checked:border-primary"
								/>
								<span
									><strong>D)</strong> Osservo rapitə il fronte perturbato, il ruscellamento
									idrologico superficiale e lo scavenging atmosferico che abbatte il particolato
									<MathFormula expr={'PM_{10}'} />.</span
								>
							</label>
							<label
								class="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition hover:bg-gray-50 {quizRadios.q7 ===
								'mat,cond'
									? 'border-primary bg-red-50/25'
									: 'border-transparent hover:border-gray-200'}"
							>
								<input
									type="radio"
									name="quiz_q7"
									value="mat,cond"
									bind:group={quizRadios.q7}
									onchange={() => {
										clearFieldError('quiz_q7');
										onQuizInteraction();
									}}
									class="radio radio-primary radio-sm mt-0.5 border-gray-400 bg-white checked:border-primary"
								/>
								<span
									><strong>E)</strong> Testo l'angolo di contatto e la superidrofobicità del tessuto tecnico
									della mia giacca a vento contro l'energia superficiale delle gocce sulle pietre.</span
								>
							</label>
							<label
								class="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition hover:bg-gray-50 {quizRadios.q7 ===
								'bio,geo_sol'
									? 'border-primary bg-red-50/25'
									: 'border-transparent hover:border-gray-200'}"
							>
								<input
									type="radio"
									name="quiz_q7"
									value="bio,geo_sol"
									bind:group={quizRadios.q7}
									onchange={() => {
										clearFieldError('quiz_q7');
										onQuizInteraction();
									}}
									class="radio radio-primary radio-sm mt-0.5 border-gray-400 bg-white checked:border-primary"
								/>
								<span
									><strong>F)</strong> Monitoro la termoregolazione corporea e il battito cardiaco durante
									la corsa, stando attentə all'attrito radente sulle lastre di pietra bagnate e alle micro-vibrazioni
									sismiche del selciato sotto i portici.</span
								>
							</label>
							<label
								class="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition hover:bg-gray-50 {quizRadios.q7 ===
								'did,geo_oce'
									? 'border-primary bg-red-50/25'
									: 'border-transparent hover:border-gray-200'}"
							>
								<input
									type="radio"
									name="quiz_q7"
									value="did,geo_oce"
									bind:group={quizRadios.q7}
									onchange={() => {
										clearFieldError('quiz_q7');
										onQuizInteraction();
									}}
									class="radio radio-primary radio-sm mt-0.5 border-gray-400 bg-white checked:border-primary"
								/>
								<span
									><strong>G)</strong> Mi fermo in un bar storico sotto il portico con un cappuccino:
									rifletto su come gli scienziati del passato studiassero l'ottica dell'arcobaleno, le
									maree oceaniche e i vortici fluidodinamici nella tazzina.</span
								>
							</label>
						</div>
						{#if errors.quiz_q7}
							<p class="mt-2 text-xs font-semibold text-red-700">{errors.quiz_q7}</p>
						{/if}
					</div>

					<!-- Q8 (EQUAZIONE DEL CUORE — FIX CRITICO CARD 6 IN DUE RIGHE SEPARATE!) -->
					<div
						data-field-id="quiz_q8"
						class="mb-5 rounded-xl border bg-linear-to-r from-amber-50/60 via-white to-red-50/40 p-4 shadow-2xs {errors.quiz_q8
							? 'border-red-600 ring-1 ring-red-600'
							: 'border-amber-200'}"
					>
						<div class="mb-2 flex items-center justify-between gap-2">
							<span
								class="rounded bg-amber-200 px-2 py-0.5 text-[10px] font-extrabold tracking-wider text-amber-950 uppercase"
								>🐉 Blitz 08 • Equazione del Cuore</span
							>
							<span class="text-[10px] font-bold text-amber-800">Estetica Matematica</span>
						</div>
						<div class="mb-2.5 text-xs font-bold text-secondary sm:text-sm">
							8. Quale di queste espressioni ti provoca un brivido estetico immediato (e magari ti
							tatueresti)?
						</div>
						<div class="grid grid-cols-1 gap-2.5 text-xs sm:grid-cols-2 lg:grid-cols-3">
							<!-- Card 1 -->
							<label
								class="flex min-h-21 cursor-pointer flex-col items-center justify-center rounded-xl border p-3 text-center transition hover:border-primary {quizRadios.q8 ===
								'part,teo'
									? 'border-primary bg-red-50/35 ring-1 ring-primary'
									: 'border-gray-200 bg-white'}"
							>
								<input
									type="radio"
									name="quiz_q8"
									value="part,teo"
									bind:group={quizRadios.q8}
									onchange={() => {
										clearFieldError('quiz_q8');
										onQuizInteraction();
									}}
									class="sr-only"
								/>
								<div
									class="mb-1.5 max-w-full overflow-x-auto text-xs font-bold text-secondary sm:text-sm"
								>
									<MathFormula
										expr={'\\mathcal{L} = \\bar{\\psi}(i\\gamma^\\mu D_\\mu - m)\\psi - \\frac{1}{4}F_{\\mu\\nu}F^{\\mu\\nu}'}
									/>
								</div>
								<div class="text-[10px] text-gray-600">
									Simmetrie di Gauge &amp; Interazioni Fondamentali
								</div>
							</label>

							<!-- Card 2 -->
							<label
								class="flex min-h-21 cursor-pointer flex-col items-center justify-center rounded-xl border p-3 text-center transition hover:border-primary {quizRadios.q8 ===
								'astro,teo'
									? 'border-primary bg-red-50/35 ring-1 ring-primary'
									: 'border-gray-200 bg-white'}"
							>
								<input
									type="radio"
									name="quiz_q8"
									value="astro,teo"
									bind:group={quizRadios.q8}
									onchange={() => {
										clearFieldError('quiz_q8');
										onQuizInteraction();
									}}
									class="sr-only"
								/>
								<div
									class="mb-1.5 max-w-full overflow-x-auto text-xs font-bold text-secondary sm:text-sm"
								>
									<MathFormula
										expr={'R_{\\mu\\nu} - \\frac{1}{2}Rg_{\\mu\\nu} + \\Lambda g_{\\mu\\nu} = \\frac{8\\pi G}{c^4}T_{\\mu\\nu}'}
									/>
								</div>
								<div class="text-[10px] text-gray-600">
									Geometria dello Spaziotempo &amp; Gravità
								</div>
							</label>

							<!-- Card 3 -->
							<label
								class="flex min-h-21 cursor-pointer flex-col items-center justify-center rounded-xl border p-3 text-center transition hover:border-primary {quizRadios.q8 ===
								'geo_atm,geo_oce,env'
									? 'border-primary bg-red-50/35 ring-1 ring-primary'
									: 'border-gray-200 bg-white'}"
							>
								<input
									type="radio"
									name="quiz_q8"
									value="geo_atm,geo_oce,env"
									bind:group={quizRadios.q8}
									onchange={() => {
										clearFieldError('quiz_q8');
										onQuizInteraction();
									}}
									class="sr-only"
								/>
								<div
									class="mb-1.5 max-w-full overflow-x-auto text-xs font-bold text-secondary sm:text-sm"
								>
									<MathFormula
										expr={'\\frac{D\\mathbf{u}}{Dt} + 2\\mathbf{\\Omega}\\times\\mathbf{u} = -\\frac{1}{\\rho}\\nabla p + \\mathbf{g} + \\nu\\nabla^2\\mathbf{u}'}
									/>
								</div>
								<div class="text-[10px] text-gray-600">
									Fluidodinamica Geofisica, Oceani &amp; Clima
								</div>
							</label>

							<!-- Card 4 -->
							<label
								class="flex min-h-21 cursor-pointer flex-col items-center justify-center rounded-xl border p-3 text-center transition hover:border-primary {quizRadios.q8 ===
								'cond,mat,hpc'
									? 'border-primary bg-red-50/35 ring-1 ring-primary'
									: 'border-gray-200 bg-white'}"
							>
								<input
									type="radio"
									name="quiz_q8"
									value="cond,mat,hpc"
									bind:group={quizRadios.q8}
									onchange={() => {
										clearFieldError('quiz_q8');
										onQuizInteraction();
									}}
									class="sr-only"
								/>
								<div
									class="mb-1.5 flex max-w-full flex-col items-center gap-1 overflow-x-auto text-xs font-bold text-secondary sm:text-sm"
								>
									<MathFormula expr={'\\hat{H}|\\Psi\\rangle = E|\\Psi\\rangle'} />
									<MathFormula expr="|\psi\rangle = \alpha|0\rangle + \beta|1\rangle" />
								</div>
								<div class="text-[10px] text-gray-600">Mondi Quantistici, Materia &amp; Qubit</div>
							</label>

							<!-- Card 5 -->
							<label
								class="flex min-h-21 cursor-pointer flex-col items-center justify-center rounded-xl border p-3 text-center transition hover:border-primary {quizRadios.q8 ===
								'comp,bio,did'
									? 'border-primary bg-red-50/35 ring-1 ring-primary'
									: 'border-gray-200 bg-white'}"
							>
								<input
									type="radio"
									name="quiz_q8"
									value="comp,bio,did"
									bind:group={quizRadios.q8}
									onchange={() => {
										clearFieldError('quiz_q8');
										onQuizInteraction();
									}}
									class="sr-only"
								/>
								<div
									class="mb-1.5 max-w-full overflow-x-auto text-xs font-bold text-secondary sm:text-sm"
								>
									<MathFormula expr="S = -k_B \displaystyle\sum_i p_i \ln p_i" />
								</div>
								<div class="text-[10px] text-gray-600">
									Entropia, Informazione, Vita &amp; Complessità
								</div>
							</label>

							<!-- Card 6 (FIXED: two cleanly stacked KaTeX lines, zero bare &) -->
							<label
								class="flex min-h-21 cursor-pointer flex-col items-center justify-center rounded-xl border p-3 text-center transition hover:border-primary {quizRadios.q8 ===
								'app,geo_sol,cond'
									? 'border-primary bg-red-50/35 ring-1 ring-primary'
									: 'border-gray-200 bg-white'}"
							>
								<input
									type="radio"
									name="quiz_q8"
									value="app,geo_sol,cond"
									bind:group={quizRadios.q8}
									onchange={() => {
										clearFieldError('quiz_q8');
										onQuizInteraction();
									}}
									class="sr-only"
								/>
								<div
									class="mb-1.5 flex max-w-full flex-col items-center gap-1 overflow-x-auto text-xs font-bold text-secondary sm:text-sm"
								>
									<MathFormula
										expr={'\\nabla \\times \\mathbf{B} = \\mu_0\\mathbf{J} + \\mu_0\\varepsilon_0\\frac{\\partial \\mathbf{E}}{\\partial t}'}
									/>
									<MathFormula
										expr={'\\rho\\ddot{\\mathbf{u}} = \\nabla \\cdot \\boldsymbol{\\sigma}'}
									/>
								</div>
								<div class="text-[10px] text-gray-600">
									Onde, Fotonica, Sensori &amp; Sismologia
								</div>
							</label>
						</div>
						{#if errors.quiz_q8}
							<p class="mt-2 text-xs font-semibold text-red-700">{errors.quiz_q8}</p>
						{/if}
					</div>

					<!-- Q9 -->
					<div
						data-field-id="quiz_q9"
						class="mb-5 rounded-xl border bg-white p-4 shadow-2xs {errors.quiz_q9
							? 'border-red-600 ring-1 ring-red-600'
							: 'border-gray-200'}"
					>
						<div class="mb-2 flex items-center justify-between gap-2">
							<span
								class="rounded bg-red-100 px-2 py-0.5 text-[10px] font-extrabold tracking-wider text-primary uppercase"
								>Scenario 09 • Il Rigore Violato</span
							>
							<span class="text-[10px] font-semibold text-gray-400">Dramma in aula</span>
						</div>
						<div class="mb-2.5 text-xs font-bold text-secondary sm:text-sm">
							9. Durante un seminario il relatore piazza alla lavagna un'approssimazione brutale che
							viola tre teoremi fondamentali. Come reagisci?
						</div>
						<div class="space-y-2 text-xs">
							<label
								class="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition hover:bg-gray-50 {quizRadios.q9 ===
								'hpc,app'
									? 'border-primary bg-red-50/25'
									: 'border-transparent hover:border-gray-200'}"
							>
								<input
									type="radio"
									name="quiz_q9"
									value="hpc,app"
									bind:group={quizRadios.q9}
									onchange={() => {
										clearFieldError('quiz_q9');
										onQuizInteraction();
									}}
									class="radio radio-primary radio-sm mt-0.5 border-gray-400 bg-white checked:border-primary"
								/>
								<span
									><strong>A)</strong> Pragmatismo computazionale: se la simulazione converge in tempo
									polinomiale e i residui restano sotto la precisione di macchina, per me funziona!</span
								>
							</label>
							<label
								class="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition hover:bg-gray-50 {quizRadios.q9 ===
								'astro,geo_oce'
									? 'border-primary bg-red-50/25'
									: 'border-transparent hover:border-gray-200'}"
							>
								<input
									type="radio"
									name="quiz_q9"
									value="astro,geo_oce"
									bind:group={quizRadios.q9}
									onchange={() => {
										clearFieldError('quiz_q9');
										onQuizInteraction();
									}}
									class="radio radio-primary radio-sm mt-0.5 border-gray-400 bg-white checked:border-primary"
								/>
								<span
									><strong>B)</strong> Sorrido con indulgenza astrofisica e oceanografica: nel
									nostro mestiere <MathFormula expr="1 \sim 10 \sim \pi" />, una mucca è una sfera
									omogenea, l'oceano è uno strato piatto su piano <MathFormula expr="f" /> e basta azzeccare
									l'ordine di grandezza di Rossby!</span
								>
							</label>
							<label
								class="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition hover:bg-gray-50 {quizRadios.q9 ===
								'teo,part'
									? 'border-primary bg-red-50/25'
									: 'border-transparent hover:border-gray-200'}"
							>
								<input
									type="radio"
									name="quiz_q9"
									value="teo,part"
									bind:group={quizRadios.q9}
									onchange={() => {
										clearFieldError('quiz_q9');
										onQuizInteraction();
									}}
									class="radio radio-primary radio-sm mt-0.5 border-gray-400 bg-white checked:border-primary"
								/>
								<span
									><strong>C)</strong> Alzo la mano indignatə:
									<em
										>"Scusi, ma l'unitarietà della matrice <MathFormula expr="S" />, l'invarianza di
										Lorentz e la rinormalizzabilità a due loop dove le mettiamo?!"</em
									></span
								>
							</label>
							<label
								class="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition hover:bg-gray-50 {quizRadios.q9 ===
								'comp,env,geo_atm'
									? 'border-primary bg-red-50/25'
									: 'border-transparent hover:border-gray-200'}"
							>
								<input
									type="radio"
									name="quiz_q9"
									value="comp,env,geo_atm"
									bind:group={quizRadios.q9}
									onchange={() => {
										clearFieldError('quiz_q9');
										onQuizInteraction();
									}}
									class="radio radio-primary radio-sm mt-0.5 border-gray-400 bg-white checked:border-primary"
								/>
								<span
									><strong>D)</strong> Accetto la sfida: nei sistemi complessi, nel clima e nella turbolenza
									le parametrizzazioni efficaci e le leggi di scala emergenti contano più del riduzionismo
									puro.</span
								>
							</label>
							<label
								class="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition hover:bg-gray-50 {quizRadios.q9 ===
								'did,geo_sol'
									? 'border-primary bg-red-50/25'
									: 'border-transparent hover:border-gray-200'}"
							>
								<input
									type="radio"
									name="quiz_q9"
									value="did,geo_sol"
									bind:group={quizRadios.q9}
									onchange={() => {
										clearFieldError('quiz_q9');
										onQuizInteraction();
									}}
									class="radio radio-primary radio-sm mt-0.5 border-gray-400 bg-white checked:border-primary"
								/>
								<span
									><strong>E)</strong> Apprezzo il valore euristico ed epistemologico: i modelli semplificati
									— come approssimare la Terra a gusci elastici stratificati per capire le onde sismiche
									— sono ponti cognitivi straordinari per far intuire il fenomeno fisico sottostante.</span
								>
							</label>
							<label
								class="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition hover:bg-gray-50 {quizRadios.q9 ===
								'cond,mat,bio'
									? 'border-primary bg-red-50/25'
									: 'border-transparent hover:border-gray-200'}"
							>
								<input
									type="radio"
									name="quiz_q9"
									value="cond,mat,bio"
									bind:group={quizRadios.q9}
									onchange={() => {
										clearFieldError('quiz_q9');
										onQuizInteraction();
									}}
									class="radio radio-primary radio-sm mt-0.5 border-gray-400 bg-white checked:border-primary"
								/>
								<span
									><strong>F)</strong> Controllo subito i dati sperimentali di laboratorio: un'approssimazione
									di campo medio o quasi-particella è legittima solo se riproduce la curva misurata sul
									campione!</span
								>
							</label>
						</div>
						{#if errors.quiz_q9}
							<p class="mt-2 text-xs font-semibold text-red-700">{errors.quiz_q9}</p>
						{/if}
					</div>

					<!-- Q10 (Bussola Mentale — 5 steps => px-[10%] + grid-cols-5) -->
					<div
						data-field-id="quiz_q10"
						class="mb-5 rounded-xl border bg-linear-to-r from-amber-50/60 via-white to-red-50/40 p-4 shadow-2xs {errors.quiz_q10
							? 'border-red-600 ring-1 ring-red-600'
							: 'border-amber-200'}"
					>
						<div class="mb-2 flex flex-wrap items-center justify-between gap-2">
							<span
								class="rounded bg-amber-200 px-2 py-0.5 text-[10px] font-extrabold tracking-wider text-amber-950 uppercase"
								>🧭 Blitz 10 • Bussola Mentale</span
							>
							<span
								class="rounded-full bg-amber-800 px-2.5 py-0.5 text-[11px] font-bold text-white"
							>
								{POSTURE_SLIDER_CONFIG[quizPostureVal]?.label}
							</span>
						</div>
						<div class="mb-2 text-xs font-bold text-secondary sm:text-sm">
							10. Dove si colloca il tuo baricentro naturale tra astrazione formale pura,
							simulazione computazionale e smanettamento sperimentale?
						</div>
						<div class="w-full">
							<div class="px-[10%]">
								<input
									type="range"
									aria-label="Bussola di Postura Scientifica"
									min="0"
									max="4"
									step="1"
									bind:value={quizPostureVal}
									onpointerdown={() => {
										quizPostureTouched = true;
										clearFieldError('quiz_q10');
										onQuizInteraction();
									}}
									oninput={() => {
										quizPostureTouched = true;
										clearFieldError('quiz_q10');
										onQuizInteraction();
									}}
									onchange={() => {
										quizPostureTouched = true;
										clearFieldError('quiz_q10');
										onQuizInteraction();
									}}
									class="range range-primary range-sm my-2 w-full [--range-fill:0]"
								/>
							</div>
							<div
								class="mt-1 grid grid-cols-5 text-center text-[10px] leading-tight font-bold text-gray-600"
							>
								<span class="px-0.5">100% Carta, Penna<br />&amp; Teoremi</span>
								<span class="px-0.5">Teoria Fenomenologica<br />&amp; Modelli</span>
								<span class="px-0.5">Simulazioni, HPC,<br />AI &amp; Complessità</span>
								<span class="px-0.5">Misura, Campioni<br />&amp; Osservazioni</span>
								<span class="px-0.5">100% Cacciavite,<br />Sensori &amp; Hardware</span>
							</div>
						</div>
						{#if !quizPostureTouched}
							<p class="mt-2 text-[11px] font-medium text-amber-800">
								👆 Tocca o trascina lo slider per confermare la tua scelta (anche se resti sulla
								posizione attuale).
							</p>
						{/if}
						{#if errors.quiz_q10}
							<p class="mt-1 text-xs font-semibold text-red-700">{errors.quiz_q10}</p>
						{/if}
					</div>

					<!-- Q11 -->
					<div
						data-field-id="quiz_q11"
						class="mb-5 rounded-xl border bg-white p-4 shadow-2xs {errors.quiz_q11
							? 'border-red-600 ring-1 ring-red-600'
							: 'border-gray-200'}"
					>
						<div class="mb-2 flex items-center justify-between gap-2">
							<span
								class="rounded bg-red-100 px-2 py-0.5 text-[10px] font-extrabold tracking-wider text-primary uppercase"
								>Scenario 11 • Notte Bolognese</span
							>
							<span class="text-[10px] font-semibold text-gray-400"
								>Dibattito filosofico-scientifico</span
							>
						</div>
						<div class="mb-2.5 text-xs font-bold text-secondary sm:text-sm">
							11. Ore 23:45 tra Via del Pratello e Via Petroni con un bicchiere in mano. Su cosa
							finisci immancabilmente a dibattere coi colleghi?
						</div>
						<div class="space-y-2 text-xs">
							{#each [{ val: 'astro,geo_sol,geo_oce', letter: 'A)', text: "L'abitabilità degli oceani sub-glaciali delle lune gioviane, la geologia planetaria e il segnale delle prime onde gravitazionali cosmologiche." }, { val: 'hpc,comp', letter: 'B)', text: 'Se la coscienza sia un fenomeno emergente in una rete neurale complessa o se siamo dentro una simulazione quantistica a scala di Planck.' }, { val: 'part,teo', letter: 'C)', text: 'Come scovare la materia oscura nei rivelatori sotterranei, la gerarchia delle masse dei neutrini e il futuro della fisica oltre il Modello Standard.' }, { val: 'env,geo_atm,geo_oce', letter: 'D)', text: 'I punti di non ritorno climatici (tipping points), il rallentamento della circolazione termoalina oceanica e la transizione energetica globale.' }, { val: 'did,app', letter: 'E)', text: "Come spiegare l'entanglement e l'ottica ondulatoria al tavolo accanto usando solo il tappo di metallo, una lente e i riflessi dei lampioni felsinei!" }, { val: 'bio,mat,cond', letter: 'F)', text: 'La biofisica del cervello, i nanorobot medicali a guida magnetica e come progettare nuovi materiali quantistici per rivoluzionare la tecnologia.' }] as opt (opt.val)}
								<label
									class="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition hover:bg-gray-50 {quizRadios.q11 ===
									opt.val
										? 'border-primary bg-red-50/25'
										: 'border-transparent hover:border-gray-200'}"
								>
									<input
										type="radio"
										name="quiz_q11"
										value={opt.val}
										bind:group={quizRadios.q11}
										onchange={() => {
											clearFieldError('quiz_q11');
											onQuizInteraction();
										}}
										class="radio radio-primary radio-sm mt-0.5 border-gray-400 bg-white checked:border-primary"
									/>
									<span><strong>{opt.letter}</strong> {opt.text}</span>
								</label>
							{/each}
						</div>
						{#if errors.quiz_q11}
							<p class="mt-2 text-xs font-semibold text-red-700">{errors.quiz_q11}</p>
						{/if}
					</div>

					<!-- Q12 -->
					<div
						data-field-id="quiz_q12"
						class="mb-6 rounded-xl border bg-linear-to-r from-amber-50/60 via-white to-red-50/40 p-4 shadow-2xs {errors.quiz_q12
							? 'border-red-600 ring-1 ring-red-600'
							: 'border-amber-200'}"
					>
						<div class="mb-2 flex items-center justify-between gap-2">
							<span
								class="rounded bg-amber-200 px-2 py-0.5 text-[10px] font-extrabold tracking-wider text-amber-950 uppercase"
								>🦸 Blitz 12 • Superpotere Fisico</span
							>
							<span class="text-[10px] font-bold text-amber-800">Ultimo colpo di gaso!</span>
						</div>
						<div class="mb-2.5 text-xs font-bold text-secondary sm:text-sm">
							12. Se potessi sbloccare istantaneamente una "vista speciale" sulla natura, quale
							sceglieresti?
						</div>
						<div class="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
							<label
								class="flex min-h-13 cursor-pointer items-center gap-2 rounded-xl border p-2.5 font-semibold transition hover:border-primary {quizRadios.q12 ===
								'part,teo,astro'
									? 'border-primary bg-red-50 text-secondary'
									: 'border-gray-200 bg-white text-gray-800'}"
							>
								<input
									type="radio"
									name="quiz_q12"
									value="part,teo,astro"
									bind:group={quizRadios.q12}
									onchange={() => {
										clearFieldError('quiz_q12');
										onQuizInteraction();
									}}
									class="radio radio-primary radio-sm border-gray-400 bg-white checked:border-primary"
								/>
								<span>👁️ Vedere a occhio nudo fluttuazioni di vuoto, neutrini e raggi cosmici</span>
							</label>
							<label
								class="flex min-h-13 cursor-pointer items-center gap-2 rounded-xl border p-2.5 font-semibold transition hover:border-primary {quizRadios.q12 ===
								'cond,mat,app'
									? 'border-primary bg-red-50 text-secondary'
									: 'border-gray-200 bg-white text-gray-800'}"
							>
								<input
									type="radio"
									name="quiz_q12"
									value="cond,mat,app"
									bind:group={quizRadios.q12}
									onchange={() => {
										clearFieldError('quiz_q12');
										onQuizInteraction();
									}}
									class="radio radio-primary radio-sm border-gray-400 bg-white checked:border-primary"
								/>
								<span
									>🌈 Controllare la fase dei fotoni e spostare singoli atomi in un cristallo</span
								>
							</label>
							<label
								class="flex min-h-13 cursor-pointer items-center gap-2 rounded-xl border p-2.5 font-semibold transition hover:border-primary {quizRadios.q12 ===
								'geo_sol,geo_atm,geo_oce,env'
									? 'border-primary bg-red-50 text-secondary'
									: 'border-gray-200 bg-white text-gray-800'}"
							>
								<input
									type="radio"
									name="quiz_q12"
									value="geo_sol,geo_atm,geo_oce,env"
									bind:group={quizRadios.q12}
									onchange={() => {
										clearFieldError('quiz_q12');
										onQuizInteraction();
									}}
									class="radio radio-primary radio-sm border-gray-400 bg-white checked:border-primary"
								/>
								<span
									>🌪️ Percepire in 3D le correnti oceaniche, i venti d'alta quota e lo stress
									tettonico</span
								>
							</label>
							<label
								class="flex min-h-13 cursor-pointer items-center gap-2 rounded-xl border p-2.5 font-semibold transition hover:border-primary {quizRadios.q12 ===
								'bio,comp'
									? 'border-primary bg-red-50 text-secondary'
									: 'border-gray-200 bg-white text-gray-800'}"
							>
								<input
									type="radio"
									name="quiz_q12"
									value="bio,comp"
									bind:group={quizRadios.q12}
									onchange={() => {
										clearFieldError('quiz_q12');
										onQuizInteraction();
									}}
									class="radio radio-primary radio-sm border-gray-400 bg-white checked:border-primary"
								/>
								<span
									>🧬 Visualizzare in tempo reale il trasporto ionico cellulare e le dinamiche
									neurali</span
								>
							</label>
							<label
								class="flex min-h-13 cursor-pointer items-center gap-2 rounded-xl border p-2.5 font-semibold transition hover:border-primary {quizRadios.q12 ===
								'hpc,comp,teo'
									? 'border-primary bg-red-50 text-secondary'
									: 'border-gray-200 bg-white text-gray-800'}"
							>
								<input
									type="radio"
									name="quiz_q12"
									value="hpc,comp,teo"
									bind:group={quizRadios.q12}
									onchange={() => {
										clearFieldError('quiz_q12');
										onQuizInteraction();
									}}
									class="radio radio-primary radio-sm border-gray-400 bg-white checked:border-primary"
								/>
								<span
									>🔮 Simulare mentalmente l'evoluzione esatta di sistemi caotici a
									<MathFormula expr="N" /> corpi</span
								>
							</label>
							<label
								class="flex min-h-13 cursor-pointer items-center gap-2 rounded-xl border p-2.5 font-semibold transition hover:border-primary {quizRadios.q12 ===
								'did,astro,app'
									? 'border-primary bg-red-50 text-secondary'
									: 'border-gray-200 bg-white text-gray-800'}"
							>
								<input
									type="radio"
									name="quiz_q12"
									value="did,astro,app"
									bind:group={quizRadios.q12}
									onchange={() => {
										clearFieldError('quiz_q12');
										onQuizInteraction();
									}}
									class="radio radio-primary radio-sm border-gray-400 bg-white checked:border-primary"
								/>
								<span
									>🎙️ Far innamorare della fisica chiunque in 60 secondi con un esperimento
									tascabile</span
								>
							</label>
						</div>
						{#if errors.quiz_q12}
							<p class="mt-2 text-xs font-semibold text-red-700">{errors.quiz_q12}</p>
						{/if}
					</div>

					<!-- SEZIONE MATCHING 14 MACRO-AREE TEMATICHE (SORTABLEJS + FRECCE) -->
					<div
						data-field-id="quiz_matching"
						class="rounded-2xl border-2 bg-linear-to-br from-amber-50/90 via-white to-red-50/50 p-4 shadow-md sm:p-6 {errors.quiz_matching
							? 'border-red-500'
							: 'border-amber-300'}"
					>
						<div
							class="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-amber-200 pb-3"
						>
							<div>
								<h4
									class="font-playfair-display flex items-center gap-2 text-base font-extrabold text-secondary"
								>
									<span>🎯</span> Matching Tematico Visite (14 Macro-Aree)
								</h4>
								<p class="text-xs text-gray-600">
									Trascina le card dalla maniglia <strong>⋮⋮</strong> (o usa le frecce ▲▼) per personalizzare
									l'ordine in qualsiasi momento.
								</p>
							</div>
							{#if matchingAccepted && canAcceptRanking}
								<span
									class="rounded-full border border-emerald-300 bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-900"
								>
									Classifica Accettata ✓
								</span>
							{:else if isManualOrder}
								<span
									class="rounded-full border border-purple-300 bg-purple-100 px-3 py-1 text-xs font-bold text-purple-900"
								>
									Personalizzazione Manuale Attiva ✏️
								</span>
							{:else if quizResult.answeredCount === 0}
								<span
									class="rounded-full border border-gray-300 bg-gray-100 px-3 py-1 text-xs font-bold text-gray-700"
								>
									In attesa di risposte (0 / 12 sfide) ⏳
								</span>
							{:else if quizResult.answeredCount < 12}
								<span
									class="rounded-full border border-amber-300 bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900"
								>
									Hai risposto a {quizResult.answeredCount} / 12 sfide ⚡
								</span>
							{:else}
								<span
									class="rounded-full border border-emerald-300 bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-900"
								>
									Quiz Completato (12 / 12) ✨
								</span>
							{/if}
						</div>

						<p class="mb-3 text-xs leading-relaxed text-gray-700">
							Le visite scientifiche sono suddivise in <strong>14 macro-aree tematiche</strong>.
							Ecco la graduatoria calcolata per te dalle risposte al quiz:
						</p>

						<!-- LISTA ORDINABILE CON SORTABLEJS -->
						<div bind:this={rankingListEl} class="mb-5 space-y-2.5">
							{#each displayedAreas as area, index (area.id)}
								{@const rank = index + 1}
								{@const nScore = Math.min(1, Math.max(0, quizResult.normScores[area.id] ?? 0))}
								{@const affinityPct = Math.min(99, Math.max(45, Math.round(50 + nScore * 49)))}
								<div
									data-area-id={area.id}
									class="flex items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white p-2.5 shadow-2xs transition hover:border-primary/50 sm:gap-3 sm:p-3"
								>
									<div class="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
										<!-- Dedicated 6-dot Drag Handle (touch-none ONLY on handle so page scrolls cleanly) -->
										<button
											type="button"
											title="Trascina per riordinare"
											aria-label="Trascina {area.name} per cambiare posizione"
											class="drag-handle flex h-11 w-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-primary active:cursor-grabbing"
										>
											<GripVertical class="size-4" />
										</button>

										<span
											class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs shadow-2xs {rank ===
											1
												? 'bg-amber-500 font-extrabold text-white'
												: rank === 2
													? 'bg-primary text-primary-content font-bold'
													: rank === 3
														? 'bg-secondary text-secondary-content font-bold'
														: 'bg-gray-200 font-bold text-gray-700'}"
										>
											{rank}°
										</span>

										<div class="min-w-0 flex-1">
											<div class="flex flex-wrap items-center gap-1.5">
												<span class="text-xs font-bold text-secondary sm:text-sm">
													{area.icon}
													{area.name}
												</span>
												<span
													class="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600"
												>
													{area.badge}
												</span>
												{#if !isManualOrder && rank <= 3}
													<span
														class="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900"
													>
														Affinità {affinityPct}%
													</span>
												{/if}
											</div>
											<p class="mt-0.5 text-[11px] text-gray-500">{area.desc}</p>
										</div>
									</div>

									<!-- Keyboard-accessible Up/Down buttons -->
									<div class="flex shrink-0 items-center gap-1">
										<button
											type="button"
											onclick={() => moveThematicItem(index, -1)}
											disabled={index === 0}
											aria-label="Sposta su {area.name}"
											class="flex h-9 w-8 items-center justify-center rounded-lg border border-gray-300 bg-white text-xs font-bold text-gray-700 transition hover:border-primary/50 hover:bg-red-50/30 disabled:opacity-30"
										>
											▲
										</button>
										<button
											type="button"
											onclick={() => moveThematicItem(index, 1)}
											disabled={index === displayedAreas.length - 1}
											aria-label="Sposta giù {area.name}"
											class="flex h-9 w-8 items-center justify-center rounded-lg border border-gray-300 bg-white text-xs font-bold text-gray-700 transition hover:border-primary/50 hover:bg-red-50/30 disabled:opacity-30"
										>
											▼
										</button>
									</div>
								</div>
							{/each}
						</div>

						<!-- OPZIONE ACCETTA / RIPRISTINA -->
						<div
							class="flex flex-wrap items-center justify-between gap-3 border-t border-amber-200 pt-4"
						>
							<div class="text-xs text-gray-600">
								{#if matchingAccepted && canAcceptRanking}
									Ordinamento confermato! Se trascini le card o usi le frecce ▲▼ dovrai confermarlo
									di nuovo.
								{:else if canAcceptRanking}
									Riordina liberamente le aree (maniglia <strong>⋮⋮</strong> o frecce
									<strong>▲▼</strong>) e clicca <strong>"Accetta Questo Ordinamento"</strong> per confermare
									e proseguire.
								{:else}
									Completa tutte le <strong
										>12 sfide del quiz ({quizResult.answeredCount}/12)</strong
									>
									per sbloccare la conferma dell'ordinamento
								{/if}
							</div>
							<div class="flex flex-wrap items-center gap-2">
								<button
									type="button"
									onclick={acceptMatchingRanking}
									disabled={!canAcceptRanking}
									class="btn btn-sm min-h-11 rounded-xl border-0 bg-emerald-700 px-4 text-xs font-bold text-white shadow-sm hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-600 disabled:shadow-none"
								>
									<Check class="size-4" />
									{matchingAccepted && canAcceptRanking
										? 'Ordinamento Accettato'
										: 'Accetta Questo Ordinamento'}
								</button>
								{#if isManualOrder}
									<button
										type="button"
										onclick={restoreQuizOrder}
										class="btn btn-sm min-h-11 rounded-xl border border-purple-300 bg-purple-50 px-3 text-xs font-bold text-purple-900 hover:bg-purple-100"
									>
										<RotateCcw class="size-3.5" />
										Ripristina ordine quiz
									</button>
								{/if}
							</div>
						</div>

						{#if matchingAccepted && canAcceptRanking}
							<div
								class="mt-3 flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-100 p-2.5 text-xs font-bold text-emerald-950"
							>
								<span>✓</span> Ordinamento preferenze visite confermato per la candidatura!
							</div>
						{/if}

						{#if errors.quiz_matching}
							<p class="mt-3 text-xs font-semibold text-red-700">{errors.quiz_matching}</p>
						{/if}

						<!-- DISCLAIMER VISITE -->
						<div
							class="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-300 bg-white/95 p-3 text-[11px] leading-relaxed text-amber-950 shadow-2xs"
						>
							<span class="shrink-0 text-sm font-bold text-amber-700">📌</span>
							<div>
								<strong>Disclaimer Visite &amp; Assegnazione Posti:</strong> Le risposte al quiz e
								l'ordine delle preferenze tematiche servono al CO per distribuire i partecipanti nei
								gruppi di visita. Poiché i singoli istituti ospitanti hanno capienze massime
								rigorose e contingentate per ragioni logistiche e di sicurezza,
								<strong
									>l'indicazione delle preferenze non costituisce garanzia automatica di
									assegnazione alla prima scelta</strong
								>; il CO farà il massimo per soddisfare le priorità espresse compatibilmente con i
								posti disponibili e con eventuali variazioni organizzative degli enti.
							</div>
						</div>
					</div>
				</div>

				<!-- Avvertenza di Responsabilità -->
				<div
					class="mt-6 flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50/80 p-3.5 text-xs text-amber-950 shadow-2xs"
				>
					<span class="shrink-0 text-sm font-black text-amber-700">❗</span>
					<div>
						<strong>Avvertenza di Responsabilità &amp; Correttezza:</strong> Ricordiamo che, in base
						ai criteri di selezione ufficiali CISF27,
						<em
							>qualsiasi dichiarazione non veritiera o mendace comporterà l'immediato e irrevocabile
							rigetto della candidatura</em
						>. Se durante la compilazione o dopo l'invio ti accorgi di aver commesso un errore
						materiale involontario, contatta tempestivamente il CO all'indirizzo
						<a
							href={`mailto:${contactEmail}`}
							class="font-bold text-secondary underline hover:text-primary">{contactEmail}</a
						>
						per rettificare i dati!
					</div>
				</div>

				{#if stepErrorBanner}
					<div
						role="alert"
						class="mt-5 flex items-start gap-2.5 rounded-xl border border-red-300 bg-red-50 p-3.5 text-xs font-semibold text-red-900"
					>
						<AlertTriangle class="mt-0.5 size-4 shrink-0 text-red-700" />
						<span>{stepErrorBanner}</span>
					</div>
				{/if}

				<div class="mt-8 flex flex-wrap items-center justify-between gap-3">
					<button
						type="button"
						onclick={() => goToStep(2)}
						class="btn min-h-12 rounded-xl border border-gray-300 bg-white px-5 text-xs font-bold text-gray-700 hover:bg-gray-100"
					>
						<ArrowLeft class="size-4" />
						Indietro: Anagrafica &amp; Percorso
					</button>
					<button
						type="button"
						onclick={() => goToStep(4)}
						class="btn btn-primary min-h-12 rounded-xl px-6 text-sm font-bold text-white shadow-md"
					>
						Continua: Logistica &amp; Benessere
						<ArrowRight class="size-4" />
					</button>
				</div>
			</div>
		{/if}

		<!-- =================================================================== -->
		<!-- SCHERMATA 5 / STEP 4: LOGISTICA INCLUSIVA, CAMERE & SAFE SPACE      -->
		<!-- =================================================================== -->
		{#if showWizard && currentStep === 4}
			<div class="rounded-2xl border border-primary/20 bg-base-100 shadow-lg mb-8 p-5 sm:p-10">
				<div class="mb-4 flex items-center gap-3">
					<div
						class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-100 text-sm font-bold text-green-900"
					>
						05
					</div>
					<div>
						<h2 class="font-playfair-display text-2xl font-bold text-secondary sm:text-3xl">
							Logistica &amp; Benessere
						</h2>
						<p class="text-xs text-gray-600 sm:text-sm">
							Preferenze logistiche che <em><strong>non</strong></em> influiscono sulla graduatoria
						</p>
					</div>
				</div>

				<!-- WRAPPER VERDE UNIFICATO SAFE SPACE -->
				<div
					class="mb-8 space-y-6 rounded-2xl border-2 border-emerald-400 bg-linear-to-br from-emerald-50/75 via-teal-50/55 to-blue-50/55 p-4 shadow-sm sm:p-7"
				>
					<div class="flex items-start gap-3.5">
						<div
							class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-lg font-bold text-white shadow-sm"
						>
							🛡️
						</div>
						<div class="min-w-0 flex-1">
							<div
								class="mb-1 inline-block rounded-full bg-emerald-200 px-2.5 py-0.5 text-[11px] font-extrabold tracking-wider text-emerald-950 uppercase"
							>
								SEZIONE PROTETTA • RISERVATEZZA ASSOLUTA
							</div>
							<h3 class="font-playfair-display text-xl font-extrabold text-emerald-950">
								Tutto quello che inserisci qui NON influisce sulla graduatoria. Zero.
							</h3>
							<p class="mt-2 text-xs leading-relaxed text-emerald-900">
								Tranquillə: nel nostro stesso CO abbiamo persone con le stesse identiche esigenze —
								<strong>la nostra responsabile che convive con una severa allergia al nichel</strong
								>,
								<strong
									>uno dei coordinatori che rischierebbe letteralmente la vita con una minima
									traccia di frutta secca</strong
								>, e
								<strong>chi nel comitato segue una dieta 100% vegana</strong>! Sappiamo bene cosa
								significhi il timore che una segnalazione medica possa penalizzare una candidatura:
								<em>qui non succederà mai!</em>
							</p>

							<div
								class="mt-3 rounded-xl border border-emerald-200 bg-white/90 p-3 text-xs leading-relaxed text-gray-700 shadow-2xs"
							>
								<strong>Canale riservato con i Coordinatori Generali:</strong> In caso di dubbi o se
								durante l'evento percepisci qualunque disagio, puoi rivolgerti in
								<strong>totale riservatezza e discrezione</strong> direttamente a
								<strong>Francesco Isgrò</strong>
								(<a href="tel:+393345243386" class="font-semibold text-primary underline"
									>+39 334 524 3386</a
								>
								• <strong>tg</strong>
								<a
									href="https://t.me/franceee05"
									target="_blank"
									rel="noopener noreferrer"
									class="font-semibold text-primary underline">@franceee05</a
								>
								•
								<a
									href="mailto:francesco.isgro@ai-sf.it"
									class="font-semibold text-primary underline">francesco.isgro@ai-sf.it</a
								>) e <strong>Alessandro D'Agostino</strong>
								(<a href="tel:+393287727112" class="font-semibold text-primary underline"
									>+39 328 772 7112</a
								>
								• <strong>tg</strong>
								<a
									href="https://t.me/aledag0"
									target="_blank"
									rel="noopener noreferrer"
									class="font-semibold text-primary underline">@aledag0</a
								>
								•
								<a
									href="mailto:alessandro.dagostino@ai-sf.it"
									class="font-semibold text-primary underline">alessandro.dagostino@ai-sf.it</a
								>).
							</div>
						</div>
					</div>

					<!-- 1. Preferenze Alloggio & Camere (NASCOSTA SE tipologiaQuota === 'senza_letto') -->
					{#if showAccommodationCard}
						<div class="rounded-xl border border-emerald-200/80 bg-white/95 p-5 shadow-2xs">
							<h4 class="mb-2 flex items-center gap-2 text-base font-bold text-secondary">
								<svg
									class="h-5 w-5 shrink-0 text-primary"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
									/>
								</svg>
								Preferenze Alloggio &amp; Camere ({accommodationName})
							</h4>
							<p class="mb-4 text-xs text-gray-600">
								Il <strong>{accommodationName}</strong> dispone di 24 doppie, 10 triple e 18
								quadruple, tutte con bagno en-suite. I potenziali letti matrimoniali disponibili
								nella struttura comprendono fino a 6 quadruple (con un letto matrimoniale e due
								letti a castello) e 3 doppie.
								<em
									>Tutte le preferenze logistiche verranno accolte nei limiti del possibile in base
									alle disponibilità strutturali.</em
								>
							</p>

							<div class="space-y-4">
								<div data-field-id="disponibilita_matrimoniale">
									<label
										for="select-matrimoniale"
										class="mb-1 block text-xs font-bold text-gray-800"
									>
										Disponibilità a dormire in un letto matrimoniale:
									</label>
									<select
										id="select-matrimoniale"
										bind:value={disponibilitaMatrimoniale}
										onchange={() => {
											clearFieldError('disponibilita_matrimoniale');
											clearFieldError('matrimoniale_nominativo');
										}}
										class="select select-bordered min-h-11 w-full rounded-xl bg-white text-xs text-gray-900 sm:text-sm {errors.disponibilita_matrimoniale
											? 'border-red-600 ring-1 ring-red-600'
											: 'border-gray-300'}"
									>
										<option value="" disabled>Seleziona un'opzione</option>
										<option value="disponibile_indifferente"
											>Disponibile indifferentemente (senza vincoli di genere)</option
										>
										<option value="disponibile_stesso_genere"
											>Disponibile purché con persona dello stesso genere</option
										>
										<option value="disponibile_solo_persona_specifica"
											>Disponibile SOLO con la persona specifica indicata qui sotto</option
										>
										<option value="non_disponibile"
											>Non disponibile (preferisco letto singolo)</option
										>
									</select>
									{#if errors.disponibilita_matrimoniale}
										<p class="mt-1 text-xs font-semibold text-red-700">
											{errors.disponibilita_matrimoniale}
										</p>
									{/if}
								</div>

								{#if disponibilitaMatrimoniale !== '' && disponibilitaMatrimoniale !== 'non_disponibile'}
									<div
										class="space-y-2 rounded-xl border border-red-200 bg-red-50/60 p-4"
										data-field-id="matrimoniale_nominativo"
									>
										<label
											for="input-matrimoniale-nominativo"
											class="block text-xs font-bold text-secondary"
										>
											{#if disponibilitaMatrimoniale === 'disponibile_solo_persona_specifica'}
												Indica il nominativo e l'ateneo della persona specifica con cui vuoi
												condividere il letto matrimoniale:
											{:else}
												Se desideri condividere il letto matrimoniale con una persona specifica,
												indicane il nominativo e l'ateneo (Facoltativo):
											{/if}
										</label>
										<input
											type="text"
											id="input-matrimoniale-nominativo"
											bind:value={matrimonialeNominativo}
											oninput={() => clearFieldError('matrimoniale_nominativo')}
											placeholder="Nome, Cognome e Università (la persona deve indicarti a sua volta nel proprio form)"
											class="input input-bordered min-h-11 w-full rounded-lg bg-white text-xs text-gray-900 sm:text-sm {errors.matrimoniale_nominativo
												? 'border-red-600 ring-1 ring-red-600'
												: 'border-red-300'}"
										/>
										<span class="block text-[11px] text-gray-600">
											Nota: per il letto matrimoniale
											<strong
												>la corrispondenza reciproca dei nominativi nei due form è obbligatoria</strong
											>.
										</span>
										{#if errors.matrimoniale_nominativo}
											<p class="text-xs font-semibold text-red-700">
												{errors.matrimoniale_nominativo}
											</p>
										{/if}
									</div>
								{/if}

								<!-- Tipologia camere accettate -->
								<div class="pt-1" data-field-id="camere_accettate">
									<p class="mb-2 block text-xs font-bold text-gray-800">
										Tipologia di camere in cui accetti di dormire (puoi selezionare più opzioni!):
									</p>
									<div
										class="grid grid-cols-1 gap-2.5 text-xs sm:grid-cols-3 {errors.camere_accettate
											? 'rounded-xl ring-2 ring-red-600 ring-offset-2'
											: ''}"
									>
										{#each ['Doppia', 'Tripla', 'Quadrupla'] as roomType (roomType)}
											<label
												class="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border bg-white p-3 text-gray-800 hover:border-gray-300 {camereAccettate.includes(
													roomType
												)
													? 'border-primary bg-red-50/20 font-semibold'
													: 'border-gray-200'}"
											>
												<input
													type="checkbox"
													checked={camereAccettate.includes(roomType)}
													onchange={() => toggleCameraType(roomType)}
													class="checkbox checkbox-primary checkbox-sm border-gray-400 bg-white checked:border-primary checked:bg-primary"
												/>
												<span>Camera {roomType}</span>
											</label>
										{/each}
									</div>
									{#if errors.camere_accettate}
										<p class="mt-1.5 text-xs font-semibold text-red-700">
											{errors.camere_accettate}
										</p>
									{/if}
								</div>

								<!-- Compagni di stanza -->
								<div class="grid grid-cols-1 gap-4 pt-2 sm:grid-cols-2">
									<div data-field-id="preferenza_compagni">
										<label for="select-compagni" class="mb-1 block text-xs font-bold text-gray-800">
											In generale, preferisco condividere la camera con persone:
										</label>
										<select
											id="select-compagni"
											bind:value={preferenzaCompagni}
											onchange={() => clearFieldError('preferenza_compagni')}
											class="select select-bordered min-h-11 w-full rounded-xl bg-white text-xs text-gray-900 sm:text-sm {errors.preferenza_compagni
												? 'border-red-600 ring-1 ring-red-600'
												: 'border-gray-300'}"
										>
											<option value="" disabled>Seleziona una preferenza</option>
											<option value="qualsiasi">Qualsiasi / Indifferente</option>
											<option value="stesso_genere">Dello stesso genere</option>
										</select>
										<span class="mt-1 block text-[11px] text-gray-500">
											Per qualsiasi esigenza particolare di comfort o privacy negli alloggi, puoi
											scrivere liberamente nel box <em>Accessibilità</em> a fondo pagina.
										</span>
										{#if errors.preferenza_compagni}
											<p class="mt-1 text-xs font-semibold text-red-700">
												{errors.preferenza_compagni}
											</p>
										{/if}
									</div>

									<div>
										<label
											for="input-coinquilini-specifici"
											class="mb-1 block text-xs font-bold text-gray-800"
										>
											Persone specifiche con cui vorresti condividere la stanza (Facoltativo):
										</label>
										<input
											type="text"
											id="input-coinquilini-specifici"
											bind:value={coinquiliniSpecifici}
											placeholder="Es. Mario Rossi (Torino), Anna Bianchi (Pisa)..."
											class="input input-bordered min-h-11 w-full rounded-xl border-gray-300 bg-white text-xs text-gray-900 sm:text-sm"
										/>
										<span class="mt-1 block text-[11px] text-gray-500">
											<u>Nota coinquilini</u>: a differenza del letto matrimoniale, per la stanza
											l'indicazione reciproca nei rispettivi form non è strettamente obbligatoria ma
											è <strong>caldamente consigliata</strong> per dare priorità all'abbinamento.
										</span>
									</div>
								</div>
							</div>
						</div>
					{/if}

					<!-- 2. Regime Alimentare Principale -->
					<div class="rounded-xl border border-emerald-200/80 bg-white/95 p-5 shadow-2xs">
						<h4 class="mb-2 flex items-center gap-2 text-base font-bold text-secondary">
							<svg
								class="h-5 w-5 shrink-0 text-emerald-700"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3"
								/>
							</svg>
							Regime Alimentare
						</h4>
						<p class="mb-3 text-xs text-gray-600">
							Indica la tua abitudine o necessità alimentare per consentirci di organizzare i pasti
							e i catering convenzionati della conferenza:
						</p>

						<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<div data-field-id="regime_alimentare">
								<label
									for="select-regime-alimentare"
									class="mb-1 block text-xs font-bold text-gray-800"
								>
									Regime Alimentare Principale
								</label>
								<select
									id="select-regime-alimentare"
									bind:value={regimeAlimentare}
									onchange={() => {
										clearFieldError('regime_alimentare');
										clearFieldError('regime_altro');
									}}
									class="select select-bordered min-h-11 w-full rounded-xl bg-white text-xs text-gray-900 sm:text-sm {errors.regime_alimentare
										? 'border-red-600 ring-1 ring-red-600'
										: 'border-gray-300'}"
								>
									<option value="" disabled>Seleziona un regime</option>
									<option value="celiaco">Celiaco (Senza Glutine certificato AIC)</option>
									<option value="onnivoro">Onnivoro</option>
									<option value="vegetariano">Vegetariano</option>
									<option value="vegano">Vegano</option>
									<option value="altro">Altro (specificare nel campo a comparsa)</option>
								</select>
								{#if errors.regime_alimentare}
									<p class="mt-1 text-xs font-semibold text-red-700">{errors.regime_alimentare}</p>
								{/if}
							</div>

							{#if regimeAlimentare === 'altro'}
								<div data-field-id="regime_altro">
									<label
										for="input-regime-altro"
										class="mb-1 block text-xs font-bold text-secondary"
									>
										Specifica regime alimentare speciale:
									</label>
									<input
										type="text"
										id="input-regime-altro"
										bind:value={regimeAltro}
										oninput={() => clearFieldError('regime_altro')}
										placeholder="Es. Pescetariano, dieta specifica..."
										class="input input-bordered min-h-11 w-full rounded-xl bg-white text-xs text-gray-900 sm:text-sm {errors.regime_altro
											? 'border-red-600 ring-1 ring-red-600'
											: 'border-gray-300'}"
									/>
									{#if errors.regime_altro}
										<p class="mt-1 text-xs font-semibold text-red-700">{errors.regime_altro}</p>
									{/if}
								</div>
							{/if}
						</div>
					</div>

					<!-- 3. Allergie, Condizioni Cliniche e Intolleranze -->
					<div
						class="rounded-xl border border-emerald-200/80 bg-white/95 p-5 shadow-2xs"
						data-field-id="allergie_presenti"
					>
						<h4 class="mb-1 flex items-center gap-2 text-base font-bold text-secondary">
							<span>⚠️</span> Allergie, Condizioni Cliniche, e Intolleranze Metaboliche o da Contatto
						</h4>
						<p class="mb-3 text-xs text-gray-600">
							Hai allergie o intolleranze diagnosticate che vorresti condividere con noi?
						</p>

						<div class="mb-4">
							<div
								class="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2 {errors.allergie_presenti
									? 'rounded-xl ring-2 ring-red-600 ring-offset-2'
									: ''}"
							>
								<label
									class="flex min-h-13 cursor-pointer items-center gap-2.5 rounded-xl border-2 p-3 font-bold transition {allergiePresenti ===
									'no'
										? 'border-emerald-500 bg-emerald-50 text-emerald-950'
										: 'border-gray-200 bg-white text-gray-800 hover:border-emerald-400'}"
								>
									<input
										type="radio"
										name="allergie_presenti"
										value="no"
										bind:group={allergiePresenti}
										onchange={() => {
											clearFieldError('allergie_presenti');
											clearFieldError('allergie_elenco');
											clearFieldError('allergie_gravita');
											clearFieldError('allergie_precauzioni');
										}}
										class="radio radio-primary radio-sm border-gray-400 bg-white checked:border-primary"
									/>
									<span>🟢 No, non ho alcuna allergia o intolleranza</span>
								</label>

								<label
									class="flex min-h-13 cursor-pointer items-center gap-2.5 rounded-xl border-2 p-3 font-bold transition {allergiePresenti ===
									'si'
										? 'border-primary bg-red-50/40 text-secondary'
										: 'border-gray-200 bg-white text-gray-800 hover:border-primary'}"
								>
									<input
										type="radio"
										name="allergie_presenti"
										value="si"
										bind:group={allergiePresenti}
										onchange={() => clearFieldError('allergie_presenti')}
										class="radio radio-primary radio-sm border-gray-400 bg-white checked:border-primary"
									/>
									<span>🔴 Sì, ho una o più allergie / intolleranze / criticità</span>
								</label>
							</div>
							{#if errors.allergie_presenti}
								<p class="mt-1.5 text-xs font-semibold text-red-700">{errors.allergie_presenti}</p>
							{/if}
						</div>

						{#if allergiePresenti === 'si'}
							<div class="space-y-4 rounded-xl border border-red-200 bg-red-50/40 p-4">
								<div data-field-id="allergie_elenco">
									<label
										for="input-allergie-elenco"
										class="mb-1 block text-xs font-bold text-secondary"
									>
										Indica specificamente allergie, intolleranze o patologie metaboliche:
									</label>
									<textarea
										id="input-allergie-elenco"
										rows="2"
										bind:value={allergieElenco}
										oninput={() => clearFieldError('allergie_elenco')}
										placeholder="Es. Sensibilità al glutine, allergia alle arachidi/frutta a guscio, favismo (deficit G6PD), intolleranza severa al lattosio, crostacei, diabete tipo 1..."
										class="textarea textarea-bordered w-full rounded-lg bg-white text-xs text-gray-900 sm:text-sm {errors.allergie_elenco
											? 'border-red-600 ring-1 ring-red-600'
											: 'border-red-300'}"></textarea>
									<span class="mt-0.5 block text-[11px] text-gray-600">
										Inserisci ogni condizione alimentare rilevante per permetterci di coordinare i
										menu speciali con la mensa e i catering.
									</span>
									{#if errors.allergie_elenco}
										<p class="mt-1 text-xs font-semibold text-red-700">{errors.allergie_elenco}</p>
									{/if}
								</div>

								<div data-field-id="allergie_gravita">
									<label
										for="select-allergie-gravita"
										class="mb-1 block text-xs font-bold text-secondary"
									>
										Livello di gravità massimo delle reazioni:
									</label>
									<select
										id="select-allergie-gravita"
										bind:value={allergieGravita}
										onchange={() => clearFieldError('allergie_gravita')}
										class="select select-bordered min-h-11 w-full rounded-lg bg-white text-xs text-gray-900 sm:text-sm {errors.allergie_gravita
											? 'border-red-600 ring-1 ring-red-600'
											: 'border-red-300'}"
									>
										<option value="" disabled>Seleziona il livello di gravità</option>
										<option value="lieve"
											>Lieve (es. sintomi lievi, fastidio gastrico o cutaneo contenuto)</option
										>
										<option value="moderata"
											>Moderata (es. reazioni gastrointestinali o eruzioni cutanee significative,
											necessità antistaminico/cortisone)</option
										>
										<option value="grave_anafilassi"
											>Grave / Rischio Shock Anafilattico (es. edema della glottide, porto con me
											autoiniettore di adrenalina tipo Fastjekt/Jext)</option
										>
									</select>
									{#if errors.allergie_gravita}
										<p class="mt-1 text-xs font-semibold text-red-700">{errors.allergie_gravita}</p>
									{/if}
								</div>

								<div data-field-id="allergie_precauzioni">
									<label
										for="textarea-allergie-precauzioni"
										class="mb-1 block text-xs font-bold text-secondary"
									>
										Dettagli specifici o precauzioni vitali richieste (es. anche inalazione o
										traccia, no contaminazione incrociata):
									</label>
									<textarea
										id="textarea-allergie-precauzioni"
										rows="2"
										bind:value={allergiePrecauzioni}
										oninput={() => clearFieldError('allergie_precauzioni')}
										placeholder="Descrivi brevemente come gestire le situazioni di emergenza o precauzioni con i catering (o scrivi 'Nessuna precauzione speciale')..."
										class="textarea textarea-bordered w-full rounded-lg bg-white text-xs text-gray-900 sm:text-sm {errors.allergie_precauzioni
											? 'border-red-600 ring-1 ring-red-600'
											: 'border-red-300'}"></textarea>
									{#if errors.allergie_precauzioni}
										<p class="mt-1 text-xs font-semibold text-red-700">
											{errors.allergie_precauzioni}
										</p>
									{/if}
								</div>
							</div>
						{/if}
					</div>

					<!-- 4. Altre Note Sanitarie (Facoltativo) -->
					<div class="rounded-xl border border-emerald-200/80 bg-white/95 p-5 shadow-2xs">
						<h4 class="mb-1 flex items-center gap-2 text-base font-bold text-secondary">
							<span>🩺</span> Altre Note Sanitarie o Condizioni Mediche (Facoltativo / Spazio Aperto)
						</h4>
						<p class="mb-2 text-xs text-gray-600">
							Uno spazio riservato e tutelato dove puoi segnalare liberamente qualsiasi condizione
							medica, terapia in corso, farmaci salvavita o situazione clinica (es. patologie
							cardiache, epilessia, ecc.) che ritieni utile far sapere al CO per garantirti piena
							tutela e sicurezza durante l'evento.
						</p>
						<textarea
							aria-label="Altre note sanitarie o condizioni mediche facoltative"
							rows="2"
							bind:value={noteSanitarie}
							placeholder="Qualsiasi nota medica o sanitaria facoltativa che desideri condividere con il CO in via confidenziale."
							class="textarea textarea-bordered w-full rounded-xl border-gray-300 bg-white text-xs text-gray-900 sm:text-sm"
						></textarea>
					</div>

					<!-- 5. Accessibilità (Facoltativo) -->
					<div class="rounded-xl border border-emerald-200/80 bg-white/95 p-5 shadow-2xs">
						<h4 class="mb-2 flex items-center gap-2 text-base font-bold text-secondary">
							<svg
								class="h-5 w-5 shrink-0 text-blue-700"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z"
								/>
							</svg>
							Accessibilità e altro (Facoltativo / Spazio Aperto)
						</h4>
						<label
							for="textarea-accessibilita"
							class="mb-1 block text-xs leading-relaxed font-bold text-gray-800"
						>
							Hai qualche necessità che senti il bisogno di condividere con il CO per permetterci di
							farti sentire pienamente a tuo agio?
						</label>
						<p class="mb-3 text-xs text-gray-500">
							Puoi specificare eventuali disabilità motorie (sedia a rotelle, percorsi senza
							barriere, piano terra), ausili visivi o uditivi, DSA (Disturbi Specifici
							dell'Apprendimento), oppure esigenze legate a situazioni particolari come
							claustrofobia, agorafobia, sovraccarico sensoriale o qualsiasi altra richiesta
							logistica.
						</p>
						<textarea
							id="textarea-accessibilita"
							rows="3"
							bind:value={accessibilita}
							placeholder="Es. necessità di percorsi accessibili senza scale, claustrofobia negli ascensori, necessità di pause sensoriali, DSA per slide o materiali..."
							class="textarea textarea-bordered w-full rounded-xl border-blue-300 bg-white text-xs text-gray-900 sm:text-sm"
						></textarea>
					</div>
				</div>

				<!-- Avvertenza di Responsabilità -->
				<div
					class="mt-6 flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50/80 p-3.5 text-xs text-amber-950 shadow-2xs"
				>
					<span class="shrink-0 text-sm font-black text-amber-700">❗</span>
					<div>
						<strong>Avvertenza di Responsabilità &amp; Correttezza:</strong> Ricordiamo che, in base
						ai criteri di selezione ufficiali CISF27,
						<em
							>qualsiasi dichiarazione non veritiera o mendace comporterà l'immediato e irrevocabile
							rigetto della candidatura</em
						>. Se durante la compilazione o dopo l'invio ti accorgi di aver commesso un errore
						materiale involontario, contatta tempestivamente il CO all'indirizzo
						<a
							href={`mailto:${contactEmail}`}
							class="font-bold text-secondary underline hover:text-primary">{contactEmail}</a
						>
						per rettificare i dati!
					</div>
				</div>

				{#if stepErrorBanner}
					<div
						role="alert"
						class="mt-5 flex items-start gap-2.5 rounded-xl border border-red-300 bg-red-50 p-3.5 text-xs font-semibold text-red-900"
					>
						<AlertTriangle class="mt-0.5 size-4 shrink-0 text-red-700" />
						<span>{stepErrorBanner}</span>
					</div>
				{/if}

				<div class="mt-8 flex flex-wrap items-center justify-between gap-3">
					<button
						type="button"
						onclick={() => goToStep(3)}
						class="btn min-h-12 rounded-xl border border-gray-300 bg-white px-5 text-xs font-bold text-gray-700 hover:bg-gray-100"
					>
						<ArrowLeft class="size-4" />
						Indietro: Temi &amp; Fisse
					</button>
					<button
						type="button"
						onclick={() => goToStep(5)}
						class="btn btn-primary min-h-12 rounded-xl px-6 text-sm font-bold text-white shadow-md"
					>
						Continua: Commento &amp; Invio
						<ArrowRight class="size-4" />
					</button>
				</div>
			</div>
		{/if}

		<!-- =================================================================== -->
		<!-- SCHERMATA 6 / STEP 5: REVISIONE FINALE, CONSENSI & INVIO            -->
		<!-- =================================================================== -->
		{#if showWizard && currentStep === 5}
			<div class="rounded-2xl border border-primary/20 bg-base-100 shadow-lg mb-8 p-5 sm:p-10">
				<div class="mb-6 flex items-center gap-3">
					<div
						class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-sm font-bold text-red-900"
					>
						06
					</div>
					<div>
						<h2 class="font-playfair-display text-2xl font-bold text-secondary sm:text-3xl">
							Commento Finale &amp; Invio Candidatura
						</h2>
						<p class="text-xs text-gray-600 sm:text-sm">
							Uno spazio tutto tuo prima di sigillare la candidatura
						</p>
					</div>
				</div>

				<!-- COMMENTO FINALE CON CONTATORE CARATTERI -->
				<div class="mb-6 rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
					<div class="mb-1 flex items-center justify-between gap-2">
						<label for="final-comment-input" class="block text-xs font-bold text-secondary">
							Commento finale libero per il Comitato Organizzatore (Facoltativo)
						</label>
						<span class="font-mono text-[11px] text-gray-600">
							{commentoFinale.length} / 670
						</span>
					</div>
					<p class="mb-2 text-[11px] text-gray-600">
						Usa questo spazio per specificare qualsiasi dettaglio aggiuntivo, o semplicemente per un
						saluto, un consiglio, un meme, una battuta o qualsiasi cosa tu voglia dire ai regaz del
						CO di Bologna!
					</p>
					<textarea
						id="final-comment-input"
						rows="3"
						maxlength="670"
						bind:value={commentoFinale}
						placeholder="Scrivi qui il tuo messaggio..."
						class="textarea textarea-bordered w-full rounded-xl border-amber-300 bg-white text-xs text-gray-900 sm:text-sm"
					></textarea>
				</div>

				<!-- RIEPILOGO DINAMICO DEI DATI -->
				<div class="mb-6 rounded-2xl border border-gray-200 bg-gray-50 p-4 sm:p-5">
					<h3
						class="mb-3 flex items-center gap-2 text-xs font-bold tracking-wider text-gray-600 uppercase"
					>
						<span>📋</span> Mini-Riepilogo della Candidatura
					</h3>
					<div class="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
						<div class="rounded-xl border border-gray-200 bg-white p-3">
							<span class="block text-[10px] font-medium text-gray-400 uppercase"
								>Candidatə &amp; Contatto</span
							>
							<strong class="text-sm text-secondary">
								{nome || '—'}
								{cognome || ''}
							</strong>
							<div class="mt-0.5 text-[11px] text-gray-600">
								{email || '—'} • CF: <span class="font-mono">{codiceFiscale || '—'}</span>
							</div>
						</div>

						<div class="rounded-xl border border-gray-200 bg-white p-3">
							<span class="block text-[10px] font-medium text-gray-400 uppercase"
								>Tipologia Quota Richiesta</span
							>
							<strong class="text-sm text-secondary">{summaryQuotaText}</strong>
						</div>

						<div class="rounded-xl border border-gray-200 bg-white p-3">
							<span class="block text-[10px] font-medium text-gray-400 uppercase"
								>Motivazione Creativa</span
							>
							<strong class="text-sm text-secondary">
								{#if motivazioneFile}
									📎 {motivazioneFile.name} ({formatBytesToMB(motivazioneFile.size)} MB)
								{:else if linkProgetto.trim()}
									🔗 Link esterno fornito
								{:else if isAutoAdmissionRole}
									✨ Facoltativa (ruolo ad ammissione automatica)
								{:else}
									⚠️ Non ancora caricata
								{/if}
							</strong>
						</div>

						<div class="rounded-xl border border-gray-200 bg-white p-3">
							<span class="block text-[10px] font-medium text-gray-400 uppercase"
								>Proposta Parallel / Talk</span
							>
							<strong class="text-sm text-secondary">{summaryParallelText}</strong>
						</div>

						<div class="rounded-xl border border-gray-200 bg-white p-3 sm:col-span-2">
							<span class="block text-[10px] font-medium text-gray-400 uppercase"
								>Top 3 Aree Tematiche Visite</span
							>
							<div class="mt-1 flex flex-wrap gap-1.5">
								{#each displayedAreas.slice(0, 3) as area, i (area.id)}
									<span
										class="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-secondary"
									>
										{i + 1}° {area.icon}
										{area.name}
									</span>
								{/each}
							</div>
						</div>
					</div>
				</div>

				<!-- COSA ACCADRÀ DOPO L'INVIO -->
				<div class="mb-6 space-y-3 rounded-2xl border border-gray-200 bg-white p-5">
					<h4 class="text-xs font-bold tracking-wider text-gray-500 uppercase">
						Cosa accadrà dopo l'invio?
					</h4>
					<div class="grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
						<div class="flex items-start gap-2">
							<span
								class="bg-primary text-primary-content flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
								>1</span
							>
							<span
								>Riceverai una <strong>mail di conferma</strong> con il codice ricevuta univoco, il riepilogo
								delle risposte e l'impronta SHA-256 degli allegati.</span
							>
						</div>
						<div class="flex items-start gap-2">
							<span
								class="bg-primary text-primary-content flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
								>2</span
							>
							<span
								>A <strong>gennaio 2027</strong> riceverai la comunicazione ufficiale dell'esito (selezionatə
								o lista d'attesa).</span
							>
						</div>
						<div class="flex items-start gap-2">
							<span
								class="bg-primary text-primary-content flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
								>3</span
							>
							<span
								>In caso di esito positivo avrai <strong>7 giorni</strong> per regolarizzare il pagamento
								della quota e preparare lo zaino per Bologna!</span
							>
						</div>
					</div>
				</div>

				<!-- Avvertenza di Responsabilità -->
				<div
					class="mb-6 flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50/80 p-3.5 text-xs text-amber-950 shadow-2xs"
				>
					<span class="shrink-0 text-sm font-black text-amber-700">❗</span>
					<div>
						<strong>Avvertenza di Responsabilità &amp; Correttezza:</strong> Ricordiamo che, in base
						ai criteri di selezione ufficiali CISF27,
						<em
							>qualsiasi dichiarazione non veritiera o mendace comporterà l'immediato e irrevocabile
							rigetto della candidatura</em
						>. Se durante la compilazione o dopo l'invio ti accorgi di aver commesso un errore
						materiale involontario, contatta tempestivamente il CO all'indirizzo
						<a
							href={`mailto:${contactEmail}`}
							class="font-bold text-secondary underline hover:text-primary">{contactEmail}</a
						>
						per rettificare i dati!
					</div>
				</div>

				<!-- 3 CONSENSI FINALI OBBLIGATORI -->
				<div
					class="mb-6 space-y-3 rounded-xl border border-gray-200 bg-white p-4 text-xs shadow-2xs"
				>
					<div data-field-id="check_privacy">
						<label
							class="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg p-2 {errors.check_privacy
								? 'bg-red-50 ring-1 ring-red-600'
								: ''}"
						>
							<input
								type="checkbox"
								id="check-privacy"
								bind:checked={checkPrivacy}
								onchange={() => clearFieldError('check_privacy')}
								class="checkbox checkbox-primary checkbox-sm mt-0.5 border-gray-400 bg-white checked:border-primary checked:bg-primary"
							/>
							<span class="leading-relaxed text-gray-800">
								Dichiaro di aver preso visione dell'<strong
									>Informativa sul Trattamento dei Dati Personali di AISF</strong
								>
								(ai sensi dell'art. 13 del Regolamento UE 2016/679 - GDPR) reperibile su
								<a
									href="https://ai-sf.it/Informativa_Privacy_AISF.pdf"
									target="_blank"
									rel="noopener noreferrer"
									class="font-bold text-primary underline">ai-sf.it/Informativa_Privacy_AISF.pdf</a
								>
								e acconsento al trattamento dei dati ai soli fini della selezione e gestione della CISF27.
							</span>
						</label>
						{#if errors.check_privacy}
							<p class="mt-1 pl-2 text-xs font-semibold text-red-700">{errors.check_privacy}</p>
						{/if}
					</div>

					<div data-field-id="check_veridicita">
						<label
							class="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg p-2 {errors.check_veridicita
								? 'bg-red-50 ring-1 ring-red-600'
								: ''}"
						>
							<input
								type="checkbox"
								id="check-veridicita"
								bind:checked={checkVeridicita}
								onchange={() => clearFieldError('check_veridicita')}
								class="checkbox checkbox-primary checkbox-sm mt-0.5 border-gray-400 bg-white checked:border-primary checked:bg-primary"
							/>
							<span class="leading-relaxed text-gray-800">
								<strong>Certificazione di Veridicità:</strong> Dichiaro sotto la mia responsabilità
								che tutte le informazioni riportate in questo modulo corrispondono al vero. Sono
								consapevole che
								<em
									>dichiarazioni mendaci comporteranno l'immediata ed irrevocabile esclusione da
									CISF27</em
								>
								e la segnalazione ai sensi del
								<a
									href={`${criteriPageUrl}#codice-etico`}
									target="_blank"
									rel="noopener noreferrer"
									onclick={(e) => e.stopPropagation()}
									class="font-bold text-primary underline">codice etico associativo</a
								>.
							</span>
						</label>
						{#if errors.check_veridicita}
							<p class="mt-1 pl-2 text-xs font-semibold text-red-700">{errors.check_veridicita}</p>
						{/if}
					</div>

					<div data-field-id="check_pagamento">
						<label
							class="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg p-2 {errors.check_pagamento
								? 'bg-red-50 ring-1 ring-red-600'
								: ''}"
						>
							<input
								type="checkbox"
								id="check-pagamento"
								bind:checked={checkPagamento}
								onchange={() => clearFieldError('check_pagamento')}
								class="checkbox checkbox-primary checkbox-sm mt-0.5 border-gray-400 bg-white checked:border-primary checked:bg-primary"
							/>
							<span class="leading-relaxed text-gray-800">
								Prendo atto che, qualora selezionatə,
								<strong
									>dovrò effettuare il pagamento della quota entro e non oltre una settimana dalla
									comunicazione del CO</strong
								>, se pertinente contestualmente alla regolarizzazione della quota associativa AISF.
								<strong>Le quote versate non sono in nessun caso rimborsabili</strong>. In caso di
								mancato pagamento, il posto verrà riassegnato tramite l'unico ripescaggio ufficiale.
							</span>
						</label>
						{#if errors.check_pagamento}
							<p class="mt-1 pl-2 text-xs font-semibold text-red-700">{errors.check_pagamento}</p>
						{/if}
					</div>
				</div>

				<!-- PROGRESS BAR DURANTE INVIO -->
				{#if submitting}
					<div
						class="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-950 shadow-xs"
						role="status"
						aria-live="polite"
					>
						<div class="mb-2 flex items-center gap-2 font-bold">
							<span class="loading loading-spinner loading-sm text-primary"></span>
							<span
								>{submitStage ||
									'Caricamento allegati e registrazione in corso... non chiudere la pagina'}</span
							>
						</div>
						<progress
							class="progress progress-primary w-full bg-amber-200/70"
							value={submitProgress}
							max="100"
						></progress>
					</div>
				{/if}

				<!-- ERRORE DI VALIDAZIONE STEP -->
				{#if stepErrorBanner}
					<div
						role="alert"
						class="mb-5 flex items-start gap-2.5 rounded-xl border border-red-300 bg-red-50 p-3.5 text-xs font-semibold text-red-900"
					>
						<AlertTriangle class="mt-0.5 size-4 shrink-0 text-red-700" />
						<span>{stepErrorBanner}</span>
					</div>
				{/if}

				<!-- ERRORE DI INVIO DAL SERVER -->
				{#if submitError}
					<div
						role="alert"
						class="mb-6 rounded-2xl border-2 border-red-400 bg-red-50 p-5 text-xs text-red-950 shadow-sm"
					>
						<div class="mb-2 flex items-center gap-2 text-sm font-extrabold text-red-800">
							<AlertTriangle class="size-5 shrink-0" />
							Invio non completato — i tuoi dati sono al sicuro!
						</div>
						<p class="leading-relaxed">{submitError}</p>
						<p class="mt-2 text-red-900">
							Se il problema persiste, scrivi subito al Comitato Organizzatore all'indirizzo
							<a href={`mailto:${contactEmail}`} class="font-bold underline">{contactEmail}</a>
							indicando questo messaggio di errore.
						</p>
						<div class="mt-3">
							<button
								type="button"
								onclick={handleFinalSubmit}
								disabled={submitting}
								class="btn btn-sm btn-error min-h-11 rounded-xl font-bold text-white"
							>
								<RotateCcw class="size-4" />
								Riprova invio
							</button>
						</div>
					</div>
				{/if}

				<div bind:this={turnstileContainerEl} class="my-2 flex justify-center"></div>

				<div class="flex flex-wrap items-center justify-between gap-3 pt-2">
					<button
						type="button"
						disabled={submitting}
						onclick={() => goToStep(4)}
						class="btn min-h-12 rounded-xl border border-gray-300 bg-white px-5 text-xs font-bold text-gray-700 hover:bg-gray-100"
					>
						<ArrowLeft class="size-4" />
						Indietro: Logistica Safe
					</button>

					<button
						type="button"
						disabled={submitting}
						onclick={handleFinalSubmit}
						class="btn from-primary via-accent to-warning text-primary-content min-h-13 rounded-xl border-0 bg-linear-to-r px-8 text-sm font-extrabold shadow-lg transition hover:opacity-95 hover:shadow-xl disabled:opacity-60 sm:text-base"
					>
						{#if submitting}
							<span class="loading loading-spinner loading-sm"></span>
							<span>Invio in corso...</span>
						{:else}
							<span>🚀 Invia Candidatura Ufficiale CISF27</span>
						{/if}
					</button>
				</div>
			</div>
		{/if}
	</main>

	<!-- =================================================================== -->
	<!-- MODAL DI SUCCESSO (SOLO DOPO CONFERMA REALE DAL SERVER APPS SCRIPT) -->
	<!-- =================================================================== -->
	{#if successReceipt}
		<div
			class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
			role="dialog"
			aria-modal="true"
			aria-labelledby="modal-success-title"
		>
			<div
				class="border-primary/20 bg-base-100 max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border p-6 text-center shadow-2xl sm:p-8"
			>
				{#if successReceipt.isTest}
					<div
						class="mb-4 rounded-xl border border-purple-300 bg-purple-50 px-3.5 py-2.5 text-xs font-semibold text-purple-950"
					>
						🧪 Invio registrato nell'archivio di prova (<code>TEST_ISCRIZIONI</code>) — non vale
						come candidatura ufficiale.
					</div>
				{/if}
				<div
					class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl text-emerald-700"
				>
					✓
				</div>
				<h3
					id="modal-success-title"
					class="font-playfair-display mb-2 text-2xl font-extrabold text-gray-900"
				>
					Candidatura Registrata con Successo!
				</h3>
				<p class="mb-4 text-xs leading-relaxed text-gray-600 sm:text-sm">
					Grazie per aver inviato la tua candidatura per <strong
						>{conferenceTitle} {conferenceLocation}</strong
					>! Conserva il tuo codice ricevuta univoco qui sotto:
				</p>

				<!-- CODICE RICEVUTA UNIVOCO CISF27-XXX -->
				<div
					class="mb-4 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-emerald-400 bg-emerald-50 p-4"
				>
					<span class="text-[11px] font-bold tracking-wider text-emerald-800 uppercase">
						Codice Ricevuta Ufficiale
					</span>
					<div class="flex items-center gap-2">
						<span class="font-mono text-2xl font-extrabold tracking-widest text-secondary">
							{successReceipt.candidateId}
						</span>
						<button
							type="button"
							onclick={() => successReceipt && copyReceiptId(successReceipt.candidateId)}
							class="btn btn-xs min-h-9 border border-emerald-300 bg-white text-emerald-900 hover:bg-emerald-100"
							title="Copia codice ricevuta"
						>
							{#if copiedReceipt}
								<Check class="size-3.5 text-emerald-700" />
								Copiato!
							{:else}
								<Copy class="size-3.5" />
								Copia
							{/if}
						</button>
					</div>
				</div>

				{#if successReceipt.filesSaved.length > 0}
					<div
						class="mb-4 rounded-xl border border-gray-200 bg-gray-50 p-3 text-left text-[11px] text-gray-700"
					>
						<div class="mb-1.5 font-bold text-secondary">
							📦 File archiviati sui server AISF (prova SHA-256):
						</div>
						<ul class="space-y-1.5">
							{#each successReceipt.filesSaved as f (f.anonName)}
								<li class="rounded-lg border border-gray-200 bg-white p-2">
									<div class="font-bold text-gray-900">
										{f.originalName} ({f.sizeMB} MB)
									</div>
									<div class="text-[10px] text-emerald-800">
										Archiviato in anonimo come <code>{f.anonName}</code>
									</div>
									<div class="mt-0.5 font-mono text-[10px] break-all text-gray-500">
										SHA-256: {f.sha256}
									</div>
								</li>
							{/each}
						</ul>
					</div>
				{/if}

				{#if !successReceipt.emailSent}
					<div
						class="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-left text-xs text-amber-950"
					>
						<strong>Nota email:</strong> la tua candidatura è stata
						<strong>regolarmente salvata</strong>, ma l'invio automatico dell'email di riepilogo ha
						riscontrato un ritardo ({successReceipt.emailWarning ?? 'quota temporanea'}). Fai uno
						screenshot di questo codice ricevuta <strong>{successReceipt.candidateId}</strong>!
					</div>
				{/if}

				<div
					class="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-left text-xs leading-relaxed text-amber-950"
				>
					<strong>Cosa succede ora?</strong>
					<ul class="mt-1 list-inside list-disc space-y-1 text-gray-700">
						<li>
							Il Comitato Organizzatore valuterà le motivazioni con la massima anonimizzazione
							possibile e in doppio cieco ove applicabile (con riassegnazione a revisore terzo
							indipendente qualora sussista conoscenza diretta del candidato).
						</li>
						<li>Gli esiti ufficiali verranno comunicati via email a tuttə i candidatə.</li>
						<li>
							Le persone ammesse avranno <strong>1 settimana di tempo</strong> per completare il versamento
							della quota di iscrizione.
						</li>
						<li>Ci sarà un unico ripescaggio ufficiale per gli eventuali posti non confermati.</li>
					</ul>
				</div>

				<button
					type="button"
					onclick={closeSuccessAndRestart}
					class="btn btn-primary min-h-12 w-full rounded-xl text-xs font-bold text-white"
				>
					Chiudi e Torna all'Inizio
				</button>
			</div>
		</div>
	{/if}

	<!-- =================================================================== -->
	<!-- MODAL CRITERI DI SELEZIONE PUBBLICI & CODICE ETICO AISF             -->
	<!-- =================================================================== -->
	{#if showCriteriModal}
		<div
			class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
			role="dialog"
			aria-modal="true"
			aria-labelledby="modal-criteri-title"
		>
			<div
				class="border-primary/20 bg-base-100 max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border p-6 shadow-2xl sm:p-8"
			>
				<div class="mb-4 flex items-center justify-between border-b border-gray-200 pb-4">
					<div class="flex items-center gap-3">
						<div
							class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-sm font-bold text-amber-800"
						>
							⚖️
						</div>
						<div>
							<h3
								id="modal-criteri-title"
								class="font-playfair-display text-xl font-bold text-secondary"
							>
								Criteri di Selezione Pubblici &amp; Codice Etico AISF
							</h3>
							<p class="text-[11px] text-gray-500">
								Documento Ufficiale approvato dal CO CISF27 e dal Comitato Esecutivo (EC)
							</p>
						</div>
					</div>
					<button
						type="button"
						onclick={() => (showCriteriModal = false)}
						aria-label="Chiudi finestra criteri"
						class="btn btn-sm btn-ghost min-h-10 min-w-10 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200"
					>
						✕
					</button>
				</div>

				<div class="space-y-4 text-xs leading-relaxed text-gray-700 sm:text-sm">
					<div class="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-amber-950">
						<strong>Disponibilità Pubblica Fuori dal Form:</strong> Questa sezione è accessibile
						liberamente a tuttə sulla pagina dedicata (<a
							href={criteriPageUrl}
							target="_blank"
							rel="noopener noreferrer"
							class="font-bold text-secondary underline">{criteriPublicUrlLabel}</a
						>) e i documenti completi in PDF (Criteri di Selezione e Codice Etico) sono scaricabili
						direttamente senza necessità di accedere al modulo di iscrizione.
					</div>

					<h4
						class="font-playfair-display border-b border-gray-100 pt-2 text-base font-bold text-secondary"
					>
						1. Informazioni Generali CISF27
					</h4>
					<p>
						{conferenceTitle} si terrà a {conferenceLocation} (<strong>{conferenceDates}</strong>) e
						ospiterà 170 partecipanti (+ membri del Comitato Organizzatore): 150 con alloggio
						garantito presso il
						<strong>{accommodationName}</strong> (ostello con camere doppie, triple e quadruple, tutte
						con bagno privato) e 20 con alloggio autonomo a tariffa agevolata, di cui 5 Ausiliari dell'LC
						Bologna con posto garantito, selezionatə tramite un concorso a parte.
					</p>
					<p>
						La Conferenza sarà interamente tenuta in lingua italiana e non saranno disponibili
						traduzioni, per cui <strong>è richiesta ed essenziale un'ottima padronanza</strong>
						(almeno passiva) <strong>dell'italiano</strong> per partecipare.
					</p>

					<h4
						class="font-playfair-display border-b border-gray-100 pt-2 text-base font-bold text-secondary"
					>
						2. Aventi Diritto &amp; Criteri per i Comitati Locali
					</h4>
					<ul class="list-inside list-disc space-y-1 pl-2">
						<li>
							<strong>Ammissione automatica:</strong> membri del Comitato Organizzatore (CO), Comitato
							Esecutivo (EC) AISF, Presidenti dei Comitati Locali (LC), fino a 5 membri della commissione
							Fisicaffè decisi da EC, e la persona vincitrice dell'Open Call della Redazione di Fisicaffè*.
						</li>
						<li>
							<strong>Rappresentanza minima LC:</strong> ogni Comitato Locale ha garantita una quota
							minima di <strong>5 partecipanti</strong> (Presidente compresə).
						</li>
						<li>
							<strong>Sostegno a CISF28:</strong> al Comitato Locale di <em>AISF Calabria</em> sono
							riservati almeno <strong>8 posti</strong> a supporto dell'organizzazione della successiva
							edizione.
						</li>
						<li>
							<strong>Criterio di Proporzionalità:</strong> per assegnare i posti oltre la quota
							minima per ciascun LC, uno dei criteri principali sarà la
							<strong>stretta proporzionalità basata sul numero di candidature presentate</strong>
							da quel comitato.
						</li>
						<li>
							<strong>Parità di genere:</strong> il CO si impegna attivamente a raggiungere la parità
							di genere tra i partecipanti selezionati.
						</li>
					</ul>
					<p class="-mt-2 text-[11px] font-semibold text-secondary italic">
						* La persona vincitrice dell'Open Call della Redazione di Fisicaffè riceverà d'ufficio
						un posto a CISF non conteggiato nei 170 partecipanti.
					</p>

					<h4
						class="font-playfair-display border-b border-gray-100 pt-2 text-base font-bold text-secondary"
					>
						3. Cause di Rigetto della Candidatura
					</h4>
					<ul class="list-inside list-disc space-y-1 pl-2 text-red-900">
						<li>
							Motivazione (in qualsiasi formato) redatta con chiaro ed evidente utilizzo passivo di
							Intelligenza Artificiale (IA) privo di apporto personale.
						</li>
						<li>
							Dichiarazioni mendaci, false o distorte su anagrafica, ruoli, attività nel proprio LC
							o partecipazioni pregresse.
						</li>
						<li>Mancata regolarizzazione dell'iscrizione ad AISF entro i termini del pagamento.</li>
						<li>
							Contenuti in contrasto con lo statuto AISF, messaggi d'odio, discriminatori o contrari
							al Codice Etico.
						</li>
					</ul>

					<h4
						class="font-playfair-display border-b border-gray-100 pt-2 text-base font-bold text-secondary"
					>
						4. Quote, Pagamenti &amp; Politica Rimborsi
					</h4>
					<p>
						Il pagamento della quota dovrà essere effettuato entro e non oltre 1 settimana dalla
						comunicazione dell'esito. In caso di mancato pagamento, il posto verrà riassegnato
						nell'unico ripescaggio ufficiale.
						<strong
							>In nessun caso la quota di partecipazione e l'iscrizione ad AISF possono essere
							rimborsate</strong
						>
						<em
							>(in caso di abbandoni, il CO potrà al più agevolare il contatto con persone in
							graduatoria di ripescaggio, ma AISF non effettua rimborsi)</em
						>.
					</p>

					<h4
						class="font-playfair-display border-b border-gray-100 pt-2 text-base font-bold text-secondary"
					>
						5. Codice Etico &amp; Safe Space AISF
					</h4>
					<p>
						Ogni partecipante ha diritto a un ambiente inclusivo, accogliente e sicuro. Il
						<a
							href={`${criteriPageUrl}#codice-etico`}
							target="_blank"
							rel="noopener noreferrer"
							class="font-bold text-primary underline">Codice Etico di CISF27</a
						>
						(inclusività, Safe Space, no sponsor dall'industria bellica/armi, sostenibilità
						<em>#Plastic-freER</em>, apartiticità e trasparenza) è consultabile pubblicamente e
						scaricabile in PDF sul sito ufficiale della conferenza. Per qualsiasi segnalazione sono
						a disposizione i canali confidenziali dei Coordinatori Generali.
					</p>

					<h4
						class="font-playfair-display border-b border-gray-100 pt-2 text-base font-bold text-secondary"
					>
						6. Clausola di Salvaguardia
					</h4>
					<p>
						Per tutti i punti indicati nei criteri, il Comitato Organizzatore si avvale della
						facoltà di effettuare eventuali aggiustamenti tecnici o organizzativi resisi necessari,
						rimanendo il più possibile fedele alle disposizioni stabilite.
					</p>
				</div>

				<div
					class="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 pt-4"
				>
					<div class="flex flex-wrap items-center gap-2">
						<a
							href={criteriPdfUrl}
							target="_blank"
							rel="noopener noreferrer"
							class="btn btn-primary btn-sm min-h-11 rounded-xl text-xs font-bold text-white"
						>
							Scarica PDF Ufficiale dei Criteri
						</a>
						<a
							href={codiceEticoPdfUrl}
							target="_blank"
							rel="noopener noreferrer"
							class="btn btn-secondary btn-sm min-h-11 rounded-xl text-xs font-bold text-white"
						>
							Scarica PDF Codice Etico
						</a>
						<a
							href={criteriPageUrl}
							target="_blank"
							rel="noopener noreferrer"
							class="btn btn-primary btn-soft btn-sm border-primary/30 text-secondary hover:text-primary-content min-h-11 rounded-xl text-xs font-bold"
						>
							Pagina Criteri &amp; Etica
						</a>
					</div>
					<button
						type="button"
						onclick={() => (showCriteriModal = false)}
						class="btn btn-sm min-h-11 rounded-xl border border-gray-300 bg-white text-xs font-bold text-gray-700 hover:bg-gray-100"
					>
						Chiudi Finestra
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>
