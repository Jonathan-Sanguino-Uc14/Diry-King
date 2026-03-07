/* =====================================================
   FACTURA.JS — Autofacturación pública
   =====================================================
   Página pública: no requiere login.
   Flujo:
     1. Cliente ingresa número de ticket + código
     2. Se busca la venta en Supabase y se valida el código
     3. Se muestran los datos de la compra
     4. Cliente llena RFC, nombre, uso de CFDI
     5. Se genera el PDF con jsPDF
     6. Se marca la venta como facturada en Supabase
   ===================================================== */

(async function () {

    /* ── Estado ── */
    const estado = {
        venta:       null,   // objeto venta de Supabase
        items:       [],     // venta_items de esa venta
        pdfBlob:     null,   // PDF generado, para re-descarga
    };

    /* ── Referencias DOM ── */
    const secBuscar      = document.getElementById("seccion-buscar");
    const secDatos       = document.getElementById("seccion-datos");
    const secExito       = document.getElementById("seccion-exito");
    const secYaFacturado = document.getElementById("seccion-ya-facturado");

    const inputTicket  = document.getElementById("input-ticket");
    const inputCodigo  = document.getElementById("input-codigo");
    const errorBusqueda = document.getElementById("error-busqueda");

    const inputNombre  = document.getElementById("input-nombre");
    const inputRFC     = document.getElementById("input-rfc");
    const selectCFDI   = document.getElementById("select-cfdi");
    const errorDatos   = document.getElementById("error-datos");

    const btnBuscar    = document.getElementById("btn-buscar");
    const btnGenerar   = document.getElementById("btn-generar");
    const btnVolver    = document.getElementById("btn-volver");
    const btnDescargar = document.getElementById("btn-descargar-nuevo");

    /* ── Llenar select de CFDI desde config.js ── */
    USOS_CFDI.forEach(function (uso) {
        const op       = document.createElement("option");
        op.value       = uso.clave;
        op.textContent = `${uso.clave} — ${uso.descripcion}`;
        selectCFDI.appendChild(op);
    });

    /* ── Leer número de ticket de la URL si viene por QR ──
       Ej: factura.html?ticket=0042
    ── */
    const params = new URLSearchParams(window.location.search);
    const ticketUrl = params.get("ticket");
    if (ticketUrl) {
        inputTicket.value = ticketUrl;
        inputCodigo.focus();
    }

    /* =====================================================
       PASO 1 — BUSCAR TICKET
       ===================================================== */
    btnBuscar.addEventListener("click", async function () {
        errorBusqueda.textContent = "";

        const numTicket = inputTicket.value.trim();
        const codigo    = inputCodigo.value.trim().toUpperCase();

        if (!numTicket || !codigo) {
            errorBusqueda.textContent = "Ingresa el número de ticket y el código de verificación.";
            return;
        }

        btnBuscar.classList.add("cargando");

        /* Buscamos la venta. El número de ticket son los últimos 4 dígitos del ID,
           así que buscamos ventas cuyo id termina en ese número.
           Para mayor precisión buscamos por id directo si es numérico. */
        const idNum = parseInt(numTicket, 10);

        let query = db.from("ventas")
            .select("*, items:venta_items(*)")
            .eq("codigo_factura", codigo);

        /* Si el ticket es un número puro buscamos por id, si no por los últimos dígitos */
        if (!isNaN(idNum)) {
            query = query.eq("id", idNum);
        }

        const { data: ventas, error } = await query;
        btnBuscar.classList.remove("cargando");

        if (error || !ventas || ventas.length === 0) {
            mostrarError(errorBusqueda, "No encontramos ningún ticket con esos datos. Verifica el número y el código.");
            return;
        }

        const venta = ventas[0];

        /* ── Validar que el código coincida exactamente ── */
        if (!venta.codigo_factura || venta.codigo_factura.toUpperCase() !== codigo) {
            mostrarError(errorBusqueda, "El código de verificación no es correcto.");
            return;
        }

        /* ── Ya fue facturado ── */
        if (venta.facturado) {
            mostrarSeccion(secYaFacturado);
            return;
        }

        /* ── Guardamos y mostramos resumen ── */
        estado.venta = venta;
        estado.items = venta.items || [];
        mostrarResumenVenta(venta, estado.items);
        mostrarSeccion(secDatos);
    });

    /* =====================================================
       RESUMEN DE VENTA
       ===================================================== */
    function mostrarResumenVenta(venta, items) {
        const { subtotal, iva } = calcularIVA(venta.total);
        const numTicket         = generarNumeroTicket(venta.id);

        const html = `
            <div class="resumen-header">
                <span class="resumen-ticket">Ticket #${numTicket}</span>
                <span class="resumen-fecha">${formatearFecha(venta.fecha, { day:"numeric", month:"long", year:"numeric" })}</span>
            </div>
            <div class="resumen-items">
                ${items.map(i => `
                    <div class="resumen-item">
                        <span class="resumen-item-nombre">
                            ${i.nombre_producto}${i.tamano ? ` <em>(${i.tamano})</em>` : ""}
                            ${i.comentario ? `<br><small>* ${i.comentario}</small>` : ""}
                        </span>
                        <span class="resumen-item-cant">×${i.cantidad}</span>
                        <span class="resumen-item-precio">${formatearPrecio(i.precio * i.cantidad)}</span>
                    </div>
                `).join("")}
            </div>
            <div class="resumen-totales">
                <div class="resumen-fila"><span>Subtotal</span><span>${formatearPrecio(subtotal)}</span></div>
                <div class="resumen-fila"><span>IVA (16%)</span><span>${formatearPrecio(iva)}</span></div>
                <div class="resumen-fila resumen-total"><span>Total</span><span>${formatearPrecio(venta.total)}</span></div>
                <div class="resumen-fila resumen-metodo">
                    <span>Forma de pago</span>
                    <span>${textoMetodoPago(venta.metodo_pago, venta.tipo_tarjeta)}</span>
                </div>
            </div>
        `;
        document.getElementById("resumen-venta").innerHTML = html;
    }

    /* =====================================================
       PASO 2 — GENERAR FACTURA PDF
       ===================================================== */
    btnGenerar.addEventListener("click", async function () {
        errorDatos.textContent = "";

        const nombre = inputNombre.value.trim();
        const rfc    = inputRFC.value.trim().toUpperCase();
        const cfdi   = selectCFDI.value;

        /* Validaciones */
        if (!nombre) {
            errorDatos.textContent = "El nombre o razón social es obligatorio.";
            inputNombre.focus();
            return;
        }
        if (!rfc || (rfc.length !== 12 && rfc.length !== 13)) {
            errorDatos.textContent = "El RFC debe tener 12 caracteres (moral) o 13 (física).";
            inputRFC.focus();
            return;
        }
        if (!cfdi) {
            errorDatos.textContent = "Selecciona el uso de CFDI.";
            return;
        }

        btnGenerar.classList.add("cargando");

        /* Generar PDF */
        const pdfBytes = generarPDFFactura({
            venta:  estado.venta,
            items:  estado.items,
            nombre,
            rfc,
            cfdi,
            usoCFDI: USOS_CFDI.find(u => u.clave === cfdi)?.descripcion || cfdi,
        });

        /* Guardar datos en Supabase y marcar como facturado */
        await db.from("ventas").update({
            facturado:     true,
            datos_factura: { nombre, rfc, cfdi },
        }).eq("id", estado.venta.id);

        btnGenerar.classList.remove("cargando");

        /* Guardar referencia al PDF para re-descarga */
        estado.pdfBlob = pdfBytes;

        /* Descarga automática */
        descargarPDF(pdfBytes, `factura_${generarNumeroTicket(estado.venta.id)}.pdf`);

        mostrarSeccion(secExito);
    });

    /* Re-descargar */
    btnDescargar.addEventListener("click", function () {
        if (estado.pdfBlob) {
            descargarPDF(estado.pdfBlob, `factura_${generarNumeroTicket(estado.venta.id)}.pdf`);
        }
    });

    /* Volver al paso 1 */
    btnVolver.addEventListener("click", function () {
        errorDatos.textContent = "";
        mostrarSeccion(secBuscar);
    });

    /* =====================================================
       GENERACIÓN DEL PDF CON jsPDF
       ===================================================== */
    function generarPDFFactura({ venta, items, nombre, rfc, cfdi, usoCFDI }) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ unit: "mm", format: "a4" });

        const { subtotal, iva } = calcularIVA(venta.total);
        const numTicket         = generarNumeroTicket(venta.id);
        const fechaEmision      = new Date().toLocaleDateString("es-MX", {
            day: "numeric", month: "long", year: "numeric"
        });

        const margen  = 20;
        const ancho   = 210 - margen * 2;
        let   y       = margen;

        /* ── Colores ── */
        const NEGRO      = [15,  15,  15];
        const GRIS       = [120, 120, 120];
        const GRIS_CLARO = [240, 240, 240];
        const ACENTO     = [30,  120, 60];   /* verde */

        /* ── ENCABEZADO ── */
        doc.setFillColor(...ACENTO);
        doc.rect(0, 0, 210, 28, "F");

        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.setTextColor(255, 255, 255);
        doc.text(NEGOCIO.nombre, margen, 12);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.text(`${NEGOCIO.razonSocial}  ·  RFC: ${NEGOCIO.rfc}`, margen, 19);
        doc.text(`${NEGOCIO.direccion}  ·  Tel: ${NEGOCIO.telefono}`, margen, 24);

        y = 36;

        /* ── TÍTULO FACTURA ── */
        doc.setFont("helvetica", "bold");
        doc.setFontSize(20);
        doc.setTextColor(...NEGRO);
        doc.text("FACTURA", margen, y);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(...GRIS);
        doc.text(`Ticket #${numTicket}`, 210 - margen, y - 5, { align: "right" });
        doc.text(`Fecha de emisión: ${fechaEmision}`, 210 - margen, y, { align: "right" });
        doc.text(`Fecha de compra: ${formatearFecha(venta.fecha, {day:"numeric",month:"long",year:"numeric"})}`, 210 - margen, y + 5, { align: "right" });

        y += 14;

        /* ── DATOS DEL EMISOR / RECEPTOR ── */
        const colW = (ancho - 8) / 2;

        /* Emisor */
        doc.setFillColor(...GRIS_CLARO);
        doc.roundedRect(margen, y, colW, 36, 2, 2, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(...GRIS);
        doc.text("EMISOR", margen + 4, y + 6);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(...NEGRO);
        doc.text(NEGOCIO.razonSocial, margen + 4, y + 13);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...GRIS);
        doc.text(`RFC: ${NEGOCIO.rfc}`, margen + 4, y + 20);
        doc.text(NEGOCIO.direccion, margen + 4, y + 26, { maxWidth: colW - 8 });

        /* Receptor */
        const rx = margen + colW + 8;
        doc.setFillColor(...GRIS_CLARO);
        doc.roundedRect(rx, y, colW, 36, 2, 2, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(...GRIS);
        doc.text("RECEPTOR", rx + 4, y + 6);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(...NEGRO);
        doc.text(nombre, rx + 4, y + 13, { maxWidth: colW - 8 });
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...GRIS);
        doc.text(`RFC: ${rfc}`, rx + 4, y + 20);
        doc.text(`Uso CFDI: ${cfdi} — ${usoCFDI}`, rx + 4, y + 26, { maxWidth: colW - 8 });

        y += 44;

        /* ── TABLA DE CONCEPTOS ── */
        /* Header */
        doc.setFillColor(...ACENTO);
        doc.rect(margen, y, ancho, 7, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(255, 255, 255);
        doc.text("Descripción",                  margen + 3,       y + 5);
        doc.text("Cant.",   margen + ancho * 0.60, y + 5, { align: "center" });
        doc.text("P.U.",    margen + ancho * 0.73, y + 5, { align: "center" });
        doc.text("Importe", margen + ancho - 3,    y + 5, { align: "right" });
        y += 7;

        /* Filas */
        items.forEach(function (item, idx) {
            const alt  = idx % 2 === 0;
            const hFila = 8;
            if (alt) {
                doc.setFillColor(248, 252, 248);
                doc.rect(margen, y, ancho, hFila, "F");
            }
            const nombreItem = item.tamano
                ? `${item.nombre_producto} (${item.tamano})`
                : item.nombre_producto;

            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            doc.setTextColor(...NEGRO);
            doc.text(nombreItem, margen + 3, y + 5.5, { maxWidth: ancho * 0.55 });

            doc.text(String(item.cantidad),              margen + ancho * 0.60, y + 5.5, { align: "center" });
            doc.text(formatearPrecio(item.precio),       margen + ancho * 0.73, y + 5.5, { align: "center" });
            doc.text(formatearPrecio(item.precio * item.cantidad), margen + ancho - 3, y + 5.5, { align: "right" });

            /* Nota del item */
            if (item.comentario) {
                y += hFila;
                doc.setFontSize(7);
                doc.setTextColor(...GRIS);
                doc.text(`  * ${item.comentario}`, margen + 3, y + 4);
            }
            y += hFila;
        });

        /* Línea de cierre de tabla */
        doc.setDrawColor(...ACENTO);
        doc.setLineWidth(0.5);
        doc.line(margen, y, margen + ancho, y);
        y += 6;

        /* ── TOTALES ── */
        const txW = 50;
        const tx  = margen + ancho - txW;

        function filaTotal(label, valor, negrita = false, color = NEGRO) {
            if (negrita) doc.setFont("helvetica", "bold");
            else         doc.setFont("helvetica", "normal");
            doc.setFontSize(9);
            doc.setTextColor(...GRIS);
            doc.text(label, tx, y);
            doc.setTextColor(...color);
            doc.text(formatearPrecio(valor), margen + ancho - 3, y, { align: "right" });
            y += 6;
        }

        filaTotal("Subtotal:",      subtotal);
        filaTotal("IVA (16%):",     iva);

        /* Línea antes del total */
        doc.setDrawColor(...ACENTO);
        doc.line(tx, y - 1, margen + ancho, y - 1);
        y += 2;

        filaTotal("TOTAL:", venta.total, true, ACENTO);
        y += 2;

        /* Método de pago */
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...GRIS);
        doc.text(`Forma de pago: ${textoMetodoPago(venta.metodo_pago, venta.tipo_tarjeta)}`, tx, y);
        y += 12;

        /* ── PIE ── */
        doc.setFillColor(...GRIS_CLARO);
        doc.rect(margen, y, ancho, 14, "F");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(...GRIS);
        doc.text("Este documento es una representación impresa de factura simplificada.", margen + ancho / 2, y + 5, { align: "center" });
        doc.text("IVA incluido en precios.  ·  Conserve este documento.", margen + ancho / 2, y + 10, { align: "center" });

        return doc.output("arraybuffer");
    }

    /* =====================================================
       DESCARGAR PDF
       ===================================================== */
    function descargarPDF(arrayBuffer, nombre) {
        const blob = new Blob([arrayBuffer], { type: "application/pdf" });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement("a");
        a.href     = url;
        a.download = nombre;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    }

    /* =====================================================
       HELPERS DE UI
       ===================================================== */
    function mostrarSeccion(el) {
        [secBuscar, secDatos, secExito, secYaFacturado].forEach(s => s.classList.add("oculto"));
        el.classList.remove("oculto");
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function mostrarError(el, msg) {
        el.textContent = msg;
    }

    /* Forzar uppercase en inputs */
    inputCodigo.addEventListener("input", function () {
        this.value = this.value.toUpperCase();
    });
    inputRFC.addEventListener("input", function () {
        this.value = this.value.toUpperCase();
    });

    /* Enter en campos → avanzar */
    inputCodigo.addEventListener("keydown", function (e) {
        if (e.key === "Enter") btnBuscar.click();
    });

})();