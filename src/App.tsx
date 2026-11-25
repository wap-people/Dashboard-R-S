import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  Bolha,
  Check,
  DirecaoCtx,
  Numero,
  sairParaLado,
  Sk,
  useAbasLiquidas,
  useClasseEntrada,
} from "@/efeitos";
import { supabase } from "@/lib/supabase";
import {
  buildAnalytics,
  mesLongo,
  mesPadrao,
  noEscopo,
  toCsv,
  type Colunas,
  type Vaga,
} from "@/lib/rs-analytics";

/** BOM do UTF-8, para o Excel abrir o CSV exportado com os acentos certos. */
const BOM = String.fromCharCode(0xfeff);

type View = "acum" | "mes" | "atual";

/** Ordem das abas: define para que lado os painéis deslizam na troca. */
const ORDEM: View[] = ["acum", "mes", "atual"];

const TABS: { key: View; label: string }[] = [
  { key: "acum", label: "Acumulado" },
  { key: "mes", label: "Fechamento mês a mês" },
  { key: "atual", label: "Cenário atual" },
];

const VIEW_HINT: Record<View, string> = {
  acum: "todo o histórico da planilha",
  mes: "cada mês comparado com o anterior",
  atual: "retrato das vagas abertas hoje",
};

function Card({
  title,
  subtitle,
  aside,
  children,
  className = "",
  delay = 0,
}: {
  title: string;
  subtitle?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const entrada = useClasseEntrada();
  return (
    <section
      className={`glass ${entrada} p-[18px_16px_20px] md:p-[22px_24px_24px] ${className}`}
      style={{ animationDelay: `${delay}s` }}
    >
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex flex-col gap-[3px]">
          <h2 className="text-[15px] font-bold tracking-[-0.02em]">{title}</h2>
          {subtitle ? (
            <span className="text-[11px] font-medium text-subtle">{subtitle}</span>
          ) : null}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

function TableCard({
  title,
  subtitle,
  aside,
  children,
  delay = 0,
}: {
  title: string;
  subtitle?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  delay?: number;
}) {
  const entrada = useClasseEntrada();
  return (
    <section
      className={`glass glass-strong ${entrada} mt-[14px] overflow-hidden`}
      style={{ animationDelay: `${delay}s` }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border px-6 pt-5 pb-4">
        <div className="flex flex-col gap-[3px]">
          <h2 className="text-[15px] font-bold tracking-[-0.02em]">{title}</h2>
          {subtitle ? (
            <span className="text-[11px] font-medium text-subtle">{subtitle}</span>
          ) : null}
        </div>
        {aside}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

function MiniBars({
  rows,
}: {
  rows: { label: string; total: string; pct?: string; hint?: string; w: string; color: string }[];
}) {
  return (
    <div className="flex flex-col gap-[13px]">
      {rows.map((r) => (
        <div key={r.label} className="flex flex-col gap-[5px]">
          <div className="flex items-baseline gap-2">
            <span className="flex-1 text-[12.5px] font-semibold tracking-[-0.015em]">{r.label}</span>
            <span className="tnum text-[13px] font-extrabold tracking-[-0.03em]">{r.total}</span>
            <span className="tnum w-[52px] text-right text-[11px] font-medium text-subtle">
              {r.hint ?? r.pct}
            </span>
          </div>
          <div className="h-[6px] overflow-hidden rounded-full bg-track">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{ width: r.w, background: r.color }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function ColumnBars({
  rows,
  height,
  maxWidth,
}: {
  rows: { label: string; total: string; h: string; color: string }[];
  height: number;
  maxWidth: number;
}) {
  return (
    <div className="flex items-end gap-3" style={{ height }}>
      {rows.map((d) => (
        <div key={d.label} className="flex h-full flex-1 flex-col items-center gap-2">
          <div className="flex w-full flex-1 items-end justify-center">
            <div
              className="relative w-full rounded-t-[2px] transition-[height] duration-500"
              style={{ height: d.h, background: d.color, maxWidth }}
            >
              <span className="tnum absolute -top-[18px] right-0 left-0 text-center text-[11.5px] font-extrabold">
                {d.total}
              </span>
            </div>
          </div>
          <span className="text-center text-[11px] leading-[1.3] font-semibold tracking-[-0.01em]">
            {d.label}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard({
  rows,
  fonte,
  carregando,
  erro,
}: {
  rows: Vaga[];
  fonte: string;
  carregando: boolean;
  erro: string;
}) {
  const colunas: Colunas | null = null;
  const [view, setView] = useState<View>("acum");
  // A aba clicada fica marcada na hora (o indicador já desliza); a troca do
  // conteúdo espera os painéis atuais saírem de lado.
  const [alvo, setAlvo] = useState<View>("acum");
  const [direcao, setDirecao] = useState<1 | -1 | null>(null);
  const conteudoRef = useRef<HTMLDivElement>(null);
  const trocando = useRef(false);
  const cancelarSaida = useRef<(() => void) | null>(null);
  const { listaRef, indRef } = useAbasLiquidas("painel-visao", alvo);

  const irPara = async (novo: View) => {
    if (novo === view || trocando.current) return;
    trocando.current = true;
    setAlvo(novo);
    const dir = ORDEM.indexOf(novo) > ORDEM.indexOf(view) ? 1 : -1;
    cancelarSaida.current = await sairParaLado(conteudoRef.current, dir);
    setDirecao(dir);
    setView(novo);
    trocando.current = false;
  };

  // Depois da troca, desfaz a saída: um painel que o React reaproveitou não pode
  // ficar preso transparente.
  useLayoutEffect(() => {
    cancelarSaida.current?.();
    cancelarSaida.current = null;
  }, [view]);

  const entrada = direcao === 1 ? "entra-dir" : direcao === -1 ? "entra-esq" : "entrar";
  const carregandoPrimeira = carregando && rows.length === 0;
  // Unidade escolhida nos cartões do Cenário atual (chave de equivalência).
  const [filtroUnidade, setFiltroUnidade] = useState<string | null>(null);
  const [filtroRecrutador, setFiltroRecrutador] = useState<string | null>(null);
  const [selMes, setSelMes] = useState("");
  const mesIniciado = useRef(false);

  useEffect(() => {
    if (!mesIniciado.current && rows.length) {
      mesIniciado.current = true;
      setSelMes(mesPadrao(noEscopo(rows)));
    }
  }, [rows]);

  const a = useMemo(
    () => buildAnalytics(rows, selMes, undefined, colunas),
    [rows, selMes, colunas],
  );

  const kpis = view === "acum" ? a.kpisAcum : view === "mes" ? a.kpisMes : a.kpisAtual;

  const exportCsv = async () => {
    const { error } = await supabase.rpc("registrar_exportacao", {
      p_tela: "painel",
      p_linhas: rows.length,
      p_filtros: { visao: view },
    });
    if (error) {
      window.alert("Não foi possível registrar a exportação na auditoria. Tente novamente.");
      return;
    }
    const url = URL.createObjectURL(
      new Blob([BOM + toCsv(rows)], { type: "text/csv;charset=utf-8" }),
    );
    const el = document.createElement("a");
    el.href = url;
    el.download = "rs-vagas-wap.csv";
    el.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const openMes = (m: string) => {
    setSelMes(m);
    void irPara("mes");
  };

  const tblCols = "1.4fr repeat(6, minmax(0, 1fr))";
  const compCols = "1.3fr .7fr .7fr .7fr 1.4fr";
  const consCols = "1.2fr .8fr .5fr 1.6fr";
  const listaCols =
    "minmax(0,1.7fr) minmax(0,1fr) minmax(0,1.2fr) minmax(0,.9fr) minmax(0,1fr) .8fr .55fr";

  // Se a unidade filtrada sumir da base numa releitura, a lista volta a mostrar
  // tudo em vez de ficar vazia sem explicação.
  const unidadeFiltrada = a.unidadeTiles.find((u) => u.chave === filtroUnidade) ?? null;
  const recrutadorFiltrado =
    a.recrutadorTiles.find((r) => r.chave === filtroRecrutador) ?? null;
  // Os dois filtros se somam: Wap Serra + Angélica mostra só as vagas dela lá.
  const listaVisivel = a.listaAbertas.filter(
    (v) =>
      (!unidadeFiltrada || v.chaveUnidade === unidadeFiltrada.chave) &&
      (!recrutadorFiltrado || v.chaveRecrutador === recrutadorFiltrado.chave),
  );
  const filtrosAtivos = [unidadeFiltrada?.label, recrutadorFiltrado?.label].filter(Boolean);

  return (
    <div className="mx-auto max-w-[1680px] px-[14px] pt-2 pb-12 text-foreground md:px-8 md:pt-4 md:pb-16">
      <header className="flex flex-wrap items-start justify-between gap-8 border-b border-border pb-5 md:items-end">
        <div className="flex flex-col gap-3">

          <div className="flex flex-col gap-[6px]">
            <h1 className="text-[25px] leading-none font-black tracking-[-0.03em] md:text-[34px]">
              Recrutamento &amp; Seleção · 2026
            </h1>
            {carregandoPrimeira ? (
              <Sk className="sk-linha curta" />
            ) : (
              <span className="text-[12.5px] font-medium tracking-[-0.01em] text-muted-foreground">
                {a.subtitle}
              </span>
            )}
          </div>
        </div>
        <div className="no-print flex flex-wrap items-center gap-2">
          <button
            onClick={() => void exportCsv()}
            className="btn rounded-full border border-input bg-card px-[14px] py-[9px] text-xs font-semibold tracking-[-0.01em] hover:border-foreground"
          >
            Exportar CSV
          </button>
          <button
            onClick={() => window.print()}
            className="btn rounded-full border border-input bg-card px-[14px] py-[9px] text-xs font-semibold tracking-[-0.01em] hover:border-foreground"
          >
            PDF
          </button>
        </div>
      </header>

      <nav className="no-print flex flex-wrap items-center gap-[14px] border-b border-border py-4">
        <div
          ref={listaRef}
          role="tablist"
          aria-label="Visão do painel"
          className="abas-liquidas flex flex-wrap gap-[2px] rounded-full bg-secondary/70 p-[3px]"
        >
          <span ref={indRef} className="tab-ind" aria-hidden="true" />
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={alvo === t.key}
              onClick={() => void irPara(t.key)}
              className={`rounded-full px-[18px] py-[7px] text-[12.5px] font-semibold tracking-[-0.01em] ${
                alvo === t.key ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <span className="text-[11px] font-medium tracking-[-0.01em] text-subtle">
          {VIEW_HINT[alvo]}
        </span>
      </nav>

      {/* Alertas no topo, não no rodapé: os dois significam que os números da
          tela podem estar errados, e quem só olha os KPIs nunca rola até o fim. */}
      {erro && (
        <p className="no-print mt-4 rounded-sm border border-destructive/40 bg-destructive/10 px-4 py-3 text-xs font-semibold text-destructive">
          {erro}
        </p>
      )}
      {a.colunasAusentes.length > 0 && (
        <p className="no-print mt-4 rounded-sm border border-destructive/40 bg-destructive/10 px-4 py-3 text-xs leading-[1.55] font-semibold text-destructive">
          O painel não encontrou{" "}
          {a.colunasAusentes.length === 1 ? "a coluna" : "as colunas"}{" "}
          {a.colunasAusentes.map((c) => `“${c}”`).join(", ")} na aba Vagas 2026. Se o cabeçalho
          foi renomeado, os números que dependem dela aparecem zerados ou como “não informado”.
        </p>
      )}

      {carregandoPrimeira && (
        <div className="mt-6 flex flex-col gap-[12px]" role="status" aria-label="Carregando o painel">
          <div className="grid grid-cols-2 gap-[10px] md:grid-cols-3 xl:grid-cols-5">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="glass glass-sm entrar flex min-h-[122px] flex-col gap-3 p-5">
                <Sk className="sk-label" />
                <Sk className="sk-titulo" />
                <Sk className="sk-linha curta" />
              </div>
            ))}
          </div>
          <div className="grid gap-[14px] xl:grid-cols-[1.35fr_minmax(0,1fr)]">
            <div className="glass entrar flex flex-col gap-4 p-6">
              <Sk className="sk-label" />
              <Sk className="sk-bloco" />
              <Sk className="sk-bloco" />
            </div>
            <div className="glass entrar flex flex-col gap-4 p-6">
              <Sk className="sk-label" />
              <Sk className="sk-linha" />
              <Sk className="sk-linha" />
              <Sk className="sk-linha curta" />
            </div>
          </div>
        </div>
      )}

      <DirecaoCtx.Provider value={direcao}>
      <div ref={conteudoRef} className={carregandoPrimeira ? "hidden" : ""}>
      {/* Colunas conforme a quantidade de KPIs da aba: o Cenário atual tem 4
          (saiu Prioridade A) e os outros têm 5. Cada KPI é um painel de vidro
          próprio; a seção não anima nada (ela contém os painéis). */}
      <section
        className={`mt-6 grid grid-cols-2 gap-[10px] ${
          kpis.length === 4 ? "xl:grid-cols-4" : "md:grid-cols-3 xl:grid-cols-5"
        }`}
      >
        {kpis.map((k, i) => (
          <div
            key={`${view}-${k.label}`}
            className={`glass glass-sm ${entrada} flex min-h-[96px] flex-col gap-[10px] p-[15px_14px_13px] md:min-h-[122px] md:p-[20px_20px_18px]`}
            style={{ animationDelay: `${i * 0.04}s` }}
          >
            <span className="text-[10.5px] leading-[1.3] font-bold tracking-[.09em] text-muted-foreground uppercase">
              {k.label}
            </span>
            <span
              className={`text-[28px] leading-[.9] font-black tracking-[-0.045em] md:text-[38px] ${
                k.alert ? "text-accent" : ""
              }`}
            >
              <Numero valor={k.value} />
              <span className="ml-[6px] text-[13px] font-semibold tracking-[-0.01em] text-subtle">
                {k.unit}
              </span>
            </span>
            <span className="mt-auto text-[11.5px] font-medium tracking-[-0.01em] text-subtle">
              {k.hint}
            </span>
          </div>
        ))}
      </section>

      {view === "acum" && (
        <>
          <div className="mt-[14px] grid gap-[14px] xl:grid-cols-[1.35fr_minmax(0,1fr)]">
            <Card
              title="Aberturas e fechamentos por mês"
              delay={0.1}
              aside={
                <span className="text-[11px] font-medium text-subtle">
                  <span className="font-semibold text-foreground">aberturas</span> ·{" "}
                  <span className="font-semibold">fechamentos</span> · clique no mês
                </span>
              }
            >
              <div className="flex h-[250px] items-end gap-1 md:gap-[10px]">
                {a.mesBars.map((m) => (
                  <button
                    key={m.mes}
                    onClick={() => openMes(m.mes)}
                    className="flex h-full flex-1 cursor-pointer flex-col items-center gap-2"
                  >
                    <div className="flex w-full flex-1 items-end justify-center gap-[3px]">
                      <div
                        className="relative max-w-[22px] flex-1 rounded-t-[2px] bg-ink transition-[height] duration-500"
                        style={{ height: m.hAb }}
                      >
                        <span className="tnum absolute -top-[17px] -right-[6px] -left-[6px] text-center text-[10px] font-extrabold">
                          {m.abLabel}
                        </span>
                      </div>
                      <div
                        className="relative max-w-[22px] flex-1 rounded-t-[2px] bg-ink-soft transition-[height] duration-500"
                        style={{ height: m.hFe }}
                      >
                        <span className="tnum absolute -top-[17px] -right-[6px] -left-[6px] text-center text-[10px] font-extrabold text-muted-foreground">
                          {m.feLabel}
                        </span>
                      </div>
                    </div>
                    <span
                      className={`text-[10.5px] font-semibold tracking-[-0.01em] whitespace-nowrap ${
                        m.selected ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {m.label}
                    </span>
                  </button>
                ))}
              </div>
            </Card>

            <Card
              title="Vagas em aberto no fim de cada mês"
              subtitle="vagas que seguiram abertas ao virar o mês"
              delay={0.15}
            >
              <div className="flex max-h-[300px] flex-col gap-[10px] overflow-y-auto">
                {a.backlogBars.map((b) => (
                  <div
                    key={b.label}
                    className="grid grid-cols-[58px_1fr_40px] items-center gap-3 md:grid-cols-[68px_1fr_44px]"
                  >
                    <span className="text-right text-[11.5px] font-semibold tracking-[-0.015em] whitespace-nowrap">
                      {b.label}
                    </span>
                    <div className="h-4 overflow-hidden rounded-[2px] bg-track">
                      <div
                        className="h-full rounded-[2px] transition-[width] duration-500"
                        style={{ width: b.w, background: b.color }}
                      />
                    </div>
                    <span className="tnum text-[12.5px] font-extrabold tracking-[-0.03em]">
                      {b.total}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <TableCard
            title="Fechamento consolidado por mês"
            delay={0.2}
            aside={<span className="text-[11px] font-medium text-subtle">{a.acumNote}</span>}
          >
            <div className="min-w-[780px] xl:min-w-0">
              <div
                className="grid border-b border-border bg-surface-alt text-[10.5px] font-bold tracking-[.07em] text-muted-foreground uppercase"
                style={{ gridTemplateColumns: tblCols }}
              >
                <span className="px-[14px] py-[10px]">Mês</span>
                {["Aberturas", "Fechamentos", "Saldo", "Atendimento", "Em aberto no fim", "SLA médio"].map(
                  (h) => (
                    <span key={h} className="px-[14px] py-[10px] text-right">
                      {h}
                    </span>
                  ),
                )}
              </div>
              {a.mesTable.map((r) => (
                <div
                  key={r.mes}
                  onClick={() => openMes(r.mes)}
                  className="tnum grid cursor-pointer items-center border-b border-hairline text-[12.5px] font-medium tracking-[-0.01em] transition-colors hover:bg-surface-alt"
                  style={{ gridTemplateColumns: tblCols }}
                >
                  <span className="px-[14px] py-[10px] font-bold">{r.label}</span>
                  <span className="px-[14px] py-[10px] text-right font-bold">{r.ab}</span>
                  <span className="px-[14px] py-[10px] text-right">{r.fe}</span>
                  <span className="px-[14px] py-[10px] text-right">{r.saldo}</span>
                  <span className="px-[14px] py-[10px] text-right">{r.taxa}</span>
                  <span className="px-[14px] py-[10px] text-right">{r.backlog}</span>
                  <span className="px-[14px] py-[10px] text-right text-muted-foreground">
                    {r.sla}
                  </span>
                </div>
              ))}
              <div
                className="tnum grid items-center bg-surface-alt text-[12.5px] font-extrabold tracking-[-0.01em]"
                style={{ gridTemplateColumns: tblCols }}
              >
                <span className="px-[14px] py-3">Acumulado</span>
                <span className="px-[14px] py-3 text-right">{a.totAb}</span>
                <span className="px-[14px] py-3 text-right">{a.totFe}</span>
                <span className="px-[14px] py-3 text-right">{a.totSaldo}</span>
                <span className="px-[14px] py-3 text-right">{a.totTaxa}</span>
                <span className="px-[14px] py-3 text-right">{a.totBacklog}</span>
                <span className="px-[14px] py-3 text-right text-muted-foreground">{a.totSla}</span>
              </div>
            </div>
          </TableCard>
        </>
      )}

      {view === "mes" && (
        <>
          <div className="no-print mt-[14px] flex flex-wrap items-center gap-[10px]">
            <span className="text-[11px] font-bold tracking-[.08em] text-muted-foreground uppercase">
              Mês de fechamento
            </span>
            <select
              value={a.selMes}
              onChange={(e) => setSelMes(e.target.value)}
              className="rounded-full border border-input bg-card px-3 py-2 text-[12.5px] font-semibold"
            >
              {a.meses.map((m) => (
                <option key={m} value={m}>
                  {mesLongo(m)}
                </option>
              ))}
            </select>
            <span className="text-[11.5px] font-medium text-subtle">
              comparado com {a.prevLabel}
            </span>
          </div>

          <TableCard
            title={`${a.mesLabelLongo} contra ${a.prevLabel}`}
            subtitle="variação nas métricas de fechamento do mês"
            delay={0.1}
          >
            <div className="min-w-[720px] xl:min-w-0">
              <div
                className="grid border-b border-border bg-surface-alt text-[10.5px] font-bold tracking-[.07em] text-muted-foreground uppercase"
                style={{ gridTemplateColumns: compCols }}
              >
                <span className="px-[14px] py-[10px]">Indicador</span>
                <span className="px-[14px] py-[10px] text-right">{a.mesShort}</span>
                <span className="px-[14px] py-[10px] text-right">{a.prevShort}</span>
                <span className="px-[14px] py-[10px] text-right">Variação</span>
                <span className="px-[14px] py-[10px]">Leitura</span>
              </div>
              {a.compRows.map((c) => (
                <div
                  key={c.label}
                  className="tnum grid items-center border-b border-hairline text-[12.5px] font-medium transition-colors hover:bg-surface-alt"
                  style={{ gridTemplateColumns: compCols }}
                >
                  <span className="px-[14px] py-[11px] font-semibold tracking-[-0.015em]">
                    {c.label}
                  </span>
                  <span className="px-[14px] py-[11px] text-right text-[14px] font-extrabold tracking-[-0.02em]">
                    {c.now}
                  </span>
                  <span className="px-[14px] py-[11px] text-right text-muted-foreground">
                    {c.prev}
                  </span>
                  <span
                    className={`px-[14px] py-[11px] text-right font-bold ${
                      c.muted ? "text-muted-foreground" : ""
                    }`}
                  >
                    {c.delta}
                  </span>
                  <span className="px-[14px] py-[11px] text-[11.5px] tracking-[-0.01em] text-subtle">
                    {c.note}
                  </span>
                </div>
              ))}
            </div>
          </TableCard>

          <div className="mt-[14px] grid gap-[14px] md:grid-cols-2 xl:grid-cols-3">
            <Card
              title="Fechamentos por recrutador"
              subtitle="volume e SLA médio no mês"
              delay={0.15}
            >
              <MiniBars rows={a.fechRecrut} />
            </Card>
            <Card
              title="Fechamentos por unidade"
              subtitle="distribuição do volume fechado"
              delay={0.2}
            >
              <MiniBars rows={a.fechUnid} />
            </Card>
            <Card
              title="Origem dos contratados"
              subtitle="canais que geraram as contratações"
              delay={0.25}
            >
              <MiniBars rows={a.canais} />
            </Card>
          </div>

          <div className="mt-[14px] grid gap-[14px] xl:grid-cols-[1.35fr_minmax(0,1fr)]">
            <Card
              title="Mix dos fechamentos"
              subtitle="abertas e fechadas no próprio mês contra recorrentes"
              delay={0.3}
            >
              <div className="flex flex-wrap items-center gap-4 md:gap-6">
                <div
                  className="relative size-28 flex-none rounded-full transition-[background] duration-500 md:size-[136px]"
                  style={{ background: a.mixDonut }}
                >
                  <div className="absolute inset-[26px] flex flex-col items-center justify-center gap-px rounded-full bg-card">
                    <span className="text-[26px] leading-none font-black tracking-[-0.04em]">
                      {a.mixTotal}
                    </span>
                    <span className="text-[9.5px] font-semibold tracking-[.07em] text-subtle uppercase">
                      fechadas
                    </span>
                  </div>
                </div>
                <div className="flex flex-1 flex-col gap-[11px]">
                  {a.mixRows.map((m) => (
                    <div key={m.label} className="flex items-center gap-[9px]">
                      <span
                        className="size-[9px] flex-none rounded-[2px]"
                        style={{ background: m.color }}
                      />
                      <span className="flex-1 text-xs font-semibold tracking-[-0.01em]">
                        {m.label}
                      </span>
                      <span className="tnum text-[12.5px] font-extrabold">{m.total}</span>
                      <span className="tnum w-10 text-right text-[11px] font-medium text-subtle">
                        {m.pct}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            <Card
              title={`Destino das aberturas de ${a.mesShort}`}
              subtitle="situação atual das vagas criadas no mês"
              delay={0.35}
            >
              <ColumnBars rows={a.destinoBars} height={200} maxWidth={62} />
            </Card>
          </div>
        </>
      )}

      {view === "atual" && (
        <>
          <div className="mt-[18px] flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-[15px] font-bold tracking-[-0.02em]">
              Vagas em aberto por unidade
            </h2>
            <span className="no-print text-[11px] font-medium text-subtle">
              clique na unidade para filtrar a lista abaixo
            </span>
          </div>
          {/* flex-wrap em vez de grid: o número de unidades varia conforme a
              planilha, e numa grade de N colunas as sobras viravam blocos cinza
              vazios no fim da linha. Com grow + basis os cartões esticam para
              fechar a linha em qualquer quantidade. */}
          <section className="mt-[10px] flex flex-wrap gap-[10px]">
            {a.unidadeTiles.map((u, i) => (
              <button
                key={u.label}
                type="button"
                aria-pressed={unidadeFiltrada?.chave === u.chave}
                onClick={() =>
                  setFiltroUnidade((atual) => (atual === u.chave ? null : u.chave))
                }
                className={`glass glass-sm card ${entrada} flex min-h-[92px] grow basis-[150px] cursor-pointer flex-col gap-2 p-[14px_14px_12px] text-left md:p-[16px_16px_14px] ${
                  unidadeFiltrada?.chave === u.chave ? "glass-strong" : ""
                }`}
                style={{ animationDelay: `${i * 0.04}s` }}
              >
                <Check />
                <span className="pr-6 text-[10px] leading-[1.3] font-bold tracking-[.08em] text-muted-foreground uppercase">
                  {u.label}
                </span>
                <span className="text-[22px] leading-none font-black tracking-[-0.04em] md:text-[26px]">
                  <span className="ini">
                    <Numero valor={u.total} />
                  </span>
                  <span className="ml-[5px] text-[11px] font-semibold tracking-[-0.01em] text-subtle">
                    {u.total === "1" ? "vaga" : "vagas"}
                  </span>
                </span>
                <span className="mt-auto text-[11px] font-medium tracking-[-0.01em] text-subtle">
                  {u.pct} do total
                </span>
              </button>
            ))}
          </section>

          <div className="mt-[18px] flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-[15px] font-bold tracking-[-0.02em]">
              Vagas em aberto por recrutador
            </h2>
            <span className="no-print text-[11px] font-medium text-subtle">
              clique no recrutador para filtrar a lista abaixo
            </span>
          </div>
          <section className="mt-[10px] flex flex-wrap gap-[10px]">
            {a.recrutadorTiles.map((r, i) => (
              <button
                key={r.chave}
                type="button"
                aria-pressed={recrutadorFiltrado?.chave === r.chave}
                onClick={() =>
                  setFiltroRecrutador((atual) => (atual === r.chave ? null : r.chave))
                }
                className={`glass glass-sm card ${entrada} flex min-h-[92px] grow basis-[150px] cursor-pointer flex-col gap-2 p-[14px_14px_12px] text-left md:p-[16px_16px_14px] ${
                  recrutadorFiltrado?.chave === r.chave ? "glass-strong" : ""
                }`}
                style={{ animationDelay: `${i * 0.04}s` }}
              >
                <Check />
                <span className="pr-6 text-[10px] leading-[1.3] font-bold tracking-[.08em] text-muted-foreground uppercase">
                  {r.label}
                </span>
                <span className="text-[22px] leading-none font-black tracking-[-0.04em] md:text-[26px]">
                  <span className="ini">
                    <Numero valor={r.total} />
                  </span>
                  <span className="ml-[5px] text-[11px] font-semibold tracking-[-0.01em] text-subtle">
                    {r.total === "1" ? "vaga" : "vagas"}
                  </span>
                </span>
                <span className="mt-auto text-[11px] font-medium tracking-[-0.01em] text-subtle">
                  <span className={r.alerta ? "font-semibold text-accent" : ""}>
                    {r.mediaDias} em média
                  </span>{" "}
                  · {r.acima} acima de 25d
                </span>
              </button>
            ))}
          </section>

          <TableCard
            title={`Vagas em aberto${filtrosAtivos.length ? ` · ${filtrosAtivos.join(" · ")}` : ""}`}
            subtitle={`da mais antiga para a mais nova · em azul, acima da meta de 25 dias`}
            delay={0.05}
            aside={
              <span className="flex items-baseline gap-3 text-[11px] font-medium text-subtle">
                <span>
                  <Numero valor={listaVisivel.length} /> {listaVisivel.length === 1 ? "vaga" : "vagas"}
                </span>
                <Bolha visivel={filtrosAtivos.length > 0}>
                  <button
                    type="button"
                    onClick={() => {
                      setFiltroUnidade(null);
                      setFiltroRecrutador(null);
                    }}
                    className="btn no-print rounded-full px-2 font-semibold text-foreground underline underline-offset-2"
                  >
                    mostrar todas
                  </button>
                </Bolha>
              </span>
            }
          >
            <div className="min-w-[900px] xl:min-w-0">
              <div
                className="grid border-b border-border bg-surface-alt text-[10.5px] font-bold tracking-[.07em] text-muted-foreground uppercase"
                style={{ gridTemplateColumns: listaCols }}
              >
                <span className="px-[14px] py-[10px]">Vaga</span>
                <span className="px-[14px] py-[10px]">Unidade</span>
                <span className="px-[14px] py-[10px]">Requisitante</span>
                <span className="px-[14px] py-[10px]">Recrutador</span>
                <span className="px-[14px] py-[10px]">Etapa</span>
                <span className="px-[14px] py-[10px] text-right">Aberta em</span>
                <span className="px-[14px] py-[10px] text-right">Dias</span>
              </div>
              {/* Rolagem própria para a lista não empurrar os gráficos para longe;
                  na impressão ela sai inteira. */}
              <div className="lista-cascata max-h-[440px] overflow-y-auto print:max-h-none print:overflow-visible">
                {listaVisivel.map((v) => (
                  <div
                    key={v.id}
                    className="tnum grid items-center border-b border-hairline text-[12.5px] font-medium tracking-[-0.01em] transition-colors hover:bg-surface-alt"
                    style={{ gridTemplateColumns: listaCols }}
                  >
                    <span className="flex min-w-0 flex-col gap-[2px] px-[14px] py-[9px]">
                      <span className="truncate font-semibold" title={v.vaga}>
                        {v.vaga}
                      </span>
                      <span className="truncate text-[11px] text-subtle" title={v.area}>
                        {v.area}
                      </span>
                    </span>
                    <span className="truncate px-[14px] py-[9px]" title={v.unidade}>
                      {v.unidade}
                    </span>
                    <span className="truncate px-[14px] py-[9px]" title={v.gestor}>
                      {v.gestor}
                    </span>
                    <span className="truncate px-[14px] py-[9px]">{v.recrutador}</span>
                    <span className="truncate px-[14px] py-[9px] text-muted-foreground">
                      {v.etapa}
                    </span>
                    <span className="px-[14px] py-[9px] text-right text-muted-foreground">
                      {v.aberta}
                    </span>
                    <span
                      className={`px-[14px] py-[9px] text-right text-[13.5px] font-extrabold tracking-[-0.03em] ${
                        v.acimaMeta ? "text-accent" : ""
                      }`}
                    >
                      {v.dias}
                    </span>
                  </div>
                ))}
                {listaVisivel.length === 0 && (
                  <p className="px-[14px] py-6 text-center text-[12px] text-subtle">
                    {filtrosAtivos.length
                      ? `Nenhuma vaga em aberto para ${filtrosAtivos.join(" + ")}.`
                      : "Nenhuma vaga em aberto na base."}
                  </p>
                )}
              </div>
            </div>
          </TableCard>

          <div className="mt-[14px] grid gap-[14px] xl:grid-cols-3">
            <Card
              title="Vagas abertas hoje por área"
              delay={0.1}
              className="xl:col-span-2"
              aside={
                <span className="text-[11px] font-medium text-subtle">
                  status Aberta na base atual
                </span>
              }
            >
              <div className="flex max-h-[380px] flex-col gap-[11px] overflow-y-auto">
                {a.areaBars.map((r) => (
                  <div
                    key={r.label}
                    className="grid grid-cols-[104px_1fr_38px] items-center gap-[14px] md:grid-cols-[176px_1fr_44px]"
                  >
                    <span className="truncate text-right text-xs font-semibold tracking-[-0.015em]">
                      {r.label}
                    </span>
                    <div className="h-5 overflow-hidden rounded-[2px] bg-track">
                      <div
                        className="h-full rounded-[2px] transition-[width] duration-500"
                        style={{ width: r.w, background: r.color }}
                      />
                    </div>
                    <span className="tnum text-[13.5px] font-extrabold tracking-[-0.03em]">
                      {r.total}
                    </span>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="Acréscimo x substituição" subtitle="natureza do saldo aberto" delay={0.15}>
              <div className="flex flex-wrap items-center gap-4 md:gap-6">
                <div
                  className="relative size-28 flex-none rounded-full transition-[background] duration-500 md:size-[136px]"
                  style={{ background: a.tipoDonut }}
                >
                  <div className="absolute inset-[26px] flex flex-col items-center justify-center gap-px rounded-full bg-card">
                    <span className="text-[26px] leading-none font-black tracking-[-0.04em]">
                      {a.atualAbertas}
                    </span>
                    <span className="text-[9.5px] font-semibold tracking-[.07em] text-subtle uppercase">
                      abertas
                    </span>
                  </div>
                </div>
                <div className="flex flex-1 flex-col gap-[11px]">
                  {a.tipoRows.map((t) => (
                    <div key={t.label} className="flex items-center gap-[9px]">
                      <span
                        className="size-[9px] flex-none rounded-[2px]"
                        style={{ background: t.color }}
                      />
                      <span className="flex-1 text-xs font-semibold tracking-[-0.01em]">
                        {t.label}
                      </span>
                      <span className="tnum text-[12.5px] font-extrabold">{t.total}</span>
                      <span className="tnum w-10 text-right text-[11px] font-medium text-subtle">
                        {t.pct}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>

          <div className="mt-[14px] grid gap-[14px] md:grid-cols-2 xl:grid-cols-3">
            <Card
              title="Tempo das vagas em aberto"
              subtitle="dias corridos em aberto · meta 25 dias"
              delay={0.2}
            >
              <ColumnBars rows={a.agingBars} height={190} maxWidth={54} />
            </Card>

            <Card
              title="Composição das vagas em aberto"
              subtitle={`duas leituras das mesmas ${a.atualAbertas} vagas abertas`}
              delay={0.25}
            >
              <div className="flex flex-col gap-[22px]">
                <div className="flex flex-col gap-[11px]">
                  <span className="border-b border-hairline pb-[6px] text-[10px] font-bold tracking-[.09em] text-muted-foreground uppercase">
                    Base da vaga
                  </span>
                  <MiniBars rows={a.baseBars} />
                </div>
                <div className="flex flex-col gap-[11px]">
                  <span className="border-b border-hairline pb-[6px] text-[10px] font-bold tracking-[.09em] text-muted-foreground uppercase">
                    Modelo de contratação
                  </span>
                  <MiniBars rows={a.modeloBars} />
                </div>
              </div>
            </Card>

            <Card
              title="SLA de fechamento"
              subtitle="dias entre abertura e fechamento · meta 25 dias"
              delay={0.3}
            >
              <div className="flex flex-col gap-3">
                {a.slaBars.map((s) => (
                  <div
                    key={s.label}
                    className="grid grid-cols-[104px_1fr_46px] items-center gap-3 md:grid-cols-[124px_1fr_52px]"
                  >
                    <span className="text-right text-[11.5px] font-semibold tracking-[-0.015em] whitespace-nowrap">
                      {s.label}
                    </span>
                    <div className="h-[18px] overflow-hidden rounded-[2px] bg-track">
                      <div
                        className="h-full rounded-[2px] transition-[width] duration-500"
                        style={{ width: s.w, background: s.color }}
                      />
                    </div>
                    <span className="tnum text-[12.5px] font-extrabold tracking-[-0.03em]">
                      {s.total}
                      <span className="ml-[3px] text-[10px] font-medium text-subtle">d</span>
                    </span>
                  </div>
                ))}
                <span className="text-[11px] leading-[1.55] font-medium tracking-[-0.01em] text-subtle">
                  {a.slaNote}
                </span>
              </div>
            </Card>
          </div>

          <TableCard
            title="Qualidade do preenchimento"
            subtitle="campos em branco e incoerências na planilha que limitam a análise"
            delay={0.35}
          >
            <div className="min-w-[680px] xl:min-w-0">
              <div
                className="grid border-b border-border bg-surface-alt text-[10.5px] font-bold tracking-[.07em] text-muted-foreground uppercase"
                style={{ gridTemplateColumns: consCols }}
              >
                <span className="px-[14px] py-[10px]">Campo</span>
                <span className="px-[14px] py-[10px] text-right">Sem preenchimento</span>
                <span className="px-[14px] py-[10px] text-right">Universo</span>
                <span className="px-[14px] py-[10px]">Impacto</span>
              </div>
              {a.consRows.map((c) => (
                <div
                  key={c.label}
                  className="tnum grid items-center border-b border-hairline text-[12.5px] font-medium"
                  style={{ gridTemplateColumns: consCols }}
                >
                  <span className="px-[14px] py-[10px] font-semibold">{c.label}</span>
                  <span
                    className={`px-[14px] py-[10px] text-right font-bold ${
                      c.alert ? "text-accent" : "text-muted-foreground"
                    }`}
                  >
                    {c.faltando}
                  </span>
                  <span className="px-[14px] py-[10px] text-right text-muted-foreground">
                    {c.universo}
                  </span>
                  <span className="px-[14px] py-[10px] text-[11.5px] text-subtle">{c.impacto}</span>
                </div>
              ))}
            </div>
          </TableCard>
        </>
      )}
      </div>
      </DirecaoCtx.Provider>

      <footer className="mt-5 flex flex-col items-baseline justify-between gap-[6px] text-[11px] font-medium tracking-[-0.01em] text-faint md:flex-row md:gap-6">
        <span>{carregando ? "Atualizando dados..." : fonte} · meta de SLA 25 dias</span>
        <span>Fonte oficial: plataforma Farol de Vagas WAP (atualiza sozinha quando alguém edita uma vaga).</span>
      </footer>

    </div>
  );
}
