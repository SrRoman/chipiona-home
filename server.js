const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const DATA_DIR = process.env.VERCEL ? path.join('/tmp', 'data') : path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'reservas.json');
const INFO_FILE = path.join(DATA_DIR, 'casa_info.json');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

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
  if (!fs.existsSync(DATA_FILE) && fs.existsSync(seedData)) {
    fs.copyFileSync(seedData, DATA_FILE);
  }
  if (!fs.existsSync(INFO_FILE) && fs.existsSync(seedInfo)) {
    fs.copyFileSync(seedInfo, INFO_FILE);
  }
}

// Datos iniciales de demostración de reservas si el archivo no existe
function getInitialData() {
  const today = new Date();
  const format = (d) => d.toISOString().split('T')[0];
  
  const d1 = new Date(today.getFullYear(), today.getMonth(), 12);
  const d2 = new Date(today.getFullYear(), today.getMonth(), 16);
  const d3 = new Date(today.getFullYear(), today.getMonth() + 1, 5);
  const d4 = new Date(today.getFullYear(), today.getMonth() + 1, 10);

  return [
    {
      id: 'res-demo-1',
      nombre: 'Tía Carmen',
      checkIn: format(d1),
      checkOut: format(d2),
      habitaciones: 2,
      comentarios: 'Llegaremos el viernes sobre las 18:00. Llevamos nosotros sábanas.',
      createdAt: new Date().toISOString()
    },
    {
      id: 'res-demo-2',
      nombre: 'Primo Alejandro',
      checkIn: format(d3),
      checkOut: format(d4),
      habitaciones: 1,
      comentarios: 'Voy con dos amigos a pasar el fin de semana y ver las carreras.',
      createdAt: new Date().toISOString()
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
      const initial = getInitialData();
      fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2), 'utf-8');
      return initial;
    }
    const data = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(data || '[]');
  } catch (error) {
    console.error('Error al leer reservas:', error);
    return [];
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
  writeReservas(reservas);

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

  res.json({ success: true, eliminada });
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
