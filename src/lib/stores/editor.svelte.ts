import type { Entity, EntityPath } from '$lib/models';
import { HitAction } from '$lib/values';
import { generateId } from '$lib/utils';
import { saveWorkspace, loadWorkspace, type WorkspaceData } from './persistence';

export type ToolMode = 'none' | 'draw' | 'select' | 'modify' | 'delete';
export type DrawMode = 'polygon' | 'lasso';
export type MediaType = 'image' | 'video';

export interface SceneData {
    id: string;
    file: File | null;
    mediaName: string;
    mediaType: MediaType;
    entities: Entity[];
    entityColors: Record<string, string>;
    colorIndex: number;
    currentTimeMs: number;
}

export const ENTITY_COLORS = [
    '#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6',
    '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
];

const STEP_INTERVALS = [50, 100, 250] as const;

class EditorState
{
    activeTool = $state<ToolMode>('none');
    drawMode = $state<DrawMode>('lasso');

    entities = $state<Entity[]>([]);
    selectedEntityId = $state<string | null>(null);
    selectedPathIndex = $state<number>(-1);

    // Media
    mediaType = $state<MediaType>('image');
    mediaName = $state<string>('');
    mediaLoaded = $state<boolean>(false);
    mediaWidth = $state<number>(0);
    mediaHeight = $state<number>(0);

    // Video-specific
    currentTimeMs = $state<number>(0);
    videoDurationMs = $state<number>(0);
    isPlaying = $state<boolean>(false);
    stepIntervalMs = $state<number>(50);

    sidebarOpen = $state<boolean>(false);
    entityColors = $state<Record<string, string>>({});

    // Multi-scene
    scenes = $state<SceneData[]>([]);
    activeSceneId = $state<string | null>(null);

    // Toast notification
    toastMessage = $state<string>('');
    toastType = $state<'info' | 'warning' | 'error'>('info');
    private toastTimer: ReturnType<typeof setTimeout> | null = null;

    colorIndex = 0;

    // ── Persistence ──────────────────────────────────────────────────────

    private persist(): void
    {
        saveWorkspace({
            entities: this.entities,
            entityColors: this.entityColors,
            mediaName: this.mediaName,
            mediaType: this.mediaType,
        });
    }

    loadSavedWorkspace(): WorkspaceData | null
    {
        return loadWorkspace();
    }

    restoreWorkspace(data: WorkspaceData): void
    {
        this.entities = data.entities;
        this.entityColors = data.entityColors;
        this.colorIndex = data.entities.length;
    }

    // ── Multi-scene ──────────────────────────────────────────────────────

    /** Save current entity state into the active scene snapshot */
    flushToActiveScene(): void
    {
        if (!this.activeSceneId) return;
        this.scenes = this.scenes.map(s =>
            s.id === this.activeSceneId
                ? { ...s, entities: this.entities, entityColors: this.entityColors, colorIndex: this.colorIndex, currentTimeMs: this.currentTimeMs }
                : s
        );
    }

    /** Create a new scene entry and mark it as active. Does NOT load canvas. */
    addScene(file: File): SceneData
    {
        const id = generateId();
        const mediaType: MediaType = file.type.startsWith('video/') ? 'video' : 'image';
        const scene: SceneData = {
            id,
            file,
            mediaName: file.name,
            mediaType,
            entities: [],
            entityColors: {},
            colorIndex: 0,
            currentTimeMs: 0,
        };
        this.scenes = [...this.scenes, scene];
        this.activeSceneId = id;
        return scene;
    }

    /** Remove a scene. Returns the ID of a scene to switch to if the removed scene was active, or null. */
    removeScene(id: string): string | null
    {
        const wasActive = this.activeSceneId === id;
        this.scenes = this.scenes.filter(s => s.id !== id);
        if (wasActive)
            return this.scenes.length > 0 ? this.scenes[0].id : null;
        return null;
    }

    /** Other scenes (not the active one) — for use in NEXT action selector */
    get otherScenes(): SceneData[]
    {
        return this.scenes.filter(s => s.id !== this.activeSceneId);
    }

