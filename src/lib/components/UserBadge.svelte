<script lang="ts">
	/**
	 * Credencial del usuario en el Builder, con el botón para cerrar sesión.
	 * Va en una esquina, plegada a la inicial para no tapar el lienzo; al
	 * pasar el mouse (o tocarla) muestra el nombre y el botón Salir.
	 */
	import { session, logout } from '$lib/services/authService';
	import { LogOut } from '@lucide/svelte';

	/**
	 * inline: va dentro de una barra (siempre abierta). Si no, flota en una esquina.
	 * compact: solo el nombre, sin la línea del rol (para barras con poco espacio).
	 */
	let { inline = false, compact = false }: { inline?: boolean; compact?: boolean } = $props();

	let open = $state(false);
	let confirming = $state(false);

	const initial = $derived(($session?.username ?? '?').trim().charAt(0).toUpperCase());

	function ask() {
		confirming = true;
	}

	function doLogout() {
		confirming = false;
		open = false;
		// El trabajo sin publicar queda guardado en este navegador (se restaura al volver a entrar)
		logout();
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape' && confirming) confirming = false;
	}
</script>

<svelte:window onkeydown={onKey} />

{#if $session}
	<div
		class="badge"
		class:badge--open={open || inline}
		class:badge--inline={inline}
		role="group"
		aria-label="Sesión"
		onmouseenter={() => !inline && (open = true)}
		onmouseleave={() => !inline && (open = false)}
	>
		<button class="badge__avatar" title={$session.username} onclick={() => !inline && (open = !open)}>{initial}</button>
		<div class="badge__body">
			<span class="badge__name">{$session.username}</span>
			{#if !compact}<span class="badge__role">Superadmin · Builder</span>{/if}
		</div>
		<button class="badge__out" onclick={ask} title="Cerrar sesión">
			<LogOut size={15} />
			<span>Salir</span>
		</button>
	</div>
{/if}

{#if confirming}
	<div class="dlg" role="presentation" onclick={(e) => e.target === e.currentTarget && (confirming = false)}>
		<div class="dlg__box" role="dialog" aria-modal="true" aria-labelledby="logout-title">
			<span class="dlg__icon"><LogOut size={22} /></span>
			<h3 id="logout-title" class="dlg__title">¿Cerrar sesión?</h3>
			<p class="dlg__text">
				Tu trabajo sin publicar queda guardado en este navegador y podrás restaurarlo al volver a entrar.
			</p>
			<p class="dlg__text dlg__text--dim">
				La sesión también se cierra en SETIC Virt si está abierto en este mismo navegador.
			</p>
			<div class="dlg__actions">
				<button class="dlg__btn" onclick={() => (confirming = false)}>Cancelar</button>
				<button class="dlg__btn dlg__btn--danger" onclick={doLogout}>Cerrar sesión</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.badge {
		position: fixed;
		left: 0.75rem;
		bottom: 0.75rem;
		z-index: 450;
		display: flex;
		align-items: center;
		gap: 0;
		padding: 0.3rem;
		background: rgba(14, 18, 24, 0.92);
		border: 1px solid #2b3446;
		border-radius: 12px;
		box-shadow: 0 10px 30px -12px rgba(0, 0, 0, 0.8);
		backdrop-filter: blur(6px);
		color: #e6e9ef;
		font-family: inherit;
		transition: gap 0.15s;
	}
	.badge--open { gap: 0.6rem; }
	.badge--inline {
		position: static;
		z-index: auto;
		padding: 0.25rem;
		background: rgba(255, 255, 255, 0.03);
		box-shadow: none;
		backdrop-filter: none;
	}
	.badge--inline .badge__avatar { width: 2rem; height: 2rem; cursor: default; }
	.badge--inline .badge__out { height: 2rem; }

	.badge__avatar {
		display: grid;
		place-items: center;
		width: 2.2rem;
		height: 2.2rem;
		border: none;
		border-radius: 9px;
		background: linear-gradient(135deg, #e0112b, #7a0010);
		color: #fff;
		font-weight: 800;
		font-size: 0.95rem;
		cursor: pointer;
	}

	/* Plegado: solo la inicial. Abierto: nombre y Salir. */
	.badge__body,
	.badge__out {
		max-width: 0;
		opacity: 0;
		overflow: hidden;
		white-space: nowrap;
		transition: max-width 0.2s ease, opacity 0.15s ease;
	}
	.badge--open .badge__body { max-width: 12rem; opacity: 1; }
	.badge--open .badge__out { max-width: 7rem; opacity: 1; }

	.badge__body { display: flex; flex-direction: column; line-height: 1.15; }
	.badge__name { font-size: 0.85rem; font-weight: 700; }
	.badge__role { font-size: 0.68rem; letter-spacing: 0.08em; text-transform: uppercase; color: #8b93a7; }

	.badge__out {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		height: 2.2rem;
		padding: 0;
		border: 1px solid transparent;
		border-radius: 9px;
		background: transparent;
		color: #fca5a5;
		font: inherit;
		font-size: 0.8rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		cursor: pointer;
	}
	.badge--open .badge__out { padding: 0 0.7rem; border-color: rgba(248, 113, 113, 0.4); }
	.badge__out:hover { background: #dc2626; color: #fff; border-color: transparent; }

	.dlg {
		position: fixed;
		inset: 0;
		z-index: 60000;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		background: rgba(0, 0, 0, 0.7);
	}
	.dlg__box {
		width: 100%;
		max-width: 24rem;
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
		margin-bottom: 0.7rem;
		border-radius: 50%;
		background: rgba(220, 38, 38, 0.15);
		color: #f87171;
	}
	.dlg__title { margin: 0 0 0.6rem; font-size: 1.15rem; font-weight: 700; }
	.dlg__text { margin: 0 0 0.5rem; font-size: 0.9rem; line-height: 1.5; color: #c4cad6; }
	.dlg__text--dim { font-size: 0.82rem; color: #8b93a7; }
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
</style>
