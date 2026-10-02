export type Vaga = {
  id: number;
  d: string | null;
  df: string | null;
  st: string;
  r: string;
  u: string;
  g: string;
  a: string;
  v: string;
  sen?: string;
  t: string;
  m: string;
  b: string;
  o: string;
  pr: string;
  sa: number | null;
  sf: number | null;
  dfRuim?: boolean;
  /** Status exatamente como está na planilha (st pode ter sido ajustado). */
  stOrig?: string;
  /** Por que st difere de stOrig, quando difere. */
  ajuste?: "fechada-pela-data" | "vazio-aberta" | "vazio-fechada";
  /** Fechamento estimado pela data de admissão (a Data Fechamento estava vazia). */
  dfEst?: boolean;
  /** Coluna "Contratado" preenchida. */
  ct?: boolean;
  /** Etapa atual do processo (Divulgação, Triagem, Proposta...). */
  et?: string;
};

export const META_SLA = 25;

/**
 * Data de hoje no fuso de quem está olhando o painel, em AAAA-MM-DD.
 *
 * toISOString() devolve a data em UTC: das 21h à meia-noite no Brasil ela já é
 * "amanhã", e o aging pulava um dia todas as noites.
 */
export const hojeLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Dias corridos entre duas datas AAAA-MM-DD. */
export const diasEntre = (de: string, ate: string) =>
  Math.round((Date.parse(ate) - Date.parse(de)) / 86400000);

const MESES_CURTOS = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];
const MESES_LONGOS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export const mesLabel = (m: string) => {
  if (!m) return "—";
  const p = m.split("-");
  return MESES_CURTOS[(+p[1]! || 1) - 1] + "/" + p[0]!.slice(2);
};
export const mesLongo = (m: string) => {
  if (!m) return "—";
  const p = m.split("-");
  return MESES_LONGOS[(+p[1]! || 1) - 1] + "/" + p[0]!;
};

export const nf = (v: number) => v.toLocaleString("pt-BR");
export const fmt = (v: number | null, suf = "") =>
  v === null || v === undefined || isNaN(v)
    ? "—"
    : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + suf;
export const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) + "%" : "—");

const fechada = (r: Vaga) => /fechad/i.test(r.st || "");
const encerrada = (r: Vaga) => /fechad|cancel|desist/i.test(r.st || "");
const pausada = (r: Vaga) => /stand|suspens/i.test(r.st || "");
// Aberta é tudo o que não terminou nem está pausado. Antes exigia a palavra
// "Aberta" escrita no status; qualquer variação ("Em andamento", "Em aberto")
// fazia a vaga sumir da contagem.
const aberta = (r: Vaga) => !encerrada(r) && !pausada(r);

const media = (v: (number | null)[]) => {
  const x = v.filter((n): n is number => typeof n === "number" && !isNaN(n));
  return x.length ? x.reduce((a, b) => a + b, 0) / x.length : null;
};
const mediana = (v: (number | null)[]) => {
  const x = v.filter((n): n is number => typeof n === "number" && !isNaN(n)).sort((a, b) => a - b);
  if (!x.length) return null;
  return x.length % 2 ? x[(x.length - 1) / 2]! : (x[x.length / 2 - 1]! + x[x.length / 2]!) / 2;
};

/**
 * Chave de equivalência: ignora caixa, acento e espaço.
 *
 * A planilha é digitada à mão, então a mesma categoria aparece escrita de mais de
 * um jeito — "Adm/Corp" (33 linhas) e "ADM/Corp" (1 linha) eram a mesma base
 * rendendo duas barras. Agrupar pela grafia crua divide o grupo; agrupar por esta
 * chave junta.
 */
const chaveEquivalente = (s: string) =>
  String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, "");

/**
 * Rótulo do grupo: a grafia que mais aparece.
 *
 * Escolher a predominante em vez de inventar uma padronização evita estragar
 * siglas legítimas (title-case transformaria "TI" em "Ti") e mantém na tela um
 * texto que existe de fato na planilha.
 */
const grafiaDominante = (grafias: Map<string, number>) =>
  [...grafias.entries()].sort((a, b) => b[1] - a[1])[0]![0];

const group = (rows: Vaga[], key: keyof Vaga): [string, Vaga[]][] => {
  const m = new Map<string, { grafias: Map<string, number>; rows: Vaga[] }>();
  rows.forEach((r) => {
    const bruto = (r[key] as string) || "—";
    const k = chaveEquivalente(bruto);
    if (!m.has(k)) m.set(k, { grafias: new Map(), rows: [] });
    const g = m.get(k)!;
    g.grafias.set(bruto, (g.grafias.get(bruto) || 0) + 1);
    g.rows.push(r);
  });
  return [...m.values()]
    .map((g) => [grafiaDominante(g.grafias), g.rows] as [string, Vaga[]])
    .sort((a, b) => b[1].length - a[1].length);
};

const agrupa = (list: Vaga[], fn: (r: Vaga) => string): [string, number][] => {
  const m = new Map<string, { grafias: Map<string, number>; total: number }>();
  list.forEach((r) => {
    const bruto = fn(r);
    const k = chaveEquivalente(bruto);
    if (!m.has(k)) m.set(k, { grafias: new Map(), total: 0 });
    const g = m.get(k)!;
    g.grafias.set(bruto, (g.grafias.get(bruto) || 0) + 1);
    g.total++;
  });
  return [...m.values()]
    .map((g) => [grafiaDominante(g.grafias), g.total] as [string, number])
    .sort((a, b) => b[1] - a[1]);
};

/**
 * Anula os fechamentos impossíveis (anteriores à abertura ou no futuro), sem
 * descartar linha nenhuma.
 *
 * Serve de base para duas leituras diferentes: o recorte 2026 (noEscopo) e a
 * qualidade do preenchimento, que precisa enxergar a planilha inteira — inclusive
 * as linhas que o recorte deixa de fora. Contar buracos só dentro do recorte
 * esconde justamente as linhas que ficaram de fora por causa dos buracos.
 */
