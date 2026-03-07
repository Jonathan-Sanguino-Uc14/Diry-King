/* =====================================================
   CONFIG.JS — Configuración global del proyecto
   =====================================================
   Este es el ÚNICO lugar donde viven las credenciales
   de Supabase. Si algún día cambia la URL o la key,
   solo se edita aquí.

   ⚠️  SEGURIDAD — LEE ESTO:
   La SUPABASE_KEY de abajo es una "anon key" pública.
   Es seguro que esté en el frontend SOLO si tienes
   Row Level Security (RLS) activado en Supabase.

   Pasos para activar RLS en cada tabla:
     1. Ve a Supabase → Authentication → Policies
     2. Habilita RLS en: usuarios, productos, categorias,
        producto_tamanos, ventas, venta_items, entregas
     3. Crea políticas que permitan solo lo necesario:
        - SELECT público en productos y categorias
        - INSERT/UPDATE/DELETE solo para usuarios autenticados

   🔐  MIGRACIÓN RECOMENDADA A SUPABASE AUTH:
   Actualmente los usuarios se guardan en una tabla propia
   con contraseñas en texto plano. Para producción real,
   migra a Supabase Auth:
     1. Crea los usuarios en Authentication → Users
     2. Guarda el rol en la tabla "profiles" (id = auth.uid())
     3. En app.js usa: db.auth.signInWithPassword({ email, password })
     4. En auth.js usa: db.auth.getSession() en lugar de sessionStorage
   Documentación: https://supabase.com/docs/guides/auth
   ===================================================== */

const SUPABASE_URL = "https://ihuxeilylsjrfchlxgsi.supabase.co";
const SUPABASE_KEY = "sb_publishable_tcPuTtHoYNoj3DcTygusxA_S6kY2zfX";

/* El cliente de Supabase se crea UNA sola vez aquí.
   Todos los demás archivos usan la variable `db`. */
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* Tamaños disponibles para todos los productos.
   Si en el futuro se agregan tamaños nuevos,
   solo se edita este array. */
const TAMANOS_GLOBALES = ["Mini", "Chico", "Mediano", "Grande"];

/* Constante de IVA usada en tickets y reportes */
const TASA_IVA = 0.16;

/* Datos del negocio para tickets y reportes Excel.
   Editables sin tocar la lógica del sistema. */
const NEGOCIO = {
    nombre:    "HELADERÍA DAIRY KING",
    razonSocial: "Dairy King S.A. de C.V.",
    rfc:       "DKI230415ABC",
    direccion: "Av. Central #123, Cancún, Q. Roo",
    telefono:  "998-123-4567",
};

/* URL base del sitio — se usa para generar el QR de autofacturación.
   Cambia esto a tu dominio real cuando subas el proyecto.
   Ej: "https://dairyking.com" o "https://tudominio.com"        */
const SITIO_URL = "https://jonathan-sanguino-uc14.github.io/Diry-King";
/* Usos de CFDI más comunes (SAT México).
   El cliente elige uno al facturar.                             */
const USOS_CFDI = [
    { clave: "G01", descripcion: "Adquisición de mercancias" },
    { clave: "G03", descripcion: "Gastos en general" },
    { clave: "D01", descripcion: "Honorarios médicos y dentales" },
    { clave: "D10", descripcion: "Pagos por servicios educativos" },
    { clave: "S01", descripcion: "Sin efectos fiscales" },
    { clave: "CP01", descripcion: "Pagos" },
];