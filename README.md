# One More Round — prototipo jugable 1

Arcade de ~30 s para el gallery walk. TypeScript + Canvas 2D, sin dependencias en tiempo de ejecución.
Gráficos provisionales: esta iteración se centra en el control, la distancia de visión y el tiempo de reacción.

## Cómo abrirlo

- **Sin instalar nada:** abre `dist/index.html` con doble clic (Chrome, Edge o Firefox). Funciona desde el disco (`file://`).
- **Desde el código:**
  ```bash
  npm install
  npm run dev     # http://localhost:8000 (reconstruye al guardar)
  npm run build   # regenera dist/
  ```
  Para el gallery walk: navegador a pantalla completa (F11).

## Controles

| Tecla | Acción |
|---|---|
| ← / → (o A / D) | Un carril por pulsación (mantener pulsado no repite) |
| Enter / Espacio | Empezar · confirmar |
| ← / → en resultados | Elegir botón |
| Ratón / táctil | Botones; en juego, tocar mitad izquierda/derecha |

## Flujo

Título → cuenta atrás → recorrido de 30 s → resultados (puntuación, mejor racha, núcleos, choques)
→ **One more round** (una única revancha en el mismo recorrido) o **Finish** → cierre provisional
→ Enter → pantalla de título para el siguiente jugador.

## Recorrido fijo (`src/track.ts`)

| Tiempo | Fase | Contenido |
|---|---|---|
| 0–9 s | Núcleos | Solo núcleos normales (+100), para aprender a moverse |
| 9–15 s | Barreras | Solo barreras (1 o 2 por fila, siempre queda un carril libre) |
| 15–30 s | Riesgo | 3 núcleos de alto valor (+500) con una barrera 0,75 / 0,70 / 0,60 s detrás en el mismo carril. Hay siempre un carril seguro con núcleos normales |

- Los objetos son visibles **3,2 s** antes de llegar a la nave; la barrera de cada par se ve ≥ 2,5 s antes de que llegue el núcleo.
- Las barreras son más altas que la altura a la que flotan los núcleos, así que asoman por encima del núcleo dorado; además proyectan un brillo rojo en el suelo de su carril.
- El cambio de carril es lógico e instantáneo (la colisión usa el carril nuevo desde la misma pulsación); el carril activo se ilumina al momento y la nave llega en ~0,1 s con inclinación y estela.
- Un choque pone la racha a 0, la barrera se rompe y la nave queda 0,6 s sin colisión para evitar choques en cadena. La partida sigue.

Todos los valores ajustables (velocidad, distancia de visión, ventana de recogida, puntos…) están en `src/config.ts`.

## Pruebas

```bash
npm run typecheck   # tsc estricto
npm test            # simulación + diseño del recorrido (Node, instantáneo)
npm run test:e2e    # Chromium real, 3 partidas completas en tiempo real (~2 min; requiere Playwright: `npm i -D playwright && npx playwright install chromium`)
```

- `test/game.test.ts`: fases separadas; cada fila de barreras deja carril libre; cada núcleo de alto valor tiene barrera detrás, vía de escape y carril seguro; ruta segura (0 choques, 0 núcleos dorados, 1800 pts); ruta arriesgada (3/3 núcleos dorados, 0 choques, 3100 pts); escape con 0,35 s de reacción humana; escape tardío = choque; quedarse en el centro = choques, racha a 0 y la partida continúa; revancha determinista.
- `test/e2e.mjs`: abre `dist/index.html` desde disco y juega ronda 1 (ruta segura) → One more round → ronda 2 (ruta arriesgada) → solo queda Finish → cierre → siguiente jugador → ronda con choques; comprueba también teclado real, borde de carril, tecla mantenida y clic con ratón. Deja capturas en `test-output/`.

Las rutas se calculan con un planificador (`test/planner.ts`) que limita los cambios de carril a uno cada 0,15 s.

## Estructura

```
src/config.ts   ajustes de juego
src/track.ts    recorrido fijo y mensajes de fase
src/sim.ts      simulación determinista (sin DOM)
src/render.ts   túnel 2.5D, HUD y pantallas
src/main.ts     pantallas, entrada y bucle de paso fijo (120 Hz)
```
