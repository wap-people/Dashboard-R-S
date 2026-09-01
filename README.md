# Dashboard R&S 2026 — Vagas WAP

Painel de Recrutamento & Seleção da WAP, servido pelo GitHub Pages e alimentado
ao vivo pela planilha **FAROL DE VAGAS 2026 WAP**.

- **Site:** https://wap-people.github.io/Dashboard-R-S/
- **Planilha:** [FAROL DE VAGAS 2026 WAP, aba `Vagas 2026`](https://docs.google.com/spreadsheets/d/1QBdTqpH2isttaOxsimdScFZote3eCSQxnVAi2JBFM8Y/edit#gid=982409738)

Esta é a versão migrada do projeto que antes rodava no Lovable
(`dashboard-r-s.lovable.app`). Os cálculos, o layout e os textos são os mesmos;
só a forma de ler a planilha e de publicar mudou.

---

## Como o painel lê a planilha

No Lovable a leitura acontecia **no servidor**, pelo connector do Google Sheets,
com duas chaves secretas (`LOVABLE_API_KEY` e `GOOGLE_SHEETS_API_KEY`).

O GitHub Pages serve só arquivos estáticos — não existe servidor para guardar
chave nenhuma. Por isso agora **o próprio navegador de quem abre o painel** lê a
planilha, pelo endpoint público de exportação do Google Sheets:

```
https://docs.google.com/spreadsheets/d/<ID>/gviz/tq?tqx=out:csv&gid=<GID>
```

Esse endereço não pede chave de API e o Google devolve o cabeçalho
`Access-Control-Allow-Origin`, o que autoriza a leitura pelo navegador.

> [!IMPORTANT]
> Para isso funcionar, a planilha precisa continuar compartilhada como
> **“qualquer pessoa com o link pode ver”**. Se o compartilhamento for fechado,
> o painel deixa de atualizar e mostra um aviso vermelho acima do rodapé.

A cada abertura da página o painel busca os dados novamente, então **não existe
mais “republicar para atualizar”**: editar a planilha já atualiza o painel.
O botão *Atualizar do Google Sheets* força uma releitura na hora.

### Ponto de atenção sobre exposição de dados

Este repositório é público, então o ID da planilha fica visível no código do
site. Como a planilha está compartilhada por link, qualquer pessoa que veja esse
ID consegue baixar a aba inteira — inclusive as colunas **Salário** e **Nome
candidato contratado**, que o painel não exibe.

Vale notar que isso **já era verdade antes**: a planilha está aberta por link
desde antes da migração, e o site do Lovable também era público. A migração não
diminuiu nem aumentou o acesso à planilha, só deixou o ID visível no código.

Se quiser fechar isso, há dois caminhos — me chame que eu monto qualquer um:

1. **Separar a base**: criar uma planilha só com as ~16 colunas que o painel usa
   (sem salário e sem nome de candidato) e apontar o painel para ela, deixando a
   planilha principal restrita.
2. **Publicar um retrato periódico**: um workflow do GitHub Actions lê a planilha
   com credencial guardada em *Secrets*, grava só as colunas necessárias em um
   arquivo do site e republica de hora em hora. A planilha volta a ser privada,
   ao custo de os dados ficarem defasados pelo intervalo escolhido.

---

## Publicar (primeira vez)

O deploy é automático, mas o GitHub Pages precisa ser ligado uma vez:

1. No repositório, abra **Settings › Pages**.
2. Em **Build and deployment › Source**, escolha **GitHub Actions**.
3. Pronto. O próximo envio para a branch `main` publica o site.

Para acompanhar ou disparar na mão: aba **Actions › Publicar no GitHub Pages**.

---

## Como editar

Cada envio para `main` reconstrói e republica o site em cerca de um minuto.

**Pelo site do GitHub** (não precisa instalar nada): abra o arquivo, clique no
lápis, edite, e confirme em *Commit changes*.

**No computador** (precisa do [Node.js](https://nodejs.org) 20 ou mais novo):

```bash
npm install
npm run dev
```

O `npm run dev` abre o painel em `http://localhost:5173` e recarrega a cada
alteração salva — é a forma mais confortável de mexer no layout.

Para conferir o resultado final antes de publicar:

```bash
npm run build
npm run preview
```

---

## Onde fica cada coisa

| Arquivo | O que é |
| --- | --- |
| `src/App.tsx` | A tela inteira: cabeçalho, abas, cartões, tabelas e o modal de importar |
| `src/lib/rs-analytics.ts` | Todos os cálculos (KPIs, backlog, SLA, aging) e o leitor da planilha colada |
| `src/lib/sheets.ts` | Busca a planilha no Google e converte o CSV |
| `src/styles.css` | Cores, tipografia e animações (design system) |
| `src/data/vagas.json` | Retrato da base usado só enquanto o Google responde |
| `index.html` | Título da aba, descrição e fonte Inter |
| `.github/workflows/deploy.yml` | O processo que constrói e publica |

### Mexer nos números mais comuns

- **Meta de SLA (25 dias):** `META_SLA`, no topo de `src/lib/rs-analytics.ts`.
- **Trocar de planilha ou de aba:** `SPREADSHEET_ID` e `SHEET_GID`, no topo de
  `src/lib/sheets.ts`. O `gid` aparece como `#gid=...` no link ao abrir a aba.
- **Cores do painel:** o bloco `:root` em `src/styles.css`.
- **Nome do repositório mudou?** Ajuste `base` em `vite.config.ts`, senão o site
  publicado carrega sem estilo.

---

## Qualidade dos dados na planilha

A leitura foi conferida contra os dois endpoints de exportação do Google e os
dois devolvem exatamente o mesmo conteúdo: **1.194 vagas, 31 colunas**.

Nessa checagem apareceram **7 linhas com as células deslocadas uma coluna à
esquerda** a partir de *Base vagas* — o título da vaga cai em `Base vagas`, o
status cai em `Nome do substituido` e a base vai para `Origem do candidato`.
As primeiras são as linhas **2, 4 e 5** da aba.

O painel lê essas linhas como “status vazio”, então elas não entram nas contas de
abertas nem de fechadas. Isso **não é efeito da migração** — a versão do Lovable
lia a mesma planilha e enxergava o mesmo desalinhamento. Corrigir na planilha faz
os números fecharem, e nada precisa mudar no código.

---

## Migração: o que mudou em relação ao Lovable

| Antes (Lovable) | Agora (GitHub Pages) |
| --- | --- |
| TanStack Start com servidor (SSR) | Site estático, React puro com Vite |
| Leitura da planilha no servidor, com 2 chaves secretas | Leitura no navegador, endpoint público, sem chave |
| Publicação consumia créditos da plataforma | Publicação gratuita pelo GitHub Actions |
| ~40 dependências (shadcn/ui, Radix, recharts) sem uso na tela | 8 dependências, só o necessário |

Os gráficos nunca dependeram de biblioteca: as barras são `div` com largura em
porcentagem e as roscas são `conic-gradient`. Por isso a aparência foi preservada
sem trazer nada disso.
