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
    btn.disabled = true; btn.textContent = 'Atualizando…'; show('Executando Excel → banco, fotos novas e PEX/coordenadores…', 'warn');
    try {
      await api('/api/sync/executar', { method: 'POST', headers: { 'X-KW-Sync': '1' } });
      let st; do { await wait(2500); st = await api('/api/sync/status'); } while (st.rodando);
      const u = st.ultimo, falhas = u.partes.filter(p => !p.ok);
      show(u.ok ? `Atualizado (${u.segundos}s): ${u.partes.map(p => p.nome).join(' · ')}` : 'Falha em: ' + falhas.map(p => p.nome).join(', ') + ' (passe o mouse para detalhes)',
           u.ok ? 'ok' : 'err', u.partes.map(p => `[${p.ok ? 'ok' : 'FALHA'}] ${p.nome}\n${p.saida}`).join('\n\n'));
      if (window.SupabaseSource?.enabled()) window.SupabaseSource.load();
    } catch (err) { show('Não foi possível atualizar: ' + err.message, 'err'); }
    finally { btn.disabled = false; btn.textContent = label; }
  };
})();
