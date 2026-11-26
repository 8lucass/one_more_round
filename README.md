# One More Round — versión para el gallery walk (fase 3, «Identidad 10:30 PM»)

Arcade de ~30 s para la clase de psicología. TypeScript + Canvas 2D, sin dependencias en tiempo de ejecución ni archivos externos (sin imágenes ni fuentes).
Dirección artística A, «10:30 PM»: un dormitorio de noche (ventana con luna, escritorio, monitor, despertador LED y nota «School tomorrow!») enmarca la partida y la decisión de repetir. Paleta azul noche y crema con acentos ámbar y verde; el rojo con franjas queda solo para las barreras.

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
| ← / → (o A / D) | Un carril por pulsación, al instante. Mantener la flecha 0,2 s añade **un** carril más (cruzar de un lado al otro); soltar antes lo cancela. Lo cronometra el juego, no la repetición del sistema |
| Enter / Espacio | Empezar · confirmar · siguiente página del cierre |
| ← / → en resultados | Elegir botón |
| ← / → en el cierre | Página anterior / siguiente (→ no sale de la última página) |
| Ratón / táctil | Botones; en juego, tocar mitad izquierda/derecha; en el cierre, tocar = siguiente |
| M (o tocar el altavoz, abajo a la derecha) | Silenciar / activar el sonido |
| Esc | Volver al título para el siguiente jugador (ronda 1, sin resultados) |

## Flujo

Título en el dormitorio (despertador a las 10:30 PM, nota «School tomorrow!», instrucciones en el monitor) → la cámara entra en la pantalla (0,4 s, durante la cuenta atrás) → cuenta atrás → recorrido de 30 s → la cámara vuelve al escritorio → resultados en el monitor, con el despertador delante (puntuación, «Same tunnel. Beat N?», mejor racha, núcleos /18, desglose de los +500 «banked · let pass · lost», choques)
→ **One more round · 11:00 PM** (una única revancha en el mismo recorrido, con «SAME TUNNEL · BEAT N» y sin tutoriales; el reloj pasa a las 11:00 PM) o **Finish**. Al elegir la revancha, el despertador salta a las 11:00 PM con un clic, la luz de la habitación baja un punto y la cámara vuelve a entrar.
→ cierre en el monitor (el despertador muestra la hora final), 2 páginas: **«Your run»** (puntuación; tras la revancha, el cambio real entre rondas con su signo; qué significa ganar, perder o dejar pasar un +500 y el recuento por ronda; aviso «game data») → **«What this has to do with your brain»** (bloques Reward · estriado, Decisions · corteza prefrontal, Sleep timing · núcleo supraquiasmático, cada uno con 2 frases y una cita autor-año; pregunta del gallery walk)
→ Enter → pantalla de título para el siguiente jugador.

