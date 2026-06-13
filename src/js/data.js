/* =========================================
   DATA — Serviços, horários e configurações
   ========================================= */

const DATA = {
  name: "Agendor",
  color: "#1351B4",
  colorLight: "#EDF5FF",
  emoji: "✂️",

  // Serviços padrão — usados quando nenhum serviço foi cadastrado
  _defaultServices: [
    { id: "b1",  name: "Corte Masculino",    emoji: "✂️", price: 35, duration: 30 },
    { id: "b2",  name: "Barba Completa",     emoji: "🪒", price: 25, duration: 20 },
    { id: "b3",  name: "Corte + Barba",      emoji: "💈", price: 55, duration: 45 },
    { id: "b4",  name: "Pigmentação",        emoji: "🎨", price: 40, duration: 40 },
    { id: "b5",  name: "Hidratação Capilar", emoji: "💧", price: 30, duration: 30 },
    { id: "b6",  name: "Sobrancelha",        emoji: "👁️", price: 15, duration: 15 },
    { id: "b7",  name: "Relaxamento",        emoji: "🌀", price: 60, duration: 60 },
    { id: "b8",  name: "Platinado / Louro",  emoji: "🌟", price: 80, duration: 90 },
    { id: "b9",  name: "Hot Towel Shave",    emoji: "🔥", price: 45, duration: 35 },
    { id: "b10", name: "Limpeza de Pele",    emoji: "🧼", price: 50, duration: 45 },
  ],

  // Retorna lista ativa de serviços (do cache Firestore ou padrão)
  getServices() {
    if (Storage._services !== null) return [...Storage._services];
    return [...this._defaultServices];
  },

  // Horários de funcionamento — lido do cache Firestore em tempo real
  get workHours() { return Storage.getWorkHours(); },

  // Cadeiras / profissionais simultâneos
  capacity: 1,

  // Gera slots de horário para um dia
  generateSlots(date) {
    const slots = [];
    const { start, end, interval } = DATA.workHours;
    for (let h = start; h < end; h++) {
      for (let m = 0; m < 60; m += interval) {
        const timeStr = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
        const key = `${date}_barber_${timeStr}`;
        const bookings = Storage.getBookingsBySlot(key);
        slots.push({
          time: timeStr,
          key,
          count: bookings.length,
          available: bookings.length < DATA.capacity,
          bookings
        });
      }
    }
    return slots;
  }
};

/* =========================================
   STORAGE — Persistência multi-tenant via Firebase Firestore
   Cada estabelecimento tem seus dados isolados em:
   establishments/{uid}/bookings, clients, services, settings/...
   ========================================= */
