-- =====================================================================
-- Farol de Vagas WAP : estrutura, segurança e governança
-- Princípios:
--   * nega tudo por padrão (RLS em todas as tabelas, nada para "anon")
--   * só entra quem estiver cadastrado em public.perfis (e-mail @wap.ind.br)
--   * nenhuma exclusão física: vaga é "excluída" com motivo, só por admin
--   * toda alteração gera trilha de auditoria imutável
--   * controle de concorrência por versão (edição simultânea sem sobrescrever)
--   * salário em tabela separada, visível só para admin
-- =====================================================================

create extension if not exists citext with schema extensions;

-- Esquema privado: funções internas, não exposto pela API
create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated;

-- ---------------------------------------------------------------------
-- PERFIS (lista de quem pode acessar)
-- ---------------------------------------------------------------------
create table public.perfis (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid unique references auth.users(id) on delete set null,
  email           extensions.citext not null unique
                  constraint ck_perfis_email check (email ~* '^[a-z0-9._%+-]+@wap\.ind\.br$'),
  nome            text not null constraint ck_perfis_nome check (length(btrim(nome)) > 1),
  papel           text not null constraint ck_perfis_papel check (papel in ('admin', 'recrutador')),
  nome_recrutador text,
  ativo           boolean not null default true,
  ultimo_acesso   timestamptz,
  criado_em       timestamptz not null default now(),
  criado_por      uuid,
  atualizado_em   timestamptz not null default now(),
  atualizado_por  uuid
);
comment on table public.perfis is 'Usuários autorizados. Quem não está aqui (ativo) não entra nem lê nada.';

-- Funções de papel usadas nas políticas (security definer evita recursão de RLS)
create or replace function app.papel()
returns text language sql stable security definer set search_path = ''
as $$
  select p.papel from public.perfis p
  where p.user_id = (select auth.uid()) and p.ativo
$$;

create or replace function app.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(app.papel() = 'admin', false) $$;

create or replace function app.is_membro()
returns boolean language sql stable security definer set search_path = ''
as $$ select app.papel() is not null $$;

revoke all on function app.papel(), app.is_admin(), app.is_membro() from public, anon;
grant execute on function app.papel(), app.is_admin(), app.is_membro() to authenticated;

-- ---------------------------------------------------------------------
-- DOMÍNIOS (listas de valores: status, unidade, etapa...)
-- ---------------------------------------------------------------------
create table public.dominios (
  id        bigint generated always as identity primary key,
  categoria text not null constraint ck_dominio_categoria
            check (categoria in ('status', 'etapa', 'unidade', 'tipo_vaga', 'regime', 'base', 'origem')),
  valor     text not null constraint ck_dominio_valor check (length(btrim(valor)) > 0),
  ordem     int not null default 0,
  ativo     boolean not null default true,
  constraint uq_dominio unique (categoria, valor)
);

-- ---------------------------------------------------------------------
-- VAGAS
-- ---------------------------------------------------------------------
create table public.vagas (
  id               bigint generated always as identity primary key,
  cargo            text not null constraint ck_vaga_cargo check (length(btrim(cargo)) > 1),
  area             text,
  unidade          text not null,
  requisitante     text,
  recrutador       text,
  tipo_vaga        text,
  regime           text,
  base             text,
  status           text not null default 'Aberta',
  etapa            text,
  origem           text,
  data_abertura    date,
  data_fechamento  date,
  data_admissao    date,
  contratado       text,
  observacoes      text,
  linha_planilha   int,
  versao           int not null default 1,
  criado_em        timestamptz not null default now(),
  criado_por       uuid references auth.users(id) on delete set null,
  atualizado_em    timestamptz not null default now(),
  atualizado_por   uuid references auth.users(id) on delete set null,
  excluida_em      timestamptz,
  excluida_por     uuid references auth.users(id) on delete set null,
  motivo_exclusao  text,
  constraint ck_vaga_datas check (data_fechamento is null or data_abertura is null or data_fechamento >= data_abertura),
  constraint ck_vaga_exclusao check ((excluida_em is null) = (motivo_exclusao is null))
);
create index ix_vagas_ativas_abertura on public.vagas (data_abertura) where excluida_em is null;
create index ix_vagas_status on public.vagas (status) where excluida_em is null;
create index ix_vagas_recrutador on public.vagas (recrutador) where excluida_em is null;

-- Salário separado: só admin lê e grava
create table public.vagas_salario (
  vaga_id        bigint primary key references public.vagas(id) on delete restrict,
  salario        numeric(12, 2) constraint ck_salario check (salario is null or (salario >= 0 and salario <= 1000000)),
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid references auth.users(id) on delete set null
);

