# One More Round — prototipo jugable 2 (fase 2, «La decisión cuenta»)

Arcade de ~30 s para el la clase de psicologia. TypeScript + Canvas 2D, sin dependencias en tiempo de ejecución.
Gráficos provisionales: esta iteración se centra en el control, la distancia de visión y el tiempo de reacción.

## Cómo abrirlo

- **Un solo archivo (para enviar por email o copiar a otro equipo):** `dist/one-more-round.html`. Lleva el juego dentro; funciona solo, desde cualquier carpeta y sin internet.
- **Sin instalar nada:** abre `dist/index.html` con doble clic (Chrome, Edge o Firefox). Funciona desde el disco (`file://`); necesita `dist/game.js` al lado.
- **Desde el código:**
  ```bash
  npm install
  npm run dev     # http://localhost:8000 (reconstruye al guardar)
  npm run build   # regenera dist/ (index.html + game.js + one-more-round.html)
  ```
  Para el gallery walk: navegador a pantalla completa (F11).

## Controles

| Tecla | Acción |
|---|---|
| ← / → (o A / D) | Un carril por pulsación (mantener pulsado no repite) |
| Enter / Espacio | Empezar · confirmar · siguiente página del cierre |
| ← / → en resultados | Elegir botón |
| ← / → en el cierre | Página anterior / siguiente (→ no sale de la última página) |
| Ratón / táctil | Botones; en juego, tocar mitad izquierda/derecha; en el cierre, tocar = siguiente |
| M (o tocar el altavoz, abajo a la derecha) | Silenciar / activar el sonido |
| Esc | Volver al título para el siguiente jugador (ronda 1, sin resultados) |

## Flujo

Título («10:30 PM · School tomorrow») → cuenta atrás → recorrido de 30 s → resultados (hora ficticia, puntuación, «Same tunnel. Beat N?», mejor racha, núcleos /18, desglose de los +500 «banked · let pass · lost», choques)
→ **One more round · 11:00 PM** (una única revancha en el mismo recorrido, con «SAME TUNNEL · BEAT N» y sin tutoriales; el reloj pasa a las 11:00 PM) o **Finish**
→ cierre: resumen de la noche → 3 tarjetas (FEEDBACK, DECISIONS, SLEEP) → «Game data, not brain data» y la pregunta del gallery walk
→ Enter → pantalla de título para el siguiente jugador.

- **+500 «bank on clear»:** al recoger un núcleo +500 aparece «+500?» (también junto a la puntuación). Solo suma si después pasas su barrera sin chocar («BANKED +500»); si chocas con ella se pierde («LOST +500»). Dejarlo pasar y coger los núcleos del carril seguro da +200 sin riesgo.
- **Reloj ficticio:** 10:30 PM en la ronda 1; solo elegir la revancha lo adelanta a las 11:00 PM. El cierre muestra la hora final y la tarjeta SLEEP dice que el reloj es ficticio.
- **Cierre:** cada página espera al jugador (Enter, →, clic o toque; ← vuelve). Las tarjetas citan NIMH (2023) y Koepp et al. (1998); el texto vive en `src/story.ts` y se coteja con `docs/auditoria-v0.1.0.md` §3.4.
- Resultados ignoran la entrada 1,2 s (barra bajo los botones); título, cada página del cierre y pausa, 0,6 s. Mantener Enter pulsado nunca confirma dos veces.
- Si la ventana pierde el foco o la pestaña se oculta durante la cuenta atrás o la ronda, el juego se pausa. Enter/toque → 3-2-1 → la ronda sigue en el mismo instante.
- 45 s sin tocar nada en resultados, cierre (cualquier página) o pausa → vuelta al título (aviso los últimos 10 s).
- Sonido sintetizado con WebAudio (sin archivos; funciona offline). Arranca con la primera pulsación o toque.
- Con `prefers-reduced-motion: reduce` no hay sacudida de cámara, ni parpadeo de la nave, ni pulso en los avisos.

## Recorrido fijo (`src/track.ts`)

| Tiempo | Fase | Contenido |
|---|---|---|
| 0–9 s | Núcleos | Solo núcleos normales (+100), para aprender a moverse |
| 9–15 s | Barreras | Solo barreras (1 o 2 por fila, siempre queda un carril libre) |
| 15–30 s | Riesgo | 3 núcleos de alto valor (+500) con una barrera 0,75 / 0,70 / 0,60 s detrás en el mismo carril. El +500 solo cuenta si pasas esa barrera sin chocar. Hay siempre un carril seguro con 2 núcleos normales |

