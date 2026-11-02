/**
 * Aplicación Web Casa Familiar Chipiona
 * Mobile-First y Full-Width en PC, con tema azul degradado oscuro elegante
 * y edición interactiva de las normas e información de La Casa.
 */

// Estado global de la aplicación
const AppState = {
  currentDate: new Date(),
  viewDate: new Date(), // Mes y año que se está visualizando en el calendario
  reservas: [],
  selectedReserva: null,
  casaInfo: null,
  activeTab: 'inicio', // 'inicio', 'calendario', 'lista', 'info'
  flatpickrInstance: null,
  selectedHabitaciones: 1,
};

// Paleta de colores vibrantes para distinguir reservas familiares en tema oscuro
const FAMILY_COLORS = [
  { bg: 'bg-blue-500/25 text-blue-200 border-blue-400/40', badge: 'bg-blue-600 text-white' },
  { bg: 'bg-emerald-500/25 text-emerald-200 border-emerald-400/40', badge: 'bg-emerald-600 text-white' },
  { bg: 'bg-amber-500/25 text-amber-200 border-amber-400/40', badge: 'bg-amber-600 text-white' },
  { bg: 'bg-purple-500/25 text-purple-200 border-purple-400/40', badge: 'bg-purple-600 text-white' },
  { bg: 'bg-rose-500/25 text-rose-200 border-rose-400/40', badge: 'bg-rose-600 text-white' },
  { bg: 'bg-cyan-500/25 text-cyan-200 border-cyan-400/40', badge: 'bg-cyan-600 text-white' },
  { bg: 'bg-indigo-500/25 text-indigo-200 border-indigo-400/40', badge: 'bg-indigo-600 text-white' }
];

function getColorForName(name) {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % FAMILY_COLORS.length;
  return FAMILY_COLORS[index];
}

// Inicialización de la aplicación al cargar el DOM
document.addEventListener('DOMContentLoaded', async () => {
  // Inicializar servicio de almacenamiento (detecta servidor o localstorage)
  await StorageService.init();

  // Cargar reservas e información de la casa
  await Promise.all([
    loadReservas(),
    loadCasaInfo()
  ]);

  // Configurar Datepicker de hotel (Flatpickr)
  initDatepicker();

  // Configurar escuchadores de eventos
  setupEventListeners();

  // Configurar y verificar sistema de seguridad por PIN (8080)
  setupPINAuth();
  checkAuthPIN();

  // Renderizar vistas iniciales
  renderInicio();
  renderCalendar();
  renderLista();
  renderCasaInfo();
  updateNavigationTabs('inicio');
});

// Cargar reservas desde el servicio
async function loadReservas() {
  try {
    AppState.reservas = await StorageService.getReservas();
    AppState.reservas.sort((a, b) => new Date(a.checkIn) - new Date(b.checkIn));
  } catch (error) {
    console.error('Error al cargar reservas:', error);
    showToast('Error al cargar las reservas', 'error');
  }
}

// Cargar información de La Casa
async function loadCasaInfo() {
  try {
    AppState.casaInfo = await StorageService.getCasaInfo();
  } catch (error) {
    console.error('Error al cargar info de la casa:', error);
    AppState.casaInfo = StorageService.getDefaultCasaInfo();
  }
}

// Configuración de Flatpickr estilo Hotel con soporte de tema oscuro
function initDatepicker() {
  const dateInput = document.getElementById('fechas-estancia');
  if (!dateInput) return;

  AppState.flatpickrInstance = flatpickr(dateInput, {
    mode: 'range',
    minDate: 'today',
    dateFormat: 'Y-m-d',
    showMonths: 1,
    locale: {
      firstDayOfWeek: 1,
      weekdays: {
        shorthand: ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'],
        longhand: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
      },
      months: {
        shorthand: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
        longhand: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
      }
    },
    onChange: function(selectedDates, dateStr, instance) {
      const summaryEl = document.getElementById('resumen-noches');
      const entradaInput = document.getElementById('reserva-checkin');
      const salidaInput = document.getElementById('reserva-checkout');

      if (selectedDates.length === 2) {
        const checkIn = selectedDates[0];
        const checkOut = selectedDates[1];
        
        const formatYMD = (d) => {
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        };

        const inStr = formatYMD(checkIn);
        const outStr = formatYMD(checkOut);

        entradaInput.value = inStr;
        salidaInput.value = outStr;

        const diffTime = Math.abs(checkOut - checkIn);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        summaryEl.innerHTML = `
          <div class="flex items-center gap-2 text-sky-300 bg-sky-950/60 px-3.5 py-2.5 rounded-xl border border-sky-800/60 text-xs sm:text-sm font-medium">
            <span>🏖️ <strong class="text-white">${diffDays} noche${diffDays > 1 ? 's' : ''}</strong></span>
            <span class="text-sky-600">·</span>
            <span>Entrada: <strong class="text-white">${formatDateShort(inStr)}</strong></span>
            <span class="text-sky-600">→</span>
            <span>Salida: <strong class="text-white">${formatDateShort(outStr)}</strong></span>
          </div>
        `;
        summaryEl.classList.remove('hidden');

        checkPreviewAvailability(inStr, outStr, AppState.selectedHabitaciones);
      } else if (selectedDates.length === 1) {
        summaryEl.innerHTML = `
          <div class="text-xs text-amber-300 bg-amber-950/60 px-3.5 py-2 rounded-xl border border-amber-800/60">
            👆 Ahora toca en el calendario el <strong>día de salida</strong>
          </div>
        `;
        summaryEl.classList.remove('hidden');
      } else {
        summaryEl.classList.add('hidden');
        entradaInput.value = '';
        salidaInput.value = '';
      }
    }
  });
}

