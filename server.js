const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Cargar variables de entorno desde .env si existe (sin dependencias externas)
if (fs.existsSync(path.join(__dirname, '.env'))) {
  try {
    const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf-8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
      }
    });
  } catch (e) {}
}

const app = express();
const DATA_DIR = process.env.VERCEL ? path.join('/tmp', 'data') : path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'reservas.json');
const INFO_FILE = path.join(DATA_DIR, 'casa_info.json');
const LOGS_FILE = path.join(DATA_DIR, 'audit_logs.json');
const TRASH_FILE = path.join(DATA_DIR, 'trash_reservas.json');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Rutas estáticas explícitas para Vercel Serverless
app.get('/js/app.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.sendFile(path.join(__dirname, 'js', 'app.js'));
});

app.get('/js/storage.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.sendFile(path.join(__dirname, 'js', 'storage.js'));
});

app.get('/css/styles.css', (req, res) => {
  res.setHeader('Content-Type', 'text/css; charset=utf-8');
  res.sendFile(path.join(__dirname, 'css', 'styles.css'));
});

// Ruta raíz
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Asegurar carpeta y archivo de datos
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Si está en Vercel, copiar los datos iniciales de data/ a /tmp/data si no existen
if (process.env.VERCEL) {
  const seedData = path.join(__dirname, 'data', 'reservas.json');
  const seedInfo = path.join(__dirname, 'data', 'casa_info.json');
  const seedLogs = path.join(__dirname, 'data', 'audit_logs.json');
  const seedTrash = path.join(__dirname, 'data', 'trash_reservas.json');
  if (!fs.existsSync(DATA_FILE) && fs.existsSync(seedData)) {
    try { fs.copyFileSync(seedData, DATA_FILE); } catch(e) {}
  }
  if (!fs.existsSync(INFO_FILE) && fs.existsSync(seedInfo)) {
    try { fs.copyFileSync(seedInfo, INFO_FILE); } catch(e) {}
  }
  if (!fs.existsSync(LOGS_FILE) && fs.existsSync(seedLogs)) {
    try { fs.copyFileSync(seedLogs, LOGS_FILE); } catch(e) {}
  }
  if (!fs.existsSync(TRASH_FILE) && fs.existsSync(seedTrash)) {
    try { fs.copyFileSync(seedTrash, TRASH_FILE); } catch(e) {}
  }
}

// ========================================================
// CONFIGURACIÓN DE BASE DE DATOS SUPABASE
// ========================================================
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ktvytchrrowvvwlglreo.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_of7Wn9ExHHD5RyrWu-M7og_nId7gtm6';