export function normalizaFechamento(rows: Vaga[]): Vaga[] {
  const hoje = hojeLocal();
  return (rows || []).map((r) => {
    if (r.df && ((r.d && r.df < r.d) || r.df > hoje))
      return { ...r, df: null, sf: null, dfRuim: true };
    return r;
  });
}

/** Fora do escopo 2026: vagas abertas em 2025 que não alcançaram 2026. */
export function noEscopo(rows: Vaga[]): Vaga[] {
  return normalizaFechamento(rows).filter((r) => {
    if (!r.d || r.d.slice(0, 4) > "2025") return true;
    if (r.df) return r.df.slice(0, 4) >= "2026";
    return !encerrada(r);
  });
}

export function mesesDe(rows: Vaga[]) {
  const cnt: Record<string, number> = {};
  rows.forEach((r) => {
    if (r.d) cnt[r.d.slice(0, 7)] = (cnt[r.d.slice(0, 7)] || 0) + 1;
    if (r.df) cnt[r.df.slice(0, 7)] = (cnt[r.df.slice(0, 7)] || 0) + 1;
  });
  return Object.keys(cnt).sort();
}

export function mesPadrao(rows: Vaga[]) {
  const meses = mesesDe(rows);
  const vol: Record<string, number> = {};
  rows.forEach((r) => {
    if (r.d) vol[r.d.slice(0, 7)] = (vol[r.d.slice(0, 7)] || 0) + 1;
    if (r.df) vol[r.df.slice(0, 7)] = (vol[r.df.slice(0, 7)] || 0) + 1;
  });
  for (let i = meses.length - 1; i >= 0; i--) if ((vol[meses[i]!] || 0) >= 5) return meses[i]!;
  return meses.length ? meses[meses.length - 1]! : "";
}

export const INK = "var(--ink)";
export const MID = "var(--ink-mid)";
export const SOFT = "var(--ink-soft)";
export const PALE = "var(--ink-pale)";
const PALETTE = [INK, MID, SOFT, PALE];

function barList(pairs: [string, number][], total: number, palette = PALETTE) {
  const max = Math.max(1, ...pairs.map((p) => p[1]));
  return pairs.map(([label, v], i) => ({
    label,
    total: nf(v),
    pct: pct(v, total),
    w: ((v / max) * 100).toFixed(2) + "%",
    color: palette[i % palette.length]!,
  }));
}

const fimDoMes = (m: string) => {
  const p = m.split("-");
  return new Date(Date.UTC(+p[0]!, +p[1]!, 0)).toISOString().slice(0, 10);
};

