<script lang="ts">
    import { editor } from '$lib/stores/editor.svelte';
    import { Film, Image, Plus, X } from '@lucide/svelte';

    let { onAddScene, onSwitchScene, onRemoveScene }: {
        onAddScene: (file: File) => void;
        onSwitchScene: (id: string) => void;
        onRemoveScene: (id: string) => void;
    } = $props();

    let fileInputEl: HTMLInputElement;

    function handleFileChange(e: Event): void
    {
        const file = (e.currentTarget as HTMLInputElement).files?.[0];
        if (file)
        {
            onAddScene(file);
            (e.currentTarget as HTMLInputElement).value = '';
        }
    }
</script>

<div class="flex items-center gap-1 px-2 h-9 bg-surface-950 border-b border-surface-700 overflow-x-auto shrink-0">
    {#each editor.scenes as scene (scene.id)}
        {@const isActive = editor.activeSceneId === scene.id}
        <button
            class="flex items-center gap-1.5 px-3 h-full text-xs whitespace-nowrap transition-colors border-b-2 shrink-0
                   {isActive
                       ? 'border-primary-500 text-white bg-surface-800'
                       : 'border-transparent text-surface-400 hover:text-surface-200 hover:bg-surface-800/50'}"
            onclick={() => onSwitchScene(scene.id)}
        >
            {#if scene.mediaType === 'video'}
                <Film size={11} />
            {:else}
                <Image size={11} />
            {/if}
            <span class="max-w-32 truncate">{scene.mediaName}</span>
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <span
                class="ml-0.5 text-surface-600 hover:text-red-400 transition-colors p-0.5 rounded"
                onclick={(e) => { e.stopPropagation(); onRemoveScene(scene.id); }}
            >
                <X size={10} />
            </span>
        </button>
    {/each}

    <button
        class="flex items-center gap-1 px-2 h-full text-xs text-surface-500 hover:text-surface-200
               hover:bg-surface-800/50 transition-colors shrink-0 ml-1"
        onclick={() => fileInputEl.click()}
        title="Agregar escena"
    >
        <Plus size={12} />
        <span>Escena</span>
    </button>

    <input
        bind:this={fileInputEl}
        type="file"
        accept="image/*,video/*"
        class="hidden"
        onchange={handleFileChange}
    />
</div>
