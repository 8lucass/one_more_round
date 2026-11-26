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
| M (o tocar el altavoz, abajo a la derecha) | Silenciar / activar el sonido |
| Esc | Volver al título para el siguiente jugador (ronda 1, sin resultados) |

## Flujo

Título → cuenta atrás → recorrido de 30 s → resultados (puntuación, mejor racha, núcleos /18, núcleos +500 /3, choques)
→ **One more round** (una única revancha en el mismo recorrido, con «SAME TUNNEL · BEAT N» y sin tutoriales) o **Finish** → cierre provisional
→ Enter → pantalla de título para el siguiente jugador.

- Resultados ignoran la entrada 1,2 s (barra bajo los botones); título y cierre, 0,6 s. Mantener Enter pulsado nunca confirma dos veces.
- Si la ventana pierde el foco o la pestaña se oculta durante la cuenta atrás o la ronda, el juego se pausa. Enter/toque → 3-2-1 → la ronda sigue en el mismo instante.
- 45 s sin tocar nada en resultados, cierre o pausa → vuelta al título (aviso los últimos 10 s).
- Sonido sintetizado con WebAudio (sin archivos; funciona offline). Arranca con la primera pulsación o toque.
- Con `prefers-reduced-motion: reduce` no hay sacudida de cámara, ni parpadeo de la nave, ni pulso en los avisos.

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
npm run test:e2e    # Chromium real, 4 partidas completas en tiempo real (~4 min; la primera vez: `npx playwright install chromium`)
```

- `test/game.test.ts`: fases separadas; cada fila de barreras deja carril libre; cada núcleo de alto valor tiene barrera detrás, vía de escape y carril seguro; ruta segura (0 choques, 0 núcleos dorados, 1800 pts); ruta arriesgada (3/3 núcleos dorados, 0 choques, 3100 pts); escape con 0,35 s de reacción humana; escape tardío = choque; quedarse en el centro = choques, racha a 0 y la partida continúa; revancha determinista.
- `test/routes.test.ts`: las 4 rutas guionizadas de `test/routes.ts` dan exactamente pasiva 1300, segura 1800, mixta 2400 y arriesgada 3100 (también con 17 ms de retraso).
- `test/feedback.test.ts`: «CLOSE!» solo en esquivas ajustadas (presentación, no toca la simulación).
- `test/e2e.mjs`: abre `dist/index.html` desde disco con la red bloqueada y juega las 4 rutas: segura → bloqueo de resultados y Enter mantenido → revancha arriesgada sin tutoriales → Finish → mixta con pausas por pérdida de foco (también durante el 3-2-1) y pestaña oculta simulada → Finish tras la ronda 1 → 45 s inactivo → pasiva → Esc. Comprueba Esc en cuenta atrás, partida y pausa, teclado real, borde, tecla mantenida, M, que suenan los 12 sonidos, y un móvil emulado con táctil y reduced motion. Deja capturas en `test-output/`.

Las rutas se calculan con un planificador (`test/planner.ts`) que limita los cambios de carril a uno cada 0,15 s.

## Estructura

```
src/config.ts   ajustes de juego (y de presentación: bloqueos, inactividad, volumen)
src/track.ts    recorrido fijo y mensajes de fase (tutoriales en ronda 1, objetivo en la revancha)
src/sim.ts      simulación determinista (sin DOM)
src/render.ts   túnel 2.5D, HUD y pantallas
src/main.ts     pantallas, entrada, pausa, inactividad y bucle de paso fijo (120 Hz)
src/audio.ts    efectos de sonido sintetizados (WebAudio)
src/feedback.ts lectura de eventos compartida por render y audio (esquiva ajustada)
```
