import { parsePlanilha, type Vaga } from "@/lib/rs-analytics";
import { supabase } from "@/lib/supabase";

export type Papel = "admin" | "recrutador";

export type Perfil = {
  nome: string;
  papel: Papel;
  email: string;
  nome_recrutador: string | null;
};

export type PerfilDb = {
  id: string;
  user_id: string | null;
  email: string;
  nome: string;
  papel: Papel;
  nome_recrutador: string | null;
  ativo: boolean;
  ultimo_acesso: string | null;
  criado_em: string;
};

export type VagaDb = {
  id: number;
  cargo: string;
  area: string | null;
  unidade: string;
  requisitante: string | null;
  recrutador: string | null;
  tipo_vaga: string | null;
  substituido: string | null;
  regime: string | null;
  base: string | null;
  turno: string | null;
  prioridade: string | null;
  publicacao: string | null;
  quantidade: number;
  cod_pandape: string | null;
  status: string;
  etapa: string | null;
  origem: string | null;
  data_abertura: string | null;
  data_fechamento: string | null;
  data_admissao: string | null;
  contratado: string | null;
  observacoes: string | null;
  versao: number;
  criado_em: string;
  atualizado_em: string;
  excluida_em: string | null;
  motivo_exclusao: string | null;
  linha_planilha: number | null;
};

export const COLUNAS_VAGA =
  "id,cargo,area,unidade,requisitante,recrutador,tipo_vaga,substituido,regime,base,turno,prioridade,publicacao,quantidade,cod_pandape,status,etapa,origem,data_abertura,data_fechamento,data_admissao,contratado,observacoes,versao,criado_em,atualizado_em,excluida_em,motivo_exclusao,linha_planilha";

/** Campos editáveis pelo formulário (o resto o banco preenche sozinho). */
export const CAMPOS_EDITAVEIS = [
  "cargo",
  "area",
  "unidade",
  "requisitante",
  "recrutador",
  "tipo_vaga",
  "substituido",
  "regime",
  "base",
  "turno",
  "prioridade",
  "publicacao",
  "quantidade",
  "cod_pandape",
  "status",
  "etapa",
  "origem",
  "data_abertura",
  "data_fechamento",
  "data_admissao",
  "contratado",
  "observacoes",
] as const;
export type CampoEditavel = (typeof CAMPOS_EDITAVEIS)[number];

export const ROTULO: Record<string, string> = {
  cargo: "Cargo",
  area: "Área",
  unidade: "Unidade",
  requisitante: "Requisitante",
  recrutador: "Recrutador",
  tipo_vaga: "Tipo de vaga",
  substituido: "Substituído",
  regime: "Regime",
  base: "Base",
  turno: "Turno",
  prioridade: "Prioridade",
  publicacao: "Publicação",
  quantidade: "Quantidade",
  cod_pandape: "Cód. Pandapé",
  status: "Status",
  etapa: "Etapa",
  origem: "Origem",
  data_abertura: "Data de abertura",
  data_fechamento: "Data de fechamento",
  data_admissao: "Data de admissão",
  contratado: "Contratado",
  observacoes: "Observações",
  salario: "Salário",
  excluida_em: "Excluída em",
  motivo_exclusao: "Motivo da exclusão",
  nome: "Nome",
  email: "E-mail",
  papel: "Papel",
  nome_recrutador: "Nome nas vagas",
  ativo: "Ativo",
  valor: "Valor",
  ordem: "Ordem",
  categoria: "Categoria",
};

export type Categoria =
  | "status"
  | "etapa"
  | "unidade"
  | "tipo_vaga"
  | "regime"
  | "base"
  | "origem"
  | "prioridade"
  | "publicacao"
  | "turno";

