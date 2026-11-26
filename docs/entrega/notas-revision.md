# Notas de revisión de la explicación escrita (no imprimir)

Fecha: 26-11-2026. Sustituye a `docs/explicacion-escrita.md` y a `docs/explicacion-escrita-borrador.md`, que quedan como historial.

## Entregables

- `docs/entrega/Lucas-A-Teenage-Brain-on-Video-Games.docx`: editable.
- `docs/entrega/Lucas-A-Teenage-Brain-on-Video-Games.pdf`: listo para imprimir. Versión condensada (26-11-2026): **2 páginas** en tamaño carta, con la explicación en la 1 y References en la 2.
- `docs/entrega/explanation.md`: fuente del texto. Para regenerar los dos archivos, desde la raíz del proyecto: `npm install --no-save docx@9 && node docs/entrega/build-explanation.mjs .`. La librería `docx` de npm escribe el DOCX y Chromium (Playwright) imprime el PDF a partir de un HTML con el mismo texto y formato. Si editas el DOCX en Word, exporta el PDF desde Word para que los dos coincidan.
- Formato: márgenes de 1″, Times New Roman 12 pt, doble espacio y sangría de primera línea de 0,5″. Los encabezados son APA de nivel 1 (centrados, negrita, Title Case) y el número de página va arriba a la derecha. References: página nueva, orden alfabético, sangría francesa de 0,5″, cursivas APA y DOI o URL.
- Cuerpo: 308 palabras (introducción y un párrafo por estructura; sin encabezados de sección ni conclusión aparte). Cinco referencias: se quitó King et al. (2013), porque ya no se cita en el texto. La versión larga (1057 palabras, 6 fuentes) se sustituyó y no se guardó aparte. El cotejo de abajo sigue valiendo para las frases que se conservan; las filas de King ya no aplican.

## Estructura del texto

| Sección | Estructura | Qué hace | Qué es específico de adolescentes | Decisión del juego |
|---|---|---|---|---|
| Reward | Estriado | Dopamina: aprendizaje, refuerzo y atención (Koepp) | Galvan 2006: actividad del accumbens exagerada en relación con la prefrontal | Sonidos, «BANKED +500», «Beat N?», revancha preseleccionada |
| Decisions | Corteza prefrontal | Planificar, priorizar, decidir; madura de las últimas (NIMH) | NIMH: pares + PFC en desarrollo → más riesgos; Galvan: OFC adolescente parecida a la infantil | +500: 200 seguros, 500 si escapas, 0 + choque si no |
| Sleep timing | Núcleo supraquiasmático | Reloj circadiano maestro en el hipotálamo (Patton & Hastings); controla la melatonina según la luz (NIGMS) | NIMH: melatonina alta hasta más tarde por la noche; King 2013 | Reloj ficticio 10:30 → 11:00 PM |

Tercera estructura: el núcleo supraquiasmático, como pedías. Las fuentes lo respaldan: Patton y Hastings (2018) dan su ubicación y su papel de reloj maestro, y NIGMS (2023), el control de la melatonina. El texto separa la estructura (SCN), su papel (ritmo circadiano) y la hormona (melatonina).

## Cotejo frase a frase