    // ── Derived helpers ──────────────────────────────────────────────────

    /** Current selected entity */
    get currentEntity(): Entity | undefined
    {
        if (!this.selectedEntityId) return undefined;
        return this.entities.find(e => e.id === this.selectedEntityId);
    }

    /** All paths of the current entity sorted by frame_time_start_ms (includes empty) */
    get currentEntityAllPaths(): EntityPath[]
    {
        const entity = this.currentEntity;
        if (!entity) return [];
        return [...entity.paths]
            .sort((a, b) => a.frame_time_start_ms - b.frame_time_start_ms);
    }

    /** Paths of the current entity sorted by frame_time_start_ms (only with content) */
    get currentEntitySortedPaths(): EntityPath[]
    {
        return this.currentEntityAllPaths.filter(p => !!p.path);
    }

    /** Currently selected path (uses allPaths to include empty) */
    get currentPath(): EntityPath | undefined
    {
        const all = this.currentEntityAllPaths;
        if (this.selectedPathIndex < 0 || this.selectedPathIndex >= all.length)
            return undefined;
        return all[this.selectedPathIndex];
    }

    /** The selected path's ID (for backward compat with canvas/menu) */
    get selectedPathId(): string | null
    {
        return this.currentPath?.id ?? null;
    }

    /** Whether there is a next path (with content) after the current one to interpolate with */
    get hasNextPath(): boolean
    {
        return this.nextFilledPath !== undefined;
    }

    /** The next path with content after the currently selected path */
    get nextFilledPath(): EntityPath | undefined
    {
        const all = this.currentEntityAllPaths;
        if (this.selectedPathIndex < 0 || this.selectedPathIndex >= all.length) return undefined;
        const current = all[this.selectedPathIndex];
        if (!current.path) return undefined;
        for (let i = this.selectedPathIndex + 1; i < all.length; i++)
            if (all[i].path) return all[i];
        return undefined;
    }

    /** Sorted unique start-timestamps across ALL entity paths (includes empty) */
    get keyframeTimestamps(): number[]
    {
        const set = new Set<number>();
        for (const e of this.entities)
            for (const p of e.paths)
                set.add(p.frame_time_start_ms);
        return [...set].sort((a, b) => a - b);
    }

    /** Sorted unique start-timestamps of the current entity's paths only (includes empty) */
    get currentEntityKeyframes(): number[]
    {
        const entity = this.currentEntity;
        if (!entity) return [];
        const set = new Set<number>();
        for (const p of entity.paths)
            set.add(p.frame_time_start_ms);
        return [...set].sort((a, b) => a - b);
    }

    /** Total count of non-empty entity paths */
    get totalPathCount(): number
    {
        let n = 0;
        for (const e of this.entities)
            n += e.paths.filter(p => !!p.path).length;
        return n;
    }

    /** Find entity containing a given pathId */
    findEntityByPathId(pathId: string): Entity | undefined
    {
        return this.entities.find(e => e.paths.some(p => p.id === pathId));
    }

    /** Get color for a path (looks up parent entity) */
    getPathColor(pathId: string): string
    {
        const entity = this.findEntityByPathId(pathId);
        return entity ? (this.entityColors[entity.id] || '#ef4444') : '#ef4444';
    }

    /** Color to use when starting a new drawing.
     *  Selected entity -> entity color. No entity -> preview next color. */
    getDrawColor(): string
    {
        if (this.selectedEntityId)
            return this.entityColors[this.selectedEntityId] || '#ef4444';
        return ENTITY_COLORS[this.colorIndex % ENTITY_COLORS.length];
    }

