/* Departamento de Mídia - Assembleia de Deus Monte Moriah */
(() => {
  'use strict';

  const cfg = window.APP_CONFIG || {};
  if (!cfg.SUPABASE_URL || cfg.SUPABASE_URL.startsWith('COLE_AQUI')) {
    document.body.innerHTML = '<p style="padding:24px;font-family:sans-serif">Faltou configurar o <b>config.js</b> com os dados do Supabase. Veja o LEIAME.md.</p>';
    return;
  }
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  // ---------- utilidades ----------
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const FUNCOES = ['fotografia', 'projetor'];
  const NOME_FUNCAO = { fotografia: 'Fotografia', projetor: 'Projetor' };
  const pad = (n) => String(n).padStart(2, '0');
  const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const parseISO = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
  const fmtData = (iso) => { const d = parseISO(iso); return `${DIAS[d.getDay()]}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`; };
  const fmtDataHora = (ts) => new Date(ts).toLocaleDateString('pt-BR');
  const mesAtual = () => hojeISO().slice(0, 7);
  const limitesMes = (ym) => {
    const [y, m] = ym.split('-').map(Number);
    return [`${ym}-01`, `${ym}-${pad(new Date(y, m, 0).getDate())}`];
  };
  const ok = ({ data, error }) => { if (error) throw error; return data; };
  const formData = (f) => Object.fromEntries(new FormData(f).entries());

  let toastTimer;
  function toast(msg, erro = false) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'show' + (erro ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.className = ''), 3800);
  }
  function traduzErro(e) {
    const m = (e && e.message) || String(e);
    if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
    if (/Email not confirmed/i.test(m)) return 'Confirme seu e-mail pelo link que enviamos antes de entrar.';
    if (/User already registered/i.test(m)) return 'Esse e-mail já tem cadastro. Use "Entrar" ou "Esqueci minha senha".';
    if (/duplicate key/i.test(m)) return 'Isso já está cadastrado.';
    if (/rate limit/i.test(m)) return 'Muitas tentativas. Espere alguns minutos e tente de novo.';
    return m;
  }
  async function run(fn) {
    try { await fn(); } catch (e) { console.error(e); toast(traduzErro(e), true); }
  }
  function show(view) {
    for (const v of ['auth', 'reset', 'wait', 'app']) $('#view-' + v).hidden = v !== view;
  }

  // ---------- estado ----------
  let me = null;
  let recuperando = false;
  const state = { tab: 'inicio', profiles: {}, escalasMes: null, gerarMes: null, preview: null };
  const nome = (id) => state.profiles[id]?.nome || '(removido)';

  // ---------- notificações (push) ----------
  const VAPID = cfg.VAPID_PUBLIC_KEY || 'BEGolbFLfn_sytWazOyBYT1WvvXIIrcXv9HsyXXyZBrJgxtGVCGPsLK-PGNsZrx-HNirKJj5H7aA7GR83sMOY2A';
  const ehIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const instalado = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const pushSuportado = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const swPronto = () => Promise.race([navigator.serviceWorker.ready, new Promise((_, rej) => setTimeout(() => rej(new Error('sw')), 4000))]);
  const b64ToUint8 = (b64) => {
    const pad = '='.repeat((4 - (b64.length % 4)) % 4);
    const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
  };
  async function statusPush() {
    if (ehIOS && !instalado) return 'ios-instalar';
    if (!pushSuportado) return 'indisponivel';
    if (Notification.permission === 'denied') return 'bloqueado';
    const sub = await (await swPronto()).pushManager.getSubscription();
    return sub && Notification.permission === 'granted' ? 'ativo' : 'inativo';
  }
  async function salvarAparelho(sub) {
    const j = sub.toJSON();
    const { error } = await sb.from('push_subscriptions').upsert(
      { endpoint: j.endpoint, user_id: me.id, p256dh: j.keys.p256dh, auth_key: j.keys.auth },
      { onConflict: 'endpoint' }
    );
    if (error) {
      if (error.code === '42501') throw new Error('Este aparelho ainda está ligado a outra conta. Peça para a outra pessoa tocar em Sair neste aparelho e tente de novo.');
      throw error;
    }
  }
  async function ativarPush() {
    if (!pushSuportado) throw new Error('Este navegador não suporta notificações.');
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error('Você não permitiu as notificações. Toque no cadeado ao lado do endereço e permita.');
    const reg = await swPronto();
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(VAPID) });
    await salvarAparelho(sub);
  }
  async function sincronizarPush() {
    try {
      if (!pushSuportado || Notification.permission !== 'granted') return;
      const sub = await (await swPronto()).pushManager.getSubscription();
      if (sub) await salvarAparelho(sub);
    } catch (_) {}
  }
  async function removerPushDoAparelho() {
    try {
      if (!pushSuportado) return;
      const sub = await (await swPronto()).pushManager.getSubscription();
      if (sub) await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    } catch (_) {}
  }
  async function chamarPush(corpo) {
    const { data, error } = await sb.functions.invoke('enviar-push', { body: corpo });
    if (error) throw new Error('Não foi possível enviar. A função enviar-push está publicada no Supabase?');
    return data || {};
  }
  // ---------- poderes do líder: ações de conta (feitas no servidor) e histórico ----------
  async function chamarAdmin(corpo) {
    const { data, error } = await sb.functions.invoke('enviar-push', { body: corpo });
    if (error) {
      let msg = 'Não foi possível concluir. A função enviar-push foi atualizada no Supabase?';
      try { const j = await error.context.json(); if (j && j.erro) msg = j.erro; } catch (_) {}
      throw new Error(msg);
    }
    return data || {};
  }
  function registrar(acao, alvoId, detalhe) {
    try {
      sb.from('auditoria').insert({ ator_id: me.id, acao, alvo_id: alvoId || null, alvo_nome: alvoId ? nome(alvoId) : null, detalhe: detalhe || null })
        .then(({ error }) => { if (error) console.warn('histórico', error.message); });
    } catch (_) {}
  }
  function baixarCSV(arquivo, cab, linhas) {
    const linha = (arr) => arr.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';');
    const csv = '﻿' + [linha(cab), ...linhas.map(linha)].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const el = document.createElement('a');
    el.href = url; el.download = arquivo;
    document.body.appendChild(el); el.click(); el.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  function senhaAleatoria() {
    const letras = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
    const bytes = crypto.getRandomValues(new Uint8Array(9));
    return Array.from(bytes, (b) => letras[b % letras.length]).join('');
  }

  // ---------- selos de fidelidade ----------
  const SELOS = [
    { id: 'e1', ic: '🌱', nome: 'Primeiro passo', desc: 'Sua 1ª escala', tipo: 'total', meta: 1 },
    { id: 'e5', ic: '⭐', nome: 'Servo fiel', desc: '5 escalas', tipo: 'total', meta: 5 },
    { id: 'e10', ic: '🔥', nome: 'Coração ardente', desc: '10 escalas', tipo: 'total', meta: 10 },
    { id: 'e25', ic: '🏅', nome: 'Fiel no pouco', desc: '25 escalas', tipo: 'total', meta: 25 },
    { id: 'e50', ic: '🏆', nome: 'Pilar da equipe', desc: '50 escalas', tipo: 'total', meta: 50 },
    { id: 'e100', ic: '👑', nome: 'Veterano', desc: '100 escalas', tipo: 'total', meta: 100 },
    { id: 'm3', ic: '📆', nome: 'Constante', desc: 'Serviu 3 meses seguidos', tipo: 'meses', meta: 3 },
    { id: 'm6', ic: '🗓️', nome: 'Perseverante', desc: 'Serviu 6 meses seguidos', tipo: 'meses', meta: 6 },
    { id: 'm12', ic: '🌟', nome: 'Um ano de dedicação', desc: 'Serviu 12 meses seguidos', tipo: 'meses', meta: 12 },
    { id: 'c10', ic: '✅', nome: 'Presença firme', desc: '10 presenças confirmadas', tipo: 'conf', meta: 10 },
    { id: 't1', ic: '🤝', nome: 'Coração de servo', desc: 'Aceitou uma troca para ajudar um colega', tipo: 'troca', meta: 1 },
    { id: 'd2', ic: '🎛️', nome: 'Multiuso', desc: 'Serviu em Fotografia e em Projetor', tipo: 'duas', meta: 2 }
  ];
  async function calcularSelos(uid) {
    const hoje = hojeISO();
    const [escs, trocas] = await Promise.all([
      sb.from('escalas').select('funcao,status,eventos!inner(data)').eq('membro_id', uid).lte('eventos.data', hoje).then(ok),
      sb.from('trocas').select('id').eq('destino_id', uid).eq('status', 'aprovada').then(ok).catch(() => [])
    ]);
    const validas = escs.filter((s) => s.status !== 'recusado');
    const meses = [...new Set(validas.map((s) => s.eventos.data.slice(0, 7)))].sort();
    let melhor = 0; let atual = 0; let anterior = null;
    meses.forEach((m) => {
      const [y, mm] = m.split('-').map(Number);
      const n = y * 12 + mm;
      atual = anterior !== null && n === anterior + 1 ? atual + 1 : 1;
      anterior = n; if (atual > melhor) melhor = atual;
    });
    const valor = {
      total: validas.length,
      meses: melhor,
      conf: validas.filter((s) => s.status === 'confirmado').length,
      troca: trocas.length,
      duas: new Set(validas.map((s) => s.funcao)).size
    };
    const lista = SELOS.map((s) => ({ ...s, atual: Math.min(valor[s.tipo], s.meta), ganho: valor[s.tipo] >= s.meta }));
    const proximo = lista.filter((s) => !s.ganho).sort((x, y) => (y.atual / y.meta) - (x.atual / x.meta))[0] || null;
    return { lista, ganhos: lista.filter((s) => s.ganho).length, proximo, total: valor.total };
  }
  const htmlSelos = (r) => `
    <div class="card">
      <h3>🏅 Meus selos <span class="muted">(${r.ganhos} de ${r.lista.length})</span></h3>
      <p class="muted">Você serviu <b>${r.total}</b> ${r.total === 1 ? 'vez' : 'vezes'} até hoje. Cada selo é um agradecimento pela sua dedicação.</p>
      ${r.proximo ? `<p>Próximo selo: ${r.proximo.ic} <b>${esc(r.proximo.nome)}</b> · ${r.proximo.atual} de ${r.proximo.meta}</p>` : '<p>🎉 Você conquistou todos os selos!</p>'}
      <div class="selos">${r.lista.map((s) => `<div class="selo ${s.ganho ? '' : 'off'}"><span class="ic">${s.ic}</span><b>${esc(s.nome)}</b><span class="muted">${esc(s.desc)}</span></div>`).join('')}</div>
    </div>`;

  // ---------- avatar, foto e sininho ----------
  const avatar = (p, px = 40) => (p && p.foto
    ? `<img class="avatar" src="${esc(p.foto)}" alt="" width="${px}" height="${px}">`
    : `<span class="avatar ini" style="width:${px}px;height:${px}px;font-size:${Math.round(px * 0.42)}px">${esc(((p && p.nome) || '?').trim().charAt(0).toUpperCase())}</span>`);
  function atualizarTopo() {
    $('#who').textContent = `${me.nome}${me.role === 'admin' ? ' · Líder' : ''}`;
    $('#topo-avatar').innerHTML = avatar(me, 38);
  }
  function reduzirFoto(file, lado) {
    return new Promise((res, rej) => {
      const img = new Image();
      const u = URL.createObjectURL(file);
      img.onload = () => {
        const s = Math.min(img.width, img.height);
        const c = document.createElement('canvas');
        c.width = c.height = lado;
        c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, lado, lado);
        URL.revokeObjectURL(u);
        res(c.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => { URL.revokeObjectURL(u); rej(new Error('Não consegui ler essa imagem. Tente outra foto.')); };
      img.src = u;
    });
  }
  async function contarNaoLidas() {
    try {
      if (!me) return;
      const { count } = await sb.from('notificacoes').select('id', { count: 'exact', head: true }).eq('user_id', me.id).eq('lida', false);
      const n = count || 0;
      const el = $('#sino-n');
      el.textContent = n > 99 ? '99+' : String(n);
      el.hidden = !n;
    } catch (_) {}
  }
  let sinoTimer = null;
  function iniciarSino() {
    contarNaoLidas();
    clearInterval(sinoTimer);
    sinoTimer = setInterval(() => { if (me && document.visibilityState === 'visible') { contarNaoLidas(); registrarAcesso(false); } }, 60000);
  }

  // ---------- avisos ao líder e último acesso ----------
  function avisarLideres(corpo) {
    chamarPush({ tipo: 'evento', ...corpo }).catch((e) => console.warn('aviso ao líder falhou', e));
  }
  function avisarEscalaAlterada(ids, texto) {
    return chamarPush({ tipo: 'escala_alterada', ids, texto })
      .then((r) => toast(`Aviso enviado para ${r.enviados || 0} aparelho(s).`))
      .catch(() => toast('Não foi possível enviar o aviso.', true));
  }
  function tempoAtras(ts) {
    if (!ts) return 'sem registro';
    const min = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
    if (min < 2) return 'agora há pouco';
    if (min < 60) return `há ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `há ${h} h`;
    const d = Math.floor(h / 24);
    if (d < 60) return `há ${d} dia${d > 1 ? 's' : ''}`;
    return `há ${Math.floor(d / 30)} meses`;
  }
  let ultimoToque = 0;
  async function registrarAcesso(forcar) {
    try {
      if (!me) return;
      const agora = Date.now();
      if (!forcar && agora - ultimoToque < 5 * 60 * 1000) return;
      ultimoToque = agora;
      const { error } = await sb.from('acessos').upsert({ membro_id: me.id, ultimo_acesso: new Date(agora).toISOString() });
      if (error) { ultimoToque = 0; console.warn('não consegui registrar o acesso', error.message); }
    } catch (e) { ultimoToque = 0; console.warn('acesso', e); }
  }
  // Último acesso de cada pessoa (só o líder consegue ler). Junta o registro do app com o último login do Supabase.
  async function carregarAcessos() {
    const mapa = {};
    let r = await sb.rpc('ultimos_acessos');
    if (r.error) { console.warn('ultimos_acessos', r.error.message); r = await sb.from('acessos').select('membro_id,ultimo_acesso'); }
    (r.data || []).forEach((x) => { if (x.ultimo_acesso) mapa[x.membro_id] = x.ultimo_acesso; });
    return mapa;
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { registrarAcesso(false); contarNaoLidas(); } });

  function cardPush(st) {
    if (st === 'ativo') return '<div class="card row between"><span>🔔 Notificações ativas neste aparelho</span><button class="btn small" data-act="testePush">Enviar teste</button></div>';
    if (st === 'inativo') return '<div class="card"><b>🔔 Receba avisos e lembretes da escala</b><p class="muted">Ative para ser avisado(a) no celular quando for escalado(a) e quando o líder publicar um aviso.</p><button class="btn primary" data-act="ativarPush">Ativar notificações</button></div>';
    if (st === 'bloqueado') return '<div class="card warnbox">🔕 As notificações estão bloqueadas neste navegador. Toque no cadeado ao lado do endereço do site, abra <b>Notificações</b> e escolha <b>Permitir</b>. Depois recarregue a página.</div>';
    if (st === 'ios-instalar') return '<div class="card warnbox">📱 No iPhone, primeiro toque em <b>Compartilhar</b> (quadrado com seta) e depois em <b>Adicionar à Tela de Início</b>. Abra o app pelo ícone novo e ative as notificações aqui.</div>';
    return '<div class="card muted">Este navegador não suporta notificações.</div>';
  }

  async function carregarPerfis() {
    const lista = ok(await sb.from('profiles').select('*').order('nome'));
    state.profiles = Object.fromEntries(lista.map((p) => [p.id, p]));
  }

  // ---------- login / sessão ----------
  async function boot() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { me = null; show('auth'); return; }
    const { data: p, error } = await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
    if (error) { toast(traduzErro(error), true); show('auth'); return; }
    if (!p) {
      await sb.auth.signOut();
      toast('Esta conta foi removida pela liderança da mídia.', true);
      show('auth'); return;
    }
    me = p;
    registrarAcesso(true);
    if (p.status === 'bloqueado') {
      await sb.auth.signOut();
      toast('Seu acesso está bloqueado. Fale com o líder da mídia.', true);
      show('auth'); return;
    }
    if (p.status === 'pendente') { show('wait'); avisarLideres({ acao: 'novo_cadastro' }); return; }
    await carregarPerfis();
    atualizarTopo();
    montarMenu();
    iniciarSino();
    show('app');
    sincronizarPush();
    ir(state.tab in TELAS && podeVer(state.tab) ? state.tab : 'inicio');
  }

  sb.auth.onAuthStateChange((evento, session) => {
    if (evento === 'PASSWORD_RECOVERY') { recuperando = true; show('reset'); return; }
    if (evento === 'SIGNED_OUT') { me = null; if (!recuperando) show('auth'); return; }
    if ((evento === 'INITIAL_SESSION' || evento === 'SIGNED_IN') && !recuperando) {
      if (me && session && me.id === session.user.id) return;
      setTimeout(boot, 0); // evita travar dentro do callback do Supabase
    }
  });

  // ---------- formulários ----------
  const forms = {
    'f-login': async (f) => {
      const d = formData(f);
      const { error } = await sb.auth.signInWithPassword({ email: d.email.trim(), password: d.senha });
      if (error) throw error;
    },
    'f-signup': async (f) => {
      const d = formData(f);
      if (d.senha !== d.senha2) throw new Error('As senhas não são iguais.');
      const { data, error } = await sb.auth.signUp({
        email: d.email.trim(),
        password: d.senha,
        options: { data: { nome: d.nome.trim(), telefone: (d.telefone || '').trim() }, emailRedirectTo: location.origin }
      });
      if (error) throw error;
      if (!data.session) {
        toast('Pronto! Enviamos um e-mail de confirmação. Clique no link e depois entre.');
        f.reset(); authTab('login');
      }
    },
    'f-forgot': async (f) => {
      const d = formData(f);
      const { error } = await sb.auth.resetPasswordForEmail(d.email.trim(), { redirectTo: location.origin });
      if (error) throw error;
      toast('Se o e-mail estiver cadastrado, você vai receber o link em instantes.');
      f.reset(); authTab('login');
    },
    'f-reset': async (f) => {
      const d = formData(f);
      if (d.senha !== d.senha2) throw new Error('As senhas não são iguais.');
      const { error } = await sb.auth.updateUser({ password: d.senha });
      if (error) throw error;
      recuperando = false;
      toast('Senha alterada com sucesso!');
      history.replaceState(null, '', location.pathname);
      await boot();
    },
    'f-perfil': async (f) => {
      const d = formData(f);
      const nomeNovo = (d.nome || '').trim();
      if (nomeNovo.length < 2) throw new Error('Escreva seu nome.');
      const campos = { nome: nomeNovo, telefone: (d.telefone || '').trim() || null, nascimento: d.nascimento || null };
      ok(await sb.from('profiles').update(campos).eq('id', me.id));
      me = { ...me, ...campos };
      await carregarPerfis();
      atualizarTopo();
      toast('Dados salvos!'); ir('perfil');
    },
    'f-senha': async (f) => {
      const d = formData(f);
      if ((d.senha || '').length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');
      const { error } = await sb.auth.updateUser({ password: d.senha });
      if (error) throw error;
      f.reset();
      toast('Senha alterada!');
    },
    'f-devocional': async (f) => {
      const d = formData(f);
      if (!d.data || !(d.titulo || '').trim() || !(d.texto || '').trim()) throw new Error('Preencha data, título e texto.');
      ok(await sb.from('devocionais').upsert({ data: d.data, titulo: d.titulo.trim(), referencia: (d.referencia || '').trim() || null, texto: d.texto.trim(), autor_id: me.id }, { onConflict: 'data' }));
      toast('Devocional salvo para ' + fmtData(d.data) + '!'); ir('devocional');
    },
    'f-membro': async (f) => {
      const d = formData(f);
      const campos = { nome: (d.nome || '').trim(), telefone: (d.telefone || '').trim() || null, nascimento: d.nascimento || null };
      if (campos.nome.length < 2) throw new Error('Escreva o nome.');
      ok(await sb.from('profiles').update(campos).eq('id', d.id));
      registrar('editou os dados de', d.id);
      await carregarPerfis(); $('#dlg').close(); toast('Dados salvos.'); ir('membros');
    },
    'f-senha-membro': async (f) => {
      const d = formData(f);
      await chamarAdmin({ tipo: 'admin_senha', membro_id: d.id, senha: d.senha });
      $('#dlg').close(); toast('Senha alterada! Passe a nova senha para a pessoa.'); ir('membros');
    },
    'f-email-membro': async (f) => {
      const d = formData(f);
      await chamarAdmin({ tipo: 'admin_email', membro_id: d.id, email: d.email });
      await carregarPerfis(); $('#dlg').close(); toast('E-mail alterado.'); ir('membros');
    },
    'f-indisp-lider': async (f) => {
      const d = formData(f);
      if (!d.membro || !d.data) throw new Error('Escolha a pessoa e a data.');
      ok(await sb.from('indisponibilidades').upsert({ membro_id: d.membro, data: d.data }));
      registrar('marcou indisponibilidade de', d.membro, fmtData(d.data));
      toast('Data marcada para a pessoa.'); ir('indisp');
    },
    'f-culto': async (f) => {
      const d = formData(f);
      ok(await sb.from('eventos').update({ data: d.data, titulo: d.titulo.trim() }).eq('id', d.id));
      $('#dlg').close();
      const ids = [...new Set(ok(await sb.from('escalas').select('membro_id').eq('evento_id', d.id)).map((s) => s.membro_id))];
      toast('Culto atualizado.');
      if (d.data !== d.data_antiga && ids.length && confirm('A data mudou. Avisar por notificação quem está escalado?')) {
        await avisarEscalaAlterada(ids, `O culto de ${fmtData(d.data_antiga)} mudou para ${fmtData(d.data)}. Confira a escala no app.`);
      }
      ir('gerar');
    },
    'f-oracao': async (f) => {
      const d = formData(f);
      const texto = (d.texto || '').trim();
      if (texto.length < 3) throw new Error('Escreva o pedido de oração.');
      const privado = !!f.elements.privado.checked;
      const equipe = !privado && !!f.elements.equipe.checked;
      const novo = ok(await sb.from('pedidos_oracao').insert({ autor_id: me.id, texto: texto.slice(0, 500), privado }).select('id').single());
      avisarLideres({ acao: 'oracao', pedido_id: novo.id, equipe });
      toast('Pedido publicado. Estamos orando! 🙏'); ir('oracao');
    },
    'f-aviso': async (f) => {
      const d = formData(f);
      const destino = d.destino || null;
      ok(await sb.from('avisos').insert({ titulo: d.titulo.trim(), texto: d.texto.trim(), fixo: !!f.elements.fixo.checked, autor_id: me.id, destinatario_id: destino }));
      let extra = '';
      if (f.elements.notificar && f.elements.notificar.checked) {
        try {
          const r = await chamarPush({ tipo: 'aviso', titulo: d.titulo.trim(), texto: d.texto.trim(), destinatario_id: destino });
          extra = ` Notificação enviada para ${r.enviados || 0} aparelho(s).`;
        } catch (e) { extra = ' (O aviso foi salvo, mas a notificação não pôde ser enviada.)'; }
      }
      toast('Aviso publicado!' + extra); ir('avisos');
    },
    'f-indisp': async (f) => {
      const d = formData(f);
      if (!d.data) return;
      ok(await sb.from('indisponibilidades').upsert({ membro_id: me.id, data: d.data }));
      avisarLideres({ acao: 'indisp', data: d.data, op: 'marcou' });
      toast('Data marcada como indisponível.'); ir('disponib');
    },
    'f-lote': async (f) => {
      const d = formData(f);
      const ym = state.gerarMes || mesAtual();
      const [ini, fim] = limitesMes(ym);
      const vf = Math.max(0, parseInt(d.vagas_foto, 10) || 0);
      const vp = Math.max(0, parseInt(d.vagas_proj, 10) || 0);
      const titulo = (d.titulo || 'Culto').trim() || 'Culto';
      let datas = [];
      if (d.data_unica) {
        datas = [d.data_unica];
      } else {
        const dias = [...f.querySelectorAll('input[name=dia]:checked')].map((i) => Number(i.value));
        if (!dias.length) throw new Error('Marque pelo menos um dia da semana ou escolha uma data específica.');
        for (let dt = parseISO(ini); dt <= parseISO(fim); dt.setDate(dt.getDate() + 1)) {
          if (dias.includes(dt.getDay())) datas.push(`${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`);
        }
      }
      const linhas = datas.map((data) => ({ data, titulo, vagas_foto: vf, vagas_proj: vp }));
      ok(await sb.from('eventos').upsert(linhas, { onConflict: 'data,titulo', ignoreDuplicates: true }));
      toast(`${linhas.length} culto(s) no calendário.`); ir('gerar');
    },
    'f-troca': async (f) => {
      const d = formData(f);
      if (!d.destino_id) throw new Error('Escolha com quem você quer trocar.');
      const motivo = (d.motivo || '').trim();
      if (motivo.length < 5) throw new Error('Escreva o motivo da troca (mínimo de 5 letras).');
      const nova = ok(await sb.from('trocas').insert({ escala_id: d.escala_id, solicitante_id: me.id, destino_id: d.destino_id, motivo: motivo.slice(0, 1000) }).select('id').single());
      avisarLideres({ acao: 'troca', troca_id: nova.id });
      $('#dlg').close();
      toast('Pedido enviado! Agora é só a pessoa aceitar.'); ir('inicio');
    }
  };
  document.addEventListener('submit', (e) => {
    const h = forms[e.target.id];
    if (!h) return;
    e.preventDefault();
    run(() => h(e.target));
  });

  function authTab(qual) {
    for (const id of ['login', 'signup', 'forgot']) $('#f-' + id).hidden = id !== qual;
    document.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === qual));
  }

  // ---------- ações (cliques) ----------
  const acoes = {
    authTab: (b) => authTab(b.dataset.tab),
    sair: async () => { await removerPushDoAparelho(); await sb.auth.signOut(); me = null; show('auth'); },
    recarregar: () => boot(),
    ir: (b) => ir(b.dataset.tab),
    fecharDlg: () => $('#dlg').close(),
    ativarPush: async () => { await ativarPush(); toast('Notificações ativadas! 🔔'); ir('inicio'); },
    testePush: async () => {
      const r = await chamarPush({ tipo: 'teste' });
      toast(r.enviados ? 'Teste enviado! Veja a notificação no aparelho.' : 'Nenhum aparelho seu está cadastrado. Toque em ativar notificações.', !r.enviados);
    },

    confirmar: async (b) => {
      ok(await sb.from('escalas').update({ status: 'confirmado' }).eq('id', b.dataset.id));
      avisarLideres({ acao: 'resposta', escala_id: b.dataset.id });
      toast('Presença confirmada. Obrigado!'); ir(state.tab);
    },
    abrirTroca: async (b) => {
      const campo = b.dataset.func;
      const opcoes = Object.values(state.profiles).filter((p) => p.status === 'ativo' && p.id !== me.id && p[campo]);
      $('#dlg').innerHTML = `
        <form id="f-troca" class="stack">
          <h3>Pedir troca</h3>
          <p class="muted">Escolha quem pode assumir seu lugar. A pessoa recebe o pedido e precisa aceitar. O líder também é avisado.</p>
          <input type="hidden" name="escala_id" value="${esc(b.dataset.id)}">
          <label>Trocar com
            <select name="destino_id" required>
              <option value="">Selecione…</option>
              ${opcoes.map((p) => `<option value="${p.id}">${esc(p.nome)}</option>`).join('')}
            </select>
          </label>
          <label>Motivo da troca (obrigatório)
            <textarea id="motivo-troca" name="motivo" required minlength="5" maxlength="1000" placeholder="Explique por que você não poderá servir neste dia…"></textarea>
            <span class="muted" id="motivo-cont">0 / 1000</span>
          </label>
          <div class="row"><button class="btn primary grow" type="submit">Enviar pedido</button>
          <button class="btn" type="button" data-act="fecharDlg">Cancelar</button></div>
        </form>`;
      $('#dlg').showModal();
    },
    visao: (b) => { state.visao = b.dataset.v; return ir('escalas'); },
    imprimir: () => window.print(),
    copiarEscala: async () => {
      const d = state.dadosEscala;
      if (!d || !d.eventos.length) throw new Error('Não há escala neste mês.');
      const mes = parseISO(d.ym + '-01').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      const linhas = [`*Escala da Mídia – ${mes}*`, 'Assembleia de Deus Monte Moriah', ''];
      const nomes = (ev, fn) => d.escalas.filter((s) => s.evento_id === ev.id && s.funcao === fn && s.status !== 'recusado').map((s) => nome(s.membro_id));
      for (const ev of d.eventos) {
        const f = nomes(ev, 'fotografia');
        const pr = nomes(ev, 'projetor');
        linhas.push(`*${fmtData(ev.data)} – ${ev.titulo}*`);
        linhas.push(`📸 Fotografia: ${f.length ? f.join(', ') : '—'}`);
        linhas.push(`🖥️ Projetor: ${pr.length ? pr.join(', ') : '—'}`, '');
      }
      const texto = linhas.join('\n').trim();
      try { await navigator.clipboard.writeText(texto); toast('Escala copiada! É só colar no WhatsApp.'); }
      catch (_) { window.prompt('Copie o texto abaixo:', texto); }
    },
    limparMes: async () => {
      const d = state.dadosEscala;
      if (!d || !d.eventos.length) throw new Error('Não há cultos neste mês.');
      if (!d.escalas.length) throw new Error('A escala deste mês já está vazia.');
      if (!confirm(`Limpar a escala dos ${d.eventos.length} cultos deste mês? Os nomes saem e os cultos continuam cadastrados.`)) return;
      const ids = [...new Set(d.escalas.map((s) => s.membro_id))];
      const mes = parseISO(d.ym + '-01').toLocaleDateString('pt-BR', { month: 'long' });
      ok(await sb.from('escalas').delete().in('evento_id', d.eventos.map((e) => e.id)));
      registrar('limpou a escala do mês', null, d.ym);
      toast('Escala do mês limpa.');
      await ir('escalas');
      if (confirm('Avisar por notificação quem estava escalado?')) await avisarEscalaAlterada(ids, `A escala de ${mes} foi desfeita pelo líder. Aguarde a nova escala.`);
    },
    apagarMes: async () => {
      const d = state.dadosEscala;
      if (!d || !d.eventos.length) throw new Error('Não há cultos neste mês.');
      if (!confirm(`APAGAR o mês inteiro? Isso remove os ${d.eventos.length} cultos e toda a escala deles. Não dá para desfazer.`)) return;
      const ids = [...new Set(d.escalas.map((s) => s.membro_id))];
      const mes = parseISO(d.ym + '-01').toLocaleDateString('pt-BR', { month: 'long' });
      ok(await sb.from('eventos').delete().in('id', d.eventos.map((e) => e.id)));
      registrar('apagou o mês inteiro', null, d.ym);
      toast('Mês apagado.');
      await ir('escalas');
      if (ids.length && confirm('Avisar por notificação quem estava escalado?')) await avisarEscalaAlterada(ids, `A escala de ${mes} foi desfeita pelo líder. Aguarde a nova escala.`);
    },
    limparCulto: async (b) => {
      const d = state.dadosEscala;
      const ev = d && d.eventos.find((e) => e.id === b.dataset.id);
      if (!ev) return;
      const ids = [...new Set(d.escalas.filter((s) => s.evento_id === ev.id).map((s) => s.membro_id))];
      if (!ids.length) throw new Error('Este culto já está sem escala.');
      if (!confirm(`Limpar a escala de ${fmtData(ev.data)}?`)) return;
      ok(await sb.from('escalas').delete().eq('evento_id', ev.id));
      toast('Escala do culto limpa.');
      await ir('escalas');
      if (confirm('Avisar por notificação quem estava escalado?')) await avisarEscalaAlterada(ids, `A escala de ${fmtData(ev.data)} foi desfeita pelo líder. Aguarde a nova escala.`);
    },
    removerIndisp: async (b) => {
      ok(await sb.from('indisponibilidades').delete().eq('membro_id', me.id).eq('data', b.dataset.data));
      avisarLideres({ acao: 'indisp', data: b.dataset.data, op: 'removeu' });
      ir('disponib');
    },
    excluirAviso: async (b) => {
      if (!confirm('Apagar este aviso?')) return;
      ok(await sb.from('avisos').delete().eq('id', b.dataset.id)); ir('avisos');
    },

    // --- admin: membros ---
    setStatus: async (b) => {
      const msg = { bloqueado: 'Bloquear este membro?', ativo: null };
      if (msg[b.dataset.status] && !confirm(msg[b.dataset.status])) return;
      const antes = state.profiles[b.dataset.id] && state.profiles[b.dataset.id].status;
      ok(await sb.from('profiles').update({ status: b.dataset.status }).eq('id', b.dataset.id));
      registrar(b.dataset.status === 'bloqueado' ? 'bloqueou o acesso de' : antes === 'pendente' ? 'aprovou o cadastro de' : 'desbloqueou', b.dataset.id);
      await carregarPerfis(); toast('Atualizado.'); ir('membros');
    },
    remover: async (b) => {
      if (!confirm(`Remover ${nome(b.dataset.id)} DEFINITIVAMENTE? A conta, as escalas e o histórico dessa pessoa serão apagados e não dá para desfazer.`)) return;
      const quem = nome(b.dataset.id);
      await chamarAdmin({ tipo: 'admin_remover', membro_id: b.dataset.id });
      await carregarPerfis(); toast(`${quem} foi removido(a).`); ir('membros');
    },
    editarMembro: (b) => {
      const p = state.profiles[b.dataset.id];
      $('#dlg').innerHTML = `
        <form id="f-membro" class="stack">
          <h3>Editar dados</h3>
          <input type="hidden" name="id" value="${esc(p.id)}">
          <label>Nome<input name="nome" value="${esc(p.nome)}" maxlength="80" required></label>
          <label>Telefone (WhatsApp)<input name="telefone" type="tel" value="${esc(p.telefone || '')}"></label>
          <label>Data de nascimento<input name="nascimento" type="date" value="${esc(p.nascimento || '')}"></label>
          <div class="row"><button class="btn primary grow" type="submit">Salvar</button><button class="btn" type="button" data-act="fecharDlg">Cancelar</button></div>
        </form>`;
      $('#dlg').showModal();
    },
    senhaMembro: (b) => {
      const p = state.profiles[b.dataset.id];
      $('#dlg').innerHTML = `
        <form id="f-senha-membro" class="stack">
          <h3>Nova senha para ${esc(p.nome)}</h3>
          <input type="hidden" name="id" value="${esc(p.id)}">
          <label>Nova senha (mínimo 6 caracteres)<input id="senha-nova" name="senha" type="text" minlength="6" maxlength="72" autocomplete="off" required></label>
          <button class="btn" type="button" data-act="gerarSenha">Gerar senha aleatória</button>
          <p class="muted">Passe a senha para a pessoa por um canal seguro. Ela recebe um aviso no app e pode trocá-la depois em Meu perfil.</p>
          <div class="row"><button class="btn primary grow" type="submit">Salvar senha</button><button class="btn" type="button" data-act="fecharDlg">Cancelar</button></div>
        </form>`;
      $('#dlg').showModal();
    },
    gerarSenha: () => { const el = $('#senha-nova'); if (el) el.value = senhaAleatoria(); },
    emailMembro: (b) => {
      const p = state.profiles[b.dataset.id];
      $('#dlg').innerHTML = `
        <form id="f-email-membro" class="stack">
          <h3>Alterar e-mail de ${esc(p.nome)}</h3>
          <input type="hidden" name="id" value="${esc(p.id)}">
          <label>Novo e-mail<input name="email" type="email" value="${esc(p.email || '')}" required></label>
          <p class="muted">O e-mail passa a valer na hora, sem precisar de confirmação. A pessoa entra com o novo e-mail e a mesma senha.</p>
          <div class="row"><button class="btn primary grow" type="submit">Salvar</button><button class="btn" type="button" data-act="fecharDlg">Cancelar</button></div>
        </form>`;
      $('#dlg').showModal();
    },
    confirmarPor: async (b) => {
      ok(await sb.from('escalas').update({ status: 'confirmado' }).eq('id', b.dataset.id));
      const s = state.dadosEscala && state.dadosEscala.escalas.find((x) => x.id === b.dataset.id);
      if (s) registrar('confirmou a presença de', s.membro_id);
      toast('Presença confirmada pelo líder.'); ir('escalas');
    },
    removerIndispDe: async (b) => {
      ok(await sb.from('indisponibilidades').delete().eq('membro_id', b.dataset.m).eq('data', b.dataset.data));
      registrar('removeu a indisponibilidade de', b.dataset.m, fmtData(b.dataset.data));
      ir('indisp');
    },
    editarCulto: async (b) => {
      const ev = ok(await sb.from('eventos').select('*').eq('id', b.dataset.id).single());
      $('#dlg').innerHTML = `
        <form id="f-culto" class="stack">
          <h3>Editar culto</h3>
          <input type="hidden" name="id" value="${esc(ev.id)}">
          <input type="hidden" name="data_antiga" value="${esc(ev.data)}">
          <label>Data<input name="data" type="date" value="${esc(ev.data)}" required></label>
          <label>Título<input name="titulo" value="${esc(ev.titulo)}" maxlength="60" required></label>
          <div class="row"><button class="btn primary grow" type="submit">Salvar</button><button class="btn" type="button" data-act="fecharDlg">Cancelar</button></div>
        </form>`;
      $('#dlg').showModal();
    },
    tornarAdmin: async (b) => {
      const novo = b.dataset.role;
      if (!confirm(novo === 'admin' ? `Dar acesso de líder a ${nome(b.dataset.id)}?` : `Tirar acesso de líder de ${nome(b.dataset.id)}?`)) return;
      ok(await sb.from('profiles').update({ role: novo }).eq('id', b.dataset.id));
      registrar(novo === 'admin' ? 'tornou líder' : 'tirou de líder', b.dataset.id);
      await carregarPerfis(); ir('membros');
    },

    // --- admin: escalas ---
    rmEscala: async (b) => {
      ok(await sb.from('escalas').delete().eq('id', b.dataset.id)); ir('escalas');
    },
    addEscala: async (b) => {
      const sel = b.parentElement.querySelector('select');
      if (!sel.value) return;
      ok(await sb.from('escalas').insert({ evento_id: b.dataset.ev, funcao: b.dataset.func, membro_id: sel.value }));
      ir('escalas');
    },
    excluirEvento: async (b) => {
      if (!confirm('Apagar este culto e a escala dele?')) return;
      ok(await sb.from('eventos').delete().eq('id', b.dataset.id)); ir('gerar');
    },
    gerarPreview: () => gerarPreview(),
    salvarEscala: () => salvarEscala(),

    aceitarTroca: async (b) => {
      if (!confirm('Aceitar trocar? Você assume este dia na escala.')) return;
      await chamarAdmin({ tipo: 'troca_responder', troca_id: b.dataset.id, aceitar: true });
      toast('Troca aceita! Você assumiu esta escala.'); ir('inicio');
    },
    recusarTrocaMembro: async (b) => {
      if (!confirm('Recusar este pedido de troca?')) return;
      await chamarAdmin({ tipo: 'troca_responder', troca_id: b.dataset.id, aceitar: false });
      toast('Pedido recusado.'); ir('inicio');
    },
    cancelarTroca: async (b) => {
      if (!confirm('Cancelar seu pedido de troca?')) return;
      ok(await sb.from('trocas').delete().eq('id', b.dataset.id).eq('solicitante_id', me.id).eq('status', 'pendente'));
      toast('Pedido cancelado.'); ir('inicio');
    },
    excluirDevocional: async (b) => {
      if (!confirm('Apagar este devocional?')) return;
      ok(await sb.from('devocionais').delete().eq('id', b.dataset.id));
      toast('Devocional apagado.'); ir('devocional');
    },
    orar: async (b) => {
      if (b.dataset.on === '1') ok(await sb.from('oracoes').delete().eq('pedido_id', b.dataset.id).eq('membro_id', me.id));
      else ok(await sb.from('oracoes').insert({ pedido_id: b.dataset.id, membro_id: me.id }));
      ir('oracao');
    },
    excluirPedido: async (b) => {
      if (!confirm('Apagar este pedido de oração?')) return;
      ok(await sb.from('pedidos_oracao').delete().eq('id', b.dataset.id));
      toast('Pedido apagado.'); ir('oracao');
    },
    exportarRelatorio: () => {
      const r = state.relDados;
      if (!r) return;
      baixarCSV(`relatorio-midia-${r.periodo}.csv`, r.cab, r.linhas);
    },
    exportarMembros: () => {
      const lista = Object.values(state.profiles).sort((x, y) => x.nome.localeCompare(y.nome));
      baixarCSV(`membros-midia-${hojeISO()}.csv`,
        ['Nome', 'E-mail', 'Telefone', 'Nascimento', 'Situação', 'Líder', 'Fotografia', 'Projetor'],
        lista.map((p) => [p.nome, p.email || '', p.telefone || '', p.nascimento ? `${p.nascimento.slice(8)}/${p.nascimento.slice(5, 7)}/${p.nascimento.slice(0, 4)}` : '', p.status, p.role === 'admin' ? 'sim' : 'não', p.fotografia ? 'sim' : 'não', p.projetor ? 'sim' : 'não']));
    },
    removerFoto: async () => {
      ok(await sb.from('profiles').update({ foto: null }).eq('id', me.id));
      me = { ...me, foto: null }; await carregarPerfis(); atualizarTopo();
      toast('Foto removida.'); ir('perfil');
    },
    abrirSino: async () => {
      const lista = ok(await sb.from('notificacoes').select('*').eq('user_id', me.id).order('created_at', { ascending: false }).limit(40));
      $('#dlg').innerHTML = `
        <h3>🔔 Notificações</h3>
        ${lista.length ? lista.map((n) => `<div class="notif ${n.lida ? '' : 'nova'}"><b>${esc(n.titulo)}</b><p>${esc(n.corpo)}</p><span class="muted">${tempoAtras(n.created_at)}</span></div>`).join('') : '<p class="empty">Nenhuma notificação ainda.</p>'}
        <div class="row" style="margin-top:12px"><button class="btn grow" data-act="fecharDlg">Fechar</button>${lista.length ? '<button class="btn" data-act="limparSino">Limpar tudo</button>' : ''}</div>`;
      $('#dlg').showModal();
      if (lista.some((n) => !n.lida)) {
        await sb.from('notificacoes').update({ lida: true }).eq('user_id', me.id).eq('lida', false);
        contarNaoLidas();
      }
    },
    limparSino: async () => {
      ok(await sb.from('notificacoes').delete().eq('user_id', me.id));
      $('#dlg').close(); contarNaoLidas(); toast('Notificações limpas.');
    },
    sugerir: async (b) => {
      const evId = b.dataset.ev;
      const fn = b.dataset.func;
      const ev = ok(await sb.from('eventos').select('*').eq('id', evId).single());
      const doEv = ok(await sb.from('escalas').select('membro_id').eq('evento_id', evId));
      const jaNoCulto = new Set(doEv.map((s) => s.membro_id));
      const indSet = new Set(ok(await sb.from('indisponibilidades').select('membro_id').eq('data', ev.data)).map((i) => i.membro_id));
      const ano = ev.data.slice(0, 4);
      const hist = ok(await sb.from('escalas').select('membro_id,eventos!inner(data)').neq('status', 'recusado')
        .gte('eventos.data', `${Number(ano) - 1}-01-01`).lt('eventos.data', ev.data));
      const ultimo = {}; const cont = {};
      hist.forEach((h) => {
        const d = h.eventos.data;
        if (!ultimo[h.membro_id] || d > ultimo[h.membro_id]) ultimo[h.membro_id] = d;
        if (d.slice(0, 4) === ano) cont[h.membro_id] = (cont[h.membro_id] || 0) + 1;
      });
      const grupo = Object.values(state.profiles).filter((p) => p.status === 'ativo' && p[fn] && !jaNoCulto.has(p.id));
      const livres = grupo.filter((p) => !indSet.has(p.id))
        .sort((x, y) => (ultimo[x.id] || '').localeCompare(ultimo[y.id] || '') || (cont[x.id] || 0) - (cont[y.id] || 0) || x.nome.localeCompare(y.nome))
        .slice(0, 6);
      const barrados = grupo.length - grupo.filter((p) => !indSet.has(p.id)).length;
      $('#dlg').innerHTML = `
        <h3>Sugestão de substituto</h3>
        <p class="muted">${fmtData(ev.data)} · ${esc(ev.titulo)} · ${NOME_FUNCAO[fn]}<br>Ordem: quem serviu há mais tempo primeiro. Quem marcou indisponibilidade não aparece${barrados ? ` (${barrados} fora por isso)` : ''}.</p>
        ${livres.length ? livres.map((p) => `
          <div class="row between" style="padding:8px 0;border-top:1px solid var(--line)">
            <div class="row" style="flex-wrap:nowrap">${avatar(p, 34)}<div><b>${esc(p.nome)}</b><br><span class="muted">${ultimo[p.id] ? 'última vez: ' + fmtData(ultimo[p.id]) : 'nunca escalado(a)'} · ${cont[p.id] || 0} no ano</span></div></div>
            <button class="btn small ok" data-act="escalarSub" data-ev="${evId}" data-func="${fn}" data-m="${p.id}" data-data="${ev.data}">Escalar</button>
          </div>`).join('') : '<div class="warnbox">Ninguém disponível para esta vaga. Veja a aba "Disponibilidade da equipe".</div>'}
        <button class="btn" style="margin-top:12px;width:100%" data-act="fecharDlg">Fechar</button>`;
      $('#dlg').showModal();
    },
    escalarSub: async (b) => {
      ok(await sb.from('escalas').insert({ evento_id: b.dataset.ev, funcao: b.dataset.func, membro_id: b.dataset.m }));
      $('#dlg').close();
      chamarPush({ tipo: 'escala_alterada', ids: [b.dataset.m], texto: `Você foi escalado(a) em ${fmtData(b.dataset.data)} (${NOME_FUNCAO[b.dataset.func]}). Abra o app e confirme sua presença.` }).catch(() => {});
      toast('Escalado(a)! A pessoa foi avisada.'); ir(state.tab);
    },
    // --- admin: trocas ---
    aprovarTroca: async (b) => {
      const { data: t } = await sb.from('trocas').select('*').eq('id', b.dataset.id).single();
      ok(await sb.from('escalas').update({ membro_id: t.destino_id, status: 'pendente' }).eq('id', t.escala_id));
      ok(await sb.from('trocas').update({ status: 'aprovada' }).eq('id', t.id));
      chamarPush({ tipo: 'troca_lider', troca_id: t.id }).catch(() => {});
      toast('Troca aprovada.'); ir('trocas');
    },
    recusarTroca: async (b) => {
      ok(await sb.from('trocas').update({ status: 'recusada' }).eq('id', b.dataset.id));
      chamarPush({ tipo: 'troca_lider', troca_id: b.dataset.id }).catch(() => {});
      toast('Pedido recusado.'); ir('trocas');
    }
  };
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || !acoes[b.dataset.act]) return;
    run(() => acoes[b.dataset.act](b));
  });
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.id === 'motivo-troca') { const c = $('#motivo-cont'); if (c) c.textContent = `${el.value.length} / 1000`; }
    if (el.id === 'texto-oracao') { const c = $('#oracao-cont'); if (c) c.textContent = `${el.value.length} / 500`; }
  });
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.chg === 'mesEscalas') { state.escalasMes = el.value; run(() => ir('escalas')); }
    if (el.dataset.chg === 'addEscala') {
      if (!el.value) return;
      run(async () => {
        ok(await sb.from('escalas').insert({ evento_id: el.dataset.ev, funcao: el.dataset.func, membro_id: el.value }));
        const evx = state.dadosEscala && state.dadosEscala.eventos.find((e) => e.id === el.dataset.ev);
        if (evx) chamarPush({ tipo: 'escala_alterada', ids: [el.value], texto: `Você foi escalado(a) em ${fmtData(evx.data)} (${NOME_FUNCAO[el.dataset.func]}). Abra o app e confirme sua presença.` }).catch(() => {});
        ir('escalas');
      });
    }
    if (el.dataset.chg === 'foto') {
      run(async () => {
        const arq = el.files && el.files[0];
        if (!arq) return;
        const url = await reduzirFoto(arq, 240);
        ok(await sb.from('profiles').update({ foto: url }).eq('id', me.id));
        me = { ...me, foto: url }; await carregarPerfis(); atualizarTopo();
        toast('Foto atualizada!'); ir('perfil');
      });
    }
    if (el.dataset.chg === 'relAno') { state.relAno = el.value; run(() => ir('relatorio')); }
    if (el.dataset.chg === 'relMes') { state.relMes = el.value; run(() => ir('relatorio')); }
    if (el.dataset.chg === 'ordemMembros') { state.membrosOrdem = el.value; run(() => ir('membros')); }
    if (el.dataset.chg === 'mesIndisp') { state.indispMes = el.value; run(() => ir('indisp')); }
    if (el.dataset.chg === 'mesGerar') { state.gerarMes = el.value; state.preview = null; run(() => ir('gerar')); }
    if (el.dataset.chg === 'vagas') {
      run(async () => {
        const v = Math.min(10, Math.max(0, parseInt(el.value, 10) || 0));
        el.value = v;
        ok(await sb.from('eventos').update({ [el.dataset.campo]: v }).eq('id', el.dataset.id));
        state.preview = null;
        const pv = $('#preview');
        if (pv) pv.innerHTML = '';
        toast('Vagas atualizadas. Gere a escala de novo.');
      });
    }
    if (el.dataset.chg === 'grupo') {
      run(async () => {
        ok(await sb.from('profiles').update({ [el.dataset.campo]: el.checked }).eq('id', el.dataset.id));
        state.profiles[el.dataset.id][el.dataset.campo] = el.checked;
        toast('Grupo atualizado.');
      });
    }
  });

  // ---------- menu ----------
  const TELAS = {
    inicio: { rotulo: 'Início', fn: telaInicio },
    devocional: { rotulo: 'Devocional', fn: telaDevocional },
    oracao: { rotulo: 'Oração 🙏', fn: telaOracao },
    escalas: { rotulo: 'Escalas', fn: telaEscalas },
    disponib: { rotulo: 'Minha disponibilidade', fn: telaDisponib },
    avisos: { rotulo: 'Avisos', fn: telaAvisos },
    perfil: { rotulo: 'Meu perfil', fn: telaPerfil },
    membros: { rotulo: 'Membros', fn: telaMembros, admin: true },
    gerar: { rotulo: 'Gerar escala', fn: telaGerar, admin: true },
    indisp: { rotulo: 'Disponibilidade da equipe', fn: telaIndisp, admin: true },
    trocas: { rotulo: 'Trocas', fn: telaTrocas, admin: true },
    relatorio: { rotulo: 'Relatório', fn: telaRelatorio, admin: true }
  };
  const podeVer = (id) => !TELAS[id].admin || me.role === 'admin';
  function montarMenu() {
    $('#nav').innerHTML = Object.entries(TELAS)
      .filter(([id]) => podeVer(id))
      .map(([id, t]) => `<button class="${t.admin ? 'adm' : ''}" data-act="ir" data-tab="${id}" data-nav="${id}">${t.rotulo}</button>`)
      .join('');
  }
  async function ir(tab) {
    state.tab = tab;
    document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('active', b.dataset.nav === tab));
    $('#content').classList.toggle('wide', tab === 'escalas' || tab === 'relatorio');
    $('#content').innerHTML = '<p class="empty">Carregando…</p>';
    try { await TELAS[tab].fn(); } catch (e) { console.error(e); $('#content').innerHTML = `<p class="empty">Não foi possível carregar.<br>${esc(traduzErro(e))}</p>`; }
  }

  // ---------- telas do membro ----------
  const badgeStatus = (s) => ({ confirmado: '<span class="badge ok">Confirmado</span>', recusado: '<span class="badge bad">Não posso</span>', pendente: '<span class="badge warn">Aguardando confirmação</span>' }[s]);

  async function contagemAno(membroId, ano) {
    const hoje = hojeISO();
    const linhas = ok(await sb.from('escalas').select('funcao,status,eventos!inner(data)')
      .eq('membro_id', membroId).neq('status', 'recusado')
      .gte('eventos.data', `${ano}-01-01`).lte('eventos.data', hoje));
    const c = { total: linhas.length, fotografia: 0, projetor: 0 };
    linhas.forEach((l) => c[l.funcao]++);
    return c;
  }

  async function painelLider() {
    const hoje = hojeISO();
    const l14 = new Date(Date.now() + 14 * 86400000);
    const l7 = new Date(Date.now() + 7 * 86400000);
    const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const [evs, trocas, acessosMapa] = await Promise.all([
      sb.from('eventos').select('*').gte('data', hoje).lte('data', iso(l14)).order('data').then(ok),
      sb.from('trocas').select('id').eq('status', 'pendente').then(ok),
      carregarAcessos().catch(() => ({}))
    ]);
    const escs = evs.length ? ok(await sb.from('escalas').select('id,evento_id,funcao,membro_id,status').in('evento_id', evs.map((e) => e.id))) : [];
    const pendentes = Object.values(state.profiles).filter((p) => p.status === 'pendente');
    const vagas = [];
    evs.forEach((ev) => FUNCOES.forEach((fn) => {
      const q = fn === 'fotografia' ? ev.vagas_foto : ev.vagas_proj;
      const t = escs.filter((s) => s.evento_id === ev.id && s.funcao === fn && s.status !== 'recusado').length;
      if (q > t) vagas.push({ ev, fn, falta: q - t });
    }));
    const dataEv = Object.fromEntries(evs.map((e) => [e.id, e.data]));
    const semResp = [...new Set(escs.filter((s) => s.status === 'pendente' && dataEv[s.evento_id] <= iso(l7)).map((s) => nome(s.membro_id)))];
    const ult = Object.fromEntries(Object.entries(acessosMapa).map(([id, t]) => [id, new Date(t).getTime()]));
    const sumidos = Object.values(state.profiles)
      .filter((p) => p.status === 'ativo' && p.id !== me.id && (!ult[p.id] || Date.now() - ult[p.id] >= 7 * 86400000))
      .map((p) => p.nome.split(' ')[0]);
    const linhas = [];
    if (pendentes.length) linhas.push(`<div class="row between"><span>🆕 <b>${pendentes.length}</b> cadastro(s) aguardando aprovação</span><button class="btn small" data-act="ir" data-tab="membros">Ver</button></div>`);
    if (trocas.length) linhas.push(`<div class="row between"><span>🔁 <b>${trocas.length}</b> troca(s) esperando resposta</span><button class="btn small" data-act="ir" data-tab="trocas">Ver</button></div>`);
    vagas.forEach((v) => linhas.push(`<div class="row between"><span>⚠️ ${fmtData(v.ev.data)} · ${NOME_FUNCAO[v.fn]}: falta ${v.falta}</span><button class="btn small" data-act="sugerir" data-ev="${v.ev.id}" data-func="${v.fn}">Sugerir substituto</button></div>`));
    if (semResp.length) linhas.push(`<div>⏳ Sem confirmar (próximos 7 dias): <b>${esc(semResp.join(', '))}</b></div>`);
    if (sumidos.length) linhas.push(`<div>👻 Sem entrar há 7+ dias: <b>${esc(sumidos.join(', '))}</b></div>`);
    return `<div class="card painel"><h3>🧭 Painel do líder</h3><div class="stack" style="margin-top:10px">${linhas.length ? linhas.join('') : '<div>Tudo em ordem por aqui. 🙌</div>'}<div><button class="link" data-act="ir" data-tab="relatorio" style="padding:0">📊 Abrir relatório de escalas</button></div></div></div>`;
  }

  async function telaInicio() {
    const ano = new Date().getFullYear();
    const hoje = hojeISO();
    const psStatus = await statusPush().catch(() => 'indisponivel');
    const selosIni = await calcularSelos(me.id).catch(() => null);
    const linhaSelos = selosIni
      ? `🏅 ${selosIni.ganhos} selo${selosIni.ganhos === 1 ? '' : 's'}${selosIni.proximo ? ` · próximo: ${selosIni.proximo.ic} ${esc(selosIni.proximo.nome)} (${selosIni.proximo.atual}/${selosIni.proximo.meta})` : ' · todos conquistados!'} <button class="link" data-act="ir" data-tab="perfil">ver selos</button>`
      : '';
    const htmlPainel = me.role === 'admin' ? await painelLider().catch((e) => { console.warn(e); return ''; }) : '';
    const mm = hoje.slice(5, 7); const dd = hoje.slice(8, 10);
    const aniv = Object.values(state.profiles).filter((p) => p.status === 'ativo' && p.nascimento && p.nascimento.slice(5, 7) === mm)
      .sort((x, y) => x.nascimento.slice(8).localeCompare(y.nascimento.slice(8)));
    const nomeMes = new Date().toLocaleDateString('pt-BR', { month: 'long' });
    const meuAniv = me.nascimento && me.nascimento.slice(5) === `${mm}-${dd}`;
    const htmlMeuAniv = (meuAniv ? `<div class="card" style="background:linear-gradient(135deg,#fff7df,#fff);border:1px solid var(--gold)"><h3>🎂 Feliz aniversário, ${esc(me.nome.split(' ')[0])}!</h3><p>Que o Senhor te abençoe e te guarde, e faça resplandecer o rosto sobre você. Sua família da Mídia Moriah te ama! 🎉🙏</p></div>` : '');
    const htmlListaAniv = (aniv.length ? `<h2>🎂 Aniversariantes de ${esc(nomeMes)}</h2><div class="card">${aniv.map((p) => `<div class="row" style="padding:4px 0">${avatar(p, 30)}<span class="grow"><b>${esc(p.nome)}</b></span><span class="${p.nascimento.slice(8) === dd ? 'badge ok' : 'muted'}">${p.nascimento.slice(8)}/${mm}${p.nascimento.slice(8) === dd ? ' · hoje!' : ''}</span></div>`).join('')}</div>` : '');
    const [cont, proximas, trocas, avisos, recebidas] = await Promise.all([
      contagemAno(me.id, ano),
      sb.from('escalas').select('id,funcao,status,eventos!inner(data,titulo)')
        .eq('membro_id', me.id).gte('eventos.data', hoje).neq('status', 'recusado').then(ok),
      sb.from('trocas').select('escala_id').eq('solicitante_id', me.id).eq('status', 'pendente').then(ok),
      sb.from('avisos').select('*').order('fixo', { ascending: false }).order('created_at', { ascending: false }).limit(3).then(ok),
      sb.from('trocas').select('id,escala_id,solicitante_id,motivo,escalas!inner(funcao,eventos!inner(data,titulo))')
        .eq('destino_id', me.id).eq('status', 'pendente').gte('escalas.eventos.data', hoje).then(ok)
    ]);
    const trocaPendente = new Map(trocas.map((t) => [t.escala_id, t.id]));
    const cardsRecebidos = recebidas.map((t) => `
      <div class="card" style="border-left:4px solid var(--gold)">
        <b>🔁 ${esc(nome(t.solicitante_id))}</b> pediu para trocar com você<br>
        <span class="muted">${fmtData(t.escalas.eventos.data)} · ${esc(t.escalas.eventos.titulo)} · ${NOME_FUNCAO[t.escalas.funcao]}</span>
        <p style="white-space:pre-wrap;margin:8px 0 0"><b>Motivo:</b> ${esc(t.motivo || '—')}</p>
        ${proximas.some((e) => e.eventos.data === t.escalas.eventos.data)
          ? '<p class="warnbox">Você já está escalado(a) neste dia, por isso não dá para aceitar. Recuse o pedido e avise o colega.</p>' : ''}
        <div class="row" style="margin-top:10px">
          ${proximas.some((e) => e.eventos.data === t.escalas.eventos.data) ? '' : `<button class="btn small ok" data-act="aceitarTroca" data-id="${t.id}">Aceitar troca</button>`}
          <button class="btn small" data-act="recusarTrocaMembro" data-id="${t.id}">Recusar</button>
        </div></div>`).join('');
    proximas.sort((a, b) => a.eventos.data.localeCompare(b.eventos.data));
    const grupos = FUNCOES.filter((f) => me[f]).map((f) => NOME_FUNCAO[f]).join(' e ') || 'sem grupo ainda';

    $('#content').innerHTML = `
      ${htmlMeuAniv}
      ${mensagemDoDia() ? `<div class="card" style="border-left:4px solid var(--gold)"><div class="muted">📖 Mensagem do dia</div>${htmlVersiculo(mensagemDoDia())}<button class="link" data-act="ir" data-tab="devocional">Ver devocional de hoje</button></div>` : ''}
      ${htmlPainel}
      <div class="card">
        <h3>Olá, ${esc(me.nome.split(' ')[0])}! 👋</h3>
        <p class="muted">Seu grupo: <b>${esc(grupos)}</b></p>
        <h2 style="margin-top:12px">Suas escalas em ${ano} (até hoje)</h2>
        <div class="stats">
          <div class="stat"><b>${cont.total}</b><span>Total</span></div>
          <div class="stat"><b>${cont.fotografia}</b><span>Fotografia</span></div>
          <div class="stat"><b>${cont.projetor}</b><span>Projetor</span></div>
        </div>
        ${linhaSelos ? `<p class="muted" style="margin-top:10px">${linhaSelos}</p>` : ''}
      </div>

      ${cardsRecebidos ? `<h2>Pedidos de troca para você</h2>${cardsRecebidos}` : ''}

      ${cardPush(psStatus)}

      <h2>Próximas escalas</h2>
      ${proximas.length ? proximas.map((e) => `
        <div class="card">
          <div class="row between">
            <div><b>${fmtData(e.eventos.data)}</b> · ${esc(e.eventos.titulo)}<br><span class="muted">${NOME_FUNCAO[e.funcao]}</span></div>
            ${badgeStatus(e.status)}
          </div>
          <div class="row" style="margin-top:10px">
            ${e.status !== 'confirmado' ? `<button class="btn small ok" data-act="confirmar" data-id="${e.id}">Confirmar presença</button>` : ''}
            ${trocaPendente.has(e.id)
              ? `<span class="badge warn">Troca solicitada</span><button class="btn small" data-act="cancelarTroca" data-id="${trocaPendente.get(e.id)}">Cancelar pedido</button>`
              : `<button class="btn small" data-act="abrirTroca" data-id="${e.id}" data-func="${e.funcao}">Pedir troca</button>`}
          </div>
        </div>`).join('') : '<div class="card empty">Você não está escalado(a) nos próximos dias. Folga! 😊</div>'}

      ${htmlListaAniv}

      <h2>Avisos recentes</h2>
      ${avisos.length ? avisos.map(htmlAviso).join('') : '<div class="card empty">Nenhum aviso por enquanto.</div>'}
      <p class="row"><button class="link" data-act="ir" data-tab="avisos">Ver todos os avisos</button></p>
      ${me.role !== 'admin' ? '<p class="muted" style="margin-top:16px;font-size:.8rem">O líder da mídia consegue ver quando você usou o app pela última vez.</p>' : ''}`;
  }

  async function telaPerfil() {
    await carregarPerfis();
    if (state.profiles[me.id]) me = { ...me, ...state.profiles[me.id] };
    const psStatus = await statusPush().catch(() => 'indisponivel');
    const selosPerfil = await calcularSelos(me.id).catch((e) => { console.warn(e); return null; });
    $('#content').innerHTML = `
      <div class="card center">
        ${avatar(me, 96)}
        <h3 style="margin-top:8px">${esc(me.nome)}</h3>
        <p class="muted">${esc(me.email || '')}</p>
        <div class="row" style="justify-content:center">
          <label class="btn small" style="cursor:pointer;flex-direction:row">Escolher foto<input type="file" accept="image/*" data-chg="foto" hidden></label>
          ${me.foto ? '<button class="btn small" data-act="removerFoto">Remover foto</button>' : ''}
        </div>
      </div>
      <div class="card">
        <h3>Meus dados</h3>
        <form id="f-perfil" class="stack" style="margin-top:10px">
          <label>Nome<input name="nome" value="${esc(me.nome)}" maxlength="80" required></label>
          <label>Telefone (WhatsApp)<input name="telefone" type="tel" value="${esc(me.telefone || '')}"></label>
          <label>Data de nascimento<input name="nascimento" type="date" value="${esc(me.nascimento || '')}"></label>
          <p class="muted">Seu aniversário aparece para a equipe só como dia e mês, e você recebe uma mensagem especial no dia. 🎂</p>
          <button class="btn primary" type="submit">Salvar</button>
        </form>
      </div>
      <div class="card">
        <h3>Mudar senha</h3>
        <form id="f-senha" class="stack" style="margin-top:10px">
          <label>Nova senha (mínimo 6 caracteres)<input type="password" name="senha" minlength="6" autocomplete="new-password" required></label>
          <button class="btn primary" type="submit">Salvar nova senha</button>
        </form>
      </div>
      ${selosPerfil ? htmlSelos(selosPerfil) : ''}
      ${cardPush(psStatus)}`;
  }

  // ---------- mensagem do dia e devocional ----------
  function mensagemDoDia(deslocamento = 0) {
    const lista = window.MENSAGENS || [];
    if (!lista.length) return null;
    const [y, m, d] = hojeISO().split('-').map(Number);
    const dias = Math.floor(Date.UTC(y, m - 1, d) / 86400000);
    return lista[(dias + deslocamento) % lista.length];
  }
  const htmlVersiculo = (v) => `<p style="font-size:1.05rem;line-height:1.5;margin:8px 0;font-style:italic">“${esc(v.texto)}”</p><p><b>${esc(v.ref)}</b></p>`;

  async function telaDevocional() {
    const hoje = hojeISO();
    const admin = me.role === 'admin';
    const [passados, futuros] = await Promise.all([
      sb.from('devocionais').select('*').lte('data', hoje).order('data', { ascending: false }).limit(8).then(ok).catch(() => []),
      admin ? sb.from('devocionais').select('*').gt('data', hoje).order('data').limit(20).then(ok).catch(() => []) : Promise.resolve([])
    ]);
    const doLider = passados.find((x) => x.data === hoje);
    const auto = mensagemDoDia(Math.floor((window.MENSAGENS || []).length / 2));
    const hojeHtml = doLider
      ? `<div class="card" style="border-left:4px solid var(--gold)"><div class="muted">📖 Devocional de hoje · ${fmtData(doLider.data)}</div><h3 style="margin:6px 0">${esc(doLider.titulo)}</h3>${doLider.referencia ? `<p><b>${esc(doLider.referencia)}</b></p>` : ''}<p style="white-space:pre-wrap">${esc(doLider.texto)}</p></div>`
      : auto
        ? `<div class="card" style="border-left:4px solid var(--gold)"><div class="muted">📖 Devocional de hoje · ${fmtData(hoje)}</div>${htmlVersiculo(auto)}<p style="white-space:pre-wrap"><b>Para refletir:</b> ${esc(auto.reflexao)}</p><p class="muted">Termine com uma oração: agradeça, entregue o seu dia e peça direção.</p></div>`
        : '<div class="card empty">Sem devocional hoje.</div>';
    const anteriores = passados.filter((x) => x.data !== hoje);
    const formLider = admin ? `
      <h2>Escrever ou agendar devocional</h2>
      <div class="card">
        <form id="f-devocional" class="stack">
          <label>Data<input type="date" name="data" value="${hoje}" min="${hoje}" required></label>
          <label>Título<input name="titulo" maxlength="80" required></label>
          <label>Versículo (opcional)<input name="referencia" maxlength="60" placeholder="Ex.: Salmos 23:1"></label>
          <label>Texto<textarea name="texto" required></textarea></label>
          <p class="muted">Se já existir um devocional nessa data, ele será substituído. Nos dias sem devocional seu, o app mostra um automático.</p>
          <button class="btn primary" type="submit">Salvar devocional</button>
        </form>
      </div>
      ${futuros.length ? `<h2>Agendados</h2>${futuros.map((x) => `<div class="card"><div class="row between"><div><b>${fmtData(x.data)}</b> · ${esc(x.titulo)}</div><button class="btn small bad" data-act="excluirDevocional" data-id="${x.id}">Apagar</button></div></div>`).join('')}` : ''}` : '';
    $('#content').innerHTML = `${hojeHtml}${formLider}${anteriores.length ? `<h2>Anteriores</h2>${anteriores.map((x) => `<div class="card"><div class="muted">${fmtData(x.data)}</div><b>${esc(x.titulo)}</b>${x.referencia ? `<p><b>${esc(x.referencia)}</b></p>` : ''}<p style="white-space:pre-wrap">${esc(x.texto)}</p></div>`).join('')}` : ''}`;
  }

  // ---------- pedidos de oração ----------
  async function telaOracao() {
    await carregarPerfis();
    const [pedidos, oras] = await Promise.all([
      sb.from('pedidos_oracao').select('*').order('created_at', { ascending: false }).limit(60).then(ok),
      sb.from('oracoes').select('pedido_id,membro_id').then(ok)
    ]);
    const cont = {}; const meus = new Set();
    oras.forEach((o) => { cont[o.pedido_id] = (cont[o.pedido_id] || 0) + 1; if (o.membro_id === me.id) meus.add(o.pedido_id); });
    $('#content').innerHTML = `
      <div class="card">
        <h3>🙏 Pedir oração à equipe</h3>
        <form id="f-oracao" class="stack" style="margin-top:8px">
          <label>Seu pedido<textarea id="texto-oracao" name="texto" required maxlength="500" placeholder="Compartilhe o que está no seu coração…"></textarea><span class="muted" id="oracao-cont">0 / 500</span></label>
          <div class="checks">
            <label><input type="checkbox" name="privado"> Só os líderes podem ver</label>
            <label><input type="checkbox" name="equipe"> Avisar a equipe no celular</label>
          </div>
          <button class="btn primary" type="submit">Publicar pedido</button>
        </form>
      </div>
      ${pedidos.length ? pedidos.map((p) => `
        <div class="card">
          <div class="row" style="flex-wrap:nowrap">${avatar(state.profiles[p.autor_id], 36)}
            <div class="grow"><b>${esc(nome(p.autor_id))}</b><br><span class="muted">${fmtDataHora(p.created_at)}${p.privado ? ' · 🔒 só líderes' : ''}</span></div>
          </div>
          <p style="white-space:pre-wrap">${esc(p.texto)}</p>
          <div class="row">
            <button class="btn small ${meus.has(p.id) ? 'ok' : ''}" data-act="orar" data-id="${p.id}" data-on="${meus.has(p.id) ? 1 : 0}">🙏 ${meus.has(p.id) ? 'Orei' : 'Vou orar'}${cont[p.id] ? ` · ${cont[p.id]}` : ''}</button>
            ${p.autor_id === me.id || me.role === 'admin' ? `<button class="btn small bad" data-act="excluirPedido" data-id="${p.id}">Apagar</button>` : ''}
          </div>
        </div>`).join('') : '<div class="card empty">Nenhum pedido ainda.</div>'}`;
  }

  // ---------- relatório (só líderes) ----------
  async function telaRelatorio() {
    await carregarPerfis();
    const anoAtual = new Date().getFullYear();
    const ano = state.relAno || String(anoAtual);
    const mes = state.relMes || '';
    const ini = mes ? `${ano}-${mes}-01` : `${ano}-01-01`;
    const fim = mes ? limitesMes(`${ano}-${mes}`)[1] : `${ano}-12-31`;
    const hoje = hojeISO();
    const [escs, trocas, inds] = await Promise.all([
      sb.from('escalas').select('membro_id,funcao,status,eventos!inner(data)').gte('eventos.data', ini).lte('eventos.data', fim).then(ok),
      sb.from('trocas').select('solicitante_id,status').gte('created_at', `${ini}T00:00:00-03:00`).lte('created_at', `${fim}T23:59:59-03:00`).then(ok),
      sb.from('indisponibilidades').select('membro_id').gte('data', ini).lte('data', fim).then(ok)
    ]);
    const novo = () => ({ serv: 0, agend: 0, foto: 0, proj: 0, conf: 0, sem: 0, tp: 0, tr: 0, ind: 0, ultima: '' });
    const L = {};
    Object.values(state.profiles).filter((p) => p.status === 'ativo').forEach((p) => { L[p.id] = novo(); });
    escs.forEach((s) => {
      const r = L[s.membro_id]; if (!r || s.status === 'recusado') return;
      if (s.eventos.data <= hoje) { r.serv++; if (s.eventos.data > r.ultima) r.ultima = s.eventos.data; } else r.agend++;
      if (s.funcao === 'fotografia') r.foto++; else r.proj++;
      if (s.status === 'confirmado') r.conf++; else r.sem++;
    });
    trocas.forEach((t) => { const r = L[t.solicitante_id]; if (!r) return; r.tp++; if (t.status === 'aprovada') r.tr++; });
    inds.forEach((i) => { const r = L[i.membro_id]; if (r) r.ind++; });
    const linhas = Object.entries(L).map(([id, r]) => ({ id, nome: nome(id), ...r }))
      .sort((x, y) => (y.serv + y.agend) - (x.serv + x.agend) || x.nome.localeCompare(y.nome));
    const soma = (k) => linhas.reduce((t, r) => t + r[k], 0);
    const periodo = mes ? `${ano}-${mes}` : ano;
    const nomeMes = (m) => new Date(2000, Number(m) - 1, 1).toLocaleDateString('pt-BR', { month: 'long' });
    const cab = ['Nome', 'Servidas', 'Agendadas', 'Fotografia', 'Projetor', 'Confirmou', 'Sem resposta', 'Trocas pedidas', 'Trocas realizadas', 'Indisponibilidades', 'Última escala'];
    const linhasCsv = linhas.map((r) => [r.nome, r.serv, r.agend, r.foto, r.proj, r.conf, r.sem, r.tp, r.tr, r.ind, r.ultima ? fmtData(r.ultima) : '']);
    state.relDados = { cab, linhas: linhasCsv, periodo };
    $('#content').innerHTML = `
      <div class="card">
        <div class="row between">
          <h3>📊 Relatório de escalas · ${mes ? esc(nomeMes(mes)) + ' de ' : ''}${ano}</h3>
          <div class="row no-print">
            <select data-chg="relAno" style="width:auto">${[anoAtual - 1, anoAtual, anoAtual + 1].map((y) => `<option value="${y}" ${String(y) === ano ? 'selected' : ''}>${y}</option>`).join('')}</select>
            <select data-chg="relMes" style="width:auto"><option value="">Ano todo</option>${Array.from({ length: 12 }, (_, i) => pad(i + 1)).map((m) => `<option value="${m}" ${m === mes ? 'selected' : ''}>${nomeMes(m)}</option>`).join('')}</select>
          </div>
        </div>
        <p class="muted">Servidas: escalas até hoje · Agendadas: escalas futuras · Sem resposta: ainda não confirmou. Só líderes veem este relatório.</p>
        <div class="row no-print" style="margin-top:6px"><button class="btn small" data-act="exportarRelatorio">Baixar planilha (CSV)</button><button class="btn small" data-act="imprimir">Imprimir / PDF</button></div>
      </div>
      <div class="tabela-wrap"><table class="tb">
        <thead><tr>${cab.map((c) => `<th>${c}</th>`).join('')}</tr></thead>
        <tbody>${linhasCsv.map((r) => `<tr>${r.map((c, i) => `<td${i ? ' style="text-align:center"' : ''}>${esc(c)}</td>`).join('')}</tr>`).join('')}
        <tr style="font-weight:700"><td>Total</td>${['serv', 'agend', 'foto', 'proj', 'conf', 'sem', 'tp', 'tr', 'ind'].map((k) => `<td style="text-align:center">${soma(k)}</td>`).join('')}<td></td></tr></tbody>
      </table></div>`;
  }

  function htmlAviso(a) {
    return `<div class="card aviso ${a.fixo ? 'fixo' : ''}">
      <div class="row between"><b>${a.fixo ? '📌 ' : ''}${esc(a.titulo)}</b><span class="muted">${fmtDataHora(a.created_at)}</span></div>
      ${a.destinatario_id ? `<span class="badge warn">${a.destinatario_id === me.id ? 'Só para você' : 'Para: ' + esc(nome(a.destinatario_id))}</span>` : ''}
      <p style="white-space:pre-wrap">${esc(a.texto)}</p>
      ${me.role === 'admin' ? `<button class="btn small bad" data-act="excluirAviso" data-id="${a.id}">Apagar</button>` : ''}
    </div>`;
  }

  async function telaEscalas() {
    const ym = state.escalasMes || mesAtual();
    state.escalasMes = ym;
    const visao = state.visao || 'data';
    const [ini, fim] = limitesMes(ym);
    const eventos = ok(await sb.from('eventos').select('*').gte('data', ini).lte('data', fim).order('data'));
    const escalas = eventos.length ? ok(await sb.from('escalas').select('*').in('evento_id', eventos.map((e) => e.id))) : [];
    state.dadosEscala = { ym, eventos, escalas };
    const admin = me.role === 'admin';
    const nConf = escalas.filter((s) => s.status === 'confirmado').length;
    const nRec = escalas.filter((s) => s.status === 'recusado').length;
    const nPend = escalas.length - nConf - nRec;
    const simbolo = (s) => (s === 'confirmado' ? '✓' : s === 'recusado' ? '✗' : '⏳');
    const classe = (s) => (s === 'confirmado' ? 'ok' : s === 'recusado' ? 'bad' : '');

    const topo = `
      <div class="card no-print">
        <label>Mês<input type="month" value="${ym}" data-chg="mesEscalas"></label>
        <div class="seg" style="margin:12px 0 8px">
          <button type="button" class="seg-btn ${visao === 'data' ? 'active' : ''}" data-act="visao" data-v="data">Por data</button>
          <button type="button" class="seg-btn ${visao === 'pessoa' ? 'active' : ''}" data-act="visao" data-v="pessoa">Por pessoa</button>
        </div>
        <p class="muted">✓ confirmou · ⏳ ainda não respondeu · ✗ não pode</p>
        ${escalas.length ? `<div class="row" style="margin-top:6px"><span class="badge ok">${nConf} confirmados</span><span class="badge warn">${nPend} sem resposta</span><span class="badge bad">${nRec} não podem</span></div>` : ''}
        ${eventos.length ? `<div class="row" style="margin-top:10px"><button class="btn small" data-act="copiarEscala">Copiar para WhatsApp</button><button class="btn small" data-act="imprimir">Imprimir / PDF</button>${admin ? '<button class="btn small bad" data-act="limparMes">Limpar escala do mês</button><button class="btn small bad" data-act="apagarMes">Apagar mês inteiro</button>' : ''}</div>` : ''}
      </div>`;

    if (!eventos.length) {
      $('#content').innerHTML = topo + `<div class="card empty">Nenhum culto cadastrado neste mês.${admin ? ' Use a aba "Gerar escala".' : ''}</div>`;
      return;
    }

    let tabela = '';
    let dica = '';
    if (visao === 'data') {
      const chip = (s) => `<span class="chip ${classe(s.status)} ${s.membro_id === me.id ? 'eu' : ''}" title="${esc(s.status)}">${simbolo(s.status)} ${esc(nome(s.membro_id))}${admin && s.status !== 'confirmado' ? `<button class="no-print" data-act="confirmarPor" data-id="${s.id}" aria-label="Confirmar pela pessoa" title="Confirmar presença pela pessoa">✓</button>` : ''}${admin ? `<button class="no-print" data-act="rmEscala" data-id="${s.id}" aria-label="Remover">×</button>` : ''}</span>`;
      const celula = (ev, fn) => {
        const doEv = escalas.filter((s) => s.evento_id === ev.id && s.funcao === fn);
        const vagas = fn === 'fotografia' ? ev.vagas_foto : ev.vagas_proj;
        const falta = vagas - doEv.filter((s) => s.status !== 'recusado').length;
        const candidatos = Object.values(state.profiles).filter((p) => p.status === 'ativo' && p[fn] && !doEv.some((s) => s.membro_id === p.id));
        return `<td>${doEv.map(chip).join('')}
          ${falta > 0 ? `<span class="badge warn">${doEv.length ? 'falta ' + falta : 'vazio'}</span>` : ''}
          ${admin && falta > 0 ? `<button class="btn small no-print" data-act="sugerir" data-ev="${ev.id}" data-func="${fn}">Sugerir</button>` : ''}
          ${admin ? `<select class="mini no-print" data-chg="addEscala" data-ev="${ev.id}" data-func="${fn}" aria-label="Adicionar pessoa"><option value="">＋</option>${candidatos.map((p) => `<option value="${p.id}">${esc(p.nome)}</option>`).join('')}</select>` : ''}</td>`;
      };
      tabela = `<div class="tabela-wrap"><table class="tb">
        <thead><tr><th>Data</th><th>Fotografia</th><th>Projetor</th></tr></thead>
        <tbody>${eventos.map((ev) => `<tr><td class="data"><b>${fmtData(ev.data)}</b><br><span class="muted">${esc(ev.titulo)}</span>${admin ? `<br><button class="btn small no-print" data-act="limparCulto" data-id="${ev.id}">Limpar</button>` : ''}</td>${celula(ev, 'fotografia')}${celula(ev, 'projetor')}</tr>`).join('')}</tbody>
      </table></div>`;
      dica = admin ? '<p class="muted no-print">Toque no <b>＋</b> para colocar alguém e no <b>×</b> para tirar.</p>' : '';
    } else {
      const pessoas = Object.values(state.profiles)
        .filter((p) => p.status === 'ativo' && (p.fotografia || p.projetor))
        .sort((a, b) => a.nome.localeCompare(b.nome));
      tabela = `<div class="tabela-wrap"><table class="tb mx">
        <thead><tr><th>Pessoa</th>${eventos.map((ev) => { const d = parseISO(ev.data); return `<th>${DIAS[d.getDay()]}<br>${pad(d.getDate())}/${pad(d.getMonth() + 1)}</th>`; }).join('')}<th>Total</th></tr></thead>
        <tbody>${pessoas.map((p) => {
          const total = escalas.filter((s) => s.membro_id === p.id && s.status !== 'recusado').length;
          const cels = eventos.map((ev) => {
            const dela = escalas.filter((s) => s.evento_id === ev.id && s.membro_id === p.id);
            if (!dela.length) return '<td class="vazio">·</td>';
            return `<td class="${classe(dela[0].status)}">${dela.map((s) => `${simbolo(s.status)}${s.funcao === 'fotografia' ? 'F' : 'P'}`).join(' ')}</td>`;
          }).join('');
          return `<tr class="${p.id === me.id ? 'eu' : ''}"><td class="nome">${esc(p.nome)}</td>${cels}<td><b>${total}</b></td></tr>`;
        }).join('')}</tbody>
      </table></div>`;
      dica = '<p class="muted">F = Fotografia · P = Projetor · “·” = folga. Para ajustar alguém, use a visão “Por data”.</p>';
    }
    $('#content').innerHTML = topo + `<div class="card" style="padding:0;overflow:hidden">${tabela}</div>` + dica;
  }

  async function telaDisponib() {
    const hoje = hojeISO();
    const minhas = ok(await sb.from('indisponibilidades').select('data').eq('membro_id', me.id).gte('data', hoje).order('data'));
    const cultos = ok(await sb.from('eventos').select('data,titulo').gte('data', hoje).order('data').limit(12));
    const marcadas = new Set(minhas.map((m) => m.data));
    $('#content').innerHTML = `
      <div class="card">
        <h3>Dias em que NÃO posso servir</h3>
        <p class="muted">O sistema não vai te escalar nessas datas. Marque com antecedência, antes do líder gerar a escala do mês.</p>
        <form id="f-indisp" class="row">
          <input class="grow" type="date" name="data" min="${hoje}" required>
          <button class="btn primary" type="submit">Marcar</button>
        </form>
      </div>
      <h2>Datas que marquei</h2>
      ${minhas.length ? minhas.map((m) => `<div class="card row between"><b>${fmtData(m.data)}</b><button class="btn small" data-act="removerIndisp" data-data="${m.data}">Remover</button></div>`).join('') : '<div class="card empty">Nenhuma data marcada.</div>'}
      <h2>Próximos cultos cadastrados</h2>
      ${cultos.length ? cultos.map((c) => `<div class="card row between"><span><b>${fmtData(c.data)}</b> · ${esc(c.titulo)}</span>${marcadas.has(c.data) ? '<span class="badge bad">Indisponível</span>' : `<form id="f-indisp" class="row"><input type="hidden" name="data" value="${c.data}"><button class="btn small" type="submit">Não posso</button></form>`}</div>`).join('') : '<div class="card empty">Ainda não há cultos cadastrados.</div>'}`;
    // ids duplicados de formulário: o handler usa o id, então funciona para todos
  }

  async function telaAvisos() {
    const lista = ok(await sb.from('avisos').select('*').order('fixo', { ascending: false }).order('created_at', { ascending: false }).limit(50));
    $('#content').innerHTML = `
      ${me.role === 'admin' ? `
      <div class="card">
        <h3>Novo aviso</h3>
        <form id="f-aviso" class="stack" style="margin-top:8px">
          <label>Enviar para
            <select name="destino">
              <option value="">Toda a equipe</option>
              ${Object.values(state.profiles).filter((p) => p.status === 'ativo' && p.id !== me.id).sort((x, y) => x.nome.localeCompare(y.nome)).map((p) => `<option value="${p.id}">${esc(p.nome)} (só essa pessoa)</option>`).join('')}
            </select>
          </label>
          <label>Título<input name="titulo" required maxlength="80"></label>
          <label>Mensagem<textarea name="texto" required></textarea></label>
          <div class="checks"><label><input type="checkbox" name="fixo"> Fixar no topo</label><label><input type="checkbox" name="notificar" checked> Avisar no celular</label></div>
          <button class="btn primary" type="submit">Publicar</button>
        </form>
      </div>` : ''}
      ${lista.length ? lista.map(htmlAviso).join('') : '<div class="card empty">Nenhum aviso ainda.</div>'}`;
  }

  // ---------- telas do administrador ----------
  async function telaMembros() {
    await carregarPerfis();
    const ano = new Date().getFullYear();
    const linhas = ok(await sb.from('escalas').select('membro_id,eventos!inner(data)').neq('status', 'recusado')
      .gte('eventos.data', `${ano}-01-01`).lte('eventos.data', hojeISO()));
    const cont = {};
    linhas.forEach((l) => (cont[l.membro_id] = (cont[l.membro_id] || 0) + 1));
    const acessos = await carregarAcessos();
    const historico = await sb.from('auditoria').select('*').order('created_at', { ascending: false }).limit(25).then(ok).catch(() => []);
    const modo = state.membrosOrdem || 'status';
    const ordem = { pendente: 0, ativo: 1, bloqueado: 2 };
    const visto = (p) => (acessos[p.id] ? new Date(acessos[p.id]).getTime() : 0);
    const dias = (p) => (acessos[p.id] ? (Date.now() - visto(p)) / 86400000 : Infinity);
    const lista = Object.values(state.profiles).sort((a, b) =>
      modo === 'sumidos' ? visto(a) - visto(b) || a.nome.localeCompare(b.nome)
        : modo === 'nome' ? a.nome.localeCompare(b.nome)
          : ordem[a.status] - ordem[b.status] || a.nome.localeCompare(b.nome));
    const sumidos = lista.filter((p) => p.status === 'ativo' && dias(p) >= 7).length;
    const pend = lista.filter((p) => p.status === 'pendente').length;

    $('#content').innerHTML = `
      <div class="card"><b>${lista.length}</b> cadastrados · <b>${pend}</b> aguardando aprovação · <b>${sumidos}</b> sem entrar há 7+ dias
      <label style="margin-top:10px">Ordenar por
        <select data-chg="ordemMembros">
          <option value="status" ${modo === 'status' ? 'selected' : ''}>Situação (pendentes primeiro)</option>
          <option value="sumidos" ${modo === 'sumidos' ? 'selected' : ''}>Quem está há mais tempo sem entrar</option>
          <option value="nome" ${modo === 'nome' ? 'selected' : ''}>Nome (A a Z)</option>
        </select></label>
      <p class="muted">Para adicionar alguém: peça que a pessoa abra o app e use "Primeiro acesso". Depois é só aprovar aqui e marcar o grupo.</p>
      <button class="btn small" data-act="exportarMembros">Baixar lista de membros (CSV)</button></div>
      ${lista.map((p) => `
        <div class="card">
          <div class="row between">
            <div><b>${esc(p.nome)}</b> ${p.role === 'admin' ? '<span class="badge">Líder</span>' : ''}<br>
              <span class="muted">${esc(p.email || '')}${p.telefone ? ' · ' + esc(p.telefone) : ''}</span></div>
            ${p.status === 'ativo' ? '<span class="badge ok">Ativo</span>' : p.status === 'pendente' ? '<span class="badge warn">Pendente</span>' : '<span class="badge bad">Bloqueado</span>'}
          </div>
          <div class="checks" style="margin:10px 0 6px">
            <label><input type="checkbox" data-chg="grupo" data-campo="fotografia" data-id="${p.id}" ${p.fotografia ? 'checked' : ''}> Fotografia</label>
            <label><input type="checkbox" data-chg="grupo" data-campo="projetor" data-id="${p.id}" ${p.projetor ? 'checked' : ''}> Projetor</label>
          </div>
          <p class="muted">Escalas em ${ano}: <b>${cont[p.id] || 0}</b>${p.nascimento ? ` · 🎂 ${p.nascimento.slice(8)}/${p.nascimento.slice(5, 7)}` : ''}</p>
          <p class="muted">Último acesso: <span class="badge ${dias(p) === Infinity ? 'warn' : dias(p) >= 7 ? 'bad' : dias(p) >= 3 ? 'warn' : 'ok'}">${tempoAtras(acessos[p.id])}</span></p>
          ${p.id === me.id ? '<p class="muted">Esta é a sua conta. Para mudar nome, foto ou senha, use a aba Meu perfil.</p>' : `
          <div class="row" style="margin-bottom:6px">
            <button class="btn small" data-act="editarMembro" data-id="${p.id}">Editar dados</button>
            <button class="btn small" data-act="senhaMembro" data-id="${p.id}">Trocar senha</button>
            <button class="btn small" data-act="emailMembro" data-id="${p.id}">Alterar e-mail</button>
          </div>
          <div class="row">
            ${p.status !== 'ativo' ? `<button class="btn small ok" data-act="setStatus" data-status="ativo" data-id="${p.id}">${p.status === 'pendente' ? 'Aprovar' : 'Desbloquear'}</button>` : ''}
            ${p.status === 'ativo' ? `<button class="btn small" data-act="setStatus" data-status="bloqueado" data-id="${p.id}">Bloquear</button>` : ''}
            <button class="btn small" data-act="tornarAdmin" data-role="${p.role === 'admin' ? 'membro' : 'admin'}" data-id="${p.id}">${p.role === 'admin' ? 'Tirar de líder' : 'Tornar líder'}</button>
            <button class="btn small bad" data-act="remover" data-id="${p.id}">Remover</button>
          </div>`}
        </div>`).join('')}
      <h2>Histórico de ações dos líderes</h2>
      <div class="card">${historico.length ? historico.map((h) => `<p style="margin:6px 0"><span class="muted">${new Date(h.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span> · <b>${esc(h.ator_id ? nome(h.ator_id) : 'líder removido')}</b> ${esc(h.acao)}${h.alvo_nome ? ' <b>' + esc(h.alvo_nome) + '</b>' : ''}${h.detalhe ? ' (' + esc(h.detalhe) + ')' : ''}</p>`).join('') : '<span class="muted">Nada registrado ainda.</span>'}</div>`;
  }

  async function telaIndisp() {
    await carregarPerfis();
    const ym = state.indispMes || mesAtual();
    state.indispMes = ym;
    const [ini, fim] = limitesMes(ym);
    const lista = ok(await sb.from('indisponibilidades').select('*').gte('data', ini).lte('data', fim).order('data'));
    const porMembro = {};
    lista.forEach((i) => { (porMembro[i.membro_id] ||= []).push(i.data); });
    const ativos = Object.values(state.profiles).filter((p) => p.status === 'ativo' && (p.fotografia || p.projetor));
    const com = ativos.filter((p) => porMembro[p.id]);
    const sem = ativos.filter((p) => !porMembro[p.id]);
    $('#content').innerHTML = `
      <div class="card"><label>Mês<input type="month" value="${ym}" data-chg="mesIndisp"></label>
        <p class="muted" style="margin-top:8px">Datas em que cada pessoa marcou que NÃO pode servir. O sorteio já respeita isso.</p></div>
      <div class="card">
        <h3>Marcar indisponibilidade para alguém</h3>
        <form id="f-indisp-lider" class="row" style="margin-top:8px">
          <select name="membro" class="grow" required><option value="">Pessoa…</option>${ativos.map((p) => `<option value="${p.id}">${esc(p.nome)}</option>`).join('')}</select>
          <input class="grow" type="date" name="data" required>
          <button class="btn primary" type="submit">Marcar</button>
        </form>
      </div>
      <h2>Marcaram indisponibilidade (${com.length})</h2>
      ${com.length ? com.map((p) => `<div class="card"><b>${esc(p.nome)}</b><br>${porMembro[p.id].map((d) => `<span class="chip">${fmtData(d)}<button data-act="removerIndispDe" data-m="${p.id}" data-data="${d}" aria-label="Remover">×</button></span>`).join('')}</div>`).join('') : '<div class="card empty">Ninguém marcou datas neste mês.</div>'}
      <h2>Sem datas marcadas (${sem.length})</h2>
      <div class="card">${sem.length ? sem.map((p) => `<span class="chip" style="padding-right:12px">${esc(p.nome)}</span>`).join('') : '<span class="muted">Todos marcaram alguma data.</span>'}
        <p class="muted" style="margin-top:8px">Quem aparece aqui está disponível em todos os dias, ou ainda não preencheu.</p></div>`;
  }

  async function telaTrocas() {
    const lista = ok(await sb.from('trocas').select('*').eq('status', 'pendente').order('created_at'));
    const escalaIds = lista.map((t) => t.escala_id);
    const escalas = escalaIds.length ? ok(await sb.from('escalas').select('id,funcao,eventos!inner(data,titulo)').in('id', escalaIds)) : [];
    const porId = Object.fromEntries(escalas.map((e) => [e.id, e]));
    $('#content').innerHTML = lista.length ? lista.map((t) => {
      const e = porId[t.escala_id];
      return `<div class="card">
        <b>${esc(nome(t.solicitante_id))}</b> quer trocar com <b>${esc(nome(t.destino_id))}</b> <span class="badge warn">aguardando ${esc(nome(t.destino_id).split(' ')[0])} aceitar</span><br>
        <span class="muted">${e ? `${fmtData(e.eventos.data)} · ${esc(e.eventos.titulo)} · ${NOME_FUNCAO[e.funcao]}` : ''}</span>
        <p style="white-space:pre-wrap;margin:8px 0 0"><b>Motivo:</b> ${esc(t.motivo || '—')}</p>
        <div class="row" style="margin-top:10px">
          <button class="btn small ok" data-act="aprovarTroca" data-id="${t.id}">Forçar troca</button>
          <button class="btn small" data-act="recusarTroca" data-id="${t.id}">Cancelar pedido</button>
        </div></div>`;
    }).join('') : '<div class="card empty">Nenhum pedido de troca pendente. 🙌</div>';
  }

  // ---------- gerador de escala ----------
  async function telaGerar() {
    const ym = state.gerarMes || mesAtual();
    state.gerarMes = ym;
    const [ini, fim] = limitesMes(ym);
    const eventos = ok(await sb.from('eventos').select('*').gte('data', ini).lte('data', fim).order('data'));
    const comEscala = eventos.length ? ok(await sb.from('escalas').select('evento_id').in('evento_id', eventos.map((e) => e.id))) : [];
    state.jaTemEscala = comEscala.length > 0;
    const ativos = Object.values(state.profiles).filter((p) => p.status === 'ativo');
    const nFoto = ativos.filter((p) => p.fotografia).length;
    const nProj = ativos.filter((p) => p.projetor).length;

    $('#content').innerHTML = `
      <div class="card">
        <label>Mês da escala<input type="month" value="${ym}" data-chg="mesGerar"></label>
        <p class="muted">Ativos: ${nFoto} na fotografia · ${nProj} no projetor</p>
      </div>

      <div class="card">
        <h3>1) Cultos do mês</h3>
        <form id="f-lote" class="stack" style="margin-top:8px">
          <div class="checks">${DIAS.map((d, i) => `<label><input type="checkbox" name="dia" value="${i}" ${i === 0 ? 'checked' : ''}> ${d}</label>`).join('')}</div>
          <div class="row">
            <label class="grow">Nome do culto<input name="titulo" value="Culto"></label>
            <label class="grow">Vagas foto (padrão)<input type="number" name="vagas_foto" min="0" max="10" value="1"></label>
            <label class="grow">Vagas projetor (padrão)<input type="number" name="vagas_proj" min="0" max="10" value="1"></label>
          </div>
          <p class="hint">Esses números valem para todos os cultos criados agora. Depois você muda culto por culto na lista abaixo.</p>
          <label>…ou uma data específica (ex.: evento especial)<input type="date" name="data_unica"></label>
          <button class="btn" type="submit">Criar cultos</button>
        </form>
        ${eventos.length ? `<p class="muted" style="margin-top:12px">Ajuste as vagas de cada culto abaixo (por exemplo, 1 foto em culto normal e 2 em evento). Pode ser 0.</p><div>${eventos.map((ev) => `<div style="padding:8px 0;border-top:1px solid var(--line)">
          <div class="row between"><span><b>${fmtData(ev.data)}</b> · ${esc(ev.titulo)}</span><span class="row"><button class="btn small" data-act="editarCulto" data-id="${ev.id}">Editar</button><button class="btn small" data-act="excluirEvento" data-id="${ev.id}">Apagar</button></span></div>
          <div class="row" style="margin-top:6px">
            <label class="grow">Vagas fotografia<input type="number" min="0" max="10" value="${ev.vagas_foto}" data-chg="vagas" data-campo="vagas_foto" data-id="${ev.id}"></label>
            <label class="grow">Vagas projetor<input type="number" min="0" max="10" value="${ev.vagas_proj}" data-chg="vagas" data-campo="vagas_proj" data-id="${ev.id}"></label>
          </div></div>`).join('')}</div>` : ''}
      </div>

      <div class="card">
        <h3>2) Gerar com sorteio justo</h3>
        <p class="muted">Quem foi menos escalado no ano tem prioridade, respeitando as datas de indisponibilidade e evitando repetir a pessoa em cultos seguidos.</p>
        <button class="btn primary" data-act="gerarPreview" ${eventos.length ? '' : 'disabled'}>Gerar escala</button>
      </div>
      <div id="preview"></div>`;
    if (state.preview && state.preview.ym === ym) desenharPreview();
  }

  // Rodízio: quem serviu há mais tempo entra primeiro; ninguém repete no mês enquanto houver outra pessoa disponível.
  function sortear(eventos, membros, indisp, contagem, ultimo) {
    const cnt = { ...contagem };
    const last = { ...ultimo };
    const noMes = {};
    const avisos = [];
    const resultado = {};
    for (const ev of eventos) {
      resultado[ev.id] = { fotografia: [], projetor: [] };
      const usados = new Set();
      // função com menos candidatos primeiro, para não "gastar" quem tem dois grupos
      const ordemFuncoes = [...FUNCOES].sort((x, y) => membros.filter((m) => m[x]).length - membros.filter((m) => m[y]).length);
      for (const fn of ordemFuncoes) {
        const vagas = fn === 'fotografia' ? ev.vagas_foto : ev.vagas_proj;
        for (let i = 0; i < vagas; i++) {
          const disp = membros
            .filter((m) => m[fn] && !usados.has(m.id) && !(indisp[m.id] && indisp[m.id].has(ev.data)))
            .map((m) => ({ m, n: noMes[m.id] || 0, u: last[m.id] || '', c: cnt[m.id] || 0, r: Math.random() }))
            .sort((x, y) => x.n - y.n || x.u.localeCompare(y.u) || x.c - y.c || x.r - y.r);
          if (!disp.length) { avisos.push(`${fmtData(ev.data)}: faltou gente para ${NOME_FUNCAO[fn]} (vaga ${i + 1}).`); break; }
          const escolhido = disp[0];
          if (escolhido.n >= 1) avisos.push(`${fmtData(ev.data)}: ${escolhido.m.nome} repete neste mês porque não há membros suficientes disponíveis para ${NOME_FUNCAO[fn]}.`);
          resultado[ev.id][fn].push(escolhido.m.id);
          usados.add(escolhido.m.id);
          noMes[escolhido.m.id] = escolhido.n + 1;
          last[escolhido.m.id] = ev.data;
          cnt[escolhido.m.id] = escolhido.c + 1;
        }
      }
    }
    return { resultado, avisos };
  }

  async function gerarPreview() {
    const ym = state.gerarMes;
    const ano = ym.slice(0, 4);
    const [ini, fim] = limitesMes(ym);
    const eventos = ok(await sb.from('eventos').select('*').gte('data', ini).lte('data', fim).order('data'));
    if (!eventos.length) throw new Error('Crie os cultos do mês primeiro.');
    const idsMes = new Set(eventos.map((e) => e.id));
    const ativos = Object.values(state.profiles).filter((p) => p.status === 'ativo');

    const indLista = ok(await sb.from('indisponibilidades').select('*').gte('data', ini).lte('data', fim));
    const indisp = {};
    indLista.forEach((i) => { (indisp[i.membro_id] ||= new Set()).add(i.data); });

    const ano_escalas = ok(await sb.from('escalas').select('membro_id,evento_id,eventos!inner(data)').neq('status', 'recusado')
      .gte('eventos.data', `${ano}-01-01`).lte('eventos.data', `${ano}-12-31`));
    const contagem = {};
    ano_escalas.filter((s) => !idsMes.has(s.evento_id)).forEach((s) => { contagem[s.membro_id] = (contagem[s.membro_id] || 0) + 1; });

    const antes = ok(await sb.from('escalas').select('membro_id,eventos!inner(data)').neq('status', 'recusado')
      .gte('eventos.data', `${Number(ano) - 1}-01-01`).lt('eventos.data', ini));
    const ultimo = {};
    antes.forEach((s) => { if (!ultimo[s.membro_id] || s.eventos.data > ultimo[s.membro_id]) ultimo[s.membro_id] = s.eventos.data; });

    const { resultado, avisos } = sortear(eventos, ativos, indisp, contagem, ultimo);
    state.preview = { ym, eventos, resultado, avisos };
    desenharPreview();
    $('#preview').scrollIntoView({ behavior: 'smooth' });
  }

  function desenharPreview() {
    const p = state.preview;
    $('#preview').innerHTML = `
      <div class="card">
        <h3>Prévia da escala</h3>
        ${p.avisos.map((a) => `<div class="warnbox">⚠️ ${esc(a)}</div>`).join('')}
        ${p.eventos.map((ev) => `
          <div style="padding:8px 0;border-top:1px solid var(--line)">
            <b>${fmtData(ev.data)}</b> · ${esc(ev.titulo)}
            ${FUNCOES.map((fn) => `<div class="func"><b>${NOME_FUNCAO[fn]}</b><br>${p.resultado[ev.id][fn].length ? p.resultado[ev.id][fn].map((id) => `<span class="chip" style="padding-right:12px">${esc(nome(id))}</span>`).join('') : '<span class="muted">— vazio —</span>'}</div>`).join('')}
          </div>`).join('')}
        <p class="muted">Não gostou? Clique em "Gerar escala" de novo para sortear outra combinação. Depois de salvar, dá para ajustar na aba Escalas.</p>
        <button class="btn ok" data-act="salvarEscala">Salvar esta escala</button>
      </div>`;
  }

  async function salvarEscala() {
    const p = state.preview;
    if (!p) return;
    if (state.jaTemEscala && !confirm('Já existe escala neste mês. Salvar vai SUBSTITUIR a escala atual (inclusive confirmações). Continuar?')) return;
    const ids = p.eventos.map((e) => e.id);
    ok(await sb.from('escalas').delete().in('evento_id', ids));
    registrar('salvou uma escala sorteada', null, p.ym);
    const linhas = [];
    for (const ev of p.eventos) for (const fn of FUNCOES) for (const id of p.resultado[ev.id][fn]) linhas.push({ evento_id: ev.id, funcao: fn, membro_id: id });
    if (linhas.length) ok(await sb.from('escalas').insert(linhas));
    state.preview = null;
    state.escalasMes = p.ym;
    toast('Escala salva! Os membros já podem ver e confirmar.');
    ir('escalas');
  }

  // ---------- PWA ----------
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