| Afirmación del texto | Fuente | Comprobado contra |
|---|---|---|
| Dopamina «may be involved in learning, reinforcement of behavior and attention» | Koepp et al. (1998) | Resumen (PMID 9607763), cotejo de la fase 2 |
| PET, 8 varones de 36–46 años, evidencia «consistent with» liberación en el estriado, mayor en el ventral, relacionada con el rendimiento | Koepp et al. (1998) | Methods (edades confirmadas por Lucas) y resumen |
| fMRI, 37 participantes de 7–29 años, tarea con valores de recompensa distintos | Galvan et al. (2006) | Resumen en PubMed (PMID 16793895): «Thirty-seven participants (7-29 years of age)…», «parametrically manipulated reward values» |
| Actividad del accumbens exagerada, relativa a la prefrontal, frente a niños y adultos | Galvan et al. (2006) | Resumen: «exaggerated accumbens activity, relative to prefrontal activity in adolescents, compared with children and adults» |
| Podría empujar hacia ganancias inmediatas frente a las de largo plazo | Galvan et al. (2006) | Resumen: «biasing the adolescent's action toward immediate over long-term gains» (los autores lo presentan como sugerencia) |
| OFC adolescente más parecida a la de los niños | Galvan et al. (2006) | Resumen: «orbital frontal cortex activity in adolescents looked more like that of children than adults» |
| Corteza prefrontal detrás de la frente; planificar, priorizar y decidir bien; de las últimas en madurar; el cerebro madura a mediados o finales de los 20 | NIMH (2023) | Página web, punto 1 |
| Más atención a los pares + PFC en desarrollo → podría llevar a más riesgos, negativos o positivos | NIMH (2023) | Página web, punto 2 |
| SCN: pareja de grupos de neuronas en el hipotálamo, justo encima del quiasma óptico; reloj circadiano maestro | Patton & Hastings (2018) | Resumen (PMID 30086310): «sit astride the mid-line third ventricle of the hypothalamus, immediately dorsal to the optic chiasm», «master circadian clock» |
| El SCN sincroniza los ritmos; controla la melatonina según la luz que reciben los ojos; por la tarde el reloj maestro hace producir más melatonina → somnolencia | NIGMS (2023) | Página «Circadian Rhythms» |
| La melatonina funciona distinto en adolescentes; sigue alta hasta más tarde por la noche y baja más tarde por la mañana; puede explicar trasnochar y madrugar mal | NIMH (2023) | Página web, punto 5 |
| Muchos adolescentes no duermen lo suficiente → más difícil prestar atención, controlar impulsos, rendir en clase | NIMH (2023) | Página web, punto 5 |
| 17 chicos, edad media 16; juego violento rápido 150 frente a 50 min antes de dormir; −27 min de sueño y −7 % de eficiencia | King et al. (2013) | Resumen (PMID 23137332) y repositorio de la Univ. de Adelaida (fase 2) |
| Datos del juego (sonidos, «BANKED +500», «Beat N?», revancha preseleccionada, barrera a 0,60–0,75 s, 200/500/0, cuarto más oscuro) | Código | `src/render.ts`, `src/audio.ts`, `src/track.ts`; test «P09 CHOICES» |

Sin cita, por ser conocimiento general: que la dopamina es un neurotransmisor (mensajero químico), que el accumbens forma parte del estriado ventral y que la corteza orbitofrontal es parte de la prefrontal. Si la profesora pide fuente también para esto, hay que añadirla o quitar esas aposiciones.

Omitido a propósito: Chaarani et al. (2022), que fue retractado.

## Decisiones de formato APA

- **Galvan, sin tilde**, como aparece en el registro de PubMed. Si en el PDF de la revista figura «Galván», cámbialo en el texto (3 citas) y en References.
- **NIGMS (2023)**: la página dice «Content reviewed September 2023» y «This page last updated on 05/20/2025». Usé 2023, la fecha de revisión del contenido. Si la profesora prefiere la de actualización, cambia el año a 2025 en las 2 citas y en la referencia.
- **NIMH (2023)**: la página muestra «NIH Publication No. 23-MH-8078» y «Revised 2023». El editor (HHS, NIH) sigue el ejemplo de informe gubernamental de APA 7.
- La primera cita usa la sigla entre corchetes, (National Institute of Mental Health [NIMH], 2023), y las siguientes ponen solo NIMH; lo mismo con NIGMS.
- Seis referencias en orden alfabético. Las 6 se citan en el texto y todas las citas tienen su referencia.

## Voz y humanizer

Hechos y citas cerrados antes. Después se ejecutó la skill `humanizer:humanizer` sobre `explanation.md`. Quitó frases de presentación («It is important to separate three things», «This matters for teenagers in a specific way», «Research with teenagers adds…»), un cierre que repetía la idea («In this way, the game gives people…») y un «linked to» vago, que pasó a «involved in», como en el resumen de Galvan. Se mantuvieron las aclaraciones de alcance («The game does not test…», «cannot show whether a +500 causes…») porque corrigen una idea que el lector sí podría tener. Los encabezados quedaron en Title Case por APA, aunque humanizer prefiere minúsculas. Después de humanizer se volvieron a cotejar todas las frases con la tabla de arriba.

No se inventó ninguna experiencia, resultado de playtest ni opinión. La primera persona solo aparece para explicar por qué elegí el tema y cómo diseñé el juego.

## Pendiente (Lucas)

- Nota sobre el uso de IA: confirmar con la profesora si la quiere y dónde.
- Ortografía estadounidense («behavior», «organized»): confirmar que la profesora no prefiere la británica.
- El PDF oficial de NIMH no se pudo leer como texto; el cotejo se hizo con la página web, que muestra el mismo número de publicación.
- Leer el texto en voz alta: si alguna frase no suena a ti, cámbiala en el DOCX. Los datos están en la tabla de arriba.
