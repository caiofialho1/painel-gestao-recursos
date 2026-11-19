/* Seção "Mapa e inventário de recursos": usa os mesmos cadastros (events/BASE) lidos por fonte_app.js. Somente leitura. */
'use strict';
(() => {
  const UF = { AC: [-9.0, -70.5], AL: [-9.6, -36.8], AP: [1.4, -51.8], AM: [-3.4, -65.0], BA: [-12.5, -41.7], CE: [-5.2, -39.3], DF: [-15.8, -47.9], ES: [-19.6, -40.6], GO: [-15.9, -49.8], MA: [-5.0, -45.3], MT: [-12.9, -56.9], MS: [-20.5, -54.5], MG: [-18.5, -44.6], PA: [-3.9, -52.5], PB: [-7.1, -36.8], PR: [-24.6, -51.6], PE: [-8.4, -37.9], PI: [-7.7, -42.7], RJ: [-22.2, -42.6], RN: [-5.8, -36.6], RS: [-29.7, -53.5], RO: [-10.9, -62.8], RR: [2.0, -61.4], SC: [-27.3, -50.5], SP: [-22.2, -48.8], SE: [-10.6, -37.4], TO: [-10.2, -48.3] };
  const BRASIL = L_bounds();
  function L_bounds() { return [[-34.5, -74.5], [5.5, -33.5]]; }
  const PAGE = 120, number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }),
    pct2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });   // percentuais com duas casas decimais
  const norm = s => String(s ?? '').toLocaleLowerCase('pt-BR');
  const BY = { coord: e => e.gestor || 'Coordenador não informado', gestor: e => e.gerente || 'Não informado', grupo: e => canon(e).grupo, cr: e => e.cr ? e.cr + (e.obraNome ? ' · ' + e.obraNome.replace(/^\d+\s*-\s*/, '') : '') : 'Sem CR', equip: e => canon(e).tipo };
  let map = null, layer = null, shown = 0, current = [], visible = false, observer = null;
  const closed = new Set();
  const qty = e => detailQuantity(e.quantidade) ?? 1;
  const porNome = p => !p ? "—" : p.includes("@") ? p.split("@")[0].split(".").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") : p;
  // Nome canônico e grupo: cadastros "Outro equipamento" são classificados pela descrição, com as mesmas regras do PEX.
  const sem = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
  let RX = null;
  function canon(e) {
    if (e._c) return e._c;
    RX = RX || (window.KW_PEX?.regras || []).map(([p, t, g]) => [new RegExp(p), t, g]);
    let tipo = e.equipamento || 'Não informado', grupo = e.grupo || 'Sem grupo';
    if (/^OUTRO EQUIPAMENTO/.test(sem(tipo))) {
      const t = sem([e.modelo, String(e.note || '').replace(e.equipamento || '', '')].join(' '));
      for (const [rx, tp, g] of RX) if (rx.test(t)) { tipo = tp; grupo = g; break; }
    }
    return (e._c = { tipo, grupo });
  }
  // Foto do coordenador (perfil Microsoft 365, salva em fotos_coord/); sem foto, iniciais.
  window.avatar = name => {
    const fotos = window.KW_FOTOS_COORD || {}, src = fotos[String(name || '').toLowerCase()];
    if (src) return `<img class="av" src="${escape(src)}" alt="" title="${escape(name)}">`;
    if (typeof managers !== 'undefined' && managers.includes(name)) {
      const w = String(name).split(/\s+/).filter(Boolean);
      return `<span class="av av-i" aria-hidden="true">${escape((w[0][0] + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase())}</span>`;
    }
    return '';
  };

  function filtered() {
    const q = norm($('mSearch').value.trim()), g = $('mGroup').value, cr = $('mCr').value, co = $('mCoord').value;
    return events.filter(e => (!g || canon(e).grupo === g) && (!cr || e.cr === cr) && (!co || e.gestor === co) &&
      (!q || norm([canon(e).tipo, e.equipamento, e.modelo, e.tag, e.cr, e.obraNome, canon(e).grupo].join(' ')).includes(q)));
  }
  function fillSelect(id, values, label) {
    const sel = $(id), keep = sel.value, list = [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    sel.innerHTML = `<option value="">${label}</option>` + list.map(v => `<option value="${escape(v)}">${escape(v)}</option>`).join('');
    sel.value = list.includes(keep) ? keep : '';
  }
  function crPoints(records) {
    const byCr = new Map();
    for (const e of records) {
      if (!e.cr) continue;
      const p = byCr.get(e.cr) || { cr: e.cr, obra: e.obraNome, uf: e.uf, count: 0, qty: 0, lat: 0, lon: 0, n: 0 };
      p.count++; p.qty += qty(e);
      if (e.lat !== null) { p.lat += e.lat; p.lon += e.lon; p.n++; }
      byCr.set(e.cr, p);
    }
    return [...byCr.values()].map(p => {
      if (p.n) return { ...p, lat: p.lat / p.n, lon: p.lon / p.n, gps: true };
      const c = UF[p.uf]; return c ? { ...p, lat: c[0], lon: c[1], gps: false } : null;
    }).filter(Boolean);
  }
  // Somente o contorno do Brasil e dos estados, sem mapa-base de outros países.
  // Estados: verde escuro = tem cadastro; vermelho claro = tem CR mas nenhum cadastro; branco = sem CR (respeita os filtros).
  let ufLayer, ufStatus = new Map(), callLayer, lastPoints = [];
  function ufStyle(f) {
    const st = ufStatus.get(f.properties.sigla);
    return { color: '#7c9a88', weight: 1, fillColor: st === 'com' ? '#276342' : st === 'sem' ? '#f4b8b2' : '#ffffff', fillOpacity: st ? .9 : 1 };
  }
  function updateUf() {
    ufStatus = new Map();
    const com = new Set(current.map(e => e.uf).filter(Boolean));
    scope(false).obras.forEach(b => { const u = b.uf; if (u) ufStatus.set(u, com.has(u) ? 'com' : (ufStatus.get(u) || 'sem')); });
    com.forEach(u => ufStatus.set(u, 'com'));
    ufLayer?.setStyle(ufStyle);
  }
  function drawMap(points) {
    if (!window.L) { $('map').innerHTML = '<p class="muted" style="padding:16px">Biblioteca do mapa (Leaflet) indisponível. Verifique a conexão com a internet.</p>'; return; }
    if (!map) {
      map = L.map('map', { scrollWheelZoom: false, zoomSnap: .25, minZoom: 2, maxBounds: L.latLngBounds(BRASIL).pad(.8), attributionControl: false });
      if (window.KW_BR_UF) ufLayer = L.geoJSON(window.KW_BR_UF, { style: ufStyle, interactive: false }).addTo(map);
      layer = L.layerGroup().addTo(map);
      callLayer = L.layerGroup().addTo(map);
      map.on('zoomend moveend', () => callouts());
      map.fitBounds(BRASIL, { paddingBottomRight: [150, 0] });
      map.on('click', () => map.scrollWheelZoom.enable());
    }
    layer.clearLayers();
    updateUf();
    const selected = $('mCr').value;
    lastPoints = points;
    points.forEach(p => {
      const m = L.circleMarker([p.lat, p.lon], { radius: 5, color: '#201e1e', weight: p.cr === selected ? 4 : 2, dashArray: p.gps ? null : '3 2', fillColor: '#ffffff', fillOpacity: p.gps ? 1 : .6 }).addTo(layer);
      m.bindPopup(`<b>${escape(p.obra || p.cr)}</b><br>CR ${escape(p.cr)} · ${escape(p.uf)}<br>${p.count} cadastro(s) · ${number.format(p.qty)} un.${p.gps ? '' : '<br><i>Localização aproximada pelo estado</i>'}<br><button data-cr="${escape(p.cr)}">Filtrar tabela por este CR</button>`);
    });
    setTimeout(() => { map.invalidateSize(); map.fitBounds(BRASIL, { paddingBottomRight: [150, 0] }); callouts(); }, 0);
  }
  // Chamadas com linha: quantidade cadastrada e % em relação ao PStock do CR, empilhadas nas laterais do mapa.
  function callouts() {
    if (!map || !callLayer) return;
    callLayer.clearLayers();
    if (!lastPoints.length) return;
    const sz = map.getSize(), W = 156, H = 34, GAP = 5, g = $('mGroup').value, pex = new Map();
    (window.KW_PEX?.itens || []).forEach(i => { if (!g || i[3] === g) pex.set(i[0], (pex.get(i[0]) || 0) + i[8]); });
    const cap = Math.max(1, Math.floor((sz.y - 12) / (H + GAP)));
    const pts = lastPoints.slice().sort((a, b) => b.qty - a.qty).slice(0, cap).map(p => ({ p, pt: map.latLngToContainerPoint([p.lat, p.lon]) })).filter(o => o.pt.x > 0 && o.pt.x < sz.x && o.pt.y > 0 && o.pt.y < sz.y).sort((a, b) => a.pt.y - b.pt.y);
    let y = 6;
    pts.forEach(o => {
      y = Math.max(y, Math.min(o.pt.y - H / 2, sz.y - H - 6)); const lx = sz.x - W - 6;
      const p = o.p, tot = pex.get(p.cr) || 0, pc = tot ? p.qty / tot * 100 : null, t = tone(pc);
      L.polyline([[p.lat, p.lon], map.containerPointToLatLng(L.point(lx, y + H / 2))], { color: '#201e1e', weight: 1, opacity: .75, interactive: false }).addTo(callLayer);
      const html = `<div class="co co-${t}" title="${escape(p.obra || p.cr)}"><b>${escape(p.cr)}</b><span><strong>${number.format(p.qty)}</strong> un · <strong>${pc === null ? 'sem PStock' : pct2.format(pc) + '%'}</strong>${pc === null ? '' : ' do PStock'}</span></div>`;
      const mk = L.marker(map.containerPointToLatLng(L.point(lx, y)), { icon: L.divIcon({ className: 'co-wrap', html, iconSize: [W, H], iconAnchor: [0, 0] }), keyboard: false }).addTo(callLayer);
      mk.on('click', () => { $('mCr').value = p.cr; shown = 0; renderMapa(); });
      y += H + GAP;
    });
  }
  function thumb(e) {
    const n = e.fotos.length;
    return `<button class="thumb ${n ? 'has-photo' : ''}" ${n ? `data-photo="${escape(e.order)}" data-src="${escape(e.fotos[0])}" aria-label="Ver ${n} foto(s) de ${escape(e.tag || e.equipamento)}"` : 'disabled aria-label="Sem foto"'}>${n ? '' : '—'}${n > 1 ? `<span class="count">${n}</span>` : ''}</button>`;
  }
  function loadThumbs() {
    observer?.disconnect();
    observer = new IntersectionObserver(entries => entries.forEach(async en => {
      if (!en.isIntersecting) return; observer.unobserve(en.target);
      const b = en.target, url = await AppSource.photoUrl(b.dataset.src);
      b.insertAdjacentHTML('afterbegin', url ? `<img src="${url}" alt="" loading="lazy">` : '<span>×</span>');
    }), { rootMargin: '200px' });
    document.querySelectorAll('#mRows .thumb[data-src]:not(:has(img))').forEach(b => observer.observe(b));
  }
  function itemRow(e, sel) {
    const q = detailQuantity(e.quantidade) ?? 1;   // sem quantidade informada = 1 unidade
    return `<tr class="${sel && e.cr === sel ? 'is-active' : ''}" data-g="${escape(e._g || '')}"><td>${thumb(e)}</td><td>${escape(canon(e).tipo)}${e.modelo ? '<small> · ' + escape(e.modelo) + '</small>' : ''}</td><td>${escape(e.tag || '—')}</td><td class="qv">${number.format(q)} <small>${escape(e.unidade && e.unidade !== 'Sem unidade' ? e.unidade : 'un')}</small></td><td title="${escape(e.obraNome)}">${escape(e.cr || '—')}</td><td>${escape(canon(e).grupo)}</td><td>${escape(porNome(e.por))}</td><td>${(e.atualizado || e.date) ? fmt(e.atualizado || e.date) : "—"}</td></tr>`;
  }
  function rows() {
    const slice = current.slice(0, shown), sel = $('mCr').value, by = $('mBy').value;
    let html = '';
    if (by) {
      const groups = new Map();
      for (const e of slice) { const k = BY[by](e); (groups.get(k) || groups.set(k, []).get(k)).push(e); }
      for (const [k, items] of [...groups].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))) {
        const key = by + ':' + k, total = items.reduce((s, e) => s + qty(e), 0), isClosed = closed.has(key);
        html += `<tr class="grp ${isClosed ? 'closed' : ''}" data-k="${escape(key)}"><th colspan="8" scope="rowgroup">${by === 'coord' || by === 'gestor' ? avatar(k) : ''}${escape(k)}<small>${items.length} cadastro(s) · ${number.format(total)} un.</small></th></tr>`;
        if (!isClosed) html += items.map(e => itemRow(e, sel)).join('');
      }
    } else html = slice.map(e => itemRow(e, sel)).join('');
    $('mRows').innerHTML = html || `<tr><td colspan="8" class="muted" style="padding:14px">${sourceConnected ? 'Nenhum item encontrado.' : 'Conecte a base do app para exibir os itens.'}</td></tr>`;
    $('mMore').hidden = shown >= current.length;
    $('mMore').textContent = `Mostrar mais (${current.length - shown} restantes)`;
    loadThumbs();
  }
  function scope(withGroup) {
    const co = $('mCoord').value, cr = $('mCr').value;
    const obras = BASE.filter(b => b.cr && (!co || b.gestor === co) && (!cr || b.cr === cr));
    return { obras, crs: new Set(obras.map(b => b.cr)), g: withGroup ? $('mGroup').value : '' };
  }
  const pctOf = (app, pex) => pex ? app / pex * 100 : (app ? 100 : null);
  const tone = p => p === null ? 'na' : p >= 85 ? 'ok' : p >= 50 ? 'mid' : 'low';
  const pctTxt = p => p === null ? '—' : pct2.format(p) + '%';
  function bars(list, el, avatars) {
    el.innerHTML = list.map(r => `<div class="bar-row" title="${escape(r.label)}: PStock ${number.format(r.pex)} · inventário ${number.format(r.app)}"><div class="bar-label"><span>${avatars ? avatar(r.label) : ''}${escape(r.label)}</span><strong class="t-${tone(r.pct)}">${pctTxt(r.pct)}</strong></div><div class="bar-track"><div class="bar-fill f-${tone(r.pct)}" style="width:${Math.min(100, r.pct || 0)}%"></div></div><div class="bar-sub"><b class="v-pex">${number.format(r.pex)}</b> PStock · <b class="v-app">${number.format(r.app)}</b> inventário</div></div>`).join('') || '<p class="muted">Sem dados.</p>';
  }
  function kpis() {
    const sc = scope(true), pex = window.KW_PEX?.itens || [];
    const byCr = new Map(sc.obras.map(b => [b.cr, { label: b.cr + ' · ' + String(b.obra || '').replace(/^\d+\s*-\s*/, ''), coord: b.gestor, uf: b.uf || 'Sem UF', pex: 0, app: 0, n: 0 }]));
    pex.forEach(i => { if (byCr.has(i[0]) && (!sc.g || i[3] === sc.g)) byCr.get(i[0]).pex += i[8]; });
    events.forEach(e => { if (byCr.has(e.cr) && (!sc.g || canon(e).grupo === sc.g)) { const r = byCr.get(e.cr); r.app += qty(e); r.n++; } });
    const crs = [...byCr.values()].filter(r => r.pex || r.app), co = new Map();
    crs.forEach(r => { const c = co.get(r.coord) || co.set(r.coord, { label: r.coord, pex: 0, app: 0 }).get(r.coord); c.pex += r.pex; c.app += r.app; });
    const fin = l => l.map(r => ({ ...r, pct: pctOf(r.app, r.pex) }));
    const tot = crs.reduce((s, r) => ({ pex: s.pex + r.pex, app: s.app + r.app, n: s.n + r.n }), { pex: 0, app: 0, n: 0 });
    const pct = pctOf(tot.app, tot.pex), withApp = crs.filter(r => r.n).length, dif = tot.app - tot.pex;
    $('kpiCards').innerHTML = `<div class="kpi kpi-gauge"><div class="gauge t-${tone(pct)}" style="--deg:${Math.min(100, pct || 0) * 3.6}deg"><span>${pctTxt(pct)}</span></div><div><small>Aderência geral</small><b class="t-${tone(pct)}">${pctTxt(pct)}</b><em>inventário ÷ PStock</em></div></div>
      <div class="kpi"><small>Itens PStock</small><b class="v-pex">${number.format(tot.pex)}</b><em>unidades em posse</em></div>
      <div class="kpi"><small>Itens cadastrados (inventário)</small><b class="v-app">${number.format(tot.app)}</b><em>${number.format(tot.n)} cadastros no app</em></div>
      <div class="kpi"><small>Diferença</small><b class="${dif < 0 ? 'v-neg' : 'v-app'}">${dif > 0 ? '+' : ''}${number.format(dif)}</b><em>inventário − PStock</em></div>
      <div class="kpi"><small>CRs com cadastro</small><b>${withApp} <span class="of">/ ${crs.length}</span></b><em>CRs com PStock ou inventário</em></div>`;
    const ufs = new Map();
    crs.forEach(r => { const u = ufs.get(r.uf) || ufs.set(r.uf, { label: r.uf, pex: 0, app: 0 }).get(r.uf); u.pex += r.pex; u.app += r.app; });
    bars(fin([...ufs.values()]).sort((a, b) => b.pex - a.pex || b.app - a.app), $('kpiCr'), false);
    bars(fin([...co.values()]).sort((a, b) => b.pex - a.pex || b.app - a.app), $('kpiCoord'), true);
    histograma(sc);
  }
  // Histograma por grupo de equipamentos: eixo em % do total de cada série (PEX e cadastrado); rótulos em quantidade.
  function histograma(sc) {
    const el = $('kpiHist'); if (!el) return;
    const crs = sc.crs, map = new Map(), row = g => map.get(g) || map.set(g, { g, pex: 0, app: 0 }).get(g);
    (window.KW_PEX?.itens || []).filter(i => crs.has(i[0]) && (!sc.g || i[3] === sc.g)).forEach(i => { row(i[3]).pex += i[8]; });
    events.filter(e => crs.has(e.cr) && (!sc.g || canon(e).grupo === sc.g)).forEach(e => { row(canon(e).grupo).app += qty(e); });
    const list = [...map.values()].sort((a, b) => b.pex - a.pex || b.app - a.app);
    if (!list.length) { el.innerHTML = '<p class="muted">Sem dados.</p>'; return; }
    // Cada grupo: PEX = 100% (referência); cadastrado = % do PEX do próprio grupo (aderência). Rótulos em quantidade.
    const max = 100, ticks = [0, 25, 50, 75, 100];
    const adh = r => r.pex ? r.app / r.pex * 100 : (r.app ? 100 : 0);
    const bar = () => '';
    el.innerHTML = `<div class="hh-axis" aria-hidden="true"><i></i><div>${ticks.map(t => `<span style="left:${t / max * 100}%">${t}%</span>`).join('')}</div></div>` +
      list.map(r => `<div class="hh-row" title="${escape(r.g)}: PStock ${number.format(r.pex)} · cadastrado ${number.format(r.app)} (${pct2.format(adh(r))}% do PStock)"><div class="hh-name">${escape(r.g)}</div><div class="hh-bars"><div class="hb-over"><div class="hb-total" style="width:${r.pex || r.app ? 100 : 0}%"></div><div class="hb-fill a" style="width:${Math.min(100, adh(r))}%"></div></div><span class="hb-lbl"><b class="v-app">${number.format(r.app)}</b> / <b class="v-pex">${number.format(r.pex)}</b> <small>${r.pex ? pct2.format(adh(r)) + '%' : 'sem PStock'}</small></span></div></div>`).join('') + `<div class="hh-vgrid" aria-hidden="true">${ticks.map(t => `<i style="left:${t / max * 100}%"></i>`).join('')}</div>`;
  }
  // PStock = referência do PStock (saldo + cautelas em posse), somente leitura, gerada por pstock/gerar_pex.py.
  // Item PStock: [cr, produto, equipamento, grupo, tag, patrimônio, série, nf, qtd, origem(0=descrição,1=grupo PStock)].
  function pexTable() {
    const pex = window.KW_PEX, mode = $('pexBy').value;
    $('pexKey').textContent = mode === 'equip' ? 'Equipamento' : 'Grupo';
    if (!pex) { $('pexRows').innerHTML = '<tr><td colspan="5" class="muted">Dados do PStock indisponíveis.</td></tr>'; $('pexTotal').innerHTML = ''; return; }
    const sel = $('mCr').value, crs = scope(false).crs, idx = mode === 'equip' ? 2 : 3;
    const map = new Map(), row = g => map.get(g) || map.set(g, { g, pex: 0, app: 0 }).get(g);
    pex.itens.filter(i => crs.has(i[0])).forEach(i => { row(i[idx]).pex += i[8] });
    events.filter(e => crs.has(e.cr)).forEach(e => { row(mode === 'equip' ? canon(e).tipo : canon(e).grupo).app += qty(e) });
    const list = [...map.values()].sort((a, b) => b.pex - a.pex || b.app - a.app || a.g.localeCompare(b.g, 'pt-BR'));
    const cell = r => { const d = r.app - r.pex, pct = r.pex ? Math.min(100, r.app / r.pex * 100) : (r.app ? 100 : 0); return `<td class="v-pex">${number.format(r.pex)}</td><td class="v-app">${number.format(r.app)}</td><td class="${d < 0 ? 'v-neg' : 'v-app'}">${d > 0 ? '+' : ''}${number.format(d)}</td><td><span class="cov"><i><b style="width:${pct}%"></b></i>${r.pex ? pct2.format(r.app / r.pex * 100) + '%' : '—'}</span></td>`; };
    $('pexRows').innerHTML = list.map(r => `<tr class="pex-row" data-pk="${escape(r.g)}" title="Ver itens do PStock"><td>${escape(r.g)}</td>${cell(r)}</tr>`).join('') || '<tr><td colspan="5" class="muted">Sem dados.</td></tr>';
    const t = list.reduce((s, r) => ({ pex: s.pex + r.pex, app: s.app + r.app }), { pex: 0, app: 0 });
    $('pexTotal').innerHTML = `<tr><th>Total</th>${cell(t)}</tr>`;
    const porRegra = pex.itens.filter(i => crs.has(i[0]) && i[9] === 0).length, total = pex.itens.filter(i => crs.has(i[0])).length;
    $('pexCaption').textContent = (sel ? 'CR ' + sel : 'Todos os CRs do app') + ' · clique na linha para ver os itens';
    $('pexNote').textContent = `PStock = inventário do PStock em posse (saldo + cautelas), extraído em ${pex.geradoEm}, só como referência. Cada item do PStock foi classificado pela descrição (${porRegra} de ${total} por regra; o restante pelo grupo de origem) e recebeu nome canônico de equipamento; TAG, patrimônio, série e NF foram separados em colunas. Cadastros "Outro equipamento" do app são reclassificados pelas mesmas regras. Grupos sem correspondente no app (ferramentas manuais, EPC, materiais, locação) aparecem só no PStock. Planilha de conferência: pstock/PEX_classificado.xlsx. Regras: pstock/classificar_pex.py.`;
  }
  function pexItems(key) {
    const pex = window.KW_PEX, mode = $('pexBy').value, idx = mode === 'equip' ? 2 : 3, sel = $('mCr').value;
    const crs = scope(false).crs;
    const list = pex.itens.filter(i => crs.has(i[0]) && i[idx] === key).sort((a, b) => a[2].localeCompare(b[2], 'pt-BR') || a[1].localeCompare(b[1], 'pt-BR'));
    $('pexTitle').textContent = `PStock · ${key}`;
    $('pexItems').innerHTML = `<p class="muted">${list.length} item(ns) · ${number.format(list.reduce((s, i) => s + i[8], 0))} unidades${sel ? ' · CR ' + sel : ''}</p><div class="scroll"><table class="detail-table pex-items"><thead><tr><th>Equipamento</th><th>Descrição PStock</th><th>TAG</th><th>Patrimônio</th><th>Série</th><th>NF</th><th>CR</th><th>Qtd.</th></tr></thead><tbody>${list.map(i => `<tr><td>${escape(i[2])}${mode === 'equip' ? '' : '<small>' + escape(i[3]) + '</small>'}</td><td>${escape(i[1])}</td><td>${escape(i[4] || '—')}</td><td>${escape(i[5] || '—')}</td><td>${escape(i[6] || '—')}</td><td>${escape(i[7] || '—')}</td><td>${escape(i[0])}</td><td class="detail-qty">${number.format(i[8])}</td></tr>`).join('')}</tbody></table></div>`;
    $('pexDialog').showModal();
  }
  // Tabela de itens para exportação (exportar_relatorio.js): todas as linhas da tabela atual (não só as carregadas), com nomes das fotos.
  window.KW_ITENS = () => current.map(e => { const t = canon(e), det = e.det || {}; return {
    fotos: e.fotos || [], cr: e.cr || '', obra: e.obraNome || '', uf: e.uf || '', grupo: t.grupo, item: t.tipo, modelo: e.modelo || '', tag: e.tag || '', quantidade: qty(e),
    unidade: e.unidade && e.unidade !== 'Sem unidade' ? e.unidade : 'un', situacao: e.situacao || '', vinculo: det['Vínculo'] || '', conservacao: det['Conservação'] || '',
    serie: det['Nº de série'] || '', observacao: det['Observação'] || '', coordenador: e.gestor || '', gestor: e.gerente || '', por: porNome(e.por),
    em: (e.atualizado || e.date) ? fmt(e.atualizado || e.date) : '', lat: e.lat ?? '', lon: e.lon ?? '' }; });
  window.renderMapa = function renderMapa() {
    fillSelect('mGroup', events.map(e => canon(e).grupo), 'Todos os grupos');
    fillSelect('mCr', events.map(e => e.cr), 'Todos os CRs');
    fillSelect('mCoord', BASE.map(b => b.gestor).filter(n => n && n !== 'Coordenador não informado'), 'Todos os coordenadores');
    current = filtered().sort((a, b) => (a.cr || '').localeCompare(b.cr || '') || canon(a).tipo.localeCompare(canon(b).tipo, 'pt-BR') || (a.tag || '').localeCompare(b.tag || '', 'pt-BR'));
    shown = Math.min(Math.max(shown, PAGE), Math.max(current.length, PAGE));
    const withPhoto = current.filter(e => e.fotos.length).length, gps = current.filter(e => e.lat !== null).length;
    const units = current.reduce((s, e) => s + qty(e), 0);
    $('mSummary').textContent = sourceConnected ? `${current.length} cadastros · ${number.format(units)} unidades (sem quantidade conta 1) · ${gps} com GPS · ${withPhoto} com foto` : '';
    $('mCaption').textContent = ($('mBy').value ? 'Agrupado · clique no grupo para recolher' : 'Foto, item, TAG e quantidade') + (AppSource.mode === 'graph' ? '' : ' · fotos: use "Pasta de fotos"');
    rows(); pexTable(); kpis();
    if (visible) drawMap(crPoints(current));
  };
  function setView(view) {
    visible = view === 'map';
    $('viewMap').hidden = !visible; $('main').classList.toggle('view-map', visible);
    document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.view === view)));
    $('pageTitle').textContent = visible ? 'Mapa e inventário de recursos' : 'Inventário';
    $('summary').hidden = visible; document.querySelector('.report-layout').hidden = visible;
    try { location.hash = visible ? 'mapa' : ''; } catch (e) {}
    if (visible) renderMapa();
  }
  document.querySelector('.tabs').onclick = e => { const b = e.target.closest('[data-view]'); if (b) setView(b.dataset.view); };
  ['mSearch', 'mGroup', 'mCoord', 'mCr', 'mBy', 'pexBy'].forEach(id => $(id).oninput = () => { shown = 0; renderMapa(); });
  $('mClear').onclick = () => { $('mSearch').value = ''; $('mGroup').value = ''; $('mCoord').value = ''; $('mCr').value = ''; $('mBy').value = ''; shown = 0; renderMapa(); };
  $('mMore').onclick = () => { shown += PAGE; rows(); };
  $('mPhotos').onclick = async () => {
    try { await AppSource.choosePhotoFolder(); rows(); } catch (e) { if (e.name !== 'AbortError') $('connection').textContent = 'Não foi possível abrir a pasta de fotos: ' + e.message; }
  };
  document.addEventListener('click', e => {
    const pop = e.target.closest('.leaflet-popup-content button[data-cr]');
    if (pop) { $('mCr').value = pop.dataset.cr; shown = 0; renderMapa(); map?.closePopup(); }
  });
  const svg = d => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const IC = {
    tag: svg('<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.2"/>'),
    box: svg('<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>'),
    pin: svg('<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>'),
    user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>'),
    check: svg('<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>'),
    tool: svg('<path d="M14.7 6.3a4 4 0 0 0-5.4 5.1L3 17.7 6.3 21l6.3-6.3a4 4 0 0 0 5.1-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>'),
    note: svg('<path d="M5 3h10l4 4v14H5z"/><path d="M14 3v5h5M8 13h8M8 17h5"/>'),
    clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    image: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-9 9"/>')
  };
  $('mRows').onclick = async e => {
    const g = e.target.closest('tr.grp');
    if (g) { const k = g.dataset.k; closed.has(k) ? closed.delete(k) : closed.add(k); rows(); return; }
    const b = e.target.closest('[data-photo]'); if (!b) return;
    // carrossel: itens com foto, na ordem em que aparecem na tabela
    nav.list = [...document.querySelectorAll('#mRows [data-photo]')].map(x => x.dataset.photo);
    nav.pos = Math.max(0, nav.list.indexOf(b.dataset.photo));
    const ev = events.find(x => String(x.order) === b.dataset.photo); if (ev) showItem(ev);
  };
  const nav = { list: [], pos: 0 };
  function step(d) {
    if (nav.list.length < 2) return;
    nav.pos = (nav.pos + d + nav.list.length) % nav.list.length;
    const ev = events.find(x => String(x.order) === nav.list[nav.pos]); if (ev) showItem(ev);
  }
  $('pdPrev').onclick = () => step(-1);
  $('pdNext').onclick = () => step(1);
  $('photoDialog').addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
  });
  let tx = null;   // deslizar o dedo para trocar de item
  $('photoDialog').addEventListener('touchstart', e => { tx = e.touches[0].clientX; }, { passive: true });
  $('photoDialog').addEventListener('touchend', e => { if (tx === null) return; const dx = e.changedTouches[0].clientX - tx; tx = null; if (Math.abs(dx) > 70) step(dx < 0 ? 1 : -1); });
  function showItem(ev) {
    const q = detailQuantity(ev.quantidade) ?? 1, t = canon(ev);
    $('photoTitle').innerHTML = `<span class="pd-name">${escape(t.tipo)}</span>${ev.tag ? `<span class="pd-tag">${IC.tag}${escape(ev.tag)}</span>` : ''}<small>${escape(String(ev.obraNome || '').startsWith(ev.cr || '\u0000') ? ev.obraNome : [ev.cr, ev.obraNome].filter(Boolean).join(' · '))}</small>`;
    const ok = v => v && !['Não informado', 'Coordenador não informado', 'Sem grupo'].includes(v);
    const det = ev.det || {};
    const secoes = [
      ['Identificação', 'box', [['Item', t.tipo], ['Modelo', ev.modelo], ['Grupo', t.grupo], ['Quantidade', number.format(q) + ' ' + (ev.unidade && ev.unidade !== 'Sem unidade' ? ev.unidade : 'un')]]],
      ['Localização', 'pin', [['CR', ev.cr], ['Obra', ev.obraNome], ['UF', ev.uf], ['Local', det['Local']]]],
      ['Responsáveis', 'user', [['Coordenador', ev.gestor], ['Gestor', ev.gerente]]],
      ['Estado', 'check', [['Situação', ev.situacao], ['Vínculo', det['Vínculo']], ['Conservação', det['Conservação']], ['Validade', det['Validade']]]],
      ['Ficha técnica', 'tool', [['Nº de série', det['Nº de série']], ['Placa', det['Placa']], ['Ano', det['Ano']], ['Capacidade', det['Capacidade']], ['Potência', det['Potência']], ['Vazão', det['Vazão']], ['Horímetro', det['Horímetro']]]],
      ['Observação', 'note', [['', det['Observação']]]],
      ['Atualização', 'clock', [['Por', porNome(ev.por)], ['Em', (ev.atualizado || ev.date) ? fmt(ev.atualizado || ev.date) : '']]]
    ];
    $('photoInfo').innerHTML = secoes.map(([nome, ic, campos]) => {
      const lin = campos.filter(([, v]) => ok(v));
      return lin.length ? `<section class="pi-sec"><h3>${IC[ic]}${nome}</h3><dl>${lin.map(([k, v]) => k ? `<dt>${k}</dt><dd>${escape(String(v))}</dd>` : `<dd class="wide">${escape(String(v))}</dd>`).join('')}</dl></section>` : '';
    }).join('');
    const fotos = ev.fotos || [];
    $('photoGallery').innerHTML = fotos.length
      ? `<figure class="pg-main"><img alt="Foto 1 de ${fotos.length}"><figcaption>Foto 1 de ${fotos.length}</figcaption></figure>${fotos.length > 1 ? `<div class="pg-thumbs">${fotos.map((f, n) => `<button type="button" class="${n ? '' : 'on'}" data-n="${n}" aria-label="Ver foto ${n + 1}"><img alt=""></button>`).join('')}</div>` : ''}`
      : `<div class="pg-empty">${IC.image}<p>Este item não tem fotos.</p></div>`;
    const urls = [];
    const show = n => { const im = $('photoGallery').querySelector('.pg-main img'); if (!im) return; im.src = urls[n] || ''; im.alt = `Foto ${n + 1} de ${fotos.length}`; $('photoGallery').querySelector('.pg-main figcaption').textContent = urls[n] ? `Foto ${n + 1} de ${fotos.length}` : `Foto ${n + 1} indisponível`; $('photoGallery').querySelectorAll('.pg-thumbs button').forEach((b, k) => b.classList.toggle('on', k === n)); };
    $('photoGallery').onclick = x => { const b = x.target.closest('.pg-thumbs button'); if (b) show(+b.dataset.n); };
    if (!$('photoDialog').open) $('photoDialog').showModal();
    $('pdPos').textContent = nav.list.length > 1 ? `Item ${nav.pos + 1} de ${nav.list.length}` : '';
    $('pdPrev').disabled = $('pdNext').disabled = nav.list.length < 2;
    Promise.all(fotos.map(f => Promise.resolve(AppSource.photoUrl(f)).catch(() => ''))).then(r => { r.forEach((u, n) => { urls[n] = u; const th = $('photoGallery').querySelector(`.pg-thumbs button[data-n="${n}"] img`); if (th && u) th.src = u; }); const first = urls.findIndex(Boolean); show(first < 0 ? 0 : first); });
  }
  $('photoClose').onclick = () => $('photoDialog').close();
  $('pexClose').onclick = () => $('pexDialog').close();
  $('pexRows').onclick = e => { const r = e.target.closest('[data-pk]'); if (r && window.KW_PEX) pexItems(r.dataset.pk); };
  if (location.hash === '#mapa') setView('map');
})();
