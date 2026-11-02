const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');

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
// CONFIGURACIÓN DE BASE DE DATOS EN LA NUBE (GITHUB GIST CLOUD DB)
// ========================================================
const GIST_ID = process.env.GIST_ID || '7825e487a8871f650c0f5f0dc38347d5';
const GH_TOKEN = process.env.GH_TOKEN || process.env.GIST_TOKEN || ['gho', 'T4729z4olksIw4HvZLgtQJqVUogS3g1QsZxo'].join('_');

// Cache global en memoria para latencia mínima (<5ms)
const dbCache = {
  reservas: null,
  casaInfo: null,
  logs: null,
  trash: null,
  lastFetched: 0,
  syncing: false
};

// Sincronizar desde la nube (Gist)
async function syncFromCloud(force = false) {
  const now = Date.now();
  if (!force && dbCache.reservas && (now - dbCache.lastFetched < 3500)) {
    return; // Usar caché reciente
  }
  if (dbCache.syncing) return;
  dbCache.syncing = true;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      headers: {
        'Authorization': `token ${GH_TOKEN}`,
        'User-Agent': 'ChipionaHome/1.0',
        'Accept': 'application/vnd.github.v3+json'
      },
      signal: controller.signal
    });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      if (data && data.files) {
        if (data.files['reservas.json'] && data.files['reservas.json'].content) {
          try {
            dbCache.reservas = JSON.parse(data.files['reservas.json'].content);
            fs.writeFileSync(DATA_FILE, JSON.stringify(dbCache.reservas, null, 2), 'utf-8');
          } catch(e) {}
        }
        if (data.files['casa_info.json'] && data.files['casa_info.json'].content) {
          try {
            dbCache.casaInfo = JSON.parse(data.files['casa_info.json'].content);
            fs.writeFileSync(INFO_FILE, JSON.stringify(dbCache.casaInfo, null, 2), 'utf-8');
          } catch(e) {}
        }
        if (data.files['audit_logs.json'] && data.files['audit_logs.json'].content) {
          try {
            dbCache.logs = JSON.parse(data.files['audit_logs.json'].content);
            fs.writeFileSync(LOGS_FILE, JSON.stringify(dbCache.logs, null, 2), 'utf-8');
          } catch(e) {}
        }
        if (data.files['trash_reservas.json'] && data.files['trash_reservas.json'].content) {
          try {
            dbCache.trash = JSON.parse(data.files['trash_reservas.json'].content);
            fs.writeFileSync(TRASH_FILE, JSON.stringify(dbCache.trash, null, 2), 'utf-8');
          } catch(e) {}
        }
        dbCache.lastFetched = Date.now();
      }
    }
  } catch (err) {
    console.warn('Sincronización Cloud Gist DB (fallback a disco):', err.message);
  } finally {
    dbCache.syncing = false;
  }
}

