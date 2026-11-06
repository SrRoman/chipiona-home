/**
 * Capa de persistencia para Casa Chipiona
 * Sincronización en tiempo real con Supabase Cloud DB
 * y persistencia en LocalStorage para funcionamiento ultra-rápido y offline.
 */
const StorageService = {
  isApiAvailable: true,
  STORAGE_KEY: 'chipiona_reservas_data',
  CASA_INFO_KEY: 'chipiona_casa_info_data',
  LOGS_STORAGE_KEY: 'chipiona_audit_logs',
  TRASH_STORAGE_KEY: 'chipiona_deleted_reservas',

  SUPABASE_URL: 'https://ktvytchrrowvvwlglreo.supabase.co',
  SUPABASE_KEY: 'sb_publishable_of7Wn9ExHHD5RyrWu-M7og_nId7gtm6',

  // Filtro definitivo para erradicar cualquier residuo de "Tío Paco"
  isPaco(item) {
    if (!item) return false;
    if (item.id === 'res-1793658792196-17qt67' || item.reservaId === 'res-1793658792196-17qt67') return true;
    const str = JSON.stringify(item).toLowerCase();
    return str.includes('paco') || str.includes('1793658792196');
  },

  // Purgar de forma automática y definitiva cualquier rastro de "Tío Paco" en todos los almacenamientos locales
  purgePaco() {
    [this.STORAGE_KEY, this.TRASH_STORAGE_KEY, this.LOGS_STORAGE_KEY].forEach(key => {
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const items = JSON.parse(raw);
          if (Array.isArray(items)) {
            const filtered = items.filter(item => !this.isPaco(item));
            localStorage.setItem(key, JSON.stringify(filtered));
          }
        }
      } catch (e) {}
    });
  },

  // Reparador de caracteres y tildes corruptas (mojibake)
  fixEncoding(obj) {
    if (!obj) return obj;
    if (typeof obj === 'string') {
      return obj
        .replace(/Habitaci[\uFFFD\?]n/gi, 'Habitación')
        .replace(/ni[\uFFFD\?]os/gi, 'niños')
        .replace(/ni[\uFFFD\?]as/gi, 'niñas')
        .replace(/j[\uFFFD\?]venes/gi, 'jóvenes')
        .replace(/s[\uFFFD\?]banas/gi, 'sábanas')
        .replace(/olvid[\uFFFD\?]is/gi, 'olvidéis')
        .replace(/C[\uFFFD\?]diz/gi, 'Cádiz')
        .replace(/T[\uFFFD\?]a/gi, 'Tía')
        .replace(/T[\uFFFD\?]o/gi, 'Tío')
        .replace(/[\uFFFD]/g, '');
    }
    if (Array.isArray(obj)) {
      return obj.map(item => this.fixEncoding(item));
    }
    if (typeof obj === 'object') {
      const fixed = {};
      for (const key of Object.keys(obj)) {
        fixed[key] = this.fixEncoding(obj[key]);
      }
      return fixed;
    }
    return obj;
  },

  // Helper universal para comunicación directa con Supabase REST (fallback para entornos estáticos)
  async supabaseDirectFetch(endpoint, options = {}) {
    const url = `${this.SUPABASE_URL}/rest/v1${endpoint}`;
    const headers = {
      'apikey': this.SUPABASE_KEY,
      'Authorization': `Bearer ${this.SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      return await fetch(url, { ...options, headers, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  },

  // Inicializar y conectar con la base de datos cloud
  async init() {
    this.purgePaco();
    this.isApiAvailable = true;
    try {
      const res = await fetch('/api/reservas');
      if (res.ok) {
        this.isApiAvailable = true;
        console.log('✅ Conectado a la API Backend (/api/reservas)');
        return;
      }
    } catch (e) {}

    try {
      const sRes = await this.supabaseDirectFetch('/reservas?select=*&limit=1');
      if (sRes.ok) {
        console.log('✅ Conectado directamente a Supabase Cloud DB');
      }
    } catch(e) {}
  },

  // Obtener reservas de forma síncrona desde LocalStorage para carga instantánea en 0ms
  getLocalReservas() {
    this.purgePaco();
    try {
      const local = localStorage.getItem(this.STORAGE_KEY);
      if (local !== null) {
        const parsed = JSON.parse(local);
        if (Array.isArray(parsed)) {
          const clean = this.fixEncoding(parsed).filter(r => !this.isPaco(r));
          localStorage.setItem(this.STORAGE_KEY, JSON.stringify(clean));
          return clean;
        }
      }
    } catch (e) {
      console.warn('Error leyendo reservas locales:', e);
    }

    const initial = this.getInitialDemoData();
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(initial));
    } catch(e) {}
    return initial;
  },

  // Obtener info de la casa de forma síncrona desde LocalStorage
  getLocalCasaInfo() {
    try {
      const local = localStorage.getItem(this.CASA_INFO_KEY);
      if (local) {
        const parsed = JSON.parse(local);
        if (parsed && parsed.habitaciones) {
          return this.fixEncoding(parsed);
        }
      }
    } catch (e) {
      console.warn('Error leyendo casa-info local:', e);
    }
    const defaultInfo = this.getDefaultCasaInfo();
    try {
      localStorage.setItem(this.CASA_INFO_KEY, JSON.stringify(defaultInfo));
    } catch(e) {}
    return defaultInfo;
  },

  // Obtener todas las reservas desde la base de datos cloud con fallback local
  async getReservas() {
    this.purgePaco();
    const local = this.getLocalReservas();

    // 1. Intentar vía backend API
    try {
      const res = await fetch('/api/reservas');
      if (res.ok) {
        let serverData = await res.json();
        serverData = this.fixEncoding(serverData);
        if (Array.isArray(serverData)) {
          const clean = serverData.filter(r => !this.isPaco(r));
          clean.sort((a, b) => new Date(a.checkIn) - new Date(b.checkIn));
          localStorage.setItem(this.STORAGE_KEY, JSON.stringify(clean));
          return clean;
        }
      }
    } catch (e) {}

    // 2. Fallback: Conexión directa a Supabase Cloud
    try {
      const sRes = await this.supabaseDirectFetch('/reservas?select=*&order=checkIn.asc');
      if (sRes.ok) {
        let sData = await sRes.json();
        if (Array.isArray(sData)) {
          const clean = this.fixEncoding(sData)
            .filter(r => !this.isPaco(r))
            .map(r => ({
              id: r.id,
              nombre: r.nombre,
              checkIn: r.checkIn || r.check_in,
              checkOut: r.checkOut || r.check_out,
              habitaciones: parseInt(r.habitaciones, 10) || 1,
              comentarios: r.comentarios || '',
              createdAt: r.createdAt || r.created_at || new Date().toISOString()
            }));
          clean.sort((a, b) => new Date(a.checkIn) - new Date(b.checkIn));
          localStorage.setItem(this.STORAGE_KEY, JSON.stringify(clean));
          return clean;
        }
      }
    } catch (e) {}

    return local;
  },

  // Añadir una nueva reserva a la base de datos cloud
  async addReserva(reservaData) {
    this.purgePaco();
    if (this.isPaco(reservaData)) {
      throw new Error('Datos de reserva no válidos');
    }

    // 1. Intentar guardar vía API backend
    try {
      const res = await fetch('/api/reservas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(reservaData),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al guardar la reserva');
      }
      const fixed = this.fixEncoding(data);
      
      const local = this.getLocalReservas().filter(r => r.id !== fixed.id && !this.isPaco(r));
      local.push(fixed);
      local.sort((a, b) => new Date(a.checkIn) - new Date(b.checkIn));
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(local));

      this.addAuditLog('CREACION', `Nueva reserva: ${fixed.nombre}`, `${fixed.checkIn} al ${fixed.checkOut} (${fixed.habitaciones} hab.)`, fixed.id);
      return fixed;
    } catch (e) {
      if (e.message && e.message.includes('Conflicto')) {
        throw e;
      }
      console.warn('API backend no disponible, intentando Supabase directo:', e);
    }

    // 2. Si falló la API backend, validar disponibilidad y guardar en Supabase directo
    const reservas = this.getLocalReservas();
    this.validarDisponibilidad(reservaData, reservas);

    const nueva = {
      id: 'res-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6),
      nombre: reservaData.nombre.trim(),
      checkIn: reservaData.checkIn,
      checkOut: reservaData.checkOut,
      habitaciones: parseInt(reservaData.habitaciones, 10),
      comentarios: (reservaData.comentarios || '').trim(),
      createdAt: new Date().toISOString()
    };

    try {
      await this.supabaseDirectFetch('/reservas', {
        method: 'POST',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify(nueva)
      });
    } catch (sErr) {
      console.warn('Supabase directo no disponible, guardando localmente:', sErr);
    }

    const local = reservas.filter(r => r.id !== nueva.id && !this.isPaco(r));
    local.push(nueva);
    local.sort((a, b) => new Date(a.checkIn) - new Date(b.checkIn));
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(local));
    this.addAuditLog('CREACION', `Nueva reserva: ${nueva.nombre}`, `${nueva.checkIn} al ${nueva.checkOut} (${nueva.habitaciones} hab.)`, nueva.id);
    return nueva;
  },

  // Eliminar / Cancelar reserva (La mueve a la papelera en la nube para poder recuperarla)
  async deleteReserva(id) {
    this.purgePaco();
    const reservas = this.getLocalReservas();
    const reservaABorrar = reservas.find((r) => r.id === id);

    if (reservaABorrar) {
      this.moveToTrash(reservaABorrar);
      this.addAuditLog('ELIMINACION', `Reserva cancelada: ${reservaABorrar.nombre}`, `${reservaABorrar.checkIn} al ${reservaABorrar.checkOut} (${reservaABorrar.habitaciones} hab.)`, id);
    }

    // Intentar en backend API
    try {
      const res = await fetch(`/api/reservas/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        const filtradas = reservas.filter((r) => r.id !== id);
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filtradas));
        return true;
      }
    } catch (e) {}

    // Fallback: Intentar directamente en Supabase
    try {
      await this.supabaseDirectFetch(`/reservas?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (reservaABorrar) {
        const itemTrash = {
          ...reservaABorrar,
          deletedAt: new Date().toISOString()
        };
        await this.supabaseDirectFetch('/trash_reservas', {
          method: 'POST',
          headers: { 'Prefer': 'return=representation' },
          body: JSON.stringify(itemTrash)
        });
      }
    } catch (e) {}

    const filtradas = reservas.filter((r) => r.id !== id);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filtradas));
    return true;
  },

  // ========================================================
  // AUDITORÍA: HISTORIAL DE LOGS DE ACTIVIDAD
  // ========================================================
  getLocalAuditLogs() {
    this.purgePaco();
    try {
      const local = localStorage.getItem(this.LOGS_STORAGE_KEY);
      if (local) {
        const parsed = JSON.parse(local);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const clean = this.fixEncoding(parsed).filter(l => !this.isPaco(l));
          localStorage.setItem(this.LOGS_STORAGE_KEY, JSON.stringify(clean));
          return clean;
        }
      }
    } catch (e) {
      console.warn('Error leyendo logs locales:', e);
    }
    const demoLogs = this.getDefaultLogs().filter(l => !this.isPaco(l));
    try {
      localStorage.setItem(this.LOGS_STORAGE_KEY, JSON.stringify(demoLogs));
    } catch(e) {}
    return demoLogs;
  },

  async getAuditLogs() {
    this.purgePaco();
    const localLogs = this.getLocalAuditLogs();

    // 1. Intentar backend API
    try {
      const res = await fetch('/api/logs');
      if (res.ok) {
        let serverLogs = await res.json();
        serverLogs = this.fixEncoding(serverLogs);
        if (Array.isArray(serverLogs)) {
          const clean = serverLogs.filter(l => !this.isPaco(l));
          clean.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
          localStorage.setItem(this.LOGS_STORAGE_KEY, JSON.stringify(clean));
          return clean;
        }
      }
    } catch (e) {}

    // 2. Supabase directo
    try {
      const sRes = await this.supabaseDirectFetch('/audit_logs?select=*&order=timestamp.desc&limit=250');
      if (sRes.ok) {
        let sLogs = await sRes.json();
        if (Array.isArray(sLogs)) {
          const clean = this.fixEncoding(sLogs).filter(l => !this.isPaco(l));
          clean.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
          localStorage.setItem(this.LOGS_STORAGE_KEY, JSON.stringify(clean));
          return clean;
        }
      }
    } catch (e) {}

    return localLogs;
  },

  addAuditLog(tipo, titulo, detalle, reservaId = null) {
    if (this.isPaco({ titulo, detalle, reservaId })) return null;
    const logs = this.getLocalAuditLogs();
    const entry = {
      id: 'log-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6),
      tipo, // 'CREACION', 'ELIMINACION', 'RESTAURACION'
      titulo: this.fixEncoding(titulo),
      detalle: this.fixEncoding(detalle),
      timestamp: new Date().toISOString(),
      reservaId
    };

    logs.unshift(entry);
    if (logs.length > 250) logs.pop();
    try {
      localStorage.setItem(this.LOGS_STORAGE_KEY, JSON.stringify(logs));
    } catch(e) {}

    fetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(entry)
    }).catch(() => {
      this.supabaseDirectFetch('/audit_logs', {
        method: 'POST',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify(entry)
      }).catch(() => {});
    });

    return entry;
  },

  async clearAuditLogs() {
    try {
      localStorage.setItem(this.LOGS_STORAGE_KEY, JSON.stringify([]));
    } catch(e) {}

    try {
      await fetch('/api/logs', { method: 'DELETE' });
    } catch(e) {}

    try {
      await this.supabaseDirectFetch('/audit_logs?id=neq.placeholder', { method: 'DELETE' });
    } catch(e) {}

    return true;
  },

  // ========================================================
  // PAPELERA DE RECICLAJE Y RECUPERACIÓN DE RESERVAS
  // ========================================================
  getLocalTrash() {
    this.purgePaco();
    try {
      const local = localStorage.getItem(this.TRASH_STORAGE_KEY);
      if (local) {
        const parsed = JSON.parse(local);
        if (Array.isArray(parsed)) {
          const clean = this.fixEncoding(parsed).filter(t => !this.isPaco(t));
          localStorage.setItem(this.TRASH_STORAGE_KEY, JSON.stringify(clean));
          return clean;
        }
      }
    } catch (e) {
      console.warn('Error leyendo papelera local:', e);
    }
    const def = this.getDefaultTrash();
    try {
      localStorage.setItem(this.TRASH_STORAGE_KEY, JSON.stringify(def));
    } catch(e) {}
    return def;
  },

  async getTrashReservas() {
    this.purgePaco();
    const localTrash = this.getLocalTrash();

    // 1. Backend API
    try {
      const res = await fetch('/api/trash');
      if (res.ok) {
        let serverTrash = await res.json();
        serverTrash = this.fixEncoding(serverTrash);
        if (Array.isArray(serverTrash)) {
          const clean = serverTrash.filter(t => !this.isPaco(t));
          localStorage.setItem(this.TRASH_STORAGE_KEY, JSON.stringify(clean));
          return clean;
        }
      }
    } catch (e) {}

    // 2. Supabase directo
    try {
      const sRes = await this.supabaseDirectFetch('/trash_reservas?select=*&order=deletedAt.desc');
      if (sRes.ok) {
        let sTrash = await sRes.json();
        if (Array.isArray(sTrash)) {
          const clean = this.fixEncoding(sTrash).filter(t => !this.isPaco(t));
          localStorage.setItem(this.TRASH_STORAGE_KEY, JSON.stringify(clean));
          return clean;
        }
      }
    } catch (e) {}

    return localTrash;
  },

  moveToTrash(reserva) {
    if (this.isPaco(reserva)) return null;
    const trash = this.getLocalTrash();
    const item = {
      ...reserva,
      deletedAt: new Date().toISOString()
    };
    const filtrada = trash.filter(r => r.id !== item.id && !this.isPaco(r));
    filtrada.unshift(item);
    try {
      localStorage.setItem(this.TRASH_STORAGE_KEY, JSON.stringify(filtrada));
    } catch(e) {}
    return item;
  },

  async restoreFromTrash(id) {
    this.purgePaco();
    const trash = this.getLocalTrash();
    const item = trash.find(r => r.id === id);
    if (!item) {
      throw new Error('La reserva ya no se encuentra en la papelera');
    }

    try {
      const res = await fetch(`/api/trash/restore/${id}`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        const restaurada = this.fixEncoding(data.reserva || item);
        const reservas = this.getLocalReservas().filter(r => r.id !== id && !this.isPaco(r));
        reservas.push(restaurada);
        reservas.sort((a, b) => new Date(a.checkIn) - new Date(b.checkIn));
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(reservas));
        const nuevoTrash = trash.filter(r => r.id !== id);
        localStorage.setItem(this.TRASH_STORAGE_KEY, JSON.stringify(nuevoTrash));
        this.addAuditLog('RESTAURACION', `Reserva restaurada: ${restaurada.nombre}`, `${restaurada.checkIn} al ${restaurada.checkOut} (${restaurada.habitaciones} hab.)`, restaurada.id);
        return restaurada;
      } else {
        const errData = await res.json();
        throw new Error(errData.error || 'Error al restaurar');
      }
    } catch (e) {
      if (e.message && e.message.includes('Conflicto')) {
        throw e;
      }
      console.warn('Fallo API restore, ejecutando local/Supabase directo:', e);
    }

    const reservas = this.getLocalReservas();
    this.validarDisponibilidad(item, reservas);
    const restaurada = {
      id: item.id,
      nombre: item.nombre,
      checkIn: item.checkIn,
      checkOut: item.checkOut,
      habitaciones: parseInt(item.habitaciones, 10),
      comentarios: item.comentarios || '',
      createdAt: item.createdAt || new Date().toISOString()
    };

    try {
      await this.supabaseDirectFetch(`/trash_reservas?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
      await this.supabaseDirectFetch('/reservas', {
        method: 'POST',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify(restaurada)
      });
    } catch(e) {}

    reservas.push(restaurada);
    reservas.sort((a, b) => new Date(a.checkIn) - new Date(b.checkIn));
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(reservas));
    const nuevoTrash = trash.filter(r => r.id !== id);
    localStorage.setItem(this.TRASH_STORAGE_KEY, JSON.stringify(nuevoTrash));
    this.addAuditLog('RESTAURACION', `Reserva restaurada: ${restaurada.nombre}`, `${restaurada.checkIn} al ${restaurada.checkOut} (${restaurada.habitaciones} hab.)`, restaurada.id);
    return restaurada;
  },

  async deleteFromTrashPermanently(id) {
    this.purgePaco();
    const trash = this.getLocalTrash().filter(r => r.id !== id);
    localStorage.setItem(this.TRASH_STORAGE_KEY, JSON.stringify(trash));

    const reservas = this.getLocalReservas().filter(r => r.id !== id);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(reservas));

    try {
      await fetch(`/api/trash/${id}`, { method: 'DELETE' });
    } catch(e) {}

    try {
      await this.supabaseDirectFetch(`/trash_reservas?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch(e) {}

    return true;
  },

  // ========================================================
  // INFORMACIÓN DE LA CASA (HABITACIONES, NORMAS, CONSEJOS)
  // ========================================================
  async getCasaInfo() {
    try {
      const res = await fetch('/api/casa-info');
      if (res.ok) {
        let data = await res.json();
        data = this.fixEncoding(data);
        if (data && data.habitaciones) {
          localStorage.setItem(this.CASA_INFO_KEY, JSON.stringify(data));
          return data;
        }
      }
    } catch (e) {}

    try {
      const sRes = await this.supabaseDirectFetch('/casa_info?id=eq.main&select=*');
      if (sRes.ok) {
        let sData = await sRes.json();
        if (Array.isArray(sData) && sData.length > 0 && sData[0].habitaciones) {
          const info = this.fixEncoding({
            habitaciones: sData[0].habitaciones,
            normas: sData[0].normas || '',
            consejos: sData[0].consejos || ''
          });
          localStorage.setItem(this.CASA_INFO_KEY, JSON.stringify(info));
          return info;
        }
      }
    } catch(e) {}

    return this.getLocalCasaInfo();
  },

  async saveCasaInfo(info) {
    const fixedInfo = this.fixEncoding(info);
    localStorage.setItem(this.CASA_INFO_KEY, JSON.stringify(fixedInfo));

    try {
      const res = await fetch('/api/casa-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(fixedInfo),
      });
      if (res.ok) {
        const data = await res.json();
        const saved = this.fixEncoding(data.info || fixedInfo);
        localStorage.setItem(this.CASA_INFO_KEY, JSON.stringify(saved));
        return saved;
      }
    } catch (e) {}

    try {
      await this.supabaseDirectFetch('/casa_info', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({
          id: 'main',
          ...fixedInfo,
          updatedAt: new Date().toISOString()
        })
      });
    } catch(e) {}

    return fixedInfo;
  },

  // Validar capacidad de habitaciones (máximo 3)
  validarDisponibilidad(nuevaReserva, reservasExistentes) {
    const numHab = parseInt(nuevaReserva.habitaciones, 10);
    const entrada = new Date(nuevaReserva.checkIn);
    const salida = new Date(nuevaReserva.checkOut);

    let cur = new Date(entrada);
    while (cur < salida) {
      const curStr = cur.toISOString().split('T')[0];
      let ocupadas = 0;

      for (const r of reservasExistentes) {
        const rIn = new Date(r.checkIn);
        const rOut = new Date(r.checkOut);
        if (cur >= rIn && cur < rOut) {
          ocupadas += (parseInt(r.habitaciones, 10) || 1);
        }
      }

      if (ocupadas + numHab > 3) {
        const disponibles = Math.max(0, 3 - ocupadas);
        throw new Error(
          `No hay suficientes habitaciones libres para el día ${curStr}. Quedan ${disponibles} habitación(es) disponible(s).`
        );
      }

      cur.setDate(cur.getDate() + 1);
    }
  },

  getDefaultLogs() {
    return [
      {
        id: 'log-1793652501241-l3fs4m',
        tipo: 'CREACION',
        titulo: 'Nueva reserva: Roman',
        detalle: '2026-11-02 al 2026-11-03 (1 hab.)',
        timestamp: '2026-11-02T20:48:21.241Z',
        reservaId: 'res-1793652501064-r0hx51'
      }
    ];
  },

  getDefaultTrash() {
    return [];
  },

  getDefaultCasaInfo() {
    return {
      habitaciones: "• Habitación 1: Cama de matrimonio principal con armario.\n• Habitación 2: Dos camas individuales.\n• Habitación 3: Cama nido / litera (ideal para niños o jóvenes).",
      normas: "• Tirar la basura a los contenedores al salir.\n• Dejar las toallas y sábanas usadas en el cesto de lavado.\n• Apagar el termo y el aire acondicionado al marchar.\n• Dejar las llaves en la cajita con su clave de seguridad.",
      consejos: "Playa de Regla a escasos minutos a pie. No olvidéis los paseos por el Faro al atardecer, el tapeo en la calle Isaac Peral y el moscatel en las bodegas locales."
    };
  },

  getInitialDemoData() {
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
};

// Purgar de inmediato al cargar el script en cualquier dispositivo
try {
  StorageService.purgePaco();
} catch (e) {}

window.StorageService = StorageService;
