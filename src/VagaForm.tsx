import { useEffect, useMemo, useState } from "react";

import {
  CAMPOS_EDITAVEIS,
  type CampoEditavel,
  type Categoria,
  dataHoraBR,
  type Dominio,
  hoje,
  type Perfil,
  type PerfilDb,
  ROTULO,
  type VagaDb,
} from "@/lib/dados";
import { mensagemErro, supabase } from "@/lib/supabase";
import { Aviso, Botao, inputCls, Modal, Rotulo } from "@/ui";

type Form = Record<CampoEditavel, string>;

type Evento = {
  id: number;
  em: string;
  acao: string;
  usuario_email: string | null;
  campos: string[] | null;
  antes: Record<string, unknown> | null;
  depois: Record<string, unknown> | null;
  tabela: string;
};

const vazio = (): Form =>
  Object.fromEntries(CAMPOS_EDITAVEIS.map((c) => [c, ""])) as Form;

const paraForm = (v: VagaDb | null, perfil: Perfil): Form => {
  if (!v) {
    const f = vazio();
    f.status = "Aberta";
    f.etapa = "Alinhamento";
    f.quantidade = "1";
    f.data_abertura = hoje();
    f.recrutador = perfil.nome_recrutador || "";
    return f;
  }
  const f = vazio();
  for (const c of CAMPOS_EDITAVEIS) {
    const val = (v as unknown as Record<string, unknown>)[c];
    f[c] = val === null || val === undefined ? "" : String(val);
  }
  return f;
};

const fmtValor = (v: unknown) => {
  if (v === null || v === undefined || v === "") return "(vazio)";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [a, m, d] = v.split("-");
    return `${d}/${m}/${a}`;
  }
  return String(v);
};

