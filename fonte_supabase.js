/* Fonte Supabase do painel: lê as tabelas e atualiza em tempo real (Realtime). Somente leitura. */
'use strict';
window.SupabaseSource = (() => {
  const C = window.KW_SUPABASE || {};
  let client = null, channel = null, timer = null, busy = false, again = false;
  const signed = new Map();
  const enabled = () => !!(C.url && C.anonKey && window.supabase);
  const s = v => (v === null || v === undefined ? '' : String(v));

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
    } catch (e) {
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
        if (status === 'SUBSCRIBED') el.dataset.live = '1';
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { el.dataset.live = ''; }
      });
  }
  async function session() { return (await client.auth.getSession()).data.session; }
  async function start() {
    if (!enabled()) return false;
    client = client || window.supabase.createClient(C.url, C.anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    client.auth.onAuthStateChange((ev, sess) => { if (sess) { subscribe(); soon(); } });
    $('connect').hidden = true; $('connectGraph').hidden = true; $('connectSb').hidden = false;
    if (await session()) { $('connectSb').textContent = 'Sair'; await subscribe(); await load(); }
    else $('connection').textContent = 'Entre com seu e-mail @kwbrasil.com.br para ler o banco em tempo real.';
    return true;
  }
  async function sendLink(email) {
    if (!/^[^@\s]+@kwbrasil\.com\.br$/i.test(email)) throw Error('Use seu e-mail @kwbrasil.com.br.');
    const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
    if (error) throw Error(error.message);
  }
  async function signOut() { await client.auth.signOut(); location.reload(); }
  async function photoUrl(name) {
    if (!client || !name) return '';
    const hit = signed.get(name); if (hit && hit.exp > Date.now()) return hit.url;
    const { data, error } = await client.storage.from('fotos').createSignedUrl(name, 3600);
    if (error || !data) return '';
    signed.set(name, { url: data.signedUrl, exp: Date.now() + 3300000 }); return data.signedUrl;
  }
  return { enabled, start, load, sendLink, signOut, photoUrl, session: () => client && session() };
})();
