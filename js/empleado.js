/* =====================================================
   EMPLEADO.JS — Punto de venta
   =====================================================
   Depende de (cargados antes en el HTML):
     - Supabase SDK
     - config.js   (db, TASA_IVA, NEGOCIO)
     - utils.js    (formatearPrecio, modales, etc.)
     - auth.js     (window.sesionActual)
   ===================================================== */

document.addEventListener("DOMContentLoaded", async function () {

    /* =====================================================
       ESTADO LOCAL
       Solo existe en memoria. La fuente de verdad es
       Supabase; el carrito se persiste solo al confirmar.
       ===================================================== */
    const estado = {
        productos:          [],
        categorias:         [],
        carrito:            [],
        metodoPago:         "efectivo",
        tipoTarjeta:        "debito",
        categoriaActiva:    "Todos",
        busqueda:           "",
        productoEnModal:    null,
        tamanoSeleccionado: null,
    };


    /* =====================================================
       CÓDIGO DE FACTURACIÓN
       Genera un código de 6 caracteres alfanuméricos
       único por venta. Se imprime en el ticket y el
       cliente lo necesita para autofacturar.
       ===================================================== */
    function generarCodigoFactura() {
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin 0,O,1,I para evitar confusión
        let codigo = "";
        for (let i = 0; i < 6; i++) {
            codigo += chars[Math.floor(Math.random() * chars.length)];
        }
        return codigo;
    }

    /* =====================================================
       RELOJ DEL HEADER
       ===================================================== */
    function actualizarReloj() {
        const ahora = new Date();
        document.getElementById("header-hora").textContent =
            ahora.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        document.getElementById("header-fecha").textContent =
            ahora.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
    }
    actualizarReloj();
    setInterval(actualizarReloj, 1000);

    /* =====================================================
       DATOS DESDE SUPABASE
       ===================================================== */
    async function cargarDatos() {
        /* Cargamos categorías y productos en paralelo */
        const [resCats, resProd] = await Promise.all([
            db.from("categorias").select("*").order("nombre"),
            db.from("productos")
              .select("*, categoria:categorias(nombre), tamanos:producto_tamanos(*)")
              .order("nombre"),
        ]);
        estado.categorias = resCats.data  || [];
        estado.productos  = resProd.data  || [];
    }

    /* =====================================================
       CHIPS DE CATEGORÍA
       ===================================================== */
    function renderizarChips() {
        const contenedor = document.getElementById("chips-categorias");
        contenedor.innerHTML = "";

        ["Todos", ...estado.categorias.map(c => c.nombre)].forEach(function (cat) {
            const btn       = document.createElement("button");
            btn.className   = "chip" + (cat === estado.categoriaActiva ? " activo" : "");
            btn.textContent = cat;
            btn.addEventListener("click", function () {
                estado.categoriaActiva = cat;
                renderizarChips();
                renderizarProductos();
            });
            contenedor.appendChild(btn);
        });
    }

    /* =====================================================
       GRID DE PRODUCTOS
       ===================================================== */
    function renderizarProductos() {
        const grid = document.getElementById("productos-grid");
        grid.innerHTML = "";

        let filtrados = estado.productos;

        /* Filtrar por categoría */
        if (estado.categoriaActiva !== "Todos") {
            filtrados = filtrados.filter(p => p.categoria?.nombre === estado.categoriaActiva);
        }

        /* Filtrar por búsqueda (ignora acentos y mayúsculas) */
        if (estado.busqueda) {
            const q = normalizarTexto(estado.busqueda);
            filtrados = filtrados.filter(p => normalizarTexto(p.nombre).includes(q));
        }

        if (filtrados.length === 0) {
            grid.innerHTML = '<div class="sin-resultados">Sin productos que coincidan</div>';
            return;
        }

        filtrados.forEach(function (prod) {
            const totalEnCarrito = estado.carrito
                .filter(i => i.productoId === prod.id)
                .reduce((s, i) => s + i.cantidad, 0);

            const tieneTamanos = prod.tamanos?.length > 0;

            /* Precio: rango si tiene tamaños, precio fijo si no */
            let precioTexto;
            if (tieneTamanos) {
                const precios = prod.tamanos.map(t => t.precio);
                const min = Math.min(...precios);
                const max = Math.max(...precios);
                precioTexto = min === max
                    ? formatearPrecio(min)
                    : `${formatearPrecio(min)} – ${formatearPrecio(max)}`;
            } else {
                precioTexto = formatearPrecio(prod.precio);
            }

            const card = document.createElement("div");
            card.className = "producto-card";
            card.innerHTML = `
                <div class="producto-card-categoria">${prod.categoria?.nombre || "General"}</div>
                <div class="producto-card-nombre">${prod.nombre}</div>
                ${tieneTamanos ? `<div class="producto-card-tamanos">⊕ ${prod.tamanos.length} tamaños</div>` : ""}
                <div class="producto-card-precio">${precioTexto}</div>
                ${totalEnCarrito > 0 ? `<div class="producto-badge">${totalEnCarrito}</div>` : ""}
            `;
            card.addEventListener("click", () => abrirModalProducto(prod));
            grid.appendChild(card);
        });
    }

    /* =====================================================
       MODALES DE PRODUCTO
       Si tiene tamaños → pide seleccionar tamaño y nota
       Si no tiene tamaños → pide solo nota (opcional)
       ===================================================== */
    function abrirModalProducto(prod) {
        estado.productoEnModal    = prod;
        estado.tamanoSeleccionado = null;

        if (prod.tamanos?.length > 0) {
            document.getElementById("mtam-categoria").textContent = prod.categoria?.nombre || "General";
            document.getElementById("mtam-nombre").textContent    = prod.nombre;
            document.getElementById("comentario-producto").value  = "";

            const contenedor = document.getElementById("tamanos-opciones");
            contenedor.innerHTML = "";

            prod.tamanos.forEach(function (t) {
                const div = document.createElement("div");
                div.className = "opcion-tamano";
                div.innerHTML = `
                    <span class="opcion-tamano-nombre">${t.nombre}</span>
                    <span class="opcion-tamano-precio">${formatearPrecio(t.precio)}</span>
                `;
                div.addEventListener("click", function () {
                    contenedor.querySelectorAll(".opcion-tamano")
                        .forEach(o => o.classList.remove("seleccionado"));
                    this.classList.add("seleccionado");
                    estado.tamanoSeleccionado = t;
                    document.getElementById("btn-confirmar-tamano").disabled = false;
                });
                contenedor.appendChild(div);
            });

            document.getElementById("btn-confirmar-tamano").disabled = true;
            abrirModal("modal-tamano");

        } else {
            document.getElementById("mcom-categoria").textContent       = prod.categoria?.nombre || "General";
            document.getElementById("mcom-nombre").textContent          = prod.nombre;
            document.getElementById("mcom-precio").textContent          = formatearPrecio(prod.precio);
            document.getElementById("comentario-producto-simple").value = "";
            abrirModal("modal-comentario-simple");
        }
    }

    /* Confirmar tamaño seleccionado */
    document.getElementById("btn-confirmar-tamano").addEventListener("click", function () {
        if (!estado.tamanoSeleccionado) return;
        const comentario = document.getElementById("comentario-producto").value.trim();
        agregarAlCarrito(estado.productoEnModal, estado.tamanoSeleccionado.nombre, estado.tamanoSeleccionado.precio, comentario);
        cerrarModal("modal-tamano");
    });

    /* Confirmar producto sin tamaño */
    document.getElementById("btn-confirmar-comentario-simple").addEventListener("click", function () {
        const comentario = document.getElementById("comentario-producto-simple").value.trim();
        agregarAlCarrito(estado.productoEnModal, null, estado.productoEnModal.precio, comentario);
        cerrarModal("modal-comentario-simple");
    });

    document.getElementById("btn-cerrar-modal-tamano").addEventListener("click", () => cerrarModal("modal-tamano"));
    document.getElementById("btn-cerrar-modal-comentario").addEventListener("click", () => cerrarModal("modal-comentario-simple"));

    /* =====================================================
       CARRITO
       Solo existe en memoria. Se persiste en Supabase
       únicamente al confirmar la venta.
       ===================================================== */
    function agregarAlCarrito(prod, tamano, precio, comentario) {
        /* Si ya existe la misma combinación, solo sumamos cantidad */
        const existente = estado.carrito.find(i =>
            i.productoId === prod.id &&
            i.tamano     === tamano  &&
            i.comentario === comentario
        );

        if (existente) {
            existente.cantidad++;
        } else {
            estado.carrito.push({
                carritoId:  Date.now() + Math.random(),
                productoId: prod.id,
                nombre:     prod.nombre,
                precio,
                cantidad:   1,
                tamano,
                comentario,
            });
        }

        renderizarOrden();
        renderizarProductos();
    }

    function cambiarCantidad(carritoId, delta) {
        const idx = estado.carrito.findIndex(i => i.carritoId === carritoId);
        if (idx === -1) return;
        estado.carrito[idx].cantidad += delta;
        if (estado.carrito[idx].cantidad <= 0) estado.carrito.splice(idx, 1);
        renderizarOrden();
        renderizarProductos();
    }

    /* =====================================================
       RENDERIZAR ORDEN
       ===================================================== */
    const btnConfirmar = document.getElementById("btn-confirmar");

    function renderizarOrden() {
        const contenedor = document.getElementById("orden-items");
        contenedor.innerHTML = "";

        if (estado.carrito.length === 0) {
            contenedor.innerHTML = `
                <div class="orden-vacia" id="orden-vacia">
                    <span class="orden-vacia-icono">&#9723;</span>
                    <p>Agrega productos desde el catálogo</p>
                </div>`;
            actualizarTotales(0);
            btnConfirmar.disabled = true;
            return;
        }

        btnConfirmar.disabled = false;
        let total = 0;

        estado.carrito.forEach(function (item) {
            const subtotal = item.precio * item.cantidad;
            total += subtotal;

            const div = document.createElement("div");
            div.className = "orden-item";

            const detallePartes = [];
            if (item.tamano) detallePartes.push(`<span class="orden-item-tamano">${item.tamano}</span>`);
            detallePartes.push(`<span>${formatearPrecio(item.precio)} c/u</span>`);

            const comentarioHTML = item.comentario
                ? `<div class="orden-item-comentario">💬 ${item.comentario}</div>`
                : "";

            div.innerHTML = `
                <div class="orden-item-fila-principal">
                    <div class="orden-item-info">
                        <div class="orden-item-nombre">${item.nombre}</div>
                        <div class="orden-item-detalle">${detallePartes.join("")}</div>
                    </div>
                    <div class="orden-item-controles">
                        <button class="btn-cantidad btn-menos" data-cid="${item.carritoId}">−</button>
                        <span class="cantidad-num">${item.cantidad}</span>
                        <button class="btn-cantidad btn-mas"  data-cid="${item.carritoId}">+</button>
                    </div>
                    <div class="orden-item-subtotal">${formatearPrecio(subtotal)}</div>
                </div>
                ${comentarioHTML}
            `;
            contenedor.appendChild(div);
        });

        /* Delegación de eventos para botones +/- */
        contenedor.querySelectorAll(".btn-menos").forEach(btn =>
            btn.addEventListener("click", function () { cambiarCantidad(Number(this.dataset.cid), -1); })
        );
        contenedor.querySelectorAll(".btn-mas").forEach(btn =>
            btn.addEventListener("click", function () { cambiarCantidad(Number(this.dataset.cid), +1); })
        );

        actualizarTotales(total);
        calcularCambio();
    }

    function actualizarTotales(total) {
        document.getElementById("subtotal").textContent    = formatearPrecio(total);
        document.getElementById("total-orden").textContent = formatearPrecio(total);
    }

    function obtenerTotal() {
        return estado.carrito.reduce((s, i) => s + i.precio * i.cantidad, 0);
    }

    /* =====================================================
       MÉTODO DE PAGO
       ===================================================== */
    document.querySelectorAll(".btn-metodo").forEach(function (btn) {
        btn.addEventListener("click", function () {
            estado.metodoPago = this.dataset.metodo;
            document.querySelectorAll(".btn-metodo").forEach(b => b.classList.remove("activo"));
            this.classList.add("activo");
            const esTarjeta = estado.metodoPago === "tarjeta";
            document.getElementById("tipo-tarjeta-seccion").style.display = esTarjeta  ? "block" : "none";
            document.getElementById("efectivo-seccion").style.display     = !esTarjeta ? "block" : "none";
            if (!esTarjeta) calcularCambio();
        });
    });

    document.querySelectorAll(".btn-tipo").forEach(function (btn) {
        btn.addEventListener("click", function () {
            estado.tipoTarjeta = this.dataset.tipo;
            document.querySelectorAll(".btn-tipo").forEach(b => b.classList.remove("activo"));
            this.classList.add("activo");
        });
    });

    /* =====================================================
       CÁLCULO DE CAMBIO EN TIEMPO REAL
       ===================================================== */
    const inputRecibido = document.getElementById("monto-recibido");
    const elCambio      = document.getElementById("cambio-valor");

    function calcularCambio() {
        const total    = obtenerTotal();
        const recibido = parseFloat(inputRecibido.value) || 0;

        if (recibido === 0 || total === 0) {
            elCambio.textContent = "—";
            elCambio.className   = "cambio-valor";
            return;
        }

        const cambio = recibido - total;
        elCambio.textContent = cambio < 0
            ? "Falta " + formatearPrecio(Math.abs(cambio))
            : formatearPrecio(cambio);
        elCambio.className = "cambio-valor" + (cambio < 0 ? " negativo" : "");
    }

    inputRecibido.addEventListener("input", calcularCambio);

    /* =====================================================
       LIMPIAR ORDEN
       ===================================================== */
    document.getElementById("btn-limpiar-orden").addEventListener("click", function () {
        if (estado.carrito.length === 0) return;
        if (!confirm("¿Limpiar la orden actual?")) return;
        limpiarOrden();
    });

    function limpiarOrden() {
        estado.carrito = [];
        inputRecibido.value = "";
        document.getElementById("comentario-orden").value = "";
        elCambio.textContent = "—";
        elCambio.className   = "cambio-valor";
        renderizarOrden();
        renderizarProductos();
    }

    /* =====================================================
       CONFIRMAR VENTA
       Flujo:
         1. Crear fila en "ventas" (el ticket)
         2. Crear filas en "venta_items" (uno por producto)
         3. Descontar stock de cada producto
         4. Mostrar ticket y limpiar la orden
       ===================================================== */
    btnConfirmar.addEventListener("click", async function () {
        const total    = obtenerTotal();
        const recibido = parseFloat(inputRecibido.value) || 0;

        if (estado.metodoPago === "efectivo" && recibido > 0 && recibido < total) {
            alert("El monto recibido no cubre el total de la venta.");
            inputRecibido.focus();
            return;
        }

        const cambio          = (estado.metodoPago === "efectivo" && recibido > 0) ? recibido - total : 0;
        const comentarioOrden = document.getElementById("comentario-orden").value.trim();

        this.disabled    = true;
        this.textContent = "Guardando...";

        /* ── Paso 1: Crear la venta principal ── */
        const { data: ventaNueva, error: errorVenta } = await db
            .from("ventas")
            .insert({
                fecha:            obtenerFechaHoy(),
                hora:             obtenerHoraAhora() + ":00",
                metodo_pago:      estado.metodoPago,
                tipo_tarjeta:     estado.metodoPago === "tarjeta" ? estado.tipoTarjeta : null,
                total,
                recibido,
                cambio,
                comentario_orden: comentarioOrden || null,
                codigo_factura:   generarCodigoFactura(),
                facturado:        false,
            })
            .select()
            .single();

        if (errorVenta) {
            alert("Error al registrar la venta. Intenta de nuevo.");
            this.disabled    = false;
            this.textContent = "Confirmar venta";
            return;
        }

        /* ── Paso 2: Crear los items ── */
        const items = estado.carrito.map(i => ({
            venta_id:        ventaNueva.id,
            producto_id:     i.productoId,
            nombre_producto: i.nombre,
            precio:          i.precio,
            cantidad:        i.cantidad,
            tamano:          i.tamano    || null,
            comentario:      i.comentario || null,
        }));

        const { error: errorItems } = await db.from("venta_items").insert(items);

        if (errorItems) {
            alert("Error al guardar los productos de la venta.");
            this.disabled    = false;
            this.textContent = "Confirmar venta";
            return;
        }

        /* ── Paso 3: Descontar stock en paralelo ── */
        await Promise.all(
            estado.carrito.map(function (item) {
                const prod = estado.productos.find(p => p.id === item.productoId);
                if (!prod) return Promise.resolve();
                const nuevoStock = Math.max(0, (prod.stock || 0) - item.cantidad);
                return db.from("productos").update({ stock: nuevoStock }).eq("id", item.productoId);
            })
        );

        /* ── Paso 4: Mostrar ticket y limpiar ── */
        mostrarTicket(ventaNueva, estado.carrito, comentarioOrden);
        limpiarOrden();
        this.textContent = "Confirmar venta";

        await cargarDatos();
        renderizarProductos();
    });

    /* =====================================================
       TICKET DE CONFIRMACIÓN
       ===================================================== */
    function mostrarTicket(venta, items, comentarioOrden) {
        const { subtotal, iva } = calcularIVA(venta.total);

        document.getElementById("ticket-numero").textContent = generarNumeroTicket(venta.id);
        document.getElementById("ticket-fecha").textContent  = venta.fecha;
        document.getElementById("ticket-hora").textContent   = venta.hora;

        /* Items */
        const itemsEl = document.getElementById("ticket-items");
        itemsEl.innerHTML = "";
        items.forEach(function (item) {
            const div  = document.createElement("div");
            div.className = "ticket-item-fila";
            const nombre = item.tamano ? `${item.nombre} (${item.tamano})` : item.nombre;
            div.innerHTML =
                `<div class="ticket-item-principal">
                    <span>${nombre}</span>
                    <span>${item.cantidad}</span>
                    <span>${formatearPrecio(item.precio)}</span>
                    <span>${formatearPrecio(item.precio * item.cantidad)}</span>
                </div>` +
                (item.comentario ? `<div class="ticket-item-nota">* ${item.comentario}</div>` : "");
            itemsEl.appendChild(div);
        });

        /* Nota de la orden */
        const notaOrdenEl = document.getElementById("ticket-nota-orden");
        if (comentarioOrden) {
            notaOrdenEl.style.display = "flex";
            document.getElementById("ticket-nota-texto").textContent = comentarioOrden;
        } else {
            notaOrdenEl.style.display = "none";
        }

        /* Totales */
        document.getElementById("ticket-subtotal").textContent = formatearPrecio(subtotal);
        document.getElementById("ticket-iva").textContent      = formatearPrecio(iva);
        document.getElementById("ticket-total").textContent    = formatearPrecio(venta.total);

        /* Método de pago */
        document.getElementById("ticket-metodo").textContent =
            textoMetodoPago(venta.metodo_pago, venta.tipo_tarjeta);

        /* Efectivo y cambio */
        const mostrarEfectivo = venta.metodo_pago === "efectivo" && venta.recibido > 0;
        document.getElementById("ticket-fila-recibido").style.display = mostrarEfectivo ? "flex" : "none";
        document.getElementById("ticket-fila-cambio").style.display   = mostrarEfectivo ? "flex" : "none";
        if (mostrarEfectivo) {
            document.getElementById("ticket-recibido").textContent = formatearPrecio(venta.recibido);
            document.getElementById("ticket-cambio").textContent   = formatearPrecio(venta.cambio);
        }

        /* QR + código de autofacturación */
const urlFactura = `${SITIO_URL}/pages/factura.html?ticket=${generarNumeroTicket(venta.id)}`;
        const qrEl       = document.getElementById("ticket-qr");
        const codigoEl   = document.getElementById("ticket-codigo-factura");
        if (qrEl) {
            qrEl.innerHTML = "";
            new QRCode(qrEl, {
                text:          urlFactura,
                width:         96,
                height:        96,
                colorDark:     "#000000",
                colorLight:    "#ffffff",
                correctLevel:  QRCode.CorrectLevel.M,
            });
        }
        if (codigoEl) codigoEl.textContent = venta.codigo_factura || "——";

        abrirModal("modal-confirmacion");
    }

    document.getElementById("btn-imprimir").addEventListener("click", () => window.print());
    document.getElementById("btn-listo").addEventListener("click", () => cerrarModal("modal-confirmacion"));

    /* =====================================================
       BUSCADOR
       ===================================================== */
    const inputBuscador = document.getElementById("buscador");
    const btnClear      = document.getElementById("buscador-clear");

    inputBuscador.addEventListener("input", function () {
        estado.busqueda        = this.value.trim();
        btnClear.style.display = estado.busqueda ? "block" : "none";
        renderizarProductos();
    });

    btnClear.addEventListener("click", function () {
        inputBuscador.value = "";
        estado.busqueda     = "";
        this.style.display  = "none";
        renderizarProductos();
        inputBuscador.focus();
    });

    /* =====================================================
       MODALES — inicializar cierre
       El modal de confirmación NO se cierra al clickear fuera
       ===================================================== */
    inicializarCierreModales(["modal-confirmacion"]);

    /* =====================================================
       ARRANQUE
       ===================================================== */
    await cargarDatos();
    renderizarChips();
    renderizarProductos();
    btnConfirmar.disabled = true;
});