const Storage = {
  // Cache em memória do estabelecimento ativo
  _bookings:        [],
  _clients:         [],
  _services:        null,
  _config:          null,
  _hours:           null,
  _logo:            '',
  _ready:           false,
  _db:              null,
  _auth:            null,
  _estabId:         null,
  _estabData:       null,
  _unsubscribers:   [],
  _changeCallbacks: [],

  // Inicializa Firebase. Se estabId fornecido, já carrega os dados daquele estabelecimento.
  async init(estabId) {
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    this._db   = firebase.firestore();
    this._auth = firebase.auth();
    if (estabId) {
      this._estabId = estabId;
      await this._loadAll();
      this._ready = true;
      this._setupListeners();
    }
  },

  // Troca o estabelecimento ativo (chamado após login do gestor)
  async _setEstab(uid) {
    this._unsubscribers.forEach(u => u());
    this._unsubscribers = [];
    this._ready    = false;
    this._estabId  = uid;
    this._bookings = [];
    this._clients  = [];
    this._services = null;
    this._config   = null;
    this._hours    = null;
    this._logo      = '';
    this._estabData = null;
    await this._loadAll();
    this._ready = true;
    this._setupListeners();
  },

  // Helpers de caminho — garantem isolamento por estabelecimento
  _col(name) { return this._db.collection(`establishments/${this._estabId}/${name}`); },
  _doc(path) { return this._db.doc(`establishments/${this._estabId}/${path}`); },

  async _loadAll() {
    const [bSnap, cSnap, sSnap, cfgDoc, hrsDoc, logoDoc, rootDoc] = await Promise.all([
      this._col('bookings').get(),
      this._col('clients').get(),
      this._col('services').get(),
      this._doc('settings/config').get(),
      this._doc('settings/hours').get(),
      this._doc('settings/logo').get(),
      this._db.doc(`establishments/${this._estabId}`).get(),
    ]);
    this._bookings  = bSnap.docs.map(d => ({ ...d.data(), id: d.id }));
    this._clients   = cSnap.docs.map(d => ({ ...d.data(), id: d.id }));
    this._services  = sSnap.empty ? null : sSnap.docs.map(d => ({ ...d.data(), id: d.id }));
    this._config    = cfgDoc.exists ? cfgDoc.data() : null;
    this._hours     = hrsDoc.exists ? hrsDoc.data() : null;
    this._logo      = logoDoc.exists ? (logoDoc.data().dataUrl || '') : '';
    this._estabData = rootDoc.exists ? rootDoc.data() : {};
  },

  _setupListeners() {
    const add = (query, fn) => { this._unsubscribers.push(query.onSnapshot(fn)); };
    add(this._col('bookings'), snap => {
      this._bookings = snap.docs.map(d => ({ ...d.data(), id: d.id }));
      this._notify('bookings');
    });
    add(this._col('clients'), snap => {
      this._clients = snap.docs.map(d => ({ ...d.data(), id: d.id }));
      this._notify('clients');
    });
    add(this._col('services'), snap => {
      this._services = snap.empty ? null : snap.docs.map(d => ({ ...d.data(), id: d.id }));
      this._notify('services');
    });
    add(this._doc('settings/config'), doc => {
      this._config = doc.exists ? doc.data() : null;
      this._notify('config');
    });
    add(this._doc('settings/hours'), doc => {
      this._hours = doc.exists ? doc.data() : null;
      this._notify('hours');
    });
    add(this._doc('settings/logo'), doc => {
      this._logo = doc.exists ? (doc.data().dataUrl || '') : '';
      this._notify('logo');
    });
  },

  onChange(cb) { this._changeCallbacks.push(cb); },
  _notify(type) {
    if (!this._ready) return;
    this._changeCallbacks.forEach(cb => cb(type));
  },

  // Cria/atualiza o documento raiz do estabelecimento (registro inicial)
  async createEstablishment(uid, data) {
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 7);
    await this._db.doc(`establishments/${uid}`).set({
      ...data,
      status:     'trial',
      paidUntil:  trialEnd.toISOString().split('T')[0],
      monthlyFee: 44.99,
      createdAt:  new Date().toISOString()
    }, { merge: true });
  },

  // --- Clients ---
  getClients() { return [...this._clients]; },
  saveClient(client) {
    const id = client.id || this._genId();
    const newClient = { ...client, id, createdAt: new Date().toISOString() };
    if (!this._clients.find(c => c.id === id)) this._clients.push(newClient);
    this._col('clients').doc(id).set(newClient);
    return newClient;
  },

  // --- Bookings ---
  getBookings() { return [...this._bookings]; },
  saveBooking(booking) {
    const id = this._genId();
    const newBooking = { ...booking, id, createdAt: new Date().toISOString() };
    this._bookings.push(newBooking);
    this._col('bookings').doc(id).set(newBooking);
    return newBooking;
  },
  cancelBooking(id) {
    this._bookings = this._bookings.map(b => b.id === id ? { ...b, status: 'cancelled' } : b);
    this._col('bookings').doc(id).update({ status: 'cancelled' });
  },
  getBookingsBySlot(slotKey) {
    return this._bookings.filter(b => b.slotKey === slotKey && b.status !== 'cancelled');
  },
  getBookingsByDate(date, type) {
    return this._bookings.filter(b => b.date === date && b.type === type && b.status !== 'cancelled');
  },
  getBookingsByClient(cpf) {
    return this._bookings.filter(b => b.clientCPF === (cpf || '').replace(/\D/g, ''));
  },
  getAllBookingsByType(type) {
    return this._bookings.filter(b => b.type === type && b.status !== 'cancelled');
  },

  // --- Owner config ---
  getOwnerConfig() {
    return this._config || { name: 'Meu Estabelecimento', phone: '', address: '', type: 'barbearia', gcalEnabled: false, gcalEmail: '' };
  },
  saveOwnerConfig(config) {
    this._config = config;
    this._doc('settings/config').set(config);
  },

  // --- Work hours ---
  getWorkHours() {
    return this._hours || { start: 8, end: 19, interval: 30 };
  },
  saveWorkHours(hours) {
    this._hours = hours;
    this._doc('settings/hours').set(hours);
  },

  // --- Logo ---
  getLogo()         { return this._logo; },
  saveLogo(dataUrl) {
    this._logo = dataUrl;
    this._doc('settings/logo').set({ dataUrl });
  },
  removeLogo() {
    this._logo = '';
    this._doc('settings/logo').delete();
  },

  // --- Services ---
  getServices() { return DATA.getServices(); },
  saveServices(list) {
    this._services = list;
    const col = this._col('services');
    col.get().then(snap => {
      const batch = this._db.batch();
      snap.docs.forEach(d => batch.delete(d.ref));
      list.forEach(svc => batch.set(col.doc(svc.id), svc));
      return batch.commit();
    });
  },

  // --- Reset — apaga agendamentos e clientes do estabelecimento ativo ---
  async clearAllData() {
    const [bSnap, cSnap] = await Promise.all([
      this._col('bookings').get(),
      this._col('clients').get()
    ]);
    const ops = [];
    if (!bSnap.empty) {
      const batch = this._db.batch();
      bSnap.docs.forEach(d => batch.delete(d.ref));
      ops.push(batch.commit());
    }
    if (!cSnap.empty) {
      const batch = this._db.batch();
      cSnap.docs.forEach(d => batch.delete(d.ref));
      ops.push(batch.commit());
    }
    await Promise.all(ops);
    this._bookings = [];
    this._clients  = [];
  },

  getEstabData() { return this._estabData || {}; },

  async getAllEstablishments() {
    const snap = await this._db.collection('establishments').get();
    return snap.docs.map(d => ({ ...d.data(), uid: d.id }));
  },

  async updateEstabBilling(uid, data) {
    await this._db.doc(`establishments/${uid}`).set(data, { merge: true });
  },

  _genId() {
    return Math.random().toString(36).substr(2, 9).toUpperCase();
  }
};

