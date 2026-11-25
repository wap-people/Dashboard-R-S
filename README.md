# Farol de Vagas WAP

Plataforma de controle de vagas de Recrutamento & Seleção da WAP, com login por
usuário, base compartilhada e edição simultânea. Substitui a planilha
"FAROL DE VAGAS 2026 WAP" (migrada em 16/11/2026) e o antigo dashboard que lia
essa planilha.

- **Endereço:** https://wap-people.github.io/Dashboard-R-S/
- **Banco:** Supabase, projeto "Farol de Vagas WAP" (região São Paulo, `ndivtivopjndgagnalaf`)
- **Responsável:** People / R&B

## O que tem

| Tela | Quem vê | Para quê |
| --- | --- | --- |
| Painel | todos | Acumulado, fechamento mês a mês e cenário atual (mesmos cálculos do dashboard antigo) |
| Vagas | todos | Buscar, cadastrar e atualizar vagas; histórico de cada vaga; exportar CSV |
| Usuários | admin | Liberar, bloquear e mudar o papel de quem acessa |
| Listas | admin | Opções aceitas em Unidade, Status, Etapa, Regime, Turno etc. |
| Auditoria | admin | Quem alterou o quê, quando, com valor anterior e novo |

Papéis: **Admin** (vê e edita tudo, inclusive salário) e **Recrutador**
(cadastra e atualiza vagas, sem acesso a salário, usuários ou auditoria geral).

## Segurança e governança

As regras ficam **no banco**, não na tela. Mesmo alguém que copie a chave
publicável do código não lê nada sem estar logado e cadastrado.

- **Porteiro de login:** só cria conta para e-mail `@wap.ind.br` cadastrado e ativo em Usuários. Qualquer outro e-mail é recusado pelo próprio banco.
- **RLS em todas as tabelas**, negando tudo por padrão. Visitante anônimo não tem permissão em nenhuma tabela.
- **Salário em tabela separada**, legível e gravável só por admin.
- **Sem exclusão física.** Vaga é "excluída" com motivo, só por admin, e pode ser restaurada. Não existe permissão de DELETE.
- **Auditoria imutável** de vagas, salários, usuários e listas (antes, depois, usuário, data e hora). Nem admin consegue apagar ou alterar.
- **Carimbos automáticos** (criado por, alterado por, datas, versão) preenchidos pelo banco, ignorando o que o navegador enviar.
- **Edição simultânea segura:** cada vaga tem número de versão. Se duas pessoas editam a mesma vaga, a segunda é avisada em vez de sobrescrever a primeira.
- **Validações de negócio:** listas controladas, vaga Fechada exige data de fechamento, data de fechamento não pode ser futura nem anterior à abertura, substituição exige o nome do substituído.
- **Sempre um admin ativo:** o banco impede bloquear ou rebaixar o último administrador.
- **Downloads registrados:** toda exportação de CSV (tela Vagas ou Painel) entra na auditoria com usuário, quantidade de linhas e filtros.
- **Saída automática** após 60 minutos sem uso, contados entre todas as abas. Vale também para quem fecha o navegador sem sair: ao reabrir depois do limite, a sessão é encerrada antes de qualquer dado aparecer.
- **Credencial a cada entrada:** o login pede a senha da Microsoft mesmo com a conta aberta no navegador (`prompt=login`), para que num computador compartilhado ninguém entre com a conta de outra pessoa.
- **Exportações sem fórmulas:** células que começam com = + - @ saem como texto, para que nada digitado numa vaga vire fórmula ou link ativo no Excel.
- **Não abre dentro de outros sites** (bloqueio de iframe contra clickjacking).
- **Backup diário** às 02h (horário de Brasília) dentro do banco, guardado por 35 dias, além do botão "Exportar planilha (CSV)" na tela Vagas.
- Página com `noindex` e política de conteúdo (CSP) que só permite falar com o próprio Supabase.

A estrutura completa está em `supabase/migrations/`. Ajustes posteriores ficam
registrados no histórico de migrações do próprio projeto Supabase.

## Login

Somente pela **conta Microsoft da WAP** (aplicativo "Farol de Vagas WAP" no
Microsoft Entra, restrito ao diretório da WAP). O login por e-mail e senha está
desligado no Supabase, e o banco recusa qualquer conta que não venha da Microsoft.
O segredo do aplicativo no Entra vale 24 meses (criado em nov/2026).

## Como editar e publicar

Cada envio para `main` gera uma nova versão, mas ela **só vai ao ar depois de
aprovada** por um responsável: em **Actions › Publicar no GitHub Pages**, abra a
execução pendente e clique em *Review deployments › Approve and deploy*. A branch
`main` também não aceita reescrita de histórico nem exclusão.

```bash
npm install
npm run dev     # http://localhost:5173/Dashboard-R-S/
npm run build
```

| Arquivo | O que é |
| --- | --- |
| `src/Plataforma.tsx` | Login, menu, carregamento dos dados e atualização em tempo real |
| `src/Vagas.tsx`, `src/VagaForm.tsx` | Lista de vagas e formulário com histórico |
| `src/Admin.tsx` | Usuários, Listas e Auditoria |
| `src/App.tsx` | Painel (o dashboard original) |
| `src/lib/rs-analytics.ts` | Todos os cálculos do painel (KPIs, SLA, aging) |
| `src/lib/dados.ts` | Leitura do banco e conversão para o painel |
| `src/lib/supabase.ts` | Endereço do banco, chave publicável e formas de login |

- **Meta de SLA (25 dias):** `META_SLA`, no topo de `src/lib/rs-analytics.ts`.
- **Repositório renomeado?** Ajuste `base` em `vite.config.ts` e as URLs de retorno no Supabase (Authentication › URL Configuration).

## Banco sempre ativo (plano Free)

O plano Free do Supabase **pausa o projeto depois de 7 dias sem consultas de
usuário**, e com o banco pausado o painel não carrega. O backup diário que roda
dentro do banco (pg_cron) não conta como uso.

Por isso o workflow `.github/workflows/manter-supabase-ativo.yml` chama a função
`public.manter_ativo()` duas vezes por dia (08:17 e 19:47, horário de Brasília). A
função só devolve o horário do servidor: não lê tabela nenhuma. Ela foi criada na
migração `manter_ativo` do projeto Supabase, em 23/11/2026.

- **Se o GitHub mandar e-mail de falha** desse workflow, o projeto provavelmente já
  foi pausado. Reative em Supabase › projeto Farol de Vagas WAP › *Resume project*.
  Os dados ficam guardados por 90 dias depois da pausa.
- **Solução definitiva:** passar a organização para o plano **Pro**, que não pausa.
  Feito isso, o workflow e a função podem ser removidos.

## Planilha antiga

A planilha "FAROL DE VAGAS 2026 WAP" fica como backup e histórico, somente leitura.
Ela contém salário e nome de contratados; o ideal é restringir o compartilhamento
a pessoas da WAP.
