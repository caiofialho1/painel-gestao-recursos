/* "Atualizar agora": além de reler o banco, quando o painel roda pelo servidor local (iniciar_painel.cmd) executa
   Excel → banco (migrar_excel.py) e PStock/fotos dos coordenadores → banco (enviar_painel_dados.py) e depois recarrega.
   Sem o servidor local (ex.: GitHub Pages) ou sem a chave service_role, apenas relê o banco. */
'use strict';
(() => {
  const btn = $('refresh'), note = $('syncRun'); if (!btn) return;
  const original = btn.onclick, label = btn.textContent;
  const api = (path, opt) => fetch(path, { cache: 'no-store', ...opt }).then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw Error(j.erro || 'HTTP ' + r.status); return j; });
  const show = (t, s, title) => { if (!note) return; note.hidden = !t; note.textContent = t || ''; note.dataset.s = s || 'off'; note.title = title || ''; };
  const wait = ms => new Promise(r => setTimeout(r, ms));

  async function disponivel() { try { return (await api('/api/sync/status')).disponivel; } catch (e) { return false; } }
  btn.onclick = async () => {
    if (btn.disabled) return;
    if (!(await disponivel())) { show(''); return original && original.call(btn); }
    btn.disabled = true; btn.textContent = 'Atualizando…'; show('Executando Excel → banco, fotos novas e PEX/fotos dos coordenadores…', 'warn');
    try {
      await api('/api/sync/executar', { method: 'POST', headers: { 'X-KW-Sync': '1' } });
      let st; do { await wait(2500); st = await api('/api/sync/status'); } while (st.rodando);
      const u = st.ultimo, falhas = u.partes.filter(p => !p.ok);
      show(u.ok ? `Atualizado (${u.segundos}s): ${u.partes.map(p => p.nome).join(' · ')}` : 'Falha em: ' + falhas.map(p => p.nome).join(', ') + ' (passe o mouse para detalhes)',
           u.ok ? 'ok' : 'err', u.partes.map(p => `[${p.ok ? 'ok' : 'FALHA'}] ${p.nome}\n${p.saida}`).join('\n\n'));
      if (window.SupabaseSource?.enabled()) window.SupabaseSource.load();
    } catch (e) { show('Não foi possível atualizar: ' + e.message, 'err'); }
    finally { btn.disabled = false; btn.textContent = label; }
  };
})();
