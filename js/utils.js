/* =====================================================
   UTILS.JS — Funciones de utilidad compartidas
   =====================================================
   Todas las funciones de este archivo son puras o
   trabajan con el DOM de forma genérica.
   No dependen de estado local de ninguna página.

   Se carga DESPUÉS de config.js y ANTES de los scripts
   de cada página (dueño.js, empleado.js, app.js).
   ===================================================== */

/* -----------------------------------------------------
   FORMATO DE PRECIO
   Devuelve un string con formato "$1,234.56" en es-MX.
   ----------------------------------------------------- */
function formatearPrecio(num) {
    return "$" + Number(num).toLocaleString("es-MX", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

/* -----------------------------------------------------
   FECHA Y HORA
   ----------------------------------------------------- */

/** Devuelve la fecha de hoy en formato "YYYY-MM-DD" */
function obtenerFechaHoy() {
    return new Date().toISOString().split("T")[0];
}

/** Devuelve la hora actual en formato "HH:MM" */
function obtenerHoraAhora() {
    return new Date().toLocaleTimeString("es-MX", {
        hour:   "2-digit",
        minute: "2-digit",
    });
}

/** Formatea una fecha "YYYY-MM-DD" a texto legible en español.
 *  Ej: "2024-03-15" → "vie., 15 de mar."
 *  @param {string} fechaStr
 *  @param {Intl.DateTimeFormatOptions} [opciones]
 */
function formatearFecha(fechaStr, opciones) {
    const defaults = { weekday: "short", day: "numeric", month: "short" };
    return new Date(fechaStr + "T12:00:00").toLocaleDateString("es-MX", opciones || defaults);
}

/* -----------------------------------------------------
   NORMALIZACIÓN DE TEXTO (para búsquedas)
   Elimina acentos y pasa a minúsculas.
   ----------------------------------------------------- */
function normalizarTexto(str) {
    return String(str)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

/* -----------------------------------------------------
   NÚMERO DE TICKET
   Formatea el ID de la venta como número de 4 dígitos.
   ----------------------------------------------------- */
function generarNumeroTicket(ventaId) {
    return String(ventaId).slice(-4).padStart(4, "0");
}

/* -----------------------------------------------------
   MÉTODO DE PAGO — texto legible
   ----------------------------------------------------- */
function textoMetodoPago(metodoPago, tipoTarjeta) {
    if (metodoPago === "efectivo") return "Efectivo";
    if (tipoTarjeta === "debito")  return "Tarjeta de débito";
    if (tipoTarjeta === "credito") return "Tarjeta de crédito";
    return "Tarjeta";
}

/* -----------------------------------------------------
   MODALES
   Todos los modales del sistema usan la clase "abierto"
   para mostrarse. Estas dos funciones son el contrato.
   ----------------------------------------------------- */
function abrirModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add("abierto");
}

function cerrarModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove("abierto");
}

/**
 * Registra el cierre de modales por click en el overlay
 * (clic fuera del contenido) y en botones con data-modal.
 * Se llama una sola vez al iniciar cada página.
 * @param {string[]} [excluirIds] - IDs de modales que NO se cierran al clickear fuera
 */
function inicializarCierreModales(excluirIds = []) {
    // Botones con atributo data-modal (el valor es el ID del modal a cerrar)
    document.querySelectorAll("[data-modal]").forEach(function (btn) {
        btn.addEventListener("click", function () {
            if (this.dataset.modal) cerrarModal(this.dataset.modal);
        });
    });

    // Click fuera del contenido del modal
    document.querySelectorAll(".modal-overlay").forEach(function (overlay) {
        overlay.addEventListener("click", function (e) {
            if (excluirIds.includes(overlay.id)) return;
            if (e.target === overlay) overlay.classList.remove("abierto");
        });
    });
}

/* -----------------------------------------------------
   IVA
   Calcula subtotal sin IVA y monto de IVA a partir
   del total con IVA incluido.
   ----------------------------------------------------- */
function calcularIVA(totalConIva) {
    const subtotal = totalConIva / (1 + TASA_IVA);
    const iva      = totalConIva - subtotal;
    return { subtotal, iva };
}