- Los objetos son visibles **3,2 s** antes de llegar a la nave; la barrera de cada par se ve ≥ 2,5 s antes de que llegue el núcleo.
- Las barreras son más altas que la altura a la que flotan los núcleos, así que asoman por encima del núcleo dorado; además proyectan un brillo rojo en el suelo de su carril.
- El cambio de carril es lógico e instantáneo (la colisión usa el carril nuevo desde la misma pulsación); el carril activo se ilumina al momento y la nave llega en ~0,1 s con inclinación y estela.
- Un choque pone la racha a 0, la barrera se rompe y la nave queda 0,6 s sin colisión para evitar choques en cadena. La partida sigue.

Todos los valores ajustables (velocidad, distancia de visión, ventana de recogida, puntos…) están en `src/config.ts`.

## Pruebas

```bash
npm run typecheck   # tsc estricto
npm test            # simulación + diseño del recorrido (Node, instantáneo)
npm run test:e2e    # Chromium real, 5 partidas completas en tiempo real (~5 min; la primera vez: `npx playwright install chromium`)
npm run test:e2e:standalone   # lo mismo con dist/one-more-round.html copiado solo a una carpeta temporal
```

- `test/game.test.ts`: fases separadas; cada fila de barreras deja carril libre; cada núcleo de alto valor tiene barrera detrás, vía de escape y carril seguro; ruta segura (0 choques, 0 núcleos dorados, 1800 pts); ruta arriesgada (3/3 núcleos dorados, 0 choques, 3100 pts); escape con 0,35 s de reacción humana (+500 banked); escape tardío = choque y +500 perdido; «bank on clear»: recoger y escapar, recoger y chocar, dejar pasar; en cada +500, dejar pasar (200) vale más que recoger y chocar (0) y escapar limpio (500) más que ambos; quedarse en el centro = choques, racha a 0 y la partida continúa; revancha determinista.
- `test/routes.test.ts`: las 4 rutas guionizadas de `test/routes.ts` dan exactamente pasiva 800, segura 1800, mixta 1900 y arriesgada 3100 (también con 17 ms de retraso), con su desglose de +500.
- `test/story.test.ts`: reloj 10:30 / 11:00 PM; desglose banked + let pass + lost = 3 en cada ruta; las dos rutas (Finish directo y revancha) llegan a las 3 tarjetas; cada tarjeta ≤ 40 palabras, sin verbos de medición, solo fuentes cotejadas, «adult» en la de dopamina y «This clock is fictional» en la de sueño.
- `test/feedback.test.ts`: «CLOSE!» solo en esquivas ajustadas (presentación, no toca la simulación).
- `test/e2e.mjs`: abre `dist/index.html` desde disco con la red bloqueada y juega las 4 rutas: segura → bloqueo de resultados y Enter mantenido → revancha arriesgada sin tutoriales («+500?» pendiente y luego banked) → Finish → cierre a las 11:00 PM con las 5 páginas, ←, → y blur → Enter → mixta con pausas por pérdida de foco (también durante el 3-2-1) y pestaña oculta simulada → Finish con el ratón tras la ronda 1 → cierre a las 10:30 PM recorrido con clics → 45 s inactivo en una tarjeta → pasiva → Esc en resultados → Esc en cuenta atrás, partida y pausa → pasiva → Finish → Esc en una tarjeta. Comprueba teclado real, borde, tecla mantenida, M, que suenan los 14 sonidos, qué archivos locales se cargan, y un móvil emulado con táctil y reduced motion. Deja capturas en `test-output/` (`test-output/standalone/` con `OMR_STANDALONE=1`).

Las rutas se calculan con un planificador (`test/planner.ts`) que limita los cambios de carril a uno cada 0,15 s.

## Estructura

```
src/config.ts   ajustes de juego (y de presentación: bloqueos, inactividad, volumen, reloj)
src/track.ts    recorrido fijo y mensajes de fase (tutoriales en ronda 1, objetivo en la revancha)
src/sim.ts      simulación determinista (sin DOM)
src/render.ts   túnel 2.5D, HUD y pantallas
src/story.ts    reloj ficticio y texto del cierre (resumen, 3 tarjetas, aviso, fuentes)
src/main.ts     pantallas, entrada, pausa, inactividad y bucle de paso fijo (120 Hz)
src/audio.ts    efectos de sonido sintetizados (WebAudio)
src/feedback.ts lectura de eventos compartida por render y audio (esquiva ajustada)
```
