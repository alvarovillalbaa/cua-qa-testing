I need to do so many changes in our application.
Here are the changes:
- Make sure UI fails when the playwright actually fails. Sometimes, the UI appears with 'in progress' loader for some of the task steps, and the test has failed in reality. ( See /Users/alvarovillalba/Desktop/Captura de pantalla 2026-04-22 a las 18.21.47.png )
- Last step of the task steps always stays as 'in progress' with the circle loader, indifinately.
- We need to be able to persist changes in UI to codebase, meaning that when running localhost:3000, if we make any changes to the UI, it's actually changes in our codebase, so it has 'multi-session memory'. For some of the changes, we might need Node resetting (re-running npm run dev), in which case there should be an 'Alert Modal/Dialog' before saving/persisting those changes made in the UI.
- There's a problem, I'm not sure it's taking into account the changes we do in the UI of localhost:3000, before clicking 'run tests'.
- Should be able to change most configurable data from the codebase, using the UI (persistance! including API keys, headers, website, etc.)
- we want to capture the data of:
    - 'actions' really standardize (e.g. 'Opened Dropdown 'Menu')
    - the specific data for the CUA testing. for example, when testing a chatbot, we need to then have a final run results with the transcript of input-output pairs of the Playwright agent and the AI agent of the product being tested. For tests that are not chatbots specifically, we will probably need sometimes to store some other information. That means that, even though we're currently doing it for an AI chatbot, make sure the adaptation to 'extract additional data' with the agent, can be configurable to any type of data of what the AI agent is doing and seeing (maybe a pipeline of processing some of the screenshots so that we extract the exact data we want). Another option is that we have a new tool call that the AI agent calls when it 'considers' that needs to store specific data

- We should have the following structure of the data both in the codebase and UI: Project > TestCase [TeamCollaboration] > TestRun [Trigger] > RunEvaluator (to be grouped like in OpenAI Evals, can have custom output, 1 per TestRun by default) [Parallelize]
RunEvaluatorArtifact (what's produced in the result)
- We should have some Analytics + Filters per metadata of the runs. They should all persist and be visible.
- Users should be able to run have an output they want: visualize it in the UI, and however the output schema they want.So users should be able to edit however they want the final output -- We can do so by introducing one last additional loop, without any Playwright, all from generated persisted-on-local data, running through an LLM call that generates the final data output. Can be files outputs too. And the output can be inserted in specific files too. To do so, we might want to run the files provided, extract the columns and a few example rows, and run it through an LLM call that determines what the output structure of the test run should be so that we can fill in the XLSX/CSV and then we can get that output and insert it in the file.
- We should be able to Edit System Prompts with and without login. Both system prompt instructions of with and without login should re-share most of it, so maybe it's the same one and we just inject 2-3 sentences for when it's with login. Variable injection should be normal, usually for:
    ** SPL (it's a small block of the system prompt message that is an injected variable that changes over time depending on the learning loop based on autoresearch)
    ** Personalization, which is a free-text form input where they can write whatever they want
- We need to implement loop of improvemeent like autoresearch by Karpathy https://github.com/karpathy/autoresearch . Insights/Patterns of testing within a single session/run or multiple sessions, shall be persisted and later used for self-improvement of the testing and codebase too.
'''
export const TEST_APP_URL = "https://www.iberia.com";
export const USERNAME = "test_user_name";
export const PASSWORD = "test_password";
export const USER_INFO =
'''
- There should be these things the user mainly edits to run the test case:
    - Test Description (this is at the TestRun level, and becomes an evaluator if no evaluators are provided) [Test Case Level]
    - Additional Context (this is additional context) [Test Run that defaults to the one of Test Case Level]
    - Test Set (this is a XLSX or CSV that the application has to fill-in if provided. If not provided, we can specify the output we want out of the test run). We need to figure out its structure. Users might be able to upload multiple ones. [Test Run]
    - Metrics (if not provided, we only measure X metrics and is based on the Test Description, so the Test Description becomes the context for the calculation metric). Users should be able to describe multiple metrics. [Test Run that defaults to the ones of the Test Case Level]
    - Thresholds: we can make a gate with multiple thresholds based on the metrics and the test sets. [Test Run that defaults to the ones of the Test Case Level

    * We should be able to introduce all of these either by copy-pasting text (if too long, it becomes a '.md' file), uploading files in any format, or writing them manually
- Due to introducing some LLM-based pre-processing of the test run input, and LLM-based post-processing, we might need to create the system prompt instructions for those too.
- We need to make the following changes to the input messages:
    - we shall be able to have 'response_format' in the final output
    - we shall have one system prompt instruction per metric (if none are defined, the Test Description becomes the only metric)
    - If multiple metrics, we shall have multiple system prompt instructions, and we will run CUA tests in parallel.
    - The input messages to the LLMs should be:
        - a list of messages, with 'system' and 'user' differentiation (and 'file' type upload when the user has a file uploaded, we might need to upload them to OpenAI first, get the file id, and then input it that way)
        - the system prompt message could have some variables to be injected at runtime
        - the 'user' message should have multiple variables to be injected at runtime
    - For having the system prompt instructions, consider /Users/alvarovillalba/Desktop/filesystem/deliverables/2026-04-21/eval-system-prompt-instruction-standard.md
    - We shall improve the current system prompt instructions of how CUA should work based on this which is right now defined as the Test Case level (wrongly because it's general plumbing, includes the test set to be filled in, etc.): '''Utiliza el Ibot para testearlo, como si fueras un AI QA Architect que esta testeando el bot the Iberia en la esquina inferior derecha.

Enviar 1 mensaje cada vez, testeando que el bot funciona.
En algunos testeos podremos necesitar hacer acciones adicionales más allá del primer mensaje.

Captura el input que le damos y las respuestas.
Es muy importante capturar estos datos: '''<Columnas a Rellenar>'''

El mensaje que enviar es el valor de las columnas de 'Input' del XLSX adjuntado. El XLSX es el set the tests/comprobaciones que tenemos que hacer. Vamos a intentar rellenar 5 en una misma sesión.

Tenemos que probar cada 'Input' dos veces, capturando ambos resultados.

De normal, tarda 30 segundos o más en responder. Si tarda más de 90 segundos, significa que no funciona o se ha quedado estancado.

Si sale 'Preparando tu mensaje' significa que todavía está 'pensando'.

Cuando no funcione, o se quede estancado el IBot, sigue esperando hasta que aparezca un mensaje de error de conexión. Una vez que aparezca, haz click en el botón del lápiz en la esquina superior derecha para resetear el chat y vuelve a poner el mismo mensaje o hilo de mensajes.

Cada vez que se mande un mensaje, deberíamos resetear el chat haciendo click en el botón de la esquina superior derecha que es un icono de un lápiz.

Cuando haga falta 'reset' y no lo consigas haciendo click en el botón, puedes recargar la página entera.

Tienes que guardar el transcript exacto: Inputs y Outputs en JSON, para que después podamos rellenar el CSV.

Haz del test X al test Y. Recuerda, dos intentos por test. Y un máximo de 5 tests cada vez. Si necesitamos hacer +5 tests, asegurate de terminar 5 correctamente, y si está bien y satisfactorio, sigue hacia delante
'''


'''Utiliza el Ibot para testearlo, como si fueras un AI QA Architect que esta testeando el bot the Iberia en la esquina inferior derecha.

Enviar 1 mensaje cada vez, testeando que el bot funciona.
En algunos testeos podremos necesitar hacer acciones adicionales más allá del primer mensaje.

Captura el input que le damos y las respuestas.
Es muy importante capturar estos datos: '''Inputs y Outputs (JSON),	Resultado 1er intento,	Resultado 2do intento,	Comentarios testing'''

El mensaje que enviar es el valor de las columnas de 'Input' del XLSX adjuntado. El XLSX es el set the tests/comprobaciones que tenemos que hacer. Vamos a intentar rellenar 5 en una misma sesión.

Tenemos que probar cada 'Input' dos veces, capturando ambos resultados.

De normal, tarda 30 segundos o más en responder. Si tarda más de 90 segundos, significa que no funciona o se ha quedado estancado.

Si sale 'Preparando tu mensaje' significa que todavía está 'pensando'.

Cuando no funcione, o se quede estancado el IBot, sigue esperando hasta que aparezca un mensaje de error de conexión. Una vez que aparezca, haz click en el botón del lápiz en la esquina superior derecha para resetear el chat y vuelve a poner el mismo mensaje o hilo de mensajes.

Cada vez que se mande un mensaje, deberíamos resetear el chat haciendo click en el botón de la esquina superior derecha que es un icono de un lápiz.

Cuando haga falta 'reset' y no lo consigas haciendo click en el botón, puedes recargar la página entera.

Tienes que guardar el transcript exacto: Inputs y Outputs en JSON, para que después podamos rellenar el CSV.

Haz del test 40 al test 42. Recuerda, dos intentos por test.


Este es el CSV de todos los tests que tenemos que hacer
```
ID,RAMA,Resolución,MOTIVO,INPUT,Menú,Acción Tester,Esperado,Inputs y Outputs (JSON),Resultado 1er Intento,Resultado 2do Intento,Nombre Tester,Comentarios testing
1,Informacional > RAG,RAG informacional,Consulta informacional OW,¿Qué opciones tengo si Iberia me cancela un vuelo a menos de 48 horas?,Explica de forma general las opciones disponibles en cancelación OW y cierra preguntando si quieres que revise tu reserva concreta.,"Responder: Sí, quiero gestionarlo","Tras la respuesta afirmativa, solicita PNR + apellido y mantiene un tono empático.","[{""input"":""¿Qué opciones tengo si Iberia me cancela un vuelo a menos de 48 horas?"",""output"":""Entiendo que esto puede ser muy frustrante... Reubicación en otro vuelo... Cambio de vuelo... Reembolso... Si me dices tu código de reserva y tu apellido, reviso tu caso concreto...""},{""input"":""Sí, quiero gestionarlo"",""output"":""Lamento mucho esta situación, estoy aquí para ayudarte a gestionarlo. Dime, por favor, tu código de reserva y tu apellido (tal y como aparecen en la reserva).""}]",OK,,Álvaro,Cumple el comportamiento esperado en el intento con evidencia guardada. El 2º intento no quedó consolidado con transcript exacto y conviene repetirlo antes de cerrarlo.,,,,
2,Informacional > RAG,RAG informacional,Consulta sobre compensación / condiciones,"Si me cancelan el vuelo hoy, ¿qué compensación o alternativas tengo?",Da la información general correspondiente a cancelación OW y pregunta al final si quieres más ayuda con tu reserva.,"Responder: No, solo quería información",No entra en el flujo transaccional si el cliente no pide gestionar nada más.,"[{""input"":""Si me cancelan el vuelo hoy, ¿qué compensación o alternativas tengo?"",""output"":""Entiendo perfectamente lo frustrante que es que te cancelen un vuelo, y lo siento mucho. Para hablar de compensación (más allá de cambio de vuelo o reembolso) necesito derivarte con un agente humano, porque depende de los detalles del caso (ruta, motivo de la cancelación, tiempos de aviso, etc.). Si me confirmas tu código de reserva y tu apellido, el agente podrá revisar tu caso y decirte exactamente qué te corresponde. Un momento, por favor, voy a pasar tu conversación a un agente para que te ayude de manera más personalizada.""},{""input"":""No, solo quería información"",""output"":""Hola, por tu seguridad y para poder continuar con la conversación, por favor, facilítanos tu nombre y el correo electrónico. Muchas gracias.""}]",FAIL,,Álvaro,No se mantiene en modo informacional. Deriva a agente humano y pide PII aunque el usuario solo quería información. Además la conversación acaba cerrándose por inactividad.,,,,
3,Transaccional > Identificación,Solicita PNR + apellido,Inicio de gestión OW,Me han cancelado el vuelo y quiero que me ayudéis.,Pide PNR + apellido para localizar la reserva y añade una disculpa por la cancelación.,Facilitar PNR + apellido válidos,No ofrece ninguna gestión final antes de identificar la reserva.,"[{""input"":""Me han cancelado el vuelo y quiero que me ayudeis."",""output"":""Entiendo que esto puede ser muy frustrante; lo siento mucho. Estoy aquí para ayudarte a gestionarlo. Para localizar tu reserva y ver las opciones disponibles, dime por favor: código de reserva y apellido del pasajero.""},{""input"":""ABC123 García"",""output"":""Lo siento, con ABC123 y García no me aparece ninguna reserva. ¿Puedes confirmarme si el código de reserva está exactamente así y si el apellido está escrito tal cual en la reserva?""}]",OK,,Álvaro,Cumple la identificación previa y mantiene tono empático. No ofrece gestión final antes de identificar. La validación posterior falla por datos de prueba o reserva no localizada.,,,,
4,Transaccional > Identificación,Repregunta dato faltante,PNR sin apellido,Mi localizador es ABC123.,Indica que para revisar la reserva necesita PNR y apellido.,Facilitar apellido,No continúa con la gestión hasta tener ambos datos.,"[{""input"":""Mi localizador es ABC123."",""output"":""Perfecto, ya tengo el localizador ABC123. Para poder consultar tu reserva, ¿me indicas el apellido del pasajero tal como aparece en la reserva?""},{""input"":""García"",""output"":""¿Me confirmas que quieres consultar la reserva ABC123 para el apellido GARCÍA?""}]",OK,,Álvaro,Cumple la repregunta del dato faltante. No continúa la gestión sin ambos datos y añade un paso de confirmación.,,,,
5,Transaccional > Validación reserva,No aplica OW / no detectado,Reserva sin cancelación OW,"[Precondición: PNR + apellido válidos, pero la reserva no tiene vuelo cancelado en ventana operativa] Quiero gestionar mi cancelación.",Explica que no detecta una cancelación en ventana operativa para esa reserva y ofrece ayuda adicional.,Revisar literal,No deriva a web ni Call Center como si fuera un caso OW gestionable.,,,,
6,Aceptar alternativa > Autogestión,Deriva web prepopulada,A1.1. Aceptación alternativa | cliente NO FACTURADO,"[Precondición: PNR válido, cliente NO FACTURADO, vuelo cancelado en OW] Quiero aceptar la alternativa.",Sentimos las molestias por la cancelación. Puedes aceptar la alternativa desde este enlace [enlace]. Pasos: revisa la opción propuesta y confírmala.,Abrir enlace,Deriva a la web prepopulada para aceptación de alternativa.,,,,
7,Aceptar alternativa > Autogestión,Deriva web prepopulada,A2.1. Aceptación alternativa | cliente FACTURADO,"[Precondición: PNR válido, cliente FACTURADO, vuelo cancelado en OW] Quiero aceptar el vuelo alternativo.",Sentimos las molestias por la cancelación. Puedes aceptar la alternativa desde este enlace [enlace]. Pasos: revisa la opción propuesta y confírmala.,Abrir enlace,Permite autogestión y deriva a web prepopulada.,,,,
8,Aceptar alternativa > Autogestión,Deriva web prepopulada,A3.1. Aceptación alternativa | cliente FACTURADO CON MALETA,"[Precondición: PNR válido, cliente FACTURADO CON MALETA, vuelo cancelado en OW] Acepto la alternativa.",Sentimos las molestias por la cancelación. Puedes aceptar la alternativa desde este enlace [enlace]. Pasos: revisa la opción propuesta y confírmala.,Abrir enlace,Permite autogestión y deriva a web prepopulada.,,,,
9,Aceptar alternativa > No autogestión,Deriva agencia / Call Center,A01. Aceptación alternativa | reserva de GRUPO,"[Precondición: PNR válido, reserva de GRUPO, vuelo cancelado en OW] Quiero aceptar la alternativa.",Indica que las reservas de grupo no son gestionables online y que contacte con su agencia de viajes o Atención al Cliente.,Revisar literal,No deriva a web; explica el motivo de bloqueo.,,,,
10,Aceptar alternativa > No autogestión,Deriva agencia / Call Center,A02. Aceptación alternativa | NECESIDADES ESPECIALES,"[Precondición: PNR válido, necesidades especiales, vuelo cancelado en OW] Quiero aceptar la alternativa.",Indica que las reservas con necesidades especiales no son gestionables online y deriva a agencia o Atención al Cliente.,Revisar literal,No deriva a web; explica el motivo de bloqueo.,,,,
11,Aceptar alternativa > No autogestión,Deriva agencia / Call Center,A03. Aceptación alternativa | billete FREE,"[Precondición: PNR válido, billete FREE, vuelo cancelado en OW] Quiero aceptar la alternativa.",Indica que los billetes tipo FREE no son gestionables online y deriva a agencia o Atención al Cliente.,Revisar literal,No deriva a web; explica el motivo de bloqueo.,,,,
12,Flujo > Cascada,Ofrece primera opción de cascada,Orden de oferta por defecto,"[Precondición: PNR válido, vuelo cancelado en OW, autogestión disponible] Me han cancelado el vuelo.",Sentimos las molestias. He revisado tu reserva y la primera opción disponible es aceptar la alternativa propuesta.,Responder: No quiero aceptar la alternativa,Empieza por aceptación de alternativa; no salta directamente a cambio o reembolso.,,,,
13,Flujo > Cascada,Ofrece segunda opción de cascada,Tras rechazo de alternativa,[Precondición: misma reserva del caso anterior] No quiero esa alternativa.,Ofrece cambio de vuelo como siguiente opción disponible.,Responder: No quiero cambiar el vuelo,"Tras rechazar la alternativa, la siguiente oferta es cambio de vuelo.",,,,
14,Cambio de vuelo > Autogestión,Deriva web prepopulada,C1.1.3. Cambio | mismo OD | ningún segmento volado | NO FACTURADO | SIN ancillaries,"[Precondición: PNR válido, NO FACTURADO, mismo OD, ningún segmento volado, sin ancillaries] Quiero cambiar mi vuelo.","Sentimos las molestias por la cancelación. Puedes cambiar tu vuelo desde este enlace [enlace]. Pasos: revisa las opciones, selecciona la nueva y confirma.",Abrir enlace,Permite autogestión y deriva a la web prepopulada.,,,,
15,Cambio de vuelo > Autogestión,Deriva web prepopulada,C1.2.1. Cambio | SISTER CITIES | ningún segmento volado | NO FACTURADO | ancillaries TRANSFERIDAS,"[Precondición: PNR válido, NO FACTURADO, SISTER CITIES, ningún segmento volado, ancillaries TRANSFERIDAS] Quiero cambiar el vuelo.","Sentimos las molestias por la cancelación. Puedes cambiar tu vuelo desde este enlace [enlace]. Pasos: revisa las opciones, selecciona la nueva y confirma.",Abrir enlace,Permite autogestión y deriva a la web prepopulada.,,,,
16,Cambio de vuelo > No autogestión,Deriva agencia / Call Center,C2.1.3. Cambio | mismo OD | ningún segmento volado | FACTURADO | SIN ancillaries,"[Precondición: PNR válido, FACTURADO, mismo OD, ningún segmento volado] Quiero cambiar mi vuelo.",Indica que los cambios para pasajeros facturados no son gestionables online y deriva a agencia o Atención al Cliente.,Revisar literal,No deriva a web; explica el bloqueo por estado de facturación.,,,,
17,Cambio de vuelo > No autogestión,Deriva mostrador / agencia / Call Center,C3.1.3. Cambio | mismo OD | ningún segmento volado | FACTURADO CON MALETA | SIN ancillaries,"[Precondición: PNR válido, FACTURADO CON MALETA, mismo OD, ningún segmento volado] Necesito cambiar el vuelo.","Indica que no es gestionable online y que, si contrató directamente con Iberia, acuda al mostrador de facturación del aeropuerto; si fue con agencia, contacte con la agencia.",Revisar literal,No deriva a web; el canal recomendado incluye mostrador para facturado con maleta.,,,,
18,Cambio de vuelo > No autogestión,Deriva agencia / Call Center,C01. Cambio de vuelo | reserva de GRUPO,"[Precondición: PNR válido, reserva de GRUPO, vuelo cancelado en OW] Quiero cambiar mi vuelo.",Indica que las reservas de grupo no son gestionables online y deriva a agencia o Atención al Cliente.,Revisar literal,No deriva a web; explica el motivo de bloqueo.,,,,
19,Cambio de vuelo > No autogestión,Deriva agencia / Call Center,C02. Cambio de vuelo | NECESIDADES ESPECIALES,"[Precondición: PNR válido, necesidades especiales, vuelo cancelado en OW] Quiero cambiar mi vuelo.",Indica que las reservas con necesidades especiales no son gestionables online y deriva a agencia o Atención al Cliente.,Revisar literal,No deriva a web; explica el motivo de bloqueo.,,,,
20,Cambio de vuelo > No autogestión,Deriva agencia / Call Center,C03. Cambio de vuelo | billete FREE,"[Precondición: PNR válido, billete FREE, vuelo cancelado en OW] Quiero cambiar el vuelo.",Indica que los billetes FREE no son gestionables online y deriva a agencia o Atención al Cliente.,Revisar literal,No deriva a web; explica el motivo de bloqueo.,,,,
21,Cambio de vuelo > No autogestión,Deriva agencia / Call Center,C04. Cambio de vuelo | mascota en cabina,"[Precondición: PNR válido, mascota en cabina, vuelo cancelado en OW] Quiero cambiar el vuelo.",Indica que las reservas con mascota en cabina no son gestionables online y deriva a agencia o Atención al Cliente.,Revisar literal,No deriva a web; explica el motivo de bloqueo.,,,,
22,Cambio de vuelo > Subcaso adicional,Deriva agencia / Call Center,Cambio de ruta,"[Precondición: PNR válido, vuelo cancelado en OW] Quiero cambiar el destino, no solo la fecha.",Indica que el cambio de ruta no se puede gestionar online y deriva a agencia o Atención al Cliente.,Revisar literal,No ofrece autogestión para cambio de ruta.,,,,
23,Cambio de vuelo > Subcaso adicional,Deriva formulario médico,Cambio por causa médica,"[Precondición: PNR válido, vuelo cancelado en OW] Necesito cambiar el vuelo por una causa médica.",Recuerda que los cambios por causa médica requieren una gestión específica y facilita el formulario https://iberia.my.salesforce-sites.com/formulariosalud/R5_VFP_healthForm?language=es,Abrir formulario,Deriva al formulario médico; no intenta resolverlo por el flujo estándar.,,,,
24,Flujo > Cascada,Ofrece tercera opción de cascada,Tras rechazo de cambio,"[Precondición: misma reserva del caso anterior, autogestión disponible] No quiero cambiar el vuelo.",Ofrece reembolso en voucher como siguiente opción disponible.,Responder: No quiero voucher,"Tras rechazar el cambio, la siguiente oferta es reembolso en voucher.",,,,
25,Reembolso > Autogestión,Deriva web prepopulada,R1.1. Reembolso en voucher | cliente NO FACTURADO,"[Precondición: PNR válido, NO FACTURADO, vuelo cancelado en OW] Quiero un reembolso en bono.","Sentimos las molestias por la cancelación. Puedes solicitar el reembolso en voucher desde este enlace [enlace]. Pasos: revisa el importe, confirma la solicitud y guarda la referencia.",Abrir enlace,Permite autogestión y deriva a la web prepopulada.,,,,
26,Reembolso > Autogestión,Deriva web prepopulada,R1.2. Reembolso en método original de pago | cliente NO FACTURADO,"[Precondición: PNR válido, NO FACTURADO, vuelo cancelado en OW] Quiero el dinero en mi método de pago original.","Sentimos las molestias por la cancelación. Puedes solicitar el reembolso desde este enlace [enlace]. Pasos: revisa la información, selecciona el método original de pago y confirma.",Abrir enlace,Permite autogestión y deriva a la web prepopulada.,,,,
27,Reembolso > No autogestión,Deriva agencia / Call Center,R2.1. Reembolso en voucher | cliente FACTURADO,"[Precondición: PNR válido, FACTURADO, vuelo cancelado en OW] Quiero un reembolso en bono.",Indica que los reembolsos para pasajeros facturados no son gestionables online y deriva a agencia o Atención al Cliente.,Revisar literal,No deriva a web; explica el bloqueo por estado de facturación.,,,,
28,Reembolso > No autogestión,Deriva agencia / Call Center,R2.2. Reembolso en método original de pago | cliente FACTURADO,"[Precondición: PNR válido, FACTURADO, vuelo cancelado en OW] Quiero el reembolso al método de pago original.",Indica que los reembolsos para pasajeros facturados no son gestionables online y deriva a agencia o Atención al Cliente.,Revisar literal,No deriva a web; explica el bloqueo por estado de facturación.,,,,
29,Reembolso > No autogestión,Deriva agencia / Call Center,R3.1. Reembolso en voucher | cliente FACTURADO CON MALETA,"[Precondición: PNR válido, FACTURADO CON MALETA, vuelo cancelado en OW] Quiero un reembolso en bono.",Indica que los reembolsos para pasajeros facturados con maleta no son gestionables online y deriva a agencia o Atención al Cliente.,Revisar literal,No deriva a web; explica el bloqueo por estado de facturación y equipaje.,,,,
30,Reembolso > No autogestión,Deriva agencia / Call Center,R3.2. Reembolso en método original de pago | cliente FACTURADO CON MALETA,"[Precondición: PNR válido, FACTURADO CON MALETA, vuelo cancelado en OW] Quiero el reembolso al método de pago original.",Indica que los reembolsos para pasajeros facturados con maleta no son gestionables online y deriva a agencia o Atención al Cliente.,Revisar literal,No deriva a web; explica el bloqueo por estado de facturación y equipaje.,,,,
31,Reembolso > No autogestión,Deriva agencia / Call Center,R01.1. Reembolso en voucher | reserva de GRUPO,"[Precondición: PNR válido, reserva de GRUPO, vuelo cancelado en OW] Quiero un reembolso en bono.",Indica que las reservas de grupo no son gestionables online y deriva a agencia o Atención al Cliente.,Revisar literal,No deriva a web; explica el motivo de bloqueo.,,,,
32,Reembolso > No autogestión,Deriva agencia / Call Center,R02.1. Reembolso en voucher | NECESIDADES ESPECIALES,"[Precondición: PNR válido, necesidades especiales, vuelo cancelado en OW] Quiero un reembolso.",Indica que las reservas con necesidades especiales no son gestionables online y deriva a agencia o Atención al Cliente.,Revisar literal,No deriva a web; explica el motivo de bloqueo.,,,,
33,Reembolso > No autogestión,Deriva agencia / Call Center,R04.1. Reembolso en voucher | mascota en cabina,"[Precondición: PNR válido, mascota en cabina, vuelo cancelado en OW] Quiero un reembolso.",Indica que las reservas con mascota en cabina no son gestionables online y deriva a agencia o Atención al Cliente.,Revisar literal,No deriva a web; explica el motivo de bloqueo.,,,,
34,Flujo > Salto de cascada,Respeta gestión concreta solicitada,Petición directa de cash refund,"[Precondición: PNR válido, NO FACTURADO, vuelo cancelado en OW y autogestión disponible] No quiero alternativa ni cambio; quiero el reembolso al método original de pago.",No repite la cascada desde aceptación de alternativa. Ofrece directamente el reembolso cash o su derivación correspondiente.,Revisar literal,"Si el cliente pide una gestión concreta, entra directamente en esa gestión.",,,,
35,NFR > Tono,Mensaje empático,Empatía obligatoria en cancelación OW,[Precondición: cualquier caso transaccional OW] Me han cancelado el vuelo.,El mensaje inicial incluye una disculpa clara por los inconvenientes causados por la cancelación.,Revisar literal,Mantiene tono empático en un contexto de cancelación en ventana operativa.,,,,
36,NFR > UX,Derivación web completa,Link prepopulado + pasos,[Precondición: cualquier caso autogestionable OW] Quiero gestionarlo online.,La derivación a web incluye enlace prepopulado y una explicación sencilla de los pasos a seguir.,Revisar literal,No envía solo el link; añade instrucciones simples.,,,,
37,NFR > Canal,No promete app no disponible,Derivación a web mientras app no esté desarrollada,[Precondición: caso autogestionable OW] Envíame a la app para hacerlo.,Aclara la gestión mediante web / enlace prepopulado y no promete una app nativa si aún no está disponible.,Revisar literal,Deriva a web como canal operativo vigente.,,,,
38,Asistencia > No autogestión,Deriva agencia / Call Center,AS.1. Información de la asistencia,"[Precondición: PNR válido, vuelo cancelado en OW] Necesito información sobre la asistencia por la cancelación.",Deriva a Atención al Cliente para información de asistencia.,Revisar literal,No ofrece autogestión online para este subcaso.,,,,
39,Asistencia > No autogestión,Deriva agencia / Call Center,AS.2. Gestión de la asistencia,"[Precondición: PNR válido, vuelo cancelado en OW] Quiero que me gestionéis la asistencia.",Deriva a Atención al Cliente para la gestión de asistencia.,Revisar literal,No ofrece autogestión online para este subcaso.,,,,
40,Informacional > RAG,RAG informacional,Consulta informacional OW | lenguaje coloquial,"Me habéis cancelado el vuelo de esta noche, ¿qué puedo hacer ahora?",Da una explicación general de las opciones en cancelación OW con tono empático y termina ofreciendo revisar la reserva concreta.,"Responder: Sí, revísame la reserva","Tras la respuesta afirmativa, solicita PNR + apellido; no asume datos de reserva inexistentes.",,,,
41,Informacional > RAG,RAG informacional,Consulta sobre asistencia / compensación | lenguaje natural,"¿Me corresponde hotel, comida o alguna compensación por esta cancelación?",Responde la parte informacional aplicable y pregunta si quieres ayuda con tu reserva concreta.,"Responder: No, gracias",Cierra la consulta sin activar el flujo transaccional.,,,,
42,Transaccional > Identificación,Solicita PNR + apellido,Petición directa de aceptación | lenguaje natural,"Acepto el otro vuelo, hacédmelo ya.","Antes de cualquier gestión, pide PNR + apellido y mantiene tono empático.",Facilitar PNR + apellido válidos,No deriva a web ni confirma ninguna gestión antes de validar la reserva.,,,,
43,Transaccional > Identificación,Solicita PNR + apellido,Petición directa de reembolso cash | lenguaje coloquial,"No quiero bono ni alternativas, devolvedme el dinero.",Solicita PNR + apellido para revisar si la reserva tiene cancelación OW y si procede autogestión.,Facilitar PNR + apellido válidos,"Respeta la intención de cash refund, pero primero identifica la reserva.",,,,
44,Transaccional > Identificación,Solicita PNR + apellido,Petición directa de cambio | urgencia,Buscadme otro vuelo cuanto antes.,Solicita PNR + apellido antes de evaluar cambio de vuelo.,Facilitar PNR + apellido válidos,No salta pasos de identificación.,,,,
45,Informacional > Desambiguación,Desambiguación suave,Consulta ambigua,Me han cancelado el vuelo. ¿Y ahora qué?,Da una orientación breve y ofrece revisar la reserva o resolver dudas generales.,Responder: Quiero que revises mi reserva,"Ante el paso a transaccional, solicita PNR + apellido.",,,,
46,Transaccional > Identificación,Acepta datos completos,PNR + apellido en un único mensaje,"Localizador ABC123, apellido García.",Reconoce que ya tiene los datos necesarios y pasa a revisar la reserva.,Revisar literal,No repregunta datos ya aportados correctamente.,,,,
47,Transaccional > Identificación,Acepta orden alterno de datos,Apellido + PNR invertidos,"García López, ABC123.",Interpreta ambos datos aunque lleguen en orden inverso y continúa con la revisión.,Revisar literal,No obliga al usuario a repetir los mismos datos solo por el orden.,,,,
48,Transaccional > Identificación,Normaliza formato de datos,PNR en minúsculas / con espacios,mi localizador es abc 123 y el apellido garcía,"Acepta o normaliza los datos si son inequívocos; si no puede, pide confirmación concreta sin reiniciar el flujo.",Revisar literal,Gestiona la variación de formato con robustez.,,,,
49,Transaccional > Identificación,Repregunta PNR,Datos incompletos con información auxiliar,"Soy García, vuelo IB1234 mañana a Londres.",Indica que necesita el PNR/localizador y apellido para revisar la reserva.,Facilitar PNR,No intenta operar solo con vuelo/fecha si falta el localizador.,,,,
50,Transaccional > Identificación,Ayuda a encontrar el PNR,No conoce el localizador,No sé cuál es mi localizador.,Explica que necesita PNR + apellido para revisar la reserva y orienta de forma breve sobre dónde encontrar el localizador.,Responder: No lo tengo ahora,No inventa alternativas no definidas; deja claro que sin PNR no puede validar la reserva.,,,,
51,Transaccional > Validación datos,Detecta dato aparentemente inválido,PNR con formato erróneo,Mi localizador es AB12 y mi apellido García.,Pide revisar o confirmar el localizador porque no parece correcto para localizar la reserva.,Corregir localizador,No continúa como si el PNR fuera válido.,,,,
52,Transaccional > Validación reserva,Repregunta por no coincidencia,Apellido incorrecto,"[Precondición: PNR existente, apellido no coincide] Mi localizador es ABC123 y mi apellido Garzia.",Indica que no ha podido localizar la reserva con esos datos y pide verificar apellido y/o localizador.,Corregir apellido,No confirma una reserva si los datos no cuadran.,,,,
53,Transaccional > Validación reserva,Permite corregir y continuar,Dato corregido en segundo intento,"[Precondición: tras un intento fallido] Perdón, el apellido correcto es García.",Retoma la validación con el dato corregido sin reiniciar innecesariamente toda la conversación.,Revisar literal,Continúa desde el punto de validación y no vuelve a empezar desde cero.,,,,
54,Flujo > Cambio de intención,Respeta nueva gestión concreta,De aceptación alternativa a reembolso cash,"[Precondición: reserva OW validada, inicialmente pidió aceptar alternativa] Mejor no, quiero el reembolso al método original.",Abandona el subflujo anterior y ofrece directamente el cash refund o su derivación correspondiente.,Revisar literal,No obliga a seguir con aceptación alternativa si el usuario cambia de idea.,,,,
55,Flujo > Cambio de intención,Responde info y preserva contexto,Consulta informacional a mitad de flujo,"[Precondición: reserva OW validada] Antes de seguir, ¿qué compensación me corresponde?",Resuelve la duda informacional y después pregunta si quiere retomar la gestión de la reserva.,"Responder: Sí, sigamos",Atiende la duda sin perder el contexto transaccional.,,,,
56,Flujo > Cambio de intención,Respeta nuevo subflujo,De reembolso a cambio de vuelo,"[Precondición: reserva OW validada, inicialmente pidió reembolso] He cambiado de idea, prefiero otro vuelo.",Pasa al subflujo de cambio de vuelo sin repetir toda la cascada desde el inicio.,Revisar literal,Sigue la nueva intención del usuario.,,,,
57,Robustez > No autogestión,Mantiene límite del canal,Insistencia en caso bloqueado,"[Precondición: reserva de GRUPO / necesidades especiales / mascota en cabina] No me mandes a ningún sitio, hazlo tú aquí en el ibot.",Reitera con claridad y empatía que ese caso no se puede gestionar online por este canal y deriva al canal correcto.,Revisar literal,No promete una gestión que el canal no soporta.,,,,
58,Robustez > Canal,No finge resolver en chat,Rechazo a derivación web en caso autogestionable,"[Precondición: caso OW autogestionable] No quiero enlaces, quiero que me lo resuelvas aquí.",Explica que la finalización de la gestión se hace vía web prepopulada y mantiene la derivación.,Revisar literal,No simula completar en chat una transacción que debe cerrarse en web.,,,,
59,Robustez > Identificación,No omite dato obligatorio,Insistencia sin apellido,"Ya te he dado el localizador, gestiona tú el resto.",Vuelve a pedir el apellido si aún no lo tiene y explica que lo necesita para localizar la reserva.,Revisar literal,No salta la validación de identidad/reserva por presión del usuario.,,,,
60,Transaccional > Salto de cascada,Identifica y respeta gestión concreta,Datos + intención en un solo mensaje,"ABC123, García. Quiero el reembolso al método original.",Reconoce los datos y la gestión concreta solicitada; valida la reserva y entra en el subflujo de cash refund.,Revisar literal,No repregunta datos ya aportados ni reinicia la cascada por defecto.,,,,
61,Transaccional > Identificación,Completa datos en varios turnos,"Apellido primero, PNR después",Mi apellido es García.,Indica que todavía necesita el PNR/localizador para revisar la reserva.,Responder: El localizador es ABC123,"Al recibir el PNR después, continúa con la validación sin pedir de nuevo el apellido.",,,,
```'''

Your mission is to do the necessary changes across our entire codebase.

Consider the research we made:

'''Do it with a **two-track result system**:

1. **Deterministic run telemetry** from Playwright/CUA
2. **Configurable extraction pipeline** for domain-specific data

That is the right architecture because the first part is stable and replayable, while the second part is adaptable per test type. The current demo already has the right insertion points: `cua-server` is the core runtime, `computerUseLoop` is where model actions are executed, and screenshots are already captured and sent back to the model. ([GitHub][1])

## What to build

### 1) Standardize every low-level action into an event log

Do **not** rely on the model to “remember” what it did.
Persist a canonical event stream.

Store events like:

```json
{
  "run_id": "uuid",
  "step_id": 3,
  "ts": "2026-04-22T19:31:10.421Z",
  "actor": "cua_agent",
  "event_type": "ui_action",
  "action_type": "click",
  "action_label": "Opened chatbot launcher",
  "target": {
    "selector": "[data-testid='ibot-launcher']",
    "text": "IBot",
    "role": "button",
    "url": "https://pre.iberia.com"
  },
  "coordinates": { "x": 913, "y": 684 },
  "screenshot_before_id": "img_001",
  "screenshot_after_id": "img_002",
  "response_id": "resp_x",
  "call_id": "call_y"
}
```

For chat tests, also emit:

```json
{
  "run_id": "uuid",
  "ts": "2026-04-22T19:31:20.111Z",
  "actor": "product_ai",
  "event_type": "chat_turn",
  "chat": {
    "turn_index": 1,
    "user_input": "¿Cómo puedo cambiar mi vuelo?",
    "assistant_output": "Puedes modificar tu vuelo desde..."
  },
  "source": {
    "extraction_method": "dom",
    "selector_input": "[contenteditable='true']",
    "selector_messages": ".ibot-message"
  }
}
```

Why: the OpenAI computer tool flow is already action-driven, and the official guide describes the loop as executing returned computer actions and sending screenshots back with `computer_call_output`. That means action-level logging is the natural source of truth. ([OpenAI Plataforma][2])

### 2) Separate “observability” from “test result”

Your final run record should have **three artifacts**:

* `events.jsonl` → raw event stream
* `artifacts/` → screenshots, HTML snapshots, maybe DOM extracts
* `results.json` → normalized summary for the test case

This separation matters because OpenAI’s SDK guidance explicitly treats results/state and observability as distinct concerns: use run state for application logic and traces for debugging/improvement. ([OpenAI Plataforma][3])

## Where to hook it in your code

### A) In `computerUseLoop`

Right now the demo already:

* inspects `computer_call`
* executes actions
* captures screenshots
* sends screenshots back to the model ([GitHub][4])

That is where you should emit standardized events:

* before action
* after action
* after screenshot
* after model response
* after function/tool call

So add a small logger like:

```ts
await eventStore.append({
  event_type: "ui_action",
  action_type: action.type,
  action_label: standardizeAction(action, pageContext),
  ...
});
```

### B) In `handleModelAction`

This is where you can enrich labels:

* `click` on button “Menu” → `Opened dropdown 'Menu'`
* `type` into IBot input → `Entered prompt into chatbot input`
* `keypress Enter` → `Submitted chatbot prompt`

This should be rule-based first, not LLM-based.

## 3) Make extraction configurable with “extractors”

Create a per-test-type extractor pipeline.

Example config:

```json
{
  "test_type": "chatbot",
  "extractors": [
    {
      "name": "chat_transcript",
      "method": "dom",
      "selectors": {
        "messages": ".ibot-message",
        "user_messages": ".ibot-message--user",
        "assistant_messages": ".ibot-message--assistant",
        "input": "textarea, [contenteditable='true']"
      }
    },
    {
      "name": "chat_latency",
      "method": "event_diff",
      "from_event": "chat_prompt_submitted",
      "to_event": "assistant_message_rendered"
    }
  ]
}
```

For another test type:

```json
{
  "test_type": "checkout",
  "extractors": [
    {
      "name": "cart_total",
      "method": "dom",
      "selectors": {
        "value": "[data-testid='cart-total']"
      }
    },
    {
      "name": "confirmation_number",
      "method": "regex_from_dom",
      "selectors": {
        "container": ".confirmation-page"
      },
      "pattern": "[A-Z0-9]{6,12}"
    }
  ]
}
```

This gives you **configurable extraction without changing core runtime**.

## 4) Extraction priority: DOM first, screenshot/LLM second

Use this order:

### Tier 1 — DOM / network / event-based extraction

Best for:

* exact chatbot transcript
* selected card text
* button labels
* totals, IDs, dates

This is cheapest and most reliable.

### Tier 2 — screenshot OCR / vision extraction

Use only when the data is visible but not available in DOM:

* canvas-based UIs
* shadow DOM you cannot easily access
* image-rendered text

### Tier 3 — LLM summarization over artifacts

Use for:

* “what happened in this workflow?”
* “why did the agent fail?”
* “summarize the conversation into outcome / blockers / next step”

That keeps exact facts deterministic and reserves models for interpretation.

## 5) For chatbot tests, build a dedicated transcript extractor

For your Iberia chatbot case, I would not make the main agent decide when to save transcript data.

I would add a **post-action watcher**:

* after every `type` + `Enter` or “send” click
* poll DOM until a new assistant message appears
* extract:

  * user turn text
  * assistant turn text
  * timestamps
  * optional rendered cards/buttons
* append to `chat_transcript`

That gives you the exact input-output pairs you want.

### Minimal output shape

```json
{
  "chat_transcript": [
    {
      "turn": 1,
      "user": "Quiero cambiar mi vuelo",
      "assistant": "Puedo ayudarte con eso. ¿Me indicas tu localizador?",
      "started_at": "...",
      "completed_at": "...",
      "latency_ms": 4821
    }
  ]
}
```

## 6) Add a generic `capture_data` tool only for ambiguous cases

A tool can help, but it should be **secondary**, not your main mechanism.

Good use:

* “capture whatever booking reference is visible now”
* “capture the selected fare family currently shown”
* “capture all visible options in this modal”

Bad use:

* replacing deterministic transcript extraction
* replacing event logging
* replacing selectors you already know

So yes, add a tool like:

```json
{
  "name": "capture_data",
  "description": "Store structured data visible in the current UI according to a named schema",
  "parameters": {
    "schema_name": "chatbot_turn | booking_summary | modal_options",
    "payload": "object"
  }
}
```

But gate it behind explicit schemas. Do **not** let the agent invent arbitrary storage shapes.

## 7) Standard action naming should be rule-based

You asked for labels like `Opened Dropdown 'Menu'`.

Build a `standardizeAction()` mapper:

* inspect action type
* inspect selector / accessible name / visible text
* emit a normalized phrase

Examples:

* `click` + button text “Menu” → `Clicked button 'Menu'`
* if UI state changes and submenu appears → `Opened dropdown 'Menu'`
* `type` in chatbot input → `Entered prompt into chatbot`
* `click` send icon → `Submitted chatbot prompt`
* `click` card “Consultar estado del vuelo” → `Selected prompt card 'Consultar estado del vuelo'`

This gives you clean analytics and much better eval data later.

## 8) The final run result should be schema-driven

Do not have one monolithic `run.json`.

Use:

```json
{
  "run_id": "uuid",
  "test_type": "chatbot",
  "status": "pass",
  "summary": {
    "steps_passed": 6,
    "steps_failed": 0
  },
  "structured_results": {
    "chat_transcript": [...],
    "action_summary": [...],
    "latency_metrics": {...}
  },
  "artifacts": {
    "events": "events.jsonl",
    "screenshots": [...],
    "dom_snapshots": [...]
  }
}
```

That lets you support chatbot today and checkout / forms / search / booking later with the same core pipeline.

## My recommendation

Build it in this order:

1. **Event store** in `computerUseLoop` and `handleModelAction`
2. **Rule-based action standardizer**
3. **Configurable extractor registry**
4. **Dedicated chatbot transcript extractor**
5. **Optional `capture_data` tool** for hard cases
6. **Result schemas by test type**

### Cost / effort

* Event store + action standardizer: **low**
* Extractor registry: **medium**
* Chat transcript extractor: **low-medium**
* Screenshot/vision fallback: **medium**
* Generic capture tool + schemas: **medium**

## The flaw to avoid

Do **not** make “the agent decides what to save” your default architecture.

Cost:

* non-determinism
* harder audits
* worse eval quality
* impossible-to-compare runs

Agent judgment should be an overlay, not the source of truth.

The next best action is to define three interfaces now: `RunEvent`, `Extractor`, and `StructuredRunResult`, then wire them into `computerUseLoop` before you add more test types.

**Reflection:** do you want the system optimized first for exact replay/debugging, or first for human-readable QA reports?

[1]: https://raw.githubusercontent.com/openai/openai-testing-agent-demo/main/README.md "raw.githubusercontent.com"
[2]: https://platform.openai.com/docs/guides/tools-computer-use "Computer use | OpenAI API"
[3]: https://platform.openai.com/docs/guides/agents "Agents SDK | OpenAI API"
[4]: https://raw.githubusercontent.com/openai/openai-testing-agent-demo/main/cua-server/src/lib/computer-use-loop.ts "raw.githubusercontent.com"
'''

'''Do it as a **2-layer system**:

1. **Capture everything once**
2. **Derive test-specific outputs from that raw capture**

If you try to directly generate “the chatbot transcript” during the run, you’ll paint yourself into a corner. The same run will later need different outputs: chatbot transcript, form field values, selected flights, prices, error banners, tool invocations, etc.

## The right architecture

### 1) Build an append-only event log as the source of truth

Every run should emit normalized events to a JSONL file or DB table, in timestamp order.

Use three event families:

* **Execution events**: what the CUA/Playwright agent did
* **Observation events**: what the browser/app exposed
* **Derived events**: extractor outputs like transcript pairs or detected entities

A clean schema:

```json
{
  "run_id": "run_123",
  "ts": "2026-04-22T19:31:12.412Z",
  "step_id": "step_4",
  "event_type": "browser.click",
  "actor": "executor",
  "status": "success",
  "page_url": "https://pre.iberia.com",
  "target": {
    "selector": "[aria-label='Open IBot']",
    "text": "IBot",
    "role": "button"
  },
  "value": null,
  "metadata": {
    "x": 901,
    "y": 688
  },
  "evidence": {
    "screenshot_id": "shot_018",
    "trace_action_id": "trace_44"
  }
}
```

For chatbot traffic:

```json
{
  "run_id": "run_123",
  "ts": "2026-04-22T19:31:30.001Z",
  "event_type": "chat.message",
  "actor": "product_ai",
  "channel": "ibot",
  "message_id": "msg_7",
  "text": "Puedo ayudarte a revisar tu reserva. ¿Me facilitas tu localizador?",
  "metadata": {
    "source": "dom"
  },
  "evidence": {
    "screenshot_id": "shot_026",
    "dom_snapshot_id": "dom_026"
  }
}
```

### 2) Standardize actions at capture time

Do **not** let the final report invent action labels from scratch.

Map Playwright/CUA actions into a fixed taxonomy such as:

* `browser.navigate`
* `browser.go_back`
* `browser.new_tab`
* `browser.close_tab`
* `browser.scroll`
* `browser.wait`
* `dom.click`
* `dom.type`
* `dom.select`
* `dom.hover`
* `dom.submit`
* `network.request`
* `network.response`
* `ui.error`
* `chat.message`
* `assertion.pass`
* `assertion.fail`

Then produce human-friendly labels from the taxonomy:

* `dom.click` + target text `Menu` → **Opened menu**
* `dom.select` + field `Language` + value `English` → **Selected Language = English**
* `dom.type` + field `IBot input` + value `"Quiero revisar mi reserva"` → **Entered chatbot prompt**

This gives you stable analytics across runs.

## What to capture per run

### A. Raw browser evidence

You already have screenshots. Add these too:

* **Playwright trace** for each run. Trace Viewer includes action timeline, DOM snapshots, screenshots, network requests, console messages, and source details. That is exactly the forensic layer you need for QA. ([Playwright][1])
* **Network events** using `browserContext.on('request')`, `on('response')`, `on('requestfinished')`. Playwright explicitly exposes these lifecycle events. ([Playwright][2])
* **DOM/a11y snapshots** at meaningful checkpoints: before prompt, after prompt submit, after bot response, after retry.
* **Console errors** and uncaught page exceptions.

### B. CUA decision evidence

Store:

* model request id
* tool calls returned by the model
* executed actions
* screenshot ids fed back to the model
* any model summaries/reasoning text you expose internally

The OpenAI computer-use guide explicitly frames this as a harness problem: you can use the built-in `computer` tool, or layer custom tools/extractors on top of an automation harness. That supports this split between control and instrumentation. ([Desarrolladores de OpenAI][3])

### C. Product-under-test evidence

This is where chatbot-specific data lives.

Examples:

* user prompts sent to IBot
* assistant replies
* retry count
* latency from submit to first token / final render
* visible citations/cards/buttons shown by the bot
* error banners
* conversation thread state

## Extraction should be configurable, not hardcoded

Build **extractors** as plugins over the raw event stream.

### Extraction order

Use a tiered strategy:

1. **DOM extractor**
   Best when the chatbot messages exist as text nodes in the page.
2. **Network extractor**
   Best when the app calls a backend/chat API and you can reconstruct messages from request/response payloads.
3. **Vision extractor**
   Fallback when content is canvas-rendered, shadow DOM-hidden, virtualized, or otherwise hard to parse. Use screenshots plus a multimodal extraction prompt.
4. **Hybrid resolver**
   Merge candidates from DOM/network/vision and deduplicate.

That way, “extract transcript” is one plugin, and later you can add:

* `extract_price_quotes`
* `extract_selected_flights`
* `extract_form_values`
* `extract_error_states`
* `extract_policy_decisions`

## For chatbot tests specifically

Your final run result should have **two linked outputs**:

### 1) Standardized action timeline

Example:

```json
[
  { "ts": "...", "label": "Opened IBot", "type": "dom.click" },
  { "ts": "...", "label": "Entered prompt", "type": "dom.type", "value": "Quiero revisar mi reserva" },
  { "ts": "...", "label": "Submitted prompt", "type": "dom.submit" },
  { "ts": "...", "label": "Received chatbot response", "type": "chat.message" }
]
```

### 2) Transcript artifact

Example:

```json
{
  "conversation_id": "conv_44",
  "channel": "ibot",
  "turns": [
    {
      "turn": 1,
      "user": "Quiero revisar mi reserva",
      "assistant": "Puedo ayudarte. ¿Me facilitas tu localizador?",
      "evidence": {
        "user_message_event_id": "evt_101",
        "assistant_message_event_id": "evt_108",
        "screenshot_ids": ["shot_018", "shot_021"]
      }
    }
  ]
}
```

This matters because “actions” and “business transcript” are not the same object.

## Recommended run artifact layout

Use one folder per run:

* `run.json` → metadata, verdict, summary
* `events.jsonl` → append-only normalized events
* `trace.zip` → Playwright trace
* `screenshots/`
* `network.jsonl`
* `extracts/`

  * `chat_transcript.json`
  * `entities.json`
  * `assertions.json`
  * `custom/<extractor_name>.json`

This is very close to the direction of OpenAI’s current GPT-5.4 CUA sample app, which already centers screenshots, events, and replay artifacts as first-class run outputs. ([GitHub][4])

## How to make extractors configurable

Define an extractor spec per test suite or app:

```json
{
  "extractors": [
    {
      "name": "chat_transcript",
      "type": "chat_transcript",
      "sources": ["dom", "network", "vision"],
      "config": {
        "message_container_selectors": [
          "[data-testid='chat-message']",
          ".ibot-message",
          "[role='log']"
        ],
        "user_markers": ["user", "cliente", "you"],
        "assistant_markers": ["assistant", "ibot", "bot"]
      }
    },
    {
      "name": "error_banners",
      "type": "ui_entities",
      "sources": ["dom", "vision"],
      "config": {
        "selectors": [".alert", "[role='alert']", ".error-banner"]
      }
    }
  ]
}
```

So each run says:

* execute scenario
* capture raw evidence
* run extractor pipeline X

## Processing pipeline I’d implement

### During execution

* emit normalized action events
* save screenshots at checkpoints
* capture network + DOM snapshots
* persist trace

### After execution

* run extractor plugins over the artifact bundle
* merge and score confidence
* generate final report objects

### Final report

* verdict
* action summary
* extractor outputs
* evidence refs
* replay link

## Confidence scoring

Every derived field should carry:

* `source`: `dom | network | vision | hybrid`
* `confidence`: `0.0–1.0`

Example:

```json
{
  "type": "chat_turn",
  "user": "Quiero revisar mi reserva",
  "assistant": "Puedo ayudarte. ¿Me facilitas tu localizador?",
  "source": "hybrid",
  "confidence": 0.96
}
```

This prevents your QA team from treating screenshot-only guesses as hard truth.

## What not to do

### Don’t:

* store only screenshots and ask an LLM later to “summarize what happened”
* make transcript extraction part of the CUA prompt itself
* hardcode chatbot logic into the runner core
* rely on one source only if DOM/network can give you stronger truth

### Do:

* keep runner generic
* keep extraction pluggable
* keep raw evidence immutable
* derive multiple views from the same run

## Concrete recommendation for your codebase

Refactor into these modules:

### `capture/`

* `event-emitter.ts`
* `playwright-instrumentation.ts`
* `network-capture.ts`
* `screenshot-capture.ts`
* `trace-capture.ts`

### `normalize/`

* `action-taxonomy.ts`
* `event-schema.ts`
* `label-renderer.ts`

### `extractors/`

* `chat-transcript.extractor.ts`
* `dom-entities.extractor.ts`
* `network-payload.extractor.ts`
* `vision-extractor.ts`
* `hybrid-merge.ts`

### `reports/`

* `run-summary.ts`
* `final-artifact-builder.ts`

## Fastest first implementation

Build this in 3 passes:

### Pass 1 — 1 to 2 days

* append-only `events.jsonl`
* standardized action taxonomy
* Playwright trace + screenshots + network events

### Pass 2 — 1 to 2 days

* chatbot transcript extractor from DOM first
* fallback to screenshot-based extraction
* final `chat_transcript.json`

### Pass 3 — 2 to 4 days

* generic extractor registry
* confidence scoring
* per-suite extractor config
* report UI with evidence links

## My blunt recommendation

Your **core product** here is not “CUA clicking around.”
It is **reliable evidence + configurable extraction**.

That’s the moat:

* standard actions for analytics
* rich artifacts for debugging
* pluggable extractors for each QA use case

Without that, you just have a flashy browser robot.

Next best action: implement `events.jsonl` + `trace.zip` first, then add one extractor plugin called `chat_transcript`.

Reflection: if you had to defend one failed run to Iberia tomorrow, would your current artifacts prove exactly what the agent clicked, saw, sent, and received?

[1]: https://playwright.dev/docs/trace-viewer?utm_source=chatgpt.com "Trace viewer"
[2]: https://playwright.dev/docs/api/class-browsercontext?utm_source=chatgpt.com "BrowserContext"
[3]: https://developers.openai.com/api/docs/guides/tools-computer-use?utm_source=chatgpt.com "Computer use | OpenAI API"
[4]: https://github.com/openai/openai-cua-sample-app?utm_source=chatgpt.com "GPT-5.4 CUA Sample App"
'''