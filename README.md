# Mostra Cultural 2026 — Sistema de Gestão

Sistema pensado para a Mostra Cultural 2026 do Colégio Franciscano Pio XII.

**Arquitetura:** Google Forms → Google Sheets → Google Apps Script → API JSON → GitHub Pages.

## Decisões atuais

- Identificação
- Sobre o Projeto
- Apoio TE
- Dispositivos e Periféricos
- Fabricação Digital
- TI
- Audiovisual
- Manutenção
- Comunicação
- Gestão
- Não existe aba separada de Espaços. O espaço acompanha cada projeto em todas as áreas.
- Mobiliário fica dentro de Manutenção.
- Limpeza não é uma aba.
- Fabricação Digital permanece como aba própria.
- Checklist é independente por setor e fica gravado em `DEMANDAS`.
- Auditoria é protegida por uma única senha administrativa, validada no Apps Script.
- Dados originais do Forms não são apagados.

## Teste local

Abra `script.js` e mantenha:

```js
API_URL: "",
DEMO_MODE: true
```

Rode o `index.html` com Live Server. O arquivo `data/sample.json` contém as duas respostas que estavam na planilha enviada para teste.

Quando a API for configurada:

```js
API_URL: "URL_DO_WEB_APP_DO_APPS_SCRIPT",
DEMO_MODE: false
```

Com API configurada, o site **não volta para dados fictícios** quando ocorrer um erro; ele informa que a API está indisponível.

## Planilha real mapeada

Spreadsheet ID já configurado no backend:

`1VrySS4AMjCvqP5L32XemA3p-LgpFhyKXyRXkxRQo_bc`

Aba de respostas real:

`Respostas ao formulário 1`

Pasta raiz do Drive:

`1JpC5AyRYfn98clkKV5TFq0T3Jm7Satt2`

O mapeamento foi construído a partir das 118 colunas reais presentes na planilha enviada.

### Principais grupos

- A: timestamp
- B–I: identificação e projeto
- J–Q: TE
- R–W: Dispositivos e Periféricos
- X–AG: Fabricação Digital
- AH–AK: TI
- AL–AQ: Audiovisual
- AR–BD: Comunicação
- BE–BH: espaço + disponibilidade para preparação
- BI–BM: mobiliário/movimentação
- BN–DB: Item 01 a Item 41 — estruturas expositivas
- DC–DE: tomadas/extensões
- DF–DM: Manutenção
- DN: setores de apoio solicitados

**Observação:** a planilha atual não possui uma coluna `Tema do Projeto`. Por isso o filtro Tema fica desabilitado até que o Forms passe a coletar esse dado ou até que ele seja criado por ajuste administrativo.

## Comunicação

O painel de Comunicação foi preparado para mostrar os textos e solicitações do Forms por projeto, incluindo:

- texto para faixa;
- texto da justificativa;
- gráfica externa;
- esboço para criação de arte;
- banner em lona;
- texto e medida do banner;
- itens personalizados e quantidade;
- outras solicitações e quantidade;
- arquivos/imagens associados;
- espaço do projeto;
- checklist do setor.

## Manutenção

Manutenção fica em uma única aba, com filtro interno por:

- Marcenaria
- Jardinagem
- Serralheria
- Pintura / acabamento
- Mobiliário / movimentação
- Elétrica / tomadas / extensões
- Estruturas expositivas
- Outras solicitações

As categorias são derivadas principalmente da resposta de subsetor e dos campos específicos do Forms.

## Gestão

A gestão consolida as quantidades que o Forms coleta diretamente:

- Notebook Dell
- Chromebook
- iPad
- Fone de ouvido
- Mouse
- Projetor
- Caixa de som
- Microfone
- TV / monitor
- Extensões

Recursos em texto livre sem campo de quantidade não são transformados artificialmente em números; o painel mostra a quantidade de projetos solicitantes.

A disponibilidade dos equipamentos vem da aba `ESTOQUE`.

A instalação inicial preserva 80 Chromebooks, 100 iPads e 10 Projetores como valores de planejamento do protótipo; os demais ficam em branco até confirmação administrativa.

## Estruturas expositivas

Os 41 itens `Item 01` a `Item 41` do Forms são somados por projeto e comparados com a aba `ESTRUTURAS`.

A aba `ESTRUTURAS` é preenchida com o catálogo fornecido, incluindo descrição e quantidade em depósito.

## Drive

O Apps Script cria automaticamente, dentro da pasta raiz:

```text
Mostra Cultural 2026
└── PROJETOS
    └── MC26-XXXXXXXXXX - Título do Projeto
        ├── Imagens
        ├── Croquis
        ├── Arquivos
        ├── Fabricação Digital
        └── Comunicação
```

Os arquivos originais enviados pelo Forms não são movidos. Quando houver permissão, o backend cria uma cópia organizada na pasta do projeto e registra o vínculo em `ARQUIVOS`.

## Apps Script

### Primeira configuração

1. Abra a planilha real.
2. Vá em **Extensões → Apps Script**.
3. Copie todos os arquivos `.gs` desta pasta.
4. Execute `setupInicial()`.
5. Autorize Sheets e Drive.
6. Execute, uma vez, `setAdminPassword('SUA_SENHA')`.
7. Execute `criarGatilhos()`.
8. Publique como **Web App**.
9. Use a URL `/exec` no `CONFIG.API_URL` do `script.js`.

### Gatilhos

`criarGatilhos()` cria:

- sincronização ao enviar o Forms;
- captura de edição manual na aba `PROJETOS`;
- sincronização periódica a cada 5 minutos.

A consulta do site ocorre a cada 45 segundos quando a API está configurada.

## Checklist

Cada setor marca a própria demanda por projeto.

O registro fica em `DEMANDAS`:

- projectId
- setor
- subsetor
- demanda
- status
- observação
- data/hora
- responsável

## Auditoria

A auditoria usa apenas uma senha administrativa.

A senha fica no `ScriptProperties` do Apps Script.

O site não contém a senha.

As alterações do site são registradas em `AJUSTES` e `AUDITORIA`, mantendo o valor original separado do valor administrativo atual.

## Publicação

Suba no GitHub Pages apenas:

- `index.html`
- `style.css`
- `script.js`
- `assets/`
- `data/` apenas para teste/local, se desejado

Os arquivos da pasta `apps-script/` ficam no projeto de Apps Script e não precisam ser publicados no GitHub Pages para o site funcionar.
