import { authHeaders, logout } from './authService';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

function checkAuth(res: Response) {
	if (res.status === 401) {
		logout();
		throw new Error('Sesión expirada. Vuelve a iniciar sesión.');
	}
}

export async function saveScenario(name: string, type: string, data: unknown) {
	const res = await fetch(`${API_URL}/scenarios`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', ...authHeaders() },
		body: JSON.stringify({ name, type, data })
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