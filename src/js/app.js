/* =========================================
   APP — Lógica principal do cliente
   ========================================= */

const App = {
  state: {
    client: null,
    services: [],
    date: null,
    time: null,
    booking: null
  },

  // --- Navegação entre páginas ---
  showPage(id) {
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    const pg = document.getElementById(id);
    if (pg) { pg.classList.remove('hidden'); window.scrollTo(0,0); }
    this.updateBreadcrumb(id);
  },

  updateBreadcrumb(id) {
    const map = {
      'page-home':    'Início',
      'page-register':'Cadastro',
      'page-services':'Serviços',
      'page-schedule':'Agendamento',
      'page-confirm': 'Confirmação',
    };
    const el = document.getElementById('breadcrumb-current');
    if (el && map[id]) el.textContent = map[id];
  },

  // --- Cadastro do cliente ---
  submitRegister(e) {
    e.preventDefault();
    if (!this.validateRegisterForm()) return;

    const client = {
      name:         document.getElementById('inp-name').value.trim(),
      neighborhood: document.getElementById('inp-neighborhood').value.trim(),
      phone:        document.getElementById('inp-phone').value.replace(/\D/g,''),
      id:           Date.now().toString()
    };

    Storage.saveClient(client);
    this.state.client = client;
    this.showServicesPage();
  },

  validateRegisterForm() {
    let valid = true;

    const setError = (id, msg) => {
      const el  = document.getElementById(id);
      const err = document.getElementById(id + '-err');
      el.classList.add('error');
      if (err) { err.textContent = msg; err.classList.add('show'); }
      valid = false;
    };

    const clearError = id => {
      const el  = document.getElementById(id);
      const err = document.getElementById(id + '-err');
      el.classList.remove('error');
      if (err) err.classList.remove('show');
    };

    // Nome
    const name = document.getElementById('inp-name').value.trim();
    if (!name) setError('inp-name', 'Campo obrigatório.');
    else        clearError('inp-name');

    // Bairro
    const neighborhood = document.getElementById('inp-neighborhood').value.trim();
    if (!neighborhood) setError('inp-neighborhood', 'Campo obrigatório.');
    else               clearError('inp-neighborhood');

    // WhatsApp
    const digits = document.getElementById('inp-phone').value.replace(/\D/g, '');
    const ddd    = parseInt(digits.slice(0, 2), 10);
    const validDDD    = ddd >= 11 && ddd <= 99;
    const validLength = digits.length === 11;
    const validNinth  = digits.length === 11 && digits[2] === '9';

    if (!digits) {
      setError('inp-phone', 'Campo obrigatório.');
    } else if (!validLength || !validDDD || !validNinth) {
      setError('inp-phone', 'Informe um celular válido com DDD: (XX) 9XXXX-XXXX.');
    } else {
      clearError('inp-phone');
    }

    if (!valid) this.showToast('Corrija os campos destacados.', 'error');
    return valid;
  },

  // --- Serviços ---
  showServicesPage() {
    this.renderServices();
    this.showPage('page-services');
  },

  renderServices() {
    const grid = document.getElementById('services-grid');
    grid.innerHTML = '';

    DATA.getServices().forEach(svc => {
      const selected = this.state.services.find(s => s.id === svc.id);
      const div = document.createElement('div');
      div.className = `service-card${selected ? ' selected' : ''}`;
      div.onclick = () => this.toggleService(svc, div);
      div.innerHTML = `
        <div class="service-card-top">
          <span class="service-emoji">${svc.emoji}</span>
          <div class="service-check">${selected ? '✓' : ''}</div>
        </div>
        <div class="service-name">${svc.name}</div>
        ${svc.duration > 0 ? `<div class="service-duration">⏱ ${Utils.durationText(svc.duration)}</div>` : ''}
        <div class="service-price">${Utils.formatCurrency(svc.price)}</div>
      `;
      grid.appendChild(div);
    });

    this.updateServicesTotal();
  },

  toggleService(svc, el) {
    const idx = this.state.services.findIndex(s => s.id === svc.id);
    if (idx >= 0) {
      this.state.services.splice(idx, 1);
      el.classList.remove('selected');
      el.querySelector('.service-check').textContent = '';
    } else {
      this.state.services.push(svc);
      el.classList.add('selected');
      el.querySelector('.service-check').textContent = '✓';
    }
    this.updateServicesTotal();
  },

  updateServicesTotal() {
    const total = this.state.services.reduce((a,s)=>a+s.price,0);
    const dur   = this.state.services.reduce((a,s)=>a+s.duration,0);
    const count = this.state.services.length;
    document.getElementById('svc-total-price').textContent = Utils.formatCurrency(total);
    const durEl = document.getElementById('svc-total-duration');
    if (durEl) durEl.textContent = dur ? Utils.durationText(dur) : '—';
    document.getElementById('svc-total-count').textContent = count ? `${count} serviço${count>1?'s':''}` : 'Nenhum';
  },

  confirmServices() {
    if (!this.state.services.length) {
      this.showToast('Selecione ao menos um serviço.', 'error');
      return;
    }
    this.showSchedulePage();
  },

  // --- Agendamento ---
  showSchedulePage() {
    this.state.date = null;
    this.state.time = null;
    this.renderCalendar(new Date());
    document.getElementById('slots-section').classList.add('hidden');
    document.getElementById('confirm-schedule-btn').disabled = true;
    this.showPage('page-schedule');
  },

  renderCalendar(refDate) {
    const cal = document.getElementById('calendar-grid');
    const title = document.getElementById('cal-month-title');
    const today = Utils.today();
    const y = refDate.getFullYear(), m = refDate.getMonth();
    const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    title.textContent = `${months[m]} de ${y}`;
    this._calRef = refDate;

    const firstDay = new Date(y, m, 1).getDay();
    const lastDay  = new Date(y, m+1, 0).getDate();

    cal.innerHTML = '';
    ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].forEach(d => {
      const h = document.createElement('div');
      h.className = 'cal-day-header'; h.textContent = d;
      cal.appendChild(h);
    });

    for (let i=0; i<firstDay; i++) {
      const e = document.createElement('div');
      e.className = 'cal-day cal-empty';
      cal.appendChild(e);
    }

    for (let d=1; d<=lastDay; d++) {
      const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const cell = document.createElement('div');
      cell.className = 'cal-day';
      cell.textContent = d;

      const weekDay = new Date(y,m,d).getDay();
      if (weekDay === 0) { cell.classList.add('cal-past'); cell.title = 'Fechado aos domingos'; }
      else if (dateStr < today) { cell.classList.add('cal-past'); }
      else if (dateStr === today) { cell.classList.add('cal-today'); }

      if (!cell.classList.contains('cal-past')) {
        let slots = DATA.generateSlots(dateStr);

        if (dateStr === today) {
          const now = new Date();
          const nowStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
          slots = slots.filter(s => s.time > nowStr);
        }

        const booked = slots.filter(s => !s.available).length;
        const free   = slots.filter(s => s.available).length;

        if (slots.length === 0 || free === 0) {
          cell.classList.add('cal-full');
          cell.title = slots.length === 0 ? 'Encerrado' : 'Lotado';
        } else if (booked > 0) {
          cell.classList.add('cal-partial');
          cell.title = `${free} horário${free > 1 ? 's' : ''} livre${free > 1 ? 's' : ''}`;
        } else {
          cell.classList.add('cal-available');
        }

        if (!cell.classList.contains('cal-full')) {
          cell.onclick = () => this.selectDate(dateStr, cell);
        }
      }

      if (dateStr === this.state.date) cell.classList.add('cal-selected');
      cal.appendChild(cell);
    }
  },

  calPrev() {
    const d = new Date(this._calRef);
    d.setMonth(d.getMonth()-1);
    if (d >= new Date(new Date().getFullYear(), new Date().getMonth())) this.renderCalendar(d);
  },
  calNext() {
    const d = new Date(this._calRef);
    d.setMonth(d.getMonth()+1);
    this.renderCalendar(d);
  },

  selectDate(dateStr, cell) {
    document.querySelectorAll('.cal-day.cal-selected').forEach(c => c.classList.remove('cal-selected'));
    cell.classList.add('cal-selected');
    this.state.date = dateStr;
    this.state.time = null;
    this.renderSlots(dateStr);
    document.getElementById('slots-section').classList.remove('hidden');
    document.getElementById('slots-date-title').textContent = Utils.formatDateFull(dateStr);
    document.getElementById('confirm-schedule-btn').disabled = true;
  },

  renderSlots(dateStr) {
    const grid = document.getElementById('slots-grid');
    const slots = DATA.generateSlots(dateStr);
    grid.innerHTML = '';
    const now = new Date();
    const todayStr = Utils.today();

    slots.forEach(slot => {
      const div = document.createElement('div');
      div.className = 'slot';
      div.textContent = slot.time;

      const isPast = dateStr === todayStr &&
        slot.time <= `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

      if (!slot.available || isPast) {
        div.classList.add('slot-taken');
        div.title = isPast ? 'Horário passado' : 'Horário cheio';
      } else {
        div.onclick = () => this.selectSlot(slot.time, div);
        if (slot.time === this.state.time) div.classList.add('slot-selected');
      }
      grid.appendChild(div);
    });
  },

  selectSlot(time, el) {
    document.querySelectorAll('.slot.slot-selected').forEach(s => s.classList.remove('slot-selected'));
    el.classList.add('slot-selected');
    this.state.time = time;
    document.getElementById('confirm-schedule-btn').disabled = false;
  },

  confirmSchedule() {
    if (!this.state.date || !this.state.time) {
      this.showToast('Selecione data e horário.', 'error'); return;
    }
    this.showConfirmPage();
  },

  // --- Confirmação ---
  showConfirmPage() {
    const { client, services, date, time } = this.state;
    const total = services.reduce((a,s)=>a+s.price,0);

    document.getElementById('confirm-client').textContent = client.name;
    document.getElementById('confirm-date').textContent = Utils.formatDateFull(date);
    document.getElementById('confirm-time').textContent = time;
    document.getElementById('confirm-services').innerHTML =
      services.map(s=>`<span class="card-badge badge-blue">${s.emoji} ${s.name}</span>`).join('');
    document.getElementById('confirm-total').textContent = Utils.formatCurrency(total);
    const totalDur = services.reduce((a,s) => a + (s.duration || 0), 0);
    document.getElementById('confirm-duration').textContent =
      totalDur > 0 ? Utils.durationText(totalDur) : '—';

    const cfg = Storage.getOwnerConfig();
    const rawPhone = (cfg.phone || '').replace(/\D/g,'');
    const intlPhone = rawPhone ? (rawPhone.startsWith('55') && rawPhone.length > 11 ? rawPhone : '55' + rawPhone) : '';
    const svcText = services.map(s=>`${s.emoji} ${s.name}`).join(', ');
    const waMsg = [
      `Olá! Gostaria de confirmar meu agendamento:`,
      ``,
      `*${client.name}*`,
      `WhatsApp: ${Utils.formatPhone(client.phone)}`,
      `${Utils.formatDateFull(date)}`,
      `Horário: ${time}`,
      `Serviços: ${svcText}`,
      `Total: ${Utils.formatCurrency(total)}`
    ].join('\n');
    const waHref = (intlPhone ? `https://wa.me/${intlPhone}` : `https://wa.me/`) + `?text=${encodeURIComponent(waMsg)}`;
    document.getElementById('confirm-whatsapp-link').href = waHref;

    this.showPage('page-confirm');
  },

  finalizeBooking() {
    const { client, services, date, time } = this.state;
    const total = services.reduce((a,s)=>a+s.price,0);
    const slotKey = `${date}_barber_${time}`;

    const booking = Storage.saveBooking({
      type: 'barber', date, time, slotKey,
      clientName:  client.name,
      clientPhone: client.phone,
      clientCode:  Utils.clientCode(client.phone),
      neighborhood: client.neighborhood,
      services, total,
      status: 'confirmed'
    });

    this.state.booking = booking;
    this.showSuccessPage(booking);
  },

  showSuccessPage(booking) {
    document.getElementById('success-code').textContent = booking.id;
    document.getElementById('success-name').textContent = booking.clientName;
    document.getElementById('success-date').textContent = Utils.formatDateFull(booking.date);
    document.getElementById('success-time').textContent = booking.time;
    document.getElementById('success-services').innerHTML =
      booking.services.map(s=>`• ${s.emoji} ${s.name}`).join('<br>');
    document.getElementById('success-total').textContent = Utils.formatCurrency(booking.total);
    document.getElementById('gcal-link').href = Utils.googleCalendarURL(booking);

    const cfg = Storage.getOwnerConfig();
    const rawPhone = (cfg.phone || '').replace(/\D/g,'');
    const intlPhone = rawPhone ? (rawPhone.startsWith('55') && rawPhone.length > 11 ? rawPhone : '55' + rawPhone) : '';
    const svcText = booking.services.map(s=>`${s.emoji} ${s.name}`).join(', ');
    const waMsg = [
      `Agendamento confirmado!`,
      ``,
      `*${booking.clientName}*`,
      `WhatsApp: ${Utils.formatPhone(booking.clientPhone || '')}`,
      `${Utils.formatDateFull(booking.date)}`,
      `Horário: ${booking.time}`,
      `Serviços: ${svcText}`,
      `Total: ${Utils.formatCurrency(booking.total)}`
    ].join('\n');
    const waHref = (intlPhone ? `https://wa.me/${intlPhone}` : `https://wa.me/`) + `?text=${encodeURIComponent(waMsg)}`;
    document.getElementById('whatsapp-link').href = waHref;

    this.showPage('page-success');
  },

  downloadICS() {
    const ics = Utils.generateICS(this.state.booking);
    const blob = new Blob([ics], { type: 'text/calendar' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `agendamento-${this.state.booking.id}.ics`;
    a.click();
  },

  newBooking() {
    this.state = { client: this.state.client, services: [], date: null, time: null, booking: null };
    this.showPage('page-home');
  },

  // --- Toast ---
  showToast(msg, type='info') {
    let toast = document.getElementById('toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toast';
      toast.style.cssText = `
        position:fixed;bottom:1.5rem;right:1.5rem;z-index:9999;
        background:#1351B4;color:#fff;padding:.75rem 1.25rem;
        border-radius:8px;font-size:.88rem;font-weight:600;
        box-shadow:0 4px 16px rgba(0,0,0,.2);
        transform:translateY(100px);transition:transform .3s;
        max-width:320px;display:flex;align-items:center;gap:.6rem;
      `;
      document.body.appendChild(toast);
    }
    const icons = { success:'✓', error:'✕', info:'ℹ' };
    const colors = { success:'#168821', error:'#E52207', info:'#1351B4' };
    toast.style.background = colors[type];
    toast.innerHTML = `<span>${icons[type]}</span><span>${msg}</span>`;
    toast.style.transform = 'translateY(0)';
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { toast.style.transform = 'translateY(100px)'; }, 3500);
  },

  maskPhone(e) { e.target.value = Utils.formatPhone(e.target.value); },

  init() {
    document.getElementById('inp-phone')?.addEventListener('input', e => this.maskPhone(e));
    document.getElementById('register-form')?.addEventListener('submit', e => this.submitRegister(e));
    this._applyLogo();
    this._applyOwnerBranding();

    // Atualiza a UI em tempo real quando dados mudam no Firestore (outro dispositivo)
    Storage.onChange(type => {
      if (type === 'bookings') {
        if (this._calRef) this.renderCalendar(this._calRef);
        if (this.state.date) this.renderSlots(this.state.date);
      }
      if (type === 'config') this._applyOwnerBranding();
      if (type === 'logo')   this._applyLogo();
      if (type === 'services') {
        const active = document.querySelector('.page:not(.hidden)');
        if (active && active.id === 'page-services') this.renderServices();
      }
    });
  },

  _applyOwnerBranding() {
    const cfg  = Storage.getOwnerConfig();
    const name = (cfg.name || '').trim() || 'Barbearia';

    const hide = id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; };
    const set  = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };

    hide('register-type-tag');
    hide('services-type-tag');

    set('register-hero-title', `✂️ ${name}`);
    set('success-estab',       `✂️ ${name}`);
  },

  _applyLogo() {
    const logo = Storage.getLogo();
    const el = document.getElementById('header-logo-icon');
    if (!el) return;
    if (logo) {
      el.style.width  = '88px';
      el.style.height = '88px';
      el.style.background = 'transparent';
      el.innerHTML = `<img src="${logo}" alt="Logo" style="width:88px;height:88px;object-fit:cover;border-radius:50%;display:block;">`;
    } else {
      el.style.width  = '';
      el.style.height = '';
      el.style.background = '';
      el.textContent = '✂';
    }
  }
};

// App.init() é chamado pelo script assíncrono em index.html após Storage.init()