export const CATEGORIAS: { key: Categoria; label: string }[] = [
  { key: "unidade", label: "Unidades" },
  { key: "status", label: "Status" },
  { key: "etapa", label: "Etapas do processo" },
  { key: "tipo_vaga", label: "Tipos de vaga" },
  { key: "regime", label: "Regimes" },
  { key: "base", label: "Bases" },
  { key: "turno", label: "Turnos" },
  { key: "prioridade", label: "Prioridades" },
  { key: "publicacao", label: "Publicação" },
  { key: "origem", label: "Origens do candidato" },
];

export type Dominio = { id: number; categoria: Categoria; valor: string; ordem: number; ativo: boolean };

export async function listarVagas(): Promise<VagaDb[]> {
  const todas: VagaDb[] = [];
  const passo = 1000; // limite por requisição da API
  for (let de = 0; ; de += passo) {
    const { data, error } = await supabase
      .from("vagas")
      .select(COLUNAS_VAGA)
      .order("id", { ascending: true })
      .range(de, de + passo - 1);
    if (error) throw error;
    todas.push(...((data ?? []) as unknown as VagaDb[]));
    if (!data || data.length < passo) break;
  }
  return todas;
}

export async function listarDominios(): Promise<Dominio[]> {
  const { data, error } = await supabase
    .from("dominios")
    .select("id,categoria,valor,ordem,ativo")
    .order("categoria")
    .order("ordem")
    .order("valor");
  if (error) throw error;
  return (data ?? []) as Dominio[];
}

export async function listarPerfis(): Promise<PerfilDb[]> {
  const { data, error } = await supabase
    .from("perfis")
    .select("id,user_id,email,nome,papel,nome_recrutador,ativo,ultimo_acesso,criado_em")
    .order("nome");
  if (error) throw error;
  return (data ?? []) as PerfilDb[];
}

/**
 * Converte as vagas do banco no formato que os cálculos do painel já usam.
 *
 * Em vez de reescrever as regras (status ajustado pelas datas, fechamento
 * estimado pela admissão, recorte 2026...), montamos uma "aba" com os mesmos
 * cabeçalhos da planilha antiga e passamos pelo mesmo leitor. Assim os números
 * do painel continuam batendo com os de antes da migração.
 */
export function paraDashboard(vagas: VagaDb[]): Vaga[] {
  const cab = [
    "Data Abertura",
    "Unidade",
    "Status do Processo",
    "Vaga",
    "Recrutador",
    "Requisitante",
    "Área",
    "Base vagas",
    "Tipo de Vaga",
    "Regime",
    "Data Fechamento",
    "Admissão",
    "Contratado",
    "Origem",
    "Etapa atual",
  ];
  const limpa = (v: unknown) => (v === null || v === undefined ? "" : String(v).replace(/[\t\r\n]+/g, " "));
  const linhas = vagas
    .filter((v) => !v.excluida_em)
    .map((v) =>
      [
        v.data_abertura,
        v.unidade,
        v.status,
        v.cargo,
        v.recrutador,
        v.requisitante,
        v.area,
        v.base,
        v.tipo_vaga,
        v.regime,
        v.data_fechamento,
        v.data_admissao,
        v.contratado,
        v.origem,
        v.etapa,
      ]
        .map(limpa)
        .join("\t"),
    );
  const res = parsePlanilha([cab.join("\t"), ...linhas].join("\n"));
  return res.ok ? res.rows : [];
}

export const hoje = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const dataBR = (iso: string | null | undefined) => {
  if (!iso) return "";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
};

export const dataHoraBR = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "";

export const diasDesde = (iso: string | null | undefined, ate?: string | null) => {
  if (!iso) return null;
  const fim = ate || hoje();
  return Math.max(0, Math.round((Date.parse(fim) - Date.parse(iso.slice(0, 10))) / 86400000));
};

export const encerrada = (s: string) => /fechad|cancel/i.test(s);

/** CSV com BOM e ponto e vírgula, que o Excel em português abre direto. */
export function baixarCsv(nome: string, cab: string[], linhas: (string | number | null | undefined)[][]) {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const txt = [cab, ...linhas].map((l) => l.map(esc).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([String.fromCharCode(0xfeff) + txt], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
