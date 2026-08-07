## SeticBuilder
SeticBuilder es una herramienta para crear escenarios de tiro virtual para la aplicación SeticVirt. La estructura de los escenarios es un conjunto de archivos multimedia (videos e imágenes) o también llamados HitFiles y un archivo JSON que define las áreas de tiro, secuencias y puntajes.

Esta herramienta permite al usuario 'calcar' áreas de tiro sobre imágenes o cada fotograma de un video, definiendo paths interactivos o también llamados HitPaths que desencadenan acciones específicas cuando son acertados.

Ejem;lo de estructura de un escenario:
- `folder` Ejemplo escenario 1
	- `file` video1.mp4
	- `file` video2.mp4
	- `file` imagen1.jpeg
	- `file` scenario.json (HitScenario from src/lib/models.ts)

Ejemplos de escenarios:
- [Ejemplo escenario 1](./docs/scenario_example1.json)
- [Ejemplo escenario 2](./docs/scenario_example2.json)
- [Ejemplo escenario 3](./docs/scenario_example3.json)
- [Ejemplo escenario 4](./docs/scenario_example4.json)

Nota: SeticBuilder únicamente genera scenario.json, la carpeta de videos y nombre de los videos son manejados por el usuario

---

## Ideas

- Usar joint js para la UI del producto final comercial

### Encriptación
El objetivo es ralentizar ingeniería inversa encriptando los archivos multimedia y json (principalmente el json), definir qué procedimiento utilizar para tratar de llegar al siguiente tipo de escenario:

`folder` Escenario de selva 1 (archivos binarios)
1. 40566bb01c39 (video mp4 encriptado)
2. 5ce80ba505d5 (video mp4 encriptado)
3. ac46c8b95442 (imagen jpeg encriptada)
4. scenario (json encriptado)

Los archivos son desencriptados en la app usando la clave del usuario y una clave obfuscado dentro del js de la app, entonces SeticBuilder debería encriptar combinando una llave hard-codeada dentro de la app y la clave del usuario final

- Llave 1: string dentro del código de la app (obfuscated)
- Llave 2: password del usuario (cliente)

Esto quiere decir que los escenarios van encriptados para cada usuario, esto facilitaría en un futuro usar usb keys como licencias o login web.

---

### DEV
Tecnologías principales usadas:
- npm
- Vite
- SvelteKit
- Typescript
- Skeleton (UI Kit)
- TailwindCSS (CSS Framework)
- Lucide (icons)
- Paper.js (canvas drawing)

```sh
npm run dev # inicia el servidor de desarrollo
npm run build # compila usando adapter-static
```
