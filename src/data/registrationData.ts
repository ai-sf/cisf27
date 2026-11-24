export interface StepMeta {
	index: number;
	number: number;
	shortLabel: string;
	fullLabel: string;
}

export const REGISTRATION_STEPS: readonly StepMeta[] = [
	{ index: 0, number: 1, shortLabel: 'Criteri & Quota', fullLabel: 'Criteri & Quota' },
	{ index: 1, number: 2, shortLabel: 'Presentati!', fullLabel: 'Motivazione & Talk' },
	{ index: 2, number: 3, shortLabel: 'Dati & AISF', fullLabel: 'Dati & AISF' },
	{ index: 3, number: 4, shortLabel: 'Temi & Fisse', fullLabel: 'Temi & Fisse' },
	{ index: 4, number: 5, shortLabel: 'Logistica Safe', fullLabel: 'Logistica & Benessere' },
	{ index: 5, number: 6, shortLabel: 'Riepilogo & Invio', fullLabel: 'Riepilogo & Invio' },
] as const;

export const AUTO_ADMISSION_ROLES: readonly string[] = [
	'membro_ec',
	'presidente_lc',
	'membro_fisicaffe',
] as const;

export interface SelectOption {
	value: string;
	label: string;
}

export const RUOLI_SPECIALI_OPTIONS: readonly SelectOption[] = [
	{ value: 'membro_ec', label: 'Membro di EC' },
	{ value: 'presidente_lc', label: 'Presidentə di un LC' },
	{
		value: 'membro_fisicaffe',
		label:
			'Delegatə ufficiale della Commissione Fisicaffè (seleziona SOLO SE uno dei 5 indicati da EC!)',
	},
	{
		value: 'working_group',
		label: 'Membro attivo di un Working Group (WG) nazionale AISF (da specificare in Pagina 3)',
	},
	{ value: 'nessuno', label: 'Nessun ruolo speciale nazionale / Non-iscrittə' },
] as const;

export const LIVELLI_STUDIO_OPTIONS: readonly SelectOption[] = [
	{ value: 'T1', label: 'Laurea Triennale — 1° Anno' },
	{ value: 'T2', label: 'Laurea Triennale — 2° Anno' },
	{ value: 'T3', label: 'Laurea Triennale — 3° Anno o Fuori Corso' },
	{ value: 'M1', label: 'Laurea Magistrale — 1° Anno' },
	{ value: 'M2', label: 'Laurea Magistrale — 2° Anno o Fuori Corso' },
	{ value: 'DOTT', label: 'Dottorato di Ricerca (PhD) / Post-Doc' },
	{ value: 'EST', label: 'Candidato Esterno' },
] as const;

export const COMITATI_LOCALI_OPTIONS: readonly SelectOption[] = [
	{ value: 'NESSUNO', label: 'Nessun LC (Socio individuale / In fase di costituzione)' },
	{ value: 'CALABRIA', label: 'CALABRIA (LC Organizzatore CISF28)' },
	{ value: 'BOLOGNA', label: 'BOLOGNA (LC Ospitante CISF27)' },
	{ value: 'BARI', label: 'BARI' },
	{ value: 'CATANIA', label: 'CATANIA' },
	{ value: 'FERRARA', label: 'FERRARA' },
	{ value: 'FIRENZE', label: 'FIRENZE' },
	{ value: 'MILANO BICOCCA', label: 'MILANO BICOCCA' },
	{ value: 'MILANO STATALE', label: 'MILANO STATALE' },
	{ value: 'MODENA E REGGIO EMILIA', label: 'MODENA E REGGIO EMILIA' },
	{ value: 'NAPOLI E CASERTA', label: 'NAPOLI E CASERTA' },
	{ value: 'PADOVA', label: 'PADOVA' },
	{ value: 'PALERMO', label: 'PALERMO' },
	{ value: 'PAVIA', label: 'PAVIA' },
	{ value: 'PERUGIA', label: 'PERUGIA' },
	{ value: 'PISA', label: 'PISA' },
	{ value: 'ROMA SAPIENZA', label: 'ROMA SAPIENZA' },
	{ value: 'ROMA TRE', label: 'ROMA TRE' },
	{ value: 'SALERNO', label: 'SALERNO' },
	{ value: 'TORINO', label: 'TORINO' },
	{ value: 'TRENTO', label: 'TRENTO' },
	{ value: 'TRIESTE', label: 'TRIESTE' },
] as const;

