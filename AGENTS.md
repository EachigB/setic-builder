# AGENTS.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

This is a SvelteKit application called "setic-builder" using TypeScript, Tailwind CSS v4, and the static adapter for deployment. The project uses Svelte 5 with its latest runes API ($props, @render syntax).

## Development Commands

### Start Development Server
```bash
npm run dev
# or with browser auto-open
npm run dev -- --open
```

### Type Checking
```bash
# One-time type check
npm run check

# Watch mode for continuous type checking
npm run check:watch
```

### Build
```bash
# Create production build (static site)
npm run build

# Preview production build locally
npm run preview
```

## Project Architecture

### SvelteKit Configuration
- **Adapter**: Static adapter (`@sveltejs/adapter-static`) - generates a static site, not a server-rendered app
- **Vite Plugins**: Tailwind CSS v4 integration, SvelteKit plugin, and devtools-json plugin
- **TypeScript**: Strict mode enabled with all recommended compiler options

### Directory Structure
- `src/routes/` - SvelteKit file-based routing
  - `+page.svelte` - Page components
  - `+layout.svelte` - Layout components
  - `layout.css` - Global styles
- `src/lib/` - Reusable components, utilities via `$lib` alias
  - `src/lib/assets/` - Static assets like icons
- `src/app.html` - HTML shell template
- `src/app.d.ts` - TypeScript global types and SvelteKit app namespace
- `static/` - Static assets served at root
- `docs/` - Documentation and diagrams (Excalidraw format)

### Key Technologies
- **Svelte 5**: Use runes syntax (`$props()`, `$state()`, `@render`)
- **Tailwind CSS v4**: Configured via Vite plugin (no separate config file needed)
- **TypeScript**: Strict type checking - use proper types, avoid `any`
- **SvelteKit**: File-based routing, `$lib` alias for imports

## Important Notes

- This project is configured for **static site generation** - all routes must be prerenderable
- Path aliases are configured through SvelteKit's alias system (see tsconfig.json comments)
- Use `$lib` alias to import from `src/lib/` (e.g., `import { something } from '$lib'`)
- The `.svelte-kit` directory is auto-generated - do not edit manually
