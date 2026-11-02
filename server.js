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
    fs.copyFileSync(seedData, DATA_FILE);
  }
  if (!fs.existsSync(INFO_FILE) && fs.existsSync(seedInfo)) {
    fs.copyFileSync(seedInfo, INFO_FILE);
  }
  if (!fs.existsSync(LOGS_FILE) && fs.existsSync(seedLogs)) {
    fs.copyFileSync(seedLogs, LOGS_FILE);
  }
  if (!fs.existsSync(TRASH_FILE) && fs.existsSync(seedTrash)) {
    fs.copyFileSync(seedTrash, TRASH_FILE);
  }
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
  try {
    if (!fs.existsSync(DATA_FILE)) {
      const seedData = path.join(__dirname, 'data', 'reservas.json');
      if (fs.existsSync(seedData)) {
        const seed = JSON.parse(fs.readFileSync(seedData, 'utf-8'));
        fs.writeFileSync(DATA_FILE, JSON.stringify(seed, null, 2), 'utf-8');
        return seed;
      }
      const initial = getInitialData();
      fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2), 'utf-8');
      return initial;
    }
    const data = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(data || '[]');
  } catch (error) {
    console.error('Error al leer reservas:', error);
    return getInitialData();
  }
}

function writeReservas(reservas) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(reservas, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error('Error al guardar reservas:', error);
    return false;
  }
}

function readCasaInfo() {
  try {
    if (!fs.existsSync(INFO_FILE)) {
      const initial = getDefaultCasaInfo();
      fs.writeFileSync(INFO_FILE, JSON.stringify(initial, null, 2), 'utf-8');
      return initial;
    }
    const data = fs.readFileSync(INFO_FILE, 'utf-8');
    return JSON.parse(data || '{}');
  } catch (error) {
    console.error('Error al leer información de la casa:', error);
    return getDefaultCasaInfo();
  }
}