-- ---------------------------------------------------------------------
-- AUDITORIA (imutável)
-- ---------------------------------------------------------------------
create table public.auditoria (
  id            bigint generated always as identity primary key,
  em            timestamptz not null default now(),
  tabela        text not null,
  registro_id   text not null,
  acao          text not null constraint ck_aud_acao check (acao in ('INSERT', 'UPDATE', 'DELETE', 'IMPORT')),
  usuario_id    uuid,
  usuario_email text,
  campos        text[],
  antes         jsonb,
  depois        jsonb
);
create index ix_auditoria_registro on public.auditoria (tabela, registro_id, em desc);
create index ix_auditoria_em on public.auditoria (em desc);

create or replace function app.bloquear_alteracao_auditoria()
returns trigger language plpgsql set search_path = ''
as $$
begin
  raise exception 'A trilha de auditoria é imutável.';
end $$;
create trigger trg_auditoria_imutavel before update or delete or truncate on public.auditoria
  for each statement execute function app.bloquear_alteracao_auditoria();

create or replace function app.auditar()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_antes  jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_depois jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_campos text[];
  v_id     text;
begin
  if current_setting('app.importando', true) = 'on' then
    return coalesce(new, old);
  end if;
  v_id := coalesce(v_depois, v_antes) ->> (case when tg_table_name = 'vagas_salario' then 'vaga_id' else 'id' end);
  if tg_op = 'UPDATE' then
    select array_agg(k order by k) into v_campos
    from jsonb_object_keys(v_depois) k
    where k not in ('versao', 'atualizado_em', 'atualizado_por', 'ultimo_acesso')
      and v_depois -> k is distinct from v_antes -> k;
    if v_campos is null then
      return new; -- nada relevante mudou (ex.: só último acesso)
    end if;
  end if;
  insert into public.auditoria (tabela, registro_id, acao, usuario_id, usuario_email, campos, antes, depois)
  values (tg_table_name, v_id, tg_op, auth.uid(), auth.jwt() ->> 'email', v_campos, v_antes, v_depois);
  return coalesce(new, old);
end $$;

-- ---------------------------------------------------------------------
-- REGRAS DE NEGÓCIO E CARIMBOS (não confiam no que o navegador envia)
-- ---------------------------------------------------------------------
create or replace function app.valida_dominio(p_categoria text, p_valor text)
returns void language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_valor is not null and not exists (
    select 1 from public.dominios d where d.categoria = p_categoria and d.valor = p_valor and d.ativo
  ) then
    raise exception 'Valor "%" não é permitido para %. Peça a um admin para cadastrá-lo.', p_valor, p_categoria
      using errcode = 'check_violation';
  end if;
end $$;