/* =========================================
   UTILS — Funções auxiliares
   ========================================= */
const Utils = {
  formatDate(dateStr) {
    const [y,m,d] = dateStr.split('-');
    const months = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
    return `${d} de ${months[+m-1]} de ${y}`;
  },
  formatDateFull(dateStr) {
    const [y,m,d] = dateStr.split('-');
    const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    const days   = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira',
                    'Quinta-feira','Sexta-feira','Sábado'];
    const dt = new Date(+y, +m-1, +d);
    return `${days[dt.getDay()]}, ${d} de ${months[+m-1]} de ${y}`;
  },
  formatCPF(v) {
    return v.replace(/\D/g,'').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4');
  },
  formatPhone(v) {
    v = v.replace(/\D/g,'');
    if (v.length <= 10) return v.replace(/(\d{2})(\d{4})(\d{4})/,'($1) $2-$3');
    return v.replace(/(\d{2})(\d{5})(\d{4})/,'($1) $2-$3');
  },
  formatCEP(v) {
    return v.replace(/\D/g,'').replace(/(\d{5})(\d{3})/,'$1-$2');
  },
  formatCurrency(v) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  },
  today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },
  clientCode(phone) {
    const digits = (phone || '').replace(/\D/g, '');
    if (!digits) return '#?????';
    let h = 0;
    for (let i = 0; i < digits.length; i++) {
      h = (Math.imul(31, h) + digits.charCodeAt(i)) | 0;
    }
    return '#' + Math.abs(h).toString(36).toUpperCase().padStart(5, '0').slice(-5);
  },
  durationText(min) {
    if (min < 60) return `${min} min`;
    const h = Math.floor(min/60), m = min%60;
    return m ? `${h}h${String(m).padStart(2,'0')}` : `${h}h`;
  },
  estabName() {
    try { return Storage.getOwnerConfig().name || 'Estabelecimento'; } catch { return 'Estabelecimento'; }
  },

  // Gera URL Google Calendar para um agendamento
  googleCalendarURL(booking) {
    const services = booking.services.map(s => s.name).join(', ');
    const [y,m,d] = booking.date.split('-');
    const [hh,mm] = booking.time.split(':');
    const totalMin = booking.services.reduce((a,s)=>a+s.duration,0);
    const startDt = new Date(+y,+m-1,+d,+hh,+mm);
    const endDt   = new Date(startDt.getTime() + totalMin*60000);
    const fmt = dt => dt.toISOString().replace(/[-:]/g,'').split('.')[0]+'Z';
    const params = new URLSearchParams({
      action:   'TEMPLATE',
      text:     `${Utils.estabName()} — ${booking.clientName}`,
      dates:    `${fmt(startDt)}/${fmt(endDt)}`,
      details:  `Cliente: ${booking.clientName}\nServiços: ${services}\nTotal: R$ ${booking.total.toFixed(2)}`,
      location: ''
    });
    return `https://calendar.google.com/calendar/render?${params}`;
  },

  // Gera ICS para download
  generateICS(booking) {
    const services = booking.services.map(s => s.name).join(', ');
    const [y,m,d] = booking.date.split('-');
    const [hh,mm] = booking.time.split(':');
    const totalMin = booking.services.reduce((a,s)=>a+s.duration,0);
    const startDt = new Date(+y,+m-1,+d,+hh,+mm);
    const endDt   = new Date(startDt.getTime() + totalMin*60000);
    const fmt = dt => dt.toISOString().replace(/[-:]/g,'').split('.')[0]+'Z';
    return [
      'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//AgendaApp//PT',
      'BEGIN:VEVENT',
      `UID:${booking.id}@agendaapp`,
      `DTSTAMP:${fmt(new Date())}`,
      `DTSTART:${fmt(startDt)}`,
      `DTEND:${fmt(endDt)}`,
      `SUMMARY:${Utils.estabName()} — ${booking.clientName}`,
      `DESCRIPTION:Serviços: ${services}\\nTotal: R$ ${booking.total.toFixed(2)}`,
      'END:VEVENT','END:VCALENDAR'
    ].join('\r\n');
  }
};
