import type { Entity } from '$lib/models';
import type { MediaType } from './editor.svelte';

const STORAGE_KEY = 'setic-builder-workspace';

/**
 * Lo dibujado en una escena, guardado por nombre de archivo. Al volver a
 * cargar ese mismo archivo (p2inicio.png, etc.) sus entidades vuelven solas.
 */
export interface SavedScene
{
    /** Se conserva el id para que las flechas "Siguiente" sigan apuntando bien */
    id: string;
    mediaName: string;
    mediaType: MediaType;
    entities: Entity[];
    entityColors: Record<string, string>;
    colorIndex: number;
}

export interface WorkspaceData
{
    entities: Entity[];
    entityColors: Record<string, string>;
    mediaName: string;
    mediaType: MediaType;
    savedAt: string;
    /** Todas las escenas (antes solo se guardaba la escena abierta) */
    scenes?: SavedScene[];
}

export function saveWorkspace(data: Omit<WorkspaceData, 'savedAt'>): void
{
    try
    {
        const workspace: WorkspaceData = { ...data, savedAt: new Date().toISOString() };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
    }
    catch { /* localStorage full or unavailable — silently ignore */ }
}

export function loadWorkspace(): WorkspaceData | null
{
    try
    {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw) as WorkspaceData;
    }
    catch { return null; }
}

export function clearWorkspace(): void
{
    try { localStorage.removeItem(STORAGE_KEY); }
    catch { /* ignore */ }
}