    /** Find the path index visible at a given time in an entity (includes empty paths) */
    findPathIndexAtTime(entityId: string, timeMs: number): number
    {
        const entity = this.entities.find(e => e.id === entityId);
        if (!entity) return -1;

        const sorted = [...entity.paths]
            .sort((a, b) => a.frame_time_start_ms - b.frame_time_start_ms);

        for (let i = 0; i < sorted.length; i++)
        {
            const endMs = sorted[i].frame_time_end_ms > 0
                ? sorted[i].frame_time_end_ms
                : this.videoDurationMs;
            if (timeMs >= sorted[i].frame_time_start_ms && timeMs < endMs)
                return i;
        }
        return -1;
    }

    // ── Color / interval ─────────────────────────────────────────────────

    nextColor(): string
    {
        const color = ENTITY_COLORS[this.colorIndex % ENTITY_COLORS.length];
        this.colorIndex++;
        return color;
    }

    cycleInterval(): void
    {
        const idx = STEP_INTERVALS.indexOf(this.stepIntervalMs as typeof STEP_INTERVALS[number]);
        this.stepIntervalMs = STEP_INTERVALS[(idx + 1) % STEP_INTERVALS.length];
    }

    // ── Entity CRUD ──────────────────────────────────────────────────────

    createEntity(name?: string): Entity
    {
        const color = this.nextColor();
        const entity: Entity = {
            id: generateId(),
            name: name || `Entity ${this.entities.length + 1}`,
            hit_action: HitAction.SCORE,
            score: 0,
            next_scene_id: '',
            paths: [],
        };
        this.entities = [...this.entities, entity];
        this.entityColors = { ...this.entityColors, [entity.id]: color };
        this.selectedEntityId = entity.id;
        this.selectedPathIndex = -1;
        this.persist();
        return entity;
    }

    removeEntity(entityId: string): string[]
    {
        const entity = this.entities.find(e => e.id === entityId);
        const pathIds = entity?.paths.map(p => p.id) ?? [];

        this.entities = this.entities.filter(e => e.id !== entityId);
        const { [entityId]: _, ...rest } = this.entityColors;
        this.entityColors = rest;

        if (this.selectedEntityId === entityId)
        {
            this.selectedEntityId = null;
            this.selectedPathIndex = -1;
        }

        this.persist();
        return pathIds;
    }

    updateEntity(entityId: string, updates: Partial<Omit<Entity, 'id' | 'paths'>>): void
    {
        this.entities = this.entities.map(e =>
            e.id === entityId ? { ...e, ...updates } : e
        );
        this.persist();
    }

    // ── Path CRUD ────────────────────────────────────────────────────────

    /** Create a path in the selected entity (auto-creates one if needed). */
    createPath(svgPath: string): EntityPath
    {
        let entityId = this.selectedEntityId;

        if (!entityId)
        {
            const entity = this.createEntity();
            entityId = entity.id;
        }

        // Check if there's a pending empty path at current time to fill
        const entity = this.entities.find(e => e.id === entityId)!;
        const pendingPath = entity.paths.find(p =>
            !p.path && p.frame_time_start_ms === (this.mediaType === 'video' ? this.currentTimeMs : 0)
        );

        if (pendingPath)
        {
            this.entities = this.entities.map(e =>
                e.id === entityId
                    ? {
                        ...e,
                        paths: e.paths.map(p =>
                            p.id === pendingPath.id ? { ...p, path: svgPath } : p
                        ),
                    }
                    : e
            );
            // Update selectedPathIndex to the filled path
            const all = this.currentEntityAllPaths;
            this.selectedPathIndex = all.findIndex(p => p.id === pendingPath.id);
            this.persist();
            return { ...pendingPath, path: svgPath };
        }

        const entityPath: EntityPath = {
            id: generateId(),
            frame_time_start_ms: this.mediaType === 'video' ? this.currentTimeMs : 0,
            frame_time_end_ms: this.mediaType === 'video' ? this.videoDurationMs : 0,
            path: svgPath,
        };

        this.entities = this.entities.map(e =>
            e.id === entityId
                ? { ...e, paths: [...e.paths, entityPath] }
                : e
        );

        // Select the newly created path
        const all = this.currentEntityAllPaths;
        this.selectedPathIndex = all.findIndex(p => p.id === entityPath.id);

        this.persist();
        return entityPath;
    }

