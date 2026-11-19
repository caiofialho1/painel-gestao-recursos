/* "Exportar relatório" (aba Mapa e inventário de recursos): gera um Excel (.xlsx) SÓ com a tabela de itens, com as informações
   de cada cadastro e as fotos embutidas (miniaturas). Sem resumo, gráficos ou filtros. Somente leitura.
   Fonte dos dados: window.KW_ITENS (mapa_recursos.js) = todas as linhas da tabela atual, não só as carregadas na tela. */
'use strict';
(() => {
  const anchor = $('mPhotos'); if (!anchor || typeof window.KW_ITENS !== 'function') return;
  const EXCELJS = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';   // carregado só ao exportar
  const FOTO_W = 160, FOTO_H = 120, MAX_FOTOS = 4, PARALELO = 6;

  const wrap = document.createElement('div'); wrap.className = 'exp-wrap';
  wrap.innerHTML = '<button id="mExport" type="button" title="Exporta a tabela de itens, com fotos, em Excel">Exportar relatório</button><p id="expMsg" role="status"></p>';
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
})();