// Helper universal para llamadas REST a Supabase
async function supabaseFetch(endpoint, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1${endpoint}`;
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  if (timer.unref) timer.unref();
  try {
    const res = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// Filtro definitivo para erradicar cualquier residuo de "Tío Paco"
function isPaco(item) {
  if (!item) return false;
  if (item.id === 'res-1793658792196-17qt67' || item.reservaId === 'res-1793658792196-17qt67') return true;
  const str = JSON.stringify(item).toLowerCase();
  return str.includes('paco') || str.includes('1793658792196');
}

function cleanPacoList(list) {
  if (!Array.isArray(list)) return [];
  return list.filter(item => !isPaco(item));
}

// Cache global en memoria para latencia mínima (<5ms)
const dbCache = {
  reservas: null,
  casaInfo: null,
  logs: null,
  trash: null,
  lastFetched: 0
};

// Datos iniciales de reservas (Reserva activa de bienvenida de Roman)
function getInitialData() {
  return [
    {
      id: 'res-1793652501064-r0hx51',
      nombre: 'Roman',
      checkIn: '2026-11-02',
      checkOut: '2026-11-03',
      habitaciones: 1,
      comentarios: 'Buenas Familia!! He creado esta APP para tener un poco de control y organizacion con quien se aloja en la casa de Chipiona, desde aqui podreis hacer reservas, eliminarlas (tened cuidado que podeis eliminar la de otras personas), seleccionar numero de habitaciones que vais a usar, y comentar cosas como voy con un invitado, etc. \n\nCualquier duda que tengais podeis preguntarla por el grupo de la familia, espero que os vena genial la aplicacion y cualquier cosita que querais implementar o modificar comentadselo a Alba.\n\nUn abrazo, Roman.',
      createdAt: '2026-11-02T20:48:21.064Z'
    }
  ];
}

// Información por defecto de La Casa (editable por la familia)
function getDefaultCasaInfo() {
  return {
    habitaciones: "• Habitación 1: Cama de matrimonio principal con armario.\n• Habitación 2: Dos camas individuales.\n• Habitación 3: Cama nido / litera (ideal para niños o jóvenes).",
    normas: "• Tirar la basura a los contenedores al salir.\n• Dejar las toallas y sábanas usadas en el cesto de lavado.\n• Apagar el termo y el aire acondicionado al marchar.\n• Dejar las llaves en la cajita con su clave de seguridad.",
    consejos: "Playa de Regla a escasos minutos a pie. No olvidéis los paseos por el Faro al atardecer, el tapeo en la calle Isaac Peral y el moscatel en las bodegas locales."
  };
}

// ========================================================
// OPERACIONES CON CACHÉ Y PERSISTENCIA LOCAL (FALLBACK)
// ========================================================
function readReservasLocal() {
  if (dbCache.reservas && Array.isArray(dbCache.reservas)) {
    return cleanPacoList(dbCache.reservas);
  }
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(data || '[]');
      if (Array.isArray(parsed) && parsed.length > 0) {
        const cleaned = cleanPacoList(parsed);
        dbCache.reservas = cleaned;
        return cleaned;
      }
    }
    const seedData = path.join(__dirname, 'data', 'reservas.json');
    if (fs.existsSync(seedData)) {
      const seed = JSON.parse(fs.readFileSync(seedData, 'utf-8'));
      const cleaned = cleanPacoList(seed);
      dbCache.reservas = cleaned;
      return cleaned;
    }
  } catch (error) {
    console.error('Error al leer reservas locales:', error);
  }
  const initial = getInitialData();
  dbCache.reservas = initial;
  return initial;
}

function readCasaInfoLocal() {
  if (dbCache.casaInfo && dbCache.casaInfo.habitaciones) {
    return dbCache.casaInfo;
  }
  try {
    if (fs.existsSync(INFO_FILE)) {
      const data = fs.readFileSync(INFO_FILE, 'utf-8');
      const parsed = JSON.parse(data || '{}');
      if (parsed && parsed.habitaciones) {
        dbCache.casaInfo = parsed;
        return parsed;
      }
    }
    const seedInfo = path.join(__dirname, 'data', 'casa_info.json');
    if (fs.existsSync(seedInfo)) {
      const seed = JSON.parse(fs.readFileSync(seedInfo, 'utf-8'));
      dbCache.casaInfo = seed;
      return seed;
    }
  } catch (error) {
    console.error('Error al leer información de la casa local:', error);
  }
  const initial = getDefaultCasaInfo();
  dbCache.casaInfo = initial;
  return initial;
}

function readLogsLocal() {
  if (dbCache.logs && Array.isArray(dbCache.logs)) {
    return cleanPacoList(dbCache.logs);
  }
  try {
    if (fs.existsSync(LOGS_FILE)) {
      const data = fs.readFileSync(LOGS_FILE, 'utf-8');
      const parsed = JSON.parse(data || '[]');
      if (Array.isArray(parsed) && parsed.length > 0) {
        const cleaned = cleanPacoList(parsed);
        dbCache.logs = cleaned;
        return cleaned;
      }
    }
    const seedLogs = path.join(__dirname, 'data', 'audit_logs.json');
    if (fs.existsSync(seedLogs)) {
      const seed = JSON.parse(fs.readFileSync(seedLogs, 'utf-8'));
      const cleaned = cleanPacoList(seed);
      dbCache.logs = cleaned;
      return cleaned;
    }
  } catch (error) {
    console.error('Error al leer logs locales:', error);
  }
  const initialLogs = [
    {
      id: 'log-1793652501241-l3fs4m',
      tipo: 'CREACION',
      titulo: 'Nueva reserva: Roman',
      detalle: '2026-11-02 al 2026-11-03 (1 hab.)',
      timestamp: '2026-11-02T20:48:21.241Z',
      reservaId: 'res-1793652501064-r0hx51'
    }
  ];
  dbCache.logs = initialLogs;
  return initialLogs;
}

function readTrashLocal() {
  if (dbCache.trash && Array.isArray(dbCache.trash)) {
    return cleanPacoList(dbCache.trash);
  }
  try {
    if (fs.existsSync(TRASH_FILE)) {
      const data = fs.readFileSync(TRASH_FILE, 'utf-8');
      const parsed = JSON.parse(data || '[]');
      const cleaned = cleanPacoList(parsed);
      dbCache.trash = cleaned;
      return cleaned;
    }
    const seedTrash = path.join(__dirname, 'data', 'trash_reservas.json');
    if (fs.existsSync(seedTrash)) {
      const seed = JSON.parse(fs.readFileSync(seedTrash, 'utf-8'));
      const cleaned = cleanPacoList(seed);
      dbCache.trash = cleaned;
      return cleaned;
    }
  } catch (error) {
    console.error('Error al leer papelera local:', error);
  }
  const initialTrash = [];
  dbCache.trash = initialTrash;
  return initialTrash;
}

// ========================================================
// SINCRONIZACIÓN CON SUPABASE
// ========================================================
async function fetchReservasFromSupabase() {
  try {
    const res = await supabaseFetch('/reservas?select=*&order=checkIn.asc');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        const cleaned = cleanPacoList(data).map(r => ({
          id: r.id,
          nombre: r.nombre,
          checkIn: r.checkIn || r.check_in,
          checkOut: r.checkOut || r.check_out,
          habitaciones: parseInt(r.habitaciones, 10) || 1,
          comentarios: r.comentarios || '',
          createdAt: r.createdAt || r.created_at || new Date().toISOString()
        }));
        cleaned.sort((a, b) => new Date(a.checkIn) - new Date(b.checkIn));
        dbCache.reservas = cleaned;
        dbCache.lastFetched = Date.now();
        try { fs.writeFileSync(DATA_FILE, JSON.stringify(cleaned, null, 2), 'utf-8'); } catch(e) {}
        return cleaned;
      }
    }
  } catch (err) {
    console.warn('Supabase reservas inaccesible (usando local):', err.message);
  }
  return readReservasLocal();
}

async function fetchCasaInfoFromSupabase() {
  try {
    const res = await supabaseFetch('/casa_info?id=eq.main&select=*');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0 && data[0].habitaciones) {
        const info = {
          habitaciones: data[0].habitaciones,
          normas: data[0].normas || '',
          consejos: data[0].consejos || ''
        };
        dbCache.casaInfo = info;
        try { fs.writeFileSync(INFO_FILE, JSON.stringify(info, null, 2), 'utf-8'); } catch(e) {}
        return info;
      }
    }
  } catch (err) {
    console.warn('Supabase casa_info inaccesible (usando local):', err.message);
  }
  return readCasaInfoLocal();
}

async function fetchLogsFromSupabase() {
  try {
    const res = await supabaseFetch('/audit_logs?select=*&order=timestamp.desc&limit=250');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        const cleaned = cleanPacoList(data).map(l => ({
          id: l.id,
          tipo: l.tipo,
          titulo: l.titulo,
          detalle: l.detalle || '',
          timestamp: l.timestamp,
          reservaId: l.reservaId || l.reserva_id || null
        }));
        dbCache.logs = cleaned;
        try { fs.writeFileSync(LOGS_FILE, JSON.stringify(cleaned, null, 2), 'utf-8'); } catch(e) {}
        return cleaned;
      }
    }
  } catch (err) {
    console.warn('Supabase logs inaccesible (usando local):', err.message);
  }
  return readLogsLocal();
}

async function fetchTrashFromSupabase() {
  try {
    const res = await supabaseFetch('/trash_reservas?select=*&order=deletedAt.desc');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        const cleaned = cleanPacoList(data).map(r => ({
          id: r.id,
          nombre: r.nombre,
          checkIn: r.checkIn || r.check_in,
          checkOut: r.checkOut || r.check_out,
          habitaciones: parseInt(r.habitaciones, 10) || 1,
          comentarios: r.comentarios || '',
          createdAt: r.createdAt || r.created_at,
          deletedAt: r.deletedAt || r.deleted_at || new Date().toISOString()
        }));
        dbCache.trash = cleaned;
        try { fs.writeFileSync(TRASH_FILE, JSON.stringify(cleaned, null, 2), 'utf-8'); } catch(e) {}
        return cleaned;
      }
    }
  } catch (err) {
    console.warn('Supabase trash inaccesible (usando local):', err.message);
  }
  return readTrashLocal();
}

async function addLogEntry(tipo, titulo, detalle, reservaId = null) {
  if (isPaco({ titulo, detalle, reservaId })) return null;
  const entry = {
    id: 'log-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6),
    tipo,
    titulo,
    detalle,
    timestamp: new Date().toISOString(),
    reservaId
  };

  // Guardar en Supabase
  try {
    await supabaseFetch('/audit_logs', {
      method: 'POST',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify(entry)
    });
  } catch(e) {}

  // Guardar en local
  const logs = readLogsLocal();
  logs.unshift(entry);
  if (logs.length > 250) logs.pop();
  dbCache.logs = logs;
  try { fs.writeFileSync(LOGS_FILE, JSON.stringify(logs, null, 2), 'utf-8'); } catch(e) {}
  return entry;
}

// ========================================================
// RUTAS DE API RESERVAS
// ========================================================
app.get('/api/reservas', async (req, res) => {
  const reservas = await fetchReservasFromSupabase();
  res.json(reservas);
});

app.post('/api/reservas', async (req, res) => {
  const { nombre, checkIn, checkOut, habitaciones, comentarios } = req.body;

  if (!nombre || !checkIn || !checkOut || !habitaciones) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }

  // Rechazar intentos de inyección de Tío Paco
  if (isPaco({ nombre, comentarios })) {
    return res.status(400).json({ error: 'Nombre de reserva inválido' });
  }

  const numHab = parseInt(habitaciones, 10);
  if (isNaN(numHab) || numHab < 1 || numHab > 3) {
    return res.status(400).json({ error: 'El número de habitaciones debe ser entre 1 y 3' });
  }

  if (new Date(checkOut) <= new Date(checkIn)) {
    return res.status(400).json({ error: 'La fecha de salida debe ser posterior a la fecha de entrada' });
  }

  const reservas = await fetchReservasFromSupabase();
  const nuevaEntrada = new Date(checkIn);
  const nuevaSalida = new Date(checkOut);

  let cur = new Date(nuevaEntrada);
  let conflicto = null;

  while (cur < nuevaSalida) {
    const curStr = cur.toISOString().split('T')[0];
    let habOcupadas = 0;

    for (const r of reservas) {
      const rIn = new Date(r.checkIn);
      const rOut = new Date(r.checkOut);
      if (cur >= rIn && cur < rOut) {
        habOcupadas += (parseInt(r.habitaciones, 10) || 1);
      }
    }

    if (habOcupadas + numHab > 3) {
      conflicto = {
        fecha: curStr,
        ocupadas: habOcupadas,
        disponibles: Math.max(0, 3 - habOcupadas)
      };
      break;
    }

    cur.setDate(cur.getDate() + 1);
  }

  if (conflicto) {
    return res.status(409).json({
      error: `Conflicto de disponibilidad: El día ${conflicto.fecha} ya hay ${conflicto.ocupadas} habitación(es) reservada(s). Solo quedan ${conflicto.disponibles} libres y solicitaste ${numHab}.`
    });
  }

  const nueva = {
    id: 'res-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6),
    nombre: nombre.trim(),
    checkIn,
    checkOut,
    habitaciones: numHab,
    comentarios: (comentarios || '').trim(),
    createdAt: new Date().toISOString()
  };

  // Guardar en Supabase
  try {
    const sRes = await supabaseFetch('/reservas', {
      method: 'POST',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify(nueva)
    });
    if (!sRes.ok) {
      console.warn('Supabase POST /reservas:', sRes.status, await sRes.text());
    }
  } catch (err) {
    console.warn('Error Supabase al crear reserva:', err.message);
  }

  // Guardar en local/caché
  reservas.push(nueva);
  reservas.sort((a, b) => new Date(a.checkIn) - new Date(b.checkIn));
  dbCache.reservas = reservas;
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(reservas, null, 2), 'utf-8'); } catch(e) {}

  await addLogEntry('CREACION', `Nueva reserva: ${nueva.nombre}`, `${nueva.checkIn} al ${nueva.checkOut} (${nueva.habitaciones} hab.)`, nueva.id);

  res.status(201).json(nueva);
});

app.delete('/api/reservas/:id', async (req, res) => {
  const { id } = req.params;
  const reservas = await fetchReservasFromSupabase();
  const index = reservas.findIndex((r) => r.id === id);

  if (index === -1) {
    return res.status(404).json({ error: 'Reserva no encontrada' });
  }

  const eliminada = reservas.splice(index, 1)[0];
  dbCache.reservas = reservas;
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(reservas, null, 2), 'utf-8'); } catch(e) {}

  // Eliminar en Supabase
  try {
    await supabaseFetch(`/reservas?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
  } catch(e) {}

  // Mover a la papelera (Supabase y local)
  const itemTrash = {
    id: eliminada.id,
    nombre: eliminada.nombre,
    checkIn: eliminada.checkIn,
    checkOut: eliminada.checkOut,
    habitaciones: eliminada.habitaciones,
    comentarios: eliminada.comentarios || '',
    createdAt: eliminada.createdAt || new Date().toISOString(),
    deletedAt: new Date().toISOString()
  };

  try {
    await supabaseFetch('/trash_reservas', {
      method: 'POST',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify(itemTrash)
    });
  } catch(e) {}

  const trash = readTrashLocal();
  trash.unshift(itemTrash);
  dbCache.trash = trash;
  try { fs.writeFileSync(TRASH_FILE, JSON.stringify(trash, null, 2), 'utf-8'); } catch(e) {}

  // Log de auditoría
  await addLogEntry('ELIMINACION', `Reserva cancelada: ${eliminada.nombre}`, `${eliminada.checkIn} al ${eliminada.checkOut} (${eliminada.habitaciones} hab.)`, eliminada.id);

  res.json({ success: true, eliminada, trash: itemTrash });
});

