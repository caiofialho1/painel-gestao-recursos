/* "Atualizar agora": executa Excel → banco, fotos novas → banco e PEX/fotos dos coordenadores → banco pelo servidor local
   (iniciar_painel.cmd / painel_servidor.py, 127.0.0.1:5501) e depois recarrega o painel. Funciona também a partir do GitHub Pages.
   Sem o servidor local ou sem a chave, relê o banco e AVISA que planilha e fotos não foram enviadas. */
'use strict';
(() => {
  const btn = $('refresh'); if (!btn) return;
  const original = btn.onclick, label = btn.textContent;
  const BASE = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) ? '' : 'http://127.0.0.1:5501';
  const api = (path, opt, ms = 0) => fetch(BASE + path, { cache: 'no-store', ...(ms ? { signal: AbortSignal.timeout(ms) } : {}), ...opt }).then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw Error(j.erro || 'HTTP ' + r.status); return j; });
  const wait = ms => new Promise(r => setTimeout(r, ms));
  function show(texto, s, detalhe) {
    const bar = $('syncBar'); if (!bar) return;
    let chip = $('syncRun');
    if (!chip) { chip = document.createElement('span'); chip.id = 'syncRun'; chip.className = 'sync-chip'; bar.appendChild(chip); }
    bar.hidden = false; chip.textContent = texto; chip.dataset.s = s || 'off'; chip.title = detalhe || '';
  }

  // Barra de progresso (% geral + etapa atual), alimentada por /api/sync/status → progresso
  function barra(pr) {
    const bar = $('syncBar'); if (!bar) return;
    let el = $('syncProg');
    if (!pr) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement('div'); el.id = 'syncProg'; el.className = 'sync-progress';
      el.innerHTML = '<div class="sync-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-label="Progresso da atualização"><div class="sync-progress-fill"></div></div><span class="sync-progress-pct"></span><span class="sync-progress-txt"></span>';
      bar.appendChild(el);
    }
    bar.hidden = false;
    const pct = Math.max(0, Math.min(100, pr.pct || 0));
    el.querySelector('.sync-progress-track').setAttribute('aria-valuenow', pct);
    el.querySelector('.sync-progress-fill').style.width = pct + '%';
    el.querySelector('.sync-progress-pct').textContent = pct + '%';
    el.querySelector('.sync-progress-txt').textContent = `Etapa ${pr.etapa}/${pr.total}: ${pr.nome}${pr.texto ? ' · ' + pr.texto : ''}`;
  }

  async function estado() { try { return { ligado: true, ...(await api('/api/sync/status', undefined, 12000)) }; } catch (e) { return { ligado: false, bloqueado: e.name === 'TimeoutError' }; } }
  btn.onclick = async () => {
    if (btn.disabled) return;
    const e = await estado();
    if (!e.ligado && BASE) {
      show(e.bloqueado ? 'Sem resposta do servidor local. Permita o acesso à rede local para este site (ícone ao lado do endereço) ou abra http://localhost:5501/painel/painel_atualizacoes.html. Planilha e fotos NÃO foram enviadas'
                       : 'Servidor local desligado: planilha e fotos NÃO foram enviadas (abra http://localhost:5501/painel/painel_atualizacoes.html ou iniciar_painel.cmd)', 'warn');
      return original && original.call(btn);
    }
    if (!e.ligado || !e.disponivel) {
      show(!e.ligado ? 'Servidor local desligado: planilha e fotos NÃO foram enviadas (abra iniciar_painel.cmd)' : 'Servidor sem a chave: rode guardar_chave.cmd. Planilha e fotos NÃO foram enviadas', 'warn');
      return original && original.call(btn);
    }
    btn.disabled = true; btn.textContent = 'Atualizando…'; show('Atualizando…', 'warn');
    barra({ etapa: 1, total: 3, nome: 'Excel → banco', pct: 0, texto: 'iniciando' });
    try {
      await api('/api/sync/executar', { method: 'POST', headers: { 'X-KW-Sync': '1' } });
      let st; do {
        await wait(1000); st = await api('/api/sync/status');
        if (st.rodando && st.progresso) { barra(st.progresso); btn.textContent = `Atualizando… ${st.progresso.pct}%`; }
      } while (st.rodando);
      barra({ etapa: 3, total: 3, nome: 'concluído', pct: 100, texto: '' }); setTimeout(() => barra(null), 4000);
      const u = st.ultimo, falhas = u.partes.filter(p => !p.ok);
      show(u.ok ? `Atualizado (${u.segundos}s): ${u.partes.map(p => p.nome).join(' · ')}` : 'Falha em: ' + falhas.map(p => p.nome).join(', ') + ' (passe o mouse para detalhes)',
           u.ok ? 'ok' : 'err', u.partes.map(p => `[${p.ok ? 'ok' : 'FALHA'}] ${p.nome}\n${p.saida}`).join('\n\n'));
      if (window.SupabaseSource?.enabled()) window.SupabaseSource.load();
    } catch (err) { barra(null); show('Não foi possível atualizar: ' + err.message, 'err'); }
    finally { btn.disabled = false; btn.textContent = label; }
  };
})();