export const GASO_LABELS: readonly string[] = [
	'Mi dissocio 🧊',
	'Ci sta 👍',
	'Preso bene 🔥',
	'Bazza imperiale! 🚀',
	'Soccia che bomba! 💥',
] as const;

export const GASO_SHORT_LABELS: readonly string[] = [
	'Mi dissocio',
	'Ci sta',
	'Preso bene',
	'Bazza imperiale!',
	'Soccia che bomba!',
] as const;

export type PillarKey = 'storia' | 'energia' | 'lavoro' | 'ricerca';

export type ThematicAreaId =
	| 'part'
	| 'hpc'
	| 'astro'
	| 'env'
	| 'bio'
	| 'mat'
	| 'teo'
	| 'did'
	| 'cond'
	| 'geo_sol'
	| 'geo_atm'
	| 'geo_oce'
	| 'comp'
	| 'app';

export interface ThematicArea {
	id: ThematicAreaId;
	name: string;
	icon: string;
	badge: string;
	desc: string;
	pillarKey: PillarKey;
}

export const THEMATIC_AREAS: readonly ThematicArea[] = [
	{
		id: 'part',
		name: 'Fisica delle Particelle, Nucleare e Subnucleare',
		icon: '⚛️',
		badge: 'Alte Energie & Interazioni Fondamentali',
		desc: 'Acceleratori, rivelatori di frontiera, fisica subatomica, neutrini, materia oscura e interazioni nucleari.',
		pillarKey: 'ricerca',
	},
	{
		id: 'hpc',
		name: 'Supercalcolo (HPC), AI & Quantum Computing',
		icon: '🖥️',
		badge: 'Calcolo Avanzato & Tecnologie Quantistiche',
		desc: 'Architetture exascale, simulazioni numeriche massimamente parallele, machine learning scientifico e algoritmi quantistici.',
		pillarKey: 'lavoro',
	},
	{
		id: 'astro',
		name: 'Astronomia, Astrofisica e Cosmologia',
		icon: '🔭',
		badge: 'Cosmo, Onde Radio & Alte Energie Cosmiche',
		desc: "Osservazione multi-messaggera, radioastronomia, evoluzione galattica, buchi neri e struttura su larga scala dell'Universo.",
		pillarKey: 'ricerca',
	},
	{
		id: 'env',
		name: 'Ambiente, Sostenibilità e Clima',
		icon: '🌿',
		badge: 'Ecosistemi, Energia & Transizione Ecologica',
		desc: 'Monitoraggio ambientale, fisica per la sostenibilità, impatto antropico, cicli biogeochimici ed energie pulite.',
		pillarKey: 'energia',
	},
	{
		id: 'bio',
		name: 'Fisica Biomedica, Sanitaria e Biofisica',
		icon: '🧬',
		badge: 'Scienze della Vita & Fisica Medica',
		desc: 'Meccanismi molecolari e cellulari, diagnostica per immagini avanzata, radioterapia, adroterapia e neurofisica.',
		pillarKey: 'lavoro',
	},
	{
		id: 'mat',
		name: 'Scienza dei Materiali, Nanotecnologie e Nanoscienze',
		icon: '💎',
		badge: 'Nanostrutture, Semiconduttori & Nuovi Materiali',
		desc: 'Sintesi e caratterizzazione su scala nanometrica, film sottili, metamateriali, spintronica e materiali funzionali.',
		pillarKey: 'lavoro',
	},
	{
		id: 'teo',
		name: 'Fisica Teorica, Matematica e dei Campi',
		icon: '📐',
		badge: 'Modelli Formali, Simmetrie & Gravità',
		desc: 'QFT, fisica matematica, gravità, stringhe, topologia e struttura formale delle leggi fisiche.',
		pillarKey: 'ricerca',
	},
	{
		id: 'did',
		name: 'Didattica, Storia ed Epistemologia della Fisica',
		icon: '🏛️',
		badge: 'Fondamenti, Patrimonio & Comunicazione',
		desc: 'Evoluzione storica del pensiero scientifico, strumenti antichi, filosofia della scienza, museologia e didattica innovativa e divulgazione.',
		pillarKey: 'storia',
	},
	{
		id: 'cond',
		name: 'Fisica della Materia Condensata, Ottica e Fotonica',
		icon: '🌈',
		badge: 'Stati Quantistici della Materia & Luce',
		desc: 'Superconduttività, magnetismo, laser, ottica quantistica, gas ultrafreddi e proprietà elettroniche dei solidi.',
		pillarKey: 'ricerca',
	},
	{
		id: 'geo_sol',
		name: 'Geofisica (Planetaria) della Terra Solida e Sismologia',
		icon: '🌋',
		badge: 'Crosta, Tettonica, Vulcani & Interni Planetari',
		desc: 'Sismologia, geodinamica, deformazioni crostali, geomagnetismo, vulcanologia, rimbalzo post-glaciale ed esplorazione geofisica dei corpi rocciosi del Sistema Solare.',
		pillarKey: 'energia',
	},
	{
		id: 'geo_atm',
		name: "Geofisica (Planetaria) dell'Atmosfera e Meteorologia",
		icon: '⛈️',
		badge: 'Dinamica Atmosferica, Meteo & Atmosfere Planetarie',
		desc: 'Nubi, modelli numerici di previsione meteorologica, turbolenza atmosferica e circolazione su altri pianeti.',
		pillarKey: 'energia',
	},
	{
		id: 'geo_oce',
		name: 'Geofisica (Planetaria) degli Oceani e Fisica Marina',
		icon: '🌊',
		badge: 'Oceanografia Fisica, Correnti & Mari Planetari',
		desc: 'Circolazione termoalina, dinamica costiera e abissale, interazione oceano-atmosfera e oceani sub-superficiali delle lune ghiacciate.',
		pillarKey: 'energia',
	},
	{
		id: 'comp',
		name: 'Sistemi Complessi, Fisica Statistica e Caos',
		icon: '🕸️',
		badge: 'Complessità, Reti & Fenomeni Emergenti',
		desc: "Meccanica statistica fuori dall'equilibrio, dinamiche non lineari, teoria delle reti, econofisica e sistemi adattivi.",
		pillarKey: 'storia',
	},
	{
		id: 'app',
		name: 'Fisica Applicata, Elettronica, Sensoristica e Sperimentale Avanzata',
		icon: '🔧',
		badge: 'Strumentazione, Metrologia & Tecnologie di Misura',
		desc: 'Elettronica di frontiera, sensori avanzati, vuoto e criogenia, acustica, Beni Culturali e sviluppo sperimentale.',
		pillarKey: 'lavoro',
	},
] as const;

