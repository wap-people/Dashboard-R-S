/*
 * Tela "Painel", carregada só quando é aberta (fica fora do pacote inicial).
 * A conversão das vagas para os cálculos do painel mora aqui porque depende do
 * leitor da planilha antiga (rs-analytics), que só o painel usa.
 */
import { useMemo } from "react";

import Dashboard from "@/App";
import type { VagaDb } from "@/lib/dados";
import { parsePlanilha, type Vaga } from "@/lib/rs-analytics";

export default function Painel({
  vagas,
  carregando,
  erro,
  atualizadoEm,
}: {
  vagas: VagaDb[];
  carregando: boolean;
  erro: string;
  atualizadoEm: Date | null;
}) {
  const rows = useMemo(() => paraDashboard(vagas), [vagas]);
  return (
    <Dashboard
      rows={rows}
      carregando={carregando}
      erro={erro}
      fonte={
        atualizadoEm
          ? `Plataforma Farol de Vagas · ${rows.length.toLocaleString("pt-BR")} vagas · atualizado às ${atualizadoEm.toLocaleTimeString("pt-BR")}`
          : "Carregando vagas..."
      }
    />
  );
}

/**
 * Converte as vagas do banco no formato que os cálculos do painel já usam.
 *
 * Em vez de reescrever as regras (status ajustado pelas datas, fechamento
 * estimado pela admissão, recorte 2026...), montamos uma "aba" com os mesmos
 * cabeçalhos da planilha antiga e passamos pelo mesmo leitor. Assim os números
 * do painel continuam batendo com os de antes da migração.
 */
function paraDashboard(vagas: VagaDb[]): Vaga[] {
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
