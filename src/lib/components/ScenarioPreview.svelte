<script lang="ts">
    /**
     * Vista previa del escenario: lo reproduce tal como lo jugará el tirador
     * en SETIC Virt, con lo último que se editó (aunque no esté guardado ni
     * publicado). Un clic sobre la imagen es un disparo.
     *
     * Las reglas copian las de SETIC Virt (src/routes/media-shooting):
     *  - Video: solo cuentan las zonas de su tramo de tiempo. El primer
     *    acierto decide la escena siguiente; sin escena siguiente, termina.
     *    Al acabarse el video, termina.
     *  - Imagen: las flechas "Siguiente" cambian de escena; el rehén manda
     *    sobre las demás zonas; Ganar y Perder terminan en el acto; al
     *    acertar todos los objetivos pasa a la siguiente escena. Fallo = −1.
     * No hay tiempo límite (en SETIC Virt lo elige el operador al empezar).
     */
    import { onDestroy, tick } from 'svelte';
    import { editor } from '$lib/stores/editor.svelte';
    import { HitAction } from '$lib/values';
    import type { Entity } from '$lib/models';
    import { Play, Pause, RotateCcw, Maximize2, Minimize2, Eye, EyeOff, Volume2, VolumeX, X } from '@lucide/svelte';

    // ── Escenario a partir de lo que hay en el editor ───────────────────────

    interface Zone {
        id: string;
        name: string;
        action: HitAction;
        score: number;
        next: string;
        isHostage: boolean;
        startMs: number;
        endMs: number;
        d: string;
        color: string;
    }

    interface PScene {
        id: string;
        index: number;
        name: string;
        type: 'image' | 'video';
        url: string | null;
        entities: Entity[];
        zones: Zone[];
    }

    /** Un archivo, una sola URL (se liberan al cerrar el editor). */
    const urls = new Map<File, string>();
    function urlFor(file: File): string {
        let u = urls.get(file);
        if (!u) { u = URL.createObjectURL(file); urls.set(file, u); }
        return u;
    }

    /** Igual que SETIC Virt: solo entiende contornos guardados como <path d="..."/>. */
    function extractD(pathStr: string): string {
        return /<path d="([^"]+)"/.exec(pathStr ?? '')?.[1] ?? '';
    }

    /** Sin tildes y en minúsculas, para reconocer "Rehén" escrito de cualquier forma. */
    function plain(text: string): string {
        return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    }

    function isHostageEntity(e: Entity): boolean {
        const n = plain(String(e.name ?? ''));
        return e.hit_action === HitAction.LOSE || (Number(e.score) || 0) < 0 || n.includes('reen') || n.includes('rehen');
    }

    /** Color por lo que pasa al acertar, para entender la escena de un vistazo. */
    function colorFor(e: Entity, hostage: boolean): string {
        if (hostage) return '#ef4444';                       // rehén / perder
        if (e.hit_action === HitAction.NEXT) return '#3b82f6'; // pasa de escena
        if (e.hit_action === HitAction.WIN) return '#f59e0b';  // meta / ganar
        if (e.hit_action === HitAction.SCORE) return '#22c55e'; // blanco
        return '#94a3b8';                                    // sin acción
    }

    function toZones(entities: Entity[]): Zone[] {
        const out: Zone[] = [];
        for (const e of entities) {
            const hostage = isHostageEntity(e);
            for (const p of e.paths ?? []) {
                const d = extractD(p.path);
                if (!d) continue;
                out.push({
                    id: p.id,
                    name: String(e.name ?? '') || 'Objetivo',
                    action: e.hit_action,
                    score: Number(e.score) || 0,
                    next: e.next_scene_id ?? '',
                    isHostage: hostage,
                    startMs: p.frame_time_start_ms ?? 0,
                    // En el Builder, fin 0 significa "hasta que acabe el video"
                    endMs: p.frame_time_end_ms > 0 ? p.frame_time_end_ms : Infinity,
                    d,
                    color: colorFor(e, hostage),
                });
            }
        }
        return out;
    }

    /** Siempre lo último: la escena abierta en el editor se lee en vivo, aunque no se haya guardado. */
    let scenes: PScene[] = $derived.by(() =>
        editor.scenes.map((s, i) => {
            const entities = s.id === editor.activeSceneId ? editor.entities : s.entities;
            return {
                id: s.id,
                index: i,
                name: s.mediaName.replace(/\.[^.]+$/, '') || `Escena ${i + 1}`,
                type: s.mediaType,
                url: s.file ? urlFor(s.file) : null,
                entities,
                zones: toZones(entities),
            };
        })
    );

    function sceneById(id: string): PScene | undefined {
        return scenes.find(s => s.id === id);
    }

    // ── Revisión: lo que conviene corregir antes de publicar ───────────────

    let warnings: string[] = $derived.by(() => {
        const w: string[] = [];
        const ids = new Set(scenes.map(s => s.id));

        for (const s of scenes) {
            const n = `Escena ${s.index + 1}`;
            if (!s.url) w.push(`${n}: falta el archivo de imagen o video`);
            if (s.zones.length === 0) w.push(`${n}: no tiene objetivos`);
            for (const e of s.entities) {
                const name = `«${e.name || 'sin nombre'}»`;
                if (!(e.paths ?? []).some(p => extractD(p.path))) {
                    w.push(`${n}: ${name} no tiene contorno dibujado (no se publica)`);
                    continue;
                }
                if (e.hit_action === HitAction.NEXT && !e.next_scene_id)
                    w.push(`${n}: ${name} dice «Siguiente» pero no tiene escena elegida`);
                else if (e.next_scene_id && !ids.has(e.next_scene_id))
                    w.push(`${n}: ${name} lleva a una escena que ya no existe`);
                if (e.hit_action === HitAction.NONE && !(Number(e.score) || 0) && s.type === 'image')
                    w.push(`${n}: ${name} no hace nada al acertarle`);
            }
        }

        // Escenas a las que no se llega desde la primera
        if (scenes.length > 1) {
            const edges = new Map<string, Set<string>>();
            for (const s of scenes) {
                const to = new Set<string>();
                if (s.type === 'video') {
                    // En video, cualquier acierto lleva a su escena siguiente
                    for (const e of s.entities) if (e.next_scene_id) to.add(e.next_scene_id);
                } else {
                    let arrow = false;
                    for (const e of s.entities) {
                        if (e.hit_action === HitAction.NEXT && e.next_scene_id && e.next_scene_id !== s.id) {
                            to.add(e.next_scene_id);
                            arrow = true;
                        }
                    }
                    // Sin flecha, al acertar todos los objetivos pasa a la de al lado.
                    // Si uno de los objetivos es "Ganar", acertarle termina antes de pasar.
                    const tz = s.zones.filter(z => z.score > 0 && !z.isHostage
                        && (z.action === HitAction.SCORE || z.action === HitAction.WIN));
                    const canAdvance = tz.length > 0 && !tz.some(z => z.action === HitAction.WIN);
                    if (!arrow && canAdvance && scenes[s.index + 1]) to.add(scenes[s.index + 1].id);
                }
                edges.set(s.id, to);
            }
            const seen = new Set<string>([scenes[0].id]);
            const queue = [scenes[0].id];
            while (queue.length) {
                for (const nxt of edges.get(queue.shift()!) ?? []) {
                    if (ids.has(nxt) && !seen.has(nxt)) { seen.add(nxt); queue.push(nxt); }
                }
            }
            for (const s of scenes)
                if (!seen.has(s.id)) w.push(`Escena ${s.index + 1}: no se llega a ella desde la escena 1`);
        }
        return w;
    });

    let totalZones = $derived(scenes.reduce((a, s) => a + s.entities.filter(e => (e.paths ?? []).some(p => extractD(p.path))).length, 0));

    // ── Preferencias (se recuerdan en este navegador) ───────────────────────

    const PREF_KEY = 'setic-builder-preview';
    function loadPrefs(): { open: boolean; showZones: boolean; muted: boolean } {
        const def = { open: true, showZones: true, muted: true };
        try { return { ...def, ...JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}') }; }
        catch { return def; }
    }
    const prefs = loadPrefs();

    let open = $state(prefs.open);          // panel visible (o solo la pestaña)
    let showZones = $state(prefs.showZones); // dibujar los contornos
    let muted = $state(prefs.muted);
    let big = $state(false);                 // ampliada a pantalla completa
    let showWarnings = $state(false);

    $effect(() => {
        const p = { open, showZones, muted };
        try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch { /* sin almacenamiento */ }
    });

    // ── Reproducción ────────────────────────────────────────────────────────

    type Mode = 'idle' | 'playing' | 'ended';
    let mode = $state<Mode>('idle');
    let curId = $state<string | null>(null);
    let paused = $state(false);
    let nowMs = $state(0);
    let points = $state(0);
    let hits = $state(0);
    let misses = $state(0);
    let hostageHits = $state(0);
    let lastEvent = $state('');
    let endText = $state('');
    let endKind = $state<'win' | 'lose' | 'end'>('end');
    let flash = $state(false);
    let marks = $state<{ x: number; y: number; kind: 'hit' | 'miss' | 'hostage' }[]>([]);
    /** Tamaño real de cada imagen o video (los contornos están dibujados en esos píxeles). */
    let sizes = $state<Record<string, { w: number; h: number }>>({});

    let videoEl: HTMLVideoElement | null = $state(null);
    let svgEl: SVGSVGElement | null = $state(null);

    /** Objetivos de la escena de imagen actual (para pasar sola a la siguiente). */
    let targets = new Set<string>();
    let touched = new Set<string>();
    /** Pausa breve entre escenas: los disparos en ese momento no cuentan. */
    let advancing = false;
    let advanceTimer: ReturnType<typeof setTimeout> | null = null;
    let flashTimer: ReturnType<typeof setTimeout> | null = null;

    /** Lo que se ve: en reposo, la primera escena; jugando, la actual. */
    let shown: PScene | null = $derived(
        (mode === 'idle' ? scenes[0] : (curId ? sceneById(curId) : undefined)) ?? null
    );
    let vb = $derived(shown ? (sizes[shown.id] ?? { w: editor.mediaWidth || 1280, h: editor.mediaHeight || 720 }) : { w: 1280, h: 720 });
    let activeZones: Zone[] = $derived(
        !shown ? [] : shown.type === 'video'
            ? shown.zones.filter(z => nowMs >= z.startMs && nowMs < z.endMs)
            : shown.zones
    );

    // Si se borra la escena que se estaba probando, se vuelve al inicio
    $effect(() => {
        if (mode !== 'idle' && curId && !scenes.some(s => s.id === curId)) reset();
    });

    // Reloj del video mientras se reproduce (para saber qué zonas están activas)
    $effect(() => {
        if (!videoEl || shown?.type !== 'video') return;
        let raf = 0;
        const loop = () => {
            if (videoEl) nowMs = videoEl.currentTime * 1000;
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    });

    function clearTimers() {
        if (advanceTimer) { clearTimeout(advanceTimer); advanceTimer = null; }
        if (flashTimer) { clearTimeout(flashTimer); flashTimer = null; }
        advancing = false;
    }

    function reset() {
        clearTimers();
        videoEl?.pause();
        mode = 'idle';
        curId = null;
        paused = false;
        marks = [];
        lastEvent = '';
        endText = '';
        flash = false;
        if (videoEl) { videoEl.currentTime = 0; nowMs = 0; }
    }

    function start(fromId?: string) {
        if (scenes.length === 0) return;
        clearTimers();
        points = 0; hits = 0; misses = 0; hostageHits = 0;
        lastEvent = '';
        endText = '';
        mode = 'playing';
        enterScene(fromId && sceneById(fromId) ? fromId : scenes[0].id);
    }

    async function enterScene(id: string) {
        const sameScene = id === curId;
        curId = id;
        paused = false;
        marks = [];
        touched = new Set();
        targets = new Set();
        await tick();
        const s = sceneById(id);
        if (!s) return;
        if (s.type === 'video') {
            // Mismo elemento (misma escena o la primera ya cargada): se rebobina
            if (videoEl && (sameScene || videoEl.readyState > 0)) {
                videoEl.currentTime = 0;
                nowMs = 0;
                videoEl.play().catch(() => { paused = true; });
            }
        } else {
            targets = findTargets(s);
        }
    }

    function onVideoMeta() {
        if (!videoEl || !shown) return;
        sizes = { ...sizes, [shown.id]: { w: videoEl.videoWidth, h: videoEl.videoHeight } };
        if (mode === 'playing' && !paused) videoEl.play().catch(() => { paused = true; });
    }

    function onImageLoad(e: Event, id: string) {
        const img = e.currentTarget as HTMLImageElement;
        sizes = { ...sizes, [id]: { w: img.naturalWidth, h: img.naturalHeight } };
        // Con el tamaño real ya se pueden ubicar los objetivos
        const s = sceneById(id);
        if (mode === 'playing' && s && id === curId) tick().then(() => { targets = findTargets(s); });
    }

    function onVideoEnded() {
        if (mode !== 'playing') return;
        finish('El video terminó', 'end');
    }

    function togglePause() {
        if (!videoEl || mode !== 'playing') return;
        if (videoEl.paused) { videoEl.play().catch(() => {}); paused = false; }
        else { videoEl.pause(); paused = true; }
    }

    function finish(text: string, kind: 'win' | 'lose' | 'end') {
        clearTimers();
        videoEl?.pause();
        mode = 'ended';
        endText = text;
        endKind = kind;
    }

    function redFlash() {
        flash = true;
        if (flashTimer) clearTimeout(flashTimer);
        flashTimer = setTimeout(() => { flash = false; flashTimer = null; }, 450);
    }

    /** Pasar a otra escena por un acierto. Sin escena siguiente, el escenario termina. */
    function goTo(nextId: string, endIfNone: string) {
        if (!nextId) { finish(endIfNone, 'end'); return; }
        const s = sceneById(nextId);
        if (!s) { finish('El objetivo lleva a una escena que ya no existe', 'end'); return; }
        lastEvent = `${lastEvent ? lastEvent + ' · ' : ''}→ Escena ${s.index + 1}`;
        videoEl?.pause();
        enterScene(nextId);
    }

    // ── Disparos ────────────────────────────────────────────────────────────

    function svgPoint(e: PointerEvent): DOMPoint | null {
        const ctm = svgEl?.getScreenCTM();
        if (!svgEl || !ctm) return null;
        const p = svgEl.createSVGPoint();
        p.x = e.clientX;
        p.y = e.clientY;
        return p.matrixTransform(ctm.inverse());
    }

    function inZone(z: Zone, p: DOMPoint): boolean {
        const el = svgEl?.querySelector(`[data-zone="${CSS.escape(z.id)}"]`) as SVGPathElement | null;
        return !!el && el.isPointInFill(p);
    }

    /**
     * Objetivos de una escena de imagen: zonas que dan puntos (no rehenes ni
     * flechas). Una zona dibujada dentro de otra (la A dentro del contorno)
     * es parte del mismo objetivo y no cuenta aparte.
     */
    function findTargets(s: PScene): Set<string> {
        const zones = s.zones.filter(z => z.score > 0 && !z.isHostage
            && (z.action === HitAction.SCORE || z.action === HitAction.WIN));
        const out = new Set<string>();
        if (!svgEl) return out;
        const els = new Map<string, SVGPathElement>();
        for (const z of zones) {
            const el = svgEl.querySelector(`[data-zone="${CSS.escape(z.id)}"]`) as SVGPathElement | null;
            if (el) els.set(z.id, el);
        }
        for (const z of zones) {
            const el = els.get(z.id);
            if (!el) continue;
            const bb = el.getBBox();
            const pt = svgEl.createSVGPoint();
            pt.x = bb.x + bb.width / 2;
            pt.y = bb.y + bb.height / 2;
            const nested = zones.some(o => o !== z && o.score >= z.score && els.get(o.id)?.isPointInFill(pt));
            if (!nested) out.add(z.id);
        }
        return out;
    }

    function addMark(p: DOMPoint, kind: 'hit' | 'miss' | 'hostage') {
        marks = [...marks, { x: p.x, y: p.y, kind }];
    }

    const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

    function onShot(e: PointerEvent) {
        e.stopPropagation();
        if (mode !== 'playing' || advancing) return;
        const s = curId ? sceneById(curId) : undefined;
        const p = svgPoint(e);
        if (!s || !p) return;

        if (s.type === 'video') shootVideo(s, p);
        else shootImage(s, p);
    }

    function shootVideo(s: PScene, p: DOMPoint) {
        const t = (videoEl?.currentTime ?? 0) * 1000;
        const hit = s.zones.filter(z => t >= z.startMs && t < z.endMs).find(z => inZone(z, p));
        if (!hit) {
            misses++;
            addMark(p, 'miss');
            lastEvent = 'Fallo';
            return;
        }
        points += hit.score;
        addMark(p, hit.isHostage ? 'hostage' : 'hit');
        lastEvent = `«${hit.name}»${hit.score ? ' ' + signed(hit.score) : ''}`;
        if (hit.isHostage) {
            hostageHits++;
            redFlash();
        } else {
            hits++;
        }
        if (!hit.next) {
            finish(
                hit.isHostage ? `Le dio al rehén «${hit.name}»` :
                hit.action === HitAction.WIN ? `Ganó: le dio a «${hit.name}»` :
                `«${hit.name}» no lleva a otra escena: aquí termina`,
                hit.isHostage ? 'lose' : hit.action === HitAction.WIN ? 'win' : 'end'
            );
            return;
        }
        goTo(hit.next, '');
    }

    function shootImage(s: PScene, p: DOMPoint) {
        // Flecha "Siguiente": es un control, cambia de escena y nada más
        const arrow = s.zones.find(z => z.action === HitAction.NEXT && !z.isHostage && inZone(z, p));
        if (arrow && arrow.next && arrow.next !== s.id) {
            lastEvent = `Flecha «${arrow.name}»`;
            goTo(arrow.next, '');
            return;
        }

        const zones = s.zones.filter(z => z.action !== HitAction.NONE && inZone(z, p));
        const hostage = zones.filter(z => z.isHostage).sort((a, b) => a.score - b.score)[0];
        const best = hostage ?? [...zones].sort((a, b) => b.score - a.score)[0];

        if (!best) {
            misses++;
            points -= 1;
            addMark(p, 'miss');
            lastEvent = 'Fallo −1';
            return;
        }

        points += best.score;
        addMark(p, best.isHostage ? 'hostage' : 'hit');
        lastEvent = `«${best.name}»${best.score ? ' ' + signed(best.score) : ''}`;
        if (best.isHostage) hostageHits++;
        else {
            hits++;
            for (const z of zones) touched.add(z.id);
        }

        if (best.action === HitAction.LOSE || best.action === HitAction.WIN) {
            if (best.action === HitAction.LOSE) redFlash();
            finish(best.action === HitAction.WIN ? `Ganó: le dio a «${best.name}»` : `Perdió: le dio a «${best.name}»`,
                best.action === HitAction.WIN ? 'win' : 'lose');
            return;
        }
        if (best.action === HitAction.NEXT && best.next && best.next !== s.id) {
            goTo(best.next, '');
            return;
        }
        if (best.isHostage) redFlash();

        // ¿Ya le dio a todos los objetivos? → siguiente escena (o fin)
        if (targets.size > 0 && [...targets].every(id => touched.has(id))) {
            const arrowNext = s.zones.find(z => z.action === HitAction.NEXT && z.next && z.next !== s.id && sceneById(z.next));
            const nextScene = arrowNext ? sceneById(arrowNext.next) : scenes[s.index + 1];
            advancing = true;
            advanceTimer = setTimeout(() => {
                advanceTimer = null;
                advancing = false;
                if (mode !== 'playing') return;
                if (!nextScene) finish('Acertó todos los objetivos de la última escena', 'win');
                else { lastEvent = `Todos los objetivos → Escena ${nextScene.index + 1}`; enterScene(nextScene.id); }
            }, 700);
        }
    }

    // ── Botones ─────────────────────────────────────────────────────────────

    /** Al tocar un botón se le quita el foco: la barra espaciadora es del editor (play/pausa). */
    function btn(fn: () => void) {
        return (e: MouseEvent) => {
            e.stopPropagation();
            (e.currentTarget as HTMLElement).blur();
            fn();
        };
    }

    function onKey(e: KeyboardEvent) {
        if (big && e.key === 'Escape') { e.stopPropagation(); big = false; }
    }

    let activeIndex = $derived(scenes.findIndex(s => s.id === editor.activeSceneId));

    onDestroy(() => {
        clearTimers();
        for (const u of urls.values()) URL.revokeObjectURL(u);
        urls.clear();
    });
</script>

<svelte:window onkeydown={onKey} />

{#if scenes.length > 0}
    {#if !open}
        <button class="tab" title="Mostrar la vista previa" onclick={btn(() => (open = true))}>
            <Play size={14} /> Vista previa
            {#if warnings.length}<span class="tab__warn">⚠ {warnings.length}</span>{/if}
        </button>
    {:else}
        {#if big}
            <!-- Fondo oscuro: un clic fuera achica la vista previa (Esc también) -->
            <div class="backdrop" role="presentation" onclick={btn(() => (big = false))}></div>
        {/if}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="pv" class:pv--big={big} onpointerdown={(e) => e.stopPropagation()}>
            <header class="pv__head">
                <span class="pv__title">Vista previa</span>
                <span class="pv__sub">como lo verá el tirador</span>
                <span class="pv__tools">
                    {#if mode === 'playing' && shown?.type === 'video'}
                        <button class="ic" title={paused ? 'Seguir' : 'Pausar'} onclick={btn(togglePause)}>
                            {#if paused}<Play size={14} />{:else}<Pause size={14} />{/if}
                        </button>
                    {/if}
                    {#if mode !== 'idle'}
                        <button class="ic" title="Probar de nuevo desde el inicio" onclick={btn(() => start())}><RotateCcw size={14} /></button>
                    {/if}
                    <button class="ic" class:ic--on={showZones} title={showZones ? 'Ocultar objetivos (como lo ve el tirador)' : 'Mostrar objetivos'} onclick={btn(() => (showZones = !showZones))}>
                        {#if showZones}<Eye size={14} />{:else}<EyeOff size={14} />{/if}
                    </button>
                    <button class="ic" title={muted ? 'Activar sonido' : 'Silenciar'} onclick={btn(() => (muted = !muted))}>
                        {#if muted}<VolumeX size={14} />{:else}<Volume2 size={14} />{/if}
                    </button>
                    <button class="ic" title={big ? 'Achicar (Esc)' : 'Ampliar'} onclick={btn(() => (big = !big))}>
                        {#if big}<Minimize2 size={14} />{:else}<Maximize2 size={14} />{/if}
                    </button>
                    {#if !big}
                        <button class="ic" title="Esconder la vista previa" onclick={btn(() => { reset(); open = false; })}><X size={14} /></button>
                    {/if}
                </span>
            </header>

            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="stage" class:stage--shoot={mode === 'playing'} onpointerdown={onShot}>
                {#if shown?.url}
                    {#if shown.type === 'video'}
                        {#key shown.id}
                            <video
                                bind:this={videoEl}
                                class="media"
                                src={shown.url}
                                muted={muted}
                                playsinline
                                preload="auto"
                                onloadedmetadata={onVideoMeta}
                                onended={onVideoEnded}
                            ></video>
                        {/key}
                    {:else}
                        {#key shown.id}
                            <img class="media" src={shown.url} alt="" draggable="false"
                                onload={(e) => shown && onImageLoad(e, shown.id)} />
                        {/key}
                    {/if}
                {:else if shown}
                    <div class="nofile">Falta el archivo de esta escena</div>
                {/if}

                <svg bind:this={svgEl} class="overlay" viewBox={`0 0 ${vb.w} ${vb.h}`} preserveAspectRatio="xMidYMid meet">
                    {#each activeZones as z (z.id)}
                        <path
                            data-zone={z.id}
                            d={z.d}
                            fill={showZones ? z.color : 'transparent'}
                            fill-opacity={showZones ? 0.22 : 0}
                            stroke={showZones ? z.color : 'none'}
                            stroke-width={Math.max(vb.w, vb.h) / 320}
                        />
                    {/each}
                    {#each marks as m}
                        <circle cx={m.x} cy={m.y} r={Math.max(vb.w, vb.h) / 110}
                            class="mark mark--{m.kind}" stroke-width={Math.max(vb.w, vb.h) / 500} />
                    {/each}
                </svg>

                {#if flash}<div class="flash"></div>{/if}

                {#if mode === 'idle'}
                    <div class="cover">
                        <button class="go" onclick={btn(() => start())}><Play size={16} /> Probar desde el inicio</button>
                        {#if activeIndex > 0}
                            <button class="go go--sec" onclick={btn(() => start(editor.activeSceneId ?? undefined))}>
                                Desde la escena {activeIndex + 1} (la que editas)
                            </button>
                        {/if}
                        <span class="cover__hint">Un clic sobre la imagen = un disparo</span>
                    </div>
                {:else if mode === 'ended'}
                    <div class="cover cover--end cover--{endKind}">
                        <strong>{endKind === 'win' ? 'Completado' : endKind === 'lose' ? 'Perdió' : 'Fin'}</strong>
                        <span>{endText}</span>
                        <span class="cover__score">{points} pts · {hits} aciertos · {misses} fallos{hostageHits ? ` · ${hostageHits} rehén` : ''}</span>
                        <button class="go" onclick={btn(() => start())}><RotateCcw size={15} /> Probar de nuevo</button>
                    </div>
                {/if}
            </div>

            <div class="pv__status">
                {#if mode === 'idle'}
                    <span>{scenes.length} {scenes.length === 1 ? 'escena' : 'escenas'} · {totalZones} {totalZones === 1 ? 'objetivo' : 'objetivos'}</span>
                {:else if shown}
                    <span class="pv__scene">Escena {shown.index + 1}/{scenes.length}</span>
                    <span class="pv__pts">{points} pts</span>
                    <span class="pv__ok">✓{hits}</span>
                    <span class="pv__miss">✗{misses}</span>
                    {#if hostageHits}<span class="pv__bad">rehén {hostageHits}</span>{/if}
                    {#if lastEvent}<span class="pv__event" title={lastEvent}>{lastEvent}</span>{/if}
                {/if}
            </div>

            {#if warnings.length}
                <button class="pv__warnbtn" onclick={btn(() => (showWarnings = !showWarnings))}>
                    ⚠ {warnings.length} {warnings.length === 1 ? 'cosa por revisar' : 'cosas por revisar'} {showWarnings ? '▴' : '▾'}
                </button>
                {#if showWarnings}
                    <ul class="pv__warnings">
                        {#each warnings as w}<li>{w}</li>{/each}
                    </ul>
                {/if}
            {:else}
                <div class="pv__okline">✓ Nada por revisar</div>
            {/if}

            {#if showZones && big}
                <div class="legend">
                    <span><i style="background:#22c55e"></i>Blanco</span>
                    <span><i style="background:#ef4444"></i>Rehén</span>
                    <span><i style="background:#3b82f6"></i>Siguiente</span>
                    <span><i style="background:#f59e0b"></i>Ganar</span>
                    <span><i style="background:#94a3b8"></i>Sin acción</span>
                </div>
            {/if}
        </div>
    {/if}
{/if}

<style>
    .pv {
        position: absolute;
        left: 0.75rem;
        bottom: 0.75rem;
        z-index: 20;
        width: 22rem;
        display: flex;
        flex-direction: column;
        background: rgba(14, 18, 24, 0.96);
        border: 1px solid #2b3446;
        border-radius: 12px;
        box-shadow: 0 16px 40px -14px rgba(0, 0, 0, 0.85);
        color: #e6e9ef;
        font-size: 0.75rem;
        overflow: hidden;
    }
    .pv--big {
        position: fixed;
        left: 50%;
        top: 50%;
        bottom: auto;
        transform: translate(-50%, -50%);
        z-index: 60;
        /* Lo más grande posible sin salirse de la pantalla: el video queda 16:9 */
        width: min(92vw, 1280px, calc(66vh * 16 / 9));
        max-height: 96vh;
        overflow-y: auto;
        font-size: 0.85rem;
    }
    .backdrop {
        position: fixed;
        inset: 0;
        z-index: 59;
        background: rgba(0, 0, 0, 0.7);
    }

    .pv__head {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.35rem 0.4rem 0.35rem 0.7rem;
        border-bottom: 1px solid #222a38;
    }
    .pv__title { flex: none; font-weight: 700; letter-spacing: 0.02em; white-space: nowrap; }
    .pv__sub { flex: 1 1 auto; min-width: 0; color: #8b93a7; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pv__tools { margin-left: auto; display: flex; gap: 0.15rem; flex: none; }
    .ic {
        display: grid;
        place-items: center;
        width: 1.7rem;
        height: 1.7rem;
        background: transparent;
        border: 1px solid transparent;
        border-radius: 6px;
        color: #aab2c3;
        cursor: pointer;
    }
    .ic:hover { background: rgba(255, 255, 255, 0.07); color: #fff; }
    .ic--on { color: #fff; }

    .stage {
        position: relative;
        aspect-ratio: 16 / 9;
        background: #000;
        overflow: hidden;
        user-select: none;
    }
    .stage--shoot { cursor: crosshair; }
    .media, .overlay {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
    }
    .media { object-fit: contain; pointer-events: none; }
    .overlay { overflow: visible; }
    .nofile {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        color: #8b93a7;
    }
    .mark { fill: none; }
    .mark--hit { stroke: #4ade80; }
    .mark--miss { stroke: #e2e8f0; }
    .mark--hostage { stroke: #f87171; }
    .flash {
        position: absolute;
        inset: 0;
        background: rgba(239, 68, 68, 0.35);
        pointer-events: none;
    }

    .cover {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.45rem;
        background: rgba(0, 0, 0, 0.45);
        text-align: center;
        padding: 0.75rem;
    }
    .cover--end { background: rgba(0, 0, 0, 0.72); }
    .cover--end strong { font-size: 1.15rem; }
    .cover--win strong { color: #4ade80; }
    .cover--lose strong { color: #f87171; }
    .cover__hint { color: #aab2c3; font-size: 0.7rem; }
    .cover__score { color: #cbd5e1; }
    .go {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.45rem 0.9rem;
        background: #cd001a;
        border: none;
        border-radius: 8px;
        color: #fff;
        font-weight: 700;
        cursor: pointer;
    }
    .go:hover { background: #e3122e; }
    .go--sec {
        background: rgba(255, 255, 255, 0.1);
        font-weight: 600;
    }
    .go--sec:hover { background: rgba(255, 255, 255, 0.18); }

    .pv__status {
        display: flex;
        align-items: center;
        gap: 0.55rem;
        min-height: 1.9rem;
        padding: 0.3rem 0.7rem;
        border-top: 1px solid #222a38;
        white-space: nowrap;
        overflow: hidden;
    }
    .pv__scene { color: #aab2c3; }
    .pv__pts { font-weight: 700; }
    .pv__ok { color: #4ade80; }
    .pv__miss { color: #cbd5e1; }
    .pv__bad { color: #f87171; }
    .pv__event { color: #8b93a7; overflow: hidden; text-overflow: ellipsis; min-width: 0; }

    .pv__warnbtn {
        padding: 0.35rem 0.7rem;
        background: rgba(245, 158, 11, 0.12);
        border: none;
        border-top: 1px solid #222a38;
        color: #fbbf24;
        text-align: left;
        font-size: inherit;
        cursor: pointer;
    }
    .pv__warnbtn:hover { background: rgba(245, 158, 11, 0.2); }
    .pv__warnings {
        margin: 0;
        padding: 0.35rem 0.7rem 0.5rem 1.6rem;
        max-height: 6rem;
        overflow-y: auto;
        color: #fcd34d;
        background: rgba(245, 158, 11, 0.06);
    }
    .pv__warnings li { margin: 0.15rem 0; }
    .pv__okline {
        padding: 0.35rem 0.7rem;
        border-top: 1px solid #222a38;
        color: #4ade80;
    }

    .legend {
        display: flex;
        flex-wrap: wrap;
        gap: 0.3rem 0.7rem;
        padding: 0.3rem 0.7rem 0.45rem;
        border-top: 1px solid #222a38;
        color: #8b93a7;
        font-size: 0.68rem;
    }
    .legend i {
        display: inline-block;
        width: 0.55rem;
        height: 0.55rem;
        margin-right: 0.3rem;
        border-radius: 2px;
        vertical-align: middle;
    }

    .tab {
        position: absolute;
        left: 0.75rem;
        bottom: 0.75rem;
        z-index: 20;
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.4rem 0.7rem;
        background: rgba(14, 18, 24, 0.94);
        border: 1px solid #2b3446;
        border-radius: 999px;
        color: #e6e9ef;
        font-size: 0.75rem;
        font-weight: 600;
        cursor: pointer;
    }
    .tab:hover { border-color: #cd001a; }
    .tab__warn { color: #fbbf24; }

    /* Nada dentro de un botón se queda con el clic */
    .pv button :global(*), .tab :global(*) { pointer-events: none; }
</style>
