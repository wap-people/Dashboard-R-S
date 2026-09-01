import { parsePlanilha, type Vaga } from "@/lib/rs-analytics";

/**
 * Leitura da planilha oficial direto do navegador.
 *
 * No Lovable isso acontecia no servidor, através do connector do Google Sheets
 * (que exigia LOVABLE_API_KEY + GOOGLE_SHEETS_API_KEY). O GitHub Pages serve
 * apenas arquivos estáticos: não existe servidor para guardar chave nenhuma.
 *
 * A solução é o endpoint público "gviz" do próprio Google Sheets, que:
 *   - devolve a aba inteira em CSV;
 *   - não pede chave de API;
 *   - responde com Access-Control-Allow-Origin, ou seja, o navegador pode ler.
 *
 * Contrapartida: a planilha precisa continuar compartilhada como
 * "qualquer pessoa com o link pode ver". Se o compartilhamento for fechado,
 * o painel para de atualizar e mostra o aviso de erro logo acima do rodapé.
 */

/** Está no meio do link da planilha: docs.google.com/spreadsheets/d/<ID>/edit */
export const SPREADSHEET_ID = "1QBdTqpH2isttaOxsimdScFZote3eCSQxnVAi2JBFM8Y";

/** Identificador fixo da aba. Aparece como #gid=... no link ao abrir a aba. */
export const SHEET_GID = "982409738";

/** Usado só como reserva, caso o gid mude (aba recriada). */
export const SHEET_NAME = "Vagas 2026";

export const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit#gid=${SHEET_GID}`;

const AVISO_COMPARTILHAMENTO =
  "Confira se a planilha “FAROL DE VAGAS 2026 WAP” continua compartilhada como “qualquer pessoa com o link pode ver”.";

/**
 * Duas formas de pedir a mesma aba. O gid vem primeiro porque continua válido
 * mesmo se a aba for renomeada; o nome cobre o caso de a aba ser recriada.
 */
function candidatos(): string[] {
  const base = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv`;
  return [`${base}&gid=${SHEET_GID}`, `${base}&sheet=${encodeURIComponent(SHEET_NAME)}`];
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
  const problemas: string[] = [];

  for (const url of candidatos()) {
    let res: Response;
    try {
      res = await fetch(url, { cache: "no-store" });
    } catch {
      problemas.push("não foi possível falar com o Google Sheets");
      continue;
    }

    if (!res.ok) {
      problemas.push(`o Google respondeu ${res.status}`);
      continue;
    }

    const csv = await res.text();

    // Quando a planilha não está pública, o Google devolve uma página HTML de
    // login com status 200 — daí a checagem pelo conteúdo, e não pelo status.
    if (/^\s*</.test(csv)) {
      problemas.push("o Google devolveu uma tela de login em vez dos dados");
      continue;
    }
    if (!csv.trim()) {
      problemas.push("a resposta veio vazia");
      continue;
    }

    return csv;
  }

  throw new Error(`Falha ao ler a planilha (${problemas.join("; ")}). ${AVISO_COMPARTILHAMENTO}`);
}

export async function fetchVagasFromSheet(): Promise<{ rows: Vaga[]; ignoradas: number }> {
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

  return { rows: parsed.rows, ignoradas: parsed.ignoradas };
}

/** Mesma assinatura da server function do Lovable, para o componente não mudar. */
export async function getVagasFromSheet() {
  const { rows, ignoradas } = await fetchVagasFromSheet();
  return { rows, ignoradas, carregadoEm: new Date().toISOString() };
}