export function buildAnalytics(
  allRows: Vaga[],
  selMesIn: string,
  meta = META_SLA,
  /** Cabeçalho encontrado para cada campo (null = coluna não achada). */
  colunas?: Colunas | null,
) {
  const hoje = hojeLocal();
  // Aging calculado aqui, de Data Abertura até hoje — não lido da planilha. A
  // coluna "SLA" da aba depende de fórmula e estava em branco em 1.170 de 1.188
  // linhas; onde estava preenchida, este cálculo dá exatamente o mesmo número.
  const diasEmAberto = (r: Vaga) => (r.d ? Math.max(0, diasEntre(r.d, hoje)) : null);
  // Nome da coluna como está na planilha hoje, para a tabela de qualidade falar a
  // mesma língua da aba (e acompanhar se alguém renomear de novo).
  const nome = (c: Campo) => colunas?.[c] || CAMPOS.find((x) => x.campo === c)!.rotulo;
  const rows = noEscopo(allRows);
  // Planilha inteira, sem o recorte 2026: é sobre ela que a tabela de qualidade
  // do preenchimento precisa falar.
  const todas = normalizaFechamento(allRows);
  const meses = mesesDe(rows);
  const lastMes = meses.length ? meses[meses.length - 1]! : "";
  const selMes = selMesIn && meses.indexOf(selMesIn) > -1 ? selMesIn : mesPadrao(rows);
  const iSel = meses.indexOf(selMes);
  const prevMes = iSel > 0 ? meses[iSel - 1]! : "";

  const stats = (m: string) => {
    const fim = fimDoMes(m);
    const ab = rows.filter((r) => r.d && r.d.slice(0, 7) === m);
    // Só vaga fechada conta como fechamento. Cancelada com data marca quando
    // deixou de estar aberta (vale para o "em aberto no fim"), não uma entrega.
    const fe = rows.filter((r) => r.df && fechada(r) && r.df.slice(0, 7) === m);
    const doMes = fe.filter((r) => r.d && r.d.slice(0, 7) === m);
    const backlog = rows.filter(
      (r) => r.d && r.d <= fim && ((r.df && r.df > fim) || (!r.df && !encerrada(r))),
    );
    return { m, ab, fe, doMes, backlog, sla: media(fe.map((r) => r.sf)) };
  };
  const porMes = meses.map(stats);
  const cur = porMes[iSel] ?? { m: "", ab: [], fe: [], doMes: [], backlog: [], sla: null };
  const prev = iSel > 0 ? porMes[iSel - 1]! : null;

  const dentro = (m: string | null | undefined) => !!m && meses.indexOf(m) > -1;
  const totAbN = porMes.reduce((s, x) => s + x.ab.length, 0);
  const totFeN = porMes.reduce((s, x) => s + x.fe.length, 0);
  const noEixo = rows.filter(
    (r) => dentro(r.d && r.d.slice(0, 7)) || dentro(r.df && r.df.slice(0, 7)),
  );
  const foraEscopo = allRows.length - noEixo.length;
  // Contado sobre a planilha inteira, e não sobre o recorte: as linhas que o
  // recorte descarta são, em boa parte, justamente as que estão sem data de
  // fechamento. Medir só dentro do recorte reportava 69 quando o real era 389.
  const fechadasSemData = todas.filter((r) => fechada(r) && !r.df).length;
  // Fechadas sem Data Fechamento, mas com Admissão: entram no mês pela admissão,
  // porém ficam fora do SLA — a admissão vem depois do aceite e inflaria o prazo.
  const fechadasEstimadas = todas.filter((r) => fechada(r) && r.dfEst).length;
  const abertasHoje = noEixo.filter(aberta);
  const standBy = noEixo.filter(pausada).length;
  const canceladas = noEixo.filter((r) => /cancel|desist/i.test(r.st || "")).length;
  const slaGeral = media(noEixo.filter((r) => dentro(r.df && r.df.slice(0, 7))).map((r) => r.sf));

  // KPIs
  const kpisAcum = [
    {
      label: "Vagas na base",
      value: nf(noEixo.length),
      unit: "linhas",
      hint: `${meses.length} meses · ${mesLabel(meses[0] || "")} a ${mesLabel(lastMes)}`,
      alert: false,
    },
    {
      label: "Aberturas",
      value: nf(totAbN),
      unit: "vagas",
      hint: "com data de início de processo",
      alert: false,
    },
    {
      label: "Fechamentos datados",
      value: nf(totFeN),
      unit: "vagas",
      hint:
        `${nf(fechadasSemData)} fechadas sem data` +
        (fechadasEstimadas ? ` · ${nf(fechadasEstimadas)} datadas pela admissão` : ""),
      alert: false,
    },
    {
      label: "Taxa de atendimento",
      value: totAbN ? Math.round((totFeN / totAbN) * 100) + "%" : "—",
      unit: "",
      hint: "fechamentos datados sobre aberturas",
      alert: false,
    },
    {
      label: "SLA médio de fechamento",
      value: slaGeral === null ? "—" : Math.round(slaGeral) + "d",
      unit: "",
      hint: `meta de ${meta} dias`,
      alert: slaGeral !== null && slaGeral > meta,
    },
  ];

  const taxaMes = cur.ab.length ? Math.round((cur.fe.length / cur.ab.length) * 100) : null;
  const kpisMes = [
    {
      label: "Fechamentos no mês",
      value: nf(cur.fe.length),
      unit: "vagas",
      hint: mesLongo(selMes),
      alert: false,
    },
    {
      label: "Aberturas no mês",
      value: nf(cur.ab.length),
      unit: "vagas",
      hint: "demanda criada no período",
      alert: false,
    },
    {
      label: "Saldo do mês",
      value: nf(cur.ab.length - cur.fe.length),
      unit: "vagas",
      hint: "aberturas menos fechamentos",
      alert: false,
    },
    {
      label: "Taxa de atendimento",
      value: taxaMes === null ? "—" : taxaMes + "%",
      unit: "",
      hint: "do volume aberto no mês",
      alert: false,
    },
    {
      label: "SLA médio no mês",
      value: cur.sla === null ? "—" : fmt(Math.round(cur.sla * 10) / 10, "d"),
      unit: "",
      hint: `meta de ${meta} dias`,
      alert: cur.sla !== null && cur.sla > meta,
    },
  ];

  const agingMedio = media(abertasHoje.map(diasEmAberto));
  const foraMeta = abertasHoje.filter((r) => (diasEmAberto(r) ?? -1) > meta).length;
  const prioA = abertasHoje.filter((r) => r.pr === "A").length;
  const kpisAtual = [
    {
      label: "Vagas abertas hoje",
      value: nf(abertasHoje.length),
      unit: "vagas",
      hint: "status conferido pela Data Fechamento",
      alert: false,
    },
    {
      label: "Aging médio",
      value: agingMedio === null ? "—" : Math.round(agingMedio) + "d",
      unit: "",
      hint: "dias corridos desde a abertura",
      alert: agingMedio !== null && agingMedio > meta,
    },
    {
      label: "Acima da meta",
      value: nf(foraMeta),
      unit: "vagas",
      hint: `${pct(foraMeta, abertasHoje.length)} passaram de ${meta} dias`,
      alert: false,
    },
    {
      label: "Prioridade A",
      value: nf(prioA),
      unit: "vagas",
      hint: `${pct(prioA, abertasHoje.length)} das vagas em aberto`,
      alert: false,
    },
    {
      label: "Stand by e suspensas",
      value: nf(standBy),
      unit: "vagas",
      hint: `${canceladas} canceladas no histórico`,
      alert: false,
    },
  ];

  const maxMes = Math.max(1, ...porMes.map((s) => Math.max(s.ab.length, s.fe.length)));
  const mesBars = porMes.map((s) => ({
    mes: s.m,
    label: mesLabel(s.m),
    selected: s.m === selMes,
    abLabel: s.ab.length || "",
    feLabel: s.fe.length || "",
    hAb: ((s.ab.length / maxMes) * 100).toFixed(2) + "%",
    hFe: ((s.fe.length / maxMes) * 100).toFixed(2) + "%",
  }));

  const maxBack = Math.max(1, ...porMes.map((s) => s.backlog.length));
  const backlogBars = porMes.map((s) => ({
    label: mesLabel(s.m),
    total: nf(s.backlog.length),
    w: ((s.backlog.length / maxBack) * 100).toFixed(2) + "%",
    color: s.m === lastMes ? INK : SOFT,
  }));

  const mesTable = porMes.map((s) => ({
    mes: s.m,
    label: mesLongo(s.m),
    ab: nf(s.ab.length),
    fe: nf(s.fe.length),
    saldo: nf(s.ab.length - s.fe.length),
    taxa: pct(s.fe.length, s.ab.length),
    backlog: nf(s.backlog.length),
    sla: s.sla === null ? "—" : fmt(Math.round(s.sla * 10) / 10, "d"),
  }));

  const cmp = (
    label: string,
    a: number | null,
    b: number | null,
    kind: "n" | "pp" | "abs" | "dias",
    note: string,
  ) => {
    let delta = "sem base";
    let muted = true;
    if (a !== null && b !== null && !isNaN(a) && !isNaN(b)) {
      const d = a - b;
      if (kind === "pp") delta = (d > 0 ? "+" : "") + Math.round(d) + " p.p.";
      else if (kind === "abs" || b === 0 || a < 0 !== b < 0)
        delta = (d > 0 ? "+" : "") + fmt(Math.round(d));
      else delta = (d > 0 ? "+" : "") + Math.round((d / Math.abs(b)) * 100) + "%";
      muted = d === 0;
    }
    const suf = kind === "pp" ? "%" : kind === "dias" ? "d" : "";
    return {
      label,
      now: a === null ? "—" : fmt(Math.round(a * 10) / 10, suf),
      prev: b === null ? "—" : fmt(Math.round(b * 10) / 10, suf),
      delta,
      muted,
      note,
    };
  };
  const taxaOf = (s: typeof cur | null) =>
    s && s.ab.length ? Math.round((s.fe.length / s.ab.length) * 100) : null;
  const mixOf = (s: typeof cur | null) =>
    s && s.fe.length ? Math.round((s.doMes.length / s.fe.length) * 100) : null;
  const compRows = [
    cmp("Fechamentos", cur.fe.length, prev ? prev.fe.length : null, "n", "vagas entregues no mês"),
    cmp("Aberturas", cur.ab.length, prev ? prev.ab.length : null, "n", "demanda criada no mês"),
    cmp(
      "Saldo do mês",
      cur.ab.length - cur.fe.length,
      prev ? prev.ab.length - prev.fe.length : null,
      "abs",
      "positivo aumenta as vagas em aberto",
    ),
    cmp("Taxa de atendimento", taxaOf(cur), taxaOf(prev), "pp", "fechamentos sobre aberturas"),
    cmp("Fechadas no próprio mês", mixOf(cur), mixOf(prev), "pp", "agilidade do ciclo"),
    cmp(
      "Vagas em aberto no fim do mês",
      cur.backlog.length,
      prev ? prev.backlog.length : null,
      "n",
      "vagas que viraram o mês abertas",
    ),
    cmp("SLA médio de fechamento", cur.sla, prev ? prev.sla : null, "dias", "menor é melhor"),
  ];

  const feTotal = cur.fe.length;
  const recrutGroups = group(cur.fe, "r").slice(0, 8);
  const recrutMax = Math.max(1, ...recrutGroups.map((a) => a[1].length));
  const fechRecrut = recrutGroups.map(([label, list]) => {
    const s = media(list.map((x) => x.sf));
    return {
      label,
      total: nf(list.length),
      hint: s === null ? pct(list.length, feTotal) : Math.round(s) + "d SLA",
      w: ((list.length / recrutMax) * 100).toFixed(2) + "%",
      color: s !== null && s > meta ? MID : INK,
    };
  });
  const fechUnid = barList(
    group(cur.fe, "u").map(([k, v]) => [k, v.length] as [string, number]),
    feTotal,
    [INK],
  );
  const canaisPairs = group(
    cur.fe.filter((r) => r.o && r.o !== "Não informado"),
    "o",
  )
    .slice(0, 6)
    .map(([k, v]) => [k, v.length] as [string, number]);
  const semCanal = feTotal - canaisPairs.reduce((s, p) => s + p[1], 0);
  if (semCanal > 0) canaisPairs.push(["Sem canal informado", semCanal]);
  const canais = barList(canaisPairs, feTotal, [INK, MID, MID, SOFT, SOFT, PALE, PALE]);

  const dm = cur.doMes.length;
  const rc = feTotal - dm;
  const mixShare = feTotal ? dm / feTotal : 0;
  const mixRows = [
    { label: "Abertas e fechadas no mês", total: nf(dm), pct: pct(dm, feTotal), color: INK },
    { label: "Recorrentes de meses anteriores", total: nf(rc), pct: pct(rc, feTotal), color: SOFT },
  ];
  const mixDonut = `conic-gradient(from -90deg, ${INK} 0deg ${(mixShare * 360).toFixed(2)}deg, ${SOFT} ${(mixShare * 360).toFixed(2)}deg 360deg)`;

  const destVals: [string, number, string][] = [
    ["Aberturas", cur.ab.length, INK],
    ["Já fechadas", cur.ab.filter(fechada).length, MID],
    ["Ainda abertas", cur.ab.filter(aberta).length, SOFT],
    ["Stand by", cur.ab.filter((r) => /stand|suspens/i.test(r.st || "")).length, PALE],
    ["Canceladas", cur.ab.filter((r) => /cancel|desist/i.test(r.st || "")).length, PALE],
  ];
  const destMax = Math.max(1, ...destVals.map((d) => d[1]));
  const destinoBars = destVals.map(([label, v, color]) => ({
    label,
    total: nf(v),
    color,
    h: ((v / destMax) * 100).toFixed(2) + "%",
  }));

  const areaPairs = group(abertasHoje, "a").map(([k, v]) => [k, v.length] as [string, number]);
  const areaMax = Math.max(1, ...areaPairs.map((p) => p[1]));
  const areaBars = areaPairs.map(([label, v], i) => ({
    label,
    total: nf(v),
    w: ((v / areaMax) * 100).toFixed(2) + "%",
    color: i === 0 ? INK : i < 3 ? MID : SOFT,
  }));

  // Contador das vagas em aberto por unidade. group() já devolve ordenado da
  // maior para a menor, então a leitura começa pela unidade mais pressionada.
  const unidadeTiles = group(abertasHoje, "u").map(([label, list]) => ({
    label,
    // Chave de equivalência, para o filtro da lista: "Wap Serra" e "WAP Serra"
    // são a mesma unidade no cartão e precisam ser na lista também.
    chave: chaveEquivalente(label),
    total: nf(list.length),
    pct: pct(list.length, abertasHoje.length),
  }));

  // Carteira de cada recrutador: quantas vagas em aberto, há quanto tempo em
  // média e quantas já passaram da meta — a leitura de carga de trabalho.
  const recrutadorTiles = group(abertasHoje, "r").map(([label, list]) => {
    const dias = list.map(diasEmAberto);
    const med = media(dias);
    const acima = dias.filter((d) => d !== null && d > meta).length;
    return {
      label: label === "—" ? "Sem recrutador" : label,
      chave: chaveEquivalente(label),
      total: nf(list.length),
      mediaDias: med === null ? "—" : Math.round(med) + "d",
      acima: nf(acima),
      alerta: med !== null && med > meta,
    };
  });

  // Lista nominal das vagas em aberto, da mais antiga para a mais nova — quem
  // está há mais tempo esperando aparece primeiro.
  const dataBr = (iso: string | null) =>
    iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—";
  const listaAbertas = abertasHoje
    .map((r) => ({ r, dias: diasEmAberto(r) }))
    .sort((x, y) => (y.dias ?? -1) - (x.dias ?? -1))
    .map(({ r, dias }) => ({
      id: r.id,
      chaveUnidade: chaveEquivalente(r.u),
      chaveRecrutador: chaveEquivalente(r.r),
      vaga: r.v,
      area: r.a,
      unidade: r.u,
      gestor: r.g,
      recrutador: r.r,
      etapa: r.et || "—",
      prioridade: r.pr && r.pr !== "-" ? r.pr : "—",
      aberta: dataBr(r.d),
      dias: dias === null ? "—" : nf(dias),
      acimaMeta: dias !== null && dias > meta,
    }));

  const tipoPairs = agrupa(abertasHoje, (r) =>
    !r.t || r.t === "—" || r.t === "-" ? "Tipo não informado" : r.t,
  );
  const tipoTotal = abertasHoje.length;
  const tipoPalette = [INK, SOFT, PALE];
  let accShare = 0;
  const stops: string[] = [];
  const tipoRows = tipoPairs.map(([label, v], i) => {
    const share = tipoTotal ? v / tipoTotal : 0;
    stops.push(
      `${tipoPalette[i % tipoPalette.length]} ${(accShare * 360).toFixed(2)}deg ${((accShare + share) * 360).toFixed(2)}deg`,
    );
    accShare += share;
    return {
      label,
      total: nf(v),
      pct: pct(v, tipoTotal),
      color: tipoPalette[i % tipoPalette.length],
    };
  });
  stops.push(`var(--track) ${(accShare * 360).toFixed(2)}deg 360deg`);
  const tipoDonut = `conic-gradient(from -90deg, ${stops.join(", ")})`;

  const buckets: [string, (r: Vaga) => boolean][] = [
    ["0 a 15 dias", (r) => diasEmAberto(r)! <= 15],
    ["16 a 30 dias", (r) => diasEmAberto(r)! > 15 && diasEmAberto(r)! <= 30],
    ["31 a 60 dias", (r) => diasEmAberto(r)! > 30 && diasEmAberto(r)! <= 60],
    ["mais de 60 dias", (r) => diasEmAberto(r)! > 60],
  ];
  const agingVals: [string, number][] = buckets.map(([label, f]) => [
    label,
    abertasHoje.filter((r) => diasEmAberto(r) !== null && f(r)).length,
  ]);
  const semAging = abertasHoje.filter((r) => diasEmAberto(r) === null).length;
  if (semAging) agingVals.push(["sem data", semAging]);
  const agingMax = Math.max(1, ...agingVals.map((v) => v[1]));
  const agingBars = agingVals.map(([label, v], i) => ({
    label,
    total: nf(v),
    h: ((v / agingMax) * 100).toFixed(2) + "%",
    color: i < 2 ? INK : i === 2 ? MID : SOFT,
  }));

  const normBase = (s: string) => {
    const t = String(s || "").trim();
    if (/^operac/i.test(t)) return "Operacional";
    if (/^corporativ/i.test(t)) return "Adm/Corp";
    if (!t || /nao informado/i.test(t.normalize("NFD").replace(/[\u0300-\u036f]/g, "")))
      return "Base não informada";
    return t;
  };
  const baseBars = barList(
    agrupa(abertasHoje, (r) => normBase(r.b)),
    abertasHoje.length,
  );
  const modeloBars = barList(
    agrupa(abertasHoje, (r) =>
      !r.m || /^n[ãa]o informado$/i.test(r.m) ? "Modelo não informado" : r.m,
    ),
    abertasHoje.length,
  );

  const fechadasComSla = noEixo.filter(
    (r) => r.df && typeof r.sf === "number" && dentro(r.df.slice(0, 7)),
  );
  const oper = fechadasComSla.filter((r) => /oper/i.test(r.b || ""));
  const admin = fechadasComSla.filter((r) => /adm|corp/i.test(r.b || ""));
  const slaVals: [string, number][] = (
    [
      ["Mediana geral", mediana(fechadasComSla.map((r) => r.sf))],
      ["Média geral", media(fechadasComSla.map((r) => r.sf))],
      ["Operacional", media(oper.map((r) => r.sf))],
      ["Adm/Corporativo", media(admin.map((r) => r.sf))],
      ["Último mês", cur.sla],
    ] as [string, number | null][]
  ).filter((v): v is [string, number] => v[1] !== null);
  const slaMax = Math.max(1, ...slaVals.map((v) => v[1]), meta);
  const slaBars = slaVals.map(([label, v]) => ({
    label,
    total: fmt(Math.round(v * 10) / 10),
    w: ((v / slaMax) * 100).toFixed(2) + "%",
    color: v > meta ? MID : INK,
  }));
  const pior = fechadasComSla.slice().sort((a, b) => (b.sf as number) - (a.sf as number))[0];
  const slaNote = pior
    ? `Maior ciclo registrado: ${pior.a} com ${pior.sf} dias, em ${pior.u}.`
    : "";

  // ---- Varredura de qualidade do preenchimento -----------------------------
  // Sempre sobre a aba inteira (todas), salvo quando o campo só faz sentido para
  // as vagas em aberto. Os rótulos usam o nome atual da coluna na planilha.
  const stOrig = (r: Vaga) => r.stOrig ?? r.st;
  const fechadasTodas = todas.filter(fechada);
  const semDfReal = fechadasTodas.filter((r) => !r.df || r.dfEst);
  const ausentes = colunas ? CAMPOS.filter((c) => !colunas[c.campo]) : [];
  // Universo do "status desatualizado": o que a planilha diz estar em andamento
  // (qualquer status preenchido que não seja de encerramento ou pausa).
  const marcadasAbertas = todas.filter((r) => {
    const s = stOrig(r);
    return !!s && !/fechad|cancel|desist|stand|suspens/i.test(s);
  });
  const comContratado = todas.filter((r) => r.ct);

  const cons: [string, number, number, string][] = [];
  if (colunas)
    cons.push([
      "Colunas do painel não achadas na planilha",
      ausentes.length,
      CAMPOS.length,
      ausentes.length
        ? `faltam: ${ausentes.map((c) => c.rotulo).join(", ")} — cabeçalho renomeado?`
        : "todas as colunas usadas pelo painel foram encontradas",
    ]);
  cons.push(
    [
      nome("d"),
      todas.filter((r) => !r.d).length,
      todas.length,
      "sem ela a vaga não entra em mês nenhum e o aging não é calculado",
    ],
    [
      `${nome("df")} em vaga fechada`,
      semDfReal.length,
      fechadasTodas.length,
      fechadasEstimadas
        ? `${nf(fechadasEstimadas)} datadas pela ${nome("adm")} (fora do SLA); ${nf(fechadasSemData)} sem data nenhuma, fora dos meses`
        : "sem ela a vaga não entra no mês e pode cair fora do recorte",
    ],
    [
      `${nome("st")} desatualizado`,
      todas.filter((r) => r.ajuste === "fechada-pela-data").length,
      marcadasAbertas.length,
      "marcada Aberta mas com Data Fechamento — contada como fechada",
    ],
    [
      `${nome("st")} em branco`,
      todas.filter((r) => r.ajuste === "vazio-aberta" || r.ajuste === "vazio-fechada").length,
      todas.length,
      "contada como aberta, ou fechada se tiver Data Fechamento",
    ],
    [
      `${nome("ct")} em vaga fechada`,
      fechadasTodas.filter((r) => !r.ct).length,
      fechadasTodas.length,
      "não dá para saber quem ocupou a vaga",
    ],
    [
      `${nome("ct")} em vaga não fechada`,
      comContratado.filter((r) => !fechada(r)).length,
      comContratado.length,
      "tem contratado mas o status é aberta, pausada ou cancelada",
    ],
    [
      `${nome("df")} inconsistente`,
      todas.filter((r) => r.dfRuim).length,
      fechadasTodas.length,
      "anterior à abertura ou no futuro — tratada como sem data",
    ],
    [
      nome("m"),
      abertasHoje.filter((r) => r.m === "Não informado").length,
      abertasHoje.length,
      "impede ler CLT, temporário e PJ das vagas em aberto",
    ],
    [
      nome("b"),
      abertasHoje.filter((r) => r.b === "Não informado").length,
      abertasHoje.length,
      "separa operação de corporativo",
    ],
    [
      nome("pr"),
      abertasHoje.filter((r) => !r.pr || r.pr === "—" || r.pr === "-").length,
      abertasHoje.length,
      "define a fila de atendimento",
    ],
    [
      nome("et"),
      abertasHoje.filter((r) => !r.et).length,
      abertasHoje.length,
      "a lista de vagas em aberto não mostra em que fase a vaga está",
    ],
    [
      nome("o"),
      fechadasTodas.filter((r) => r.df && r.o === "Não informado").length,
      fechadasTodas.filter((r) => r.df).length,
      "mede eficiência dos canais",
    ],
  );
  const consRows = cons.map(([label, faltando, universo, impacto]) => ({
    label,
    faltando: `${nf(faltando)} de ${nf(universo)}`,
    universo: pct(faltando, universo),
    impacto,
    alert: faltando > 0,
  }));

  return {
    meses,
    selMes,
    prevMes,
    // Mostra a conta fechando com a planilha: total na aba, o que entrou no
    // recorte e o que ficou de fora. Antes dizia "abertas e fechadas em 2025",
    // o que a planilha não sustenta: essas vagas não têm data de fechamento.
    subtitle:
      `${nf(noEixo.length)} vagas no escopo 2026 de ${nf(allRows.length)} na aba Vagas 2026 · ${mesLongo(meses[0] || "")} a ${mesLongo(lastMes)}` +
      (foraEscopo ? ` · ${nf(foraEscopo)} abertas em 2025 fora do recorte` : ""),
    kpisAcum,
    kpisMes,
    kpisAtual,
    mesBars,
    backlogBars,
    mesTable,
    acumNote: fechadasSemData
      ? `${nf(fechadasSemData)} vagas fechadas sem data na planilha não entram na coluna de fechamentos`
      : "todas as vagas fechadas têm data de fechamento",
    // Campos que o painel procurou e não achou no cabeçalho. Vazio quando a base
    // veio do retrato embutido (não há cabeçalho para conferir).
    colunasAusentes: ausentes.map((c) => c.rotulo),
    totAb: nf(totAbN),
    totFe: nf(totFeN),
    totSaldo: nf(totAbN - totFeN),
    totTaxa: pct(totFeN, totAbN),
    totBacklog: nf(porMes.length ? porMes[porMes.length - 1]!.backlog.length : 0),
    totSla: slaGeral === null ? "—" : fmt(Math.round(slaGeral * 10) / 10, "d"),
    mesLabelLongo: mesLongo(selMes),
    mesShort: mesLabel(selMes),
    prevLabel: prevMes ? mesLongo(prevMes) : "nenhum mês anterior na base",
    prevShort: prevMes ? mesLabel(prevMes) : "—",
    compRows,
    fechRecrut,
    fechUnid,
    canais,
    mixRows,
    mixTotal: nf(feTotal),
    mixDonut,
    destinoBars,
    atualAbertas: nf(abertasHoje.length),
    areaBars,
    unidadeTiles,
    recrutadorTiles,
    listaAbertas,
    tipoRows,
    tipoDonut,
    agingBars,
    baseBars,
    modeloBars,
    slaBars,
    slaNote,
    consRows,
    baseResumo: nf(noEixo.length),
    rowsNoEscopo: rows,
  };
}

