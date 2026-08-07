<script lang="ts">
    import paper from 'paper';
    import { onMount, onDestroy } from 'svelte';
    import { editor } from '$lib/stores/editor.svelte';
    import { interpolatePaths } from '$lib/interpolation';
    import type { EntityPath } from '$lib/models';

    let { onPathDblClick }: {
        onPathDblClick?: (id: string) => void;
    } = $props();

    let canvasEl: HTMLCanvasElement;
    let containerEl: HTMLDivElement;
    let videoEl: HTMLVideoElement;
    let scope: paper.PaperScope | null = null;

    // Paper.js path <-> EntityPath id mapping
    const idToPaper = new Map<string, paper.Path>();
    const paperToId = new Map<paper.Item, string>();

    // Tools
    let drawTool: paper.Tool | null = null;
    let lassoTool: paper.Tool | null = null;
    let selectTool: paper.Tool | null = null;
    let modifyTool: paper.Tool | null = null;
    let deleteTool: paper.Tool | null = null;
    let idleTool: paper.Tool | null = null;
    let toolsReady = $state(false);

    // Media dimensions (original resolution)
    let imgWidth = 0;
    let imgHeight = 0;

    // Display size (used to size the video element in video mode)
    let displayW = $state(0);
    let displayH = $state(0);

    // Drawing state
    let currentPath: paper.Path | null = null;
    let guideLine: paper.Path | null = null;
    let closeIndicator: paper.Shape | null = null;

    // Select/edit tool state
    let selPath: paper.Path | null = null;
    let selHitType: 'path' | 'segment' | 'handle-in' | 'handle-out' | null = null;
    let selSegment: paper.Segment | null = null;
    let selLastClick = 0;
    let selDidDrag = false;

    const isVideoMode = $derived(editor.mediaType === 'video');

    /** Convert a screen-pixel distance to project-space units */
    function screenPx(px: number): number {
        return scope?.view ? px / scope.view.zoom : px;
    }

    /** Extract SVG path data string from stored `<path d="..."/>` format */
    function extractPathData(svgStr: string): string {
        return svgStr.match(/d="([^"]+)"/)?.[1] ?? '';
    }

    // ── Public API ──────────────────────────────────────────────────────────

    export function loadImage(file: File, onReady?: () => void): void
    {
        const reader = new FileReader();
        reader.onload = (e) =>
        {
            const dataUrl = e.target?.result as string;
            const img = new Image();
            img.onload = () =>
            {
                editor.resetMedia();
                editor.mediaWidth = img.naturalWidth;
                editor.mediaHeight = img.naturalHeight;
                initCanvas(img.naturalWidth, img.naturalHeight, dataUrl);
                editor.mediaName = file.name;
                editor.mediaType = 'image';
                editor.mediaLoaded = true;
                editor.setTool('none');
                onReady?.();
            };
            img.src = dataUrl;
        };
        reader.readAsDataURL(file);
    }

    export function loadVideo(file: File, onReady?: () => void): void
    {
        const url = URL.createObjectURL(file);

        const probe = document.createElement('video');
        probe.preload = 'metadata';
        probe.onloadedmetadata = () =>
        {
            const w = probe.videoWidth;
            const h = probe.videoHeight;

            editor.resetMedia();
            editor.mediaType = 'video';
            editor.mediaName = file.name;
            editor.videoDurationMs = Math.round(probe.duration * 1000);
            editor.mediaWidth = w;
            editor.mediaHeight = h;

            videoEl.src = url;
            videoEl.currentTime = 0;

            videoEl.ontimeupdate = () =>
            {
                if (!videoEl.seeking)
                    editor.currentTimeMs = Math.round(videoEl.currentTime * 1000);
            };
            videoEl.onseeked = () =>
            {
                editor.currentTimeMs = Math.round(videoEl.currentTime * 1000);
            };
            videoEl.onplay  = () => { editor.isPlaying = true; };
            videoEl.onpause = () => { editor.isPlaying = false; };

            initCanvasVideo(w, h);
            editor.mediaLoaded = true;
            editor.setTool('none');
            onReady?.();
        };
        probe.src = url;
    }

    export function clearAllVisuals(): void
    {
        for (const [, pp] of idToPaper) pp.remove();
        idToPaper.clear();
        paperToId.clear();
        scope?.view.update();
    }

    export function deletePathVisual(id: string): void
    {
        const pp = idToPaper.get(id);
        if (pp)
        {
            paperToId.delete(pp);
            pp.remove();
        }
        idToPaper.delete(id);
    }

    export function seekTo(ms: number): void
    {
        if (!videoEl) return;
        const clamped = Math.max(0, Math.min(ms, editor.videoDurationMs));
        editor.currentTimeMs = clamped;
        videoEl.currentTime = clamped / 1000;
    }

    export function playVideo(): void  { videoEl?.play(); }
    export function pauseVideo(): void { videoEl?.pause(); }

    /**
     * Add a Paper.js visual for an EntityPath created externally
     * (e.g. import or restore). The path must have non-empty SVG data.
     */
    export function addVisualPath(ep: EntityPath, color: string): void
    {
        if (!scope || !ep.path) return;

        const d = extractPathData(ep.path);
        if (!d) return;

        scope.activate();
        const pp = new scope.Path();
        pp.pathData = d;
        if (!pp.closed) pp.closePath();
        pp.strokeColor = new scope.Color(color);
        pp.strokeWidth = screenPx(2);
        pp.fillColor = new scope.Color(color);
        pp.fillColor!.alpha = 0.15;
        pp.data = { color };

        idToPaper.set(ep.id, pp);
        paperToId.set(pp, ep.id);
    }

    /**
     * Add a visual path and simplify it (reduce control points).
     * Returns the simplified SVG string so the caller can update the stored data.
     */
    export function addVisualPathSimplified(ep: EntityPath, color: string, tolerance?: number): string | null
    {
        if (!scope || !ep.path) return null;

        const d = extractPathData(ep.path);
        if (!d) return null;

        scope.activate();
        const pp = new scope.Path();
        pp.pathData = d;
        if (!pp.closed) pp.closePath();
        // pp.simplify(tolerance ?? screenPx(5));
        pp.simplify(10);
        pp.strokeColor = new scope.Color(color);
        pp.strokeWidth = screenPx(2);
        pp.fillColor = new scope.Color(color);
        pp.fillColor!.alpha = 0.15;
        pp.data = { color };

        idToPaper.set(ep.id, pp);
        paperToId.set(pp, ep.id);

        return `<path d="${pp.pathData}"/>`;
    }

    // ── Preview path (for interpolation preview) ───────────────────────────

    let previewPath: paper.Path | null = null;

    export function showPreviewPath(svgData: string, color: string): void
    {
        hidePreviewPath();
        if (!scope) return;
        scope.activate();
        const pp = new scope.Path();
        pp.pathData = svgData;
        if (!pp.closed) pp.closePath();
        pp.strokeColor = new scope.Color(color);
        pp.strokeWidth = screenPx(2);
        pp.dashArray = [screenPx(6), screenPx(4)];
        pp.fillColor = null;
        pp.locked = true;
        previewPath = pp;
        scope.view.update();
    }

    export function hidePreviewPath(): void
    {
        if (previewPath)
        {
            previewPath.remove();
            previewPath = null;
            scope?.view.update();
        }
    }

    // ── Canvas init ──────────────────────────────────────────────────────────

    function initCanvas(w: number, h: number, dataUrl: string): void
    {
        if (!scope) return;
        scope.project?.clear();
        idToPaper.clear();
        paperToId.clear();
        imgWidth = w;
        imgHeight = h;
        fitToContainer();

        const raster = new scope.Raster({
            source: dataUrl,
            position: new scope.Point(w / 2, h / 2),
        });
        raster.sendToBack();
        raster.locked = true;

        createTools();
        toolsReady = true;
    }

    function initCanvasVideo(w: number, h: number): void
    {
        if (!scope) return;
        scope.project?.clear();
        idToPaper.clear();
        paperToId.clear();
        imgWidth = w;
        imgHeight = h;
        fitToContainer();
        createTools();
        toolsReady = true;
    }

    function fitToContainer(): void
    {
        if (!containerEl || !scope || imgWidth === 0) return;
        const cw = containerEl.clientWidth;
        const ch = containerEl.clientHeight;
        const ratio = Math.min(cw / imgWidth, ch / imgHeight, 1);
        const dw = Math.round(imgWidth * ratio);
        const dh = Math.round(imgHeight * ratio);

        scope.view.viewSize = new scope.Size(dw, dh);
        scope.view.zoom = ratio;
        scope.view.center = new scope.Point(imgWidth / 2, imgHeight / 2);

        displayW = dw;
        displayH = dh;
    }

    // ── Drawing helpers ──────────────────────────────────────────────────────

    function clearGuides(): void
    {
        guideLine?.remove();
        guideLine = null;
        closeIndicator?.remove();
        closeIndicator = null;
    }

    function finishDrawing(): void
    {
        if (!currentPath || !scope) return;
        clearGuides();
        currentPath.closePath();

        const svgPath = `<path d="${currentPath.pathData}"/>`;
        const entityPath = editor.createPath(svgPath);
        const color = editor.getPathColor(entityPath.id);

        // Ensure visual matches entity color
        currentPath.strokeColor = new scope.Color(color);
        currentPath.fillColor = new scope.Color(color);
        currentPath.fillColor!.alpha = 0.15;
        currentPath.data = { color };

        idToPaper.set(entityPath.id, currentPath);
        paperToId.set(currentPath, entityPath.id);
        currentPath = null;

        // Deactivate drawing after finishing a path
        editor.setTool('none');
    }

    // ── Tools ────────────────────────────────────────────────────────────────

    function createTools(): void
    {
        if (!scope) return;

        idleTool = new scope.Tool();

        // --- Draw tool (polygon click) ---
        drawTool = new scope.Tool();
        let lastClickTime = 0;

        drawTool.onMouseDown = (event: paper.ToolEvent) =>
        {
            const now = Date.now();
            const isDouble = now - lastClickTime < 350;
            lastClickTime = now;

            if (isDouble && currentPath && currentPath.segments.length >= 3)
            {
                finishDrawing();
                return;
            }

            if (!currentPath)
            {
                const color = editor.getDrawColor();
                currentPath = new scope!.Path({
                    strokeColor: color,
                    strokeWidth: screenPx(2),
                    fillColor: new scope!.Color(color),
                });
                currentPath.fillColor!.alpha = 0.15;
                currentPath.data = { color };
            }

            if (currentPath.segments.length >= 3)
            {
                const first = currentPath.firstSegment.point;
                if (event.point.getDistance(first) < screenPx(15))
                {
                    finishDrawing();
                    return;
                }
            }

            currentPath.add(event.point);
        };

        drawTool.onMouseMove = (event: paper.ToolEvent) =>
        {
            clearGuides();
            if (!currentPath || currentPath.segments.length === 0) return;

            guideLine = new scope!.Path.Line({
                from: currentPath.lastSegment.point,
                to: event.point,
                strokeColor: '#888888',
                strokeWidth: screenPx(1),
                dashArray: [screenPx(5), screenPx(5)],
            });

            if (currentPath.segments.length >= 3)
            {
                const first = currentPath.firstSegment.point;
                if (event.point.getDistance(first) < screenPx(15))
                {
                    closeIndicator = new scope!.Shape.Circle({
                        center: first,
                        radius: screenPx(8),
                        strokeColor: '#22c55e',
                        strokeWidth: screenPx(2),
                        fillColor: new scope!.Color(0.13, 0.77, 0.37, 0.3),
                    });
                }
            }
        };

        // --- Lasso tool (freehand) ---
        lassoTool = new scope.Tool();
        lassoTool.minDistance = screenPx(3);

        lassoTool.onMouseDown = (event: paper.ToolEvent) =>
        {
            const color = editor.getDrawColor();
            currentPath = new scope!.Path({
                strokeColor: color,
                strokeWidth: screenPx(2),
                fillColor: new scope!.Color(color),
            });
            currentPath.fillColor!.alpha = 0.15;
            currentPath.data = { color };
            currentPath.add(event.point);
        };

        lassoTool.onMouseDrag = (event: paper.ToolEvent) =>
        {
            if (!currentPath) return;
            currentPath.add(event.point);
        };

        lassoTool.onMouseUp = () =>
        {
            if (!currentPath || currentPath.segments.length < 3)
            {
                currentPath?.remove();
                currentPath = null;
                return;
            }
            // currentPath.simplify(screenPx(5));
            currentPath.simplify(10);
            finishDrawing();
        };

        // --- Select tool (info only: click to select, no drag) ---
        selectTool = new scope.Tool();

        selectTool.onMouseDown = (event: paper.ToolEvent) =>
        {
            const hit = scope!.project.hitTest(event.point, {
                fill: true,
                stroke: true,
                tolerance: screenPx(8),
            });

            if (!hit || !paperToId.has(hit.item))
            {
                editor.selectPathById(null);
                return;
            }

            const id = paperToId.get(hit.item)!;

            const now = Date.now();
            const isDbl = now - selLastClick < 350;
            selLastClick = now;

            if (isDbl)
            {
                selLastClick = 0;
                onPathDblClick?.(id);
                return;
            }

            editor.selectPathById(id);
        };

        // --- Modify tool (drag path, drag segments, drag handles) ---
        modifyTool = new scope.Tool();

        modifyTool.onMouseDown = (event: paper.ToolEvent) =>
        {
            selDidDrag = false;

            const hit = scope!.project.hitTest(event.point, {
                fill: true,
                stroke: true,
                segments: true,
                handles: true,
                tolerance: screenPx(8),
            });

            if (!hit || !paperToId.has(hit.item))
            {
                editor.selectPathById(null);
                selPath = null;
                selHitType = null;
                selSegment = null;
                return;
            }

            const id = paperToId.get(hit.item)!;

            const now = Date.now();
            const isDbl = now - selLastClick < 350;
            selLastClick = now;

            if (isDbl)
            {
                selLastClick = 0;
                onPathDblClick?.(id);
                return;
            }

            editor.selectPathById(id);
            selPath = hit.item as paper.Path;

            if (hit.type === 'segment')
            {
                selHitType = 'segment';
                selSegment = hit.segment;
            }
            else if (hit.type === 'handle-in')
            {
                selHitType = 'handle-in';
                selSegment = hit.segment;
            }
            else if (hit.type === 'handle-out')
            {
                selHitType = 'handle-out';
                selSegment = hit.segment;
            }
            else
            {
                selHitType = 'path';
                selSegment = null;
            }
        };

        modifyTool.onMouseDrag = (event: paper.ToolEvent) =>
        {
            if (!selPath || !selHitType) return;
            selDidDrag = true;

            if (selHitType === 'path')
            {
                selPath.translate(event.delta);
            }
            else if (selHitType === 'segment' && selSegment)
            {
                selSegment.point = selSegment.point.add(event.delta);
            }
            else if (selHitType === 'handle-in' && selSegment)
            {
                selSegment.handleIn = selSegment.handleIn.add(event.delta);
            }
            else if (selHitType === 'handle-out' && selSegment)
            {
                selSegment.handleOut = selSegment.handleOut.add(event.delta);
            }

            scope!.view.update();
        };

        modifyTool.onMouseUp = () =>
        {
            if (selPath && selDidDrag)
            {
                const id = paperToId.get(selPath);
                if (id)
                    editor.updatePath(id, { path: `<path d="${selPath.pathData}"/>` });
            }
            selHitType = null;
            selSegment = null;
            selDidDrag = false;
        };

        // --- Delete tool ---
        deleteTool = new scope.Tool();
        deleteTool.onMouseDown = (event: paper.ToolEvent) =>
        {
            const hit = scope!.project.hitTest(event.point, { fill: true, stroke: true, tolerance: screenPx(5) });
            if (hit && paperToId.has(hit.item))
            {
                const id = paperToId.get(hit.item)!;
                paperToId.delete(hit.item);
                hit.item.remove();
                idToPaper.delete(id);
                editor.removePath(id);
            }
        };
    }

    // ── Effects ───────────────────────────────────────────────────────────────

    // Sync video element when editor.currentTimeMs changes externally
    $effect(() =>
    {
        if (!isVideoMode || !videoEl) return;
        const targetMs = editor.currentTimeMs;
        const videoMs = Math.round(videoEl.currentTime * 1000);
        if (Math.abs(targetMs - videoMs) > 30)
            videoEl.currentTime = targetMs / 1000;
    });

    // React to tool mode / draw mode changes
    $effect(() =>
    {
        const tool = editor.activeTool;
        const drawMode = editor.drawMode;
        if (!toolsReady) return;

        if (tool !== 'draw' && currentPath)
        {
            currentPath.remove();
            currentPath = null;
            clearGuides();
        }

        if (tool !== 'select' && tool !== 'modify')
        {
            selPath = null;
            selHitType = null;
            selSegment = null;
        }

        switch (tool)
        {
            case 'draw':
                if (drawMode === 'lasso') lassoTool?.activate();
                else drawTool?.activate();
                break;
            case 'select': selectTool?.activate(); break;
            case 'modify': modifyTool?.activate(); break;
            case 'delete': deleteTool?.activate(); break;
            default: idleTool?.activate(); break;
        }
    });

    // React to selection changes (highlight + show/hide Paper.js handles)
    $effect(() =>
    {
        const selectedId = editor.selectedPathId;
        const activeTool = editor.activeTool;
        if (!scope || !toolsReady) return;

        for (const [id, pp] of idToPaper)
        {
            const color = editor.getPathColor(id);
            pp.strokeColor = new scope.Color(color);
            pp.strokeWidth = id === selectedId ? screenPx(3) : screenPx(2);
            pp.fillColor = new scope.Color(color);
            pp.fillColor!.alpha = id === selectedId ? 0.35 : 0.15;
            pp.selected = id === selectedId && activeTool === 'modify';
        }
    });

    // Track original pathData so we can restore after interpolation
    const originalPathData = new Map<string, string>();

    // Video mode: range-based visibility + real-time interpolation
    $effect(() =>
    {
        if (!toolsReady || !isVideoMode) return;

        const currentMs = editor.currentTimeMs;

        // First: restore any previously interpolated paths to original shape
        for (const [id, origD] of originalPathData)
        {
            const pp = idToPaper.get(id);
            if (pp) pp.pathData = origD;
        }
        originalPathData.clear();

        // Build a set of ids that are interpolated (to skip normal visibility for them)
        const interpolatedIds = new Set<string>();

        // For each entity, try real-time interpolation between consecutive filled paths
        for (const entity of editor.entities)
        {
            const filledPaths = [...entity.paths]
                .filter(p => !!p.path)
                .sort((a, b) => a.frame_time_start_ms - b.frame_time_start_ms);

            for (let i = 0; i < filledPaths.length - 1; i++)
            {
                const cur = filledPaths[i];
                const nxt = filledPaths[i + 1];
                const curEnd = cur.frame_time_end_ms > 0 ? cur.frame_time_end_ms : editor.videoDurationMs;

                // Check if currentMs is between cur.start and nxt.start, and cur is visible
                if (currentMs >= cur.frame_time_start_ms && currentMs < curEnd
                    && currentMs < nxt.frame_time_start_ms && currentMs > cur.frame_time_start_ms)
                {
                    const span = nxt.frame_time_start_ms - cur.frame_time_start_ms;
                    if (span <= 0) continue;

                    const t = Math.max(0, Math.min(1,
                        (currentMs - cur.frame_time_start_ms) / span));

                    const pp = idToPaper.get(cur.id);
                    if (!pp) continue;

                    try
                    {
                        const morphed = interpolatePaths(cur.path, nxt.path, t);
                        // Save original so we can restore later
                        originalPathData.set(cur.id, pp.pathData);
                        pp.pathData = morphed;
                        pp.visible = true;
                        interpolatedIds.add(cur.id);
                    }
                    catch
                    {
                        // Fallback: just show cur as-is
                        pp.visible = true;
                        interpolatedIds.add(cur.id);
                    }
                    break; // Only one pair can match per entity
                }
            }
        }

        // Normal range-based visibility for non-interpolated paths
        for (const [id, pp] of idToPaper)
        {
            if (interpolatedIds.has(id)) continue;

            let visible = false;
            for (const entity of editor.entities)
            {
                const ep = entity.paths.find(p => p.id === id);
                if (ep && ep.path)
                {
                    const endMs = ep.frame_time_end_ms > 0
                        ? ep.frame_time_end_ms
                        : editor.videoDurationMs;
                    visible = currentMs >= ep.frame_time_start_ms && currentMs < endMs;
                    break;
                }
            }
            pp.visible = visible;
        }

        scope?.view.update();
    });

    // Image mode: always show all paths
    $effect(() =>
    {
        if (!toolsReady || isVideoMode) return;
        for (const [, pp] of idToPaper)
            pp.visible = true;
    });

    // ── Lifecycle ────────────────────────────────────────────────────────────

    onMount(() =>
    {
        scope = new paper.PaperScope();
        scope.setup(canvasEl);

        const observer = new ResizeObserver(() =>
        {
            if (editor.mediaLoaded) fitToContainer();
        });
        observer.observe(containerEl);

        return () => observer.disconnect();
    });

    onDestroy(() =>
    {
        idToPaper.clear();
        paperToId.clear();
        scope = null;
    });
</script>

<div bind:this={containerEl} class="canvas-container">
    <div
        class="relative"
        style:display={isVideoMode ? 'block' : 'contents'}
    >
        <!-- svelte-ignore a11y_media_has_caption -->
        <video
            bind:this={videoEl}
            style:display={isVideoMode ? 'block' : 'none'}
            style:width="{displayW}px"
            style:height="{displayH}px"
        ></video>

        <canvas
            bind:this={canvasEl}
            style:position={isVideoMode ? 'absolute' : 'static'}
            style:top={isVideoMode ? '0' : 'auto'}
            style:left={isVideoMode ? '0' : 'auto'}
            class:cursor-crosshair={editor.activeTool === 'draw' || editor.activeTool === 'delete'}
            class:cursor-pointer={editor.activeTool === 'select'}
            class:cursor-move={editor.activeTool === 'modify'}
            class:cursor-default={editor.activeTool === 'none'}
        ></canvas>
    </div>
</div>

<style>
    .canvas-container {
        width: 100%;
        height: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
        overflow: auto;
        background: #0f0f1a;
    }
    canvas {
        display: block;
    }
</style>
