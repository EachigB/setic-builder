<script lang="ts">
    /**
     * Pantalla de bienvenida del Builder: se muestra mientras no hay ninguna
     * escena cargada. Explica el flujo en 3 pasos y recibe el primer archivo.
     */
    import { Image, Film, UploadCloud, MousePointerClick, Crosshair, CloudUpload, History } from '@lucide/svelte';
    import UserBadge from './UserBadge.svelte';
    import { loadWorkspace } from '$lib/stores/persistence';

    let { onFile }: { onFile: (file: File) => void } = $props();

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

    @media (max-width: 860px) {
        .home__main { grid-template-columns: 1fr; gap: 2rem; padding: 2rem 1rem; }
        .home__top { padding: 0.8rem 1rem; }
    }
</style>
