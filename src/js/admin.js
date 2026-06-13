/* =========================================
   ADMIN — Painel de controle de mensalidades
   Acesso restrito: midia.alpha.ofc@gmail.com
   ========================================= */

const ADMIN_EMAIL = 'midia.alpha.ofc@gmail.com';
const GRACE_DAYS  = 3;
const MONTHLY_FEE = 44.99;

const Admin = {

  async login() {
    const email = document.getElementById('adm-email').value.trim();
    const pass  = document.getElementById('adm-pass').value;
    const errEl = document.getElementById('adm-error');
    const btn   = document.getElementById('adm-login-btn');
    if (!email || !pass) { this._err(errEl, 'Preencha e-mail e senha.'); return; }
    this._err(errEl, '');
    btn.disabled = true; btn.textContent = 'Entrando...';
    try {
      const cred = await Storage._auth.signInWithEmailAndPassword(email, pass);
      if (cred.user.email !== ADMIN_EMAIL) {
        await Storage._auth.signOut();
        this._err(errEl, 'Acesso negado. Apenas o administrador pode acessar este painel.');
        btn.disabled = false; btn.textContent = 'Entrar no Admin';
        return;
      }
      document.getElementById('adm-login-screen').classList.add('hidden');
      document.getElementById('adm-dashboard').classList.remove('hidden');
      document.getElementById('adm-nav-area').innerHTML =
        `<div style="color:rgba(255,255,255,.7);font-size:.82rem">Admin — conectado</div>`;
      await this.loadAndRender();
    } catch(e) {
      const msgs = {
        'auth/invalid-credential': 'E-mail ou senha incorretos.',
        'auth/user-not-found':     'E-mail não encontrado.',
        'auth/wrong-password':     'Senha incorreta.',
        'auth/too-many-requests':  'Muitas tentativas. Aguarde.',
      };
      this._err(errEl, msgs[e.code] || `Erro: ${e.code}`);
      btn.disabled = false; btn.textContent = 'Entrar no Admin';
    }
  },

  async logout() {
    await Storage._auth.signOut();
    document.getElementById('adm-login-screen').classList.remove('hidden');
    document.getElementById('adm-dashboard').classList.add('hidden');
    document.getElementById('adm-nav-area').innerHTML = '';
    document.getElementById('adm-email').value = '';
    document.getElementById('adm-pass').value  = '';
  },

  async loadAndRender() {
    const tbody = document.getElementById('adm-table-body');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--gray-40)">Carregando...</td></tr>';
    try {
      const estabs = await Storage.getAllEstablishments();
      this._render(estabs);
    } catch(e) {
      console.error(e);
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:2rem;color:#DC2626">Erro: ${e.message}</td></tr>`;
    }
  },

  _render(estabs) {
    // Ordena: suspensos/bloqueados primeiro, depois por vencimento
    estabs.sort((a, b) => {
      const pa = this._isBlocked(a) ? 0 : (a.status === 'trial' ? 2 : 1);
      const pb = this._isBlocked(b) ? 0 : (b.status === 'trial' ? 2 : 1);
      if (pa !== pb) return pa - pb;
      return (a.paidUntil || '').localeCompare(b.paidUntil || '');
    });

    // Stats
    const active    = estabs.filter(d => d.status === 'active' && !this._isBlocked(d)).length;
    const trial     = estabs.filter(d => d.status === 'trial').length;
    const blocked   = estabs.filter(d => this._isBlocked(d)).length;

    document.getElementById('adm-stat-total').textContent   = estabs.length;
    document.getElementById('adm-stat-active').textContent  = active;
    document.getElementById('adm-stat-trial').textContent   = trial;
    document.getElementById('adm-stat-overdue').textContent = blocked;
    document.getElementById('adm-stat-rev').textContent     =
      `R$ ${(active * MONTHLY_FEE).toFixed(2).replace('.', ',')}`;

    const tbody = document.getElementById('adm-table-body');
    if (!estabs.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--gray-40)">Nenhum estabelecimento cadastrado ainda.</td></tr>';
      return;
    }

    tbody.innerHTML = estabs.map(d => {
      const s    = this._statusBadge(d);
      const days = this._daysLabel(d);
      const due  = d.paidUntil || (d.status === 'trial' ? 'Trial 7d' : '—');
      return `
        <tr>
          <td style="font-weight:600">${d.name || '—'}</td>
          <td style="color:var(--gray-60);font-size:.82rem">${d.email || '—'}</td>
          <td><span class="badge" style="background:${s.bg};color:${s.color}">${s.label}</span></td>
          <td style="font-size:.82rem">${due}</td>
          <td style="font-size:.82rem;color:${days.color}">${days.text}</td>
          <td>
            <div style="display:flex;gap:.35rem;flex-wrap:wrap">
              <button onclick="Admin.renew('${d.uid}')"
                class="btn btn-sm btn-primary" title="Renovar +30 dias">+30 dias</button>
              ${d.status !== 'suspended'
                ? `<button onclick="Admin.suspend('${d.uid}')"
                     class="btn btn-sm btn-danger">Suspender</button>`
                : `<button onclick="Admin.activate('${d.uid}')"
                     style="background:#16A34A;color:#fff;border:none;border-radius:6px;
                            padding:.3rem .65rem;font-size:.78rem;cursor:pointer;font-family:inherit;font-weight:700">
                     Ativar</button>`
              }
            </div>
          </td>
        </tr>`;
    }).join('');
  },

  _isBlocked(d) {
    if (d.status === 'suspended') return true;
    if (d.status === 'active' && d.paidUntil) {
      const grace = new Date(new Date(d.paidUntil).getTime() + GRACE_DAYS * 86400000);
      return new Date() > grace;
    }
    return false;
  },

  _statusBadge(d) {
    if (d.status === 'suspended')
      return { label: 'Suspenso',   color: '#6B7280', bg: '#F3F4F6' };
    if (!d.paidUntil || d.status === 'trial')
      return { label: 'Trial',      color: '#2563EB', bg: '#EFF6FF' };
    const due   = new Date(d.paidUntil);
    const grace = new Date(due.getTime() + GRACE_DAYS * 86400000);
    if (new Date() > grace)
      return { label: 'Bloqueado',  color: '#DC2626', bg: '#FEF2F2' };
    const days = Math.ceil((due - new Date()) / 86400000);
    if (days <= 5)
      return { label: `Vence em ${days}d`, color: '#D97706', bg: '#FFFBEB' };
    return   { label: 'Ativo',     color: '#16A34A', bg: '#F0FDF4' };
  },

  _daysLabel(d) {
    if (d.status === 'suspended')
      return { text: 'Suspenso manualmente', color: '#6B7280' };

    if (!d.paidUntil || d.status === 'trial') {
      if (!d.createdAt) return { text: 'Trial', color: '#2563EB' };
      const trialEnd  = new Date(new Date(d.createdAt).getTime() + 7 * 86400000);
      const remaining = Math.ceil((trialEnd - new Date()) / 86400000);
      if (remaining > 0) return { text: `Trial: ${remaining}d restantes`, color: '#2563EB' };
      return { text: 'Trial expirado', color: '#D97706' };
    }

    const diff = Math.ceil((new Date(d.paidUntil) - new Date()) / 86400000);
    if (diff >= 0) return { text: `${diff} dia${diff !== 1 ? 's' : ''} restantes`, color: '#16A34A' };
    return { text: `${Math.abs(diff)} dia${Math.abs(diff) !== 1 ? 's' : ''} em atraso`, color: '#DC2626' };
  },

  async renew(uid) {
    const btn = event.target;
    btn.disabled = true; btn.textContent = '...';
    try {
      const estabs = await Storage.getAllEstablishments();
      const d = estabs.find(e => e.uid === uid);
      const base = d && d.paidUntil && new Date(d.paidUntil) > new Date()
        ? new Date(d.paidUntil) : new Date();
      base.setDate(base.getDate() + 30);
      await Storage.updateEstabBilling(uid, {
        status:    'active',
        paidUntil: base.toISOString().split('T')[0]
      });
      await this.loadAndRender();
    } catch(e) {
      alert('Erro ao renovar: ' + e.message);
      btn.disabled = false; btn.textContent = '+30 dias';
    }
  },

  async suspend(uid) {
    if (!confirm('Suspender acesso deste estabelecimento?')) return;
    try {
      await Storage.updateEstabBilling(uid, { status: 'suspended' });
      await this.loadAndRender();
    } catch(e) { alert('Erro: ' + e.message); }
  },

  async activate(uid) {
    try {
      const newDate = new Date();
      newDate.setDate(newDate.getDate() + 30);
      await Storage.updateEstabBilling(uid, {
        status:    'active',
        paidUntil: newDate.toISOString().split('T')[0]
      });
      await this.loadAndRender();
    } catch(e) { alert('Erro: ' + e.message); }
  },

  _err(el, msg) {
    el.textContent    = msg;
    el.style.display  = msg ? 'block' : 'none';
  }
};
