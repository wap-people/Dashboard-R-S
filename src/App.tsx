import { useEffect, useMemo, useRef, useState } from "react";

import logoUrl from "@/assets/wap-logo.png";
import seed from "@/data/vagas.json";
import {
  buildAnalytics,
  COLUNAS_ESPERADAS,
  mesLongo,
  mesPadrao,
  noEscopo,
  parsePlanilha,
  toCsv,
  type Vaga,
} from "@/lib/rs-analytics";
import { getVagasFromSheet } from "@/lib/sheets";

const SEED_ROWS = seed as Vaga[];
const FONTE_PADRAO = "FAROL DE VAGAS 2026 WAP — aba Vagas 2026";
const LS_ROWS = "wap_rs_full_v1";
const LS_FONTE = "wap_rs_full_fonte";

/** De quanto em quanto tempo o painel relê a planilha sozinho. */
const INTERVALO_ATUALIZACAO_MS = 5 * 60 * 1000;

/** Ao voltar para a aba, só relê se a última leitura já tiver esta idade. */
const IDADE_MINIMA_PARA_RELER_MS = 60 * 1000;

/** BOM do UTF-8, para o Excel abrir o CSV exportado com os acentos certos. */
const BOM = String.fromCharCode(0xfeff);

type View = "acum" | "mes" | "atual";

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
  return (
    <section
      className={`wap-rise rounded-sm border border-border bg-card p-[18px_16px_20px] md:p-[22px_24px_24px] ${className}`}
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
  return (
    <section
      className="wap-rise mt-[14px] overflow-hidden rounded-sm border border-border bg-card"
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

export default function Dashboard() {
  const [rows, setRows] = useState<Vaga[]>(SEED_ROWS);
  const [fonte, setFonte] = useState(FONTE_PADRAO);
  const [view, setView] = useState<View>("acum");
  const [selMes, setSelMes] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteMsg, setPasteMsg] = useState("");
  const [pasteOk, setPasteOk] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [erroSheet, setErroSheet] = useState("");
  // Uma importação colada à mão não pode ser varrida pela atualização
  // automática alguns minutos depois, sem ninguém pedir.
  const [modoManual, setModoManual] = useState(false);
  const ultimaLeitura = useRef(0);

  const carregarSheet = async () => {
    setSincronizando(true);
    try {
      const res = await getVagasFromSheet();
      if (res.rows.length) {
        const novaFonte =
          "Google Sheets · aba “Vagas 2026” · atualizado em " +
          new Date(res.carregadoEm).toLocaleString("pt-BR");
        setRows(res.rows as Vaga[]);
        setFonte(novaFonte);
        // Não mexer em selMes: a releitura automática jogaria o mês escolhido de
        // volta para o padrão no meio da análise. buildAnalytics já cai no mês
        // padrão sozinho quando o escolhido some da base.
        ultimaLeitura.current = Date.now();
        setErroSheet("");
        try {
          localStorage.setItem(LS_ROWS, JSON.stringify(res.rows));
          localStorage.setItem(LS_FONTE, novaFonte);
        } catch {
          /* armazenamento indisponível */
        }
      }
    } catch (e) {
      // Sem botão de atualizar, engolir a falha deixaria número velho na tela
      // passando por atual — e sem nenhuma forma de a pessoa perceber.
      setErroSheet(e instanceof Error ? e.message : "Falha ao ler a planilha do Google Sheets.");
    } finally {
      setSincronizando(false);
    }
  };

  useEffect(() => {
    // Cache local só serve de exibição imediata; a planilha é sempre a fonte da verdade.
    let stored: Vaga[] | null = null;
    try {
      const raw = localStorage.getItem(LS_ROWS);
      if (raw) stored = JSON.parse(raw) as Vaga[];
    } catch {
      stored = null;
    }
    if (stored && stored.length) {
      setRows(stored);
      setFonte(localStorage.getItem(LS_FONTE) || FONTE_PADRAO);
      setSelMes(mesPadrao(noEscopo(stored)));
    } else {
      setSelMes(mesPadrao(noEscopo(SEED_ROWS)));
    }
    void carregarSheet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Atualização automática, no lugar do antigo botão "Atualizar do Google Sheets".
  //
  // Dois gatilhos, porque sozinhos nenhum dos dois basta: o intervalo mantém um
  // painel deixado aberto na parede sempre fresco, e o retorno à aba cobre quem
  // edita a planilha e volta para cá — não faria sentido esperar o próximo ciclo.
  //
  // Não roda com a aba escondida (requisição para tela que ninguém vê) nem em
  // modo manual (sobrescreveria a base colada).
  useEffect(() => {
    if (modoManual) return;

    const relerSePreciso = (idadeMinima: number) => {
      if (document.hidden) return;
      if (Date.now() - ultimaLeitura.current < idadeMinima) return;
      void carregarSheet();
    };

    const id = setInterval(() => relerSePreciso(0), INTERVALO_ATUALIZACAO_MS);
    const aoVoltar = () => relerSePreciso(IDADE_MINIMA_PARA_RELER_MS);
    document.addEventListener("visibilitychange", aoVoltar);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modoManual]);

  const a = useMemo(() => buildAnalytics(rows, selMes), [rows, selMes]);

  const kpis = view === "acum" ? a.kpisAcum : view === "mes" ? a.kpisMes : a.kpisAtual;

  const applyPaste = () => {
    const res = parsePlanilha(pasteText);
    if (!res.ok) {
      setPasteMsg(res.msg);
      setPasteOk(false);
      return;
    }
    const novaFonte = "Importado da aba Vagas 2026 em " + new Date().toLocaleDateString("pt-BR");
    try {
      localStorage.setItem(LS_ROWS, JSON.stringify(res.rows));
      localStorage.setItem(LS_FONTE, novaFonte);
    } catch {
      /* armazenamento indisponível */
    }
    setRows(res.rows);
    setFonte(novaFonte);
    setSelMes(mesPadrao(noEscopo(res.rows)));
    setModoManual(true); // pausa a atualização automática até restaurar a base
    setErroSheet("");
    setShowImport(false);
    setPasteText("");
    setPasteOk(true);
    setPasteMsg(
      `${res.rows.length} vagas importadas` +
        (res.ignoradas ? ` · ${res.ignoradas} linhas vazias ignoradas` : ""),
    );
  };

  const resetAll = () => {
    try {
      localStorage.removeItem(LS_ROWS);
      localStorage.removeItem(LS_FONTE);
    } catch {
      /* armazenamento indisponível */
    }
    setRows(SEED_ROWS);
    setFonte(FONTE_PADRAO);
    setSelMes(mesPadrao(noEscopo(SEED_ROWS)));
    setShowImport(false);
    setPasteMsg("");
    // Volta ao automático e relê na hora, sem esperar o próximo ciclo.
    setModoManual(false);
    ultimaLeitura.current = 0;
    void carregarSheet();
  };

  const exportCsv = () => {
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
    setView("mes");
  };

  const tblCols = "1.4fr repeat(6, minmax(0, 1fr))";
  const compCols = "1.3fr .7fr .7fr .7fr 1.4fr";
  const consCols = "1.2fr .8fr .5fr 1.6fr";

  return (
    <main className="mx-auto min-h-screen max-w-[1680px] px-[14px] pt-4 pb-12 text-foreground md:px-8 md:pt-7 md:pb-16">
      <header className="flex flex-wrap items-start justify-between gap-8 border-b border-border pb-5 md:items-end">
        <div className="flex flex-col gap-3">
          <img
            src={logoUrl}
            alt="Wap | Waaw by Alok"
            className="h-5 w-auto object-contain object-left md:h-[26px]"
          />
          <div className="flex flex-col gap-[6px]">
            <h1 className="text-[25px] leading-none font-black tracking-[-0.03em] md:text-[34px]">
              Recrutamento &amp; Seleção · 2026
            </h1>
            <span className="text-[12.5px] font-medium tracking-[-0.01em] text-muted-foreground">
              {a.subtitle}
            </span>
          </div>
        </div>
        <div className="no-print flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              setShowImport(true);
              setPasteMsg("");
            }}
            className="rounded-full border border-input bg-card px-[14px] py-[9px] text-xs font-semibold tracking-[-0.01em] transition-colors hover:border-foreground"
          >
            Importar dados
          </button>

          <button
            onClick={exportCsv}
            className="rounded-full border border-input bg-card px-[14px] py-[9px] text-xs font-semibold tracking-[-0.01em] transition-colors hover:border-foreground"
          >
            Exportar CSV
          </button>
          <button
            onClick={() => window.print()}
            className="rounded-full border border-input bg-card px-[14px] py-[9px] text-xs font-semibold tracking-[-0.01em] transition-colors hover:border-foreground"
          >
            PDF
          </button>
          <button
            onClick={resetAll}
            className="rounded-full border border-transparent px-3 py-[9px] text-xs font-medium tracking-[-0.01em] text-muted-foreground transition-colors hover:text-foreground"
          >
            Restaurar base
          </button>
        </div>
      </header>

      <nav className="no-print flex flex-wrap items-center gap-[14px] border-b border-border py-4">
        <div className="flex flex-wrap gap-[2px] rounded-full bg-secondary p-[3px]">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setView(t.key)}
              className={`rounded-full px-[18px] py-[7px] text-[12.5px] font-semibold tracking-[-0.01em] transition-all ${
                view === t.key
                  ? "bg-card text-foreground shadow-[0_1px_3px_rgba(20,20,15,.14)]"
                  : "text-muted-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <span className="text-[11px] font-medium tracking-[-0.01em] text-subtle">
          {VIEW_HINT[view]}
        </span>
      </nav>

      <section className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-border bg-border md:grid-cols-3 xl:grid-cols-5">
        {kpis.map((k, i) => (
          <div
            key={k.label}
            className="wap-rise flex min-h-[96px] flex-col gap-[10px] bg-card p-[15px_14px_13px] md:min-h-[122px] md:p-[20px_20px_18px]"
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
              {k.value}
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
            <span className="text-[11px] font-medium text-subtle">
              status Aberta na base atual
            </span>
          </div>
          {/* flex-wrap em vez de grid: o número de unidades varia conforme a
              planilha, e numa grade de N colunas as sobras viravam blocos cinza
              vazios no fim da linha. Com grow + basis os cartões esticam para
              fechar a linha em qualquer quantidade. */}
          <section className="mt-[10px] flex flex-wrap gap-px overflow-hidden rounded-sm border border-border bg-border">
            {a.unidadeTiles.map((u, i) => (
              <div
                key={u.label}
                className="wap-rise flex min-h-[92px] grow basis-[150px] flex-col gap-2 bg-card p-[14px_14px_12px] md:p-[16px_16px_14px]"
                style={{ animationDelay: `${i * 0.04}s` }}
              >
                <span className="text-[10px] leading-[1.3] font-bold tracking-[.08em] text-muted-foreground uppercase">
                  {u.label}
                </span>
                <span className="text-[22px] leading-none font-black tracking-[-0.04em] md:text-[26px]">
                  {u.total}
                  <span className="ml-[5px] text-[11px] font-semibold tracking-[-0.01em] text-subtle">
                    vagas
                  </span>
                </span>
                <span className="mt-auto text-[11px] font-medium tracking-[-0.01em] text-subtle">
                  {u.pct} do total
                </span>
              </div>
            ))}
          </section>

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
            subtitle="campos em branco na planilha que limitam a análise"
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

      {erroSheet && (
        <p className="no-print mt-4 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-xs font-semibold text-destructive">
          {erroSheet}
        </p>
      )}

      <footer className="mt-5 flex flex-col items-baseline justify-between gap-[6px] text-[11px] font-medium tracking-[-0.01em] text-faint md:flex-row md:gap-6">
        <span>{sincronizando ? "Lendo a planilha…" : fonte} · meta de SLA 25 dias</span>
        <span>
          Fonte oficial: Google Sheets “FAROL DE VAGAS 2026 WAP”, aba Vagas 2026 —{" "}
          {modoManual
            ? "atualização automática pausada pela importação manual; use Restaurar base para religar."
            : "o painel relê a planilha sozinho a cada 5 minutos e ao voltar para esta aba."}
        </span>
      </footer>

      {showImport && (
        <div className="no-print wap-fade fixed inset-0 z-50 flex items-center justify-center bg-[oklch(0.19_0.01_107_/_0.55)] p-[14px] backdrop-blur-[3px] md:p-10">
          <div className="wap-rise flex max-h-[92vh] w-[820px] max-w-full flex-col gap-4 overflow-auto rounded-md bg-card p-7">
            <div className="flex flex-col gap-[6px]">
              <h3 className="text-[19px] font-extrabold tracking-[-0.03em]">
                Importar da aba “Vagas 2026”
              </h3>
              <p className="text-[12.5px] leading-[1.55] font-medium text-muted-foreground">
                No Excel, selecione a aba <strong>Vagas 2026</strong> inteira com a linha de
                cabeçalho (Ctrl+A no bloco de dados, Ctrl+C) e cole abaixo. O painel identifica as
                colunas pelo nome, recalcula acumulado, mês a mês e cenário atual, e salva tudo neste
                navegador. Enquanto essa base colada estiver em uso, a atualização automática fica
                pausada — clique em <strong>Restaurar base</strong> para voltar a ler o Google Sheets.
              </p>
            </div>
            <div className="flex flex-wrap gap-[6px]">
              {COLUNAS_ESPERADAS.map((c) => (
                <span
                  key={c}
                  className="rounded-full bg-hairline px-[9px] py-[5px] text-[10.5px] font-semibold tracking-[-0.01em] text-muted-foreground"
                >
                  {c}
                </span>
              ))}
            </div>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Cole aqui o conteúdo copiado da aba Vagas 2026…"
              className="h-[200px] resize-y rounded-sm border border-input p-3 font-mono text-[11.5px] leading-[1.5] outline-none focus:border-ring"
            />
            {pasteMsg ? (
              <span
                className={`text-[12.5px] leading-[1.5] font-semibold ${
                  pasteOk ? "" : "text-accent"
                }`}
              >
                {pasteMsg}
              </span>
            ) : null}
            <div className="flex flex-wrap justify-between gap-2">
              <span className="text-[11.5px] font-medium text-subtle">
                Base carregada agora: {a.baseResumo} vagas · {fonte}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowImport(false)}
                  className="rounded-full border border-input bg-card px-4 py-[10px] text-[12.5px] font-semibold"
                >
                  Cancelar
                </button>
                <button
                  onClick={applyPaste}
                  className="rounded-full border border-primary bg-primary px-[18px] py-[10px] text-[12.5px] font-semibold text-primary-foreground"
                >
                  Atualizar painel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