export interface SliderStopConfig {
	label: string;
	weights: readonly ThematicAreaId[];
}

export const SCALE_SLIDER_CONFIG: readonly SliderStopConfig[] = [
	{ label: '10⁻¹⁸ m • Scala Subnucleare & Quark', weights: ['part', 'teo'] },
	{ label: '10⁻⁹ m • Scala Atomica & Nanomateriali', weights: ['mat', 'cond', 'hpc'] },
	{ label: '10⁻⁶ m • Scala Cellulare & Biofisica', weights: ['bio', 'comp'] },
	{ label: '10⁰ m • Scala Macro & Lab Sperimentale', weights: ['app', 'cond', 'did'] },
	{
		label: '10⁷ m • Scala Planetaria, Clima, Terra & Oceani',
		weights: ['geo_sol', 'geo_atm', 'geo_oce', 'env'],
	},
	{ label: '10²⁶ m • Scala Cosmologica & Spazio Profondo', weights: ['astro', 'teo'] },
] as const;

export const POSTURE_SLIDER_CONFIG: readonly SliderStopConfig[] = [
	{ label: 'Puro Formalismo • Carta, Penna & Teoremi', weights: ['teo', 'did'] },
	{ label: 'Teorico-Fenomenologico • Modelli & Leggi di Scala', weights: ['teo', 'comp', 'astro'] },
	{
		label: 'Ibrido Computazionale • Modelli, HPC, AI & Dati',
		weights: ['hpc', 'comp', 'geo_atm', 'geo_oce'],
	},
	{
		label: 'Sperimentale Osservativo • Misure, Campioni & Natura',
		weights: ['cond', 'bio', 'env', 'geo_sol', 'astro'],
	},
	{
		label: 'Hardware & Lab Puro • Cacciavite, Sensori & Rivelatori',
		weights: ['app', 'part', 'mat'],
	},
] as const;

