import { useMemo, useState } from "react";

import {
  baixarCsv,
  dataBR,
  dataHoraBR,
  diasDesde,
  type Dominio,
  encerrada,
  type Perfil,
  type PerfilDb,
  type VagaDb,
} from "@/lib/dados";
import { mensagemErro, supabase } from "@/lib/supabase";
import { Botao, corStatus, inputCls, Pilula } from "@/ui";
import VagaForm from "@/VagaForm";

const POR_PAGINA = 50;

type FiltroStatus = "andamento" | "todas" | string;

const norm = (s: string | null | undefined) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

export default function Vagas({
  vagas,
  perfil,
  dominios,
  perfis,
  onRecarregar,
}: {
  vagas: VagaDb[];
  perfil: Perfil;
  dominios: Dominio[];
  perfis: PerfilDb[];
  onRecarregar: () => void;
}) {
  const admin = perfil.papel === "admin";
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState<FiltroStatus>("andamento");
  const [unidade, setUnidade] = useState("");
  const [recrutador, setRecrutador] = useState("");
  const [verExcluidas, setVerExcluidas] = useState(false);
  const [pagina, setPagina] = useState(0);
  const [aberta, setAberta] = useState<VagaDb | null | "nova">(null);
  const [erroExport, setErroExport] = useState("");

  const unidades = useMemo(() => [...new Set(vagas.map((v) => v.unidade))].sort(), [vagas]);
  const recrutadores = useMemo(
    () => [...new Set(vagas.map((v) => v.recrutador).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [vagas],
  );
  const statusLista = useMemo(
    () => dominios.filter((d) => d.categoria === "status").map((d) => d.valor),
    [dominios],
  );

  const filtradas = useMemo(() => {
    const q = norm(busca.trim());
    return vagas
      .filter((v) => (verExcluidas ? !!v.excluida_em : !v.excluida_em))
      .filter((v) =>
        status === "todas" ? true : status === "andamento" ? !encerrada(v.status) : v.status === status,
      )
      .filter((v) => !unidade || v.unidade === unidade)
      .filter((v) => !recrutador || v.recrutador === recrutador)
      .filter(
        (v) =>
          !q ||
          String(v.id) === q ||
          [v.cargo, v.area, v.requisitante, v.contratado, v.substituido, v.cod_pandape, v.recrutador].some((x) =>
            norm(x).includes(q),
          ),
      )
      .sort((a, b) => (b.data_abertura || "").localeCompare(a.data_abertura || "") || b.id - a.id);
  }, [vagas, busca, status, unidade, recrutador, verExcluidas]);

  const total = filtradas.length;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const pag = Math.min(pagina, paginas - 1);
  const visiveis = filtradas.slice(pag * POR_PAGINA, (pag + 1) * POR_PAGINA);

  const exportar = async () => {
    setErroExport("");
    let salarios = new Map<number, number | null>();
    if (admin) {
      const { data, error } = await supabase.from("vagas_salario").select("vaga_id,salario").range(0, 9999);
      if (error) return setErroExport(mensagemErro(error));
      salarios = new Map((data ?? []).map((s) => [s.vaga_id as number, s.salario as number | null]));
    }
    const cab = [
      "Nº",
      "Data Abertura",
      "Cód Pandapé",
      "Recrutador",
      "Unidade",
      "Requisitante",
      "Área",
      "Prioridade",
      "Base vagas",
      "Vaga",
      "Tipo de Vaga",
      "Substituição",
      "Status do Processo",
      "Etapa atual",
      "Publicação",
      "Regime",
      ...(admin ? ["Salário"] : []),
      "Turno",
      "Contratado",
      "Data Fechamento",
      "Admissão",
      "Origem",
      "QTD",
      "Comentários",
      "Atualizado em",
    ];
    const linhas = filtradas.map((v) => [
      v.id,
      dataBR(v.data_abertura),
      v.cod_pandape,
      v.recrutador,
      v.unidade,
      v.requisitante,
      v.area,
      v.prioridade,
      v.base,
      v.cargo,
      v.tipo_vaga,
      v.substituido,
      v.status,
      v.etapa,
      v.publicacao,
      v.regime,
      ...(admin ? [salarios.get(v.id)?.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) ?? ""] : []),
      v.turno,
      v.contratado,
      dataBR(v.data_fechamento),
      dataBR(v.data_admissao),
      v.origem,
      v.quantidade,
      v.observacoes,
      dataHoraBR(v.atualizado_em),
    ]);
    const { error: erroLog } = await supabase.rpc("registrar_exportacao", {
      p_tela: "vagas",
      p_linhas: linhas.length,
      p_filtros: { busca, status, unidade, recrutador, excluidas: verExcluidas },
    });
    if (erroLog) return setErroExport("Não foi possível registrar a exportação na auditoria. " + mensagemErro(erroLog));
    baixarCsv(`farol-de-vagas-${new Date().toISOString().slice(0, 10)}.csv`, cab, linhas);
  };

  const cols =
    "56px minmax(0,2fr) minmax(0,1.1fr) minmax(0,1.1fr) minmax(0,.9fr) 110px minmax(0,1.2fr) 92px 60px";

  return (
    <div className="mx-auto max-w-[1680px] px-[14px] pt-4 pb-14 md:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4 pb-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-[26px] leading-none font-black tracking-[-0.03em]">Vagas</h1>
          <span className="text-[12.5px] font-medium text-muted-foreground">
            {total.toLocaleString("pt-BR")} vagas no filtro · clique em uma linha para editar
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Botao onClick={() => void exportar()}>Exportar planilha (CSV)</Botao>
          <Botao tipo="primario" onClick={() => setAberta("nova")}>
            + Nova vaga
          </Botao>
        </div>
      </div>
      {erroExport && <p className="mb-3 text-xs font-semibold text-destructive">{erroExport}</p>}

      <div className="grid grid-cols-1 gap-2 rounded-sm border border-border bg-card p-3 md:grid-cols-[2fr_1fr_1fr_1fr_auto]">
        <input
          className={inputCls}
          placeholder="Buscar por cargo, área, requisitante, contratado, nº..."
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value);
            setPagina(0);
          }}
        />
        <select
          className={inputCls}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPagina(0);
          }}
        >
          <option value="andamento">Em andamento (Aberta e Stand By)</option>
          <option value="todas">Todos os status</option>
          {statusLista.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          className={inputCls}
          value={unidade}
          onChange={(e) => {
            setUnidade(e.target.value);
            setPagina(0);
          }}
        >
          <option value="">Todas as unidades</option>
          {unidades.map((u) => (
            <option key={u}>{u}</option>
          ))}
        </select>
        <select
          className={inputCls}
          value={recrutador}
          onChange={(e) => {
            setRecrutador(e.target.value);
            setPagina(0);
          }}
        >
          <option value="">Todos os recrutadores</option>
          {recrutadores.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          {perfil.nome_recrutador && (
            <Botao
              tipo={recrutador === perfil.nome_recrutador ? "primario" : "secundario"}
              onClick={() => {
                setRecrutador(recrutador === perfil.nome_recrutador ? "" : (perfil.nome_recrutador as string));
                setPagina(0);
              }}
            >
              Minhas vagas
            </Botao>
          )}
          {admin && (
            <label className="flex items-center gap-1 text-[11.5px] font-semibold text-muted-foreground">
              <input
                type="checkbox"
                checked={verExcluidas}
                onChange={(e) => {
                  setVerExcluidas(e.target.checked);
                  setPagina(0);
                }}
              />
              Excluídas
            </label>
          )}
        </div>
      </div>

      <section className="mt-3 overflow-hidden rounded-sm border border-border bg-card">
        <div className="overflow-x-auto">
          <div className="min-w-[980px]">
            <div
              className="grid border-b border-border bg-surface-alt text-[10.5px] font-bold tracking-[.07em] text-muted-foreground uppercase"
              style={{ gridTemplateColumns: cols }}
            >
              {["Nº", "Cargo", "Unidade", "Área", "Recrutador", "Status", "Etapa", "Abertura", "Dias"].map((h, i) => (
                <span key={h} className={`px-3 py-[10px] ${i >= 7 ? "text-right" : ""}`}>
                  {h}
                </span>
              ))}
            </div>
            {visiveis.map((v) => {
              const dias = diasDesde(v.data_abertura, v.data_fechamento);
              return (
                <button
                  key={v.id}
                  onClick={() => setAberta(v)}
                  className="tnum grid w-full items-center border-b border-hairline text-left text-[12.5px] font-medium hover:bg-surface-alt"
                  style={{ gridTemplateColumns: cols }}
                >
                  <span className="px-3 py-[10px] text-subtle">{v.id}</span>
                  <span className="truncate px-3 py-[10px] font-semibold" title={v.cargo}>
                    {v.cargo}
                  </span>
                  <span className="truncate px-3 py-[10px]">{v.unidade}</span>
                  <span className="truncate px-3 py-[10px] text-muted-foreground">{v.area}</span>
                  <span className="truncate px-3 py-[10px]">{v.recrutador}</span>
                  <span className="px-3 py-[8px]">
                    <Pilula texto={v.status} cor={corStatus(v.status)} />
                  </span>
                  <span className="truncate px-3 py-[10px] text-muted-foreground">{v.etapa}</span>
                  <span className="px-3 py-[10px] text-right">{dataBR(v.data_abertura)}</span>
                  <span
                    className={`px-3 py-[10px] text-right font-bold ${
                      !encerrada(v.status) && (dias ?? 0) > 25 ? "text-accent" : ""
                    }`}
                  >
                    {dias ?? ""}
                  </span>
                </button>
              );
            })}
            {visiveis.length === 0 && (
              <p className="px-4 py-8 text-center text-[12.5px] font-medium text-muted-foreground">
                Nenhuma vaga encontrada com esses filtros.
              </p>
            )}
          </div>
        </div>
        {paginas > 1 && (
          <div className="flex items-center justify-between gap-2 px-4 py-3 text-[12px] font-semibold">
            <span className="text-subtle">
              Página {pag + 1} de {paginas}
            </span>
            <div className="flex gap-2">
              <Botao disabled={pag === 0} onClick={() => setPagina(pag - 1)}>
                Anterior
              </Botao>
              <Botao disabled={pag >= paginas - 1} onClick={() => setPagina(pag + 1)}>
                Próxima
              </Botao>
            </div>
          </div>
        )}
      </section>
      <p className="mt-3 text-[11px] font-medium text-faint">
        Dias = dias corridos desde a abertura (até o fechamento, quando houver). Em destaque, vagas em andamento acima
        da meta de 25 dias.
      </p>

      {aberta && (
        <VagaForm
          vaga={aberta === "nova" ? null : aberta}
          perfil={perfil}
          dominios={dominios}
          perfis={perfis}
          onFechar={() => setAberta(null)}
          onSalvo={() => {
            setAberta(null);
            onRecarregar();
          }}
        />
      )}
    </div>
  );
}
