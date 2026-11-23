/* "Exportar relatório" (aba Mapa e inventário de recursos): gera um Excel (.xlsx) SÓ com a tabela de itens, com as informações
   de cada cadastro e as fotos embutidas (miniaturas). Sem resumo, gráficos ou filtros. Somente leitura.
   Fonte dos dados: window.KW_ITENS (mapa_recursos.js) = todas as linhas da tabela atual, não só as carregadas na tela. */
'use strict';
(() => {
  const anchor = $('mPhotos'); if (!anchor || typeof window.KW_ITENS !== 'function') return;
  const EXCELJS = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';   // carregado só ao exportar
  const FOTO_W = 160, FOTO_H = 120, MAX_FOTOS = 4, PARALELO = 6;

  const wrap = document.createElement('div'); wrap.className = 'exp-wrap';
  wrap.innerHTML = '<button id="mExport" type="button" title="Exporta a tabela de itens, com fotos, em Excel">Exportar relatório</button>' +
    '<div class="exp-an"><label>Relatório analítico (PStock × cadastrado), abas por<select id="mAnBy"><option value="coord">Coordenador</option><option value="cr">CR</option><option value="">Aba única</option></select></label>' +
    '<button id="mExportAn" type="button" title="Lista os itens previstos no PStock com os itens cadastrados ao lado, conforme os filtros">Exportar analítico</button><button id="mPdfCoord" type="button" title="PDF do relatório analítico, uma seção (página nova) por coordenador, conforme os filtros">PDF por coordenador</button></div><p id="expMsg" role="status"></p>';
  anchor.after(wrap);
  const btn = $('mExport'), msg = $('expMsg');

  const carregar = () => window.ExcelJS ? Promise.resolve() : new Promise((ok, erro) => {
    const s = document.createElement('script'); s.src = EXCELJS; s.onload = ok;
    s.onerror = () => erro(new Error('Não foi possível carregar a biblioteca de Excel. Verifique a conexão com a internet.'));
    document.head.appendChild(s);
  });

  // Foto reduzida (JPEG) para o arquivo não ficar com centenas de MB. Retorna null se a foto não puder ser lida.
  const cache = new Map();
  async function miniatura(nome) {
    if (cache.has(nome)) return cache.get(nome);
    const p = (async () => {
      try {
        const url = await AppSource.photoUrl(nome); if (!url) return null;
        const r = await fetch(url); if (!r.ok) return null;
        const bmp = await createImageBitmap(await r.blob());
        const k = Math.min(1, FOTO_W / bmp.width, FOTO_H / bmp.height), w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').drawImage(bmp, 0, 0, w, h); bmp.close?.();
        const blob = await new Promise(ok => cv.toBlob(ok, 'image/jpeg', 0.75));
        return { buffer: await blob.arrayBuffer(), w, h };
      } catch (e) { return null; }
    })();
    cache.set(nome, p); return p;
  }

  async function exportar() {
    const itens = window.KW_ITENS();
    if (!itens.length) { msg.textContent = 'Nada para exportar: conecte a base ou ajuste a busca.'; return; }
    msg.textContent = 'Preparando…'; btn.disabled = true;
    try {
      await carregar();
      const nF = Math.min(MAX_FOTOS, Math.max(0, ...itens.map(i => i.fotos.length)));
      const wb = new ExcelJS.Workbook(); wb.creator = 'Painel KW';
      const ws = wb.addWorksheet('Itens', { views: [{ state: 'frozen', ySplit: 1 }] });
      const info = [['CR', 'cr', 13], ['Obra', 'obra', 38], ['UF', 'uf', 6], ['Grupo', 'grupo', 26], ['Item', 'item', 30], ['Modelo', 'modelo', 18], ['TAG', 'tag', 14], ['Quantidade', 'quantidade', 12],
        ['Unidade', 'unidade', 9], ['Situação', 'situacao', 14], ['Vínculo', 'vinculo', 14], ['Conservação', 'conservacao', 14], ['Nº de série', 'serie', 16], ['Observação', 'observacao', 40],
        ['Coordenador', 'coordenador', 30], ['Gestor', 'gestor', 30], ['Atualizado por', 'por', 20], ['Atualizado em', 'em', 18], ['Latitude', 'lat', 12], ['Longitude', 'lon', 12]];
      ws.columns = [...Array.from({ length: nF }, (_, k) => ({ header: 'Foto ' + (k + 1), key: 'f' + k, width: 23 })), ...info.map(([header, key, width]) => ({ header, key, width }))];
      const alturaLinha = nF ? 92 : 18;
      itens.forEach(i => ws.addRow(Object.fromEntries(info.map(([, k]) => [k, i[k]]))).height = alturaLinha);
      ws.eachRow(r => r.eachCell(c => { c.alignment = { vertical: 'middle', wrapText: true }; }));
      const cab = ws.getRow(1); cab.height = 22;
      cab.eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF163F32' } }; c.alignment = { vertical: 'middle', horizontal: 'center' }; });

      // Fotos: baixa em paralelo e posiciona cada miniatura na célula (linha do item, coluna Foto n).
      const tarefas = []; itens.forEach((i, r) => i.fotos.slice(0, nF).forEach((nome, k) => tarefas.push({ r, k, nome })));
      let feitas = 0, ok = 0, fila = tarefas.slice();
      const falhas = [];
      await Promise.all(Array.from({ length: Math.min(PARALELO, fila.length) }, async () => {
        for (let t = fila.shift(); t; t = fila.shift()) {
          const m = await miniatura(t.nome);
          if (m) {
            const id = wb.addImage({ buffer: m.buffer, extension: 'jpeg' });
            ws.addImage(id, { tl: { col: t.k + (FOTO_W + 4 - m.w) / 2 / (FOTO_W + 4), row: t.r + 1 + (123 - m.h) / 2 / 123 }, ext: { width: m.w, height: m.h }, editAs: 'oneCell' }); ok++;
          } else { ws.getRow(t.r + 2).getCell(t.k + 1).value = 'indisponível'; falhas.push(t.nome); }
          msg.textContent = `Baixando fotos ${++feitas}/${tarefas.length}…`;
        }
      }));
      msg.textContent = 'Gerando arquivo…';
      const buf = await wb.xlsx.writeBuffer();
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      a.download = `Itens_Inventario_KW_${new Date().toISOString().slice(0, 10)}.xlsx`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      msg.textContent = `Excel gerado: ${itens.length} itens, ${ok} fotos${falhas.length ? `, ${falhas.length} indisponíveis` : ''}.`;
    } catch (err) { msg.textContent = 'Falha ao exportar: ' + err.message; }
    finally { btn.disabled = false; }
  }
  btn.onclick = exportar;

  // ---------- Relatório analítico: itens do PStock × itens cadastrados, conforme os filtros ----------
  const ST = { 'Conferido (TAG)': 'FFD9EAD3', 'Cadastrado': 'FFD9EAD3', 'Parcial': 'FFFFF2CC', 'Não cadastrado': 'FFF4CCCC', 'Cadastrado sem PStock': 'FFDDEBF7' };
  const fill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  const fillHead = (c, argb = 'FF163F32') => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = fill(argb); c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }; };
  const nomeAba = (txt, usados) => {
    const b = String(txt || 'Sem nome').replace(/[\[\]:*?\/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Sem nome'; let n = b, k = 2;
    while (usados.has(n.toLowerCase())) n = b.slice(0, 31 - String(k).length - 1) + ' ' + k++;
    usados.add(n.toLowerCase()); return n;
  };
  function abaAnalitica(wb, nome, blocos, titulo) {
    const ws = wb.addWorksheet(nome, { views: [{ state: 'frozen', ySplit: 4 }] });
    const col = [['CR', 12], ['Obra', 32], ['UF', 5], ['Coordenador', 26], ['Grupo', 24], ['Equipamento', 28],
      ['Descrição PStock', 40], ['TAG', 12], ['Patrimônio', 13], ['Série', 14], ['NF', 11], ['Qtd. PStock', 10],
      ['Modelo', 22], ['TAG', 12], ['Nº de série', 14], ['Qtd. cadastrada', 11], ['Situação', 13], ['Atualizado por', 18], ['Atualizado em', 16], ['Status', 22]];
    ws.columns = col.map(([, width]) => ({ width }));
    ws.addRow([titulo]).font = { bold: true, size: 13 };
    ws.addRow(['PStock = itens previstos (saldo + cautelas) · Cadastrado = itens lançados no app · Verde: cadastrado · Amarelo: parcial · Vermelho: não cadastrado · Azul: cadastrado sem PStock']).font = { italic: true, size: 9, color: { argb: 'FF65776B' } };
    ws.addRow([]);
    const cab = ws.addRow(col.map(c => c[0]));
    cab.eachCell((c, n) => fillHead(c, n >= 7 && n <= 12 ? 'FF1F4E79' : n >= 13 && n <= 19 ? 'FF163F32' : 'FF404040')); cab.height = 30;
    ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: col.length } };
    for (const b of blocos) {
      const dif = b.app - b.pex;
      const t = ws.addRow([b.cr, b.obra, b.uf, b.coord, b.grupo, b.tipo, '', '', '', '', '', b.pex, '', '', '', b.app, '', '', '', `Dif. ${dif > 0 ? '+' : ''}${dif}${b.pex ? ' · ' + Math.round(b.app / b.pex * 100) + '%' : ''}`]);
      t.eachCell({ includeEmpty: true }, c => { c.font = { bold: true }; c.fill = fill('FFEDEDED'); });
      for (const l of b.linhas) {
        const p = l.p, a = l.a;
        const r = ws.addRow([b.cr, b.obra, b.uf, b.coord, b.grupo, b.tipo, p?.desc || '', p?.tag || '', p?.pat || '', p?.serie || '', p?.nf || '', p ? p.qtd : '',
          a?.modelo || '', a?.tag || '', a?.serie || '', a ? a.qtd : '', a?.situacao || '', a?.por || '', a?.em || '', l.status]);
        r.eachCell({ includeEmpty: true }, c => { c.alignment = { vertical: 'top', wrapText: true }; });
        if (ST[l.status]) r.getCell(col.length).fill = fill(ST[l.status]);
        for (let n = 1; n <= 6; n++) r.getCell(n).font = { color: { argb: 'FF8A8A8A' } };
      }
    }
  }
  function abaResumo(wb, dados) {
    const ws = wb.addWorksheet('Resumo', { views: [{ state: 'frozen', ySplit: 4 }] });
    const col = [['Coordenador', 28], ['CR', 12], ['Obra', 38], ['UF', 5], ['PStock (un.)', 12], ['Cadastrado (un.)', 14], ['Diferença', 11], ['Aderência', 11], ['Linhas PStock sem cadastro', 16], ['Cadastros sem PStock', 14]];
    ws.columns = col.map(([, width]) => ({ width }));
    ws.addRow(['Relatório analítico do inventário — PStock × cadastrado']).font = { bold: true, size: 14 };
    ws.addRow([`${dados.filtros}  ·  PStock extraído em ${dados.geradoEm}  ·  gerado em ${new Date().toLocaleString('pt-BR')}`]).font = { size: 10, color: { argb: 'FF65776B' } };
    ws.addRow([]);
    const cab = ws.addRow(col.map(c => c[0])); cab.eachCell(c => fillHead(c)); cab.height = 32;
    const porCr = new Map();
    dados.blocos.forEach(b => {
      const r = porCr.get(b.cr) || porCr.set(b.cr, { coord: b.coord, cr: b.cr, obra: b.obra, uf: b.uf, pex: 0, app: 0, sem: 0, extra: 0 }).get(b.cr); r.pex += b.pex; r.app += b.app;
      b.linhas.forEach(l => { if (l.status === 'Não cadastrado') r.sem++; if (l.status === 'Cadastrado sem PStock') r.extra++; });
    });
    const lista = [...porCr.values()].sort((x, y) => (x.coord || '').localeCompare(y.coord || '', 'pt-BR') || x.cr.localeCompare(y.cr));
    const tot = { pex: 0, app: 0, sem: 0, extra: 0 }, adh = (a, p) => p ? a / p : null;
    lista.forEach(r => { ws.addRow([r.coord, r.cr, r.obra, r.uf, r.pex, r.app, r.app - r.pex, adh(r.app, r.pex), r.sem, r.extra]).getCell(8).numFmt = '0.00%'; Object.keys(tot).forEach(k => { tot[k] += r[k]; }); });
    const t = ws.addRow(['Total', '', '', '', tot.pex, tot.app, tot.app - tot.pex, adh(tot.app, tot.pex), tot.sem, tot.extra]); t.getCell(8).numFmt = '0.00%';
    t.eachCell({ includeEmpty: true }, c => { c.font = { bold: true }; c.border = { top: { style: 'thin' } }; });
    ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: col.length } };
  }

  async function exportarAnalitico() {
    const dados = window.KW_ANALITICO(), por = $('mAnBy').value, b2 = $('mExportAn');
    if (!dados.temPex) { msg.textContent = 'Dados do PStock indisponíveis.'; return; }
    if (!dados.blocos.length) { msg.textContent = 'Nada para exportar: ajuste os filtros.'; return; }
    msg.textContent = 'Preparando relatório analítico…'; btn.disabled = b2.disabled = true;
    try {
      await carregar();
      const wb = new ExcelJS.Workbook(); wb.creator = 'Painel KW';
      abaResumo(wb, dados);
      const usados = new Set(['resumo']);
      if (!por) abaAnalitica(wb, nomeAba('Analítico', usados), dados.blocos, `Analítico — ${dados.filtros}`);
      else {
        const grupos = new Map();
        dados.blocos.forEach(b => { const k = por === 'cr' ? b.cr : (b.coord || 'Coordenador não informado'); (grupos.get(k) || grupos.set(k, []).get(k)).push(b); });
        for (const [k, bl] of grupos) {
          const obra = String(bl[0].obra || '').replace(/^\d+\s*-\s*/, '');
          abaAnalitica(wb, nomeAba(por === 'cr' ? `${k} ${obra}` : k, usados), bl, `${por === 'cr' ? `CR ${k}${obra ? ' · ' + obra : ''}` : 'Coordenador: ' + k} — ${dados.filtros}`);
        }
      }
      msg.textContent = 'Gerando arquivo…';
      const buf = await wb.xlsx.writeBuffer();
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      a.download = `Analitico_PStock_x_Cadastrado_${new Date().toISOString().slice(0, 10)}.xlsx`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      msg.textContent = `Relatório analítico gerado: ${new Set(dados.blocos.map(b => b.cr)).size} CR(s), ${dados.blocos.reduce((s, b) => s + b.linhas.length, 0)} linhas.`;
    } catch (err) { msg.textContent = 'Falha ao exportar: ' + err.message; }
    finally { btn.disabled = b2.disabled = false; }
  }
  $('mExportAn').onclick = exportarAnalitico;

  // ---------- PDF por coordenador (impressão do navegador: "Salvar como PDF"), cada coordenador começa em página nova ----------
  const h = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const COR = { 'Conferido (TAG)': '#d9ead3', 'Cadastrado': '#d9ead3', 'Parcial': '#fff2cc', 'Não cadastrado': '#f4cccc', 'Cadastrado sem PStock': '#ddebf7' };
  function exportarPdf() {
    const dados = window.KW_ANALITICO();
    if (!dados.temPex) { msg.textContent = 'Dados do PStock indisponíveis.'; return; }
    if (!dados.blocos.length) { msg.textContent = 'Nada para exportar: ajuste os filtros.'; return; }
    const coords = new Map();
    dados.blocos.forEach(b => { const k = b.coord || 'Coordenador não informado'; (coords.get(k) || coords.set(k, []).get(k)).push(b); });
    const hoje = new Date().toLocaleDateString('pt-BR');
    const secoes = [...coords].map(([nome, bl]) => {
      const pex = bl.reduce((s, b) => s + b.pex, 0), app = bl.reduce((s, b) => s + b.app, 0);
      const porCr = new Map(); bl.forEach(b => (porCr.get(b.cr) || porCr.set(b.cr, []).get(b.cr)).push(b));
      const crs = [...porCr].map(([cr, bs]) => {
        const p = bs.reduce((s, b) => s + b.pex, 0), a = bs.reduce((s, b) => s + b.app, 0);
        const linhas = bs.map(b => `<tr class="eq"><td colspan="3">${h(b.tipo)} <small>${h(b.grupo)}</small></td><td class="n">${b.pex}</td><td colspan="2"></td><td class="n">${b.app}</td><td>Dif. ${b.app - b.pex > 0 ? '+' : ''}${b.app - b.pex}</td></tr>` +
          b.linhas.map(l => `<tr><td colspan="3">${l.p ? h(l.p.desc) : ''}</td><td class="n">${l.p ? l.p.qtd : ''}</td><td>${l.a ? h([l.a.modelo, l.a.tag && 'TAG ' + l.a.tag].filter(Boolean).join(' · ') || '—') : ''}</td><td>${l.a ? h(l.a.situacao) : ''}</td><td class="n">${l.a ? l.a.qtd : ''}</td><td style="background:${COR[l.status] || 'transparent'}">${h(l.status)}</td></tr>`).join('')).join('');
        return `<h3>CR ${h(cr)} · ${h(String(bs[0].obra || '').replace(/^\d+\s*-\s*/, ''))} <small>${bs[0].uf ? h(bs[0].uf) + ' · ' : ''}PStock ${p} · cadastrado ${a}${p ? ' · ' + (a / p * 100).toFixed(2).replace('.', ',') + '%' : ''}</small></h3>
          <table><thead><tr><th colspan="3">PStock · descrição</th><th>Qtd.</th><th>Cadastrado · modelo / TAG</th><th>Situação</th><th>Qtd.</th><th>Status</th></tr></thead><tbody>${linhas}</tbody></table>`;
      }).join('');
      return `<section><h2>${h(nome)}</h2><p class="sub">Inventário analítico PStock × cadastrado · PStock ${pex} · cadastrado ${app}${pex ? ' · aderência ' + (app / pex * 100).toFixed(2).replace('.', ',') + '%' : ''} · ${h(dados.filtros)} · PStock de ${h(dados.geradoEm)} · emitido em ${hoje}</p>${crs}</section>`;
    }).join('');
    const css = '@page{size:A4 landscape;margin:10mm}body{font:9px Arial,sans-serif;color:#222}section{page-break-after:always}section:last-child{page-break-after:auto}h2{font-size:16px;margin:0 0 2px;color:#163f32}.sub{margin:0 0 8px;color:#65776b}h3{font-size:11px;margin:10px 0 3px;page-break-after:avoid}h3 small,td small{font-weight:400;color:#65776b}table{width:100%;border-collapse:collapse;margin-bottom:6px}th{background:#163f32;color:#fff;text-align:left;padding:3px 4px;font-size:8px}td{border-bottom:1px solid #ddd;padding:2px 4px;vertical-align:top}tr{page-break-inside:avoid}tr.eq td{background:#ededed;font-weight:700}.n{text-align:right;width:36px}thead{display:table-header-group}';
    let fr = document.getElementById('pdfFrame'); fr?.remove();
    fr = document.createElement('iframe'); fr.id = 'pdfFrame'; fr.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0';
    document.body.appendChild(fr);
    const d = fr.contentWindow.document; d.open(); d.write(`<!doctype html><meta charset="utf-8"><title>Inventario_analitico_${hoje.replace(/\//g, '-')}</title><style>${css}</style>${secoes}`); d.close();
    msg.textContent = `PDF: ${coords.size} coordenador(es), cada um em página nova. Na janela de impressão escolha "Salvar como PDF".`;
    setTimeout(() => { fr.contentWindow.focus(); fr.contentWindow.print(); }, 300);
  }
  $('mPdfCoord').onclick = exportarPdf;
})();
