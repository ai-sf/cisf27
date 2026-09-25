<script lang="ts">
	import { onMount } from 'svelte';
	import { Mail, ArrowRight, CircleCheck, CircleX, RotateCcw } from '@lucide/svelte';
	import { contactForm, SCRIPT_URL } from '../utils/contactForm';
	import type { FormPayload } from '../types/contactFrom';
	import { contacts, errorContent } from '../data/cms';
	import { SvelteURLSearchParams } from 'svelte/reactivity';

	type Status = { variant: 'success' | 'error'; heading: string; message: string } | null;

	let nome = $state('');
	let email = $state('');
	let oggetto = $state<FormPayload['oggetto'] | ''>('');
	let messaggio = $state('');
	let submitting = $state(false);
	let status = $state<Status>(null);
	let formEl = $state<HTMLFormElement | null>(null);

	const subjectValues: FormPayload['oggetto'][] =
		(contacts.form?.subjects as FormPayload['oggetto'][]) ?? [];

	const oggettoMap: Record<string, FormPayload['oggetto']> = {
		sponsor: 'Sponsorizzazione',
		sponsorizzazione: 'Sponsorizzazione',
		iscrizione: 'Iscrizione',
		iscriviti: 'Iscrizione',
		logistica: 'Logistica',
		programma: 'Programma Scientifico',
		'programma-scientifico': 'Programma Scientifico',
		altro: 'Altro',
	};

	onMount(() => {
		const params = new SvelteURLSearchParams(window.location.search);
		const raw = params.get('oggetto') ?? params.get('tipo') ?? params.get('azione');
		if (raw) {
			const mapped = oggettoMap[raw.toLowerCase()];
			if (mapped) {
				oggetto = mapped;
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

		const data: FormPayload = { nome, email, oggetto, messaggio };
		const result = await contactForm(data);

		if (result.success) {
			status = {
				variant: 'success',
				heading: contacts.form?.successHeading ?? 'Messaggio inviato!',
				message: contacts.form?.successMessage ?? 'Ti risponderemo al più presto.',
			};
		} else {
			status = {
				variant: 'error',
				heading: contacts.form?.errorHeading ?? 'Qualcosa è andato storto',
				message: result.error ?? errorContent.defaultMessage ?? 'Errore sconosciuto',
			};
		}

		submitting = false;
	}
</script>

<div class="card card-border border-primary/30 bg-base-100/60 p-8">
	<h2 class="card-title mb-6 text-2xl">{contacts.form?.formHeading}</h2>

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
					{contacts.form?.resetButton}
				</button>
			</div>
		{:else}
			<fieldset class="fieldset">
				<label class="label text-base" for="nome">{contacts.form?.nameLabel}</label>
				<input
					id="nome"
					name="nome"
					type="text"
					required
					placeholder={contacts.form?.namePlaceholder}
					bind:value={nome}
					class="input validator focus:input-primary w-full"
					minlength="2"
					maxlength="256"
				/>
				<p class="validator-hint hidden">{contacts.form?.nameValidationHint}</p>
			</fieldset>

			<fieldset class="fieldset">
				<label class="label text-base" for="email">{contacts.form?.emailLabel}</label>
				<input
					id="email"
					name="email"
					type="email"
					required
					placeholder={contacts.form?.emailPlaceholder}
					bind:value={email}
					class="input validator focus:input-primary w-full"
				/>
				<p class="validator-hint hidden">{contacts.form?.emailValidationHint}</p>
			</fieldset>

			<fieldset class="fieldset">
				<label class="label text-base" for="oggetto">{contacts.form?.subjectLabel}</label>
				<select
					id="oggetto"
					name="oggetto"
					required
					bind:value={oggetto}
					class="select validator focus:select-primary w-full"
				>
					<option value="" disabled selected>{contacts.form?.subjectDefault}</option>
					{#each subjectValues as value (value)}
						<option {value}>{value}</option>
					{/each}
				</select>
				<p class="validator-hint hidden">{contacts.form?.subjectValidationHint}</p>
			</fieldset>

			<fieldset class="fieldset">
				<label class="label text-base" for="messaggio">{contacts.form?.messageLabel}</label>
				<textarea
					id="messaggio"
					name="messaggio"
					required
					rows={5}
					placeholder={contacts.form?.messagePlaceholder}
					bind:value={messaggio}
					class="textarea validator w-full focus:textarea-primary"></textarea>
				<p class="validator-hint hidden">{contacts.form?.messageValidationHint}</p>
			</fieldset>

			<button type="submit" disabled={submitting} class="btn btn-primary glow-hover btn-block">
				{#if submitting}
					<span class="loading loading-dots loading-md"></span>
				{:else}
					<Mail class="size-5" />
					{contacts.form?.submitButton}
					<ArrowRight class="size-5" />
				{/if}
			</button>
		{/if}
	</form>
</div>
