<script lang="ts">
	import { login } from '$lib/services/authService';

	let username = $state('');
	let password = $state('');
	let error = $state('');
	let busy = $state(false);

	async function submit(e: Event) {
		e.preventDefault();
		if (!username.trim() || !password) return;
		busy = true;
		error = '';
		try {
			await login(username.trim(), password);
			password = '';
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			busy = false;
		}
	}
</script>

<div class="login-cover">
	<form class="login-box" onsubmit={submit}>
		<p class="login-brand">SETIC <span>BUILDER</span></p>
		<p class="login-sub">Inicia sesión con tu cuenta de administrador</p>

		<label class="login-label" for="lg-user">Usuario</label>
		<input id="lg-user" class="login-input" bind:value={username} autocomplete="username" />

		<label class="login-label" for="lg-pass">Contraseña</label>
		<input id="lg-pass" class="login-input" type="password" bind:value={password} autocomplete="current-password" />

		{#if error}
			<p class="login-error">{error}</p>
		{/if}

		<button class="login-btn" type="submit" disabled={busy}>
			{busy ? 'Entrando...' : 'Ingresar'}
		</button>
	</form>
</div>

<style>
	.login-cover {
		position: fixed;
		inset: 0;
		z-index: 50000;
		background: rgba(10, 13, 20, 0.92);
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.login-box {
		width: 90%;
		max-width: 22rem;
		background: #161b26;
		border: 1px solid #2b3446;
		border-radius: 10px;
		padding: 2rem 1.75rem;
		color: #e6e9ef;
	}
	.login-brand {
		font-size: 1.6rem;
		font-weight: 800;
		font-style: italic;
		text-align: center;
		margin: 0;
		letter-spacing: 0.02em;
	}
	.login-brand span { color: #dc2626; }
	.login-sub {
		text-align: center;
		font-size: 0.85rem;
		color: #8b93a7;
		margin: 0.4rem 0 1.5rem;
	}
	.login-label {
		display: block;
		font-size: 0.7rem;
		letter-spacing: 0.15em;
		text-transform: uppercase;
		color: #dc2626;
		margin: 0.9rem 0 0.35rem;
	}
	.login-input {
		width: 100%;
		padding: 0.65rem 0.75rem;
		border-radius: 6px;
		border: 1px solid #2b3446;
		background: #0e1218;
		color: #e6e9ef;
		font-size: 0.95rem;
	}
	.login-error {
		color: #f87171;
		font-size: 0.85rem;
		margin: 0.9rem 0 0;
	}
	.login-btn {
		width: 100%;
		margin-top: 1.5rem;
		padding: 0.8rem;
		border: none;
		border-radius: 6px;
		background: #dc2626;
		color: #fff;
		font-weight: 700;
		letter-spacing: 0.15em;
		text-transform: uppercase;
		cursor: pointer;
	}
	.login-btn:disabled { opacity: 0.5; cursor: default; }
</style>