const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export async function saveScenario(name: string, type: string, data: unknown) {
	const res = await fetch(`${API_URL}/scenarios`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ name, type, data })
	});
	if (!res.ok) throw new Error(`Error al guardar: ${res.status}`);
	return res.json();
}

export async function uploadMedia(scenarioId: string, file: File) {
	const form = new FormData();
	form.append('file', file);

	const res = await fetch(`${API_URL}/scenarios/${scenarioId}/media`, {
		method: 'POST',
		body: form
	});
	if (!res.ok) throw new Error(`Error al subir ${file.name}: ${res.status}`);
	return res.json();
}