/**
 * Capa de persistencia para Casa Chipiona
 * Sincronización en tiempo real con Base de Datos Cloud (GitHub Gist DB)
 * y persistencia en LocalStorage para funcionamiento ultra-rápido y offline.
 */
const StorageService = {
  isApiAvailable: true,
  STORAGE_KEY: 'chipiona_reservas_data',
  CASA_INFO_KEY: 'chipiona_casa_info_data',
  LOGS_STORAGE_KEY: 'chipiona_audit_logs',
  TRASH_STORAGE_KEY: 'chipiona_deleted_reservas',

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

  // Inicializar y conectar con la base de datos cloud
  async init() {
    this.isApiAvailable = true;
    try {
      const res = await fetch('/api/reservas');
      if (res.ok) {
        this.isApiAvailable = true;
        console.log('✅ Conectado a la Base de Datos Cloud (/api/reservas)');
      }
    } catch (e) {
      console.warn('ℹ️ Servidor temporalmente no accesible, usando caché local:', e);
      this.isApiAvailable = true;
    }
  },

  // Obtener reservas de forma síncrona desde LocalStorage para carga instantánea en 0ms
  getLocalReservas() {
    let localData = [];
    try {
      const local = localStorage.getItem(this.STORAGE_KEY);
      if (local) {
        const parsed = JSON.parse(local);
        if (Array.isArray(parsed) && parsed.length > 0) {
          localData = this.fixEncoding(parsed);
        }
      }
    } catch (e) {
      console.warn('Error leyendo reservas locales:', e);
    }

    if (localData.length === 0) {
      localData = this.getInitialDemoData();
    } else {
      // Asegurar que las reservas base (Roman) estén presentes
      const initial = this.getInitialDemoData();
      initial.forEach(initRes => {
        if (!localData.some(r => r.id === initRes.id)) {
          localData.push(initRes);
        }
      });
    }

    localData.sort((a, b) => new Date(a.checkIn) - new Date(b.checkIn));
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(localData));
    } catch(e) {}
    return localData;
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
    const local = this.getLocalReservas();
    try {
      const res = await fetch('/api/reservas');
      if (res.ok) {
        let serverData = await res.json();
        serverData = this.fixEncoding(serverData);
        if (Array.isArray(serverData)) {
          serverData.sort((a, b) => new Date(a.checkIn) - new Date(b.checkIn));
          localStorage.setItem(this.STORAGE_KEY, JSON.stringify(serverData));
          return serverData;
        }
      }
    } catch (e) {
      console.warn('Error conectando a /api/reservas, usando datos locales:', e);
    }
    return local;
  },

  // Añadir una nueva reserva a la base de datos cloud
  async addReserva(reservaData) {
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
      
      const local = this.getLocalReservas().filter(r => r.id !== fixed.id);
      local.push(fixed);
      local.sort((a, b) => new Date(a.checkIn) - new Date(b.checkIn));
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(local));

      this.addAuditLog('CREACION', `Nueva reserva: ${fixed.nombre}`, `${fixed.checkIn} al ${fixed.checkOut} (${fixed.habitaciones} hab.)`, fixed.id);
      return fixed;
    } catch (e) {
      if (e.message && e.message.includes('Conflicto')) {
        throw e;
      }
      console.warn('API no disponible, guardando localmente:', e);
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

      reservas.push(nueva);
      reservas.sort((a, b) => new Date(a.checkIn) - new Date(b.checkIn));
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(reservas));
      this.addAuditLog('CREACION', `Nueva reserva: ${nueva.nombre}`, `${nueva.checkIn} al ${nueva.checkOut} (${nueva.habitaciones} hab.)`, nueva.id);
      return nueva;
    }
  },

  // Eliminar / Cancelar reserva (La mueve a la papelera en la nube para poder recuperarla)
  async deleteReserva(id) {
    const reservas = this.getLocalReservas();
    const reservaABorrar = reservas.find((r) => r.id === id);

    if (reservaABorrar) {
      this.moveToTrash(reservaABorrar);
      this.addAuditLog('ELIMINACION', `Reserva cancelada: ${reservaABorrar.nombre}`, `${reservaABorrar.checkIn} al ${reservaABorrar.checkOut} (${reservaABorrar.habitaciones} hab.)`, id);
    }

    try {
      const res = await fetch(`/api/reservas/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        const filtradas = reservas.filter((r) => r.id !== id);
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filtradas));
        return true;
      }
    } catch (e) {
      console.warn('Error al eliminar en la API, borrando localmente:', e);
    }

    const filtradas = reservas.filter((r) => r.id !== id);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filtradas));
    return true;
  },

  // ========================================================
  // AUDITORÍA: HISTORIAL DE LOGS DE ACTIVIDAD
  // ========================================================
  getLocalAuditLogs() {
    try {
      const local = localStorage.getItem(this.LOGS_STORAGE_KEY);
      if (local) {
        const parsed = JSON.parse(local);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return this.fixEncoding(parsed);
        }
      }
    } catch (e) {
      console.warn('Error leyendo logs locales:', e);
    }
    const demoLogs = this.getDefaultLogs();
    try {
      localStorage.setItem(this.LOGS_STORAGE_KEY, JSON.stringify(demoLogs));
    } catch(e) {}
    return demoLogs;
  },

  async getAuditLogs() {
    const localLogs = this.getLocalAuditLogs();
    try {
      const res = await fetch('/api/logs');
      if (res.ok) {
        let serverLogs = await res.json();
        serverLogs = this.fixEncoding(serverLogs);
        if (Array.isArray(serverLogs)) {
          serverLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
          localStorage.setItem(this.LOGS_STORAGE_KEY, JSON.stringify(serverLogs));
          return serverLogs;
        }
      }
    } catch (e) {
      console.warn('Error consultando /api/logs:', e);
    }
    return localLogs;
  },

  addAuditLog(tipo, titulo, detalle, reservaId = null) {
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
    }).catch(() => {});

    return entry;
  },

  async clearAuditLogs() {
    try {
      localStorage.setItem(this.LOGS_STORAGE_KEY, JSON.stringify([]));
    } catch(e) {}

    try {
      await fetch('/api/logs', { method: 'DELETE' });
    } catch(e) {}
    return true;
  },

  // ========================================================
  // PAPELERA DE RECICLAJE Y RECUPERACIÓN DE RESERVAS
  // ========================================================
  getLocalTrash() {
    try {
      const local = localStorage.getItem(this.TRASH_STORAGE_KEY);
      if (local) {
        const parsed = JSON.parse(local);
        if (Array.isArray(parsed)) {
          return this.fixEncoding(parsed);
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
    const localTrash = this.getLocalTrash();
    try {
      const res = await fetch('/api/trash');
      if (res.ok) {
        let serverTrash = await res.json();
        serverTrash = this.fixEncoding(serverTrash);
        if (Array.isArray(serverTrash)) {
          localStorage.setItem(this.TRASH_STORAGE_KEY, JSON.stringify(serverTrash));
          return serverTrash;
        }
      }
    } catch (e) {
      console.warn('Error consultando /api/trash:', e);
    }
    return localTrash;
  },

  moveToTrash(reserva) {
    const trash = this.getLocalTrash();
    const item = {
      ...reserva,
      deletedAt: new Date().toISOString()
    };
    const filtrada = trash.filter(r => r.id !== item.id);
    filtrada.unshift(item);
    try {
      localStorage.setItem(this.TRASH_STORAGE_KEY, JSON.stringify(filtrada));
    } catch(e) {}
    return item;
  },

  async restoreFromTrash(id) {
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
        const reservas = this.getLocalReservas().filter(r => r.id !== id);
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
      console.warn('Fallo API restore, ejecutando local:', e);
      const reservas = this.getLocalReservas();
      this.validarDisponibilidad(item, reservas);
      const restaurada = {
        id: item.id,
        nombre: item.nombre,
        checkIn: item.checkIn,
        checkOut: item.checkOut,
        habitaciones: parseInt(item.habitaciones, 10),
        comentarios: item.comentarios || '',
        createdAt: item.createdAt || new Date().toISOString(),
        restoredAt: new Date().toISOString()
      };
      reservas.push(restaurada);
      reservas.sort((a, b) => new Date(a.checkIn) - new Date(b.checkIn));
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(reservas));
      const nuevoTrash = trash.filter(r => r.id !== id);
      localStorage.setItem(this.TRASH_STORAGE_KEY, JSON.stringify(nuevoTrash));
      this.addAuditLog('RESTAURACION', `Reserva restaurada: ${restaurada.nombre}`, `${restaurada.checkIn} al ${restaurada.checkOut} (${restaurada.habitaciones} hab.)`, restaurada.id);
      return restaurada;
    }
  },

  async deleteFromTrashPermanently(id) {
    const trash = this.getLocalTrash();
    const nuevoTrash = trash.filter(r => r.id !== id);
    localStorage.setItem(this.TRASH_STORAGE_KEY, JSON.stringify(nuevoTrash));

    try {
      await fetch(`/api/trash/${id}`, { method: 'DELETE' });
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
    } catch (e) {
      console.warn('Error al obtener info de la casa de la API:', e);
    }

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
    } catch (e) {
      console.warn('Error al guardar info de la casa en la API cloud:', e);
    }

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
          ocupadas += r.habitaciones;
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
  },

  getDefaultTrash() {
    return [
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
        comentarios: 'Buenas Familia!! He creado esta APP para tener un poco de control y organizacion con quien se aloja en la casa de Chipiona, desde aqui podreis hacer reservas, eliminarlas (tened cuidado que podeis eliminar la de otras personas), seleccionar numero de habitaciones que vais a usar, y comentar cosas como voy con un invitado, etc. \n\nCualquier duda que tengais podeis preguntarla por el grupo de la familia, espero que os venga genial la aplicacion y cualquier cosita que querais implementar o modificar comentadselo a Alba.\n\nUn abrazo, Roman.',
        createdAt: '2026-11-02T20:48:21.064Z'
      },
      {
        id: 'res-1793658792196-17qt67',
        nombre: 'Tio paco',
        checkIn: '2026-11-03',
        checkOut: '2027-01-10',
        habitaciones: 3,
        comentarios: 'Llegaremos sobre las 4 y nos iremos a las 7',
        createdAt: '2026-11-02T22:33:12.196Z'
      }
    ];
  }
};

window.StorageService = StorageService;
