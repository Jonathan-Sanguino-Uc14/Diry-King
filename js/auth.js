/* =====================================================
   AUTH.JS — PROTECCIÓN DE PÁGINAS
   Este archivo se carga al inicio de dueño.html
   y empleado.html. Su trabajo es:
   1. Verificar que haya una sesión activa
   2. Verificar que el rol del usuario tenga permiso
      para ver esta página
   3. Si no tiene permiso → redirigir al login
   4. Si sí tiene permiso → mostrar su nombre en el header

   Cada página le dice a este script qué roles pueden
   entrar, usando un atributo en el <body>:
      <body data-roles-permitidos="dueno,gerente">
   ===================================================== */
(function () {

    /* Leemos la sesión guardada en el login */
    const sesionRaw = sessionStorage.getItem("sesion");

    /* Si no hay sesión → al login inmediatamente */
    if (!sesionRaw) {
        window.location.href = "index.html";
        return;
    }

    const sesion = JSON.parse(sesionRaw);

    /* Exponer la sesión globalmente para que empleado.js y dueño.js
       puedan acceder a ella con window.sesionActual */
    window.sesionActual = sesion;

    /*
        Leemos qué roles puede entrar a esta página.
        El atributo data-roles-permitidos está en el <body>
        del HTML de cada página.
        Ej: "dueno,gerente" → ["dueno", "gerente"]
    */
    const body           = document.body;
    const rolesPermitidos = (body.dataset.rolesPermitidos || "").split(",").map(r => r.trim());

    /* Si el rol del usuario no está en la lista → al login */
    if (!rolesPermitidos.includes(sesion.rol)) {
        window.location.href = "index.html";
        return;
    }

    /*
        Si llegó aquí, el usuario tiene permiso.
        Mostramos su nombre en el header cuando el DOM esté listo.
        Buscamos un elemento con id="nombre-usuario" en el header.
    */
    document.addEventListener("DOMContentLoaded", function () {

        // Mostrar nombre del usuario si existe el elemento
        const elNombre = document.getElementById("nombre-usuario");
        if (elNombre) {
            elNombre.textContent = sesion.nombre;
        }

        // Mostrar rol como badge si existe el elemento
        const elRol = document.getElementById("rol-usuario");
        if (elRol) {
            const badges = {
                "dueño":  "Dueño",
                gerente:  "Gerente",
                empleado: "Empleado",
            };
            elRol.textContent = badges[sesion.rol] || sesion.rol;
        }

        /*
            Si el usuario es gerente, mostramos un botón extra
            en el header para cambiar entre el punto de venta
            y el panel de administración.
        */
        if (sesion.rol === "gerente") {
            const elSwitch = document.getElementById("btn-cambiar-panel");
            if (elSwitch) {
                elSwitch.style.display = "inline-flex";

                // Dependiendo de en qué página estamos, el botón lleva al otro lado
                const esPanel = window.location.pathname.includes("due");
                elSwitch.textContent = esPanel ? "🛒 Punto de venta" : "⚙ Panel admin";
                elSwitch.addEventListener("click", function () {
                    window.location.href = esPanel ? "empleado.html" : "dueño.html";
                });
            }
        }
    });

})();