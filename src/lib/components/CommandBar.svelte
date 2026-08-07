<script lang="ts">
    import { editor } from '$lib/stores/editor.svelte';
    import { Plus, Copy, Minus, Lasso, Pentagon, PanelRightOpen, PanelRightClose, MousePointer2, Move, Trash2 } from '@lucide/svelte';

    let { onNewPath, onDuplicatePath, onDeletePath }: {
        onNewPath: () => void;
        onDuplicatePath: () => void;
        onDeletePath: () => void;
    } = $props();

    const isVideo = $derived(editor.mediaType === 'video');

    const entity = $derived(editor.currentEntity);
    const currentPath = $derived(editor.currentPath);
    const hasPath = $derived(!!currentPath && !!currentPath.path);
    const canInterpolate = $derived(editor.hasNextPath);
</script>

<div class="command-bar select-none bg-surface-900 border-t border-surface-700 px-4 py-2 flex items-center gap-3">

    <!-- Tool group: Seleccionar / Modificar / Eliminar -->
    <div class="flex items-center rounded-lg overflow-hidden border border-surface-700">
        <button
            class="flex items-center gap-1 px-2.5 py-1 text-xs transition-colors
                   {editor.activeTool === 'select'
                       ? 'bg-green-500/20 text-green-400'
                       : 'bg-surface-800 text-surface-400 hover:bg-surface-700'}"
            onclick={() => editor.setTool('select')}
            title="Seleccionar path (solo información)"
        >
            <MousePointer2 size={14} /> Seleccionar
        </button>
        <button
            class="flex items-center gap-1 px-2.5 py-1 text-xs transition-colors border-l border-surface-700
                   {editor.activeTool === 'modify'
                       ? 'bg-yellow-500/20 text-yellow-400'
                       : 'bg-surface-800 text-surface-400 hover:bg-surface-700'}"
            onclick={() => editor.setTool('modify')}
            title="Modificar path (arrastrar puntos y forma)"
        >
            <Move size={14} /> Modificar
        </button>
        <button
            class="flex items-center gap-1 px-2.5 py-1 text-xs transition-colors border-l border-surface-700
                   {editor.activeTool === 'delete'
                       ? 'bg-red-500/20 text-red-400'
                       : 'bg-surface-800 text-surface-400 hover:bg-surface-700'}"
            onclick={() => editor.setTool('delete')}
            title="Eliminar path"
        >
            <Trash2 size={14} /> Eliminar
        </button>
    </div>

    <span class="text-surface-600">|</span>

    <!-- Draw mode toggle (polygon / lasso) -->
    <div class="flex items-center rounded-lg overflow-hidden border border-surface-700">
        <button
            class="flex items-center gap-1 px-2.5 py-1 text-xs transition-colors
                   {editor.drawMode === 'lasso'
                       ? 'bg-blue-500/20 text-blue-400'
                       : 'bg-surface-800 text-surface-400 hover:bg-surface-700'}"
            onclick={() => editor.drawMode = 'lasso'}
            title="Modo lazo (dibujo libre)"
        >
            <Lasso size={14} /> Lazo
        </button>
        <button
            class="flex items-center gap-1 px-2.5 py-1 text-xs transition-colors border-l border-surface-700
                   {editor.drawMode === 'polygon'
                       ? 'bg-blue-500/20 text-blue-400'
                       : 'bg-surface-800 text-surface-400 hover:bg-surface-700'}"
            onclick={() => editor.drawMode = 'polygon'}
            title="Modo polígono (click por punto)"
        >
            <Pentagon size={14} /> Polígono
        </button>
    </div>

    <span class="text-surface-600">|</span>

    <!-- Entity name -->
    <div class="flex items-center gap-2 min-w-0">
        {#if entity}
            {@const color = editor.entityColors[entity.id] || '#888'}
            <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background: {color}"></span>
            <input
                type="text"
                class="text-sm text-surface-200 truncate bg-transparent border border-transparent rounded px-1
                       hover:border-surface-600 focus:border-surface-500 focus:bg-surface-800 focus:outline-none
                       cursor-pointer focus:cursor-text transition-colors w-28"
                value={entity.name}
                oninput={(e) => editor.updateEntity(entity.id, { name: (e.target as HTMLInputElement).value })}
                onkeydown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            />
        {:else}
            <span class="text-sm text-surface-500 italic">Sin entidad</span>
        {/if}
    </div>

    <span class="text-surface-600">|</span>

    <!-- Path info -->
    <span class="text-sm text-surface-400">
        Path:
        {#if currentPath}
            <span class="text-surface-200 font-mono">{editor.selectedPathIndex + 1}/{editor.currentEntityAllPaths.length}</span>
            {#if !currentPath.path}
                <span class="text-amber-400 text-xs ml-1">(vacío)</span>
            {/if}
        {:else}
            <span class="text-surface-500">--</span>
        {/if}
    </span>

    <!-- Commands -->
    <div class="flex items-center gap-1">
        <!-- [+] New path -->
        <button
            class="flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors
                   bg-surface-700 hover:bg-surface-600 text-surface-300"
            onclick={onNewPath}
            title="Nuevo path - activa el calco sobre el lienzo"
        >
            <Plus size={12} />
        </button>

        {#if isVideo}
            <!-- [D] Duplicate/Interpolate -->
            <button
                class="flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors
                       {hasPath
                           ? 'bg-surface-700 hover:bg-surface-600 text-surface-300'
                           : 'bg-surface-800 text-surface-600 cursor-not-allowed'}"
                onclick={onDuplicatePath}
                disabled={!hasPath}
                title={canInterpolate ? 'Duplicar path (interpolado)' : 'Duplicar path (copia)'}
            >
                <Copy size={12} />
            </button>

            <!-- [-] Delete path -->
            <button
                class="flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors
                       {hasPath
                           ? 'bg-surface-700 hover:bg-red-600/30 text-surface-300 hover:text-red-400'
                           : 'bg-surface-800 text-surface-600 cursor-not-allowed'}"
                onclick={onDeletePath}
                disabled={!hasPath}
                title="Eliminar path actual"
            >
                <Minus size={12} />
            </button>
        {/if}
    </div>

    <div class="flex-1"></div>

    <!-- Sidebar toggle -->
    <button
        class="flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors
               {editor.sidebarOpen
                   ? 'bg-blue-500/20 text-blue-400'
                   : 'bg-surface-700 hover:bg-surface-600 text-surface-400'}"
        onclick={() => editor.toggleSidebar()}
        title={editor.sidebarOpen ? 'Cerrar panel de entidades' : 'Abrir panel de entidades'}
    >
        {#if editor.sidebarOpen}
            <PanelRightClose size={16} />
        {:else}
            <PanelRightOpen size={16} />
        {/if}
        <span class="text-surface-400">{editor.entities.length} ent</span>
    </button>
</div>
