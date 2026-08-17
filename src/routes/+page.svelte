<script lang="ts">
    import Canvas from '$lib/components/Canvas.svelte';
    import EntitySidebar from '$lib/components/EntitySidebar.svelte';
    import VideoTimeline from '$lib/components/VideoTimeline.svelte';
    import CommandBar from '$lib/components/CommandBar.svelte';
    import SceneBar from '$lib/components/SceneBar.svelte';
    import { editor } from '$lib/stores/editor.svelte';
    import { HitAction } from '$lib/values';
    import { generateId } from '$lib/utils';
    import { interpolatePaths, wrapPathData } from '$lib/interpolation';
    import { Film, Image } from '@lucide/svelte';
    import type { HitScenario, HitFile, Entity, EntityPath } from '$lib/models';
    import { clearWorkspace, type WorkspaceData } from '$lib/stores/persistence';
    import type { SceneData } from '$lib/stores/editor.svelte';
    import { saveScenario, uploadMedia } from '$lib/services/apiService';

    let canvasRef: Canvas;
    let fileInputEl: HTMLInputElement;
    let jsonInputEl: HTMLInputElement;

    // ── Restore dialog state ─────────────────────────────────────────────────

    let restoreDialog = $state<{
        show: boolean;
        savedData: WorkspaceData | null;
        currentMediaName: string;
    }>({ show: false, savedData: null, currentMediaName: '' });

    function tryRestore(): void
    {
        const saved = editor.loadSavedWorkspace();
        if (!saved || saved.entities.length === 0) return;

        if (saved.mediaName === editor.mediaName)
            applyRestore(saved);
        else
            restoreDialog = { show: true, savedData: saved, currentMediaName: saved.mediaName };
    }

    function applyRestore(data: WorkspaceData): void
    {
        editor.restoreWorkspace(data);
        for (const entity of data.entities)
        {
            const color = data.entityColors[entity.id] || '#ef4444';
            for (const ep of entity.paths)
                if (ep.path) canvasRef.addVisualPath(ep, color);
        }
    }

    function handleRestoreAccept(): void
    {
        if (restoreDialog.savedData)
            applyRestore(restoreDialog.savedData);
        restoreDialog = { show: false, savedData: null, currentMediaName: '' };
    }

    function handleRestoreDecline(): void
    {
        clearWorkspace();
        restoreDialog = { show: false, savedData: null, currentMediaName: '' };
    }

    // ── Scene management ──────────────────────────────────────────────────────

    /**
     * Load a file into the canvas. The `forSceneId` guard ensures that if the user
     * switches scenes before the async load completes, the stale `onReady` callback
     * is discarded — preventing paths from a previous load from painting on top of
     * the newly active scene.
     */
    function loadSceneIntoCanvas(file: File, forSceneId: string, onReady?: () => void): void
    {
        const guardedOnReady = onReady
            ? () => { if (editor.activeSceneId === forSceneId) onReady(); }
            : undefined;

        if (file.type.startsWith('video/'))
            canvasRef.loadVideo(file, guardedOnReady);
        else
            canvasRef.loadImage(file, guardedOnReady);
    }

    function restoreSceneVisuals(scene: SceneData): void
    {
        editor.entities = scene.entities;
        editor.entityColors = scene.entityColors;
        editor.colorIndex = scene.colorIndex;
        for (const entity of scene.entities)
        {
            const color = scene.entityColors[entity.id] || '#ef4444';
            for (const ep of entity.paths)
                if (ep.path) canvasRef.addVisualPath(ep, color);
        }
        // Restore video position to where the user left off
        if (scene.mediaType === 'video' && scene.currentTimeMs > 0)
            canvasRef.seekTo(scene.currentTimeMs);
    }

    /** Called when user adds the very first file or a new scene via SceneBar */
    function handleAddScene(file: File): void
    {
        // Flush and clear current scene if one exists
        if (editor.scenes.length > 0)
        {
            editor.flushToActiveScene();
            canvasRef.clearAllVisuals();
        }

        const isFirst = editor.scenes.length === 0;
        const scene = editor.addScene(file);

        // For new (empty) scenes we don't need to restore anything.
        // For the first scene, try to restore a previously saved workspace.
        const onReady = isFirst ? () => tryRestore() : undefined;
        loadSceneIntoCanvas(file, scene.id, onReady);
    }

    /** Switch the canvas to an already-loaded scene */
    function handleSwitchScene(id: string): void
    {
        if (id === editor.activeSceneId) return;

        // Save current scene state (including currentTimeMs)
        editor.flushToActiveScene();

        // Clear canvas visuals
        canvasRef.clearAllVisuals();

        // Get target scene data before the canvas resets editor.entities via resetMedia
        const targetScene = editor.scenes.find(s => s.id === id)!;

        // Update active scene metadata (for UI reactivity)
        editor.activeSceneId = id;
        editor.mediaName = targetScene.mediaName;
        editor.mediaType = targetScene.mediaType;
        editor.isPlaying = false;
        editor.selectedEntityId = null;
        editor.selectedPathIndex = -1;

        // Load canvas — resetMedia (inside loadVideo/loadImage) will clear entities,
        // then onReady restores them from the scene snapshot
        if (targetScene.file)
            loadSceneIntoCanvas(targetScene.file, id, () => restoreSceneVisuals(targetScene));
    }

    /** Remove a scene; if it was active, switch to the first remaining one */
    function handleRemoveScene(id: string): void
    {
        const wasActive = editor.activeSceneId === id;

        if (wasActive)
        {
            editor.flushToActiveScene();
            canvasRef.clearAllVisuals();
        }

        const nextId = editor.removeScene(id);

        if (wasActive)
        {
            if (nextId)
            {
                const nextScene = editor.scenes.find(s => s.id === nextId)!;
                editor.activeSceneId = nextId;
                editor.mediaName = nextScene.mediaName;
                editor.mediaType = nextScene.mediaType;
                editor.isPlaying = false;
                editor.selectedEntityId = null;
                editor.selectedPathIndex = -1;

                if (nextScene.file)
                    loadSceneIntoCanvas(nextScene.file, nextId, () => restoreSceneVisuals(nextScene));
            }
            else
            {
                // No more scenes
                editor.mediaLoaded = false;
                editor.mediaName = '';
                editor.activeSceneId = null;
            }
        }
    }

    // ── Legacy single-file upload (initial load via overlay) ─────────────────

    function handleFileSelect(e: Event): void
    {
        const file = (e.currentTarget as HTMLInputElement).files?.[0];
        if (file) handleAddScene(file);
    }

    function handleDrop(e: DragEvent): void
    {
        e.preventDefault();
        const file = e.dataTransfer?.files[0];
        if (file) handleAddScene(file);
    }

    function handleDragOver(e: DragEvent): void { e.preventDefault(); }

    // ── Seek ──────────────────────────────────────────────────────────────────

    function doSeek(ms: number): void
    {
        canvasRef.seekTo(ms);
        editor.syncPathIndexToTime();
    }

    // ── Command Bar actions ──────────────────────────────────────────────────

    function handleCmdNewPath(): void
    {
        if (editor.mediaType === 'video')
            editor.createEmptyPath();
        editor.activeTool = 'draw';
    }

    function handleCmdDuplicatePath(): void
    {
        const current = editor.currentPath;
        if (!current || !current.path) return;

        let interpolatedSvg: string | undefined;

        if (editor.hasNextPath)
        {
            const next = editor.nextFilledPath!;
            const startTime = current.frame_time_start_ms;
            const endTime = next.frame_time_start_ms;
            if (endTime > startTime)
            {
                const t = (editor.currentTimeMs - startTime) / (endTime - startTime);
                try
                {
                    const d = interpolatePaths(current.path, next.path, t);
                    interpolatedSvg = wrapPathData(d);
                }
                catch
                {
                    editor.showToast('Interpolacion no disponible. Se creo una copia.', 'warning');
                }
            }
        }

        const newPath = editor.duplicateCurrentPath(interpolatedSvg);
        if (newPath)
        {
            const color = editor.getPathColor(newPath.id);
            canvasRef.addVisualPath(newPath, color);
        }
    }

    function handleCmdDeletePath(): void
    {
        const result = editor.deleteCurrentPath();
        if (result)
            canvasRef.deletePathVisual(result.deletedId);
    }

    // ── Path / Entity actions ────────────────────────────────────────────────

    function handleDeletePath(id: string): void
    {
        canvasRef.deletePathVisual(id);
        editor.removePath(id);
    }

    function handleDeleteEntity(entityId: string): void
    {
        const pathIds = editor.removeEntity(entityId);
        for (const id of pathIds)
            canvasRef.deletePathVisual(id);
    }

    function handlePathDblClick(id: string): void
    {
        editor.selectPathById(id);
        editor.sidebarOpen = true;
    }

    // ── Export ────────────────────────────────────────────────────────────────

    function handleExport(): void
    {
        // Flush active scene before exporting
        editor.flushToActiveScene();

        const files: HitFile[] = editor.scenes.map(scene =>
        {
            const exportEntities: Entity[] = scene.entities
                .map(e => ({ ...e, paths: e.paths.filter(p => !!p.path) }))
                .filter(e => e.paths.length > 0);

            return {
                id: scene.id,
                file_path: scene.mediaName,
                timeout_sec: 0,
                timeout_action: HitAction.NONE,
                entities: exportEntities,
                video_settings: scene.mediaType === 'video' ? { loop: false } : null,
            };
        });

        const scenario: HitScenario = {
            id: generateId(),
            title: editor.scenes[0]?.mediaName.replace(/\.[^.]+$/, '') || 'scenario',
            description: '',
            viewbox_w: editor.mediaWidth,
            viewbox_h: editor.mediaHeight,
            files,
        };

        const json = JSON.stringify(scenario, null, '\t');
        const blob = new Blob([json], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url;
        a.download = 'scenario.json';
        a.click();
        URL.revokeObjectURL(url);
    }

    // ── Publicar en el servidor ───────────────────────────────────────────────

    let publishing = $state(false);
    let publishMsg = $state('');

    async function handlePublish(): Promise<void>
    {
        if (editor.scenes.length === 0) return;

        const name = prompt(
            'Nombre del escenario:',
            editor.scenes[0]?.mediaName.replace(/\.[^.]+$/, '') || 'escenario'
        );
        if (!name) return;

        publishing = true;
        publishMsg = '';

        try {
            // 1. Construir el mismo JSON que exporta el botón de descarga
            const files = editor.scenes.map(scene => {
                const exportEntities: Entity[] = scene.entities
                    .map(e => ({ ...e, paths: e.paths.filter(p => !!p.path) }))
                    .filter(e => e.paths.length > 0);
                return {
                    id: scene.id,
                    file_path: scene.mediaName,
                    timeout_sec: 0,
                    timeout_action: HitAction.NONE,
                    entities: exportEntities,
                    video_settings: scene.mediaType === 'video' ? { loop: false } : null,
                };
            });

            const scenario: HitScenario = {
                id: generateId(),
                title: name,
                description: '',
                viewbox_w: editor.mediaWidth,
                viewbox_h: editor.mediaHeight,
                files,
            };

            // 2. Crear el escenario en el servidor
            publishMsg = 'Creando escenario...';
            const saved = await saveScenario(name, 'full', scenario);

            // 3. Subir los archivos de cada escena
            let done = 0;
            const total = editor.scenes.filter(s => s.file).length;
            for (const scene of editor.scenes) {
                if (!scene.file) continue;
                done++;
                publishMsg = `Subiendo ${scene.mediaName} (${done}/${total})...`;
                await uploadMedia(saved.id, scene.file);
            }

            publishMsg = '';
            alert(`Escenario "${name}" publicado.\n\nYa aparece en la lista de escenarios.`);
        } catch (e) {
            publishMsg = '';
            alert(`No se pudo publicar: ${(e as Error).message}`);
        } finally {
            publishing = false;
        }
    }

    // ── Import ────────────────────────────────────────────────────────────────

    function handleImportJson(e: Event): void
    {
        const file = (e.currentTarget as HTMLInputElement).files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (ev) =>
        {
            try
            {
                const scenario = JSON.parse(ev.target?.result as string) as HitScenario;
                if (!scenario.files || scenario.files.length === 0) return;

                const hitFile = scenario.files.find(f => f.file_path === editor.mediaName)
                    ?? scenario.files[0];

                applyImportedFile(hitFile);
            }
            catch { /* invalid JSON */ }
        };
        reader.readAsText(file);
        (e.currentTarget as HTMLInputElement).value = '';
    }

    function applyImportedFile(hitFile: HitFile): void
    {
        // Clear existing
        for (const entity of [...editor.entities])
        {
            const pathIds = editor.removeEntity(entity.id);
            for (const id of pathIds)
                canvasRef.deletePathVisual(id);
        }

        // Check if new format (entities) or legacy (paths)
        const raw = hitFile as any;
        const entities: Entity[] = hitFile.entities?.length
            ? hitFile.entities
            : convertLegacyPaths(raw.paths ?? []);

        // Add entities and render paths
        for (const entity of entities)
        {
            const color = editor.nextColor();
            const entityId = entity.id || generateId();

            const newEntity: Entity = {
                ...entity,
                id: entityId,
                paths: entity.paths.map(p => ({
                    ...p,
                    id: p.id || generateId(),
                })),
            };

            editor.entities = [...editor.entities, newEntity];
            editor.entityColors = { ...editor.entityColors, [entityId]: color };

            for (const ep of newEntity.paths)
                if (ep.path) canvasRef.addVisualPath(ep, color);
        }

        if (entities.length > 0)
            editor.sidebarOpen = true;
    }

    /** Convert legacy flat HitPath[] to Entity[] grouped by (action, score, next_scene_id) */
    function convertLegacyPaths(paths: any[]): Entity[]
    {
        const groups = new Map<string, { paths: any[]; first: any }>();

        for (const p of paths)
        {
            if (!p.path) continue;
            const key = `${p.action}_${p.score}_${p.next_scene_id ?? ''}`;
            if (!groups.has(key))
                groups.set(key, { paths: [], first: p });
            groups.get(key)!.paths.push(p);
        }

        return [...groups.values()].map(({ paths: gPaths, first }) => ({
            id: generateId(),
            name: first.label || 'Importado',
            hit_action: first.action ?? HitAction.SCORE,
            score: first.score ?? 0,
            next_scene_id: first.next_scene_id ?? '',
            paths: gPaths.map((p: any) =>
            {
                let startMs = p.frame_time_ms ?? 0;
                if ('frame_time_sec' in p && p.frame_time_sec !== undefined)
                    startMs = Math.round(p.frame_time_sec * 1000);

                return {
                    id: p.id || generateId(),
                    frame_time_start_ms: startMs,
                    frame_time_end_ms: 0,
                    path: p.path,
                };
            }),
        }));
    }

    function triggerImportJson(): void
    {
        jsonInputEl.click();
    }

    // ── Cancel draw on click outside canvas ─────────────────────────────────

    function handleGlobalPointerDown(e: PointerEvent): void
    {
        if (editor.activeTool !== 'draw') return;
        const target = e.target as HTMLElement;
        if (target.closest('canvas')) return;
        editor.cancelPendingDraw();
    }

    // ── Keyboard shortcuts (video) ────────────────────────────────────────────

    function handleKeydown(e: KeyboardEvent): void
    {
        if (editor.mediaType !== 'video' || !editor.mediaLoaded) return;
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;

        switch (e.key)
        {
            case ' ':
                e.preventDefault();
                if (editor.isPlaying) canvasRef.pauseVideo();
                else canvasRef.playVideo();
                break;
            case 'ArrowLeft':
                e.preventDefault();
                doSeek(editor.currentTimeMs - (e.shiftKey ? 1000 : 100));
                break;
            case 'ArrowRight':
                e.preventDefault();
                doSeek(editor.currentTimeMs + (e.shiftKey ? 1000 : 100));
                break;
        }
    }
</script>

<svelte:window onkeydown={handleKeydown} onpointerdown={handleGlobalPointerDown} />

<!-- Full-screen flex column layout -->
<div class="flex flex-col h-screen">

    <!-- Scene tabs bar (shown once at least one scene is loaded) -->
    {#if editor.scenes.length > 0}
        <SceneBar
            onAddScene={handleAddScene}
            onSwitchScene={handleSwitchScene}
            onRemoveScene={handleRemoveScene}
        />
    {/if}

    <!-- Canvas area: grows to fill remaining space -->
    <div class="flex-1 min-h-0">
        <Canvas
            bind:this={canvasRef}
            onPathDblClick={handlePathDblClick}
        />
    </div>

    <!-- Command bar: visible when media is loaded -->
    {#if editor.mediaLoaded}
        <CommandBar
            onNewPath={handleCmdNewPath}
            onDuplicatePath={handleCmdDuplicatePath}
            onDeletePath={handleCmdDeletePath}
        />
    {/if}

    <!-- Timeline: only visible when a video is loaded -->
    {#if editor.mediaType === 'video' && editor.mediaLoaded}
        <VideoTimeline
            onSeek={doSeek}
            onPlay={() => canvasRef.playVideo()}
            onPause={() => canvasRef.pauseVideo()}
        />
    {/if}

</div>

<!-- Upload overlay (shown until the first scene is created) -->
{#if editor.scenes.length === 0}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="fixed inset-0 z-30 flex flex-col items-center justify-center bg-surface-900"
        ondragover={handleDragOver}
        ondrop={handleDrop}
    >
        <button
            class="flex flex-col items-center gap-4 p-12 border-2 border-dashed border-surface-600
                   rounded-2xl hover:border-surface-400 hover:bg-surface-800/50 transition-colors cursor-pointer"
            onclick={() => fileInputEl.click()}
        >
            <div class="flex gap-4 text-surface-400">
                <Image size={40} />
                <Film size={40} />
            </div>
            <div class="text-center">
                <p class="text-lg text-surface-300">Cargar imagen o video</p>
                <p class="text-sm text-surface-500 mt-1">Click o arrastra un archivo</p>
                <p class="text-xs text-surface-600 mt-3">Imágenes: PNG, JPG, WebP · Videos: MP4, WebM, MOV</p>
            </div>
        </button>
        <input
            bind:this={fileInputEl}
            type="file"
            accept="image/*,video/*"
            class="hidden"
            onchange={handleFileSelect}
        />
    </div>
{/if}

<!-- Hidden JSON input (always in DOM so import works when media is loaded) -->
<input
    bind:this={jsonInputEl}
    type="file"
    accept=".json,application/json"
    class="hidden"
    onchange={handleImportJson}
/>

<!-- Entity sidebar (tools + entities) -->
{#if editor.mediaLoaded}
    <EntitySidebar
        onDeletePath={handleDeletePath}
        onDeleteEntity={handleDeleteEntity}
        onExport={handleExport}
        onPublish={handlePublish}
        {publishing}
        onImport={triggerImportJson}
    />
{/if}

<!-- Toast notification -->
{#if editor.toastMessage}
    <div
        class="fixed top-4 left-1/2 -translate-x-1/2 z-[300] px-4 py-2.5 rounded-lg shadow-xl text-sm font-medium
               transition-opacity duration-300 pointer-events-none
               {editor.toastType === 'warning' ? 'bg-amber-600 text-white' :
                editor.toastType === 'error' ? 'bg-red-600 text-white' :
                'bg-surface-700 text-surface-200'}"
    >
        {editor.toastMessage}
    </div>
{/if}

<!-- Restore dialog -->
{#if restoreDialog.show}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div class="bg-surface-800 rounded-xl p-6 max-w-md mx-4 shadow-2xl border border-surface-600">
            <h3 class="text-lg font-semibold text-surface-100 mb-2">Trabajo guardado encontrado</h3>
            <p class="text-sm text-surface-300 mb-4">
                Se encontró trabajo guardado del archivo
                <span class="font-mono text-primary-400">{restoreDialog.currentMediaName}</span>.
                ¿Deseas restaurarlo sobre el archivo actual?
            </p>
            <div class="flex gap-3 justify-end">
                <button
                    class="px-4 py-2 rounded-lg text-sm bg-surface-700 hover:bg-surface-600 text-surface-300 transition-colors"
                    onclick={handleRestoreDecline}
                >
                    Empezar limpio
                </button>
                <button
                    class="px-4 py-2 rounded-lg text-sm bg-primary-600 hover:bg-primary-500 text-white transition-colors"
                    onclick={handleRestoreAccept}
                >
                    Restaurar
                </button>
            </div>
        </div>
    </div>
{/if}