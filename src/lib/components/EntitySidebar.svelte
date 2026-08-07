<script lang="ts">
    import { editor } from '$lib/stores/editor.svelte';
    import { HitAction } from '$lib/values';
    import { Plus, X, Download, Upload, Trash2 } from '@lucide/svelte';

    let { onDeletePath, onDeleteEntity, onExport, onImport }: {
        onDeletePath: (id: string) => void;
        onDeleteEntity: (entityId: string) => void;
        onExport: () => void;
        onImport: () => void;
    } = $props();

    let entityListEl: HTMLDivElement | undefined = $state();

    const isVideo = $derived(editor.mediaType === 'video');

    const ACTION_OPTIONS: { value: number; label: string }[] = [
        { value: HitAction.NONE, label: 'Ninguna' },
        { value: HitAction.SCORE, label: 'Puntaje' },
        { value: HitAction.NEXT, label: 'Siguiente' },
        { value: HitAction.LOSE, label: 'Perder' },
        { value: HitAction.WIN, label: 'Ganar' },
    ];

    // Auto-scroll to selected entity/path
    $effect(() =>
    {
        const selectedId = editor.selectedPathId ?? editor.selectedEntityId;
        if (!selectedId || !editor.sidebarOpen) return;

        setTimeout(() =>
        {
            if (!entityListEl) return;
            const el = entityListEl.querySelector<HTMLElement>(`[data-id="${selectedId}"]`);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 80);
    });

    function handleEntityClick(entityId: string)
    {
        editor.selectEntity(entityId);
    }

    function handlePathClick(pathId: string)
    {
        editor.selectPathById(pathId);
        editor.activeTool = 'select';
    }

    function handleDeleteEntity(entityId: string, e: MouseEvent)
    {
        e.stopPropagation();
        onDeleteEntity(entityId);
    }

    function handleDeletePath(pathId: string, e: MouseEvent)
    {
        e.stopPropagation();
        onDeletePath(pathId);
    }

    function handleCreateEntity()
    {
        editor.createEntity();
    }

    function handleImport()
    {
        editor.closeSidebar();
        onImport();
    }

    function handleExport()
    {
        editor.closeSidebar();
        onExport();
    }
</script>

{#if editor.sidebarOpen}
    <!-- Backdrop -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="fixed inset-0 z-40 bg-black/20"
        onclick={() => editor.closeSidebar()}
        onkeydown={(e) => { if (e.key === 'Escape') editor.closeSidebar(); }}
    ></div>

    <!-- Right sidebar panel -->
    <div class="fixed top-0 right-0 z-50 w-80 h-full bg-surface-900 shadow-2xl border-l border-surface-700 flex flex-col">
        <!-- Header -->
        <div class="flex items-center justify-between px-4 py-3 border-b border-surface-700 shrink-0">
            <span class="text-sm font-semibold text-white">Panel</span>
            <button
                onclick={() => editor.closeSidebar()}
                class="text-surface-400 hover:text-white p-1"
            >
                <X size={18} />
            </button>
        </div>

        <!-- Tools -->
        <div class="grid grid-cols-2 gap-2 p-3 border-b border-surface-700 shrink-0">
            <button
                class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors bg-surface-800 text-surface-300 hover:bg-surface-700 border border-transparent"
                onclick={handleImport}
            >
                <Upload size={16} /> Importar
            </button>
            <button
                class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors bg-surface-800 text-surface-300 hover:bg-surface-700 border border-transparent"
                onclick={handleExport}
            >
                <Download size={16} /> Exportar
            </button>
        </div>

        <!-- Entities header -->
        <div class="px-4 py-2 shrink-0 flex items-center justify-between border-b border-surface-700">
            <span class="text-xs font-semibold text-surface-400 uppercase tracking-wide">
                Entidades ({editor.entities.length})
            </span>
            <button
                class="flex items-center gap-1 px-2 py-1 text-xs rounded
                       bg-surface-700 hover:bg-surface-600 text-surface-300 transition-colors"
                onclick={handleCreateEntity}
            >
                <Plus size={12} /> Nueva
            </button>
        </div>

        <!-- Entity list -->
        <div bind:this={entityListEl} class="overflow-y-auto flex-1 px-3 py-3 space-y-2">
            {#each editor.entities as entity (entity.id)}
                {@const color = editor.entityColors[entity.id] || '#888'}
                {@const isSelected = editor.selectedEntityId === entity.id}
                {@const visiblePaths = entity.paths.filter(p => !!p.path)}
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                    data-id={entity.id}
                    class="p-3 rounded-lg border transition-colors cursor-pointer
                           {isSelected
                               ? 'bg-surface-700 border-blue-500/50'
                               : 'bg-surface-800 border-surface-700 hover:border-surface-600'}"
                    onclick={() => handleEntityClick(entity.id)}
                    onkeydown={() => {}}
                >
                    <!-- Entity header -->
                    <div class="flex items-center gap-2 mb-2">
                        <span
                            class="w-3 h-3 rounded-full shrink-0"
                            style="background: {color}"
                        ></span>
                        <input
                            type="text"
                            class="flex-1 px-2 py-1 text-sm bg-surface-900 border border-surface-600 rounded text-white placeholder-surface-500"
                            placeholder="Nombre"
                            value={entity.name}
                            oninput={(e) => editor.updateEntity(entity.id, { name: (e.target as HTMLInputElement).value })}
                            onclick={(e) => e.stopPropagation()}
                        />
                        <button
                            class="text-surface-500 hover:text-red-400 p-1"
                            onclick={(e) => handleDeleteEntity(entity.id, e)}
                            aria-label="Eliminar entidad"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>

                    <!-- Entity properties -->
                    <div class="flex gap-2 mb-1">
                        <input
                            type="number"
                            class="w-16 px-2 py-1 text-sm bg-surface-900 border border-surface-600 rounded text-white"
                            placeholder="Score"
                            value={entity.score}
                            oninput={(e) => editor.updateEntity(entity.id, { score: Number((e.target as HTMLInputElement).value) })}
                            onclick={(e) => e.stopPropagation()}
                        />
                        <select
                            class="flex-1 px-2 py-1 text-sm bg-surface-900 border border-surface-600 rounded text-white"
                            value={String(entity.hit_action)}
                            onchange={(e) => editor.updateEntity(entity.id, { hit_action: Number((e.target as HTMLSelectElement).value) })}
                            onclick={(e) => e.stopPropagation()}
                        >
                            {#each ACTION_OPTIONS as opt}
                                <option value={String(opt.value)}>{opt.label}</option>
                            {/each}
                        </select>
                    </div>

                    {#if entity.hit_action === HitAction.NEXT}
                        {#if editor.otherScenes.length > 0}
                            <select
                                class="w-full px-2 py-1 text-sm bg-surface-900 border border-surface-600 rounded text-white mb-1"
                                value={entity.next_scene_id}
                                onchange={(e) => editor.updateEntity(entity.id, { next_scene_id: (e.target as HTMLSelectElement).value })}
                                onclick={(e) => e.stopPropagation()}
                            >
                                <option value="">-- Seleccionar escena --</option>
                                {#each editor.otherScenes as scene}
                                    <option value={scene.id}>{scene.mediaName}</option>
                                {/each}
                            </select>
                        {:else}
                            <p class="text-xs text-surface-500 mb-1 px-1">
                                Agrega más escenas para enlazar
                            </p>
                        {/if}
                    {/if}

                    <!-- Entity paths -->
                    {#if visiblePaths.length > 0}
                        <div class="mt-2 pt-2 border-t border-surface-600 space-y-1">
                            <span class="text-xs text-surface-500">Paths ({visiblePaths.length})</span>
                            {#each visiblePaths as ep (ep.id)}
                                <!-- svelte-ignore a11y_no_static_element_interactions -->
                                <div
                                    data-id={ep.id}
                                    class="flex items-center gap-1.5 py-1 px-2 rounded text-xs transition-colors
                                           {editor.selectedPathId === ep.id
                                               ? 'bg-surface-600'
                                               : 'hover:bg-surface-700'}"
                                    onclick={(e) => { e.stopPropagation(); handlePathClick(ep.id); }}
                                    onkeydown={() => {}}
                                >
                                    <span
                                        class="w-2 h-2 rounded-full shrink-0"
                                        style="background: {color}"
                                    ></span>
                                    {#if isVideo}
                                        <input
                                            type="number"
                                            step="0.05"
                                            class="w-14 px-1 py-0.5 bg-surface-900 border border-surface-600 rounded text-white text-xs font-mono"
                                            value={(ep.frame_time_start_ms / 1000).toFixed(2)}
                                            oninput={(e) => editor.updatePath(ep.id, { frame_time_start_ms: Math.round(Number((e.target as HTMLInputElement).value) * 1000) })}
                                            onclick={(e) => e.stopPropagation()}
                                            title="Inicio (seg)"
                                        />
                                        <span class="text-surface-500">&rarr;</span>
                                        <input
                                            type="number"
                                            step="0.05"
                                            class="w-14 px-1 py-0.5 bg-surface-900 border border-surface-600 rounded text-white text-xs font-mono"
                                            value={(ep.frame_time_end_ms / 1000).toFixed(2)}
                                            oninput={(e) => editor.updatePath(ep.id, { frame_time_end_ms: Math.round(Number((e.target as HTMLInputElement).value) * 1000) })}
                                            onclick={(e) => e.stopPropagation()}
                                            title="Fin (seg)"
                                        />
                                    {:else}
                                        <span class="text-surface-400 font-mono">{ep.id.substring(0, 8)}</span>
                                    {/if}
                                    <div class="flex-1"></div>
                                    <button
                                        class="text-surface-500 hover:text-red-400 p-0.5"
                                        onclick={(e) => handleDeletePath(ep.id, e)}
                                        aria-label="Eliminar path"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            {/each}
                        </div>
                    {/if}
                </div>
            {/each}

            {#if editor.entities.length === 0}
                <p class="text-xs text-surface-500 text-center py-8">
                    Crea una entidad o dibuja directamente
                </p>
            {/if}
        </div>
    </div>
{/if}
