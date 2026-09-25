export type Oggetto =
	'Iscrizione' | 'Sponsorizzazione' | 'Logistica' | 'Programma Scientifico' | 'Altro';

export interface FormPayload {
	nome: string;
	email: string;
	oggetto: Oggetto;
	messaggio: string;
}

export interface SubmitResult {
	success: boolean;
	error?: string;
}