// Comprobación de disponibilidad preliminar en el formulario
function checkPreviewAvailability(inStr, outStr, numHab) {
  const warningEl = document.getElementById('aviso-disponibilidad');
  if (!warningEl) return;

  const entrada = new Date(inStr);
  const salida = new Date(outStr);
  let cur = new Date(entrada);
  let conflicto = null;

  while (cur < salida) {
    const curStr = cur.toISOString().split('T')[0];
    let ocupadas = 0;

    for (const r of AppState.reservas) {
      const rIn = new Date(r.checkIn);
      const rOut = new Date(r.checkOut);
      if (cur >= rIn && cur < rOut) {
        ocupadas += r.habitaciones;
      }
    }

    if (ocupadas + numHab > 3) {
      conflicto = {
        fecha: curStr,
        ocupadas,
        disponibles: Math.max(0, 3 - ocupadas)
      };
      break;
    }
    cur.setDate(cur.getDate() + 1);
  }

  if (conflicto) {
    warningEl.innerHTML = `
      <div class="bg-rose-950/60 border border-rose-800/70 text-rose-200 px-3.5 py-2.5 rounded-xl text-xs font-medium flex items-start gap-2.5">
        <span class="text-base">⚠️</span>
        <div>
          <strong class="text-white">¡Capacidad superada el día ${formatDateShort(conflicto.fecha)}!</strong><br>
          Solo quedan <strong class="text-rose-300">${conflicto.disponibles} habitación(es) libre(s)</strong> en esa fecha ya que hay otras reservas. Reduce las habitaciones o elige otras fechas.
        </div>
      </div>
    `;
    warningEl.classList.remove('hidden');
  } else {
    warningEl.classList.add('hidden');
  }
}

// Configurar todos los botones y eventos
function setupEventListeners() {
  // Navegación de pestañas (Móvil y Escritorio)
  document.querySelectorAll('[data-tab-target]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const tab = btn.getAttribute('data-tab-target');
      switchTab(tab);
    });
  });

  // Botón rápido en Inicio para ir al calendario
  const btnIrCalendario = document.getElementById('btn-ir-calendario');
  if (btnIrCalendario) {
    btnIrCalendario.addEventListener('click', () => switchTab('calendario'));
  }

  // Botones de Abrir Modal Añadir Reserva
  document.querySelectorAll('.btn-open-reserva-modal').forEach((btn) => {
    btn.addEventListener('click', () => {
      openModalReserva();
    });
  });

  // Botones de Cerrar Modales
  document.querySelectorAll('.btn-close-modal').forEach((btn) => {
    btn.addEventListener('click', () => {
      closeAllModals();
    });
  });

  // Botones con lápiz para Editar Información de La Casa
  document.querySelectorAll('.btn-open-edit-casa').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const targetSection = btn.getAttribute('data-target-section');
      openModalEditarCasa(targetSection);
    });
  });

  // Formulario Editar Información de La Casa
  const formEditarCasa = document.getElementById('form-editar-casa');
  if (formEditarCasa) {
    formEditarCasa.addEventListener('submit', handleGuardarCasaInfo);
  }

  // Botón Restablecer Normas por defecto
  const btnResetCasaInfo = document.getElementById('btn-reset-casa-info');
  if (btnResetCasaInfo) {
    btnResetCasaInfo.addEventListener('click', handleResetCasaInfo);
  }

  // Selector de número de habitaciones (1, 2, 3)
  document.querySelectorAll('.habitacion-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.habitacion-btn').forEach((b) => {
        b.classList.remove('active', 'border-sky-500', 'bg-sky-500/20', 'text-sky-300', 'font-bold');
        b.classList.add('border-slate-700', 'text-slate-300', 'bg-slate-800/60');
      });
      btn.classList.add('active', 'border-sky-500', 'bg-sky-500/20', 'text-sky-300', 'font-bold');
      btn.classList.remove('border-slate-700', 'text-slate-300', 'bg-slate-800/60');

      AppState.selectedHabitaciones = parseInt(btn.getAttribute('data-hab'), 10);
      document.getElementById('reserva-habitaciones').value = AppState.selectedHabitaciones;

      const inVal = document.getElementById('reserva-checkin').value;
      const outVal = document.getElementById('reserva-checkout').value;
      if (inVal && outVal) {
        checkPreviewAvailability(inVal, outVal, AppState.selectedHabitaciones);
      }
    });
  });

  // Formulario Añadir Reserva Submit
  const formReserva = document.getElementById('form-nueva-reserva');
  if (formReserva) {
    formReserva.addEventListener('submit', handleNuevaReserva);
  }

  // Navegación del Calendario: Mes Anterior / Siguiente / Hoy
  const btnPrevMonth = document.getElementById('btn-prev-month');
  const btnNextMonth = document.getElementById('btn-next-month');
  const btnTodayMonth = document.getElementById('btn-today-month');

  if (btnPrevMonth) {
    btnPrevMonth.addEventListener('click', () => {
      AppState.viewDate.setMonth(AppState.viewDate.getMonth() - 1);
      renderCalendar();
    });
  }

  if (btnNextMonth) {
    btnNextMonth.addEventListener('click', () => {
      AppState.viewDate.setMonth(AppState.viewDate.getMonth() + 1);
      renderCalendar();
    });
  }

  if (btnTodayMonth) {
    btnTodayMonth.addEventListener('click', () => {
      AppState.viewDate = new Date();
      renderCalendar();
    });
  }

  // Botón Cancelar Reserva (dentro del modal de detalle)
  const btnCancelarReserva = document.getElementById('btn-cancelar-reserva');
  if (btnCancelarReserva) {
    btnCancelarReserva.addEventListener('click', handleCancelarReserva);
  }
}