export type RadioQuestionKey =
	'q1' | 'q2' | 'q3' | 'q5' | 'q6' | 'q7' | 'q8' | 'q9' | 'q11' | 'q12';

/**
 * All available answer weight-strings per radio question (used to compute dynamic maxPossible
 * identically to v6.7.69).
 */
export const RADIO_QUESTION_OPTIONS_AREAS: Record<RadioQuestionKey, readonly string[]> = {
	q1: [
		'astro,app',
		'hpc,comp',
		'part,teo',
		'env,geo_atm',
		'mat,cond',
		'did,geo_oce',
		'bio,geo_sol',
	],
	q2: [
		'teo,part',
		'hpc,cond',
		'astro,teo',
		'cond,mat',
		'geo_atm,geo_oce,env',
		'bio,app',
		'geo_sol,comp',
		'did,comp',
	],
	q3: [
		'part,app',
		'hpc,teo',
		'astro,geo_sol',
		'geo_atm,geo_oce',
		'did,comp',
		'mat,cond',
		'bio,env',
	],
	q5: [
		'hpc,cond',
		'astro,geo_atm',
		'part,teo',
		'env,geo_oce',
		'did,app',
		'mat,geo_sol',
		'bio,comp',
	],
	q6: [
		'app,part,cond',
		'hpc,comp,astro',
		'teo,did',
		'geo_sol,geo_atm,geo_oce,env',
		'mat,cond,bio',
		'astro,part,did',
	],
	q7: [
		'astro,teo',
		'hpc,comp',
		'part,app',
		'geo_atm,env',
		'mat,cond',
		'bio,geo_sol',
		'did,geo_oce',
	],
	q8: [
		'part,teo',
		'astro,teo',
		'geo_atm,geo_oce,env',
		'cond,mat,hpc',
		'comp,bio,did',
		'app,geo_sol,cond',
	],
	q9: ['hpc,app', 'astro,geo_oce', 'teo,part', 'comp,env,geo_atm', 'did,geo_sol', 'cond,mat,bio'],
	q11: [
		'astro,geo_sol,geo_oce',
		'hpc,comp',
		'part,teo',
		'env,geo_atm,geo_oce',
		'did,app',
		'bio,mat,cond',
	],
	q12: [
		'part,teo,astro',
		'cond,mat,app',
		'geo_sol,geo_atm,geo_oce,env',
		'bio,comp',
		'hpc,comp,teo',
		'did,astro,app',
	],
};

export interface QuizScoreResult {
	answeredCount: number;
	scores: Record<ThematicAreaId, number>;
	normScores: Record<ThematicAreaId, number>;
	sortedAreas: ThematicArea[];
}

