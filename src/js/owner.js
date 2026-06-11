/* =========================================
   OWNER — Painel do Gestor
   ========================================= */

const Owner = {
  state: {
    tab: 'agenda',
    selectedDate: null,
    loggedIn: false
  },

  // --- Autenticação Firebase ---
  async login() {
    const email = document.getElementById('owner-email').value.trim();
    const pass  = document.getElementById('owner-pass').value;
    const errEl = document.getElementById('owner-login-error');
    const btn   = document.getElementById('owner-login-btn');
    if (!email || !pass) { this._setAuthErr(errEl, 'Preencha e-mail e senha.'); return; }
    this._setAuthErr(errEl, '');
    btn.disabled = true; btn.textContent = 'Entrando...';
    try {
      const cred = await Storage._auth.signInWithEmailAndPassword(email, pass);
      await Storage._setEstab(cred.user.uid);
      this._afterLogin();
    } catch(e) {
      console.error('[Auth login]', e.code, e.message);
      this._setAuthErr(errEl, this._authErrMsg(e.code));
      btn.disabled = false; btn.textContent = 'Entrar no Painel';
    }
  },

  async register() {
    const name  = document.getElementById('reg-name').value.trim();
    const type  = document.getElementById('reg-type').value;
    const email = document.getElementById('reg-email').value.trim();
    const pass  = document.getElementById('reg-pass').value;
    const pass2 = document.getElementById('reg-pass2').value;
    const errEl = document.getElementById('owner-reg-error');
    const btn   = document.getElementById('owner-reg-btn');
    if (!name || !email || !pass) { this._setAuthErr(errEl, 'Preencha todos os campos obrigatórios.'); return; }
    if (pass.length < 6)          { this._setAuthErr(errEl, 'A senha deve ter pelo menos 6 caracteres.'); return; }
    if (pass !== pass2)           { this._setAuthErr(errEl, 'As senhas não coincidem.'); return; }
    this._setAuthErr(errEl, '');
    btn.disabled = true; btn.textContent = 'Criando conta...';
    try {
      const cred = await Storage._auth.createUserWithEmailAndPassword(email, pass);
      const uid  = cred.user.uid;
      await Storage.createEstablishment(uid, { name, type, email });
      await Storage._setEstab(uid);
      Storage.saveOwnerConfig({ name, type, phone: '', address: '', gcalEnabled: false, gcalEmail: '' });
      this._afterLogin();
    } catch(e) {
      console.error('[Auth register]', e.code, e.message);
      this._setAuthErr(errEl, this._authErrMsg(e.code));
      btn.disabled = false; btn.textContent = 'Criar Conta e Entrar';
    }
  },

  _setAuthErr(el, msg) {
    el.textContent = msg;
    el.style.display = msg ? 'block' : 'none';
  },

  _authErrMsg(code) {
    const map = {
      'auth/email-already-in-use':      'Este e-mail já está cadastrado. Clique em "Entrar".',
      'auth/user-not-found':            'E-mail não encontrado. Verifique ou crie uma conta.',
      'auth/wrong-password':            'Senha incorreta.',
      'auth/invalid-credential':        'E-mail ou senha incorretos.',
      'auth/invalid-email':             'E-mail inválido.',
      'auth/weak-password':             'Senha fraca. Use pelo menos 6 caracteres.',
      'auth/operation-not-allowed':     'Login com e-mail não está habilitado. Ative em Firebase → Authentication → Sign-in method → E-mail/senha.',
      'auth/invalid-api-key':           'Chave de API inválida. Verifique o arquivo firebase-config.js.',
      'auth/configuration-not-found':   'Projeto Firebase não encontrado. Verifique o firebase-config.js.',
      'auth/network-request-failed':    'Sem conexão com o Firebase. Verifique sua internet e o firebase-config.js.',
      'auth/too-many-requests':         'Muitas tentativas. Aguarde alguns minutos.',
    };
    return map[code] || `Erro: ${code || 'desconhecido'}. Verifique o console (F12).`;
  },

  showAuthTab(tab) {
    document.getElementById('auth-login').style.display    = tab === 'login'    ? '' : 'none';
    document.getElementById('auth-register').style.display = tab === 'register' ? '' : 'none';
    const activeStyle   = 'background:var(--blue-600);color:#fff';
    const inactiveStyle = 'background:transparent;color:var(--gray-60)';
    document.getElementById('tab-login-btn').style.cssText    = tab === 'login'    ? activeStyle : inactiveStyle;
    document.getElementById('tab-register-btn').style.cssText = tab === 'register' ? activeStyle : inactiveStyle;
  },

  _afterLogin() {
    this.state.loggedIn = true;
    document.getElementById('owner-login-screen').classList.add('hidden');
    document.getElementById('owner-dashboard').classList.remove('hidden');
    const cfg = Storage.getOwnerConfig();
    document.getElementById('owner-nav-area').innerHTML = `
      <div style="color:rgba(255,255,255,.7);font-size:.82rem">${cfg.name || 'Gestor'} — conectado</div>
    `;
    this.init();
  },

  async logout() {
    await Storage._auth.signOut();
    this.state.loggedIn = false;
    document.getElementById('owner-login-screen').classList.remove('hidden');
    document.getElementById('owner-dashboard').classList.add('hidden');
    document.getElementById('owner-email').value = '';
    document.getElementById('owner-pass').value  = '';
  },

  copyClientLink() {
    const base = window.location.href.replace('owner.html', 'index.html').split('?')[0];
    const link = `${base}?id=${Storage._estabId}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(link).then(() => App.showToast('Link copiado!', 'success'));
    } else {
      const inp = document.createElement('input');
      inp.value = link; document.body.appendChild(inp); inp.select();
      document.execCommand('copy'); document.body.removeChild(inp);
      App.showToast('Link copiado!', 'success');
    }
  },

  // --- Tabs ---
  setTab(tab) {
    this.state.tab = tab;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.getElementById(`tab-${tab}`)?.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    document.getElementById(`content-${tab}`)?.classList.remove('hidden');

    if (tab === 'agenda')    this.renderAgenda();
    if (tab === 'calendar')  this.renderOwnerCalendar();
    if (tab === 'clients')   this.renderClients();
    if (tab === 'analytics') this.renderAnalytics();
    if (tab === 'services')  this.renderServiceManager();
    if (tab === 'config')    this.renderConfig();
  },

  // --- Stats ---
  renderStats() {
    const today = Utils.today();
    const bookings = Storage.getBookings().filter(b => b.status !== 'cancelled');
    const todayB = bookings.filter(b => b.date === today);
    const weekB  = bookings.filter(b => {
      const d = new Date(b.date + 'T00:00'); const now = new Date();
      const ws = new Date(now); ws.setDate(now.getDate() - now.getDay());
      return d >= ws;
    });
    const slots = DATA.generateSlots(today);
    const freeToday = slots.filter(s => s.available).length;

    document.getElementById('stat-today').textContent     = todayB.length;
    document.getElementById('stat-free').textContent      = freeToday;
    document.getElementById('stat-rev-today').textContent = Utils.formatCurrency(todayB.reduce((a,b)=>a+b.total,0));
    document.getElementById('stat-rev-week').textContent  = Utils.formatCurrency(weekB.reduce((a,b)=>a+b.total,0));
  },

  // --- Agenda dos próximos 7 dias ---
  renderAgenda() {
    const container = document.getElementById('agenda-container');
    const today = Utils.today();
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(); d.setDate(d.getDate() + i);
      const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      if (d.getDay() !== 0) days.push(ds);
    }

    container.innerHTML = '';
    days.forEach(dateStr => {
      const slots    = DATA.generateSlots(dateStr);
      const bookings = Storage.getBookingsByDate(dateStr, 'barber');
      const freeCount = slots.filter(s => s.available).length;
      const isToday = dateStr === today;

      const div = document.createElement('div');
      div.className = 'agenda-day';
      div.innerHTML = `
        <div class="agenda-day-header">
          <div class="agenda-day-title">
            ${Utils.formatDateFull(dateStr)}
            ${isToday ? '<span class="card-badge badge-blue" style="font-size:.7rem;padding:.15rem .5rem;margin-left:.5rem">Hoje</span>' : ''}
          </div>
          <div style="display:flex;gap:.4rem">
            <span class="card-badge badge-green">${freeCount} livres</span>
            <span class="card-badge badge-blue">${bookings.length} agend.</span>
          </div>
        </div>
        <div class="agenda-slots" id="slots-day-${dateStr}"></div>
      `;
      container.appendChild(div);

      const slotsEl = document.getElementById(`slots-day-${dateStr}`);
      slots.forEach(slot => {
        const booking = slot.bookings[0];
        const el = document.createElement('div');
        el.className = 'agenda-slot';
        if (booking) {
          el.innerHTML = `
            <div class="agenda-time">${slot.time}</div>
            <div class="agenda-client">
              <div class="agenda-client-name">${booking.clientName} <span style="font-size:.72rem;font-weight:700;color:var(--blue-400);letter-spacing:.03em">${booking.clientCode || Utils.clientCode(booking.clientPhone)}</span></div>
              <div class="agenda-client-service">${booking.services.map(s=>s.name).join(', ')} · ${Utils.formatCurrency(booking.total)}</div>
            </div>
            <div style="display:flex;gap:.4rem;align-items:center;flex-shrink:0">
              <span class="agenda-slot-status status-booked">Agendado</span>
              <button onclick="Owner.cancelPrompt('${booking.id}','${slot.time}','${dateStr}')" class="btn btn-sm btn-outline-gray" title="Cancelar">✕</button>
              <a href="${Utils.googleCalendarURL(booking)}" target="_blank" class="btn btn-sm btn-outline-gray" title="Google Agenda">📅</a>
            </div>
          `;
        } else {
          el.innerHTML = `
            <div class="agenda-time">${slot.time}</div>
            <div class="agenda-client" style="color:var(--gray-40);font-size:.82rem">Disponível</div>
            <span class="agenda-slot-status status-free">Livre</span>
          `;
        }
        slotsEl.appendChild(el);
      });
    });
  },

  cancelPrompt(id, time, date) {
    if (confirm(`Cancelar agendamento das ${time} em ${Utils.formatDate(date)}?`)) {
      Storage.cancelBooking(id);
      this.renderAll();
      App.showToast('Agendamento cancelado.', 'success');
    }
  },

  // --- Calendário ---
  renderOwnerCalendar() {
    const container = document.getElementById('owner-cal-container');
    if (!this._ownerCalDate) this._ownerCalDate = new Date();
    const ref = this._ownerCalDate;
    const y = ref.getFullYear(), m = ref.getMonth();
    const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    const today = Utils.today();
    const firstDay = new Date(y,m,1).getDay();
    const lastDay  = new Date(y,m+1,0).getDate();

    container.innerHTML = `
      <div class="calendar-wrapper">
        <div class="cal-header">
          <button class="cal-nav" onclick="Owner.calPrev()">‹</button>
          <span class="cal-month">${months[m]} de ${y}</span>
          <button class="cal-nav" onclick="Owner.calNext()">›</button>
        </div>
        <div class="cal-grid" id="owner-cal-grid"></div>
        <div class="cal-legend">
          <div class="legend-item"><div class="legend-dot" style="background:var(--green-500)"></div>Livre</div>
          <div class="legend-item"><div class="legend-dot" style="background:var(--yellow-500)"></div>Parcial</div>
          <div class="legend-item"><div class="legend-dot" style="background:var(--red-500)"></div>Lotado</div>
        </div>
      </div>
      <div id="owner-day-detail" class="hidden"></div>
    `;

    const grid = document.getElementById('owner-cal-grid');
    ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].forEach(d => {
      const h = document.createElement('div'); h.className='cal-day-header'; h.textContent=d; grid.appendChild(h);
    });
    for (let i=0; i<firstDay; i++) {
      const e=document.createElement('div'); e.className='cal-day cal-empty'; grid.appendChild(e);
    }
    for (let d=1; d<=lastDay; d++) {
      const ds=`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const cell=document.createElement('div'); cell.className='cal-day'; cell.textContent=d;
      const wday=new Date(y,m,d).getDay();
      if (wday===0) { cell.classList.add('cal-past'); }
      else {
        const slots=DATA.generateSlots(ds);
        const free=slots.filter(s=>s.available).length;
        const booked=slots.filter(s=>!s.available).length;
        if (free===0) cell.classList.add('cal-full');
        else if (booked>0) cell.classList.add('cal-partial');
        else cell.classList.add('cal-available');
        if (ds===today) cell.classList.add('cal-today');
        if (ds===this.state.selectedDate) cell.classList.add('cal-selected');
        cell.onclick = () => this.showDayDetail(ds, cell);
      }
      grid.appendChild(cell);
    }
  },

  showDayDetail(dateStr, cell) {
    document.querySelectorAll('#owner-cal-grid .cal-selected').forEach(c=>c.classList.remove('cal-selected'));
    cell.classList.add('cal-selected');
    this.state.selectedDate = dateStr;

    const detail   = document.getElementById('owner-day-detail');
    const bookings = Storage.getBookingsByDate(dateStr, 'barber');
    const slots    = DATA.generateSlots(dateStr);
    const freeSlots = slots.filter(s=>s.available).length;

    detail.className = 'summary-card';
    detail.innerHTML = `
      <div class="summary-header">📋 ${Utils.formatDateFull(dateStr)}</div>
      <div class="summary-body">
        <div class="dash-stats" style="margin-bottom:1rem">
          <div class="stat-card"><div class="stat-value">${bookings.length}</div><div class="stat-label">Agendamentos</div></div>
          <div class="stat-card green"><div class="stat-value">${freeSlots}</div><div class="stat-label">Horários Livres</div></div>
          <div class="stat-card yellow"><div class="stat-value">${Utils.formatCurrency(bookings.reduce((a,b)=>a+b.total,0))}</div><div class="stat-label">Receita do Dia</div></div>
        </div>
        ${bookings.length ? bookings.map(b=>`
          <div class="agenda-slot" style="border:1px solid var(--gray-20);border-radius:8px;margin-bottom:.5rem">
            <div class="agenda-time">${b.time}</div>
            <div class="agenda-client">
              <div class="agenda-client-name">${b.clientName} <span style="font-size:.72rem;font-weight:700;color:var(--blue-400)">${b.clientCode || Utils.clientCode(b.clientPhone)}</span></div>
              <div class="agenda-client-service">${b.services.map(s=>s.name).join(', ')}</div>
            </div>
            <div>
              <span class="fw-bold" style="color:var(--blue-700)">${Utils.formatCurrency(b.total)}</span>
              <a href="${Utils.googleCalendarURL(b)}" target="_blank" class="btn btn-sm btn-outline-gray" style="margin-left:.5rem">📅</a>
            </div>
          </div>
        `).join('') : '<div class="text-center text-gray" style="padding:1.5rem">Nenhum agendamento neste dia.</div>'}
      </div>
    `;
  },

  calPrev() { this._ownerCalDate.setMonth(this._ownerCalDate.getMonth()-1); this.renderOwnerCalendar(); },
  calNext() { this._ownerCalDate.setMonth(this._ownerCalDate.getMonth()+1); this.renderOwnerCalendar(); },

  // --- Clientes ---
  renderClients() {
    const container = document.getElementById('clients-container');
    const bookings  = Storage.getBookings().filter(b => b.status !== 'cancelled');
    const clientMap = {};
    bookings.forEach(b => {
      const key = b.clientName + '_' + (b.clientPhone || '');
      if (!clientMap[key]) clientMap[key] = { name: b.clientName, phone: b.clientPhone, code: b.clientCode || Utils.clientCode(b.clientPhone), bookings: [], total: 0 };
      clientMap[key].bookings.push(b);
      clientMap[key].total += b.total;
    });
    const clients = Object.values(clientMap).sort((a,b) => b.total - a.total);

    if (!clients.length) {
      container.innerHTML = '<div class="alert alert-info"><span class="alert-icon">ℹ</span>Nenhum cliente cadastrado ainda.</div>';
      return;
    }

    container.innerHTML = `
      <div class="cards-grid cards-grid-2">
        ${clients.map(c => `
          <div class="card">
            <div class="card-header-strip strip-barber"></div>
            <div class="card-body">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem">
                <div>
                  <div class="card-title">${c.name} <span style="font-size:.75rem;font-weight:700;color:var(--blue-500)">${c.code}</span></div>
                  <div class="text-sm text-gray">WhatsApp: ${Utils.formatPhone(c.phone||'')}</div>
                </div>
                <div class="card-badge badge-blue">${c.bookings.length} visita${c.bookings.length>1?'s':''}</div>
              </div>
              <div class="summary-row" style="border-top:1px solid var(--gray-10);padding-top:.6rem">
                <span class="summary-label">Total Gasto</span>
                <span class="summary-value" style="color:var(--blue-700)">${Utils.formatCurrency(c.total)}</span>
              </div>
              <div class="summary-row">
                <span class="summary-label">Último Agend.</span>
                <span class="summary-value">${Utils.formatDate(c.bookings[c.bookings.length-1].date)}</span>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  },

  // =========================================
  // --- Gerenciar Serviços ---
  // =========================================
  renderServiceManager() {
    const container = document.getElementById('content-services');
    const services  = DATA.getServices();

    const wh = Storage.getWorkHours();
    const hoursOpts = (min, max, selected) =>
      Array.from({ length: max - min + 1 }, (_, i) => i + min)
        .map(h => `<option value="${h}" ${h === selected ? 'selected' : ''}>${String(h).padStart(2,'0')}:00</option>`)
        .join('');
    const intervalOpts = [15, 20, 30, 45, 60]
      .map(m => `<option value="${m}" ${m === wh.interval ? 'selected' : ''}>${m} min</option>`)
      .join('');

    container.innerHTML = `
      <!-- Horários de Funcionamento -->
      <div class="cfg-section">
        <p class="section-title">🕐 Horários de Funcionamento</p>
        <div class="form-row form-row-2" style="margin-bottom:1rem">
          <div class="form-group">
            <label class="form-label">Hora de Abertura</label>
            <select class="form-input" id="wh-start">${hoursOpts(5, 13, wh.start)}</select>
          </div>
          <div class="form-group">
            <label class="form-label">Hora de Fechamento</label>
            <select class="form-input" id="wh-end">${hoursOpts(12, 23, wh.end)}</select>
          </div>
        </div>
        <div class="form-group" style="max-width:220px;margin-bottom:1rem">
          <label class="form-label">Intervalo entre Horários</label>
          <select class="form-input" id="wh-interval">${intervalOpts}</select>
        </div>
        <button class="btn btn-primary btn-sm" onclick="Owner.saveWorkHours()">💾 Salvar Horários</button>
      </div>

      <!-- Formulário para adicionar serviço -->
      <div class="cfg-section">
        <p class="section-title">➕ Adicionar Novo Serviço</p>
        <div class="form-row form-row-2" style="margin-bottom:1rem">
          <div class="form-group">
            <label class="form-label">Nome do Serviço <span class="required">*</span></label>
            <input class="form-input" id="svc-new-name" type="text" placeholder="Ex: Coloração">
          </div>
          <div class="form-group">
            <label class="form-label">Emoji</label>
            <input class="form-input" id="svc-new-emoji" type="text" placeholder="✂️" maxlength="4" style="font-size:1.2rem">
          </div>
        </div>
        <div class="form-row form-row-2" style="margin-bottom:1rem">
          <div class="form-group">
            <label class="form-label">Preço (R$) <span class="required">*</span></label>
            <input class="form-input" id="svc-new-price" type="number" placeholder="0,00" min="0" step="0.01">
          </div>
          <div class="form-group">
            <label class="form-label">Duração (minutos) <span style="color:var(--gray-40);font-weight:400">(opcional)</span></label>
            <input class="form-input" id="svc-new-duration" type="number" placeholder="Ex: 30" min="1" step="5">
          </div>
        </div>
        <button class="btn btn-primary" onclick="Owner.addService()">➕ Adicionar Serviço</button>
      </div>

      <!-- Lista de serviços ativos -->
      <div class="cfg-section">
        <p class="section-title">✂️ Serviços Cadastrados (${services.length})</p>
        <div class="alert alert-info" style="margin-bottom:1rem">
          <span class="alert-icon">ℹ</span>
          <span>Alterações aqui refletem imediatamente na tela de agendamento dos clientes.</span>
        </div>
        <div id="services-manager-list">
          ${services.length ? services.map((s, i) => this._serviceRow(s, i)).join('') :
            '<div class="text-center text-gray" style="padding:2rem">Nenhum serviço cadastrado.</div>'
          }
        </div>
        <div style="margin-top:1rem;display:flex;gap:.75rem;flex-wrap:wrap">
          <button class="btn btn-outline-gray btn-sm" onclick="Owner.restoreDefaultServices()">
            🔄 Restaurar Serviços Padrão
          </button>
        </div>
      </div>
    `;
  },

  _serviceRow(svc, idx) {
    return `
      <div class="agenda-slot" id="svc-row-${svc.id}" style="border:1.5px solid var(--gray-20);border-radius:8px;margin-bottom:.5rem;padding:.6rem .75rem">
        <div style="font-size:1.3rem;min-width:32px">${svc.emoji}</div>
        <div class="agenda-client" style="flex:1">
          <div class="agenda-client-name" id="svc-name-${svc.id}">${svc.name}</div>
          <div class="agenda-client-service">
            ${Utils.formatCurrency(svc.price)}${svc.duration > 0 ? ` &nbsp;·&nbsp; ⏱ ${Utils.durationText(svc.duration)}` : ''}
          </div>
        </div>
        <div style="display:flex;gap:.4rem;flex-shrink:0">
          <button onclick="Owner.editServiceInline('${svc.id}')" class="btn btn-sm btn-outline-gray" title="Editar">✏️</button>
          <button onclick="Owner.removeService('${svc.id}')" class="btn btn-sm btn-danger" title="Remover">✕</button>
        </div>
      </div>
    `;
  },

  addService() {
    const name     = document.getElementById('svc-new-name').value.trim();
    const emoji    = document.getElementById('svc-new-emoji').value.trim() || '✂️';
    const price    = parseFloat(document.getElementById('svc-new-price').value);
    const duration = parseInt(document.getElementById('svc-new-duration').value) || 0;

    if (!name) { App.showToast('Digite o nome do serviço.', 'error'); return; }
    if (!price || price <= 0) { App.showToast('Digite um preço válido.', 'error'); return; }

    const services = DATA.getServices();
    const newSvc = {
      id: 'c' + Date.now(),
      name, emoji, price, duration
    };
    services.push(newSvc);
    Storage.saveServices(services);

    // Limpa form
    document.getElementById('svc-new-name').value = '';
    document.getElementById('svc-new-emoji').value = '';
    document.getElementById('svc-new-price').value = '';
    document.getElementById('svc-new-duration').value = '';

    App.showToast(`"${name}" adicionado!`, 'success');
    this.renderServiceManager();
  },

  removeService(id) {
    const services = DATA.getServices();
    const svc = services.find(s => s.id === id);
    if (!svc) return;
    if (!confirm(`Remover "${svc.name}" da lista de serviços?`)) return;

    const updated = services.filter(s => s.id !== id);
    Storage.saveServices(updated);
    App.showToast(`"${svc.name}" removido.`, 'success');
    this.renderServiceManager();
  },

  editServiceInline(id) {
    const services = DATA.getServices();
    const svc = services.find(s => s.id === id);
    if (!svc) return;

    const row = document.getElementById(`svc-row-${id}`);
    if (!row) return;

    row.innerHTML = `
      <div style="width:100%;display:grid;gap:.75rem">
        <div class="form-row form-row-2" style="margin:0">
          <div class="form-group">
            <label class="form-label" style="font-size:.7rem">Nome</label>
            <input class="form-input" id="edit-name-${id}" value="${svc.name}" style="padding:.45rem .75rem">
          </div>
          <div class="form-group">
            <label class="form-label" style="font-size:.7rem">Emoji</label>
            <input class="form-input" id="edit-emoji-${id}" value="${svc.emoji}" maxlength="4" style="padding:.45rem .75rem;font-size:1.1rem">
          </div>
        </div>
        <div class="form-row form-row-2" style="margin:0">
          <div class="form-group">
            <label class="form-label" style="font-size:.7rem">Preço (R$)</label>
            <input class="form-input" id="edit-price-${id}" type="number" value="${svc.price}" style="padding:.45rem .75rem">
          </div>
          <div class="form-group">
            <label class="form-label" style="font-size:.7rem">Duração (min)</label>
            <input class="form-input" id="edit-duration-${id}" type="number" value="${svc.duration}" style="padding:.45rem .75rem">
          </div>
        </div>
        <div style="display:flex;gap:.5rem">
          <button onclick="Owner.saveEditService('${id}')" class="btn btn-primary btn-sm">💾 Salvar</button>
          <button onclick="Owner.renderServiceManager()" class="btn btn-outline-gray btn-sm">Cancelar</button>
        </div>
      </div>
    `;
  },

  saveEditService(id) {
    const services = DATA.getServices();
    const idx = services.findIndex(s => s.id === id);
    if (idx < 0) return;

    const name     = document.getElementById(`edit-name-${id}`).value.trim();
    const emoji    = document.getElementById(`edit-emoji-${id}`).value.trim() || '✂️';
    const price    = parseFloat(document.getElementById(`edit-price-${id}`).value);
    const duration = parseInt(document.getElementById(`edit-duration-${id}`).value) || 0;

    if (!name || !price) { App.showToast('Preencha nome e preço.', 'error'); return; }

    services[idx] = { ...services[idx], name, emoji, price, duration };
    Storage.saveServices(services);
    App.showToast(`"${name}" atualizado!`, 'success');
    this.renderServiceManager();
  },

  saveWorkHours() {
    const start    = parseInt(document.getElementById('wh-start').value);
    const end      = parseInt(document.getElementById('wh-end').value);
    const interval = parseInt(document.getElementById('wh-interval').value);
    if (start >= end) {
      App.showToast('O fechamento deve ser após a abertura.', 'error'); return;
    }
    Storage.saveWorkHours({ start, end, interval });
    App.showToast('Horários salvos com sucesso!', 'success');
  },

  restoreDefaultServices() {
    if (!confirm('Restaurar os serviços padrão? Os serviços personalizados serão perdidos.')) return;
    Storage.saveServices([...DATA._defaultServices]);
    App.showToast('Serviços padrão restaurados.', 'success');
    this.renderServiceManager();
  },

  // --- Analytics ---
  renderAnalytics() {
    const container = document.getElementById('content-analytics');
    const allBookings = Storage.getBookings().filter(b => b.status !== 'cancelled');

    if (!allBookings.length) {
      container.innerHTML = `<div class="alert alert-info"><span class="alert-icon">ℹ</span>Nenhum agendamento registrado ainda. Volte após os primeiros agendamentos.</div>`;
      return;
    }

    const currentYear  = new Date().getFullYear();
    const selectedYear = this._analyticsYear || currentYear;
    const dataYears    = new Set(allBookings.map(b => b.date.slice(0, 4)));
    const minYear      = dataYears.size ? Math.min(...[...dataYears].map(Number)) : currentYear;
    const years        = [];
    for (let y = Math.min(minYear, currentYear - 2); y <= currentYear; y++) years.push(y);
    const bookings = allBookings.filter(b => b.date.startsWith(String(selectedYear)));

    // ---- Agregações ----
    const periods    = { '1–10': 0, '11–20': 0, '21–31': 0 };
    const weekCount  = Array(7).fill(0);
    const timeCount  = {};
    const monthRev   = {};
    const svcMap     = {};
    const clientMap  = {};
    const MONTHS     = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

    bookings.forEach(b => {
      const [y, m, d] = b.date.split('-').map(Number);
      const wday = new Date(y, m - 1, d).getDay();

      const p = d <= 10 ? '1–10' : d <= 20 ? '11–20' : '21–31';
      periods[p] += b.total;

      weekCount[wday]++;

      timeCount[b.time] = (timeCount[b.time] || 0) + 1;

      const mk = MONTHS[m - 1];
      monthRev[mk] = (monthRev[mk] || 0) + b.total;

      b.services.forEach(s => {
        if (!svcMap[s.name]) svcMap[s.name] = { count: 0, revenue: 0, emoji: s.emoji || '✂️' };
        svcMap[s.name].count++;
        svcMap[s.name].revenue += s.price;
      });

      const ck = b.clientName + '_' + (b.clientPhone || '');
      if (!clientMap[ck]) clientMap[ck] = { name: b.clientName, phone: b.clientPhone || '', visits: 0, revenue: 0 };
      clientMap[ck].visits++;
      clientMap[ck].revenue += b.total;
    });

    // ---- Helpers ----
    const pickBestWorst = obj => {
      const entries = Object.entries(obj).filter(([, v]) => v > 0);
      if (!entries.length) return { best: null, worst: null };
      entries.sort((a, b) => b[1] - a[1]);
      return { best: entries[0], worst: entries[entries.length - 1] };
    };

    const renderBars = (data, fmt) => {
      const vals   = Object.values(data);
      const nonZero = vals.filter(v => v > 0);
      if (!nonZero.length) return `<p class="text-sm" style="color:var(--gray-40);padding:.75rem 0;text-align:center">Sem dados no período.</p>`;
      const maxV = Math.max(...nonZero);
      const minV = Math.min(...nonZero);
      return Object.entries(data).map(([label, val]) => {
        const pct  = maxV > 0 ? (val / maxV) * 100 : 0;
        const cls  = val === maxV ? 'fill-best' : (val === minV && val !== maxV) ? 'fill-worst' : '';
        return `
          <div class="anl-bar-row">
            <div class="anl-bar-label">${label}</div>
            <div class="anl-bar-track"><div class="anl-bar-fill ${cls}" style="width:${pct.toFixed(1)}%"></div></div>
            <div class="anl-bar-value">${fmt(val)}</div>
          </div>`;
      }).join('');
    };

    const renderHL = (best, worst, fmtV) => `
      <div class="anl-highlights">
        <div class="anl-hl best">
          <div class="anl-hl-label">🏆 Melhor</div>
          <div class="anl-hl-val">${best ? best[0] : '—'}</div>
          ${best ? `<div class="anl-hl-sub">${fmtV(best[1])}</div>` : ''}
        </div>
        <div class="anl-hl worst">
          <div class="anl-hl-label">📉 Menor</div>
          <div class="anl-hl-val">${worst ? worst[0] : '—'}</div>
          ${worst ? `<div class="anl-hl-sub">${fmtV(worst[1])}</div>` : ''}
        </div>
      </div>`;

    // ---- Dados por seção ----
    const { best: bPeriod,  worst: wPeriod  } = pickBestWorst(periods);
    const weekData = {};
    ['Seg','Ter','Qua','Qui','Sex','Sáb'].forEach((n, i) => { weekData[n] = weekCount[i + 1]; });
    const { best: bDay,    worst: wDay    } = pickBestWorst(weekData);

    const sortedTimes = Object.fromEntries(Object.entries(timeCount).sort((a, b) => a[0].localeCompare(b[0])));
    const { best: bTime,   worst: wTime   } = pickBestWorst(sortedTimes);

    const monthData = Object.fromEntries(MONTHS.filter(m => monthRev[m] !== undefined).map(m => [m, monthRev[m]]));
    const { best: bMonth,  worst: wMonth  } = pickBestWorst(monthData);

    const sortedSvcs    = Object.entries(svcMap).sort((a, b) => b[1].count - a[1].count);
    const totalSvcCount = sortedSvcs.reduce((a, [, v]) => a + v.count, 0);

    const sortedClients   = Object.values(clientMap).sort((a, b) => b.revenue - a.revenue);
    const totalClientRev  = sortedClients.reduce((a, c) => a + c.revenue, 0);

    const totalRev  = bookings.reduce((a, b) => a + b.total, 0);
    const avgTicket = bookings.length ? totalRev / bookings.length : 0;

    const fmtCur = v => Utils.formatCurrency(v);
    const fmtCnt = v => `${v} agend.`;

    // ---- Render ----
    container.innerHTML = `
      <div class="anl-filter">
        <label class="anl-filter-label" for="anl-year-sel">📅 Analisando:</label>
        <select id="anl-year-sel" class="form-input" style="width:auto;min-width:110px;padding:.35rem .75rem"
          onchange="Owner._setAnalyticsYear(this.value)">
          ${years.map(y => `<option value="${y}" ${y == selectedYear ? 'selected' : ''}>
            ${y}${dataYears.has(String(y)) ? '' : ' (sem dados)'}
          </option>`).join('')}
        </select>
        ${!dataYears.has(String(selectedYear)) ? `<span style="font-size:.8rem;color:var(--gray-40);font-style:italic">Nenhum agendamento registrado em ${selectedYear}.</span>` : ''}
      </div>

      ${!bookings.length ? `<div class="alert alert-info"><span class="alert-icon">ℹ</span>Nenhum agendamento em ${selectedYear}.</div>` : `

      <div class="dash-stats" style="margin-bottom:1.25rem">
        <div class="stat-card"><div class="stat-value">${bookings.length}</div><div class="stat-label">Agendamentos</div></div>
        <div class="stat-card green"><div class="stat-value">${Utils.formatCurrency(totalRev)}</div><div class="stat-label">Receita Total</div></div>
        <div class="stat-card yellow"><div class="stat-value">${Utils.formatCurrency(avgTicket)}</div><div class="stat-label">Ticket Médio</div></div>
      </div>

      <div class="anl-grid-2">
        <div class="anl-section">
          <div class="anl-title">📅 Período do Mês — Faturamento</div>
          ${renderHL(bPeriod, wPeriod, fmtCur)}
          ${renderBars(periods, fmtCur)}
        </div>
        <div class="anl-section">
          <div class="anl-title">📆 Dia da Semana — Movimento</div>
          ${renderHL(bDay, wDay, fmtCnt)}
          ${renderBars(weekData, v => String(v))}
        </div>
      </div>

      <div class="anl-grid-2">
        <div class="anl-section">
          <div class="anl-title">🕐 Horários de Pico — Movimento</div>
          ${renderHL(bTime, wTime, fmtCnt)}
          <div style="max-height:270px;overflow-y:auto;padding-right:.2rem">
            ${renderBars(sortedTimes, v => String(v))}
          </div>
        </div>
        <div class="anl-section">
          <div class="anl-title">📊 Comparativo Mensal — Receita</div>
          ${renderHL(bMonth, wMonth, fmtCur)}
          ${renderBars(monthData, fmtCur)}
        </div>
      </div>

      <div class="anl-section">
        <div class="anl-title">✂️ Ranking de Serviços Mais Utilizados</div>
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse">
            <thead>
              <tr style="border-bottom:2px solid var(--gray-10)">
                <th class="anl-th" style="width:36px;text-align:center">#</th>
                <th class="anl-th" style="text-align:left">Serviço</th>
                <th class="anl-th">Qtd.</th>
                <th class="anl-th">Receita</th>
                <th class="anl-th">Participação</th>
              </tr>
            </thead>
            <tbody>
              ${sortedSvcs.map(([name, data], i) => {
                const medals = ['🥇','🥈','🥉'];
                const medal  = i < 3 ? medals[i] : i + 1;
                const share  = totalSvcCount ? (data.count / totalSvcCount) * 100 : 0;
                return `
                  <tr class="anl-svc-row">
                    <td style="text-align:center;padding:.6rem .5rem;font-size:.9rem">${medal}</td>
                    <td style="padding:.6rem .5rem;font-weight:600">${data.emoji} ${name}</td>
                    <td style="padding:.6rem .5rem;text-align:right;font-weight:700;color:var(--blue-700)">${data.count}</td>
                    <td style="padding:.6rem .5rem;text-align:right;font-weight:700;color:var(--green-500)">${Utils.formatCurrency(data.revenue)}</td>
                    <td style="padding:.6rem .5rem">
                      <div style="display:flex;align-items:center;gap:.5rem;justify-content:flex-end">
                        <div style="width:60px;height:6px;background:var(--gray-10);border-radius:99px;overflow:hidden">
                          <div style="height:100%;width:${share.toFixed(0)}%;background:var(--blue-500);border-radius:99px"></div>
                        </div>
                        <span style="font-size:.75rem;color:var(--gray-60);min-width:28px;text-align:right">${share.toFixed(0)}%</span>
                      </div>
                    </td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="anl-section" style="margin-top:1.25rem">
        <div class="anl-title">👥 Ranking de Clientes — Por Valor Gasto</div>
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse">
            <thead>
              <tr style="border-bottom:2px solid var(--gray-10)">
                <th class="anl-th" style="width:36px;text-align:center">#</th>
                <th class="anl-th" style="text-align:left">Cliente</th>
                <th class="anl-th">Visitas</th>
                <th class="anl-th">Total Gasto</th>
                <th class="anl-th">Participação</th>
              </tr>
            </thead>
            <tbody>
              ${sortedClients.map((c, i) => {
                const medals = ['🥇','🥈','🥉'];
                const medal  = i < 3 ? medals[i] : i + 1;
                const share  = totalClientRev ? (c.revenue / totalClientRev) * 100 : 0;
                return `
                  <tr class="anl-svc-row">
                    <td style="text-align:center;padding:.6rem .5rem;font-size:.9rem">${medal}</td>
                    <td style="padding:.6rem .5rem">
                      <div style="font-weight:600">${c.name}</div>
                      <div style="font-size:.75rem;color:var(--gray-60)">${Utils.formatPhone(c.phone)}</div>
                    </td>
                    <td style="padding:.6rem .5rem;text-align:right;font-weight:700;color:var(--blue-700)">${c.visits}</td>
                    <td style="padding:.6rem .5rem;text-align:right;font-weight:700;color:var(--green-500)">${Utils.formatCurrency(c.revenue)}</td>
                    <td style="padding:.6rem .5rem">
                      <div style="display:flex;align-items:center;gap:.5rem;justify-content:flex-end">
                        <div style="width:60px;height:6px;background:var(--gray-10);border-radius:99px;overflow:hidden">
                          <div style="height:100%;width:${share.toFixed(0)}%;background:var(--blue-500);border-radius:99px"></div>
                        </div>
                        <span style="font-size:.75rem;color:var(--gray-60);min-width:28px;text-align:right">${share.toFixed(0)}%</span>
                      </div>
                    </td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
      `}
    `;
  },

  _setAnalyticsYear(y) {
    this._analyticsYear = +y;
    this.renderAnalytics();
  },

  // --- Config ---
  renderConfig() {
    const cfg = Storage.getOwnerConfig();
    document.getElementById('cfg-name').value           = cfg.name    || '';
    document.getElementById('cfg-type').value           = cfg.type    || 'barbearia';
    document.getElementById('cfg-phone').value          = cfg.phone   || '';
    document.getElementById('cfg-address').value        = cfg.address || '';
    document.getElementById('cfg-gcal-email').value     = cfg.gcalEmail  || '';
    document.getElementById('cfg-gcal-enabled').checked = cfg.gcalEnabled || false;

    // Link do cliente
    const base = window.location.href.replace('owner.html', 'index.html').split('?')[0];
    const link = `${base}?id=${Storage._estabId}`;
    const linkEl = document.getElementById('cfg-client-link');
    if (linkEl) linkEl.value = link;

    const logo = Storage.getLogo();
    document.getElementById('cfg-logo-preview').src           = logo || '';
    document.getElementById('cfg-logo-preview').style.display    = logo ? 'block' : 'none';
    document.getElementById('cfg-logo-placeholder').style.display = logo ? 'none'  : 'flex';
  },

  uploadLogo(input) {
    const file = input.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      App.showToast('Selecione um arquivo de imagem.', 'error'); return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const MAX = 300;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
          else       { w = Math.round(w * MAX / h); h = MAX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
        Storage.saveLogo(dataUrl);
        document.getElementById('cfg-logo-preview').src           = dataUrl;
        document.getElementById('cfg-logo-preview').style.display     = 'block';
        document.getElementById('cfg-logo-placeholder').style.display  = 'none';
        App.showToast('Logo salva com sucesso!', 'success');
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
    input.value = '';
  },

  async resetData() {
    if (!confirm('Tem certeza? Todos os agendamentos e clientes serão apagados permanentemente.')) return;
    try {
      await Storage.clearAllData();
      App.state = { client: null, services: [], date: null, time: null, booking: null };
      this.renderAll();
      App.showToast('Dados zerados com sucesso!', 'success');
    } catch (e) {
      console.error(e);
      App.showToast('Erro ao zerar dados. Tente novamente.', 'error');
    }
  },

  removeLogo() {
    Storage.removeLogo();
    document.getElementById('cfg-logo-preview').src           = '';
    document.getElementById('cfg-logo-preview').style.display     = 'none';
    document.getElementById('cfg-logo-placeholder').style.display  = 'flex';
    App.showToast('Logo removida.', 'success');
  },

  saveConfig() {
    const cfg = {
      name:        document.getElementById('cfg-name').value.trim(),
      type:        document.getElementById('cfg-type')?.value || 'barbearia',
      phone:       document.getElementById('cfg-phone').value,
      address:     document.getElementById('cfg-address').value,
      gcalEmail:   document.getElementById('cfg-gcal-email').value,
      gcalEnabled: document.getElementById('cfg-gcal-enabled').checked
    };
    Storage.saveOwnerConfig(cfg);
    // Atualiza nome no header
    document.getElementById('owner-nav-area').innerHTML = `
      <div style="color:rgba(255,255,255,.7);font-size:.82rem">${cfg.name || 'Gestor'} — conectado</div>
    `;
    App.showToast('Configurações salvas!', 'success');
  },

  // --- Export ---
  exportCSV() {
    const bookings = Storage.getBookings().filter(b => b.status !== 'cancelled');
    if (!bookings.length) { App.showToast('Nenhum dado para exportar.', 'error'); return; }
    const rows = [
      ['ID','Data','Horário','Cliente','WhatsApp','Serviços','Total','Status'],
      ...bookings.map(b => [
        b.id, b.date, b.time, b.clientName,
        Utils.formatPhone(b.clientPhone||''),
        b.services.map(s=>s.name).join('; '),
        b.total.toFixed(2), b.status
      ])
    ];
    const csv  = rows.map(r => r.map(c=>`"${c}"`).join(',')).join('\n');
    const blob = new Blob(['﻿'+csv], { type:'text/csv;charset=utf-8' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `agendamentos-${Utils.today()}.csv`;
    a.click();
    App.showToast('Exportado com sucesso!', 'success');
  },

  exportAllToGCal() {
    const bookings = Storage.getBookings()
      .filter(b => b.status !== 'cancelled' && b.date >= Utils.today());
    if (!bookings.length) { App.showToast('Nenhum agendamento futuro.', 'error'); return; }

    const ics = [
      'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//AgendaApp//PT',
      ...bookings.flatMap(b => {
        const [y,m,d]   = b.date.split('-');
        const [hh,mm]   = b.time.split(':');
        const totalMin  = b.services.reduce((a,s)=>a+s.duration,0);
        const startDt   = new Date(+y,+m-1,+d,+hh,+mm);
        const endDt     = new Date(startDt.getTime()+totalMin*60000);
        const fmt = dt => dt.toISOString().replace(/[-:]/g,'').split('.')[0]+'Z';
        return [
          'BEGIN:VEVENT',
          `UID:${b.id}@agendaapp`,
          `DTSTAMP:${fmt(new Date())}`,
          `DTSTART:${fmt(startDt)}`,
          `DTEND:${fmt(endDt)}`,
          `SUMMARY:${b.clientName} — ${b.services.map(s=>s.name).join(', ')}`,
          `DESCRIPTION:Total: R$ ${b.total.toFixed(2)}`,
          'END:VEVENT'
        ];
      }),
      'END:VCALENDAR'
    ].join('\r\n');

    const blob = new Blob([ics], { type:'text/calendar' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `agenda-${Utils.today()}.ics`;
    a.click();
    App.showToast(`${bookings.length} agendamentos exportados!`, 'success');
  },

  // --- Busca ---
  searchBookings() {
    const q = document.getElementById('search-input')?.value?.toLowerCase() || '';
    const bookings = Storage.getBookings().filter(b =>
      b.status !== 'cancelled' &&
      (b.clientName.toLowerCase().includes(q) || b.date.includes(q) || b.id.toLowerCase().includes(q))
    );
    const c = document.getElementById('search-results');
    if (!c) return;
    if (!bookings.length) {
      c.innerHTML = '<div class="alert alert-info"><span class="alert-icon">ℹ</span>Nenhum resultado.</div>';
      return;
    }
    c.innerHTML = bookings.map(b => `
      <div class="agenda-slot" style="border:1px solid var(--gray-20);border-radius:8px;margin-bottom:.5rem">
        <div class="agenda-time">${b.time}<br><span style="font-size:.7rem;color:var(--gray-60)">${Utils.formatDate(b.date)}</span></div>
        <div class="agenda-client">
          <div class="agenda-client-name">${b.clientName} <span style="font-size:.72rem;font-weight:700;color:var(--blue-400)">${b.clientCode || Utils.clientCode(b.clientPhone)}</span></div>
          <div class="agenda-client-service">${b.services.map(s=>s.name).join(', ')}</div>
        </div>
        <div style="display:flex;align-items:center;gap:.4rem;flex-shrink:0">
          <span class="fw-bold" style="color:var(--blue-700)">${Utils.formatCurrency(b.total)}</span>
          <a href="${Utils.googleCalendarURL(b)}" target="_blank" class="btn btn-sm btn-outline-gray">📅</a>
        </div>
      </div>
    `).join('');
  },

  // --- Render all ---
  renderAll() {
    this.renderStats();
    if (this.state.tab === 'agenda')    this.renderAgenda();
    if (this.state.tab === 'calendar')  this.renderOwnerCalendar();
    if (this.state.tab === 'clients')   this.renderClients();
    if (this.state.tab === 'analytics') this.renderAnalytics();
    if (this.state.tab === 'services')  this.renderServiceManager();
  },

  init() {
    this.state.selectedDate = Utils.today();
    this._ownerCalDate = new Date();

    // Atualiza título do painel com o nome do estabelecimento
    const cfg = Storage.getOwnerConfig();
    const dashTitle = document.getElementById('dash-title');
    const dashSub   = document.getElementById('dash-sub');
    if (dashTitle) dashTitle.textContent = `✂️ ${cfg.name || 'Painel do Estabelecimento'}`;
    if (dashSub)   dashSub.textContent   = cfg.type === 'salao' ? 'Gerencie agendamentos, horários e serviços do salão' : 'Gerencie agendamentos, horários e serviços';

    // Atualiza painel em tempo real quando dados mudam no Firestore (cliente agendou em outro dispositivo)
    Storage.onChange(type => {
      this.renderStats();
      if (type === 'bookings' || type === 'clients') {
        if (this.state.tab === 'agenda')    this.renderAgenda();
        if (this.state.tab === 'calendar')  this.renderOwnerCalendar();
        if (this.state.tab === 'clients')   this.renderClients();
        if (this.state.tab === 'analytics') this.renderAnalytics();
      }
      if (type === 'config') {
        const c = Storage.getOwnerConfig();
        if (dashTitle) dashTitle.textContent = `✂️ ${c.name || 'Painel do Estabelecimento'}`;
        if (this.state.tab === 'config') this.renderConfig();
      }
      if (type === 'logo'     && this.state.tab === 'config')   this.renderConfig();
      if (type === 'services' && this.state.tab === 'services') this.renderServiceManager();
    });

    this.renderAll();
    this.setTab('agenda');
  }
};

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('owner-pass')?.addEventListener('keypress', e => {
    if (e.key === 'Enter') Owner.login();
  });
  document.getElementById('reg-pass2')?.addEventListener('keypress', e => {
    if (e.key === 'Enter') Owner.register();
  });
});