// Cambio de pestaña
function switchTab(tabName) {
  AppState.activeTab = tabName;

  document.querySelectorAll('.tab-view').forEach((view) => {
    view.classList.add('hidden');
  });

  const activeView = document.getElementById(`view-${tabName}`);
  if (activeView) {
    activeView.classList.remove('hidden');
  }

  updateNavigationTabs(tabName);

  if (tabName === 'calendario') {
    renderCalendar();
  } else if (tabName === 'inicio') {
    renderInicio();
  } else if (tabName === 'lista') {
    renderLista();
  } else if (tabName === 'info') {
    renderCasaInfo();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Sincronizar estilos activos en la barra móvil y la barra de escritorio
function updateNavigationTabs(tabName) {
  // Móvil (bottom nav)
  document.querySelectorAll('nav [data-tab-target]').forEach((btn) => {
    const target = btn.getAttribute('data-tab-target');
    const icon = btn.querySelector('.tab-icon');
    const label = btn.querySelector('.tab-label');

    if (target === tabName) {
      btn.classList.add('text-sky-400');
      btn.classList.remove('text-slate-400');
      if (icon) icon.classList.add('scale-110');
      if (label) label.classList.add('font-bold', 'text-sky-300');
    } else {
      btn.classList.remove('text-sky-400');
      btn.classList.add('text-slate-400');
      if (icon) icon.classList.remove('scale-110');
      if (label) label.classList.remove('font-bold', 'text-sky-300');
    }
  });

  // Escritorio (top nav)
  document.querySelectorAll('#desktop-nav [data-tab-target]').forEach((btn) => {
    const target = btn.getAttribute('data-tab-target');
    if (target === tabName) {
      btn.className = 'px-3.5 py-1.5 rounded-xl text-xs font-bold bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-xs transition';
    } else {
      btn.className = 'px-3.5 py-1.5 rounded-xl text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800/60 border border-transparent transition';
    }
  });
}

// ==========================================
// RENDERIZADO: PÁGINA DE INICIO
// ==========================================
function renderInicio() {
  const containerProximas = document.getElementById('inicio-proximas-reservas');
  const statusBadge = document.getElementById('inicio-estado-casa');
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  // 1. Estado de la casa hoy
  const reservasHoy = AppState.reservas.filter((r) => {
    return todayStr >= r.checkIn && todayStr < r.checkOut;
  });

  if (reservasHoy.length > 0) {
    const totalHab = reservasHoy.reduce((acc, cur) => acc + cur.habitaciones, 0);
    const nombres = reservasHoy.map(r => r.nombre).join(' y ');
    statusBadge.innerHTML = `
      <div class="bg-amber-950/40 text-amber-200 border border-amber-600/50 rounded-3xl p-5 flex items-center justify-between shadow-lg backdrop-blur-md">
        <div class="flex items-center gap-3.5">
          <div class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-600 to-yellow-500 text-white flex items-center justify-center font-bold text-xl shadow-md">
            🏠
          </div>
          <div>
            <p class="text-[11px] font-bold text-amber-400 uppercase tracking-wider">Hoy en la casa</p>
            <p class="font-extrabold text-white text-base sm:text-lg">${nombres}</p>
            <p class="text-xs text-amber-200/80">${totalHab} de 3 habitaciones ocupadas</p>
          </div>
        </div>
        <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-amber-500/25 text-amber-300 border border-amber-500/40">
          En estancia
        </span>
      </div>
    `;
  } else {
    statusBadge.innerHTML = `
      <div class="bg-emerald-950/40 text-emerald-200 border border-emerald-600/40 rounded-3xl p-5 flex items-center justify-between shadow-lg backdrop-blur-md">
        <div class="flex items-center gap-3.5">
          <div class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 text-white flex items-center justify-center font-bold text-xl shadow-md">
            ✨
          </div>
          <div>
            <p class="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">Estado actual</p>
            <p class="font-extrabold text-white text-base sm:text-lg">La casa está libre hoy</p>
            <p class="text-xs text-emerald-200/80">3 habitaciones disponibles para la familia</p>
          </div>
        </div>
        <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
          Libre
        </span>
      </div>
    `;
  }

  // 2. Próximas reservas futuras
  const futuras = AppState.reservas
    .filter((r) => r.checkOut >= todayStr)
    .slice(0, 6);

  if (futuras.length === 0) {
    containerProximas.innerHTML = `
      <div class="col-span-full text-center py-10 bg-slate-900/60 rounded-3xl border border-dashed border-slate-800 p-6">
        <div class="text-4xl mb-2">🏖️</div>
        <p class="text-slate-300 font-bold text-sm">No hay reservas próximas registradas</p>
        <p class="text-slate-400 text-xs mt-1">¡Sé el primero de la familia en planear unos días en Chipiona!</p>
        <button class="mt-4 px-5 py-2.5 bg-gradient-to-r from-sky-600 to-sky-700 text-white rounded-2xl text-xs font-bold shadow hover:from-sky-500 hover:to-sky-600 btn-open-reserva-modal active:scale-95 transition">
          ➕ Hacer una reserva
        </button>
      </div>
    `;
    containerProximas.querySelector('.btn-open-reserva-modal')?.addEventListener('click', openModalReserva);
  } else {
    containerProximas.innerHTML = futuras
      .map((r) => {
        const color = getColorForName(r.nombre);
        const noches = calculateNights(r.checkIn, r.checkOut);
        return `
          <div class="reserva-card bg-slate-900/70 p-4 rounded-2xl border border-slate-800/80 hover:border-sky-500/50 shadow-sm hover:shadow-md transition cursor-pointer active:scale-[0.99] flex items-center justify-between backdrop-blur-sm"
               onclick="openModalDetalle('${r.id}')">
            <div class="flex items-center gap-3">
              <div class="w-11 h-11 rounded-xl ${color.bg} border flex items-center justify-center font-bold text-sm">
                ${getInitials(r.nombre)}
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <h4 class="font-bold text-white text-sm">${r.nombre}</h4>
                  <span class="text-[10px] bg-slate-800 text-slate-300 border border-slate-700 font-semibold px-2 py-0.5 rounded-full">
                    ${r.habitaciones} hab
                  </span>
                </div>
                <p class="text-xs text-slate-400 mt-0.5">
                  ${formatDateRange(r.checkIn, r.checkOut)}
                </p>
              </div>
            </div>
            <div class="text-right">
              <span class="text-xs font-bold text-sky-300 bg-sky-950/70 px-2.5 py-1 rounded-xl border border-sky-800/60">
                ${noches} noche${noches > 1 ? 's' : ''}
              </span>
              <p class="text-[10px] text-slate-500 mt-1">Toca para ver</p>
            </div>
          </div>
        `;
      })
      .join('');
  }
}

// ==========================================
// RENDERIZADO: CALENDARIO INTERACTIVO
// ==========================================
function renderCalendar() {
  const monthTitle = document.getElementById('calendar-month-title');
  const gridContainer = document.getElementById('calendar-days-grid');
  if (!monthTitle || !gridContainer) return;

  const year = AppState.viewDate.getFullYear();
  const month = AppState.viewDate.getMonth();

  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  monthTitle.innerText = `${monthNames[month]} ${year}`;

  gridContainer.innerHTML = '';

  const firstDayOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  let startingDay = firstDayOfMonth.getDay() - 1;
  if (startingDay === -1) startingDay = 6;

  const daysInPrevMonth = new Date(year, month, 0).getDate();
  for (let i = 0; i < startingDay; i++) {
    const prevDayNum = daysInPrevMonth - startingDay + i + 1;
    const emptyCell = document.createElement('div');
    emptyCell.className = 'calendar-day p-2 rounded-2xl bg-slate-900/20 border border-slate-800/30 opacity-20 text-slate-500 text-xs font-medium';
    emptyCell.innerText = prevDayNum;
    gridContainer.appendChild(emptyCell);
  }

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
  const todayDateNum = today.getDate();

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    const reservasDelDia = AppState.reservas.filter((r) => {
      return dateStr >= r.checkIn && dateStr < r.checkOut;
    });

    const totalHabitacionesOcupadas = reservasDelDia.reduce((acc, r) => acc + r.habitaciones, 0);

    const cell = document.createElement('div');
    const isToday = isCurrentMonth && day === todayDateNum;

    let cellClasses = 'calendar-day p-1.5 sm:p-2.5 rounded-2xl border flex flex-col justify-between transition cursor-pointer backdrop-blur-xs ';

    if (totalHabitacionesOcupadas >= 3) {
      cellClasses += 'bg-rose-950/30 border-rose-800/50 hover:border-rose-400 ';
    } else if (totalHabitacionesOcupadas > 0) {
      cellClasses += 'bg-amber-950/25 border-amber-800/50 hover:border-amber-400 ';
    } else {
      cellClasses += 'bg-slate-900/60 border-slate-800/80 hover:border-sky-500/60 hover:bg-slate-800/60 ';
    }

    if (isToday) {
      cellClasses += 'ring-2 ring-sky-400 bg-sky-950/50 border-sky-500 font-bold ';
    }

    cell.className = cellClasses;

    let headerHtml = `
      <div class="flex items-center justify-between w-full">
        <span class="text-xs sm:text-sm font-bold ${isToday ? 'text-sky-300 bg-sky-900/80 w-6 h-6 rounded-full flex items-center justify-center -ml-0.5 shadow-sm' : 'text-slate-200'}">
          ${day}
        </span>
        ${totalHabitacionesOcupadas > 0 ? `
          <span class="text-[9px] font-bold px-1.5 py-0.5 rounded-md ${totalHabitacionesOcupadas >= 3 ? 'bg-rose-500/25 text-rose-300 border border-rose-500/40' : 'bg-amber-500/25 text-amber-300 border border-amber-500/40'}">
            ${totalHabitacionesOcupadas}/3 hab
          </span>
        ` : ''}
      </div>
    `;

    let tagsHtml = '<div class="space-y-1 my-1 overflow-hidden">';
    if (reservasDelDia.length > 0) {
      reservasDelDia.forEach((r) => {
        const color = getColorForName(r.nombre);
        tagsHtml += `
          <div class="reserva-tag ${color.bg} border text-[10px] sm:text-[11px] leading-tight px-1.5 py-0.5 rounded-md truncate font-medium" 
               title="${r.nombre} (${r.habitaciones} hab)"
               onclick="event.stopPropagation(); openModalDetalle('${r.id}')">
            ${r.nombre.split(' ')[0]} <span class="opacity-80 font-normal">(${r.habitaciones}h)</span>
          </div>
        `;
      });
    } else {
      tagsHtml += `
        <div class="text-[10px] text-emerald-400 font-medium hidden sm:block opacity-0 hover:opacity-100">
          Libre
        </div>
      `;
    }
    tagsHtml += '</div>';

    cell.innerHTML = headerHtml + tagsHtml;

    cell.addEventListener('click', () => {
      if (reservasDelDia.length === 1) {
        openModalDetalle(reservasDelDia[0].id);
      } else if (reservasDelDia.length > 1) {
        openModalMultiplesReservas(dateStr, reservasDelDia);
      } else {
        openModalReserva(dateStr);
      }
    });

    gridContainer.appendChild(cell);
  }

  const totalCells = startingDay + daysInMonth;
  const remainingCells = (7 - (totalCells % 7)) % 7;
  for (let i = 1; i <= remainingCells; i++) {
    const nextCell = document.createElement('div');
    nextCell.className = 'calendar-day p-2 rounded-2xl bg-slate-900/20 border border-slate-800/30 opacity-20 text-slate-500 text-xs font-medium';
    nextCell.innerText = i;
    gridContainer.appendChild(nextCell);
  }
}

// ==========================================
// RENDERIZADO: LISTA DE TODAS LAS RESERVAS
// ==========================================
function renderLista() {
  const container = document.getElementById('lista-todas-reservas');
  if (!container) return;

  if (AppState.reservas.length === 0) {
    container.innerHTML = `
      <div class="col-span-full text-center py-12 bg-slate-900/60 rounded-3xl border border-slate-800 p-6">
        <p class="text-4xl mb-2">🏖️</p>
        <p class="text-slate-200 font-bold text-base">No hay reservas registradas</p>
        <p class="text-slate-400 text-xs mt-1">Usa el botón de arriba para añadir la primera estancia.</p>
      </div>
    `;
    return;
  }

  const nowStr = new Date().toISOString().split('T')[0];

  container.innerHTML = AppState.reservas
    .map((r) => {
      const color = getColorForName(r.nombre);
      const isPast = r.checkOut < nowStr;
      const isCurrent = nowStr >= r.checkIn && nowStr < r.checkOut;
      const noches = calculateNights(r.checkIn, r.checkOut);

      return `
        <div class="bg-slate-900/80 p-4 sm:p-5 rounded-3xl border ${isCurrent ? 'border-amber-500/80 ring-2 ring-amber-500/30' : 'border-slate-800/90'} shadow-md hover:border-sky-500/50 transition cursor-pointer backdrop-blur-md"
             onclick="openModalDetalle('${r.id}')">
          <div class="flex items-start justify-between">
            <div class="flex items-center gap-3.5">
              <div class="w-12 h-12 rounded-2xl ${color.bg} border flex items-center justify-center font-bold text-base shadow-sm">
                ${getInitials(r.nombre)}
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <h3 class="font-bold text-white text-base">${r.nombre}</h3>
                  ${isCurrent ? '<span class="bg-amber-500/25 text-amber-300 border border-amber-500/40 text-[10px] font-bold px-2 py-0.5 rounded-full">Actual</span>' : ''}
                  ${isPast ? '<span class="bg-slate-800 text-slate-400 border border-slate-700 text-[10px] font-medium px-2 py-0.5 rounded-full">Pasada</span>' : ''}
                </div>
                <p class="text-xs font-semibold text-slate-300 mt-1">
                  ${formatDateRange(r.checkIn, r.checkOut)}
                </p>
                <p class="text-xs text-sky-400 font-medium mt-0.5">
                  ${r.habitaciones} de 3 habitaciones · ${noches} noche${noches > 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <button class="text-slate-400 hover:text-white p-1 rounded-lg">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
          ${r.comentarios ? `
            <div class="mt-3.5 pt-3 border-t border-slate-800/80 text-xs text-slate-300 bg-slate-950/60 p-3 rounded-2xl italic border border-slate-800">
              "${escapeHtml(r.comentarios)}"
            </div>
          ` : ''}
        </div>
      `;
    })
    .join('');
}

// ==========================================
// RENDERIZADO: INFORMACIÓN Y NORMAS DE LA CASA
// ==========================================
function renderCasaInfo() {
  if (!AppState.casaInfo) return;

  const containerHab = document.getElementById('casa-info-habitaciones');
  const containerNormas = document.getElementById('casa-info-normas');
  const containerConsejos = document.getElementById('casa-info-consejos');

  if (containerHab) {
    containerHab.innerHTML = formatLinesToList(AppState.casaInfo.habitaciones, 'sky');
  }
  if (containerNormas) {
    containerNormas.innerHTML = formatLinesToList(AppState.casaInfo.normas, 'amber');
  }
  if (containerConsejos) {
    const raw = StorageService.fixEncoding((AppState.casaInfo.consejos || '')).trim();
    containerConsejos.innerHTML = raw
      .split('\n')
      .filter(l => l.trim().length > 0)
      .map(p => `<p class="leading-relaxed">${escapeHtml(StorageService.fixEncoding(p))}</p>`)
      .join('');
  }
}

function formatLinesToList(text, colorName = 'sky') {
  if (!text) return '<li class="text-slate-400 italic">Sin información detallada</li>';
  
  const bulletColor = colorName === 'amber' ? 'text-amber-400' : 'text-sky-400';
  const lines = text.split('\n').filter(l => l.trim().length > 0);

  return lines.map(line => {
    // Quitar viñeta, guión, punto o numeración inicial si ya la tiene
    const cleanLine = line.replace(/^([•\-\*\.]|\d+[\.\)])\s*/, '').trim();
    const fixedText = StorageService.fixEncoding(cleanLine);
    return `
      <li class="flex items-start gap-2">
        <span class="${bulletColor} font-bold">•</span>
        <span>${escapeHtml(fixedText)}</span>
      </li>
    `;
  }).join('');
}