export function computeQuizMatching(
	radioAnswers: Record<RadioQuestionKey, string>,
	scaleVal: number,
	scaleTouched: boolean,
	postureVal: number,
	postureTouched: boolean,
	pillars: Record<PillarKey, number>
): QuizScoreResult {
	const scores = {} as Record<ThematicAreaId, number>;
	const maxPossible = {} as Record<ThematicAreaId, number>;
	const normScores = {} as Record<ThematicAreaId, number>;

	for (const area of THEMATIC_AREAS) {
		scores[area.id] = 0;
		maxPossible[area.id] = 0;
	}

	const QUESTION_WEIGHT = 1.5;
	let answeredCount = 0;

	// 1. Radio questions (10 questions)
	const qKeys = Object.keys(RADIO_QUESTION_OPTIONS_AREAS) as RadioQuestionKey[];
	for (const qKey of qKeys) {
		const areasInQuestion = new Set<ThematicAreaId>();
		for (const optStr of RADIO_QUESTION_OPTIONS_AREAS[qKey]) {
			for (const rawId of optStr.split(',')) {
				const aId = rawId.trim() as ThematicAreaId;
				if (maxPossible[aId] !== undefined) {
					areasInQuestion.add(aId);
				}
			}
		}
		for (const aId of areasInQuestion) {
			maxPossible[aId] += QUESTION_WEIGHT;
		}

		const selected = radioAnswers[qKey];
		if (selected) {
			answeredCount += 1;
			for (const rawId of selected.split(',')) {
				const aId = rawId.trim() as ThematicAreaId;
				if (scores[aId] !== undefined) {
					scores[aId] += QUESTION_WEIGHT;
				}
			}
		}
	}

	// 2. Cosmic Scale Slider (Q4)
	const areasInQ4 = new Set<ThematicAreaId>();
	for (const cfg of SCALE_SLIDER_CONFIG) {
		for (const aId of cfg.weights) {
			areasInQ4.add(aId);
		}
	}
	for (const aId of areasInQ4) {
		maxPossible[aId] += QUESTION_WEIGHT;
	}
	if (scaleTouched) {
		answeredCount += 1;
		const cfg = SCALE_SLIDER_CONFIG[scaleVal];
		if (cfg) {
			for (const aId of cfg.weights) {
				scores[aId] += QUESTION_WEIGHT;
			}
		}
	}

	// 3. Mental Compass Slider (Q10)
	const areasInQ10 = new Set<ThematicAreaId>();
	for (const cfg of POSTURE_SLIDER_CONFIG) {
		for (const aId of cfg.weights) {
			areasInQ10.add(aId);
		}
	}
	for (const aId of areasInQ10) {
		maxPossible[aId] += QUESTION_WEIGHT;
	}
	if (postureTouched) {
		answeredCount += 1;
		const cfg = POSTURE_SLIDER_CONFIG[postureVal];
		if (cfg) {
			for (const aId of cfg.weights) {
				scores[aId] += QUESTION_WEIGHT;
			}
		}
	}

	// 4. Normalize + deterministic micro tie-breaker from Pillar sliders
	THEMATIC_AREAS.forEach((area, idx) => {
		const baseNorm = maxPossible[area.id] > 0 ? scores[area.id] / maxPossible[area.id] : 0;
		const pillarVal = pillars[area.pillarKey] ?? 0;
		const tieBreaker = pillarVal * 0.005 + (THEMATIC_AREAS.length - idx) * 0.0001;
		normScores[area.id] = baseNorm + tieBreaker;
	});

	const sortedAreas = [...THEMATIC_AREAS].sort(
		(a, b) => (normScores[b.id] ?? 0) - (normScores[a.id] ?? 0)
	);

	return {
		answeredCount,
		scores,
		normScores,
		sortedAreas,
	};
}
