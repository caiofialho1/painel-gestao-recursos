/* Diálogo de entrada do Supabase (link por e-mail). */
'use strict';
(() => {
  const dlg = $('sbDialog');
  $('connectSb').onclick = async () => {
    if (await window.SupabaseSource.session()) { await window.SupabaseSource.signOut(); return; }
    $('sbMsg').textContent = ''; dlg.showModal();
  };
  $('sbCancel').onclick = () => dlg.close();
  $('sbPassGo').onclick = async () => {
    $('sbPassGo').disabled = true;
    try { await window.SupabaseSource.signInPassword($('sbEmail').value.trim(), $('sbPass').value); $('sbPass').value = ''; dlg.close(); }
    catch (e) { $('sbMsg').textContent = e.message; }
    finally { $('sbPassGo').disabled = false; }
  };
  $('sbPass').onkeydown = e => { if (e.key === 'Enter') $('sbPassGo').click(); };
  $('sbSend').onclick = async () => {
    $('sbSend').disabled = true;
    try { await window.SupabaseSource.sendLink($('sbEmail').value.trim()); $('sbMsg').textContent = 'Link enviado. Abra o e-mail neste computador e clique no link para entrar.'; }
    catch (e) { $('sbMsg').textContent = e.message; }
    finally { $('sbSend').disabled = false; }
  };
})();
