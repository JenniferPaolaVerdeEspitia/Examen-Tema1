🎮 Duck Hunt – Canvas 2D Game

Videojuego interactivo desarrollado en JavaScript utilizando HTML5 Canvas 2D.

📌 Descripción

Duck Hunt es un videojuego estilo arcade donde el jugador debe disparar a patos en movimiento y cumplir una meta obligatoria en cada nivel para poder avanzar.

El juego cuenta con 10 niveles progresivos, aumento de dificultad dinámico, sistema de puntaje, efectos visuales, sonidos estilo retro (8-bit) y animaciones personalizadas.

🎯 Objetivo del Juego

Eliminar la cantidad obligatoria de patos en cada nivel para avanzar hasta el nivel 10.

Si el jugador no cumple la meta antes de que termine la ronda o se escapan demasiados patos, el juego finaliza.

🕹️ Mecánica de Niveles
Nivel	Patos requeridos
1	3
2	4
3	5
4	6
5	7
6	8
7	9
8	10
9	11
10	12

✔ La dificultad aumenta en cada nivel
✔ Incremento de velocidad y frecuencia de aparición
✔ Meta progresiva obligatoria

🎮 Controles
Acción	Tecla
Disparar	Click
Recargar	R
Pausar / Reanudar	P
Activar / Desactivar sonido	M
Pantalla completa	Botón
🚀 Características Principales

🎯 Sistema de metas progresivas

🔫 Control de munición y recarga

🦆 Movimiento dinámico con trayectorias variables

🐶 Animación decorativa del perro caminando

💥 Efectos visuales de disparo con partículas

🔊 Sonidos retro 8-bit con Web Audio API

🏆 Sistema de puntaje y récord (localStorage)

🧠 Gestión de estados del juego (Menú, Jugando, Fin de ronda, Game Over)

📱 Diseño adaptable con Bootstrap

🛠️ Tecnologías Utilizadas

HTML5

CSS3

Bootstrap 5

JavaScript (ES6)

Canvas 2D API

Web Audio API

🧩 Arquitectura del Juego

El videojuego funciona mediante:

Un ciclo de animación continuo con requestAnimationFrame.

Generación dinámica de patos por ronda.

Detección de colisiones mediante cálculo de distancia.

Evaluación de metas por nivel.

Control de estados y transiciones.

Persistencia de récord usando localStorage.

📚 Contexto Académico

Proyecto desarrollado como práctica integradora para aplicar:

Programación orientada a eventos

Animación 2D

Lógica condicional

Manejo del DOM

Diseño de interfaces interactivas

👩‍💻 Autora

Jennifer Paola Verde Espitia
Carrera: ITICS
