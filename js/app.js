/* =====================================================
   APP.JS — Lógica del formulario de login
   =====================================================
   Depende de: config.js (db), utils.js (no usa nada aún)
   Se carga al final de index.html.
   ===================================================== */

document.addEventListener("DOMContentLoaded", function () {

    /* ── Referencias al DOM ── */
    const form           = document.getElementById("loginForm");
    const inputUsuario   = document.getElementById("usuario");
    const inputPassword  = document.getElementById("password");
    const togglePassword = document.getElementById("togglePassword");
    const btnSubmit      = document.getElementById("btnSubmit");
    const errorUsuario   = document.getElementById("error-usuario");
    const errorPassword  = document.getElementById("error-password");
    const errorGeneral   = document.getElementById("error-general");

    /* =====================================================
       REDIRECCIÓN SEGÚN ROL
       dueño / gerente → panel de administración
       empleado        → punto de venta
       ===================================================== */
    function redirigirSegunRol(rol) {
        window.location.href = (rol === "dueño" || rol === "gerente")
            ? "../pages/dueño.html"
            : "../pages/empleado.html";
    }

    /* =====================================================
       MANEJO DE ERRORES EN CAMPOS
       ===================================================== */
    function mostrarError(el, msg) {
        el.textContent = msg;
    }

    function limpiarError(elError, input) {
        elError.textContent = "";
        input?.closest(".campo-grupo")?.classList.remove("tiene-error");
    }

    function validarCampos(usuario, password) {
        let valido = true;
        if (!usuario) {
            mostrarError(errorUsuario, "El campo usuario es obligatorio");
            inputUsuario.closest(".campo-grupo").classList.add("tiene-error");
            valido = false;
        }
        if (!password) {
            mostrarError(errorPassword, "El campo contraseña es obligatorio");
            inputPassword.closest(".campo-grupo").classList.add("tiene-error");
            valido = false;
        }
        return valido;
    }

    /* =====================================================
       LOGIN PRINCIPAL
       Consulta la tabla "usuarios" en Supabase.
       Si las credenciales coinciden, guarda la sesión en
       sessionStorage y redirige según el rol.

       ⚠️  Las contraseñas se guardan en texto plano.
           Para producción, migrar a Supabase Auth.
           Ver instrucciones en config.js.
       ===================================================== */
    async function intentarLogin(usuario, password) {
        btnSubmit.classList.add("cargando");

        /* Pequeña pausa visual para no parecer instantáneo */
        await new Promise(r => setTimeout(r, 500));

        const { data, error } = await db
            .from("usuarios")
            .select("id, nombre, usuario, rol")
            .eq("usuario",  usuario)
            .eq("password", password)
            .maybeSingle();

        btnSubmit.classList.remove("cargando");

        if (error || !data) {
            mostrarError(errorGeneral, "Usuario o contraseña incorrectos");
            inputPassword.value = "";
            inputPassword.focus();
            form.classList.add("shake");
            setTimeout(() => form.classList.remove("shake"), 500);
            return;
        }

        /* ✅ Login correcto: guardar sesión y redirigir */
        sessionStorage.setItem("sesion", JSON.stringify({
            id:      data.id,
            nombre:  data.nombre,
            usuario: data.usuario,
            rol:     data.rol,
        }));

        redirigirSegunRol(data.rol);
    }

    /* =====================================================
       EVENTOS
       ===================================================== */
    form.addEventListener("submit", async function (e) {
        e.preventDefault();
        limpiarError(errorUsuario, inputUsuario);
        limpiarError(errorPassword, inputPassword);
        errorGeneral.textContent = "";

        const usuario  = inputUsuario.value.trim().toLowerCase();
        const password = inputPassword.value;

        if (!validarCampos(usuario, password)) return;
        await intentarLogin(usuario, password);
    });

    /* Mostrar / ocultar contraseña */
    togglePassword.addEventListener("click", function () {
        const esPassword = inputPassword.type === "password";
        inputPassword.type     = esPassword ? "text" : "password";
        this.textContent       = esPassword ? "🙈" : "👁";
        this.setAttribute("aria-label", esPassword ? "Ocultar contraseña" : "Mostrar contraseña");
    });

    /* Limpiar errores al escribir */
    inputUsuario.addEventListener("input", function () {
        limpiarError(errorUsuario, inputUsuario);
        errorGeneral.textContent = "";
    });
    inputPassword.addEventListener("input", function () {
        limpiarError(errorPassword, inputPassword);
        errorGeneral.textContent = "";
    });
});