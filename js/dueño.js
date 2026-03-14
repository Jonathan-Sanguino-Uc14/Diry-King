/* =====================================================
   DUEÑO.JS — Panel de administración
   =====================================================
   Depende de (cargados antes en el HTML):
     - Supabase SDK
     - config.js   (db, TAMANOS_GLOBALES, TASA_IVA, NEGOCIO)
     - utils.js    (formatearPrecio, modales, fechas, etc.)
     - auth.js     (window.sesionActual)
   ===================================================== */

document.addEventListener("DOMContentLoaded", async function () {

    /* =====================================================
       ESTADO LOCAL
       ===================================================== */
    const estado = {
        productos:             [],
        categorias:            [],
        ventas:                [],
        entregas:              [],
        productoEditandoId:    null,
        tamanosTemporal:       [],
        categoriaFiltroActiva: "Todos",
        mesCalendario:         new Date().getMonth(),
        anioCalendario:        new Date().getFullYear(),
    };

    /* =====================================================
       HEADER — Fecha
       ===================================================== */
    document.getElementById("fecha-hoy").textContent = new Date().toLocaleDateString("es-MX", {
        weekday: "short", day: "numeric", month: "short", year: "numeric",
    });

    /* =====================================================
       DATOS DESDE SUPABASE
       ===================================================== */
    /* Turno activo del día */
    let turnoActivo = null;

    async function obtenerTurnoActivo() {
        const { data } = await db.from("turnos")
            .select("*")
            .eq("estado", "abierto")
            .order("fecha_apertura", { ascending: false })
            .limit(1)
            .maybeSingle();
        turnoActivo = data;
        return data;
    }

    async function cargarDatos() {
        /* Obtener turno activo */
        await obtenerTurnoActivo();

        /* Categorías, productos y entregas en paralelo */
        const [resCats, resProd, resEntregas] = await Promise.all([
            db.from("categorias").select("*").order("nombre"),
            db.from("productos")
              .select("*, categoria:categorias(nombre), tamanos:producto_tamanos(*)")
              .order("nombre"),
            db.from("entregas").select("*").order("fecha"),
        ]);

        estado.categorias = resCats.data    || [];
        estado.productos  = resProd.data    || [];
        estado.entregas   = resEntregas.data || [];

        /* Ventas del turno activo — si no hay turno, no hay ventas */
        if (turnoActivo) {
            const { data: ventasData } = await db
                .from("venta_items")
                .select("*, venta:ventas(*)")
                .eq("venta.fecha", turnoActivo.fecha_apertura)
                .order("id", { ascending: false });
            estado.ventas = (ventasData || []).filter(v => v.venta !== null);
        } else {
            estado.ventas = [];
        }
    }

    /* =====================================================
       NAVEGACIÓN ENTRE SECCIONES
       ===================================================== */
    const TITULOS_SECCIONES = {
        dashboard:  { h1: "Dashboard",  sub: "Resumen del día" },
        productos:  { h1: "Productos",  sub: "Gestión de inventario" },
        calendario: { h1: "Calendario", sub: "Entregas programadas" },
    };

    document.querySelectorAll(".nav-item").forEach(function (item) {
        item.addEventListener("click", function () {
            const sec = this.dataset.seccion;

            document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("activo"));
            this.classList.add("activo");

            document.querySelectorAll(".seccion").forEach(s => s.classList.remove("activa"));
            document.getElementById("seccion-" + sec).classList.add("activa");

            document.getElementById("titulo-seccion").textContent    = TITULOS_SECCIONES[sec].h1;
            document.getElementById("subtitulo-seccion").textContent = TITULOS_SECCIONES[sec].sub;

            if (sec === "calendario") renderizarCalendario();
        });
    });

    /* =====================================================
       DASHBOARD
       ===================================================== */
    function renderizarDashboard() {
        const ventas = estado.ventas;

        /* Subtítulo según estado del turno */
        const subEl = document.getElementById("subtitulo-seccion");
        if (subEl) {
            subEl.textContent = turnoActivo
                ? `Turno abierto desde ${turnoActivo.hora_apertura.slice(0,5)} · ${turnoActivo.fecha_apertura}`
                : "Sin turno activo — las ventas aparecerán cuando se abra un turno";
        }

        /* KPIs */
        const totalDia = ventas.reduce((s, v) => s + v.precio * v.cantidad, 0);
        document.getElementById("total-ventas-dia").textContent = formatearPrecio(totalDia);

        const ticketsUnicos = new Set(ventas.map(v => v.venta_id)).size;
        document.getElementById("cantidad-ventas").textContent = ticketsUnicos + " transacciones";

        document.getElementById("total-productos").textContent = estado.productos.length;

        /* Producto más vendido */
        const conteo = {};
        ventas.forEach(v => {
            conteo[v.nombre_producto] = (conteo[v.nombre_producto] || 0) + v.cantidad;
        });
        const top = Object.entries(conteo).sort((a, b) => b[1] - a[1])[0];
        document.getElementById("producto-top").textContent          = top ? top[0] : "—";
        document.getElementById("producto-top-cantidad").textContent = top ? top[1] + " unidades" : "Sin ventas hoy";

        /* Tabla de ventas del día */
        const tbody = document.getElementById("tabla-ventas-body");
        tbody.innerHTML = "";

        if (ventas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="tabla-vacia">Sin ventas registradas hoy</td></tr>';
            return;
        }

        ventas.forEach(function (item) {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${item.nombre_producto}</td>
                <td class="col-suave">${item.tamano || "—"}</td>
                <td>${item.cantidad}</td>
                <td>${formatearPrecio(item.precio)}</td>
                <td>${formatearPrecio(item.precio * item.cantidad)}</td>
                <td class="col-suave">${item.venta?.hora || "—"}</td>
                <td><button class="btn-ver-ticket" data-venta-id="${item.venta_id}">🧾 Ver</button></td>
                <td><button class="btn-eliminar btn-eliminar-venta" data-item-id="${item.id}" data-venta-id="${item.venta_id}">✕ Quitar</button></td>
            `;
            tbody.appendChild(tr);
        });

        tbody.querySelectorAll(".btn-eliminar-venta").forEach(function (btn) {
            btn.addEventListener("click", async function () {
                if (!confirm("¿Quitar este item del registro?")) return;
                const itemId  = Number(this.dataset.itemId);
                const ventaId = Number(this.dataset.ventaId);

                await db.from("venta_items").delete().eq("id", itemId);

                /* Si la venta quedó sin items, la eliminamos también */
                const { data: restantes } = await db.from("venta_items").select("id").eq("venta_id", ventaId);
                if (!restantes?.length) {
                    await db.from("ventas").delete().eq("id", ventaId);
                }

                await cargarDatos();
                renderizarDashboard();
            });
        });

        tbody.querySelectorAll(".btn-ver-ticket").forEach(function (btn) {
            btn.addEventListener("click", function () {
                abrirTicketDueno(Number(this.dataset.ventaId));
            });
        });
    }

    /* =====================================================
       REGISTRAR VENTA MANUAL
       ===================================================== */
    document.getElementById("btn-registrar-venta").addEventListener("click", function () {
        const select = document.getElementById("venta-producto");
        select.innerHTML = "";
        estado.productos.forEach(function (p) {
            const op       = document.createElement("option");
            op.value       = p.id;
            op.textContent = (p.tamanos?.length > 0)
                ? p.nombre
                : `${p.nombre} — ${formatearPrecio(p.precio)}`;
            select.appendChild(op);
        });
        actualizarSelectTamanoVenta();
        abrirModal("modal-venta");
    });

    document.getElementById("venta-producto").addEventListener("change", actualizarSelectTamanoVenta);

    function actualizarSelectTamanoVenta() {
        const idProd    = Number(document.getElementById("venta-producto").value);
        const prod      = estado.productos.find(p => p.id === idProd);
        const grupo     = document.getElementById("venta-tamano-grupo");
        const selectTam = document.getElementById("venta-tamano");

        if (prod?.tamanos?.length > 0) {
            grupo.style.display = "block";
            selectTam.innerHTML = "";
            prod.tamanos.forEach(function (t) {
                const op       = document.createElement("option");
                op.value       = t.nombre;
                op.textContent = `${t.nombre} — ${formatearPrecio(t.precio)}`;
                selectTam.appendChild(op);
            });
        } else {
            grupo.style.display = "none";
            selectTam.innerHTML = "";
        }
    }

    document.getElementById("form-venta").addEventListener("submit", async function (e) {
        e.preventDefault();
        const idProd   = Number(document.getElementById("venta-producto").value);
        const cantidad = Number(document.getElementById("venta-cantidad").value);
        const prod     = estado.productos.find(p => p.id === idProd);
        if (!prod || cantidad < 1) return;

        let precio = prod.precio;
        let tamano = null;

        if (prod.tamanos?.length > 0) {
            const nombreTam = document.getElementById("venta-tamano").value;
            const t         = prod.tamanos.find(t => t.nombre === nombreTam);
            if (t) { precio = t.precio; tamano = t.nombre; }
        }

        const { data: ventaNueva, error } = await db
            .from("ventas")
            .insert({
                fecha:       obtenerFechaHoy(),
                hora:        obtenerHoraAhora() + ":00",
                metodo_pago: "efectivo",
                total:       precio * cantidad,
            })
            .select()
            .single();

        if (error) { alert("Error al registrar la venta."); return; }

        await Promise.all([
            db.from("venta_items").insert({
                venta_id:        ventaNueva.id,
                producto_id:     prod.id,
                nombre_producto: prod.nombre,
                precio,
                cantidad,
                tamano,
            }),
            db.from("productos")
              .update({ stock: Math.max(0, (prod.stock || 0) - cantidad) })
              .eq("id", prod.id),
        ]);

        cerrarModal("modal-venta");
        await cargarDatos();
        renderizarDashboard();
        renderizarProductos();
        this.reset();
    });

    /* =====================================================
       PRODUCTOS — RENDERIZAR
       ===================================================== */
    function renderizarFiltros() {
        const contenedor = document.getElementById("filtros-categorias");
        contenedor.innerHTML = "";

        ["Todos", ...estado.categorias.map(c => c.nombre)].forEach(function (cat) {
            const btn       = document.createElement("button");
            btn.className   = "chip-categoria" + (cat === estado.categoriaFiltroActiva ? " activo" : "");
            btn.textContent = cat;
            btn.addEventListener("click", function () {
                estado.categoriaFiltroActiva = cat;
                renderizarFiltros();
                renderizarProductos();
                document.getElementById("titulo-tabla-productos").textContent =
                    cat === "Todos" ? "Todos los productos" : cat;
            });
            contenedor.appendChild(btn);
        });
    }

    function renderizarProductos() {
        const tbody = document.getElementById("tabla-productos-body");
        tbody.innerHTML = "";

        const filtrados = estado.categoriaFiltroActiva === "Todos"
            ? estado.productos
            : estado.productos.filter(p => p.categoria?.nombre === estado.categoriaFiltroActiva);

        if (filtrados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="tabla-vacia">Sin productos en esta categoría</td></tr>';
            return;
        }

        filtrados.forEach(function (prod) {
            const tr = document.createElement("tr");

            const tamanosCelda = (prod.tamanos?.length > 0)
                ? '<div class="badge-tamanos">' +
                    prod.tamanos.map(t =>
                        `<span class="badge-tamano">${t.nombre} ${formatearPrecio(t.precio)}</span>`
                    ).join("") +
                  '</div>'
                : '<span class="col-suave sin-tamanos">Sin tamaños</span>';

            tr.innerHTML = `
                <td>${prod.nombre}</td>
                <td>${prod.stock}</td>
                <td>${prod.categoria?.nombre || "—"}</td>
                <td>${tamanosCelda}</td>
                <td>
                    <button class="btn-editar"   data-id="${prod.id}">Editar</button>
                    <button class="btn-eliminar" data-id="${prod.id}">✕</button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        tbody.querySelectorAll(".btn-editar").forEach(btn =>
            btn.addEventListener("click", () => abrirModalEditarProducto(Number(btn.dataset.id)))
        );

        tbody.querySelectorAll(".btn-eliminar").forEach(btn =>
            btn.addEventListener("click", async function () {
                if (!confirm("¿Eliminar este producto?")) return;
                /* ON DELETE CASCADE en producto_tamanos borra los tamaños automáticamente */
                await db.from("productos").delete().eq("id", Number(btn.dataset.id));
                await cargarDatos();
                renderizarProductos();
                renderizarDashboard();
            })
        );
    }

    /* =====================================================
       MODAL AGREGAR / EDITAR PRODUCTO
       =====================================================
       ⚠️  BUG CORREGIDO:
       En la versión original, el campo "precio" se leía
       del input "prod-stock" por error. Se corrigió:
       - Productos con tamaños → precio = null (el precio
         vive en cada tamaño)
       - Productos sin tamaños → precio viene del input
         "prod-precio" (nuevo campo en el HTML)
       ===================================================== */

    function llenarSelectCategorias(valorActual) {
        const select = document.getElementById("prod-categoria");
        select.innerHTML = '<option value="">Sin categoría</option>';
        estado.categorias.forEach(function (cat) {
            const op       = document.createElement("option");
            op.value       = cat.id;
            op.textContent = cat.nombre;
            if (cat.nombre === valorActual) op.selected = true;
            select.appendChild(op);
        });
    }

    function renderizarListaTamanos() {
        const contenedor = document.getElementById("tamanos-lista-fija");
        contenedor.innerHTML = "";

        TAMANOS_GLOBALES.forEach(function (nombre) {
            const existente    = estado.tamanosTemporal.find(t => t.nombre === nombre);
            const estaActivo   = !!existente;
            const precioActual = existente ? existente.precio : "";

            const fila = document.createElement("div");
            fila.className = "tamano-fila" + (estaActivo ? " activo" : "");
            fila.innerHTML = `
                <label class="tamano-toggle">
                    <input type="checkbox" ${estaActivo ? "checked" : ""} data-nombre="${nombre}">
                    <span class="tamano-toggle-track"></span>
                </label>
                <span class="tamano-fila-nombre">${nombre}</span>
                <span class="tamano-precio-signo">$</span>
                <input
                    type="number"
                    class="tamano-fila-precio"
                    placeholder="0.00"
                    step="0.01" min="0"
                    value="${precioActual}"
                    data-nombre="${nombre}"
                    ${!estaActivo ? "disabled" : ""}
                >
            `;

            const checkbox    = fila.querySelector("input[type=checkbox]");
            const inputPrecio = fila.querySelector(".tamano-fila-precio");

            checkbox.addEventListener("change", function () {
                if (this.checked) {
                    fila.classList.add("activo");
                    inputPrecio.disabled = false;
                    inputPrecio.focus();
                    if (!estado.tamanosTemporal.find(t => t.nombre === nombre)) {
                        estado.tamanosTemporal.push({ nombre, precio: 0 });
                    }
                } else {
                    fila.classList.remove("activo");
                    inputPrecio.disabled = true;
                    inputPrecio.value    = "";
                    estado.tamanosTemporal = estado.tamanosTemporal.filter(t => t.nombre !== nombre);
                }
            });

            inputPrecio.addEventListener("input", function () {
                const t = estado.tamanosTemporal.find(t => t.nombre === nombre);
                if (t) t.precio = parseFloat(this.value) || 0;
            });

            contenedor.appendChild(fila);
        });
    }

    /* Controla la visibilidad del campo precio según si hay tamaños */
    function actualizarVisibilidadPrecio() {
        const grupoPrecio = document.getElementById("prod-precio-grupo");
        if (!grupoPrecio) return;
        const tieneTamanos = estado.tamanosTemporal.length > 0;
        grupoPrecio.style.display = tieneTamanos ? "none" : "block";
    }

    document.getElementById("btn-agregar-producto").addEventListener("click", function () {
        estado.productoEditandoId = null;
        estado.tamanosTemporal    = [];
        document.getElementById("modal-producto-titulo").textContent = "Agregar producto";
        document.getElementById("form-producto").reset();
        llenarSelectCategorias("");
        renderizarListaTamanos();
        actualizarVisibilidadPrecio();
        abrirModal("modal-producto");
    });

    function abrirModalEditarProducto(id) {
        const prod = estado.productos.find(p => p.id === id);
        if (!prod) return;

        estado.productoEditandoId = id;
        estado.tamanosTemporal    = (prod.tamanos || []).map(t => ({ ...t }));

        document.getElementById("modal-producto-titulo").textContent = "Editar producto";
        document.getElementById("prod-nombre").value = prod.nombre;
        document.getElementById("prod-stock").value  = prod.stock;

        /* Precio solo si no tiene tamaños */
        const inputPrecio = document.getElementById("prod-precio");
        if (inputPrecio) inputPrecio.value = prod.precio || "";

        llenarSelectCategorias(prod.categoria?.nombre || "");
        renderizarListaTamanos();
        actualizarVisibilidadPrecio();
        abrirModal("modal-producto");
    }

    document.getElementById("form-producto").addEventListener("submit", async function (e) {
        e.preventDefault();
        e.stopPropagation();

        /* Leer tamaños activos desde el DOM */
        const tamanosFinal = [];
        document.querySelectorAll(".tamano-fila.activo").forEach(function (fila) {
            const nombre = fila.querySelector("input[type=checkbox]").dataset.nombre;
            const precio = parseFloat(fila.querySelector(".tamano-fila-precio").value) || 0;
            tamanosFinal.push({ nombre, precio });
        });

        const categoriaId = document.getElementById("prod-categoria").value || null;

        /* ── BUG CORREGIDO: precio viene de prod-precio, no de prod-stock ── */
        const inputPrecio = document.getElementById("prod-precio");
        const precioSinTamano = inputPrecio ? parseFloat(inputPrecio.value) || null : null;

        const datos = {
            nombre:       document.getElementById("prod-nombre").value.trim(),
            stock:        Number(document.getElementById("prod-stock").value),
            categoria_id: categoriaId ? Number(categoriaId) : null,
            precio:       tamanosFinal.length > 0 ? null : precioSinTamano,
        };

        if (estado.productoEditandoId === null) {
            /* ── Crear producto nuevo ── */
            const { data: prodNuevo } = await db.from("productos").insert(datos).select().single();

            if (tamanosFinal.length > 0 && prodNuevo) {
                await db.from("producto_tamanos").insert(
                    tamanosFinal.map(t => ({ producto_id: prodNuevo.id, nombre: t.nombre, precio: t.precio }))
                );
            }
        } else {
            /* ── Editar producto existente ── */
            await db.from("productos").update(datos).eq("id", estado.productoEditandoId);

            /* Borramos y reinsertamos tamaños (la forma más simple de editar tamaños) */
            await db.from("producto_tamanos").delete().eq("producto_id", estado.productoEditandoId);

            if (tamanosFinal.length > 0) {
                await db.from("producto_tamanos").insert(
                    tamanosFinal.map(t => ({ producto_id: estado.productoEditandoId, nombre: t.nombre, precio: t.precio }))
                );
            }
        }

        cerrarModal("modal-producto");
        estado.tamanosTemporal = [];
        await cargarDatos();
        renderizarProductos();
        renderizarDashboard();
    });

    document.getElementById("btn-cancelar-producto").addEventListener("click", function () {
        cerrarModal("modal-producto");
        estado.tamanosTemporal = [];
    });

    /* =====================================================
       CATEGORÍAS
       ===================================================== */
    document.getElementById("btn-gestionar-categorias").addEventListener("click", function () {
        renderizarListaCategorias();
        abrirModal("modal-categorias");
    });

    function renderizarListaCategorias() {
        const lista = document.getElementById("lista-categorias-modal");
        lista.innerHTML = "";

        if (estado.categorias.length === 0) {
            lista.innerHTML = '<li class="categorias-vacias">Sin categorías creadas</li>';
            return;
        }

        estado.categorias.forEach(function (cat) {
            const li = document.createElement("li");
            li.className = "categoria-item";
            li.innerHTML = `
                <span class="categoria-nombre">${cat.nombre}</span>
                <button class="btn-eliminar-cat" data-id="${cat.id}" data-nombre="${cat.nombre}">✕</button>
            `;
            lista.appendChild(li);
        });

        lista.querySelectorAll(".btn-eliminar-cat").forEach(function (btn) {
            btn.addEventListener("click", async function () {
                const nombre = this.dataset.nombre;
                const id     = Number(this.dataset.id);
                if (!confirm(`¿Eliminar la categoría "${nombre}"?`)) return;

                /* ON DELETE SET NULL en productos: los productos quedan sin categoría */
                await db.from("categorias").delete().eq("id", id);

                if (estado.categoriaFiltroActiva === nombre) estado.categoriaFiltroActiva = "Todos";
                await cargarDatos();
                renderizarListaCategorias();
                renderizarFiltros();
                renderizarProductos();
            });
        });
    }

    document.getElementById("form-nueva-categoria").addEventListener("submit", async function (e) {
        e.preventDefault();
        const nombre = document.getElementById("nueva-categoria").value.trim();
        if (!nombre) return;

        if (estado.categorias.some(c => c.nombre.toLowerCase() === nombre.toLowerCase())) {
            alert("Esa categoría ya existe.");
            return;
        }

        await db.from("categorias").insert({ nombre });
        await cargarDatos();
        renderizarListaCategorias();
        renderizarFiltros();
        document.getElementById("nueva-categoria").value = "";
    });

    /* =====================================================
       CALENDARIO DE ENTREGAS
       ===================================================== */
    function renderizarCalendario() {
        const grid   = document.getElementById("calendario-grid");
        const titulo = document.getElementById("mes-actual");
        const { anioCalendario: anio, mesCalendario: mes } = estado;

        titulo.textContent = new Date(anio, mes, 1)
            .toLocaleDateString("es-MX", { month: "long", year: "numeric" })
            .replace(/^\w/, c => c.toUpperCase());

        grid.innerHTML = "";
        const hoy            = new Date();
        const primerDia      = new Date(anio, mes, 1).getDay();
        const diasEnMes      = new Date(anio, mes + 1, 0).getDate();
        const fechasEntregas = estado.entregas.map(e => e.fecha);

        /* Celdas vacías al inicio */
        for (let i = 0; i < primerDia; i++) {
            const v = document.createElement("div");
            v.className = "cal-dia vacio";
            grid.appendChild(v);
        }

        /* Días del mes */
        for (let d = 1; d <= diasEnMes; d++) {
            const div      = document.createElement("div");
            div.className  = "cal-dia";
            div.textContent = d;
            const fechaDia = `${anio}-${String(mes + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

            if (anio === hoy.getFullYear() && mes === hoy.getMonth() && d === hoy.getDate()) {
                div.classList.add("hoy");
            }
            if (fechasEntregas.includes(fechaDia)) {
                div.classList.add("tiene-entrega");
                div.title = "Entrega programada";
            }
            grid.appendChild(div);
        }

        renderizarListaEntregas();
    }

    function renderizarListaEntregas() {
        const lista = document.getElementById("lista-entregas");
        lista.innerHTML = "";

        if (estado.entregas.length === 0) {
            lista.innerHTML = '<li class="entrega-vacia">Sin entregas programadas</li>';
            return;
        }

        [...estado.entregas]
            .sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
            .forEach(function (e) {
                const li = document.createElement("li");
                li.className = "entrega-item";
                li.innerHTML = `
                    <span class="entrega-nombre">${e.producto}</span>
                    <span class="entrega-fecha">📦 ${formatearFecha(e.fecha)}</span>
                `;
                lista.appendChild(li);
            });
    }

    document.getElementById("btn-mes-anterior").addEventListener("click", function () {
        estado.mesCalendario--;
        if (estado.mesCalendario < 0) { estado.mesCalendario = 11; estado.anioCalendario--; }
        renderizarCalendario();
    });

    document.getElementById("btn-mes-siguiente").addEventListener("click", function () {
        estado.mesCalendario++;
        if (estado.mesCalendario > 11) { estado.mesCalendario = 0; estado.anioCalendario++; }
        renderizarCalendario();
    });

    document.getElementById("btn-agregar-entrega").addEventListener("click", () => abrirModal("modal-entrega"));

    document.getElementById("form-entrega").addEventListener("submit", async function (e) {
        e.preventDefault();
        await db.from("entregas").insert({
            producto: document.getElementById("entrega-producto").value.trim(),
            fecha:    document.getElementById("entrega-fecha").value,
        });
        await cargarDatos();
        cerrarModal("modal-entrega");
        renderizarCalendario();
        this.reset();
    });

    /* =====================================================
       TICKET DEL DUEÑO — Ver ticket de una venta pasada
       ===================================================== */
    async function abrirTicketDueno(ventaId) {
        const { data: venta } = await db
            .from("ventas")
            .select("*, items:venta_items(*)")
            .eq("id", ventaId)
            .single();

        if (!venta) return;

        const items          = venta.items || [];
        const totalGrupo     = items.reduce((s, i) => s + i.precio * i.cantidad, 0);
        const { subtotal, iva } = calcularIVA(totalGrupo);

        document.getElementById("dt-numero").textContent = generarNumeroTicket(ventaId);
        document.getElementById("dt-fecha").textContent  = venta.fecha;
        document.getElementById("dt-hora").textContent   = venta.hora;

        /* Items del ticket */
        const itemsEl = document.getElementById("dt-items");
        itemsEl.innerHTML = "";
        items.forEach(function (item) {
            const fila = document.createElement("div");
            fila.className = "ticket-item-fila-d";
            const nombre = item.tamano
                ? `${item.nombre_producto} (${item.tamano})`
                : item.nombre_producto;
            fila.innerHTML =
                `<div class="ticket-item-row-d">
                    <span>${nombre}</span>
                    <span>${item.cantidad}</span>
                    <span>${formatearPrecio(item.precio)}</span>
                    <span>${formatearPrecio(item.precio * item.cantidad)}</span>
                </div>` +
                (item.comentario ? `<div class="ticket-item-nota-d">* ${item.comentario}</div>` : "");
            itemsEl.appendChild(fila);
        });

        /* Nota de la orden */
        const notaWrap = document.getElementById("dt-nota-wrap");
        if (venta.comentario_orden) {
            notaWrap.style.display = "flex";
            document.getElementById("dt-nota").textContent = venta.comentario_orden;
        } else {
            notaWrap.style.display = "none";
        }

        /* Totales */
        document.getElementById("dt-subtotal").textContent = formatearPrecio(subtotal);
        document.getElementById("dt-iva").textContent      = formatearPrecio(iva);
        document.getElementById("dt-total").textContent    = formatearPrecio(totalGrupo);

        /* Método de pago */
        document.getElementById("dt-metodo").textContent =
            textoMetodoPago(venta.metodo_pago, venta.tipo_tarjeta);

        /* Efectivo y cambio */
        const mostrarEfectivo = venta.metodo_pago === "efectivo" && venta.recibido > 0;
        document.getElementById("dt-fila-recibido").style.display = mostrarEfectivo ? "flex" : "none";
        document.getElementById("dt-fila-cambio").style.display   = mostrarEfectivo ? "flex" : "none";
        if (mostrarEfectivo) {
            document.getElementById("dt-recibido").textContent = formatearPrecio(venta.recibido);
            document.getElementById("dt-cambio").textContent   = formatearPrecio(venta.cambio);
        }

        abrirModal("modal-ticket-dueno");
    }

    document.getElementById("btn-cerrar-ticket-dueno").addEventListener("click", () => cerrarModal("modal-ticket-dueno"));
    document.getElementById("btn-imprimir-dueno").addEventListener("click", () => window.print());

    /* =====================================================
       EXPORTAR EXCEL
       ===================================================== */
    async function exportarExcel() {
        const ventas = estado.ventas;
        const hoy    = obtenerFechaHoy();

        if (ventas.length === 0) {
            alert("No hay ventas registradas hoy para exportar.");
            return;
        }

        const wb = XLSX.utils.book_new();

        /* ── Hoja 1: Detalle de ventas ── */
        const encabezado = [
            [`${NEGOCIO.nombre} — ${NEGOCIO.razonSocial}`],
            [`RFC: ${NEGOCIO.rfc}   |   ${NEGOCIO.direccion}   |   Tel: ${NEGOCIO.telefono}`],
            [`Reporte de ventas del día: ${hoy}`],
            [],
            ["#", "Hora", "Producto", "Tamaño", "Cantidad", "Precio Unit.",
             "Subtotal", "IVA (16%)", "Total c/IVA", "Método de pago", "Nota producto", "Nota orden"],
        ];

        const filas = ventas.map(function (v, i) {
            const totalItem = v.precio * v.cantidad;
            const { subtotal: subItem, iva: ivaItem } = calcularIVA(totalItem);
            return [
                i + 1,
                v.venta?.hora || "",
                v.nombre_producto || "",
                v.tamano || "",
                v.cantidad,
                v.precio,
                subItem,
                ivaItem,
                totalItem,
                textoMetodoPago(v.venta?.metodo_pago, v.venta?.tipo_tarjeta),
                v.comentario || "",
                v.venta?.comentario_orden || "",
            ];
        });

        const totalGeneral = ventas.reduce((s, v) => s + v.precio * v.cantidad, 0);
        const { subtotal: subTotal, iva: ivaTotal } = calcularIVA(totalGeneral);

        const ws1 = XLSX.utils.aoa_to_sheet([
            ...encabezado,
            ...filas,
            [],
            ["", "", "", "", "", "TOTALES →", subTotal, ivaTotal, totalGeneral, "", "", ""],
        ]);
        ws1["!cols"] = [
            {wch:4},{wch:8},{wch:24},{wch:10},{wch:8},
            {wch:13},{wch:13},{wch:13},{wch:13},{wch:16},{wch:22},{wch:22},
        ];
        XLSX.utils.book_append_sheet(wb, ws1, "Ventas del día");

        /* ── Hoja 2: Resumen por producto ── */
        const resumen = {};
        ventas.forEach(function (v) {
            const clave = v.tamano ? `${v.nombre_producto} (${v.tamano})` : v.nombre_producto;
            if (!resumen[clave]) resumen[clave] = { cantidad: 0, total: 0 };
            resumen[clave].cantidad += v.cantidad;
            resumen[clave].total    += v.precio * v.cantidad;
        });

        const filasResumen = [
            [`${NEGOCIO.nombre} — Resumen por producto: ${hoy}`],
            [],
            ["Producto", "Cantidad vendida", "Total sin IVA", "IVA (16%)", "Total con IVA"],
            ...Object.entries(resumen).map(function ([nombre, datos]) {
                const { subtotal: s, iva: iv } = calcularIVA(datos.total);
                return [nombre, datos.cantidad, s, iv, datos.total];
            }),
            [],
        ];

        const totalResumen = Object.values(resumen).reduce((s, r) => s + r.total, 0);
        const { subtotal: subRes, iva: ivaRes } = calcularIVA(totalResumen);
        filasResumen.push(["TOTAL", "", subRes, ivaRes, totalResumen]);

        const ws2 = XLSX.utils.aoa_to_sheet(filasResumen);
        ws2["!cols"] = [{wch:30},{wch:18},{wch:16},{wch:14},{wch:16}];
        XLSX.utils.book_append_sheet(wb, ws2, "Resumen por producto");

        XLSX.writeFile(wb, `ventas_${hoy}.xlsx`);
    }

    document.getElementById("btn-exportar-excel").addEventListener("click", exportarExcel);

    /* ── Excel del mes completo ── */
    document.getElementById("btn-exportar-mes").addEventListener("click", async function () {
        const hoy    = new Date();
        const anio   = hoy.getFullYear();
        const mes    = hoy.getMonth() + 1;
        const desde  = `${anio}-${String(mes).padStart(2,"0")}-01`;
        const hasta  = `${anio}-${String(mes+1).padStart(2,"0")}-01`;

        const { data: ventas } = await db.from("ventas")
            .select("*, items:venta_items(*)")
            .gte("fecha", desde)
            .lt("fecha", hasta)
            .order("fecha");

        if (!ventas || ventas.length === 0) {
            alert("No hay ventas este mes.");
            return;
        }

        const meses     = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
        const nombreMes = meses[mes - 1];
        const wb        = XLSX.utils.book_new();

        /* Hoja global del mes */
        const rowsTotal = ventas.map(v => {
            const { subtotal, iva } = calcularIVA(v.total);
            return {
                "Ticket":       generarNumeroTicket(v.id),
                "Fecha":        v.fecha,
                "Hora":         v.hora ? v.hora.slice(0,5) : "",
                "Productos":    (v.items||[]).map(i => `${i.nombre_producto}${i.tamano?" ("+i.tamano+")":""} x${i.cantidad}`).join(", "),
                "Subtotal":     subtotal,
                "IVA":          iva,
                "Total":        v.total,
                "Método pago":  textoMetodoPago(v.metodo_pago, v.tipo_tarjeta),
                "Facturado":    v.facturado ? "Sí" : "No",
            };
        });
        const wsTotal = XLSX.utils.json_to_sheet(rowsTotal);
        wsTotal["!cols"] = [{wch:8},{wch:12},{wch:8},{wch:50},{wch:12},{wch:10},{wch:12},{wch:16},{wch:10}];
        XLSX.utils.book_append_sheet(wb, wsTotal, `${nombreMes} ${anio}`);

        /* Una hoja por día */
        const porDia = {};
        ventas.forEach(v => { if (!porDia[v.fecha]) porDia[v.fecha] = []; porDia[v.fecha].push(v); });
        Object.keys(porDia).sort().forEach(fecha => {
            const rows = porDia[fecha].map(v => {
                const { subtotal, iva } = calcularIVA(v.total);
                return {
                    "Ticket":      generarNumeroTicket(v.id),
                    "Hora":        v.hora ? v.hora.slice(0,5) : "",
                    "Productos":   (v.items||[]).map(i => `${i.nombre_producto}${i.tamano?" ("+i.tamano+")":""} x${i.cantidad}`).join(", "),
                    "Subtotal":    subtotal,
                    "IVA":         iva,
                    "Total":       v.total,
                    "Método pago": textoMetodoPago(v.metodo_pago, v.tipo_tarjeta),
                    "Facturado":   v.facturado ? "Sí" : "No",
                };
            });
            const ws = XLSX.utils.json_to_sheet(rows);
            ws["!cols"] = [{wch:8},{wch:8},{wch:50},{wch:12},{wch:10},{wch:12},{wch:16},{wch:10}];
            XLSX.utils.book_append_sheet(wb, ws, fecha.slice(5));
        });

        XLSX.writeFile(wb, `ventas_${anio}-${String(mes).padStart(2,"0")}.xlsx`);
    });

    /* ── Excel de un día específico ── */
    document.getElementById("btn-exportar-dia").addEventListener("click", async function () {
        const fecha = document.getElementById("input-fecha-excel").value;
        if (!fecha) { alert("Selecciona una fecha."); return; }

        const { data: ventas } = await db.from("ventas")
            .select("*, items:venta_items(*)")
            .eq("fecha", fecha)
            .order("id");

        if (!ventas || ventas.length === 0) {
            alert(`No hay ventas para el ${fecha}.`);
            return;
        }

        const wb   = XLSX.utils.book_new();
        const rows = ventas.map(v => {
            const { subtotal, iva } = calcularIVA(v.total);
            return {
                "Ticket":      generarNumeroTicket(v.id),
                "Hora":        v.hora ? v.hora.slice(0,5) : "",
                "Productos":   (v.items||[]).map(i => `${i.nombre_producto}${i.tamano?" ("+i.tamano+")":""} x${i.cantidad}`).join(", "),
                "Subtotal":    subtotal,
                "IVA":         iva,
                "Total":       v.total,
                "Método pago": textoMetodoPago(v.metodo_pago, v.tipo_tarjeta),
                "Facturado":   v.facturado ? "Sí" : "No",
            };
        });
        const ws = XLSX.utils.json_to_sheet(rows);
        ws["!cols"] = [{wch:8},{wch:8},{wch:50},{wch:12},{wch:10},{wch:12},{wch:16},{wch:10}];
        XLSX.utils.book_append_sheet(wb, ws, fecha.slice(5));
        XLSX.writeFile(wb, `ventas_${fecha}.xlsx`);
    });

    /* =====================================================
       MODALES — inicializar cierre
       ===================================================== */
    inicializarCierreModales();

    /* =====================================================
       ARRANQUE
       ===================================================== */
    await cargarDatos();
    renderizarDashboard();
    renderizarFiltros();
    renderizarProductos();
});