    /** Create an empty path placeholder in the current entity at current time.
     *  Cuts the active path at currentTimeMs and inherits its end time. */
    createEmptyPath(): EntityPath
    {
        let entityId = this.selectedEntityId;
        if (!entityId)
        {
            const entity = this.createEntity();
            entityId = entity.id;
        }

        // Find the path active at currentTimeMs and cut it
        const entity = this.entities.find(e => e.id === entityId)!;
        const sorted = [...entity.paths]
            .sort((a, b) => a.frame_time_start_ms - b.frame_time_start_ms);

        let endTimeForNew = this.videoDurationMs;

        for (const p of sorted)
        {
            const endMs = p.frame_time_end_ms > 0 ? p.frame_time_end_ms : this.videoDurationMs;
            if (p.frame_time_start_ms <= this.currentTimeMs && endMs > this.currentTimeMs)
            {
                // This path is active at currentTimeMs — cut it here
                endTimeForNew = p.frame_time_end_ms || this.videoDurationMs;
                this.updatePath(p.id, { frame_time_end_ms: this.currentTimeMs });
                break;
            }
        }

        const entityPath: EntityPath = {
            id: generateId(),
            frame_time_start_ms: this.currentTimeMs,
            frame_time_end_ms: endTimeForNew,
            path: '',
        };

        this.entities = this.entities.map(e =>
            e.id === entityId
                ? { ...e, paths: [...e.paths, entityPath] }
                : e
        );

        // Select the new empty path
        const all = this.currentEntityAllPaths;
        this.selectedPathIndex = all.findIndex(p => p.id === entityPath.id);

        this.persist();
        return entityPath;
    }

    removePath(pathId: string): void
    {
        this.entities = this.entities.map(e => ({
            ...e,
            paths: e.paths.filter(p => p.id !== pathId),
        }));

        if (this.selectedPathId === pathId)
        {
            const all = this.currentEntityAllPaths;
            this.selectedPathIndex = all.length > 0
                ? Math.min(this.selectedPathIndex, all.length - 1)
                : -1;
        }

        this.persist();
    }

    /** Delete current path with time adjustment logic */
    deleteCurrentPath(): { deletedId: string; adjustedPaths: EntityPath[] } | null
    {
        const all = this.currentEntityAllPaths;
        const idx = this.selectedPathIndex;
        if (idx < 0 || idx >= all.length) return null;

        const current = all[idx];
        const adjustedPaths: EntityPath[] = [];

        // Adjust adjacent path times
        if (idx > 0)
        {
            const prev = all[idx - 1];
            this.updatePath(prev.id, { frame_time_end_ms: current.frame_time_end_ms });
            adjustedPaths.push({ ...prev, frame_time_end_ms: current.frame_time_end_ms });
        }
        else if (idx === 0 && all.length > 1)
        {
            const next = all[idx + 1];
            this.updatePath(next.id, { frame_time_start_ms: current.frame_time_start_ms });
            adjustedPaths.push({ ...next, frame_time_start_ms: current.frame_time_start_ms });
        }

        const deletedId = current.id;
        this.removePath(deletedId);

        return { deletedId, adjustedPaths };
    }

    /** Duplicate/interpolate current path, splitting time ranges */
    duplicateCurrentPath(interpolatedSvg?: string): EntityPath | null
    {
        const all = this.currentEntityAllPaths;
        const idx = this.selectedPathIndex;
        if (idx < 0 || idx >= all.length) return null;

        const current = all[idx];
        if (!current.path) return null; // Can't duplicate an empty path
        if (this.currentTimeMs <= current.frame_time_start_ms) return null; // Can't split at or before start
        const svgPath = interpolatedSvg || current.path;

        const newPath: EntityPath = {
            id: generateId(),
            frame_time_start_ms: this.currentTimeMs,
            frame_time_end_ms: current.frame_time_end_ms,
            path: svgPath,
        };

        // Shrink current path's end to currentTime
        this.updatePath(current.id, { frame_time_end_ms: this.currentTimeMs });

        // Insert new path
        const entityId = this.selectedEntityId!;
        this.entities = this.entities.map(e =>
            e.id === entityId
                ? { ...e, paths: [...e.paths, newPath] }
                : e
        );

        // Select the new path
        const newAll = this.currentEntityAllPaths;
        this.selectedPathIndex = newAll.findIndex(p => p.id === newPath.id);

        this.persist();
        return newPath;
    }

