import { createClient } from "@supabase/supabase-js";

/**
 * Conexão com o banco "Farol de Vagas WAP" (Supabase, região São Paulo).
 *
 * A chave abaixo é a chave PUBLICÁVEL: foi feita para ficar no navegador. Ela
 * sozinha não lê nada, porque todas as tabelas exigem login e passam pelas
 * políticas de acesso (RLS) do banco. Quem não está cadastrado em "Usuários"
 * é barrado no próprio banco, e não apenas na tela.
 */
export const SUPABASE_URL = "https://ndivtivopjndgagnalaf.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_PFuqNGkuKMrqLvxcyz9z_A_J8WrXXc3";

/** Formas de login exibidas na tela de entrada. */
export const LOGIN_MICROSOFT = true;
/** Desligado: o provedor de e-mail foi desativado no Supabase por segurança. */
export const LOGIN_CODIGO_EMAIL = false;

/** Domínio corporativo aceito. O banco também confere. */
export const DOMINIO_EMAIL = "wap.ind.br";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "pkce",
  },
});

/** Traduz os erros mais comuns do banco para uma frase que o usuário entende. */
export function mensagemErro(e: unknown): string {
  const err = e as { message?: string; code?: string; details?: string } | null;
  const msg = err?.message || String(e || "");
  if (/permission denied|42501|row-level security/i.test(msg) || err?.code === "42501")
    return "Você não tem permissão para esta ação.";
  if (/JWT expired|invalid JWT/i.test(msg)) return "Sua sessão expirou. Entre novamente.";
  if (/Failed to fetch|NetworkError/i.test(msg)) return "Sem conexão com o servidor. Verifique a internet.";
  if (/duplicate key|23505/.test(msg)) return "Já existe um registro com esse valor.";
  if (/ck_perfis_email/.test(msg)) return `Use um e-mail corporativo @${DOMINIO_EMAIL}.`;
  if (/ck_vaga_datas/.test(msg)) return "A data de fechamento não pode ser anterior à data de abertura.";
  if (/ck_vaga_qtd/.test(msg)) return "A quantidade deve ficar entre 1 e 500.";
  if (/ck_salario/.test(msg)) return "Salário fora da faixa permitida.";
  return msg;
}