export default function VagaForm({
  vaga,
  perfil,
  dominios,
  perfis,
  onFechar,
  onSalvo,
}: {
  vaga: VagaDb | null;
  perfil: Perfil;
  dominios: Dominio[];
  perfis: PerfilDb[];
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const admin = perfil.papel === "admin";
  const [form, setForm] = useState<Form>(() => paraForm(vaga, perfil));
  const [salario, setSalario] = useState("");
  const [salarioOrig, setSalarioOrig] = useState("");
  const [aba, setAba] = useState<"dados" | "historico">("dados");
  const [erro, setErro] = useState("");
  const [conflito, setConflito] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [historico, setHistorico] = useState<Evento[] | null>(null);
  const [motivo, setMotivo] = useState("");
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);

  const original = useMemo(() => paraForm(vaga, perfil), [vaga, perfil]);
  const alterado = CAMPOS_EDITAVEIS.some((c) => form[c] !== original[c]) || salario !== salarioOrig;

  useEffect(() => {
    if (!vaga || !admin) return;
    void supabase
      .from("vagas_salario")
      .select("salario")
      .eq("vaga_id", vaga.id)
      .maybeSingle()
      .then(({ data }) => {
        const s =
          data?.salario === null || data?.salario === undefined
            ? ""
            : Number(data.salario).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        setSalario(s);
        setSalarioOrig(s);
      });
  }, [vaga, admin]);

  useEffect(() => {
    if (aba !== "historico" || !vaga) return;
    const filtro = admin
      ? `and(tabela.eq.vagas,registro_id.eq.${vaga.id}),and(tabela.eq.vagas_salario,registro_id.eq.${vaga.id})`
      : `and(tabela.eq.vagas,registro_id.eq.${vaga.id})`;
    void supabase
      .from("auditoria")
      .select("id,em,acao,usuario_email,campos,antes,depois,tabela")
      .or(filtro)
      .order("em", { ascending: false })
      .limit(200)
      .then(({ data, error }) => {
        if (error) setErro(mensagemErro(error));
        setHistorico((data ?? []) as Evento[]);
      });
  }, [aba, vaga, admin]);

  const opcoes = (cat: Categoria, atual: string) => {
    const lista = dominios.filter((d) => d.categoria === cat && d.ativo).map((d) => d.valor);
    if (atual && !lista.includes(atual)) lista.push(atual);
    return lista;
  };

  const recrutadores = useMemo(() => {
    const nomes = perfis.filter((p) => p.ativo && p.nome_recrutador).map((p) => p.nome_recrutador as string);
    if (form.recrutador && !nomes.includes(form.recrutador)) nomes.push(form.recrutador);
    return nomes.sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [perfis, form.recrutador]);

  const set = (c: CampoEditavel, v: string) => {
    setForm((f) => {
      const n = { ...f, [c]: v };
      // Ajuda: fechar a vaga já sugere a data de hoje.
      if (c === "status" && v === "Fechada" && !f.data_fechamento) n.data_fechamento = hoje();
      if (c === "status" && (v === "Aberta" || v === "Stand By")) n.data_fechamento = "";
      return n;
    });
  };

  const montarPayload = () => {
    const p: Record<string, unknown> = {};
    for (const c of CAMPOS_EDITAVEIS) {
      if (vaga && form[c] === original[c]) continue;
      const v = form[c].trim();
      p[c] = c === "quantidade" ? (v ? Number(v) : 1) : v === "" ? null : v;
    }
    if (p.tipo_vaga !== undefined && p.tipo_vaga !== "Substituição" && form.substituido) p.substituido = null;
    return p;
  };

  const salvar = async () => {
    setErro("");
    setConflito(false);
    if (!form.cargo.trim()) return setErro("Informe o cargo.");
    if (!form.unidade) return setErro("Escolha a unidade.");
    setSalvando(true);
    try {
      const payload = montarPayload();
      let id = vaga?.id;
      if (!vaga) {
        const { data, error } = await supabase.from("vagas").insert(payload).select("id").single();
        if (error) throw error;
        id = data.id as number;
      } else if (Object.keys(payload).length) {
        const { data, error } = await supabase
          .from("vagas")
          .update(payload)
          .eq("id", vaga.id)
          .eq("versao", vaga.versao)
          .select("id");
        if (error) throw error;
        if (!data || data.length === 0) {
          setConflito(true);
          setSalvando(false);
          return;
        }
      }
      if (admin && id && salario !== salarioOrig) {
        const num = salario.trim() === "" ? null : Number(salario.replace(/\./g, "").replace(",", "."));
        if (num !== null && isNaN(num)) throw new Error("Salário inválido. Use apenas números, por exemplo 3500,00.");
        const { error } = await supabase.from("vagas_salario").upsert({ vaga_id: id, salario: num });
        if (error) throw error;
      }
      onSalvo();
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (restaurar: boolean) => {
    if (!vaga) return;
    setErro("");
    if (!restaurar && motivo.trim().length < 5) return setErro("Descreva o motivo da exclusão (mínimo 5 caracteres).");
    setSalvando(true);
    const { data, error } = await supabase
      .from("vagas")
      .update(
        restaurar
          ? { excluida_em: null, motivo_exclusao: null }
          : { excluida_em: new Date().toISOString(), motivo_exclusao: motivo.trim() },
      )
      .eq("id", vaga.id)
      .eq("versao", vaga.versao)
      .select("id");
    setSalvando(false);
    if (error) return setErro(mensagemErro(error));
    if (!data?.length) return setConflito(true);
    onSalvo();
  };

  const campoTexto = (c: CampoEditavel, extra?: { obrigatorio?: boolean; tipo?: string; max?: number }) => (
    <Rotulo texto={ROTULO[c] ?? c} obrigatorio={extra?.obrigatorio}>
      <input
        className={inputCls}
        type={extra?.tipo ?? "text"}
        maxLength={extra?.max ?? 200}
        value={form[c]}
        min={extra?.tipo === "number" ? 1 : undefined}
        max={extra?.tipo === "date" && c === "data_fechamento" ? hoje() : undefined}
        onChange={(e) => set(c, e.target.value)}
      />
    </Rotulo>
  );

  const campoLista = (c: CampoEditavel, cat: Categoria, obrigatorio?: boolean) => (
    <Rotulo texto={ROTULO[c] ?? c} obrigatorio={obrigatorio}>
      <select className={inputCls} value={form[c]} onChange={(e) => set(c, e.target.value)}>
        <option value="">{obrigatorio ? "Selecione" : "(não informado)"}</option>
        {opcoes(cat, form[c]).map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </Rotulo>
  );

  const excluida = !!vaga?.excluida_em;

  return (
    <Modal
      titulo={vaga ? `Vaga nº ${vaga.id} · ${vaga.cargo}` : "Nova vaga"}
      subtitulo={
        vaga
          ? `Última alteração em ${dataHoraBR(vaga.atualizado_em)} · versão ${vaga.versao}${
              vaga.linha_planilha ? ` · linha ${vaga.linha_planilha} da planilha antiga` : ""
            }`
          : "Campos com * são obrigatórios"
      }
      onFechar={() => {
        if (!alterado || window.confirm("Descartar as alterações não salvas?")) onFechar();
      }}
      rodape={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {admin && vaga && !excluida && !confirmarExclusao && (
              <Botao tipo="perigo" onClick={() => setConfirmarExclusao(true)}>
                Excluir vaga
              </Botao>
            )}
            {admin && vaga && excluida && (
              <Botao tipo="secundario" disabled={salvando} onClick={() => void excluir(true)}>
                Restaurar vaga
              </Botao>
            )}
            {confirmarExclusao && (
              <>
                <input
                  className={`${inputCls} w-[260px]`}
                  placeholder="Motivo da exclusão"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  maxLength={300}
                />
                <Botao tipo="perigo" disabled={salvando} onClick={() => void excluir(false)}>
                  Confirmar exclusão
                </Botao>
                <Botao tipo="link" onClick={() => setConfirmarExclusao(false)}>
                  Cancelar
                </Botao>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Botao onClick={onFechar}>Fechar</Botao>
            {!excluida && (
              <Botao tipo="primario" disabled={salvando || (!!vaga && !alterado)} onClick={() => void salvar()}>
                {salvando ? "Salvando..." : vaga ? "Salvar alterações" : "Cadastrar vaga"}
              </Botao>
            )}
          </div>
        </div>
      }
    >
      {vaga && (
        <div className="mb-4 flex gap-[2px] self-start rounded-full bg-secondary p-[3px]" style={{ width: "fit-content" }}>
          {(["dados", "historico"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setAba(k)}
              className={`rounded-full px-4 py-[6px] text-[12px] font-semibold ${
                aba === k ? "bg-card shadow-[0_1px_3px_rgba(20,20,15,.14)]" : "text-muted-foreground"
              }`}
            >
              {k === "dados" ? "Dados da vaga" : "Histórico de alterações"}
            </button>
          ))}
        </div>
      )}

      {erro && (
        <div className="mb-4">
          <Aviso>{erro}</Aviso>
        </div>
      )}
      {conflito && (
        <div className="mb-4">
          <Aviso>
            Outra pessoa alterou esta vaga enquanto você editava, então nada foi gravado para não sobrescrever o
            trabalho dela. Feche, abra a vaga de novo e refaça a alteração.
          </Aviso>
        </div>
      )}
      {excluida && (
        <div className="mb-4">
          <Aviso tipo="info">
            Vaga excluída em {dataHoraBR(vaga?.excluida_em)}. Motivo: {vaga?.motivo_exclusao}. Ela não aparece no
            painel nem para os recrutadores.
          </Aviso>
        </div>
      )}

      {aba === "dados" ? (
        <fieldset disabled={excluida} className="flex flex-col gap-5">
          <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="md:col-span-2">{campoTexto("cargo", { obrigatorio: true })}</div>
            {campoTexto("area")}
            {campoLista("unidade", "unidade", true)}
            {campoTexto("requisitante")}
            <Rotulo texto="Recrutador">
              <select className={inputCls} value={form.recrutador} onChange={(e) => set("recrutador", e.target.value)}>
                <option value="">(não informado)</option>
                {recrutadores.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </Rotulo>
            {campoLista("tipo_vaga", "tipo_vaga")}
            {form.tipo_vaga === "Substituição" ? (
              campoTexto("substituido", { obrigatorio: true })
            ) : (
              <div className="hidden md:block" />
            )}
            {campoTexto("quantidade", { tipo: "number" })}
            {campoLista("regime", "regime")}
            {campoLista("base", "base")}
            {campoLista("turno", "turno")}
            {campoLista("prioridade", "prioridade")}
            {campoLista("publicacao", "publicacao")}
            {campoTexto("cod_pandape", { max: 40 })}
          </section>

          <section className="grid grid-cols-1 gap-4 border-t border-border pt-5 md:grid-cols-3">
            {campoLista("status", "status", true)}
            {campoLista("etapa", "etapa")}
            {campoLista("origem", "origem")}
            {campoTexto("data_abertura", { tipo: "date" })}
            {campoTexto("data_fechamento", { tipo: "date" })}
            {campoTexto("data_admissao", { tipo: "date" })}
            <div className="md:col-span-2">{campoTexto("contratado")}</div>
            {admin ? (
              <Rotulo texto="Salário (visível só para admin)">
                <input
                  className={inputCls}
                  inputMode="decimal"
                  placeholder="0,00"
                  value={salario}
                  onChange={(e) => setSalario(e.target.value.replace(/[^\d.,]/g, ""))}
                />
              </Rotulo>
            ) : (
              <div />
            )}
          </section>

          <section className="border-t border-border pt-5">
            <Rotulo texto="Observações e andamento">
              <textarea
                className={`${inputCls} min-h-[110px] resize-y leading-[1.5]`}
                maxLength={8000}
                value={form.observacoes}
                onChange={(e) => set("observacoes", e.target.value)}
              />
            </Rotulo>
          </section>
        </fieldset>
      ) : (
        <div className="flex flex-col gap-3">
          {historico === null ? (
            <span className="text-[12.5px] text-muted-foreground">Carregando histórico...</span>
          ) : historico.length === 0 ? (
            <Aviso tipo="info">
              Nenhuma alteração registrada desde a migração. Vagas vindas da planilha antiga não têm histórico
              anterior a ela.
            </Aviso>
          ) : (
            historico.map((h) => (
              <div key={h.id} className="rounded-sm border border-border p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-[12px] font-semibold">
                  <span>
                    {h.acao === "INSERT" ? "Cadastro" : h.acao === "UPDATE" ? "Alteração" : h.acao}
                    {h.tabela === "vagas_salario" ? " de salário" : ""}
                  </span>
                  <span className="text-subtle">
                    {dataHoraBR(h.em)} · {h.usuario_email || "sistema"}
                  </span>
                </div>
                {h.acao === "UPDATE" && h.campos && (
                  <ul className="mt-2 flex flex-col gap-1 text-[12px]">
                    {h.campos.map((c) => (
                      <li key={c}>
                        <strong>{ROTULO[c] ?? c}:</strong>{" "}
                        <span className="text-muted-foreground line-through">{fmtValor(h.antes?.[c])}</span>{" "}
                        → {fmtValor(h.depois?.[c])}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </Modal>
  );
}