// Abrir modal para editar información y normas de La Casa
function openModalEditarCasa(targetSection = null) {
  const modal = document.getElementById('modal-editar-casa');
  if (!modal) return;

  const inputHab = document.getElementById('edit-casa-habitaciones');
  const inputNormas = document.getElementById('edit-casa-normas');
  const inputConsejos = document.getElementById('edit-casa-consejos');

  const info = AppState.casaInfo || StorageService.getDefaultCasaInfo();

  if (inputHab) inputHab.value = info.habitaciones || '';
  if (inputNormas) inputNormas.value = info.normas || '';
  if (inputConsejos) inputConsejos.value = info.consejos || '';

  modal.classList.remove('hidden');
  document.body.classList.add('overflow-hidden');

  // Si se abrió desde una tarjeta específica, hacer foco en ella
  setTimeout(() => {
    if (targetSection === 'habitaciones' && inputHab) inputHab.focus();
    else if (targetSection === 'normas' && inputNormas) inputNormas.focus();
    else if (targetSection === 'consejos' && inputConsejos) inputConsejos.focus();
  }, 100);
}

// Guardar cambios en las normas e información de la casa
async function handleGuardarCasaInfo(e) {
  e.preventDefault();

  const habitaciones = document.getElementById('edit-casa-habitaciones').value.trim();
  const normas = document.getElementById('edit-casa-normas').value.trim();
  const consejos = document.getElementById('edit-casa-consejos').value.trim();
  const btnSubmit = document.getElementById('btn-submit-edit-casa');

  try {
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<span>Guardando cambios...</span>';

    const newInfo = { habitaciones, normas, consejos };
    const saved = await StorageService.saveCasaInfo(newInfo);
    AppState.casaInfo = saved;

    renderCasaInfo();
    closeAllModals();
    showToast('¡Información y normas de la casa actualizadas! 🏡', 'success');
  } catch (error) {
    console.error('Error al guardar info de la casa:', error);
    showToast('Error al guardar los cambios', 'error');
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.innerHTML = '<span>Guardar Cambios 💾</span>';
  }
}

