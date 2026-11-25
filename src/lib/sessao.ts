/*
 * Controle de inatividade da sessão.
 *
 * O Supabase guarda a sessão no navegador, e ela sobrevive ao fechamento da aba
 * ou do navegador. Sem este controle, quem fechasse o navegador sem clicar em
 * "Sair" continuaria logado dias depois, inclusive para a próxima pessoa num
 * computador compartilhado.
 *
 * Aqui o horário do último uso fica gravado no próprio navegador (compartilhado
 * entre abas). Ao abrir a plataforma, ou a cada minuto com ela aberta, se o
 * último uso passou do limite, a sessão é encerrada.
 */

/** Sai sozinho depois deste tempo sem uso (boa prática para dados de pessoas). */
export const INATIVIDADE_MS = 60 * 60 * 1000;

const CHAVE = "farol-ultima-atividade";
const INTERVALO_GRAVACAO_MS = 30 * 1000;
let ultimaGravacao = 0;

function ler(): number | null {
  try {
    const v = Number(localStorage.getItem(CHAVE));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

/** Registra uso agora. Sem `forcar`, grava no máximo a cada 30 s. */
export function marcarAtividade(forcar = false) {
  const agora = Date.now();
  if (!forcar && agora - ultimaGravacao < INTERVALO_GRAVACAO_MS) return;
  ultimaGravacao = agora;
  try {
    localStorage.setItem(CHAVE, String(agora));
  } catch {
    /* navegador sem armazenamento: vale só o controle com a aba aberta */
  }
}

export function limparAtividade() {
  ultimaGravacao = 0;
  try {
    localStorage.removeItem(CHAVE);
  } catch {
    /* nada a limpar */
  }
}

/** Verdadeiro se há registro de uso e ele é mais antigo que o limite. */
export function inativoDemais(): boolean {
  const t = ler();
  return t !== null && Date.now() - t > INATIVIDADE_MS;
}

/*
 * Decisão tomada no carregamento da página, antes de qualquer evento de login
 * poder renovar o registro. O retorno do login Microsoft não cai aqui porque o
 * botão "Entrar" marca atividade antes de redirecionar.
 */
export const expirouAntesDeAbrir = inativoDemais();
