-- ========================================================
-- ESQUEMA Y TABLAS SUPABASE - CASA FAMILIAR CHIPIONA
-- ========================================================
-- Ejecuta este script en el SQL Editor de tu panel de Supabase
-- (https://supabase.com/dashboard/project/ktvytchrrowvvwlglreo/sql)

-- 1. TABLA DE RESERVAS
CREATE TABLE IF NOT EXISTS public.reservas (
    id TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    "checkIn" TEXT NOT NULL,
    "checkOut" TEXT NOT NULL,
    habitaciones INTEGER NOT NULL DEFAULT 1,
    comentarios TEXT DEFAULT '',
    "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- 2. TABLA DE INFORMACIÓN DE LA CASA (habitaciones, normas, consejos)
CREATE TABLE IF NOT EXISTS public.casa_info (
    id TEXT PRIMARY KEY DEFAULT 'main',
    habitaciones TEXT DEFAULT '',
    normas TEXT DEFAULT '',
    consejos TEXT DEFAULT '',
    "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- 3. TABLA DE AUDITORÍA / HISTORIAL DE LOGS
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id TEXT PRIMARY KEY,
    tipo TEXT NOT NULL,
    titulo TEXT NOT NULL,
    detalle TEXT DEFAULT '',
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    "reservaId" TEXT
);

-- 4. TABLA DE PAPELERA DE RECICLAJE
CREATE TABLE IF NOT EXISTS public.trash_reservas (
    id TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    "checkIn" TEXT NOT NULL,
    "checkOut" TEXT NOT NULL,
    habitaciones INTEGER NOT NULL DEFAULT 1,
    comentarios TEXT DEFAULT '',
    "createdAt" TIMESTAMPTZ,
    "deletedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- ========================================================
-- POLÍTICAS DE ACCESO (ROW LEVEL SECURITY)
-- Permite lectura y escritura pública usando la publishable/anon key
-- ========================================================
ALTER TABLE public.reservas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir todo en reservas" ON public.reservas;
CREATE POLICY "Permitir todo en reservas" ON public.reservas FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.casa_info ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir todo en casa_info" ON public.casa_info;
CREATE POLICY "Permitir todo en casa_info" ON public.casa_info FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir todo en audit_logs" ON public.audit_logs;
CREATE POLICY "Permitir todo en audit_logs" ON public.audit_logs FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.trash_reservas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir todo en trash_reservas" ON public.trash_reservas;
CREATE POLICY "Permitir todo en trash_reservas" ON public.trash_reservas FOR ALL USING (true) WITH CHECK (true);

-- ========================================================
-- DATOS INICIALES SEMILLA (ROMAN Y CASA)
-- ========================================================
INSERT INTO public.reservas (id, nombre, "checkIn", "checkOut", habitaciones, comentarios, "createdAt")
VALUES (
    'res-1793652501064-r0hx51',
    'Roman',
    '2026-11-02',
    '2026-11-03',
    1,
    'Buenas Familia!! He creado esta APP para tener un poco de control y organizacion con quien se aloja en la casa de Chipiona, desde aqui podreis hacer reservas, eliminarlas (tened cuidado que podeis eliminar la de otras personas), seleccionar numero de habitaciones que vais a usar, y comentar cosas como voy con un invitado, etc. \n\nCualquier duda que tengais podeis preguntarla por el grupo de la familia, espero que os venga genial la aplicacion y cualquier cosita que querais implementar o modificar comentadselo a Alba.\n\nUn abrazo, Roman.',
    '2026-11-02T20:48:21.064Z'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.casa_info (id, habitaciones, normas, consejos)
VALUES (
    'main',
    '• Habitación 1: Cama de matrimonio principal con armario.
• Habitación 2: Dos camas individuales.
• Habitación 3: Cama nido / litera (ideal para niños o jóvenes).',
    '• Tirar la basura a los contenedores al salir.
• Dejar las toallas y sábanas usadas en el cesto de lavado.
• Apagar el termo y el aire acondicionado al marchar.
• Dejar las llaves en la cajita con su clave de seguridad.',
    'Playa de Regla a escasos minutos a pie. No olvidéis los paseos por el Faro al atardecer, el tapeo en la calle Isaac Peral y el moscatel en las bodegas locales.'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.audit_logs (id, tipo, titulo, detalle, timestamp, "reservaId")
VALUES (
    'log-1793652501241-l3fs4m',
    'CREACION',
    'Nueva reserva: Roman',
    '2026-11-02 al 2026-11-03 (1 hab.)',
    '2026-11-02T20:48:21.241Z',
    'res-1793652501064-r0hx51'
) ON CONFLICT (id) DO NOTHING;