// Restablecer normas e info por defecto
async function handleResetCasaInfo() {
  const confirmar = confirm('¿Quieres restablecer la información y normas a los valores por defecto?');
  if (!confirmar) return;

  const defaultInfo = StorageService.getDefaultCasaInfo();
  document.getElementById('edit-casa-habitaciones').value = defaultInfo.habitaciones;
  document.getElementById('edit-casa-normas').value = defaultInfo.normas;
  document.getElementById('edit-casa-consejos').value = defaultInfo.consejos;
}

// ==========================================
// MODALES Y FORMULARIOS DE RESERVA
// ==========================================

function openModalReserva(prefillDate = null) {
  const modal = document.getElementById('modal-reserva');
  const form = document.getElementById('form-nueva-reserva');
  const warningEl = document.getElementById('aviso-disponibilidad');
  const summaryEl = document.getElementById('resumen-noches');

  form.reset();
  warningEl.classList.add('hidden');
  summaryEl.classList.add('hidden');

  AppState.selectedHabitaciones = 1;
  document.getElementById('reserva-habitaciones').value = 1;
  document.querySelectorAll('.habitacion-btn').forEach((b, idx) => {
    if (idx === 0) {
      b.classList.add('active', 'border-sky-500', 'bg-sky-500/20', 'text-sky-300', 'font-bold');
      b.classList.remove('border-slate-700', 'text-slate-300', 'bg-slate-800/60');
    } else {
      b.classList.remove('active', 'border-sky-500', 'bg-sky-500/20', 'text-sky-300', 'font-bold');
      b.classList.add('border-slate-700', 'text-slate-300', 'bg-slate-800/60');
    }
  });

  if (AppState.flatpickrInstance) {
    AppState.flatpickrInstance.clear();
    if (prefillDate) {
      const inDate = new Date(prefillDate);
      const outDate = new Date(inDate);
      outDate.setDate(outDate.getDate() + 3);
      AppState.flatpickrInstance.setDate([inDate, outDate], true);
    }
  }

  modal.classList.remove('hidden');
  document.body.classList.add('overflow-hidden');
}

