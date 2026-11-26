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


## Relatório analítico (PStock × cadastrado)

Na aba Mapa e inventário, abaixo de **Exportar relatório**, o botão **Exportar analítico** gera um Excel que lista todos os itens previstos no PStock, conforme os filtros (coordenador, CR, grupo e busca), com os itens cadastrados no app ao lado. Escolha **abas por Coordenador, CR ou aba única**. A planilha **Resumo** traz PStock, cadastrado, diferença e aderência por CR.

Pareamento (por CR): 1) mesma TAG, patrimônio ou série; 2) o restante pelo equipamento, consumindo os cadastros até cobrir a quantidade da linha do PStock. Status: Conferido (TAG), Cadastrado, Parcial, Não cadastrado e Cadastrado sem PStock. Somente leitura; o PStock é apenas referência.

O botão **PDF por coordenador** abre a impressão do navegador (escolha "Salvar como PDF") com uma seção por coordenador, cada uma em página nova (A4 paisagem), conforme os filtros.

## Referência PEX (PStock): o que fica de fora
`python pstock/gerar_pex.py` gera `painel/pex_pstock.js` sem recursos de TI e sem itens de alta rotatividade/desgaste:
- grupo **Comunicação e TI** inteiro e **Materiais e acessórios**;
- tipos **Broca / bit** e **Lima / escova / raspador**;
- consumíveis por descrição (luva, fita, tapume, corrente plástica, protetor de corda, mola, abraçadeira, disco, lixa, eletrodo, arame, bocal, filtro etc.).
Os critérios ficam no topo de `pstock/gerar_pex.py` (`GRUPOS_FORA`, `TIPOS_FORA`, `RE_CONSUMIVEL`). Em 23/11/2026: 3.785 → 2.687 itens (1.098 removidos).

### Atualização 26/11/2026: EPI/EPC e consumíveis
Também ficam fora do PEX: o grupo **Segurança e proteção coletiva** inteiro (extintor, cone, bloqueio/LOTO, sinalização, manta/lona antichama, rede de segurança etc.), EPI e EPC em outros grupos (`RE_EPI_EPC`: guarda-corpo, lava-olhos, cinto/talabarte/trava-quedas, respirador, protetor auricular, botina, colete etc.) e mais consumíveis (fita/corrente/pedestal zebrado, placa de andaime, lona, serra copo e seu suporte, espátula, arco de serra, soquete de bit, lima, ponta/jogo de bits, macho de rosca, giz de linha). Resultado: 2.687 → 2.582 itens (a referência já vinha com a PStock de 10/11/2026). `painel/pex_pstock.js` é gerado e está no `.gitignore`; rode o script para atualizar o painel.

### Nomenclatura canônica (app é a referência)
O nome do equipamento do PStock é levado ao tipo do catálogo do app (aba Tipos de `BD_Inventario_KW.xlsx`), para a comparação por equipamento fechar:
- `pstock/classificar_pex.py` (`REGRAS`, específicas primeiro) converte cada descrição do PStock no tipo do app (ex.: "DETECTOR XL 4 GASE / KA42…" e "DETECTOR DE XL 4 GASE" → *Detector portátil de gás*; bomba d'água → *Motobomba*; ventilador/exaustor → *Exaustor / ventilador industrial*; tubo de andaime → *Tubo galvanizado*). Quando o app não tem tipo equivalente, fica um nome genérico (ex.: *Ferramenta elétrica / pneumática*).
- Cadastros "Outro equipamento" do app usam as mesmas regras (pelo modelo/observação); os demais tipos do app entram como estão, sem tradução.
- Para novo equipamento: acrescente a regra em `REGRAS` e rode `python pstock/gerar_pex.py`.

### Itens que ficam no PEX apesar das exclusões
`pstock/itens_manter_pex.lst` (descrição exata) tem prioridade sobre todas as exclusões: ferramentas e equipamentos elétricos, pneumáticos e hidráulicos que haviam sido removidos (chaves de impacto elétricas/a bateria, martelos demoledores, talhas elétrica/pneumática, ar-condicionado, compressor, bomba, máquinas de solda, locações de esmerilhadeira etc.). `pstock/PEX_removidos.xlsx` lista tudo o que foi removido, com o motivo.