create or replace function app.vagas_antes_gravar()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  importando boolean := current_setting('app.importando', true) = 'on';
begin
  -- limpeza de texto
  new.cargo        := nullif(btrim(new.cargo), '');
  new.area         := nullif(btrim(new.area), '');
  new.requisitante := nullif(btrim(new.requisitante), '');
  new.recrutador   := nullif(btrim(new.recrutador), '');
  new.contratado   := nullif(btrim(new.contratado), '');
  new.observacoes  := nullif(btrim(new.observacoes), '');

  if tg_op = 'INSERT' then
    new.versao := 1;
    if not importando then
      new.criado_em := now();
      new.criado_por := auth.uid();
      new.linha_planilha := null;
      new.excluida_em := null; new.excluida_por := null; new.motivo_exclusao := null;
      new.data_abertura := coalesce(new.data_abertura, (now() at time zone 'America/Sao_Paulo')::date);
    end if;
    new.atualizado_em := coalesce(new.criado_em, now());
    new.atualizado_por := new.criado_por;
  else
    -- campos que ninguém altera
    new.id := old.id;
    new.criado_em := old.criado_em;
    new.criado_por := old.criado_por;
    new.linha_planilha := old.linha_planilha;
    new.versao := old.versao + 1;
    new.atualizado_em := now();
    new.atualizado_por := auth.uid();
    -- exclusão lógica: só admin, com motivo
    if new.excluida_em is distinct from old.excluida_em or new.motivo_exclusao is distinct from old.motivo_exclusao then
      if not app.is_admin() then
        raise exception 'Somente administradores podem excluir ou restaurar vagas.' using errcode = 'insufficient_privilege';
      end if;
      if new.excluida_em is not null then
        new.excluida_em := now();
        new.excluida_por := auth.uid();
        if coalesce(btrim(new.motivo_exclusao), '') = '' then
          raise exception 'Informe o motivo da exclusão.' using errcode = 'check_violation';
        end if;
      else
        new.excluida_por := null;
        new.motivo_exclusao := null;
      end if;
    else
      new.excluida_por := old.excluida_por;
    end if;
  end if;

  if not importando then
    -- listas controladas (só verifica o que mudou, para não travar dados legados)
    if tg_op = 'INSERT' or new.status    is distinct from old.status    then perform app.valida_dominio('status',    new.status);    end if;
    if tg_op = 'INSERT' or new.unidade   is distinct from old.unidade   then perform app.valida_dominio('unidade',   new.unidade);   end if;
    if tg_op = 'INSERT' or new.etapa     is distinct from old.etapa     then perform app.valida_dominio('etapa',     new.etapa);     end if;
    if tg_op = 'INSERT' or new.tipo_vaga is distinct from old.tipo_vaga then perform app.valida_dominio('tipo_vaga', new.tipo_vaga); end if;
    if tg_op = 'INSERT' or new.regime    is distinct from old.regime    then perform app.valida_dominio('regime',    new.regime);    end if;
    if tg_op = 'INSERT' or new.base      is distinct from old.base      then perform app.valida_dominio('base',      new.base);      end if;
    if tg_op = 'INSERT' or new.origem    is distinct from old.origem    then perform app.valida_dominio('origem',    new.origem);    end if;

    if new.cargo is null then
      raise exception 'Informe o cargo da vaga.' using errcode = 'check_violation';
    end if;
    if new.data_fechamento is not null and new.data_fechamento > (now() at time zone 'America/Sao_Paulo')::date then
      raise exception 'A data de fechamento não pode estar no futuro.' using errcode = 'check_violation';
    end if;
    if (tg_op = 'INSERT' or new.status is distinct from old.status or new.data_fechamento is distinct from old.data_fechamento) then
      if new.status = 'Fechada' and new.data_fechamento is null then
        raise exception 'Vaga fechada precisa da data de fechamento.' using errcode = 'check_violation';
      end if;
      if new.data_fechamento is not null and new.status not in ('Fechada', 'Cancelada') then
        raise exception 'Vaga com data de fechamento precisa estar Fechada ou Cancelada.' using errcode = 'check_violation';
      end if;
    end if;
  end if;
  return new;
end $$;

create trigger trg_vagas_antes before insert or update on public.vagas
  for each row execute function app.vagas_antes_gravar();
create trigger trg_vagas_auditoria after insert or update or delete on public.vagas
  for each row execute function app.auditar();

create or replace function app.salario_antes_gravar()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  new.atualizado_em := now();
  new.atualizado_por := auth.uid();
  return new;
end $$;
create trigger trg_salario_antes before insert or update on public.vagas_salario
  for each row execute function app.salario_antes_gravar();
create trigger trg_salario_auditoria after insert or update or delete on public.vagas_salario
  for each row execute function app.auditar();

create or replace function app.perfis_antes_gravar()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  new.nome := btrim(new.nome);
  new.nome_recrutador := nullif(btrim(new.nome_recrutador), '');
  if tg_op = 'INSERT' then
    new.criado_em := now();
    new.criado_por := auth.uid();
    new.user_id := (select u.id from auth.users u where lower(u.email) = lower(new.email::text) limit 1);
  else
    new.criado_em := old.criado_em;
    new.criado_por := old.criado_por;
    if new.email is distinct from old.email then
      new.user_id := (select u.id from auth.users u where lower(u.email) = lower(new.email::text) limit 1);
    elsif new.user_id is distinct from old.user_id and auth.uid() is not null then
      new.user_id := old.user_id; -- vínculo só muda pelo sistema
    end if;
  end if;
  new.atualizado_em := now();
  new.atualizado_por := auth.uid();
  return new;
end $$;
create trigger trg_perfis_antes before insert or update on public.perfis
  for each row execute function app.perfis_antes_gravar();

-- Nunca deixa a plataforma sem administrador ativo
create or replace function app.garantir_admin()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.perfis where papel = 'admin' and ativo) then
    raise exception 'A plataforma precisa de pelo menos um administrador ativo.' using errcode = 'check_violation';
  end if;
  return null;
end $$;
create constraint trigger trg_perfis_garantir_admin after update or delete on public.perfis
  deferrable initially deferred for each row execute function app.garantir_admin();
create trigger trg_perfis_auditoria after insert or update or delete on public.perfis
  for each row execute function app.auditar();