async function handleNuevaReserva(e) {
  e.preventDefault();

  const nombre = document.getElementById('reserva-nombre').value.trim();
  const checkIn = document.getElementById('reserva-checkin').value;
  const checkOut = document.getElementById('reserva-checkout').value;
  const habitaciones = parseInt(document.getElementById('reserva-habitaciones').value, 10);
  const comentarios = document.getElementById('reserva-comentarios').value.trim();
  const btnSubmit = document.getElementById('btn-submit-reserva');

  if (!nombre) {
    showToast('Por favor, indica tu nombre', 'warning');
    return;
  }

  if (!checkIn || !checkOut) {
    showToast('Por favor, selecciona las fechas de entrada y salida', 'warning');
    return;
  }

  try {
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<span>Guardando reserva...</span>';

    await StorageService.addReserva({
      nombre,
      checkIn,
      checkOut,
      habitaciones,
      comentarios
    });

    await loadReservas();
    renderInicio();
    renderCalendar();
    renderLista();

    closeAllModals();
    showToast(`¡Reserva confirmada para ${nombre}! 🏖️`, 'success');

    switchTab('calendario');
  } catch (error) {
    console.error('Error al añadir reserva:', error);
    showToast(error.message || 'No se pudo guardar la reserva', 'error');
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.innerHTML = '<span>Confirmar Reserva Familiar 🏖️</span>';
  }
}

