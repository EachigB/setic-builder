<script lang="ts">
    import { editor } from '$lib/stores/editor.svelte';
    import { formatTimeMs } from '$lib/utils';
    import { Play, Pause, SkipBack, SkipForward, ChevronLeft, ChevronRight } from '@lucide/svelte';

    let { onSeek, onPlay, onPause }: {
        onSeek:  (ms: number) => void;
        onPlay:  () => void;
        onPause: () => void;
    } = $props();

    let timelineEl: HTMLDivElement;
    let isDragging = $state(false);

    // Tooltip state
    let hoveredKf   = $state<number | null>(null);
    let tooltipX    = $state(0);
    let tooltipY    = $state(0);
    let tooltipSide = $state<'left' | 'right'>('left');

    const ACTION_LABELS: Record<number, string> = {
        0: 'Ninguna', 1: 'Puntaje', 2: 'Siguiente', 3: 'Perder', 4: 'Ganar',
    };

    function showTooltip(e: MouseEvent, kfMs: number): void
    {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        tooltipX    = rect.left + rect.width / 2;
        tooltipY    = rect.top;
        tooltipSide = tooltipX > window.innerWidth / 2 ? 'right' : 'left';
        hoveredKf   = kfMs;
    }

    function hideTooltip(): void
    {
        hoveredKf = null;
    }

    /** Entities that have paths starting at the given timestamp (filled + empty) */
    function entitiesAtKf(kfMs: number)
    {
        return editor.entities
            .map(e => ({
                entity: e,
                filledPaths: e.paths.filter(p => p.frame_time_start_ms === kfMs && !!p.path),
                emptyPaths: e.paths.filter(p => p.frame_time_start_ms === kfMs && !p.path),
            }))
            .filter(x => x.filledPaths.length > 0 || x.emptyPaths.length > 0);
    }

    /** Whether a keyframe has only empty paths (no filled) */
    function isEmptyOnlyKf(kfMs: number): boolean
    {
        const items = entitiesAtKf(kfMs);
        return items.length > 0 && items.every(x => x.filledPaths.length === 0);
    }

    const progress = $derived(
        editor.videoDurationMs > 0 ? editor.currentTimeMs / editor.videoDurationMs : 0
    );

    const displayKfs = $derived(
        editor.currentEntityKeyframes.length > 0
            ? editor.currentEntityKeyframes
            : editor.keyframeTimestamps
    );

    /** Format interval ms as ".05", ".10", ".25" */
    function fmtInterval(ms: number): string {
        return (ms / 1000).toFixed(2).replace(/^0/, '');
    }

    function togglePlayPause(): void
    {
        if (editor.isPlaying) onPause();
        else onPlay();
    }

    function getMsFromPointer(e: PointerEvent): number
    {
        const rect = timelineEl.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        return Math.round(ratio * editor.videoDurationMs);
    }

    function onPointerDown(e: PointerEvent): void
    {
        isDragging = true;
        timelineEl.setPointerCapture(e.pointerId);
        if (editor.isPlaying) onPause();
        onSeek(getMsFromPointer(e));
    }

    function onPointerMove(e: PointerEvent): void
    {
        if (!isDragging) return;
        onSeek(getMsFromPointer(e));
    }

    function onPointerUp(): void
    {
        isDragging = false;
    }

    /** Seek to the nearest keyframe in the given direction (uses current entity keyframes) */
    function stepKeyframe(dir: -1 | 1): void
    {
        const kfs = editor.currentEntityKeyframes.length > 0
            ? editor.currentEntityKeyframes
            : editor.keyframeTimestamps;
        if (kfs.length === 0) return;
        if (dir === 1)
        {
            const next = kfs.find(t => t > editor.currentTimeMs);
            if (next !== undefined) onSeek(next);
        }
        else
        {
            const prev = [...kfs].reverse().find(t => t < editor.currentTimeMs);
            if (prev !== undefined) onSeek(prev);
        }
    }
</script>