function writeCasaInfo(info) {
  try {
    fs.writeFileSync(INFO_FILE, JSON.stringify(info, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error('Error al guardar información de la casa:', error);
    return false;
  }
}

function readLogs() {
  try {
    if (!fs.existsSync(LOGS_FILE)) {
      const seedLogs = path.join(__dirname, 'data', 'audit_logs.json');
      if (fs.existsSync(seedLogs)) {
        const seed = JSON.parse(fs.readFileSync(seedLogs, 'utf-8'));
        fs.writeFileSync(LOGS_FILE, JSON.stringify(seed, null, 2), 'utf-8');
        return seed;
      }
      const initialLogs = [
        {
          id: 'log-1793652501241-l3fs4m',
          tipo: 'CREACION',
          titulo: 'Nueva reserva: Roman',
          detalle: '2026-11-02 al 2026-11-03 (1 hab.)',
          timestamp: '2026-11-02T20:48:21.241Z',
          reservaId: 'res-1793652501064-r0hx51'
        },
        {
          id: 'log-1793652238728-qu1v7w',
          tipo: 'ELIMINACION',
          titulo: 'Reserva cancelada: Primo Alejandro',
          detalle: '2026-12-05 al 2026-12-10 (1 hab.)',
          timestamp: '2026-11-02T20:43:58.728Z',
          reservaId: 'res-demo-2'
        }
      ];
      fs.writeFileSync(LOGS_FILE, JSON.stringify(initialLogs, null, 2), 'utf-8');
      return initialLogs;
    }
    const data = fs.readFileSync(LOGS_FILE, 'utf-8');
    return JSON.parse(data || '[]');
  } catch (error) {
    console.error('Error al leer logs:', error);
    return [];
  }
}

function writeLogs(logs) {
  try {
    fs.writeFileSync(LOGS_FILE, JSON.stringify(logs, null, 2), 'utf-8');
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
  try {
    if (!fs.existsSync(TRASH_FILE)) {
      const seedTrash = path.join(__dirname, 'data', 'trash_reservas.json');
      if (fs.existsSync(seedTrash)) {
        const seed = JSON.parse(fs.readFileSync(seedTrash, 'utf-8'));
        fs.writeFileSync(TRASH_FILE, JSON.stringify(seed, null, 2), 'utf-8');
        return seed;
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
      fs.writeFileSync(TRASH_FILE, JSON.stringify(initialTrash, null, 2), 'utf-8');
      return initialTrash;
    }
    const data = fs.readFileSync(TRASH_FILE, 'utf-8');
    return JSON.parse(data || '[]');
  } catch (error) {
    console.error('Error al leer papelera:', error);
    return [];
  }
}

function writeTrash(trash) {
  try {
    fs.writeFileSync(TRASH_FILE, JSON.stringify(trash, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error('Error al guardar papelera:', error);
    return false;
  }
}

// Rutas de API Reservas
app.get('/api/reservas', (req, res) => {
  const reservas = readReservas();
  res.json(reservas);
});

app.post('/api/reservas', (req, res) => {
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
      error: `No hay suficientes habitaciones disponibles para el día ${conflicto.fecha}. Actualmente quedan ${conflicto.disponibles} habitación(es) libre(s).`
    });
  }

  const nuevaReserva = {
    id: 'res-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6),
    nombre: nombre.trim(),
    checkIn,
    checkOut,
    habitaciones: numHab,
    comentarios: comentarios ? comentarios.trim() : '',
    createdAt: new Date().toISOString()
  };

  reservas.push(nuevaReserva);
  reservas.sort((a, b) => new Date(a.checkIn) - new Date(b.checkIn));
  writeReservas(reservas);

  addLogEntry('CREACION', `Nueva reserva: ${nuevaReserva.nombre}`, `${nuevaReserva.checkIn} al ${nuevaReserva.checkOut} (${nuevaReserva.habitaciones} hab.)`, nuevaReserva.id);

  res.status(201).json(nuevaReserva);
});

app.delete('/api/reservas/:id', (req, res) => {
  const { id } = req.params;
  let reservas = readReservas();
  const index = reservas.findIndex((r) => r.id === id);

  if (index === -1) {
    return res.status(404).json({ error: 'Reserva no encontrada' });
  }

  const eliminada = reservas.splice(index, 1)[0];
  writeReservas(reservas);

  // Mover a la papelera
  const trash = readTrash();
  const itemTrash = { ...eliminada, deletedAt: new Date().toISOString() };
  trash.unshift(itemTrash);
  writeTrash(trash);

  // Registrar en logs de auditoría
  addLogEntry('ELIMINACION', `Reserva cancelada: ${eliminada.nombre}`, `${eliminada.checkIn} al ${eliminada.checkOut} (${eliminada.habitaciones} hab.)`, id);

  res.json({ success: true, eliminada, trash: itemTrash });
});

// Rutas de API Logs de Auditoría
app.get('/api/logs', (req, res) => {
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

// Rutas de API Papelera y Restauración
app.get('/api/trash', (req, res) => {
  const trash = readTrash();
  res.json(trash);
});

app.post('/api/trash/restore/:id', (req, res) => {
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

app.delete('/api/trash/:id', (req, res) => {
  const { id } = req.params;
  let trash = readTrash();
  trash = trash.filter(r => r.id !== id);
  writeTrash(trash);
  res.json({ success: true });
});

// Rutas de API Información de La Casa (Normas, Habitaciones, Consejos)
app.get('/api/casa-info', (req, res) => {
  const info = readCasaInfo();
  res.json(info);
});

app.post('/api/casa-info', (req, res) => {
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

if (!process.env.VERCEL) {
  app.listen(PORT, '0.0.0.0', () => {
    const ips = getLocalIPs();
    console.log('\n======================================================');
    console.log(`🏖️  CASA FAMILIAR CHIPIONA - WEB DE RESERVAS`);
    console.log(`======================================================`);
    console.log(`💻 En este ordenador:   http://localhost:${PORT}`);
    if (ips.length > 0) {
      console.log(`📱 En el MÓVIL (misma Wi-Fi familiar):`);
      ips.forEach(ip => console.log(`   👉 http://${ip}:${PORT}`));
    }
    console.log(`======================================================\n`);
  });
}

module.exports = app;
