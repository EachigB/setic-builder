import { authHeaders, logout } from './authService';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

function checkAuth(res: Response) {
	if (res.status === 401) {
		logout();
		throw new Error('Sesión expirada. Vuelve a iniciar sesión.');
	}
}

export async function saveScenario(name: string, type: string, data: unknown, description?: string) {
	const res = await fetch(`${API_URL}/scenarios`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', ...authHeaders() },
		body: JSON.stringify({ name, type, data, description })
	});
	checkAuth(res);
	if (!res.ok) throw new Error(`Error al guardar: ${res.status}`);
	return res.json();
}

export async function uploadMedia(scenarioId: string, file: File) {
	const form = new FormData();
	form.append('file', file);

	const res = await fetch(`${API_URL}/scenarios/${scenarioId}/media`, {
		method: 'POST',
		headers: authHeaders(),
		body: form
	});
	checkAuth(res);
	if (!res.ok) throw new Error(`Error al subir ${file.name}: ${res.status}`);
	return res.json();
}
export interface PublishedScenario {
	id: string;
	name: string;
	type?: string;
	description?: string | null;
	createdAt?: string;
}

/** Escenarios publicados (los que ve el superadmin). */
export async function listScenarios(): Promise<PublishedScenario[]> {
	const res = await fetch(`${API_URL}/scenarios`, { headers: authHeaders() });
	checkAuth(res);
	if (!res.ok) throw new Error(`No se pudo leer la lista: ${res.status}`);
	return res.json();
}

/** Un escenario publicado con su JSON completo (en `data`). */
export async function getScenario(id: string): Promise<PublishedScenario & { data: any }> {
	const res = await fetch(`${API_URL}/scenarios/${id}`, { headers: authHeaders() });
	checkAuth(res);
	if (!res.ok) throw new Error(`No se pudo abrir el escenario: ${res.status}`);
	return res.json();
}

/** Descarga una imagen o video de un escenario publicado. */
export async function downloadMedia(id: string, fileName: string): Promise<Blob> {
	const res = await fetch(`${API_URL}/scenarios/${id}/media/${encodeURIComponent(fileName)}`, {
		headers: authHeaders()
	});
	checkAuth(res);
	if (!res.ok) throw new Error(`No se pudo descargar ${fileName}: ${res.status}`);
	return res.blob();
}
