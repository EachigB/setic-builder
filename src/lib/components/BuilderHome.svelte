<script lang="ts">
    /**
     * Pantalla de bienvenida del Builder: se muestra mientras no hay ninguna
     * escena cargada. Explica el flujo en 3 pasos, recibe el primer archivo y
     * lista los escenarios ya publicados para abrirlos, editarlos o eliminarlos.
     */
    import { onDestroy } from 'svelte';
    import { Image, Film, UploadCloud, MousePointerClick, Crosshair, CloudUpload, History, Pencil, Search, Trash2 } from '@lucide/svelte';
    import UserBadge from './UserBadge.svelte';
    import { loadWorkspace } from '$lib/stores/persistence';
    import { session, canUseBuilder } from '$lib/services/authService';
    import { deleteScenario, fetchCoverUrl, listScenarios, type ScenarioSummary } from '$lib/services/scenarioEditService';

    let {
        onFile,
        onEdit,
    }: {
        onFile: (file: File) => void;
        /** Abrir un escenario publicado para editarlo */
        onEdit?: (scenario: ScenarioSummary) => void;
    } = $props();

    // ── Escenarios publicados ────────────────────────────────────────────────
    // Solo con una sesión que puede usar el Builder (superadmin): sin ella no
    // se pide la lista, y el servidor tampoco dejaría guardar cambios.
    const allowed = $derived(canUseBuilder($session));
    let list = $state<ScenarioSummary[]>([]);
    let listState = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
    let listError = $state('');
    let query = $state('');
    let covers = $state<Record<string, string>>({});
    const coverUrls: string[] = [];
    let libraryEl: HTMLElement | undefined = $state();

    $effect(() => {
        if (!allowed) {
            list = [];
            listState = 'idle';
            return;
        }
        if (listState === 'idle') loadList();
    });

    async function loadList(): Promise<void> {
        listState = 'loading';
        listError = '';
        try {
            // Los escenarios 3D se editan en el editor 3D de SETIC Virt
            list = (await listScenarios()).filter(s => s.type !== '3d');
            listState = 'ready';
            loadCovers();
        } catch (e) {
            listError = (e as Error).message;
            listState = 'error';
        }
    }

    /** Portadas de a tres a la vez, para no saturar el servidor */
    async function loadCovers(): Promise<void> {
        const queue = list.filter(s => s.media?.length && !covers[s.id]);
        const worker = async () => {
            while (queue.length) {
                const s = queue.shift()!;
                const url = await fetchCoverUrl(s.id);
                if (url) {
                    coverUrls.push(url);
                    covers = { ...covers, [s.id]: url };
                }
            }
        };
        await Promise.all([worker(), worker(), worker()]);
    }

    onDestroy(() => coverUrls.forEach(u => URL.revokeObjectURL(u)));

    const norm = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const filtered = $derived(query.trim() ? list.filter(s => norm(s.name).includes(norm(query.trim()))) : list);

    // ── Eliminar un escenario, con doble confirmación ─────────────────────
    // 1.ª: qué se pierde. 2.ª: escribir el nombre del escenario (como al
    // eliminar un tirador en SETIC Virt). Sin la segunda no se borra nada.

    let del = $state<{ s: ScenarioSummary; step: 1 | 2; typed: string; busy: boolean; error: string } | null>(null);
    let notice = $state('');
    let noticeTimer: ReturnType<typeof setTimeout> | undefined;

    /** Mismo nombre sin importar mayúsculas, tildes ni espacios de más */
    const sameName = (a: string, b: string) => {
        const n = (t: string) => norm(t).replace(/\s+/g, ' ').trim();
        return n(a) === n(b);
    };
    const nameOk = $derived(!!del && sameName(del.typed, del.s.name));

    function askDelete(s: ScenarioSummary): void {
        del = { s, step: 1, typed: '', busy: false, error: '' };
    }

    function closeDelete(): void {
        if (!del?.busy) del = null;
    }

    async function confirmDelete(): Promise<void> {
        if (!del || del.busy || !nameOk) return;
        const s = del.s;
        del.busy = true;
        del.error = '';
        try {
            const existed = await deleteScenario(s.id);
            list = list.filter(x => x.id !== s.id);
            if (covers[s.id]) {
                URL.revokeObjectURL(covers[s.id]);
                const rest = { ...covers };
                delete rest[s.id];
                covers = rest;
            }
            del = null;
            showNotice(existed ? `«${s.name}» se eliminó.` : `«${s.name}» ya no estaba en el servidor; se quitó de la lista.`);
        } catch (e) {
            if (del) {
                del.busy = false;
                del.error = (e as Error).message;
            }
        }
    }

    function showNotice(text: string): void {
        notice = text;
        clearTimeout(noticeTimer);
        noticeTimer = setTimeout(() => (notice = ''), 6000);
    }

    onDestroy(() => clearTimeout(noticeTimer));

    /** Al aparecer: en la 1.ª confirmación, el foco va a Cancelar (Enter no borra); en la 2.ª, a la casilla */
    function focusOnMount(node: HTMLElement): void {
        node.focus();
    }

    function onWindowKey(e: KeyboardEvent): void {
        if (e.key === 'Escape' && del) closeDelete();
    }

    function fmtDate(iso?: string): string {
        const t = iso ? Date.parse(iso) : NaN;
        if (!Number.isFinite(t)) return '';
        return new Date(t).toLocaleDateString('es-EC', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    let fileInputEl: HTMLInputElement;
    let dragging = $state(false);
    let dragDepth = 0;

    // Trabajo sin publicar que quedó guardado en este navegador
    const saved = (() => {
        const w = loadWorkspace();
        if (!w || !w.entities?.length || !w.mediaName) return null;
        return { name: w.mediaName, count: w.entities.length, when: timeAgo(w.savedAt) };
    })();

    function timeAgo(iso: string): string {
        const t = Date.parse(iso);
        if (!Number.isFinite(t)) return '';
        const min = Math.round((Date.now() - t) / 60000);
        if (min < 1) return 'hace un momento';
        if (min < 60) return `hace ${min} min`;
        const h = Math.round(min / 60);
        if (h < 24) return `hace ${h} h`;
        const d = Math.round(h / 24);
        return d === 1 ? 'ayer' : `hace ${d} días`;
    }

    function pick(e: Event): void {
        const input = e.currentTarget as HTMLInputElement;
        const file = input.files?.[0];
        if (file) onFile(file);
        input.value = '';
    }

    function onDragEnter(e: DragEvent): void {
        e.preventDefault();
        dragDepth++;
        dragging = true;
    }
    function onDragLeave(): void {
        dragDepth = Math.max(0, dragDepth - 1);
        if (dragDepth === 0) dragging = false;
    }
    function onDrop(e: DragEvent): void {
        e.preventDefault();
        dragDepth = 0;
        dragging = false;
        const file = e.dataTransfer?.files[0];
        if (file && /^(image|video)\//.test(file.type)) onFile(file);
    }

    const STEPS = [
        { icon: UploadCloud, title: 'Sube la escena', text: 'Una foto o un video del polígono, tal como se verá en la proyección.' },
        { icon: MousePointerClick, title: 'Marca los objetivos', text: 'Rodea cada blanco o rehén y define qué pasa al impactarlo: puntos, perder o pasar a otra escena.' },
        { icon: CloudUpload, title: 'Publica', text: 'Aparece al instante en la lista de escenarios de todos los polígonos SETIC Virt.' },
    ];
</script>

<svelte:window onkeydown={onWindowKey} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
    class="home"
    ondragenter={onDragEnter}
    ondragover={(e) => e.preventDefault()}
    ondragleave={onDragLeave}
    ondrop={onDrop}
>
    <header class="home__top">
        <div class="brand">
            <span class="brand__mark"><Crosshair size={18} strokeWidth={2.4} /></span>
            <span class="brand__name">SETIC <b>BUILDER</b></span>
        </div>
        <UserBadge inline />
    </header>

    <main class="home__main">
        <section class="hero">
            <p class="eyebrow"><span></span>Editor de escenarios</p>
            <h1 class="title">Crea escenarios de tiro <em>interactivos</em></h1>
            <p class="lead">
                Convierte cualquier imagen o video en un ejercicio de entrenamiento: marca dónde
                están los objetivos y SETIC Virt se encarga de detectar cada impacto.
            </p>

            <button
                class="drop"
                class:drop--over={dragging}
                onclick={() => fileInputEl.click()}
            >
                <span class="drop__icons">
                    <span class="drop__icon"><Image size={26} /></span>
                    <span class="drop__icon"><Film size={26} /></span>
                </span>
                <span class="drop__title">{dragging ? 'Suelta el archivo aquí' : 'Nuevo escenario'}</span>
                <span class="drop__text">Arrastra una imagen o un video, o <u>haz clic para elegirlo</u></span>
                <span class="drop__formats">
                    <span>PNG</span><span>JPG</span><span>WebP</span><span class="sep"></span><span>MP4</span><span>WebM</span><span>MOV</span>
                </span>
            </button>
            <input bind:this={fileInputEl} type="file" accept="image/*,video/*" class="hidden-input" onchange={pick} />

            {#if allowed && list.length > 0 && onEdit}
                <button class="to-library" onclick={() => libraryEl?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                    <Pencil size={15} /> o edita uno ya publicado ({list.length})
                </button>
            {/if}

            {#if saved}
                <div class="saved">
                    <span class="saved__icon"><History size={18} /></span>
                    <div>
                        <p class="saved__title">Tienes trabajo sin publicar</p>
                        <p class="saved__text">
                            <b>{saved.name}</b> · {saved.count} {saved.count === 1 ? 'objetivo' : 'objetivos'}{saved.when ? ` · ${saved.when}` : ''}.
                            Carga ese mismo archivo y se restaura solo.
                        </p>
                    </div>
                </div>
            {/if}
        </section>

        <section class="steps" aria-label="Cómo funciona">
            <p class="steps__label">Cómo funciona</p>
            {#each STEPS as step, i}
                {@const Icon = step.icon}
                <div class="step">
                    <span class="step__num">{i + 1}</span>
                    <div class="step__body">
                        <p class="step__title"><Icon size={16} /> {step.title}</p>
                        <p class="step__text">{step.text}</p>
                    </div>
                </div>
            {/each}
            <p class="steps__tip">
                Atajos: <kbd>L</kbd> lazo · <kbd>P</kbd> polígono · <kbd>V</kbd> seleccionar · <kbd>?</kbd> ver todos
            </p>
        </section>
    </main>

    {#if allowed && onEdit}
        <section class="library" bind:this={libraryEl} aria-label="Escenarios publicados">
            <div class="library__head">
                <div>
                    <p class="steps__label library__label">Escenarios publicados</p>
                    <p class="library__sub">Ábrelo, cambia los objetivos o las escenas y guarda: se actualiza en todos los polígonos. También puedes eliminarlo.</p>
                </div>
                {#if listState === 'ready' && list.length > 6}
                    <label class="library__search">
                        <Search size={15} />
                        <input bind:value={query} placeholder="Buscar por nombre" />
                    </label>
                {/if}
            </div>

            {#if notice}
                <p class="library__notice" role="status"><Trash2 size={15} /> {notice}</p>
            {/if}

            {#if listState === 'loading'}
                <p class="library__note">Cargando escenarios…</p>
            {:else if listState === 'error'}
                <p class="library__note library__note--error">
                    {listError}
                    <button class="library__retry" onclick={loadList}>Reintentar</button>
                </p>
            {:else if listState === 'ready' && filtered.length === 0}
                <p class="library__note">{list.length === 0 ? 'Todavía no hay escenarios publicados.' : 'Ningún escenario coincide con la búsqueda.'}</p>
            {:else}
                <div class="library__grid">
                    {#each filtered as s (s.id)}
                        <article class="card">
                            <div class="card__thumb">
                                {#if covers[s.id]}
                                    <img src={covers[s.id]} alt="" />
                                {:else}
                                    <Film size={26} />
                                {/if}
                            </div>
                            <div class="card__body">
                                <p class="card__name" title={s.name}>{s.name}</p>
                                <p class="card__meta">
                                    {s.organizationId ? 'De un cliente' : 'Catálogo SETIC'}
                                    {#if fmtDate(s.updatedAt ?? s.createdAt)} · {fmtDate(s.updatedAt ?? s.createdAt)}{/if}
                                </p>
                            </div>
                            <div class="card__actions">
                                <button class="card__edit" onclick={() => onEdit?.(s)}>
                                    <Pencil size={14} /> Editar
                                </button>
                                <button class="card__delete" onclick={() => askDelete(s)} title="Eliminar este escenario">
                                    <Trash2 size={14} /> Eliminar
                                </button>
                            </div>
                        </article>
                    {/each}
                </div>
            {/if}
        </section>
    {/if}

    {#if del}
        <div class="dlg" role="presentation">
            <div class="dlg__box" role="alertdialog" aria-modal="true" aria-labelledby="del-title">
                <span class="dlg__icon"><Trash2 size={22} /></span>
                <p class="dlg__step">Confirmación {del.step} de 2</p>
                {#if del.step === 1}
                    <h3 id="del-title" class="dlg__title">¿Eliminar «{del.s.name}»?</h3>
                    <p class="dlg__text">
                        Se borra del servidor con todas sus escenas, videos y objetivos, y deja de aparecer
                        en todos los polígonos. <b>No se puede deshacer.</b>
                    </p>
                    {#if del.s.organizationId}
                        <p class="dlg__text dlg__text--warn">Es un escenario de un cliente: también desaparece de su lista.</p>
                    {/if}
                    <p class="dlg__text dlg__text--dim">El historial de los ejercicios que ya se jugaron con él se conserva.</p>
                    <div class="dlg__actions">
                        <button class="dlg__btn" use:focusOnMount onclick={closeDelete}>Cancelar</button>
                        <button class="dlg__btn dlg__btn--danger" onclick={() => { if (del) del.step = 2; }}>Sí, eliminar</button>
                    </div>
                {:else}
                    <h3 id="del-title" class="dlg__title">Escribe el nombre para confirmar</h3>
                    <p class="dlg__text">Para eliminar definitivamente <b>«{del.s.name}»</b>, escribe su nombre:</p>
                    <form onsubmit={(e) => { e.preventDefault(); confirmDelete(); }}>
                        <input
                            class="dlg__input"
                            bind:value={del.typed}
                            placeholder={del.s.name}
                            autocomplete="off"
                            spellcheck="false"
                            disabled={del.busy}
                            use:focusOnMount
                        />
                        {#if del.error}<p class="dlg__error">{del.error}</p>{/if}
                        <div class="dlg__actions">
                            <button type="button" class="dlg__btn" onclick={closeDelete} disabled={del.busy}>Cancelar</button>
                            <button type="submit" class="dlg__btn dlg__btn--danger dlg__btn--wide" disabled={!nameOk || del.busy}>
                                {del.busy ? 'Eliminando…' : 'Eliminar definitivamente'}
                            </button>
                        </div>
                    </form>
                {/if}
            </div>
        </div>
    {/if}
</div>

<style>
    .home {
        position: fixed;
        inset: 0;
        z-index: 30;
        display: flex;
        flex-direction: column;
        overflow-y: auto;
        color: #e6e9ef;
        background:
            radial-gradient(60rem 30rem at 85% -10%, rgba(224, 17, 43, 0.16), transparent 60%),
            radial-gradient(40rem 30rem at -10% 110%, rgba(224, 17, 43, 0.08), transparent 60%),
            linear-gradient(rgba(255, 255, 255, 0.025) 1px, transparent 1px) 0 0 / 48px 48px,
            linear-gradient(90deg, rgba(255, 255, 255, 0.025) 1px, transparent 1px) 0 0 / 48px 48px,
            #0b0e14;
    }

    .home__top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        padding: 1rem 2rem;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }

    .brand { display: flex; align-items: center; gap: 0.65rem; }
    .brand__mark {
        display: grid;
        place-items: center;
        width: 2.1rem;
        height: 2.1rem;
        border-radius: 9px;
        background: linear-gradient(135deg, #e0112b, #7a0010);
        color: #fff;
        box-shadow: 0 6px 20px -6px rgba(224, 17, 43, 0.7);
    }
    .brand__name { font-size: 0.95rem; letter-spacing: 0.18em; font-weight: 600; color: #c4cad6; }
    .brand__name b { color: #fff; font-weight: 800; }

    .home__main {
        flex: 1;
        display: grid;
        grid-template-columns: minmax(0, 1.25fr) minmax(0, 0.9fr);
        gap: 3.5rem;
        align-items: center;
        width: 100%;
        max-width: 72rem;
        margin: 0 auto;
        padding: 3rem 2rem;
    }

    .eyebrow {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        margin: 0 0 1rem;
        font-size: 0.72rem;
        font-weight: 700;
        letter-spacing: 0.22em;
        text-transform: uppercase;
        color: #f87171;
    }
    .eyebrow span { width: 1.6rem; height: 2px; background: #e0112b; }

    .title {
        margin: 0;
        font-size: clamp(2rem, 3.6vw, 3rem);
        line-height: 1.05;
        font-weight: 800;
        letter-spacing: -0.01em;
    }
    .title em { font-style: normal; color: #ff3b4e; }

    .lead {
        margin: 1rem 0 2rem;
        max-width: 34rem;
        font-size: 1rem;
        line-height: 1.6;
        color: #9aa3b5;
    }

    .drop {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.55rem;
        width: 100%;
        padding: 2.4rem 1.5rem;
        border: 2px dashed #34405a;
        border-radius: 16px;
        background: rgba(22, 27, 38, 0.75);
        color: inherit;
        font: inherit;
        cursor: pointer;
        transition: border-color 0.15s, background 0.15s, transform 0.15s;
    }
    .drop:hover { border-color: #e0112b; background: rgba(224, 17, 43, 0.06); }
    .drop--over { border-color: #e0112b; background: rgba(224, 17, 43, 0.12); transform: scale(1.01); }
    .drop:focus-visible { outline: 2px solid #e0112b; outline-offset: 3px; }

    .drop__icons { display: flex; gap: 0.6rem; margin-bottom: 0.3rem; }
    .drop__icon {
        display: grid;
        place-items: center;
        width: 3.2rem;
        height: 3.2rem;
        border-radius: 12px;
        background: #1d2433;
        border: 1px solid #2b3446;
        color: #ff5a6a;
    }
    .drop__title { font-size: 1.25rem; font-weight: 700; }
    .drop__text { font-size: 0.9rem; color: #9aa3b5; }
    .drop__text u { color: #e6e9ef; text-underline-offset: 3px; }
    .drop__formats {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        align-items: center;
        gap: 0.35rem;
        margin-top: 0.6rem;
    }
    .drop__formats span:not(.sep) {
        padding: 0.15rem 0.5rem;
        border-radius: 999px;
        border: 1px solid #2b3446;
        font-size: 0.68rem;
        font-weight: 600;
        letter-spacing: 0.06em;
        color: #8b93a7;
    }
    .drop__formats .sep { width: 1px; height: 0.9rem; background: #2b3446; margin: 0 0.2rem; }

    .hidden-input { display: none; }

    .saved {
        display: flex;
        gap: 0.8rem;
        align-items: flex-start;
        margin-top: 1rem;
        padding: 0.9rem 1rem;
        border-radius: 12px;
        border: 1px solid rgba(245, 158, 11, 0.35);
        background: rgba(245, 158, 11, 0.08);
    }
    .saved__icon { color: #fbbf24; margin-top: 0.1rem; }
    .saved__title { margin: 0; font-size: 0.9rem; font-weight: 700; color: #fde68a; }
    .saved__text { margin: 0.2rem 0 0; font-size: 0.82rem; line-height: 1.5; color: #c4cad6; }
    .saved__text b { color: #fff; }

    .steps {
        padding: 1.6rem;
        border-radius: 16px;
        border: 1px solid #222a39;
        background: rgba(17, 21, 30, 0.8);
        backdrop-filter: blur(6px);
    }
    .steps__label {
        margin: 0 0 1.2rem;
        font-size: 0.72rem;
        font-weight: 700;
        letter-spacing: 0.2em;
        text-transform: uppercase;
        color: #8b93a7;
    }
    .step { display: flex; gap: 1rem; position: relative; padding-bottom: 1.4rem; }
    .step:not(:last-of-type)::before {
        content: '';
        position: absolute;
        left: 1rem;
        top: 2.2rem;
        bottom: 0.2rem;
        width: 1px;
        background: linear-gradient(#e0112b, #2b3446);
    }
    .step__num {
        flex-shrink: 0;
        display: grid;
        place-items: center;
        width: 2rem;
        height: 2rem;
        border-radius: 50%;
        border: 1px solid rgba(224, 17, 43, 0.6);
        background: rgba(224, 17, 43, 0.12);
        color: #ff5a6a;
        font-weight: 800;
        font-size: 0.9rem;
    }
    .step__title {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        margin: 0.3rem 0 0.25rem;
        font-size: 0.98rem;
        font-weight: 700;
    }
    .step__text { margin: 0; font-size: 0.86rem; line-height: 1.55; color: #9aa3b5; }

    .steps__tip {
        margin: 0.4rem 0 0;
        padding-top: 1rem;
        border-top: 1px solid #222a39;
        font-size: 0.78rem;
        color: #8b93a7;
        line-height: 1.9;
    }
    kbd {
        display: inline-block;
        min-width: 1.4rem;
        padding: 0 0.35rem;
        border-radius: 5px;
        border: 1px solid #34405a;
        border-bottom-width: 2px;
        background: #1d2433;
        color: #e6e9ef;
        font: inherit;
        font-size: 0.72rem;
        font-weight: 700;
        text-align: center;
    }

    .to-library {
        display: inline-flex;
        align-items: center;
        gap: 0.45rem;
        margin-top: 0.9rem;
        padding: 0.35rem 0.2rem;
        border: 0;
        background: none;
        color: #c4cad6;
        font: inherit;
        font-size: 0.9rem;
        cursor: pointer;
        text-decoration: underline;
        text-underline-offset: 3px;
    }
    .to-library:hover { color: #fff; }

    .library {
        width: 100%;
        max-width: 72rem;
        margin: 0 auto;
        padding: 0 2rem 3rem;
        scroll-margin-top: 1rem;
    }
    .library__head {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 1rem;
        flex-wrap: wrap;
        padding-top: 1.6rem;
        margin-bottom: 1rem;
        border-top: 1px solid rgba(255, 255, 255, 0.06);
    }
    .library__label { margin-bottom: 0.35rem; }
    .library__sub { margin: 0; font-size: 0.86rem; color: #9aa3b5; }
    .library__search {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.45rem 0.7rem;
        border-radius: 10px;
        border: 1px solid #2b3446;
        background: #161b26;
        color: #8b93a7;
    }
    .library__search input {
        width: 14rem;
        border: 0;
        outline: 0;
        background: transparent;
        color: #e6e9ef;
        font: inherit;
        font-size: 0.88rem;
    }
    .library__note { margin: 0.5rem 0; font-size: 0.9rem; color: #9aa3b5; }
    .library__note--error { color: #fca5a5; }
    .library__retry {
        margin-left: 0.6rem;
        padding: 0.2rem 0.6rem;
        border-radius: 8px;
        border: 1px solid #34405a;
        background: #1d2433;
        color: #e6e9ef;
        font: inherit;
        font-size: 0.82rem;
        cursor: pointer;
    }
    .library__grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(14.5rem, 1fr));
        gap: 1rem;
    }
    .card {
        display: flex;
        flex-direction: column;
        overflow: hidden;
        border-radius: 14px;
        border: 1px solid #222a39;
        background: rgba(17, 21, 30, 0.85);
    }
    .card__thumb {
        display: grid;
        place-items: center;
        aspect-ratio: 16 / 9;
        background: #0f131b;
        color: #34405a;
        overflow: hidden;
    }
    .card__thumb img { width: 100%; height: 100%; object-fit: cover; }
    .card__body { padding: 0.7rem 0.85rem 0.2rem; min-width: 0; }
    .card__name {
        margin: 0;
        font-size: 0.95rem;
        font-weight: 700;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .card__meta { margin: 0.2rem 0 0; font-size: 0.76rem; color: #8b93a7; }
    .card__actions { display: flex; gap: 0.5rem; margin: 0.7rem 0.85rem 0.85rem; }
    .card__edit,
    .card__delete {
        flex: 1;
        min-width: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.4rem;
        padding: 0.5rem 0.5rem;
        border-radius: 10px;
        border: 1px solid rgba(224, 17, 43, 0.55);
        background: rgba(224, 17, 43, 0.12);
        color: #ffd5d9;
        font: inherit;
        font-size: 0.86rem;
        font-weight: 700;
        cursor: pointer;
        transition: background 0.15s, border-color 0.15s;
    }
    .card__edit:hover { background: rgba(224, 17, 43, 0.25); border-color: #e0112b; color: #fff; }
    /* Eliminar: discreto hasta pasar el mouse, para no competir con Editar */
    .card__delete { border-color: #2b3446; background: transparent; color: #9aa3b5; font-weight: 600; }
    .card__delete:hover { border-color: #dc2626; background: rgba(220, 38, 38, 0.12); color: #fca5a5; }

    .library__notice {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin: 0 0 1rem;
        padding: 0.6rem 0.9rem;
        border-radius: 10px;
        border: 1px solid rgba(34, 197, 94, 0.35);
        background: rgba(34, 197, 94, 0.08);
        color: #bbf7d0;
        font-size: 0.88rem;
    }

    /* Confirmación (mismo estilo que la de Salir) */
    .dlg {
        position: fixed;
        inset: 0;
        z-index: 100;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1rem;
        background: rgba(0, 0, 0, 0.7);
    }
    .dlg__box {
        width: 100%;
        max-width: 28rem;
        padding: 1.6rem;
        text-align: center;
        background: #161b26;
        border: 1px solid #2b3446;
        border-radius: 12px;
        color: #e6e9ef;
        box-shadow: 0 30px 80px -20px rgba(0, 0, 0, 0.9);
    }
    .dlg__icon {
        display: inline-grid;
        place-items: center;
        width: 3rem;
        height: 3rem;
        margin-bottom: 0.5rem;
        border-radius: 50%;
        background: rgba(220, 38, 38, 0.15);
        color: #f87171;
    }
    .dlg__step {
        margin: 0 0 0.4rem;
        font-size: 0.7rem;
        font-weight: 700;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: #f87171;
    }
    .dlg__title { margin: 0 0 0.6rem; font-size: 1.15rem; font-weight: 700; overflow-wrap: anywhere; }
    .dlg__text { margin: 0 0 0.5rem; font-size: 0.9rem; line-height: 1.5; color: #c4cad6; overflow-wrap: anywhere; }
    .dlg__text b { color: #fff; }
    .dlg__text--warn { color: #fcd34d; }
    .dlg__text--dim { font-size: 0.82rem; color: #8b93a7; }
    .dlg__input {
        width: 100%;
        margin-top: 0.4rem;
        padding: 0.6rem 0.75rem;
        border-radius: 8px;
        border: 1px solid #34405a;
        background: #0f131b;
        color: #e6e9ef;
        font: inherit;
        font-size: 0.92rem;
        text-align: center;
    }
    .dlg__input:focus { outline: 2px solid #dc2626; outline-offset: 1px; }
    .dlg__error { margin: 0.6rem 0 0; font-size: 0.85rem; color: #fca5a5; }
    .dlg__actions { display: flex; gap: 0.6rem; margin-top: 1.1rem; }
    .dlg__btn {
        flex: 1;
        padding: 0.7rem;
        border: none;
        border-radius: 8px;
        background: #2b3446;
        color: #e6e9ef;
        font: inherit;
        font-weight: 600;
        cursor: pointer;
    }
    .dlg__btn:hover { background: #36415a; }
    .dlg__btn--danger { background: #dc2626; color: #fff; }
    .dlg__btn--danger:hover { background: #b91c1c; }
    .dlg__btn:disabled { opacity: 0.45; cursor: not-allowed; }
    .dlg__btn--danger:disabled:hover { background: #dc2626; }
    .dlg__btn--wide { flex: 1.7; white-space: nowrap; }

    @media (max-width: 860px) {
        .home__main { grid-template-columns: 1fr; gap: 2rem; padding: 2rem 1rem; }
        .home__top { padding: 0.8rem 1rem; }
        .library { padding: 0 1rem 2rem; }
    }
</style>
