/**
 * Escenarios ya publicados: listarlos, abrirlos para editar y guardar los
 * cambios en el MISMO escenario (mismo id), para que el historial y las
 * estadísticas de los polígonos sigan apuntando a él.
 *
 * Solo funciona con una sesión que pueda usar el Builder (superadmin); el
 * servidor además rechaza cambios de operadores y de clientes sobre el
 * catálogo de SETIC.
 */
import { authHeaders, logout } from './authService';
import type { HitScenario } from '$lib/models';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

/** Nombre fijo de la portada que sube el Builder al publicar. */
export const COVER_NAME = '__portada.jpg';

export interface ScenarioSummary {
    id: string;
    name: string;
    description: string | null;
    type: string;
    createdAt: string;
    updatedAt?: string;
    organizationId: string | null;
    /** Trae un elemento si el escenario tiene portada */
    media?: { id: string }[];
}

export interface ScenarioDetail {
    id: string;
    name: string;
    description: string | null;
    type: string;
    organizationId: string | null;
    data: HitScenario;
    media: { id: string; fileName: string; mimeType: string; sizeBytes: number }[];
}

export interface ScenarioChanges {
    name: string;
    description: string;
    data: HitScenario;
    /** Borrar del servidor los archivos que ya no usa ninguna escena */
    pruneMedia: boolean;
}

function checkAuth(res: Response): void {
    if (res.status === 401) {
        logout();
        throw new Error('Sesión expirada. Vuelve a iniciar sesión.');
    }
}

export async function listScenarios(): Promise<ScenarioSummary[]> {
    const res = await fetch(`${API_URL}/scenarios`, { headers: authHeaders() });
    checkAuth(res);
    if (!res.ok) throw new Error(`No se pudo cargar la lista de escenarios (${res.status})`);
    return res.json();
}

export async function getScenario(id: string): Promise<ScenarioDetail> {
    const res = await fetch(`${API_URL}/scenarios/${id}`, { headers: authHeaders() });
    checkAuth(res);
    if (!res.ok) throw new Error(`No se pudo abrir el escenario (${res.status})`);
    return res.json();
}

/** Descarga un archivo del escenario como File, con el mismo nombre que usan sus escenas. */
export async function downloadMedia(id: string, fileName: string): Promise<File> {
    const res = await fetch(`${API_URL}/scenarios/${id}/media/${encodeURIComponent(fileName)}`, {
        headers: authHeaders(),
    });
    checkAuth(res);
    if (!res.ok) throw new Error(`No se pudo descargar ${fileName} (${res.status})`);
    const blob = await res.blob();
    const type = blob.type && blob.type !== 'application/octet-stream' ? blob.type : guessType(fileName);
    return new File([blob], fileName, { type });
}

/** Portada del escenario como dirección local (blob:), o null si no tiene. */
export async function fetchCoverUrl(id: string): Promise<string | null> {
    try {
        const res = await fetch(`${API_URL}/scenarios/${id}/media/${COVER_NAME}`, { headers: authHeaders() });
        if (!res.ok) return null;
        return URL.createObjectURL(await res.blob());
    } catch {
        return null;
    }
}

/** Guarda los cambios en el mismo escenario. */
export async function updateScenario(id: string, changes: ScenarioChanges): Promise<unknown> {
    const res = await fetch(`${API_URL}/scenarios/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(changes),
    });
    checkAuth(res);
    if (res.status === 404) {
        throw new Error('El servidor no aceptó los cambios: el escenario ya no existe, o falta actualizar setic-api en el servidor.');
    }
    if (res.status === 403) throw new Error('Tu cuenta no tiene permiso para modificar este escenario.');
    if (!res.ok) throw new Error(`Error al guardar los cambios: ${res.status}`);
    return res.json();
}

/**
 * Borra el escenario del servidor con todas sus escenas y archivos.
 * Devuelve false si ya no existía (otra persona lo borró antes).
 * El historial de sesiones no se toca: guarda el nombre del escenario.
 */
export async function deleteScenario(id: string): Promise<boolean> {
    const res = await fetch(`${API_URL}/scenarios/${id}`, { method: 'DELETE', headers: authHeaders() });
    checkAuth(res);
    if (res.status === 404) return false;
    if (res.status === 403) throw new Error('Tu cuenta no tiene permiso para eliminar este escenario.');
    if (!res.ok) throw new Error(`No se pudo eliminar el escenario (error ${res.status}). Inténtalo de nuevo.`);
    return true;
}

/** Nombre libre entre los ocupados: "video.mp4" → "video (2).mp4", "video (3).mp4"… */
export function uniqueName(name: string, taken: Set<string>): string {
    if (!taken.has(name)) return name;
    const dot = name.lastIndexOf('.');
    const base = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    for (let n = 2; ; n++) {
        const candidate = `${base} (${n})${ext}`;
        if (!taken.has(candidate)) return candidate;
    }
}

function guessType(name: string): string {
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    const types: Record<string, string> = {
        mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
        ogv: 'video/ogg', ogg: 'video/ogg', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
        webp: 'image/webp', gif: 'image/gif',
    };
    return types[ext] ?? 'application/octet-stream';
}