create trigger trg_dominios_auditoria after insert or update or delete on public.dominios
  for each row execute function app.auditar();

-- ---------------------------------------------------------------------
-- PORTEIRO DO LOGIN: só cria conta para e-mail autorizado
-- ---------------------------------------------------------------------
create or replace function app.autorizar_novo_usuario()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.email is null or not exists (
    select 1 from public.perfis p where lower(p.email::text) = lower(new.email) and p.ativo
  ) then
    raise exception 'Acesso não autorizado para %. Solicite cadastro ao time de People.', coalesce(new.email, 'este usuário')
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

create or replace function app.vincular_perfil()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  update public.perfis set user_id = new.id
  where lower(email::text) = lower(new.email) and user_id is null;
  return new;
end $$;

create trigger trg_autorizar_novo_usuario before insert on auth.users
  for each row execute function app.autorizar_novo_usuario();
create trigger trg_vincular_perfil after insert on auth.users
  for each row execute function app.vincular_perfil();

-- Registro de último acesso (chamado pelo app após o login)
create or replace function public.registrar_acesso()
returns table (nome text, papel text, email text, nome_recrutador text)
language plpgsql security definer set search_path = ''
as $$
begin
  update public.perfis p set ultimo_acesso = now()
  where p.user_id = auth.uid() and p.ativo;
  return query
    select p.nome, p.papel, p.email::text, p.nome_recrutador
    from public.perfis p where p.user_id = auth.uid() and p.ativo;
end $$;
revoke all on function public.registrar_acesso() from public, anon;
grant execute on function public.registrar_acesso() to authenticated;

-- ---------------------------------------------------------------------
-- PERMISSÕES + RLS (nega tudo, libera só o necessário)
-- ---------------------------------------------------------------------
revoke all on public.perfis, public.dominios, public.vagas, public.vagas_salario, public.auditoria from anon, public;
revoke all on public.perfis, public.dominios, public.vagas, public.vagas_salario, public.auditoria from authenticated;

grant select, insert, update on public.perfis        to authenticated;
grant select, insert, update on public.dominios      to authenticated;
grant select, insert, update on public.vagas         to authenticated;  -- sem DELETE: exclusão só lógica
grant select, insert, update on public.vagas_salario to authenticated;
grant select                 on public.auditoria     to authenticated;

alter table public.perfis        enable row level security;
alter table public.dominios      enable row level security;
alter table public.vagas         enable row level security;
alter table public.vagas_salario enable row level security;
alter table public.auditoria     enable row level security;
alter table public.perfis        force row level security;
alter table public.dominios      force row level security;
alter table public.vagas         force row level security;
alter table public.vagas_salario force row level security;
alter table public.auditoria     force row level security;

-- perfis
create policy perfis_ler on public.perfis for select to authenticated
  using ((select app.is_membro()));
create policy perfis_incluir on public.perfis for insert to authenticated
  with check ((select app.is_admin()));
create policy perfis_alterar on public.perfis for update to authenticated
  using ((select app.is_admin())) with check ((select app.is_admin()));

-- dominios
create policy dominios_ler on public.dominios for select to authenticated
  using ((select app.is_membro()));
create policy dominios_incluir on public.dominios for insert to authenticated
  with check ((select app.is_admin()));
create policy dominios_alterar on public.dominios for update to authenticated
  using ((select app.is_admin())) with check ((select app.is_admin()));

-- vagas (excluídas só aparecem para admin)
create policy vagas_ler on public.vagas for select to authenticated
  using ((select app.is_membro()) and (excluida_em is null or (select app.is_admin())));
create policy vagas_incluir on public.vagas for insert to authenticated
  with check ((select app.is_membro()));
create policy vagas_alterar on public.vagas for update to authenticated
  using ((select app.is_membro()) and (excluida_em is null or (select app.is_admin())))
  with check ((select app.is_membro()));

-- salário: somente admin
create policy salario_ler on public.vagas_salario for select to authenticated
  using ((select app.is_admin()));
create policy salario_incluir on public.vagas_salario for insert to authenticated
  with check ((select app.is_admin()));
create policy salario_alterar on public.vagas_salario for update to authenticated
  using ((select app.is_admin())) with check ((select app.is_admin()));

-- auditoria: admin vê tudo; recrutador vê o histórico das vagas
create policy auditoria_ler on public.auditoria for select to authenticated
  using ((select app.is_admin()) or ((select app.is_membro()) and tabela = 'vagas'));

-- ---------------------------------------------------------------------
-- TEMPO REAL: telas atualizam sozinhas quando outra pessoa edita
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.vagas;