function openModalDetalle(reservaId) {
  const reserva = AppState.reservas.find((r) => r.id === reservaId);
  if (!reserva) return;

  AppState.selectedReserva = reserva;
  const modal = document.getElementById('modal-detalle');
  const color = getColorForName(reserva.nombre);
  const noches = calculateNights(reserva.checkIn, reserva.checkOut);

  document.getElementById('detalle-avatar').className = `w-14 h-14 rounded-2xl ${color.bg} border flex items-center justify-center font-bold text-xl shadow-md`;
  document.getElementById('detalle-avatar').innerText = getInitials(reserva.nombre);

  document.getElementById('detalle-nombre').innerText = reserva.nombre;
  document.getElementById('detalle-habitaciones-badge').innerText = `${reserva.habitaciones} de 3 habitaciones`;

  document.getElementById('detalle-checkin').innerText = formatDateFull(reserva.checkIn);
  document.getElementById('detalle-checkout').innerText = formatDateFull(reserva.checkOut);
  document.getElementById('detalle-noches').innerText = `${noches} noche${noches > 1 ? 's' : ''}`;

  const comentariosBox = document.getElementById('detalle-comentarios-box');
  const comentariosText = document.getElementById('detalle-comentarios');
  if (reserva.comentarios) {
    comentariosText.innerText = reserva.comentarios;
    comentariosBox.classList.remove('hidden');
  } else {
    comentariosBox.classList.add('hidden');
  }

  modal.classList.remove('hidden');
  document.body.classList.add('overflow-hidden');
}

function openModalMultiplesReservas(dateStr, reservas) {
  const modal = document.getElementById('modal-multiples');
  const container = document.getElementById('multiples-reservas-list');
  const title = document.getElementById('multiples-fecha-title');

  title.innerText = formatDateFull(dateStr);
  container.innerHTML = reservas.map(r => {
    const color = getColorForName(r.nombre);
    return `
      <div class="p-3.5 bg-slate-800/80 border border-slate-700 rounded-2xl flex items-center justify-between cursor-pointer hover:border-sky-400 transition"
           onclick="closeAllModals(); openModalDetalle('${r.id}')">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl ${color.bg} flex items-center justify-center font-bold">
            ${getInitials(r.nombre)}
          </div>
          <div>
            <p class="font-bold text-white text-sm">${r.nombre}</p>
            <p class="text-xs text-slate-400">${r.habitaciones} hab · ${formatDateRange(r.checkIn, r.checkOut)}</p>
          </div>
        </div>
        <span class="text-xs text-sky-400 font-bold">Ver detalle →</span>
      </div>
    `;
  }).join('');

  modal.classList.remove('hidden');
  document.body.classList.add('overflow-hidden');
}

