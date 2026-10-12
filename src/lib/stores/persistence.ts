import type { Entity } from '$lib/models';
import type { MediaType } from './editor.svelte';

const STORAGE_KEY = 'setic-builder-workspace';

export interface WorkspaceData
{
    entities: Entity[];
    entityColors: Record<string, string>;
    mediaName: string;
    mediaType: MediaType;
    savedAt: string;
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
