/* Conexão direta ao SharePoint via Microsoft Graph (somente leitura).
   Preencha clientId com o "ID do aplicativo (cliente)" do registro no Microsoft Entra ID
   (Aplicativo SPA, permissão delegada Files.Read.All, consentida no primeiro login).
   URI de redirecionamento do registro (tipo SPA): a mesma URL em que o painel é aberto,
   por exemplo http://localhost:5501/painel/painel_atualizacoes.html (Live Server do VS Code).
   Com clientId vazio o painel continua usando o arquivo sincronizado pelo OneDrive. */
window.KW_SHAREPOINT = {
  clientId: '', // vazio = modo arquivo sincronizado. Reativar após aprovação do administrador: <ID do aplicativo>
  tenantId: '',
  host: 'kwbrasil.sharepoint.com',
  sitePath: '/sites/APP_GestaoDeRecursos',
  file: 'BD_Inventario_KW.xlsx',
  // Link do arquivo no SharePoint; o painel lê por ele (Graph /shares), só com a permissão Files.Read.All.
  link: 'https://kwbrasil.sharepoint.com/sites/APP_GestaoDeRecursos/Documentos%20Compartilhados/BD_Inventario_KW.xlsx'
};