- **+500 «bank on clear»:** al recoger un núcleo +500 aparece «+500?» (también junto a la puntuación). Solo suma si después pasas su barrera sin chocar («BANKED +500»); si chocas con ella se pierde («LOST +500»). Dejarlo pasar y coger los núcleos del carril seguro da +200 sin riesgo.
- **Reloj ficticio:** 10:30 PM en la ronda 1; solo elegir la revancha lo adelanta a las 11:00 PM. El cierre muestra la hora final y el bloque Sleep timing dice que el reloj es ficticio.
- **Cierre:** cada página espera al jugador (Enter, →, clic o toque; ← vuelve). Los bloques citan Koepp et al. (1998), NIMH (2023) y NIGMS (2023); el texto vive en `src/story.ts` y se coteja en `docs/entrega/notas-revision.md`. La bibliografía completa está en la explicación escrita (`docs/entrega/`).
- Resultados ignoran la entrada 1,2 s (barra bajo los botones); título, cada página del cierre y pausa, 0,6 s. Mantener Enter pulsado nunca confirma dos veces.
- Si la ventana pierde el foco o la pestaña se oculta durante la cuenta atrás o la ronda, el juego se pausa. Enter/toque → 3-2-1 → la ronda sigue en el mismo instante.
- 45 s sin tocar nada en resultados, cierre (cualquier página) o pausa → vuelta al título (aviso los últimos 10 s).
- Sonido sintetizado con WebAudio (sin archivos; funciona offline). Arranca con la primera pulsación o toque.
- **Túnel por fases (solo presentación):** azul en los núcleos, violeta desde las barreras (9 s), orquídea en los +500 (15 s) y crema en el tramo final (28 s), con vetas de luz en las paredes, puerta de meta, nave que flota y estela cian que crece con la racha (desaparece al chocar). Nada nuevo se dibuja al fondo del túnel, donde aparecen los objetos.
- Con `prefers-reduced-motion: reduce` no hay sacudida de cámara, ni parpadeo de la nave, ni pulso en los avisos, ni zoom (corte directo), ni flotación de la nave.

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
- `test/story.test.ts`: reloj 10:30 / 11:00 PM; desglose banked + let pass + lost = 3 en cada ruta; signo real del cambio (mejora, empeora, empate); «Your run» con una ronda y con revancha, incluidos 0 ganados; página del cerebro con 3 bloques de 2 frases (≤ 34 palabras) y una cita, ≤ 115 palabras en total, sin verbos de medición, solo fuentes cotejadas, «8 adult men», «evidence consistent with», «200 safe points» y «fictional clock».
- `test/hold.test.ts`: flecha mantenida: toque breve = 1 carril; mantener ≥ 0,2 s = 1 carril más (una sola vez); soltar antes, pausa o cambio de pantalla lo cancelan; contra el borde no añade nada; dos toques rápidos = 2 carriles.
- `test/feedback.test.ts`: «CLOSE!» solo en esquivas ajustadas (presentación, no toca la simulación).
- `test/e2e.mjs`: abre `dist/index.html` desde disco con la red bloqueada y juega las 4 rutas: segura → bloqueo de resultados y Enter mantenido → revancha arriesgada sin tutoriales («+500?» pendiente y luego banked) → Finish → cierre a las 11:00 PM con las 2 páginas (+1300 y recuento por ronda), ←, → y blur → Enter → mixta con pausas por pérdida de foco (también durante el 3-2-1) y pestaña oculta simulada → Finish con el ratón tras la ronda 1 → cierre a las 10:30 PM recorrido con clics → 45 s inactivo en el cierre → pasiva → Esc en resultados → Esc en cuenta atrás, partida y pausa → pasiva → Finish → Esc en la página del cerebro. Comprueba teclado real, borde, toques de 40/100/150 ms (1 carril), flecha mantenida (cruza 2 carriles a los 0,2 s, ignora la repetición del sistema, contra el borde un solo `bump`), dos toques rápidos, blur con la flecha pulsada (no añade carril ni al reanudar), M, que suenan los 15 sonidos (incluido el clic del despertador), qué archivos locales se cargan, y un móvil emulado con táctil y reduced motion. Deja capturas en `test-output/` (`test-output/standalone/` con `OMR_STANDALONE=1`).

Las rutas se calculan con un planificador (`test/planner.ts`) que limita los cambios de carril a uno cada 0,15 s.

## Estructura

```
src/config.ts   ajustes de juego (y de presentación: bloqueos, inactividad, volumen, reloj)
src/track.ts    recorrido fijo y mensajes de fase (tutoriales en ronda 1, objetivo en la revancha)
src/sim.ts      simulación determinista (sin DOM)
src/render.ts   túnel 2.5D por fases, HUD, pantallas y cámara entre el cuarto y el monitor
src/scene.ts    dormitorio (plano general y del escritorio), despertador LED, nota, ventana
src/story.ts    reloj ficticio y texto del cierre («Your run» y la página del cerebro)
src/hold.ts     flecha mantenida: un carril extra tras HOLD_REPEAT (sin DOM)
src/main.ts     pantallas, entrada, pausa, inactividad y bucle de paso fijo (120 Hz)
src/audio.ts    efectos de sonido sintetizados (WebAudio)
src/feedback.ts lectura de eventos compartida por render y audio (esquiva ajustada)
```
