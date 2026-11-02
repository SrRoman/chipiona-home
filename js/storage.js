/**
 * Capa de persistencia para Casa Chipiona
 * Soporta sincronización automática con API REST (servidor local o nube)
 * y persistencia en LocalStorage para funcionamiento 100% autónomo.
 */
const StorageService = {
  isApiAvailable: false,
  STORAGE_KEY: 'chipiona_reservas_data',
  CASA_INFO_KEY: 'chipiona_casa_info_data',

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

  // Inicializar y detectar si hay servidor backend activo
  async init() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1200);
      const res = await fetch('/api/reservas', { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        this.isApiAvailable = true;
        console.log('✅ Conectado al servidor backend (/api/reservas)');
      }
    } catch (e) {
      this.isApiAvailable = false;
      console.log('ℹ️ Modo sin servidor: usando almacenamiento local (LocalStorage)');
    }
  },

  // Obtener reservas de forma síncrona desde LocalStorage para carga instantánea
  getLocalReservas() {
    try {
      const local = localStorage.getItem(this.STORAGE_KEY);
      if (local) {
        const parsed = JSON.parse(local);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return this.fixEncoding(parsed);
        }
      }
    } catch (e) {
      console.warn('Error leyendo reservas locales:', e);
    }
    const demo = this.getInitialDemoData();
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(demo));
    } catch(e) {}
    return demo;
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

  // Obtener todas las reservas (con timeout de seguridad para no bloquear)
  async getReservas() {
    if (this.isApiAvailable) {
      try {
        const res = await fetch('/api/reservas');
        if (res.ok) {
          let data = await res.json();
          data = this.fixEncoding(data);
          localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
          return data;
        }
      } catch (e) {
        console.warn('Error al conectar con la API, usando LocalStorage:', e);
      }
    }

    const local = localStorage.getItem(this.STORAGE_KEY);
    if (local) {
      try {
        const parsed = JSON.parse(local);
        const fixed = this.fixEncoding(parsed);
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(fixed));
        return fixed;
      } catch (e) {
        console.error('Error parseando reservas locales:', e);
      }
    }

    const demoData = this.getInitialDemoData();
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(demoData));
    return demoData;
  },

  // Añadir una nueva reserva
  async addReserva(reservaData) {
    if (this.isApiAvailable) {
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
        return this.fixEncoding(data);
      } catch (e) {
        if (this.isApiAvailable) {
          throw e;
        }
      }
    }

    const reservas = await this.getReservas();
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
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(reservas));
    return nueva;
  },

  // Eliminar / Cancelar reserva
  async deleteReserva(id) {
    if (this.isApiAvailable) {
      try {
        const res = await fetch(`/api/reservas/${id}`, {
          method: 'DELETE'
        });
        if (res.ok) {
          return true;
        }
      } catch (e) {
        console.warn('Error al eliminar en la API, borrando localmente:', e);
      }
    }

    const reservas = await this.getReservas();
    const filtradas = reservas.filter((r) => r.id !== id);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filtradas));
    return true;
  },

  // Obtener Información de La Casa (Habitaciones, Normas, Consejos)
  async getCasaInfo() {
    if (this.isApiAvailable) {
      try {
        const res = await fetch('/api/casa-info');
        if (res.ok) {
          let data = await res.json();
          data = this.fixEncoding(data);
          localStorage.setItem(this.CASA_INFO_KEY, JSON.stringify(data));
          return data;
        }
      } catch (e) {
        console.warn('Error al obtener info de la casa de la API:', e);
      }
    }

    const local = localStorage.getItem(this.CASA_INFO_KEY);
    if (local) {
      try {
        const parsed = JSON.parse(local);
        const fixed = this.fixEncoding(parsed);
        localStorage.setItem(this.CASA_INFO_KEY, JSON.stringify(fixed));
        return fixed;
      } catch (e) {
        console.error('Error parseando casa-info local:', e);
      }
    }

    const defaultInfo = this.getDefaultCasaInfo();
    localStorage.setItem(this.CASA_INFO_KEY, JSON.stringify(defaultInfo));
    return defaultInfo;
  },

  // Guardar Información de La Casa
  async saveCasaInfo(info) {
    const fixedInfo = this.fixEncoding(info);
    localStorage.setItem(this.CASA_INFO_KEY, JSON.stringify(fixedInfo));

    if (this.isApiAvailable) {
      try {
        const res = await fetch('/api/casa-info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body: JSON.stringify(fixedInfo),
        });
        if (res.ok) {
          const data = await res.json();
          return this.fixEncoding(data.info);
        }
      } catch (e) {
        console.warn('Error al guardar info de la casa en la API:', e);
      }
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

  getDefaultCasaInfo() {
    return {
      habitaciones: "• Habitación 1: Cama de matrimonio principal con armario.\n• Habitación 2: Dos camas individuales.\n• Habitación 3: Cama nido / litera (ideal para niños o jóvenes).",
      normas: "• Tirar la basura a los contenedores al salir.\n• Dejar las toallas y sábanas usadas en el cesto de lavado.\n• Apagar el termo y el aire acondicionado al marchar.\n• Dejar las llaves en la cajita con su clave de seguridad.",
      consejos: "Playa de Regla a escasos minutos a pie. No olvidéis los paseos por el Faro al atardecer, el tapeo en la calle Isaac Peral y el moscatel en las bodegas locales."
    };
  },

  getInitialDemoData() {
    const today = new Date();
    const format = (d) => d.toISOString().split('T')[0];
    
    const d1 = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 4);
    const d2 = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 8);
    const d3 = new Date(today.getFullYear(), today.getMonth() + 1, 10);
    const d4 = new Date(today.getFullYear(), today.getMonth() + 1, 15);

    return [
      {
        id: 'res-demo-1',
        nombre: 'Tía Carmen',
        checkIn: format(d1),
        checkOut: format(d2),
        habitaciones: 2,
        comentarios: 'Llegamos el viernes a la tarde. Llevamos nosotros toallas y sábanas para los niños.',
        createdAt: new Date().toISOString()
      },
      {
        id: 'res-demo-2',
        nombre: 'Primo Alejandro',
        checkIn: format(d3),
        checkOut: format(d4),
        habitaciones: 1,
        comentarios: 'Vamos 2 personas a pasar unos días de playa y comer en los chiringuitos de la Cruz del Mar.',
        createdAt: new Date().toISOString()
      }
    ];
  }
};

window.StorageService = StorageService;
