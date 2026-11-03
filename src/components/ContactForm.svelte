<script lang="ts">
	import { onMount } from 'svelte';
	import { Mail, ArrowRight, CircleCheck, CircleX, RotateCcw } from '@lucide/svelte';
	import { contactForm, SCRIPT_URL } from '../utils/contactForm';
	import type { FormPayload } from '../types/contactFrom';
	import { contacts, errorContent } from '../data/cms';
	import { SvelteURLSearchParams } from 'svelte/reactivity';

	type Status = { variant: 'success' | 'error'; heading: string; message: string } | null;

	interface FormTranslations {
		heroHeading?: string;
		heroSubtitle?: string;
		formHeading?: string;
		nameLabel?: string;
		namePlaceholder?: string;
		emailLabel?: string;
		emailPlaceholder?: string;
		subjectLabel?: string;
		subjectDefault?: string;
		subjects?: (string | undefined)[];
		messageLabel?: string;
		messagePlaceholder?: string;
		nameValidationHint?: string;
		emailValidationHint?: string;
		subjectValidationHint?: string;
		messageValidationHint?: string;
		successHeading?: string;
		successMessage?: string;
		errorHeading?: string;
		resetButton?: string;
		submitButton?: string;
		submittingButton?: string;
		mapHeading?: string;
		mapDept?: string;
	}

	let { translations = null, locale = 'it' } = $props<{
		translations?: FormTranslations | null;
		locale?: string;
	}>();

	const tForm = $derived(translations ?? (contacts.form as FormTranslations));

	let nome = $state('');
	let email = $state('');
	let oggetto = $state<string>('');
	let messaggio = $state('');
	let submitting = $state(false);
	let status = $state<Status>(null);
	let formEl = $state<HTMLFormElement | null>(null);

	const subjectValues = $derived<string[]>(
		(tForm?.subjects as string[]) ?? (contacts.form?.subjects as string[]) ?? []
	);

	const CANONICAL_SUBJECTS: FormPayload['oggetto'][] = [
		'Iscrizione',
		'Sponsorizzazione',
		'Logistica',
		'Programma Scientifico',
		'Altro',
	];

	const QUERY_PARAM_MAP: Record<string, number> = {
		iscrizione: 0,
		iscriviti: 0,
		sponsor: 1,
		sponsorizzazione: 1,
		logistica: 2,
		programma: 3,
		'programma-scientifico': 3,
		altro: 4,
	};

	onMount(() => {
		const params = new SvelteURLSearchParams(window.location.search);
		const raw = params.get('oggetto') ?? params.get('tipo') ?? params.get('azione');
		if (raw) {
			const lower = raw.toLowerCase();
			const idxFromParam = QUERY_PARAM_MAP[lower];
			const directIdx = subjectValues.findIndex((s) => s.toLowerCase() === lower);
			const targetIdx = idxFromParam !== undefined ? idxFromParam : directIdx;

			if (targetIdx !== -1 && subjectValues[targetIdx]) {
				oggetto = subjectValues[targetIdx];
				formEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
			}
		}
	});

	function reset() {
		nome = '';
		email = '';
		oggetto = '';
		messaggio = '';
		submitting = false;
		status = null;
	}

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (!oggetto) return;

		submitting = true;
		status = null;

		const idx = subjectValues.indexOf(oggetto);
		const canonicalSubject = idx !== -1 ? CANONICAL_SUBJECTS[idx] : 'Altro';
		const data: FormPayload = { nome, email, oggetto: canonicalSubject, messaggio };
		const result = await contactForm(data, locale);

		if (result.success) {
			status = {
				variant: 'success',
				heading: tForm?.successHeading ?? 'Messaggio inviato!',
				message: tForm?.successMessage ?? 'Ti risponderemo al più presto.',
			};
		} else {
			status = {
				variant: 'error',
				heading: tForm?.errorHeading ?? 'Qualcosa è andato storto',
				message: result.error ?? errorContent.defaultMessage ?? 'Errore sconosciuto',
			};
		}

		submitting = false;
	}
</script>

<div class="card card-border border-primary/30 bg-base-100/60 p-8">
	<h2 class="card-title mb-6 text-2xl">{tForm?.formHeading}</h2>

	<form
		bind:this={formEl}
		onsubmit={handleSubmit}
		class="fieldset"
		action={SCRIPT_URL}
		method="POST"
	>
		{#if status}
			<div class="animate-fade-in-up flex flex-col items-center gap-3 py-4 text-center">
				<div
					class="flex size-16 items-center justify-center rounded-full {status.variant === 'success'
						? 'bg-success/10'
						: 'bg-error/10'}"
				>
					{#if status.variant === 'success'}
						<CircleCheck class="text-success size-9" />
					{:else}
						<CircleX class="text-error size-9" />
					{/if}
				</div>

				<div>
					<p class="text-lg font-bold">{status.heading}</p>
					<p class="text-base-content/60 mt-1 text-sm">{status.message}</p>
				</div>

				<button class="btn btn-primary btn-outline" onclick={reset}>
					<RotateCcw class="size-4 shrink-0" />
					{tForm?.resetButton ?? 'Invia un altro'}
				</button>
			</div>
		{:else}
			<fieldset class="fieldset">
				<label class="label text-base" for="nome">{tForm?.nameLabel}</label>
				<input
					id="nome"
					name="nome"
					type="text"
					required
					placeholder={tForm?.namePlaceholder}
					bind:value={nome}
					class="input validator focus:input-primary w-full"
					minlength="2"
					maxlength="256"
				/>
				<p class="validator-hint hidden">{tForm?.nameValidationHint}</p>
			</fieldset>

			<fieldset class="fieldset">
				<label class="label text-base" for="email">{tForm?.emailLabel}</label>
				<input
					id="email"
					name="email"
					type="email"
					required
					placeholder={tForm?.emailPlaceholder}
					bind:value={email}
					class="input validator focus:input-primary w-full"
				/>
				<p class="validator-hint hidden">{tForm?.emailValidationHint}</p>
			</fieldset>

			<fieldset class="fieldset">
				<label class="label text-base" for="oggetto">{tForm?.subjectLabel}</label>
				<select
					id="oggetto"
					name="oggetto"
					required
					bind:value={oggetto}
					class="select validator focus:select-primary w-full"
				>
					<option value="" disabled selected>{tForm?.subjectDefault}</option>
					{#each subjectValues as value (value)}
						<option {value}>{value}</option>
					{/each}
				</select>
				<p class="validator-hint hidden">{tForm?.subjectValidationHint}</p>
			</fieldset>

			<fieldset class="fieldset">
				<label class="label text-base" for="messaggio">{tForm?.messageLabel}</label>
				<textarea
					id="messaggio"
					name="messaggio"
					required
					rows={5}
					placeholder={tForm?.messagePlaceholder}
					bind:value={messaggio}
					class="textarea validator w-full focus:textarea-primary"></textarea>
				<p class="validator-hint hidden">{tForm?.messageValidationHint}</p>
			</fieldset>

			<button type="submit" disabled={submitting} class="btn btn-primary glow-hover btn-block">
				{#if submitting}
					<span class="loading loading-dots loading-md"></span>
				{:else}
					<Mail class="size-5" />
					{tForm?.submitButton}
					<ArrowRight class="size-5" />
				{/if}
			</button>
		{/if}
	</form>
</div>
