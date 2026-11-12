/* Leitura local, somente consulta, da planilha do app sincronizada pelo OneDrive. */
'use strict';
const AppSource = (() => {
  const decoder = new TextDecoder();
  const nodes = (root, tag) => [...root.getElementsByTagNameNS('*', tag)];
  function xml(text) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (nodes(doc, 'parsererror').length) throw Error('XML inválido na planilha.');
    return doc;
  }
  function resolve(base, target) {
    const parts = (target.startsWith('/') ? target.slice(1) : base.slice(0, base.lastIndexOf('/') + 1) + target).split('/');
    const result = [];
    for (const p of parts) { if (p === '..') result.pop(); else if (p && p !== '.') result.push(p); }
    return result.join('/');
  }
  async function unzip(buffer) {
    const bytes = new Uint8Array(buffer), view = new DataView(buffer), entries = new Map();
    let end = bytes.length - 22;
    for (; end >= Math.max(0, bytes.length - 65557); end--) if (view.getUint32(end, true) === 0x06054b50) break;
    if (end < 0 || view.getUint32(end, true) !== 0x06054b50) throw Error('Arquivo XLSX inválido.');
    const count = view.getUint16(end + 10, true);
    let offset = view.getUint32(end + 16, true);
    for (let i = 0; i < count; i++) {
      if (view.getUint32(offset, true) !== 0x02014b50) throw Error('Índice XLSX inválido.');
      const method = view.getUint16(offset + 10, true), size = view.getUint32(offset + 20, true);
      const uncompressed = view.getUint32(offset + 24, true);
      const nameLength = view.getUint16(offset + 28, true), extra = view.getUint16(offset + 30, true), comment = view.getUint16(offset + 32, true);
      const local = view.getUint32(offset + 42, true), name = decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLength));
      entries.set(name, { method, size, uncompressed, local });
      offset += 46 + nameLength + extra + comment;
    }
    const cache = new Map();
    return {
      has: name => entries.has(name),
      async read(name) {
        if (cache.has(name)) return cache.get(name);
        const e = entries.get(name);
        if (!e) throw Error('Parte ausente na planilha: ' + name);
        if (e.uncompressed > 100 * 1024 * 1024) throw Error('Planilha excede o limite de leitura.');
        const start = e.local + 30 + view.getUint16(e.local + 26, true) + view.getUint16(e.local + 28, true);
        let data = bytes.slice(start, start + e.size);
        if (e.method === 8) data = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
        else if (e.method !== 0) throw Error('Compressão XLSX não suportada. Use Edge ou Chrome atualizado.');
        const text = decoder.decode(data); cache.set(name, text); return text;
      }
    };
  }
  function col(ref) { let n = 0; for (const c of ref.match(/[A-Z]+/)[0]) n = n * 26 + c.charCodeAt(0) - 64; return n; }
  async function readWorkbook(buffer) {
    const zip = await unzip(buffer), book = xml(await zip.read('xl/workbook.xml'));
    const date1904 = ['1', 'true'].includes(nodes(book, 'workbookPr')[0]?.getAttribute('date1904'));
    const rels = new Map(nodes(xml(await zip.read('xl/_rels/workbook.xml.rels')), 'Relationship').map(r => [r.getAttribute('Id'), resolve('xl/workbook.xml', r.getAttribute('Target'))]));
    let strings = [];
    if (zip.has('xl/sharedStrings.xml')) strings = nodes(xml(await zip.read('xl/sharedStrings.xml')), 'si').map(si => nodes(si, 't').map(t => t.textContent).join(''));
    const tables = {};
    for (const sheet of nodes(book, 'sheet')) {
      const id = sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      const path = rels.get(id); if (!path) continue;
      const relPath = path.slice(0, path.lastIndexOf('/') + 1) + '_rels/' + path.slice(path.lastIndexOf('/') + 1) + '.rels';
      if (!zip.has(relPath)) continue;
      const tableRels = nodes(xml(await zip.read(relPath)), 'Relationship').filter(r => r.getAttribute('Type').endsWith('/table'));
      if (!tableRels.length) continue;
      const grid = new Map();
      for (const row of nodes(xml(await zip.read(path)), 'row')) {
        const cells = new Map();
        for (const cell of nodes(row, 'c')) {
          const type = cell.getAttribute('t'), raw = nodes(cell, 'v')[0]?.textContent || '';
          const value = type === 's' ? strings[Number(raw)] || '' : type === 'inlineStr' ? nodes(cell, 't').map(t => t.textContent).join('') : raw;
          cells.set(col(cell.getAttribute('r')), value);
        }
        grid.set(Number(row.getAttribute('r')), cells);
      }
      for (const rel of tableRels) {
        const table = xml(await zip.read(resolve(path, rel.getAttribute('Target')))).documentElement;
        const name = table.getAttribute('name');
        if (!['Equipamentos', 'Obras', 'Gestores'].includes(name)) continue;
        const [first, last = first] = table.getAttribute('ref').split(':');
        const startCol = col(first), startRow = Number(first.match(/\d+/)[0]), endRow = Number(last.match(/\d+/)[0]);
        const headers = nodes(table, 'tableColumn').map(c => c.getAttribute('name'));
        const headerCount = Number(table.getAttribute('headerRowCount') ?? 1), totals = Number(table.getAttribute('totalsRowCount') || 0);
        const rows = [];
        for (let r = startRow + headerCount; r <= endRow - totals; r++) {
          const cells = grid.get(r); if (!cells) continue;
          const obj = Object.fromEntries(headers.map((h, i) => [h, (cells.get(startCol + i) || '').trim()]));
          if (Object.values(obj).some(Boolean)) rows.push(obj);
        }
        tables[name] = rows;
        tables[name + 'Columns'] = headers;
      }
    }
    for (const name of ['Equipamentos', 'Obras', 'Gestores']) if (!tables[name]) throw Error('Tabela ausente: ' + name);
    for (const field of ['CR', 'Gestor', 'CriadoEm']) if (!tables.EquipamentosColumns.includes(field)) throw Error('Coluna ausente em Equipamentos: ' + field);
    return { tables, date1904 };
  }
  function dateValue(value, date1904 = false) {
    const s = String(value || '').trim();
    if (!s) return '';
    if (/^\d{11,14}$/.test(s)) {
      // Power Apps grava CriadoEm como milissegundos desde 1970 (UTC); converte para a data em Brasília.
      const d = new Date(Number(s)); return isNaN(d) ? '' : new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(d);
    }
    if (/^\d+(\.\d+)?$/.test(s)) {
      const serial = Number(s); if (serial < 1 || serial > 150000) return '';
      return new Date(Date.UTC(date1904 ? 1904 : 1899, date1904 ? 0 : 11, date1904 ? 1 : 30) + Math.floor(serial) * 86400000).toISOString().slice(0, 10);
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      if (/T.*(?:Z|[+-]\d\d:\d\d)$/.test(s)) {
        const d = new Date(s); return isNaN(d) ? '' : new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(d);
      }
      return validDate(s.slice(0, 10)) ? s.slice(0, 10) : '';
    }
    const match = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s|$)/);
    const iso = match ? `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}` : '';
    return validDate(iso) ? iso : '';
  }
  function normalize({ tables, date1904 }) {
    const people = tables.Gestores.filter(p => p.Nome).map(p => ({ name: p.Nome.trim(), email: (p.Email || '').toLowerCase().trim() }));
    function person(name, email) {
      const match = people.find(p => email && p.email === email.toLowerCase().trim()) || people.find(p => p.name.toLocaleLowerCase('pt-BR') === (name || '').toLocaleLowerCase('pt-BR'));
      return match?.name || name || email || 'Coordenador não informado';
    }
    const obras = tables.Obras.filter(b => String(b.CR || '').trim()).map(b => ({ cr: b.CR, obra: b.Obra, categoria: /\bFILIAL\b/i.test(b.Obra || '') ? 'filial' : 'obra', uf: (b.UF || '').trim().toUpperCase() || 'Não informado', gestor: person(b.Coordenador || b.Gestor, b.EmailCoordenador || b.EmailGestor), gerente: person(b.Gerente, b.EmailGerente) }));
    // Coordenadas: colunas Latitude/Longitude ou, na falta, o texto "GPS lat, lon" do campo Local (limitadas ao Brasil).
    function coords(e) {
      let la = parseFloat(String(e.Latitude || '').replace(',', '.')), lo = parseFloat(String(e.Longitude || '').replace(',', '.'));
      if (!Number.isFinite(la) || !Number.isFinite(lo)) {
        const m = String(e.Local || '').match(/(-?\d+[.,]\d+)\s*[;,]\s*(-?\d+[.,]\d+)/);
        la = m ? parseFloat(m[1].replace(',', '.')) : NaN; lo = m ? parseFloat(m[2].replace(',', '.')) : NaN;
      }
      return Number.isFinite(la) && Number.isFinite(lo) && la > -34 && la < 6 && lo > -74 && lo < -34 ? { lat: la, lon: lo } : { lat: null, lon: null };
    }
    const records = tables.Equipamentos.map((e, index) => {
      const obra = obras.find(b => b.cr === e.CR);
      const fotos = [1, 2, 3, 4].map(n => e['Foto' + n + ' [image]'] || e['Foto' + n] || '').filter(Boolean);
      return { ...coords(e), fotos, por: (e.AtualizadoPor || e.CriadoPor) ? person('', e.AtualizadoPor || e.CriadoPor) : '', atualizado: dateValue(e.AtualizadoEm || e.CriadoEm, date1904), gerente: obra?.gerente || 'Não informado', obraNome: obra?.obra || e.Obra || '', situacao: e.Situacao || '', cr: e.CR, categoria: obra?.categoria || 'obra', uf: obra?.uf || 'Não informado', gestor: obra?.gestor || 'Coordenador não informado', date: dateValue(e.CriadoEm, date1904), grupo: e.Grupo || 'Sem grupo', equipamento: e.Tipo || 'Não informado', modelo: e.Modelo || '', tag: e.TAG || '', quantidade: e.Quantidade || '', unidade: e.Unidade || 'Sem unidade', note: [e.Tipo, e.TAG, e.Observacao].filter(Boolean).join(' · '), det: { Vínculo: e.Vinculo, Conservação: e.Conservacao, 'Nº de série': e.Serie, Placa: e.Placa, Ano: e.Ano, Capacidade: e.Capacidade, Potência: e.Potencia, Vazão: e.Vazao, Horímetro: e.Horimetro, Validade: e.Validade, Local: e.Local, Observação: e.Observacao }, order: index };
    });
    return { obras, records, names: [...new Set(obras.map(b => b.gestor).filter(n => n && n !== 'Coordenador não informado'))].sort((a, b) => a.localeCompare(b, 'pt-BR')) };
  }
  let handle = null, busy = false, lastSuccess = '', storageWarning = '';
  // Modo SharePoint (Microsoft Graph, somente leitura): usado quando config_sharepoint.js define clientId.
  const GC = window.KW_SHAREPOINT || {}, SCOPES = ['https://' + GC.host + '/AllSites.Read'];
  // SharePoint REST (AllSites.Read): permissão delegada que dispensa consentimento de administrador, ao contrário do Graph Files.Read.All.
  const spPath = () => decodeURIComponent(new URL(GC.link).pathname);
  const spApi = path => `https://${GC.host}${GC.sitePath}/_api/web/GetFileByServerRelativeUrl('${encodeURI(path.replaceAll("'", "''"))}')/`;
  let mode = 'file', msalApp = null, account = null;
  const graphConfigured = () => !!(GC.clientId && window.msal);
  async function graphToken(interactive, scopes = SCOPES) {
    if (!msalApp) {
      msalApp = new window.msal.PublicClientApplication({ auth: { clientId: GC.clientId, authority: 'https://login.microsoftonline.com/' + (GC.tenantId || 'organizations'), redirectUri: location.origin + location.pathname }, cache: { cacheLocation: 'localStorage' } });
      await msalApp.initialize();
      const back = await msalApp.handleRedirectPromise(); // retorno do login por redirecionamento
      if (back?.account) account = back.account;
    }
    account = account || msalApp.getAllAccounts()[0] || null;
    if (account) {
      try { return (await msalApp.acquireTokenSilent({ scopes, account })).accessToken; }
      catch (e) { if (!interactive) throw Error('Sessão Microsoft expirada. Clique em Entrar com Microsoft.'); }
    }
    if (!interactive) throw Error('Login Microsoft necessário. Clique em Entrar com Microsoft.');
    try {
      const result = await msalApp.acquireTokenPopup({ scopes });
      account = result.account; return result.accessToken;
    } catch (e) {
      if (e.errorCode !== 'popup_window_error' && e.errorCode !== 'empty_window_error') throw e;
      try { localStorage.setItem('kw-painel-modo', 'graph'); } catch (x) {}
      await msalApp.acquireTokenRedirect({ scopes }); // popup bloqueado: segue por redirecionamento
      return new Promise(() => {});
    }
  }
  async function readGraph(interactive) {
    const headers = { Authorization: 'Bearer ' + await graphToken(interactive), Accept: 'application/json;odata=nometadata' };
    const base = spApi(spPath());
    const meta = await fetch(base + '?$select=Name,TimeLastModified', { headers });
    if (!meta.ok) throw Error('SharePoint respondeu ' + meta.status + ' ao localizar ' + GC.file);
    const item = await meta.json();
    const res = await fetch(base + '$value', { headers });
    if (!res.ok) throw Error('Download do SharePoint respondeu ' + res.status);
    return { buffer: await res.arrayBuffer(), name: item.Name, lastModified: new Date(item.TimeLastModified).getTime(), origin: 'SharePoint' };
  }
  // Fotos (somente leitura): Graph busca por nome na pasta Fotos da biblioteca; no modo arquivo usa a pasta escolhida pelo usuário.
  let photoDir = null; const photoCache = new Map();
  const baseName = p => decodeURIComponent(String(p).split(/[\\/]/).pop() || '');
  async function photoUrl(path) {
    if (mode === 'supabase') return window.SupabaseSource.photoUrl(baseName(path));
    const name = baseName(path); if (!name || !/\.(jpe?g|png|webp|gif)$/i.test(name)) return '';
    if (photoCache.has(name)) return photoCache.get(name);
    const job = (async () => {
      if (mode === 'graph') {
        const dir = spPath().replace(/\/[^/]*$/, '') + '/Fotos/' + name;
        const res = await fetch(spApi(dir) + '$value', { headers: { Authorization: 'Bearer ' + await graphToken(false) } });
        return res.ok ? URL.createObjectURL(await res.blob()) : '';
      }
      if (photoDir) { try { return URL.createObjectURL(await (await photoDir.getFileHandle(name)).getFile()); } catch (e) { return ''; } }
      return '';
    })().catch(() => '');
    photoCache.set(name, job); const url = await job; if (!url) photoCache.delete(name); return url;
  }
  async function choosePhotoFolder() {
    if (!window.showDirectoryPicker) throw Error('Abra o painel no Edge ou Chrome.');
    photoDir = await window.showDirectoryPicker({ mode: 'read' }); photoCache.clear();
  }
  // FileSystemFileHandle é serializável no IndexedDB, sem armazenar cópia da base.
  function savedHandle(action, value) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('kw-painel-conexao', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('config');
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(Error('Armazenamento ocupado por outra aba.'));
      request.onsuccess = () => {
        const db = request.result;
        let tx, result;
        try {
          tx = db.transaction('config', action === 'get' ? 'readonly' : 'readwrite');
          const store = tx.objectStore('config');
          const op = action === 'get' ? store.get('base') : store.put(value, 'base');
          op.onsuccess = () => { result = op.result; };
          tx.oncomplete = () => { db.close(); resolve(result); };
          tx.onerror = tx.onabort = () => { db.close(); reject(tx.error || Error('Falha ao salvar conexão.')); };
        } catch (e) { db.close(); reject(e); }
      };
    });
  }
  function needsPermission() {
    $('reauthorize').hidden = false;
    $('connection').textContent = 'Base lembrada: ' + handle.name + '. Clique em Autorizar acesso para retomar a conexão ao mesmo arquivo.';
  }
  async function restoreConnection() {
    $('connect').disabled = true;
    try {
      const stored = await savedHandle('get');
      if (!stored || stored.kind !== 'file' || stored.name !== 'BD_Inventario_KW.xlsx') return;
      handle = stored;
      $('connect').textContent = 'Trocar base';
      if (await handle.queryPermission({ mode: 'read' }) === 'granted') await refresh();
      else needsPermission();
    } catch (e) {
      storageWarning = ' Não foi possível recuperar a conexão salva; selecione a base novamente.';
      $('connection').textContent = storageWarning;
    } finally { $('connect').disabled = false; }
  }
  $('reauthorize').onclick = async () => {
    if (!handle) return;
    try {
      if (await handle.requestPermission({ mode: 'read' }) === 'granted') await refresh();
      else needsPermission();
    } catch (e) { $('connection').textContent = 'Não foi possível autorizar: ' + e.message + '. Use Trocar base se o arquivo foi movido.'; }
  };
  function applyTables(tables, origin) {
    const data = normalize({ tables, date1904: false });
    BASE = data.obras; events = data.records; managers = data.names; sourceConnected = true;
    lastSuccess = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    $('connection').textContent = `Conectado: ${origin} · Atualizado em ${lastSuccess} · ${events.length} cadastros · alterações chegam automaticamente.`;
    render(); if (window.renderMapa) renderMapa(); if ($('dialog').open) open(selected);
  }
  async function refresh(interactive) {
    if (mode === 'supabase') return false;
    if ((mode === 'file' && !handle) || busy) return false;
    busy = true; $('refresh').disabled = true;
    try {
      let file;
      if (mode === 'graph') file = await readGraph(interactive === true);
      else {
        if (handle.queryPermission && await handle.queryPermission({ mode: 'read' }) !== 'granted') { needsPermission(); return false; }
        const f = await handle.getFile(); file = { buffer: await f.arrayBuffer(), name: f.name, lastModified: f.lastModified };
      }
      const data = normalize(await readWorkbook(file.buffer));
      BASE = data.obras; events = data.records; managers = data.names; sourceConnected = true;
      lastSuccess = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      const missing = events.filter(e => !e.date).length;
      $('connection').textContent = `Conectado${mode === 'graph' ? ' direto ao SharePoint' : ''}: ${file.name} · Verificado em ${lastSuccess} · Arquivo modificado em ${new Date(file.lastModified).toLocaleString('pt-BR')} · ${events.length} cadastros · Leitura a cada 30 s.${missing ? ' ' + missing + ' cadastro(s) sem data válida: incluídos no total, fora da linha do tempo.' : ''}`;
      $('reauthorize').hidden = true;
      $('connect').textContent = 'Trocar base';
      $('connection').textContent += storageWarning;
      render(); if (window.renderMapa) renderMapa(); if ($('dialog').open) open(selected);
      return true;
    } catch (e) {
      $('connection').textContent = `Falha ao atualizar: ${e.message}. ${lastSuccess ? 'Exibindo a última leitura de ' + lastSuccess + '.' : 'Nenhuma leitura válida disponível.'} ${mode === 'graph' ? 'Verifique o login Microsoft e o acesso ao SharePoint.' : 'Verifique o OneDrive ou reconecte a base.'}`;
    } finally { busy = false; $('refresh').disabled = false; }
  }
  $('connect').onclick = async () => {
    if (!window.showOpenFilePicker) { $('connection').textContent = 'Abra este painel no Edge ou Chrome para permitir a leitura automática do arquivo sincronizado.'; return; }
    try {
      const [chosen] = await window.showOpenFilePicker({ multiple: false, types: [{ description: 'Base Excel do aplicativo', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }] });
      if (chosen.name !== 'BD_Inventario_KW.xlsx') { $('connection').textContent = 'Selecione BD_Inventario_KW.xlsx da biblioteca atual APP_GestaoDeRecursos sincronizada pelo OneDrive.'; return; }
      if (!confirm('Confirme que este arquivo pertence à biblioteca atual APP_GestaoDeRecursos sincronizada pelo OneDrive. A cópia antiga da pasta PowerApps é apenas backup e não recebe dados do app.')) return;
      handle = chosen;
      if (await refresh()) {
        try { await savedHandle('put', handle); storageWarning = ''; }
        catch (e) { storageWarning = ' Conectado nesta sessão, mas não foi possível lembrar o arquivo. O navegador pode exigir nova seleção ao reabrir.'; $('connection').textContent += storageWarning; }
      }
    } catch (e) { if (e.name !== 'AbortError') $('connection').textContent = 'Não foi possível conectar: ' + e.message; }
  };
  $('connectGraph').onclick = async () => {
    mode = 'graph';
    if (await refresh(true)) { try { localStorage.setItem('kw-painel-modo', 'graph'); } catch (e) {} $('connectGraph').textContent = 'Reconectar SharePoint'; }
    else if (!lastSuccess) mode = 'file';
  };
  $('refresh').onclick = () => { if (mode === 'supabase') window.SupabaseSource.load(); else if (mode === 'graph') refresh(true); else if (!handle) $('connect').click(); else if (!$('reauthorize').hidden) $('reauthorize').click(); else refresh(); };
  setInterval(refresh, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  async function start() {
    if (window.SupabaseSource?.enabled()) { mode = 'supabase'; await window.SupabaseSource.start(); return; }
    if (graphConfigured()) {
      $('connectGraph').hidden = false;
      let saved = ''; try { saved = localStorage.getItem('kw-painel-modo'); } catch (e) {}
      if (saved === 'graph') { mode = 'graph'; $('connectGraph').textContent = 'Reconectar SharePoint'; await refresh(); if (lastSuccess) return; mode = 'file'; }
    }
    await restoreConnection();
  }
  const ready = start();
  return { unzip, readWorkbook, dateValue, normalize, applyTables, refresh, ready, photoUrl, choosePhotoFolder, get mode() { return mode; } };
})();