const COL_HEAD = [
  "Data abertura",
  "Data fechamento",
  "Fechamento estimado pela admissão",
  "Status (painel)",
  "Status (planilha)",
  "Recrutador",
  "Unidade",
  "Requisitante",
  "Area",
  "Vaga",
  "Senioridade",
  "Tipo",
  "Regime",
  "Base",
  "Origem",
  "Prioridade",
  "Dias em aberto",
  "SLA fechamento",
];

export function toCsv(rows: Vaga[]) {
  const hoje = hojeLocal();
  const esc = (v: unknown) =>
    '"' + String(v === null || v === undefined ? "" : v).replace(/"/g, '""') + '"';
  const linhas = noEscopo(rows).map((r) =>
    [
      r.d,
      r.df,
      r.dfEst ? "sim" : "",
      r.st,
      r.stOrig ?? r.st,
      r.r,
      r.u,
      r.g,
      r.a,
      r.v,
      r.sen,
      r.t,
      r.m,
      r.b,
      r.o,
      r.pr,
      r.d && aberta(r) ? Math.max(0, diasEntre(r.d, hoje)) : "",
      r.sf,
    ]
      .map(esc)
      .join(";"),
  );
  return [COL_HEAD.join(";")].concat(linhas).join("\n");
}

// ---------------------------------------------------------------------------
// Leitura do cabeçalho
//
// O painel acha cada coluna pelo nome. Em out/2026 a planilha teve cabeçalhos
// renomeados ("Data de Fechamento da vaga" virou "Data Fechamento", "SLA aberto"
// virou "SLA", "Modelo de contratação" virou "Regime"...) e o painel passou a
// mostrar zero fechamentos e aging vazio sem avisar ninguém.
//
// Por isso cada campo aceita uma lista de nomes — o atual primeiro, depois os
// antigos — e o resultado da busca volta junto com as linhas. Coluna não achada
// aparece na tela como alerta, em vez de virar número zerado.
// ---------------------------------------------------------------------------

export type Campo =
  | "d"
  | "u"
  | "st"
  | "v"
  | "r"
  | "g"
  | "a"
  | "pr"
  | "b"
  | "sen"
  | "t"
  | "m"
  | "df"
  | "adm"
  | "ct"
  | "o"
  | "et";

/** Cabeçalho encontrado na planilha para cada campo; null = não encontrado. */
export type Colunas = Partial<Record<Campo, string | null>>;

/** rotulo = nome atual na planilha; aliases = todos os nomes aceitos, em ordem. */
export const CAMPOS: { campo: Campo; rotulo: string; aliases: string[] }[] = [
  { campo: "d", rotulo: "Data Abertura", aliases: ["Data Abertura", "Data Início processo", "Data de abertura"] },
  { campo: "u", rotulo: "Unidade", aliases: ["Unidade"] },
  { campo: "st", rotulo: "Status do Processo", aliases: ["Status do Processo", "Status", "Situação", "Situação da vaga"] },
  { campo: "v", rotulo: "Vaga", aliases: ["Vaga", "Cargo"] },
  { campo: "r", rotulo: "Recrutador", aliases: ["Recrutador", "Recrutadora"] },
  { campo: "g", rotulo: "Requisitante (Gestor Direto)", aliases: ["Requisitante (Gestor Direto)", "Requisitante", "Gestor"] },
  { campo: "a", rotulo: "Área", aliases: ["Área", "Area", "Setor"] },
  { campo: "pr", rotulo: "Prioridade", aliases: ["Prioridade"] },
  { campo: "b", rotulo: "Base vagas", aliases: ["Base vagas", "Base"] },
  { campo: "sen", rotulo: "Jr, Pl, Sr", aliases: ["Jr, Pl, Sr", "Senioridade", "Nível"] },
  { campo: "t", rotulo: "Tipo de Vaga", aliases: ["Tipo de Vaga", "Tipo"] },
  { campo: "m", rotulo: "Regime", aliases: ["Regime", "Modelo de contratação", "Modelo"] },
  { campo: "df", rotulo: "Data Fechamento", aliases: ["Data Fechamento", "Data de Fechamento da vaga", "Data de Fechamento"] },
  { campo: "adm", rotulo: "Admissão", aliases: ["Admissão", "Data de admissão", "Data de início", "Data de inicio"] },
  { campo: "ct", rotulo: "Contratado", aliases: ["Contratado", "Nome candidato contratado", "Candidato contratado"] },
  { campo: "o", rotulo: "Origem", aliases: ["Origem", "Origem do candidato"] },
  { campo: "et", rotulo: "Etapa atual", aliases: ["Etapa atual", "Etapa"] },
];

/** Para a lista do modal de importação: os nomes atuais. */
export const COLUNAS_ESPERADAS = CAMPOS.map((c) => c.rotulo);

const OBRIGATORIOS: Campo[] = ["u", "st"];

export function parsePlanilha(
  raw: string,
):
  | { ok: true; rows: Vaga[]; ignoradas: number; colunas: Colunas }
  | { ok: false; msg: string } {
  const txt = (raw || "").replace(/\r/g, "").trim();
  if (!txt) return { ok: false, msg: "Cole os dados da aba Vagas 2026 antes de atualizar." };
  const lines = txt.split("\n");
  const sep = lines[0]!.indexOf("\t") > -1 ? "\t" : ";";
  const norm = (s: unknown) =>
    String(s)
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^a-z0-9]/g, "");

  // Cabeçalho = a primeira linha (entre as 10 primeiras) que tem pelo menos três
  // nomes de coluna conhecidos. Não depende de nenhuma coluna específica.
  const conhecidos = new Set(CAMPOS.flatMap((c) => c.aliases.map(norm)));
  let headIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const h = lines[i]!.split(sep).map(norm);
    if (h.filter((c) => conhecidos.has(c)).length >= 3) {
      headIdx = i;
      break;
    }
  }
  if (headIdx === -1)
    return {
      ok: false,
      msg: "Não encontrei a linha de cabeçalho. Copie a aba incluindo os títulos das colunas.",
    };

  const brutos = lines[headIdx]!.split(sep).map((h) => h.replace(/\s+/g, " ").trim());
  const head = brutos.map(norm);

  // Duas passadas: primeiro só nome idêntico, para todos os campos; depois, para
  // os que sobraram, nome que começa igual. Assim "SLA" nunca rouba "SLA
  // fechamento", e uma coluna nunca é usada por dois campos.
  const map = {} as Record<Campo, number>;
  const usadas = new Set<number>();
  for (const passada of ["exato", "prefixo"] as const) {
    for (const c of CAMPOS) {
      if (map[c.campo] !== undefined && map[c.campo] > -1) continue;
      map[c.campo] = -1;
      for (const alias of c.aliases.map(norm)) {
        const i = head.findIndex(
          (h, k) => !usadas.has(k) && (passada === "exato" ? h === alias : h.startsWith(alias)),
        );
        if (i > -1) {
          map[c.campo] = i;
          usadas.add(i);
          break;
        }
      }
    }
  }
  const colunas: Colunas = {};
  for (const c of CAMPOS) colunas[c.campo] = map[c.campo] > -1 ? brutos[map[c.campo]]! : null;

  const faltando = OBRIGATORIOS.filter((k) => map[k] === -1);
  if (faltando.length)
    return {
      ok: false,
      msg: `Não encontrei a(s) coluna(s) ${faltando
        .map((k) => `“${CAMPOS.find((c) => c.campo === k)!.rotulo}”`)
        .join(" e ")} no cabeçalho.`,
    };

  const cl = (v: unknown) =>
    v === undefined || v === null ? "" : String(v).replace(/\s+/g, " ").trim();
  const toIso = (v: unknown) => {
    const s = cl(v);
    if (!s || s === "-") return null;
    if (/^\d{5}(\.\d+)?$/.test(s))
      return new Date(Math.round((parseFloat(s) - 25569) * 86400000)).toISOString().slice(0, 10);
    const br = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
    if (br) {
      const y = br[3]!.length === 2 ? "20" + br[3] : br[3];
      return `${y}-${br[2]!.padStart(2, "0")}-${br[1]!.padStart(2, "0")}`;
    }
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return iso ? iso[0] : null;
  };
  const at = (c: string[], i: number) => (i > -1 ? cl(c[i]) : "");
  const cabecalhoStatus = head[map.st]!;
  const hoje = hojeLocal();

  const rows: Vaga[] = [];
  let id = 0;
  let ignoradas = 0;
  for (let i = headIdx + 1; i < lines.length; i++) {
    if (!lines[i]!.trim()) continue;
    const c = lines[i]!.split(sep);
    const unidade = at(c, map.u);
    const vaga = at(c, map.v);
    const stOrig = at(c, map.st);
    if (!unidade && !vaga) {
      ignoradas++;
      continue;
    }
    if (norm(stOrig) === cabecalhoStatus) continue; // cabeçalho repetido no meio da aba

    const d = toIso(c[map.d]);
    let dfReal = toIso(c[map.df]);
    const adm = toIso(c[map.adm]);
    let dfRuim = false;
    if (dfReal && ((d && dfReal < d) || dfReal > hoje)) {
      dfReal = null;
      dfRuim = true;
    }

    // Situação efetiva: o status da planilha, corrigido pelas datas.
    //  - Data Fechamento preenchida em vaga que não está fechada, cancelada nem
    //    pausada → fechada (o status ficou para trás).
    //  - Status em branco sem data → aberta (linha nova costuma entrar assim).
    const encerradaOrig = /fechad|cancel|desist/i.test(stOrig);
    const pausadaOrig = /stand|suspens/i.test(stOrig);
    let st = stOrig;
    let ajuste: Vaga["ajuste"];
    if (!encerradaOrig && !pausadaOrig && dfReal) {
      st = "Fechada";
      ajuste = stOrig ? "fechada-pela-data" : "vazio-fechada";
    } else if (!stOrig) {
      st = "Aberta";
      ajuste = "vazio-aberta";
    }
    const ehFechada = /fechad/i.test(st);

    // Fechada sem Data Fechamento mas com Admissão já ocorrida: usa a admissão
    // para pôr a vaga no mês. Fica fora do SLA (ver sf abaixo).
    let df = dfReal;
    let dfEst = false;
    if (!df && ehFechada && adm && (!d || adm >= d) && adm <= hoje) {
      df = adm;
      dfEst = true;
    }

    rows.push({
      id: ++id,
      d,
      df,
      st,
      stOrig,
      ajuste,
      dfEst: dfEst || undefined,
      dfRuim: dfRuim || undefined,
      ct: !!at(c, map.ct) || undefined,
      et: at(c, map.et) || undefined,
      r: at(c, map.r) || "—",
      u: unidade || "—",
      g: at(c, map.g) || "—",
      a: at(c, map.a) || "—",
      v: vaga || "—",
      sen: at(c, map.sen),
      t: at(c, map.t) || "—",
      m: at(c, map.m) || "Não informado",
      b: at(c, map.b) || "Não informado",
      o: at(c, map.o) || "Não informado",
      pr: at(c, map.pr) || "—",
      // Aging calculado, não lido da planilha (a coluna "SLA" é fórmula e quase
      // sempre vem vazia). O painel recalcula na hora de exibir; este valor só
      // serve para a exportação.
      sa: d && !encerradaOrig && !pausadaOrig && !ehFechada ? Math.max(0, diasEntre(d, hoje)) : null,
      // SLA só com Data Fechamento de verdade: a admissão vem depois do aceite e
      // inflaria o prazo de quem foi datado por ela.
      sf: d && dfReal && ehFechada ? diasEntre(d, dfReal) : null,
    });
  }
  if (!rows.length)
    return { ok: false, msg: "Nenhuma linha de vaga foi reconhecida no trecho colado." };
  return { ok: true, rows, ignoradas, colunas };
}