<div class="video-timeline select-none bg-surface-950 border-t border-surface-700 px-4 pt-2 pb-3 flex flex-col gap-2">

    <!-- Controls row -->
    <div class="flex items-center gap-1.5 flex-wrap">

        <!-- Prev keyframe -->
        <button
            class="p-1.5 rounded text-surface-400 hover:text-white hover:bg-surface-700 transition-colors"
            onclick={() => stepKeyframe(-1)}
            title="Keyframe anterior"
        >
            <SkipBack size={16} />
        </button>

        <!-- Play / Pause -->
        <button
            class="p-1.5 rounded text-white hover:bg-surface-700 transition-colors"
            onclick={togglePlayPause}
            title={editor.isPlaying ? 'Pausar (Space)' : 'Reproducir (Space)'}
        >
            {#if editor.isPlaying}
                <Pause size={18} />
            {:else}
                <Play size={18} />
            {/if}
        </button>

        <!-- Next keyframe -->
        <button
            class="p-1.5 rounded text-surface-400 hover:text-white hover:bg-surface-700 transition-colors"
            onclick={() => stepKeyframe(1)}
            title="Keyframe siguiente"
        >
            <SkipForward size={16} />
        </button>

        <!-- Time display -->
        <span class="text-sm font-mono text-surface-200 ml-1">
            {formatTimeMs(editor.currentTimeMs)}
        </span>
        <span class="text-xs text-surface-500">
            / {formatTimeMs(editor.videoDurationMs)}
        </span>

        <!-- Spacer -->
        <div class="flex-1"></div>

        <!-- Interval navigation: ◄ [.05] ► -->
        <div class="flex items-center gap-0.5">
            <button
                class="p-1.5 rounded text-surface-300 hover:text-white hover:bg-surface-700 transition-colors"
                onclick={() => onSeek(editor.currentTimeMs - editor.stepIntervalMs)}
                title="Retroceder {fmtInterval(editor.stepIntervalMs)}s"
            >
                <ChevronLeft size={16} />
            </button>

            <button
                class="px-2.5 py-1 rounded text-xs font-mono font-semibold
                       border border-surface-500 text-surface-200
                       hover:border-surface-300 hover:text-white
                       transition-colors min-w-[3rem] text-center"
                onclick={() => editor.cycleInterval()}
                title="Cambiar intervalo (cicla entre .05, .10, .25)"
            >
                {fmtInterval(editor.stepIntervalMs)}
            </button>

            <button
                class="p-1.5 rounded text-surface-300 hover:text-white hover:bg-surface-700 transition-colors"
                onclick={() => onSeek(editor.currentTimeMs + editor.stepIntervalMs)}
                title="Avanzar {fmtInterval(editor.stepIntervalMs)}s"
            >
                <ChevronRight size={16} />
            </button>
        </div>

        <!-- Entity & path stats -->
        <div class="flex items-center gap-2 text-xs text-surface-500 ml-1">
            <span>
                <span class="text-amber-400 font-semibold">{editor.entities.length}</span> ent
            </span>
            <span>
                <span class="text-blue-400 font-semibold">{editor.totalPathCount}</span> paths
            </span>
        </div>
    </div>

    <!-- Timeline track -->
    <div
        bind:this={timelineEl}
        class="relative h-8 cursor-pointer"
        onpointerdown={onPointerDown}
        onpointermove={onPointerMove}
        onpointerup={onPointerUp}
        role="slider"
        aria-label="Timeline de video"
        aria-valuenow={editor.currentTimeMs}
        aria-valuemin={0}
        aria-valuemax={editor.videoDurationMs}
        tabindex="0"
    >
        <!-- Track background -->
        <div class="absolute inset-0 flex items-center pointer-events-none">
            <div class="w-full h-1.5 rounded-full bg-surface-700">
                <!-- Progress fill -->
                <div
                    class="h-full rounded-full bg-blue-600"
                    style:width="{progress * 100}%"
                ></div>
            </div>
        </div>

        <!-- Keyframe markers (current entity or all) -->
        {#each displayKfs as kfMs (kfMs)}
            {@const leftPct = editor.videoDurationMs > 0
                ? (kfMs / editor.videoDurationMs) * 100
                : 0}
            {@const isActive = kfMs <= editor.currentTimeMs
                && (displayKfs.filter(t => t <= editor.currentTimeMs).at(-1) === kfMs)}
            {@const isEmpty = isEmptyOnlyKf(kfMs)}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
                class="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full transition-transform hover:scale-150 z-10 pointer-events-auto cursor-pointer"
                class:w-3={!isActive}
                class:h-3={!isActive}
                class:w-4={isActive}
                class:h-4={isActive}
                class:bg-amber-400={!isEmpty && !isActive}
                class:bg-amber-300={!isEmpty && isActive}
                class:bg-transparent={isEmpty}
                class:border-2={true}
                class:border-surface-900={!isEmpty}
                class:border-amber-400={isEmpty}
                style:left="{leftPct}%"
                onclick={(e) => { e.stopPropagation(); onSeek(kfMs); }}
                onmouseenter={(e) => showTooltip(e, kfMs)}
                onmouseleave={hideTooltip}
            ></div>
        {/each}

        <!-- Playhead -->
        <div
            class="absolute top-0 bottom-0 w-0.5 bg-white z-20 -translate-x-1/2 pointer-events-none"
            style:left="{progress * 100}%"
        >
            <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow-md"></div>
        </div>
    </div>

</div>

<!-- Keyframe hover tooltip -->
{#if hoveredKf !== null}
    {@const items = entitiesAtKf(hoveredKf)}
    {@const totalFilled = items.reduce((n, x) => n + x.filledPaths.length, 0)}
    {@const totalEmpty = items.reduce((n, x) => n + x.emptyPaths.length, 0)}
    <div
        class="fixed z-[200] pointer-events-none"
        style:left="{tooltipSide === 'left' ? tooltipX + 8 : 'auto'}px"
        style:right="{tooltipSide === 'right' ? window.innerWidth - tooltipX + 8 : 'auto'}px"
        style:bottom="{window.innerHeight - tooltipY + 10}px"
    >
        <div class="bg-surface-800 border border-surface-600 rounded-lg shadow-xl text-xs w-52 overflow-hidden">
            <!-- Timestamp header -->
            <div class="px-3 py-2 border-b border-surface-700 flex items-center gap-2">
                <span class="font-mono text-amber-300 font-semibold">{formatTimeMs(hoveredKf)}</span>
                <span class="text-surface-500">
                    {totalFilled + totalEmpty} path{(totalFilled + totalEmpty) !== 1 ? 's' : ''}
                    {#if totalEmpty > 0}
                        <span class="text-amber-400/70">({totalEmpty} vacío{totalEmpty !== 1 ? 's' : ''})</span>
                    {/if}
                </span>
            </div>

            {#if items.length === 0}
                <div class="px-3 py-2 text-surface-500 italic">Sin paths</div>
            {:else}
                <ul class="py-1.5 max-h-48 overflow-y-auto">
                    {#each items as { entity, filledPaths, emptyPaths }}
                        <li class="px-3 py-1.5 flex items-center gap-2">
                            <span
                                class="w-2.5 h-2.5 rounded-full shrink-0"
                                style="background: {editor.entityColors[entity.id] || '#888'}"
                            ></span>
                            <span class="truncate text-surface-200 flex-1">
                                {entity.name}
                            </span>
                            <span class="text-surface-500 shrink-0 flex items-center gap-1">
                                {ACTION_LABELS[entity.hit_action] ?? ''}
                                {#if entity.score !== 0}
                                    <span class="text-blue-400">{entity.score > 0 ? '+' : ''}{entity.score}</span>
                                {/if}
                            </span>
                            {#if filledPaths.length > 0}
                                <span class="text-surface-600 text-[10px]">×{filledPaths.length}</span>
                            {/if}
                            {#if emptyPaths.length > 0}
                                <span class="text-amber-400/50 text-[10px]">+{emptyPaths.length} vacío{emptyPaths.length !== 1 ? 's' : ''}</span>
                            {/if}
                        </li>
                    {/each}
                </ul>
            {/if}
        </div>
    </div>
{/if}
