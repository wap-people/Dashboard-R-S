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
};

export const META_SLA = 25;

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

const aberta = (r: Vaga) => /abert/i.test(r.st || "");
const fechada = (r: Vaga) => /fechad/i.test(r.st || "");
const encerrada = (r: Vaga) => /fechad|cancel|desist/i.test(r.st || "");

const media = (v: (number | null)[]) => {
  const x = v.filter((n): n is number => typeof n === "number" && !isNaN(n));
  return x.length ? x.reduce((a, b) => a + b, 0) / x.length : null;
};
const mediana = (v: (number | null)[]) => {
  const x = v.filter((n): n is number => typeof n === "number" && !isNaN(n)).sort((a, b) => a - b);
  if (!x.length) return null;
  return x.length % 2 ? x[(x.length - 1) / 2]! : (x[x.length / 2 - 1]! + x[x.length / 2]!) / 2;
};

const group = (rows: Vaga[], key: keyof Vaga): [string, Vaga[]][] => {
  const m = new Map<string, Vaga[]>();
  rows.forEach((r) => {
    const k = (r[key] as string) || "—";
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(r);
  });
  return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
};
const agrupa = (list: Vaga[], fn: (r: Vaga) => string): [string, number][] => {
  const m = new Map<string, number>();
  list.forEach((r) => {
    const k = fn(r);
    m.set(k, (m.get(k) || 0) + 1);
  });
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
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
  const hoje = new Date().toISOString().slice(0, 10);
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

export function buildAnalytics(allRows: Vaga[], selMesIn: string, meta = META_SLA) {
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
    const fe = rows.filter((r) => r.df && r.df.slice(0, 7) === m);
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
  const abertasHoje = noEixo.filter(aberta);
  const standBy = noEixo.filter((r) => /stand|suspens/i.test(r.st || "")).length;
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
      hint: `${fechadasSemData} fechadas sem data na planilha`,
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

  const agingMedio = media(abertasHoje.map((r) => r.sa));
  const foraMeta = abertasHoje.filter((r) => typeof r.sa === "number" && r.sa > meta).length;
  const prioA = abertasHoje.filter((r) => r.pr === "A").length;
  const kpisAtual = [
    {
      label: "Vagas abertas hoje",
      value: nf(abertasHoje.length),
      unit: "vagas",
      hint: "status Aberta na base",
      alert: false,
    },
    {
      label: "Aging médio",
      value: agingMedio === null ? "—" : Math.round(agingMedio) + "d",
      unit: "",
      hint: "dias corridos em aberto",
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
    total: nf(list.length),
    pct: pct(list.length, abertasHoje.length),
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
    ["0 a 15 dias", (r) => (r.sa as number) <= 15],
    ["16 a 30 dias", (r) => (r.sa as number) > 15 && (r.sa as number) <= 30],
    ["31 a 60 dias", (r) => (r.sa as number) > 30 && (r.sa as number) <= 60],
    ["mais de 60 dias", (r) => (r.sa as number) > 60],
  ];
  const agingVals: [string, number][] = buckets.map(([label, f]) => [
    label,
    abertasHoje.filter((r) => typeof r.sa === "number" && f(r)).length,
  ]);
  const semAging = abertasHoje.filter((r) => typeof r.sa !== "number").length;
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

  const cons: [string, number, number, string][] = [
    [
      "Data de fechamento",
      todas.filter((r) => fechada(r) && !r.df).length,
      todas.filter(fechada).length,
      "sem ela a vaga não entra no mês e pode cair fora do recorte",
    ],
    [
      "Modelo de contratação",
      abertasHoje.filter((r) => r.m === "Não informado").length,
      abertasHoje.length,
      "impede ler CLT, temporário e PJ das vagas em aberto",
    ],
    [
      "Base da vaga",
      abertasHoje.filter((r) => r.b === "Não informado").length,
      abertasHoje.length,
      "separa operação de corporativo",
    ],
    [
      "Prioridade",
      abertasHoje.filter((r) => !r.pr || r.pr === "—" || r.pr === "-").length,
      abertasHoje.length,
      "define a fila de atendimento",
    ],
    [
      "Origem do candidato",
      todas.filter((r) => r.df && r.o === "Não informado").length,
      todas.filter((r) => r.df).length,
      "mede eficiência dos canais",
    ],
    [
      "Data de fechamento inconsistente",
      todas.filter((r) => r.dfRuim).length,
      todas.filter(fechada).length,
      "anterior à abertura ou no futuro — tratada como sem data",
    ],
  ];
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
      ? `${fechadasSemData} vagas fechadas sem data na planilha não entram na coluna de fechamentos`
      : "todas as vagas fechadas têm data de fechamento",
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
  "Status",
  "Recrutador",
  "Unidade",
  "Requisitante",
  "Area",
  "Vaga",
  "Senioridade",
  "Tipo",
  "Modelo",
  "Base",
  "Origem",
  "Prioridade",
  "Dias em aberto",
  "SLA fechamento",
];
const COL_KEYS: (keyof Vaga)[] = [
  "d",
  "df",
  "st",
  "r",
  "u",
  "g",
  "a",
  "v",
  "sen",
  "t",
  "m",
  "b",
  "o",
  "pr",
  "sa",
  "sf",
];

export function toCsv(rows: Vaga[]) {
  const esc = (v: unknown) =>
    '"' + String(v === null || v === undefined ? "" : v).replace(/"/g, '""') + '"';
  return [COL_HEAD.join(";")]
    .concat(noEscopo(rows).map((r) => COL_KEYS.map((k) => esc(r[k])).join(";")))
    .join("\n");
}

export const COLUNAS_ESPERADAS = [
  "Data Início processo",
  "Recrutador",
  "Unidade",
  "Requisitante",
  "Área",
  "Prioridade",
  "Vaga",
  "Tipo de Vaga",
  "Status do Processo",
  "Modelo de contratação",
  "Data de Fechamento da vaga",
  "Origem do candidato",
  "Base vagas",
  "SLA aberto",
];

export function parsePlanilha(
  raw: string,
): { ok: true; rows: Vaga[]; ignoradas: number } | { ok: false; msg: string } {
  const txt = (raw || "").replace(/\r/g, "").trim();
  if (!txt) return { ok: false, msg: "Cole os dados da aba Vagas 2026 antes de atualizar." };
  const lines = txt.split("\n");
  const sep = lines[0]!.indexOf("\t") > -1 ? "\t" : ";";
  const norm = (s: unknown) =>
    String(s)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
  let headIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const h = lines[i]!.split(sep).map(norm);
    if (
      h.some((c) => c.indexOf("datainicioprocesso") > -1 || c === "unidade") &&
      h.some((c) => c.indexOf("statusdoprocesso") > -1 || c === "vaga")
    ) {
      headIdx = i;
      break;
    }
  }
  if (headIdx === -1)
    return {
      ok: false,
      msg: "Não encontrei a linha de cabeçalho. Copie a aba incluindo os títulos das colunas.",
    };
  const head = lines[headIdx]!.split(sep).map(norm);
  const col = (names: string[]) => {
    for (const nm of names) {
      const i = head.findIndex((c) => c === norm(nm) || c.indexOf(norm(nm)) === 0);
      if (i > -1) return i;
    }
    return -1;
  };
  const map = {
    d: col(["Data Início processo", "Data abertura"]),
    r: col(["Recrutador"]),
    u: col(["Unidade"]),
    g: col(["Requisitante (Gestor Direto)", "Requisitante", "Gestor"]),
    a: col(["Área", "Area"]),
    pr: col(["Prioridade"]),
    v: col(["Vaga"]),
    sen: col(["Senioridade"]),
    t: col(["Tipo de Vaga"]),
    st: col(["Status do Processo", "Status"]),
    sa: col(["SLA aberto (dias corridos)", "Dias em aberto", "SLA aberto"]),
    m: col(["Modelo de contratação", "Modelo"]),
    df: col(["Data de Fechamento da vaga", "Data de Fechamento"]),
    di: col(["Data de início", "Data de inicio"]),
    o: col(["Origem do candidato", "Origem"]),
    b: col(["Base vagas", "Base"]),
  };
  if (map.u === -1 || map.st === -1)
    return { ok: false, msg: "Faltam as colunas Unidade e Status do Processo no trecho colado." };
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
  const rows: Vaga[] = [];
  let id = 0;
  let ignoradas = 0;
  for (let i = headIdx + 1; i < lines.length; i++) {
    if (!lines[i]!.trim()) continue;
    const c = lines[i]!.split(sep);
    const unidade = at(c, map.u);
    const vaga = at(c, map.v);
    const status = at(c, map.st);
    if (!unidade && !vaga) {
      ignoradas++;
      continue;
    }
    if (norm(status) === "statusdoprocesso") continue;
    const d = toIso(c[map.d]);
    const df = toIso(c[map.df]) || toIso(c[map.di]);
    const sa = parseFloat(String(at(c, map.sa)).replace(",", "."));
    rows.push({
      id: ++id,
      d,
      df,
      st: status || "—",
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
      sa: isNaN(sa) ? null : Math.round(sa),
      sf: d && df ? Math.round((+new Date(df) - +new Date(d)) / 86400000) : null,
    });
  }
  if (!rows.length)
    return { ok: false, msg: "Nenhuma linha de vaga foi reconhecida no trecho colado." };
  return { ok: true, rows, ignoradas };
}
