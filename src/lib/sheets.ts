import { parsePlanilha, type Colunas, type Vaga } from "@/lib/rs-analytics";

/**
 * Leitura da planilha oficial direto do navegador.
 *
 * No Lovable isso acontecia no servidor, através do connector do Google Sheets
 * (que exigia LOVABLE_API_KEY + GOOGLE_SHEETS_API_KEY). O GitHub Pages serve
 * apenas arquivos estáticos: não existe servidor para guardar chave nenhuma.
 *
 * A solução é o endpoint público de exportação do próprio Google Sheets, que:
 *   - devolve a aba inteira em CSV;
 *   - não pede chave de API;
 *   - responde com Access-Control-Allow-Origin: *, então o navegador pode ler.
 *
 * IMPORTANTE — por que NÃO usamos o endpoint "gviz/tq":
 * o gviz respeita o filtro básico que estiver aplicado na aba. Se alguém deixar
 * um filtro ligado em "Vagas 2026", o gviz devolve só as linhas visíveis e o
 * painel passa a calcular em cima de uma fatia da base, sem avisar ninguém.
 * Isso foi observado ao vivo: no mesmo instante, o gviz devolveu 4 vagas e o
 * export devolveu 1.163. O export ignora filtros e é a fonte correta.
 *
 * Contrapartida: a planilha precisa continuar compartilhada como
 * "qualquer pessoa com o link pode ver". Se o compartilhamento for fechado,
 * o painel para de atualizar e mostra o aviso de erro logo acima do rodapé.
 */

/** Está no meio do link da planilha: docs.google.com/spreadsheets/d/<ID>/edit */
export const SPREADSHEET_ID = "1QBdTqpH2isttaOxsimdScFZote3eCSQxnVAi2JBFM8Y";

/**
 * Identificador fixo da aba "Vagas 2026". Aparece como #gid=... no link ao abrir
 * a aba. É obrigatório: o endpoint de exportação seleciona a aba pelo gid, não
 * pelo nome. Se a aba for apagada e recriada, o gid muda e precisa ser atualizado
 * aqui — o painel avisa com erro em vez de mostrar número errado.
 */
export const SHEET_GID = "982409738";

/** Só para as mensagens na tela. */
export const SHEET_NAME = "Vagas 2026";

export const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit#gid=${SHEET_GID}`;

const AVISO_COMPARTILHAMENTO =
  "Confira se a planilha “FAROL DE VAGAS 2026 WAP” continua compartilhada como “qualquer pessoa com o link pode ver”.";

/**
 * Fonte única. Não adicione o gviz como reserva: ele devolveria a base filtrada
 * sem sinalizar nada, e um número errado apresentado como certo é pior do que
 * uma falha visível.
 */
function urlDaAba(): string {
  return `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${SHEET_GID}`;
}

/**
 * Parser de CSV no padrão RFC 4180.
 *
 * Não dá para usar split(",") aqui: a planilha tem campos com vírgula dentro de
 * aspas (salário " R$ 2.393,71 ", comentários) e o corte sairia errado.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let emAspas = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;

    if (emAspas) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'; // aspas escapadas ("") viram uma aspa literal
          i++;
        } else {
          emAspas = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      emAspas = true;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
      continue;
    }
    field += c;
  }

  // última linha, quando o arquivo não termina em quebra de linha
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

async function baixarCsv(): Promise<string> {
  let res: Response;
  try {
    res = await fetch(urlDaAba(), { cache: "no-store" });
  } catch {
    throw new Error(
      `Não foi possível falar com o Google Sheets. Verifique a conexão. ${AVISO_COMPARTILHAMENTO}`,
    );
  }

  if (!res.ok) {
    throw new Error(
      `Falha ao ler a planilha [${res.status}]. Se o código for 404, a aba pode ter sido recriada e o gid mudou. ${AVISO_COMPARTILHAMENTO}`,
    );
  }

  const csv = await res.text();

  // Quando a planilha não está pública, o Google devolve uma página HTML de
  // login com status 200 — daí a checagem pelo conteúdo, e não pelo status.
  if (/^\s*</.test(csv)) {
    throw new Error(`O Google devolveu uma tela de login em vez dos dados. ${AVISO_COMPARTILHAMENTO}`);
  }
  if (!csv.trim()) {
    throw new Error(`A aba “${SHEET_NAME}” voltou vazia. ${AVISO_COMPARTILHAMENTO}`);
  }

  return csv;
}

export async function fetchVagasFromSheet(): Promise<{
  rows: Vaga[];
  ignoradas: number;
  colunas: Colunas;
}> {
  const csv = await baixarCsv();

  const values = parseCsv(csv);
  if (!values.length) throw new Error(`A aba “${SHEET_NAME}” voltou vazia.`);

  // parsePlanilha entende TSV (ou CSV com ponto e vírgula). Convertemos o CSV
  // para TSV limpando tabs e quebras de linha de dentro das células — é
  // exatamente o que a versão do Lovable fazia com a resposta da API.
  const clean = (v: string) => (v ?? "").replace(/[\t\r\n]+/g, " ");
  const tsv = values.map((linha) => linha.map(clean).join("\t")).join("\n");

  const parsed = parsePlanilha(tsv);
  if (!parsed.ok) throw new Error(parsed.msg);

  return { rows: parsed.rows, ignoradas: parsed.ignoradas, colunas: parsed.colunas };
}

export async function getVagasFromSheet() {
  const { rows, ignoradas, colunas } = await fetchVagasFromSheet();
  return { rows, ignoradas, colunas, carregadoEm: new Date().toISOString() };
}
