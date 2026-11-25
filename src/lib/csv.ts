/*
 * Proteção contra "injeção de fórmula" em CSV.
 *
 * O Excel executa como fórmula qualquer célula que começa com = + - @ (ou com
 * tabulação/retorno seguidos disso). Um texto digitado numa vaga, como
 * =HYPERLINK("http://site-malicioso"; "clique"), viraria um link ou cálculo
 * ativo na planilha de quem exporta. Colocar um apóstrofo na frente faz o Excel
 * tratar a célula como texto, e o conteúdo continua legível.
 *
 * Números de verdade (inclusive negativos, como -34) ficam como estão.
 */
const PERIGOSO = /^[=+\-@\t\r]/;
const NUMERO = /^-?\d+(?:[.,]\d+)*%?$/;

export function celulaSegura(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return String(v);
  const s = String(v);
  return PERIGOSO.test(s) && !NUMERO.test(s) ? "'" + s : s;
}