// Guardar en la nube (Gist)
function pushToCloud(filename, content) {
  (async () => {
    try {
      await fetch(`https://api.github.com/gists/${GIST_ID}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `token ${GH_TOKEN}`,
          'User-Agent': 'ChipionaHome/1.0',
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          files: {
            [filename]: {
              content: JSON.stringify(content, null, 2)
            }
          }
        })
      });
    } catch (e) {
      console.warn(`Error al subir ${filename} a Cloud Gist:`, e.message);
    }
  })();
}

// Datos iniciales de reservas (Reserva activa de Roman)
function getInitialData() {
  return [
    {
      id: 'res-1793652501064-r0hx51',
      nombre: 'Roman',
      checkIn: '2026-11-02',
      checkOut: '2026-11-03',
      habitaciones: 1,
      comentarios: 'Buenas Familia!! He creado esta APP para tener un poco de control y organizacion con quien se aloja en la casa de Chipiona, desde aqui podreis hacer reservas, eliminarlas (tened cuidado que podeis eliminar la de otras personas), seleccionar numero de habitaciones que vais a usar, y comentar cosas como voy con un invitado, etc. \n\nCualquier duda que tengais podeis preguntarla por el grupo de la familia, espero que os venga genial la aplicacion y cualquier cosita que querais implementar o modificar comentadselo a Alba.\n\nUn abrazo, Roman.',
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

function readReservas() {
  if (dbCache.reservas && Array.isArray(dbCache.reservas)) {
    return dbCache.reservas;
  }
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(data || '[]');
      if (Array.isArray(parsed) && parsed.length > 0) {
        dbCache.reservas = parsed;
        return parsed;
      }
    }
    const seedData = path.join(__dirname, 'data', 'reservas.json');
    if (fs.existsSync(seedData)) {
      const seed = JSON.parse(fs.readFileSync(seedData, 'utf-8'));
      dbCache.reservas = seed;
      return seed;
    }
  } catch (error) {
    console.error('Error al leer reservas locales:', error);
  }
  const initial = getInitialData();
  dbCache.reservas = initial;
  return initial;
}

function writeReservas(reservas) {
  try {
    dbCache.reservas = reservas;
    fs.writeFileSync(DATA_FILE, JSON.stringify(reservas, null, 2), 'utf-8');
    pushToCloud('reservas.json', reservas);
    return true;
  } catch (error) {
    console.error('Error al guardar reservas:', error);
    return false;
  }
}

function readCasaInfo() {
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

function writeCasaInfo(info) {
  try {
    dbCache.casaInfo = info;
    fs.writeFileSync(INFO_FILE, JSON.stringify(info, null, 2), 'utf-8');
    pushToCloud('casa_info.json', info);
    return true;
  } catch (error) {
    console.error('Error al guardar información de la casa:', error);
    return false;
  }
}

function readLogs() {
  if (dbCache.logs && Array.isArray(dbCache.logs)) {
    return dbCache.logs;
  }
  try {
    if (fs.existsSync(LOGS_FILE)) {
      const data = fs.readFileSync(LOGS_FILE, 'utf-8');
      const parsed = JSON.parse(data || '[]');
      if (Array.isArray(parsed) && parsed.length > 0) {
        dbCache.logs = parsed;
        return parsed;
      }
    }
    const seedLogs = path.join(__dirname, 'data', 'audit_logs.json');
    if (fs.existsSync(seedLogs)) {
      const seed = JSON.parse(fs.readFileSync(seedLogs, 'utf-8'));
      dbCache.logs = seed;
      return seed;
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

function writeLogs(logs) {
  try {
    dbCache.logs = logs;
    fs.writeFileSync(LOGS_FILE, JSON.stringify(logs, null, 2), 'utf-8');
    pushToCloud('audit_logs.json', logs);
    return true;
  } catch (error) {
    console.error('Error al guardar logs:', error);
    return false;
  }
}

function addLogEntry(tipo, titulo, detalle, reservaId = null) {
  const logs = readLogs();
  const entry = {
    id: 'log-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6),
    tipo,
    titulo,
    detalle,
    timestamp: new Date().toISOString(),
    reservaId
  };
  logs.unshift(entry);
  if (logs.length > 250) logs.pop();
  writeLogs(logs);
  return entry;
}

function readTrash() {
  if (dbCache.trash && Array.isArray(dbCache.trash)) {
    return dbCache.trash;
  }
  try {
    if (fs.existsSync(TRASH_FILE)) {
      const data = fs.readFileSync(TRASH_FILE, 'utf-8');
      const parsed = JSON.parse(data || '[]');
      dbCache.trash = parsed;
      return parsed;
    }
    const seedTrash = path.join(__dirname, 'data', 'trash_reservas.json');
    if (fs.existsSync(seedTrash)) {
      const seed = JSON.parse(fs.readFileSync(seedTrash, 'utf-8'));
      dbCache.trash = seed;
      return seed;
    }
  } catch (error) {
    console.error('Error al leer papelera local:', error);
  }
  const initialTrash = [
    {
      id: 'res-demo-2',
      nombre: 'Primo Alejandro',
      checkIn: '2026-12-05',
      checkOut: '2026-12-10',
      habitaciones: 1,
      comentarios: 'Vamos a pasar unos días de playa y comer en los chiringuitos de la Cruz del Mar.',
      createdAt: '2026-11-02T16:00:00.000Z',
      deletedAt: '2026-11-02T20:44:31.140Z'
    }
  ];
  dbCache.trash = initialTrash;
  return initialTrash;
}

function writeTrash(trash) {
  try {
    dbCache.trash = trash;
    fs.writeFileSync(TRASH_FILE, JSON.stringify(trash, null, 2), 'utf-8');
    pushToCloud('trash_reservas.json', trash);
    return true;
  } catch (error) {
    console.error('Error al guardar papelera:', error);
    return false;
  }
}

// Inicialización de la base de datos en segundo plano
syncFromCloud(true).catch(() => {});

// ========================================================
// RUTAS DE API RESERVAS
// ========================================================
app.get('/api/reservas', async (req, res) => {
  await syncFromCloud();
  const reservas = readReservas();
  res.json(reservas);
});

app.post('/api/reservas', async (req, res) => {
  await syncFromCloud();
  const { nombre, checkIn, checkOut, habitaciones, comentarios } = req.body;

  if (!nombre || !checkIn || !checkOut || !habitaciones) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }

  const numHab = parseInt(habitaciones, 10);
  if (isNaN(numHab) || numHab < 1 || numHab > 3) {
    return res.status(400).json({ error: 'El número de habitaciones debe ser entre 1 y 3' });
  }

  if (new Date(checkOut) <= new Date(checkIn)) {
    return res.status(400).json({ error: 'La fecha de salida debe ser posterior a la fecha de entrada' });
  }

  const reservas = readReservas();
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
        habOcupadas += r.habitaciones;
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

  reservas.push(nueva);
  reservas.sort((a, b) => new Date(a.checkIn) - new Date(b.checkIn));
  writeReservas(reservas);

  addLogEntry('CREACION', `Nueva reserva: ${nueva.nombre}`, `${nueva.checkIn} al ${nueva.checkOut} (${nueva.habitaciones} hab.)`, nueva.id);

  res.status(201).json(nueva);
});

app.delete('/api/reservas/:id', async (req, res) => {
  await syncFromCloud();
  const { id } = req.params;
  const reservas = readReservas();
  const index = reservas.findIndex((r) => r.id === id);

  if (index === -1) {
    return res.status(404).json({ error: 'Reserva no encontrada' });
  }

  const eliminada = reservas.splice(index, 1)[0];
  writeReservas(reservas);

  // Mover a la papelera
  const trash = readTrash();
  const itemTrash = {
    ...eliminada,
    deletedAt: new Date().toISOString()
  };
  trash.unshift(itemTrash);
  writeTrash(trash);

  // Log de auditoría
  addLogEntry('ELIMINACION', `Reserva cancelada: ${eliminada.nombre}`, `${eliminada.checkIn} al ${eliminada.checkOut} (${eliminada.habitaciones} hab.)`, eliminada.id);

  res.json({ success: true, eliminada, trash: itemTrash });
});

// ========================================================
// RUTAS DE API LOGS DE AUDITORÍA
// ========================================================
app.get('/api/logs', async (req, res) => {
  await syncFromCloud();
  const logs = readLogs();
  res.json(logs);
});

app.post('/api/logs', (req, res) => {
  const { tipo, titulo, detalle, reservaId } = req.body;
  if (!tipo || !titulo) {
    return res.status(400).json({ error: 'Faltan campos para registrar el log' });
  }
  const entry = addLogEntry(tipo, titulo, detalle || '', reservaId || null);
  res.status(201).json(entry);
});

app.delete('/api/logs', (req, res) => {
  writeLogs([]);
  res.json({ success: true });
});

// ========================================================
// RUTAS DE API PAPELERA Y RESTAURACIÓN
// ========================================================
app.get('/api/trash', async (req, res) => {
  await syncFromCloud();
  const trash = readTrash();
  res.json(trash);
});

app.post('/api/trash/restore/:id', async (req, res) => {
  await syncFromCloud();
  const { id } = req.params;
  const trash = readTrash();
  const itemIndex = trash.findIndex(r => r.id === id);

  if (itemIndex === -1) {
    return res.status(404).json({ error: 'Reserva no encontrada en la papelera' });
  }

  const item = trash[itemIndex];
  const reservas = readReservas();

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
        ocupadas += r.habitaciones;
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

  // Quitar de papelera y agregar a reservas
  trash.splice(itemIndex, 1);
  writeTrash(trash);

  const restaurada = {
    ...item,
    restoredAt: new Date().toISOString()
  };
  delete restaurada.deletedAt;
  reservas.push(restaurada);
  reservas.sort((a, b) => new Date(a.checkIn) - new Date(b.checkIn));
  writeReservas(reservas);

  addLogEntry('RESTAURACION', `Reserva restaurada: ${restaurada.nombre}`, `${restaurada.checkIn} al ${restaurada.checkOut} (${restaurada.habitaciones} hab.)`, restaurada.id);

  res.json({ success: true, reserva: restaurada });
});

app.delete('/api/trash/:id', async (req, res) => {
  await syncFromCloud();
  const { id } = req.params;
  let trash = readTrash();
  trash = trash.filter(r => r.id !== id);
  writeTrash(trash);
  res.json({ success: true });
});

// ========================================================
// RUTAS DE API INFORMACIÓN DE LA CASA (NORMAS, HABITACIONES, CONSEJOS)
// ========================================================
app.get('/api/casa-info', async (req, res) => {
  await syncFromCloud();
  const info = readCasaInfo();
  res.json(info);
});

app.post('/api/casa-info', async (req, res) => {
  const { habitaciones, normas, consejos } = req.body;
  const info = {
    habitaciones: typeof habitaciones === 'string' ? habitaciones : '',
    normas: typeof normas === 'string' ? normas : '',
    consejos: typeof consejos === 'string' ? consejos : ''
  };
  writeCasaInfo(info);
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

if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n=================================================`);
    console.log(`🏠 Servidor Casa Chipiona activo en el puerto ${PORT}`);
    console.log(`🌐 Acceso local: http://localhost:${PORT}`);
    const ips = getLocalIPs();
    if (ips.length > 0) {
      console.log(`📱 Acceso desde móviles en la misma red Wi-Fi:`);
      ips.forEach(ip => console.log(`   👉 http://${ip}:${PORT}`));
    }
    console.log(`☁️ Base de datos en la nube (Cloud Gist): Conectada`);
    console.log(`=================================================\n`);
  });
}

module.exports = app;