    updatePath(pathId: string, updates: Partial<Omit<EntityPath, 'id'>>): void
    {
        this.entities = this.entities.map(e => ({
            ...e,
            paths: e.paths.map(p =>
                p.id === pathId ? { ...p, ...updates } : p
            ),
        }));
        this.persist();
    }

    // ── Selection ────────────────────────────────────────────────────────

    selectEntity(entityId: string | null): void
    {
        this.selectedEntityId = entityId;
        if (!entityId)
        {
            this.selectedPathIndex = -1;
            return;
        }

        const all = this.currentEntityAllPaths;
        if (all.length > 0)
        {
            this.selectedPathIndex = 0;
            if (this.mediaType === 'video')
                this.currentTimeMs = all[0].frame_time_start_ms;
        }
        else
        {
            this.selectedPathIndex = -1;
        }
    }

    selectPathById(pathId: string | null): void
    {
        if (!pathId)
        {
            this.selectedPathIndex = -1;
            return;
        }

        const entity = this.findEntityByPathId(pathId);
        if (!entity) return;

        this.selectedEntityId = entity.id;

        const all = this.currentEntityAllPaths;
        const idx = all.findIndex(p => p.id === pathId);
        this.selectedPathIndex = idx >= 0 ? idx : -1;

        if (this.mediaType === 'video' && idx >= 0)
            this.currentTimeMs = all[idx].frame_time_start_ms;
    }

    /** Update selectedPathIndex based on currentTimeMs (called when seeking) */
    syncPathIndexToTime(): void
    {
        if (!this.selectedEntityId) return;
        this.selectedPathIndex = this.findPathIndexAtTime(
            this.selectedEntityId, this.currentTimeMs
        );
    }

    // ── Tool / UI ────────────────────────────────────────────────────────

    /** Cancel pending draw: remove empty path at current time and deactivate draw tool */
    cancelPendingDraw(): void
    {
        if (this.activeTool !== 'draw') return;

        // Remove empty path created by createEmptyPath (video mode)
        if (this.selectedEntityId)
        {
            const entity = this.entities.find(e => e.id === this.selectedEntityId);
            const pending = entity?.paths.find(p =>
                !p.path && p.frame_time_start_ms === (this.mediaType === 'video' ? this.currentTimeMs : 0)
            );
            if (pending)
                this.deleteCurrentPath();
        }

        this.activeTool = 'none';
    }

    setTool(tool: ToolMode): void
    {
        this.activeTool = tool;
    }

    toggleDrawMode(): void
    {
        this.drawMode = this.drawMode === 'polygon' ? 'lasso' : 'polygon';
    }

    toggleSidebar(): void
    {
        this.sidebarOpen = !this.sidebarOpen;
    }

    closeSidebar(): void
    {
        this.sidebarOpen = false;
    }

    showToast(message: string, type: 'info' | 'warning' | 'error' = 'info', durationMs = 3000): void
    {
        if (this.toastTimer) clearTimeout(this.toastTimer);
        this.toastMessage = message;
        this.toastType = type;
        this.toastTimer = setTimeout(() => { this.toastMessage = ''; }, durationMs);
    }

    resetMedia(): void
    {
        this.entities = [];
        this.selectedEntityId = null;
        this.selectedPathIndex = -1;
        this.entityColors = {};
        this.colorIndex = 0;
        this.currentTimeMs = 0;
        this.videoDurationMs = 0;
        this.isPlaying = false;
        this.stepIntervalMs = 50;
    }
}

export const editor = new EditorState();
