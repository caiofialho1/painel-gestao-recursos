/* Fonte Supabase do painel: lê as tabelas e atualiza em tempo real (Realtime). Somente leitura. */
'use strict';
window.SupabaseSource = (() => {
  const C = window.KW_SUPABASE || {};
  let client = null, channel = null, timer = null, busy = false, again = false;
  const signed = new Map();
  const enabled = () => !!(C.url && C.anonKey && window.supabase);
  const s = v => (v === null || v === undefined ? '' : String(v));

  // Indicador de sincronização do banco (Supabase).
  const st = { logged: false, live: false, error: '', lastRead: null };
  const fmt = d => new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  function ago(d) {
    const m = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60000));
    if (m < 1) return 'agora'; if (m < 60) return 'há ' + m + ' min';
    if (m < 1440) return 'há ' + Math.floor(m / 60) + ' h'; return 'há ' + Math.floor(m / 1440) + ' d';
  }
  function chip(id, state, text, title) { const el = $(id); if (!el) return; el.dataset.s = state; el.textContent = text; el.title = title || ''; }
  function renderSync() {
    const bar = $('syncBar'); if (!bar) return; bar.hidden = false;
    if (!st.logged) chip('syncDb', 'off', 'Banco de dados: aguardando login', 'Entre com seu e-mail @kwbrasil.com.br.');
    else if (st.error) chip('syncDb', 'err', 'Banco de dados: falha na leitura', st.error);
    else if (!st.lastRead) chip('syncDb', 'warn', 'Banco de dados: lendo…');
    else if (st.live) chip('syncDb', 'ok', 'Banco de dados: ao vivo · lido ' + fmt(st.lastRead), 'Alterações chegam automaticamente (Realtime).');
    else chip('syncDb', 'warn', 'Banco de dados: leitura a cada 30 s · lido ' + fmt(st.lastRead), 'Tempo real indisponível; o painel consulta o banco periodicamente.');
  }
  setInterval(renderSync, 30000);

  async function all(table, order) {
    const rows = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await client.from(table).select('*').order(order).range(from, from + 999);
      if (error) throw Error(table + ': ' + error.message);
      rows.push(...data); if (data.length < 1000) break;
    }
    return rows;
  }
  const equip = r => ({
    TAG: s(r.tag), Obra: s(r.obra), CR: s(r.cr), Grupo: s(r.grupo), Tipo: s(r.tipo), Modelo: s(r.modelo), Vinculo: s(r.vinculo), Situacao: s(r.situacao),
    Quantidade: s(r.quantidade), Unidade: s(r.unidade), Conservacao: s(r.conservacao), CustoNF: s(r.custo_nf), Local: s(r.local_txt), Observacao: s(r.observacao),
    Gestor: s(r.gestor), EmailGestor: s(r.email_gestor), Gerente: s(r.gerente), EmailGerente: s(r.email_gerente),
    CriadoPor: s(r.criado_por), CriadoEm: s(r.criado_em), AtualizadoPor: s(r.atualizado_por), AtualizadoEm: s(r.atualizado_em),
    Latitude: s(r.latitude), Longitude: s(r.longitude),
    'Foto1 [image]': s(r.fotos?.[0]), 'Foto2 [image]': s(r.fotos?.[1]), 'Foto3 [image]': s(r.fotos?.[2]), 'Foto4 [image]': s(r.fotos?.[3])
  });
  async function load() {
    if (busy) { again = true; return; }
    busy = true;
    try {
      const [eq, ob, ge] = await Promise.all([all('equipamentos', 'criado_em'), all('obras', 'cr'), all('gestores', 'nome')]);
      const tables = {
        Equipamentos: eq.map(equip),
        Obras: ob.map(o => ({ Obra: s(o.obra), CR: s(o.cr), UF: s(o.uf), Gestor: s(o.gestor), EmailGestor: s(o.email_gestor), Gerente: s(o.gerente), EmailGerente: s(o.email_gerente) })),
        Gestores: ge.map(g => ({ Nome: s(g.nome), Email: s(g.email), Admin: g.admin ? 'Sim' : 'Não' }))
      };
      await dadosFixos();
      AppSource.applyTables(tables, 'Supabase · tempo real');
      st.error = ''; st.lastRead = new Date(); renderSync();
    } catch (e) {
      st.error = e.message; renderSync();
      $('connection').textContent = 'Falha ao ler o Supabase: ' + e.message;
    } finally { busy = false; if (again) { again = false; load(); } }
  }
  // PEX e fotos dos coordenadores: lidos do banco (atrás do login) quando não há arquivos locais.
  let fixosOk = false;
  async function dadosFixos() {
    if (fixosOk) return;
    try {
      const { data, error } = await client.from('painel_dados').select('chave,valor');
      if (error || !data) return;
      const d = Object.fromEntries(data.map(r => [r.chave, r.valor]));
      if (!window.KW_PEX && d.pex) window.KW_PEX = d.pex;
      if (!window.KW_FOTOS_COORD && d.fotos_coord) {
        const urls = new Map(), map = {};
        for (const p of new Set(Object.values(d.fotos_coord))) urls.set(p, await photoUrl(p));
        for (const [k, p] of Object.entries(d.fotos_coord)) if (urls.get(p)) map[k] = urls.get(p);
        window.KW_FOTOS_COORD = map;
      }
      fixosOk = !!(window.KW_PEX);
    } catch (e) { console.warn('Dados fixos do painel indisponíveis:', e.message); }
  }
  const soon = () => { clearTimeout(timer); timer = setTimeout(load, 400); };
  setInterval(() => { if (client && !$('connection').dataset.live) load(); }, 30000);   // reserva: sem Realtime, lê a cada 30 s   // agrupa rajadas de alterações

  async function subscribe() {
    if (channel) return;
    channel = client.channel('inventario-painel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'equipamentos' }, soon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'obras' }, soon)
      .subscribe(status => {
        const el = $('connection');
        if (status === 'SUBSCRIBED') { el.dataset.live = '1'; st.live = true; }
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') { el.dataset.live = ''; st.live = false; }
        renderSync();
      });
  }
  async function session() { return (await client.auth.getSession()).data.session; }
  async function start() {
    if (!enabled()) return false;
    client = client || window.supabase.createClient(C.url, C.anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    client.auth.onAuthStateChange((ev, sess) => { st.logged = !!sess; renderSync(); if (sess) { subscribe(); soon(); } });
    $('connect').hidden = true; $('connectGraph').hidden = true; $('connectSb').hidden = false;
    renderSync();
    if (await session()) { st.logged = true; $('connectSb').textContent = 'Sair'; renderSync(); await subscribe(); await load(); }
    else $('connection').textContent = 'Entre com seu e-mail @kwbrasil.com.br para ler o banco em tempo real.';
    return true;
  }
  async function sendLink(email) {
    if (!/^[^@\s]+@kwbrasil\.com\.br$/i.test(email)) throw Error('Use seu e-mail @kwbrasil.com.br.');
    const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
    if (error) {
      const m = error.message || '';
      if (error.status === 429 || /rate limit/i.test(m)) throw Error('Limite de e-mails atingido. Aguarde cerca de 1 hora e peça um único link (cada pedido conta). Se persistir, avise o administrador.');
      if (/signups? not allowed|not allowed/i.test(m)) throw Error('Este e-mail não tem acesso ao painel. Fale com o administrador.');
      throw Error(m);
    }
  }
  // Acesso alternativo (administrador): e-mail + senha, sem enviar e-mail (não usa a cota de links).
  async function signInPassword(email, password) {
    if (!/^[^@\s]+@kwbrasil\.com\.br$/i.test(email)) throw Error('Use seu e-mail @kwbrasil.com.br.');
    if (!password) throw Error('Informe a senha.');
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw Error(/invalid login/i.test(error.message) ? 'E-mail ou senha incorretos.' : error.message);
    st.logged = true; $('connectSb').textContent = 'Sair'; await subscribe(); await load();
  }
  async function signOut() { await client.auth.signOut(); location.reload(); }
  async function photoUrl(name) {
    if (!client || !name) return '';
    const hit = signed.get(name); if (hit && hit.exp > Date.now()) return hit.url;
    const { data, error } = await client.storage.from('fotos').createSignedUrl(name, 3600);
    if (error || !data) return '';
    signed.set(name, { url: data.signedUrl, exp: Date.now() + 3300000 }); return data.signedUrl;
  }
  return { enabled, start, load, sendLink, signInPassword, signOut, photoUrl, session: () => client && session() };
})();
