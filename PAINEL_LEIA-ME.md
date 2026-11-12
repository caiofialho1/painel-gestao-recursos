# Painel de atualizações — fonte do aplicativo

1. Abra `painel_atualizacoes.html` no Microsoft Edge ou Google Chrome. Mantenha `fonte_app.js` na mesma pasta.
2. Clique em **Conectar base do app**.
3. Selecione `BD_Inventario_KW.xlsx` dentro da biblioteca **APP_GestaoDeRecursos** sincronizada no computador pelo OneDrive. Não selecione a cópia antiga da pasta PowerApps nem um arquivo baixado avulso.
4. Confirme a origem. O navegador precisa de sua seleção para conceder acesso de leitura; a planilha não é alterada.
5. O painel relê as tabelas **Equipamentos**, **Obras** e **Gestores** a cada 30 segundos enquanto estiver aberto. O OneDrive precisa estar ativo e atualizado. A indicação “verificado em” informa a leitura local, não confirma que o OneDrive já recebeu tudo da nuvem.
6. Escolha **Agrupar por → Gestor, CR ou Estado (UF)**. Cada opção mostra uma linha por grupo.
7. Preencha **Prazo individual** na linha desejada. Os prazos são independentes por gestor, CR e estado e são salvos somente neste navegador. Limpe o campo para remover um prazo. O prazo geral da versão anterior não é aplicado automaticamente a ninguém.

Ao reabrir ou recarregar a página, o painel recupera o arquivo salvo no IndexedDB e tenta reconectá-lo automaticamente. Se o navegador exigir permissão novamente, clique em **Autorizar acesso**, sem precisar selecionar o arquivo. Use **Trocar base** somente para escolher outro arquivo. Não é necessário importar os cadastros nem registrá-los novamente no painel. O botão **Atualizar agora** antecipa a próxima leitura.

O relatório usa linhas compactas e ajusta a altura conforme a janela. Verificado com 16 gestores em 1366 × 768, sem rolagem vertical para ver os gestores. Mais grupos ou janelas menores podem exigir rolagem. Estado usa a coluna UF da tabela Obras; registros sem vínculo com obra ficam em “Não informado”. Os prazos de grupos diferentes não se propagam entre si.

## O que é contado

Cada linha não vazia da tabela Equipamentos conta como um cadastro, agrupado pelo Gestor/EmailGestor e pela data CriadoEm. A coluna Quantidade não multiplica registros. Gestores sem cadastros aparecem a partir das tabelas Gestores e Obras. Registros sem data válida entram no total do gestor e ficam fora da linha do tempo, com aviso na conexão.

A base atual não contém histórico de edições por equipamento. Portanto o gráfico representa **cadastros**, e não todas as alterações feitas no app. Para contar edições será necessário registrar cada alteração no aplicativo, em uma tabela de histórico com identificador do equipamento, gestor, CR, data/hora e ação.

Os lançamentos manuais das versões anteriores não são somados à base do app. Eles permanecem no armazenamento anterior do navegador. Em falha de leitura, o painel preserva a última leitura válida da sessão e mostra o erro; não substitui dados por zeros.

## Verificação

Leitura XLSX e interface testadas no Edge, usando a cópia local antiga apenas como fixture de teste: tabelas com 26 equipamentos e 33 obras, nova leitura com 27 registros, prazos individuais preservados, agrupamentos por gestor/CR/UF com totais consistentes, datas Excel/brasileiras/ISO, fuso de São Paulo, histórico e tela móvel. A conexão com a biblioteca sincronizada atual é feita pelo usuário no seletor do navegador.

A integração usa File System Access (`showOpenFilePicker` e `getFile`), conforme a documentação do Chrome: https://developer.chrome.com/docs/capabilities/web-apis/file-system-access

## Resumo somente de coordenadores

O agrupamento por pessoa usa exclusivamente os responsáveis pelos CRs na tabela Obras: coluna Coordenador/EmailCoordenador quando disponível, senão Gestor/EmailGestor (campos usados pelo app para o coordenador). A tabela Gestores serve somente para padronizar nomes/e-mails; não inclui todas as pessoas do diretório no resumo. Gerente/EmailGerente não alimentam as linhas.

Os cadastros são atribuídos ao coordenador do CR, inclusive quando enviados por um gerente. CR sem vínculo com Obras fica em “Coordenador não informado”, sem presumir o cargo do autor. Prazos existentes dos mesmos responsáveis são preservados. Validado no Edge com 12 responsáveis vinculados às 33 obras da fixture, mantendo os 26 cadastros e os agrupamentos por CR e UF.


A conexão é lembrada no mesmo navegador, perfil e endereço do painel. Limpar os dados do navegador, usar uma janela privada ou mudar o endereço pode exigir uma nova seleção. A permissão de leitura é controlada pelo navegador. Quando disponível, escolha permitir o acesso nas próximas visitas. Testado no Edge com um FileSystemFileHandle real serializado em IndexedDB, recarga automática e fluxo de reautorização; o teste usou arquivo de teste local, sem alterar a base do app.

O eixo mostra semanas de segunda a domingo, com data e abreviação do dia da semana. A faixa fica vermelha nos dias até hoje, inclusive hoje, sem cadastro no grupo exibido. Dias com cadastro até hoje ficam verdes; dias futuros ficam cinza claro. A data atual usa o fuso de São Paulo. Essas cores representam tempo, sem indicar conclusão ou atraso. Os números mostram os cadastros por dia; o prazo individual continua tracejado.

## Conexão direta ao SharePoint (Microsoft Graph, somente leitura)

O painel pode ler `BD_Inventario_KW.xlsx` direto do site APP_GestaoDeRecursos, sem OneDrive sincronizado.

1. Registrar um aplicativo no Microsoft Entra ID (plataforma **SPA**) com permissões delegadas `Sites.Read.All` e `Files.Read.All` (pode exigir consentimento do administrador).
2. URI de redirecionamento: a URL em que o painel é aberto, por exemplo `http://localhost:5501/painel/painel_atualizacoes.html` (Live Server do VS Code). Não funciona em `file://`.
3. Colocar o ID do aplicativo em `clientId` no arquivo `config_sharepoint.js`.
4. Abrir o painel por essa URL e clicar em **Entrar com Microsoft**. A conexão é lembrada e atualiza a cada 30 s.

Com `clientId` vazio, o painel segue no modo OneDrive. O painel só faz leituras (GET) e não grava nada no SharePoint.