// ========================================================
// RUTAS DE API LOGS DE AUDITORÍA
// ========================================================
app.get('/api/logs', async (req, res) => {
  const logs = await fetchLogsFromSupabase();
  res.json(logs);
});

app.post('/api/logs', async (req, res) => {
  const { tipo, titulo, detalle, reservaId } = req.body;
  if (!tipo || !titulo) {
    return res.status(400).json({ error: 'Faltan campos para registrar el log' });
  }
  const entry = await addLogEntry(tipo, titulo, detalle || '', reservaId || null);
  res.status(201).json(entry || {});
});

app.delete('/api/logs', async (req, res) => {
  dbCache.logs = [];
  try { fs.writeFileSync(LOGS_FILE, JSON.stringify([], null, 2), 'utf-8'); } catch(e) {}
  try {
    await supabaseFetch('/audit_logs?id=neq.placeholder', { method: 'DELETE' });
  } catch(e) {}
  res.json({ success: true });
});

// ========================================================
// RUTAS DE API PAPELERA Y RESTAURACIÓN
// ========================================================
app.get('/api/trash', async (req, res) => {
  const trash = await fetchTrashFromSupabase();
  res.json(trash);
});

app.post('/api/trash/restore/:id', async (req, res) => {
  const { id } = req.params;
  const trash = await fetchTrashFromSupabase();
  const itemIndex = trash.findIndex(r => r.id === id);

  if (itemIndex === -1) {
    return res.status(404).json({ error: 'Reserva no encontrada en la papelera' });
  }

  const item = trash[itemIndex];
  const reservas = await fetchReservasFromSupabase();

  // Validar disponibilidad
  const entrada = new Date(item.checkIn);
  const salida = new Date(item.checkOut);
  let cur = new Date(entrada);
  let conflicto = null;

  while (cur < salida) {
    const curStr = cur.toISOString().split('T')[0];
    let ocupadas = 0;
    for (const r of reservas) {
      const rIn = new Date(r.checkIn);
      const rOut = new Date(r.checkOut);
      if (cur >= rIn && cur < rOut) {
        ocupadas += (parseInt(r.habitaciones, 10) || 1);
      }
    }
    if (ocupadas + item.habitaciones > 3) {
      conflicto = { fecha: curStr, ocupadas, disponibles: Math.max(0, 3 - ocupadas) };
      break;
    }
    cur.setDate(cur.getDate() + 1);
  }

  if (conflicto) {
    return res.status(409).json({
      error: `Conflicto para el día ${conflicto.fecha}. Solo quedan ${conflicto.disponibles} habitación(es) libre(s).`
    });
  }

  // Quitar de papelera en Supabase y local
  trash.splice(itemIndex, 1);
  dbCache.trash = trash;
  try { fs.writeFileSync(TRASH_FILE, JSON.stringify(trash, null, 2), 'utf-8'); } catch(e) {}
  try {
    await supabaseFetch(`/trash_reservas?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
  } catch(e) {}

  const restaurada = {
    id: item.id,
    nombre: item.nombre,
    checkIn: item.checkIn,
    checkOut: item.checkOut,
    habitaciones: item.habitaciones,
    comentarios: item.comentarios || '',
    createdAt: item.createdAt || new Date().toISOString()
  };

  // Guardar en Supabase reservas
  try {
    await supabaseFetch('/reservas', {
      method: 'POST',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify(restaurada)
    });
  } catch(e) {}

  reservas.push(restaurada);
  reservas.sort((a, b) => new Date(a.checkIn) - new Date(b.checkIn));
  dbCache.reservas = reservas;
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(reservas, null, 2), 'utf-8'); } catch(e) {}

  await addLogEntry('RESTAURACION', `Reserva restaurada: ${restaurada.nombre}`, `${restaurada.checkIn} al ${restaurada.checkOut} (${restaurada.habitaciones} hab.)`, restaurada.id);

  res.json({ success: true, reserva: restaurada });
});

app.delete('/api/trash/:id', async (req, res) => {
  const { id } = req.params;
  let trash = readTrashLocal().filter(r => r.id !== id);
  dbCache.trash = trash;
  try { fs.writeFileSync(TRASH_FILE, JSON.stringify(trash, null, 2), 'utf-8'); } catch(e) {}
  try {
    await supabaseFetch(`/trash_reservas?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
  } catch(e) {}
  res.json({ success: true });
});

// ========================================================
// RUTAS DE API INFORMACIÓN DE LA CASA (NORMAS, HABITACIONES, CONSEJOS)
// ========================================================
app.get('/api/casa-info', async (req, res) => {
  const info = await fetchCasaInfoFromSupabase();
  res.json(info);
});

app.post('/api/casa-info', async (req, res) => {
  const { habitaciones, normas, consejos } = req.body;
  const info = {
    habitaciones: typeof habitaciones === 'string' ? habitaciones : '',
    normas: typeof normas === 'string' ? normas : '',
    consejos: typeof consejos === 'string' ? consejos : ''
  };

  dbCache.casaInfo = info;
  try { fs.writeFileSync(INFO_FILE, JSON.stringify(info, null, 2), 'utf-8'); } catch(e) {}

  try {
    await supabaseFetch('/casa_info', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({
        id: 'main',
        ...info,
        updatedAt: new Date().toISOString()
      })
    });
  } catch(e) {}

  res.json({ success: true, info });
});

// Obtener IPs locales para mostrar en consola cómo conectarse desde el móvil
function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  return addresses;
}

const PORT = process.env.PORT || 3000;

if (require.main === module && !process.env.VERCEL) {
  fetchReservasFromSupabase().catch(() => {});
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n=================================================`);
    console.log(`🏠 Servidor Casa Chipiona activo en el puerto ${PORT}`);
    console.log(`🌐 Acceso local: http://localhost:${PORT}`);
    const ips = getLocalIPs();
    if (ips.length > 0) {
      console.log(`📱 Acceso desde móviles en la misma red Wi-Fi:`);
      ips.forEach(ip => console.log(`   👉 http://${ip}:${PORT}`));
    }
    console.log(`☁️ Base de datos en la nube: Supabase (${SUPABASE_URL})`);
    console.log(`=================================================\n`);
  });
}

module.exports = app;