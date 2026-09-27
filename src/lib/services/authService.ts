import { writable } from 'svelte/store';
import { browser } from '$app/environment';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const TOKEN_KEY = 'setic-token';
const USER_KEY = 'setic-user';

/** Roles que pueden usar el Builder (publicar al catálogo). */
const BUILDER_ROLES = ['superadmin'];

export interface SessionUser {
	id: string;
	username: string;
	role: string;
	organization: string | null;
}

function readUser(): SessionUser | null {
	if (!browser) return null;
	try {
		const raw = localStorage.getItem(USER_KEY);
		return raw ? JSON.parse(raw) : null;
	} catch {
		return null;
	}
}

/** Usuario en sesión (compartido con SETIC Virt: mismo dominio, mismas claves). */
export const session = writable<SessionUser | null>(readUser());

export function canUseBuilder(u: SessionUser | null): boolean {
	return !!u && BUILDER_ROLES.includes(u.role);
}

export function getToken(): string | null {
	if (!browser) return null;
	return localStorage.getItem(TOKEN_KEY);
}

export function authHeaders(): Record<string, string> {
	const token = getToken();
	return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function login(username: string, password: string) {
	const res = await fetch(`${API_URL}/auth/login`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ username, password })
	});
	if (!res.ok) throw new Error('Usuario o contraseña incorrectos, solo superadmin puede ingresar');

	const data = await res.json();
	if (!canUseBuilder(data.user)) {
		throw new Error('Tu cuenta no tiene permiso para crear escenarios.');
	}

	localStorage.setItem(TOKEN_KEY, data.access_token);
	localStorage.setItem(USER_KEY, JSON.stringify(data.user));
	session.set(data.user);
	return data.user as SessionUser;
}

export function logout() {
	if (browser) {
		localStorage.removeItem(TOKEN_KEY);
		localStorage.removeItem(USER_KEY);
	}
	session.set(null);
}