async function handleCancelarReserva() {
  if (!AppState.selectedReserva) return;

  const confirmar = confirm(`¿Estás seguro de que quieres cancelar la reserva de ${AppState.selectedReserva.nombre} para las fechas del ${formatDateShort(AppState.selectedReserva.checkIn)} al ${formatDateShort(AppState.selectedReserva.checkOut)}?`);
  if (!confirmar) return;

  try {
    const id = AppState.selectedReserva.id;
    const nombre = AppState.selectedReserva.nombre;

    await StorageService.deleteReserva(id);

    await loadReservas();
    renderInicio();
    renderCalendar();
    renderLista();

    closeAllModals();
    showToast(`Reserva de ${nombre} cancelada correctamente`, 'info');
  } catch (error) {
    console.error('Error al cancelar reserva:', error);
    showToast('Error al cancelar la reserva', 'error');
  }
}

function closeAllModals() {
  document.querySelectorAll('.modal-overlay').forEach((m) => {
    m.classList.add('hidden');
  });
  document.body.classList.remove('overflow-hidden');
}

// ==========================================
// UTILIDADES Y FORMATEO DE FECHAS
// ==========================================

function calculateNights(inStr, outStr) {
  const dIn = new Date(inStr);
  const dOut = new Date(outStr);
  const diffTime = Math.abs(dOut - dIn);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
}

function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return `${parseInt(day, 10)} ${monthNames[parseInt(month, 10) - 1]}`;
}

function formatDateFull(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  const date = new Date(y, m - 1, d);
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  return `${days[date.getDay()]}, ${date.getDate()} de ${months[date.getMonth()]} de ${date.getFullYear()}`;
}

function formatDateRange(inStr, outStr) {
  return `${formatDateShort(inStr)} - ${formatDateShort(outStr)}`;
}

function getInitials(name) {
  if (!name) return 'CH';
  const parts = name.trim().split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.innerText = str;
  return div.innerHTML;
}

// Toast Notificaciones
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  const bgColors = {
    success: 'bg-emerald-600 text-white shadow-emerald-900/50',
    error: 'bg-rose-600 text-white shadow-rose-900/50',
    warning: 'bg-amber-600 text-white shadow-amber-900/50',
    info: 'bg-slate-800 text-white shadow-slate-950/50 border border-slate-700'
  };

  toast.className = `${bgColors[type] || bgColors.info} px-4 py-3 rounded-2xl shadow-xl text-xs sm:text-sm font-semibold flex items-center gap-2 transform transition-all duration-300 translate-y-4 opacity-0 border border-white/10`;
  toast.innerHTML = `
    <span>${type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️'}</span>
    <span>${message}</span>
  `;

  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-4', 'opacity-0');
  });

  setTimeout(() => {
    toast.classList.add('translate-y-4', 'opacity-0');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ==========================================
// SEGURIDAD: CONTROL DE ACCESO POR PIN (8080)
// ==========================================
const PIN_CORRECTO = '8080';
const PIN_STORAGE_KEY = 'chipiona_auth_pin_verified';

function checkAuthPIN() {
  const isAuth = localStorage.getItem(PIN_STORAGE_KEY) === PIN_CORRECTO;
  const lockScreen = document.getElementById('screen-pin-lock');
  if (!lockScreen) return;

  if (isAuth) {
    lockScreen.classList.add('hidden');
  } else {
    lockScreen.classList.remove('hidden');
    const inputPin = document.getElementById('input-pin');
    if (inputPin) {
      inputPin.value = '';
      setTimeout(() => inputPin.focus(), 250);
    }
  }
}

function setupPINAuth() {
  const form = document.getElementById('form-pin-lock');
  const inputPin = document.getElementById('input-pin');
  const errorMsg = document.getElementById('pin-error-msg');
  const lockScreen = document.getElementById('screen-pin-lock');
  const container = document.getElementById('pin-input-container');

  if (!form || !inputPin) return;

  // Auto-validar automáticamente al teclear los 4 dígitos
  inputPin.addEventListener('input', () => {
    if (errorMsg) errorMsg.classList.add('hidden');
    if (inputPin.value.length === 4) {
      validarPIN();
    }
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    validarPIN();
  });

  function validarPIN() {
    const valor = inputPin.value.trim();
    if (valor === PIN_CORRECTO) {
      localStorage.setItem(PIN_STORAGE_KEY, PIN_CORRECTO);
      if (errorMsg) errorMsg.classList.add('hidden');
      lockScreen.classList.add('animate-fade-out');
      setTimeout(() => {
        lockScreen.classList.add('hidden');
        lockScreen.classList.remove('animate-fade-out');
      }, 200);
      showToast('¡PIN correcto! Bienvenido/a 🏖️', 'success');
    } else {
      if (errorMsg) errorMsg.classList.remove('hidden');
      if (container) {
        container.classList.add('animate-shake');
        setTimeout(() => container.classList.remove('animate-shake'), 450);
      }
      inputPin.value = '';
      inputPin.focus();
    }
  }

  // Botón para bloquear / cerrar sesión manualmente si se desea
  const btnLock = document.getElementById('btn-lock-session');
  if (btnLock) {
    btnLock.addEventListener('click', () => {
      localStorage.removeItem(PIN_STORAGE_KEY);
      checkAuthPIN();
      showToast('Sesión bloqueada 🔒', 'info');
    });
  }
}

// Exponer funciones necesarias
window.openModalReserva = openModalReserva;
window.openModalDetalle = openModalDetalle;
window.openModalEditarCasa = openModalEditarCasa;
window.closeAllModals = closeAllModals;
window.switchTab = switchTab;
window.checkAuthPIN = checkAuthPIN;
