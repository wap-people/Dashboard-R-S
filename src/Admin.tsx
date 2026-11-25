import { useEffect, useState } from "react";

import {
  CATEGORIAS,
  type Categoria,
  dataHoraBR,
  type Dominio,
  type Papel,
  type PerfilDb,
  ROTULO,
} from "@/lib/dados";
import { SkLinhas } from "@/efeitos";
import { DOMINIO_EMAIL, mensagemErro, supabase } from "@/lib/supabase";
import { Aviso, Botao, inputCls, Pilula, Rotulo } from "@/ui";

function Pagina({ titulo, sub, children }: { titulo: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[1280px] px-[14px] pt-4 pb-14 md:px-8">
      <div className="flex flex-col gap-1 pb-4">
        <h1 className="text-[26px] leading-none font-black tracking-[-0.03em]">{titulo}</h1>
        <span className="text-[12.5px] font-medium text-muted-foreground">{sub}</span>
      </div>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* USUÁRIOS                                                            */
/* ------------------------------------------------------------------ */
export function Usuarios({ perfis, onRecarregar }: { perfis: PerfilDb[]; onRecarregar: () => void }) {
  const [novo, setNovo] = useState({ nome: "", email: "", papel: "recrutador" as Papel, nome_recrutador: "" });
  const [msg, setMsg] = useState<{ tipo: "erro" | "ok"; t: string } | null>(null);
  const [salvando, setSalvando] = useState(false);

  const incluir = async () => {
    setMsg(null);
    const email = novo.email.trim().toLowerCase();
    if (novo.nome.trim().length < 3) return setMsg({ tipo: "erro", t: "Informe o nome completo." });
    if (!email.endsWith("@" + DOMINIO_EMAIL)) return setMsg({ tipo: "erro", t: `Use um e-mail @${DOMINIO_EMAIL}.` });
    setSalvando(true);
    const { error } = await supabase.from("perfis").insert({
      nome: novo.nome.trim(),
      email,
      papel: novo.papel,
      nome_recrutador: novo.nome_recrutador.trim() || null,
    });
    setSalvando(false);
    if (error) return setMsg({ tipo: "erro", t: mensagemErro(error) });
    setNovo({ nome: "", email: "", papel: "recrutador", nome_recrutador: "" });
    setMsg({ tipo: "ok", t: `${email} cadastrado. A pessoa já pode entrar.` });
    onRecarregar();
  };

  const alterar = async (p: PerfilDb, mudanca: Partial<PerfilDb>) => {
    setMsg(null);
    if (mudanca.ativo === false && !window.confirm(`Bloquear o acesso de ${p.nome}? A pessoa perde o acesso na hora.`))
      return;
    const { error } = await supabase.from("perfis").update(mudanca).eq("id", p.id);
    if (error) return setMsg({ tipo: "erro", t: mensagemErro(error) });
    onRecarregar();
  };

  const cols = "minmax(0,1.3fr) minmax(0,1.6fr) 130px minmax(0,1fr) 150px 110px";

  return (
    <Pagina
      titulo="Usuários"
      sub="Quem pode entrar na plataforma. Bloquear corta o acesso na hora; o histórico da pessoa é mantido."
    >
      {msg && (
        <div className="mb-3">
          <Aviso tipo={msg.tipo}>{msg.t}</Aviso>
        </div>
      )}
      <section className="glass glass-strong entrar overflow-hidden">
        <div className="overflow-x-auto">
          <div className="min-w-[900px]">
            <div
              className="grid border-b border-border bg-surface-alt text-[10.5px] font-bold tracking-[.07em] text-muted-foreground uppercase"
              style={{ gridTemplateColumns: cols }}
            >
              {["Nome", "E-mail", "Papel", "Nome nas vagas", "Último acesso", "Situação"].map((h) => (
                <span key={h} className="px-3 py-[10px]">
                  {h}
                </span>
              ))}
            </div>
            {perfis.map((p) => (
              <div
                key={p.id}
                className={`grid items-center border-b border-hairline text-[12.5px] font-medium ${p.ativo ? "" : "opacity-55"}`}
                style={{ gridTemplateColumns: cols }}
              >
                <span className="truncate px-3 py-[8px] font-semibold">{p.nome}</span>
                <span className="truncate px-3 py-[8px] text-muted-foreground">{p.email}</span>
                <span className="px-3 py-[6px]">
                  <select
                    className={`${inputCls} py-[5px]`}
                    value={p.papel}
                    onChange={(e) => void alterar(p, { papel: e.target.value as Papel })}
                  >
                    <option value="admin">Admin</option>
                    <option value="recrutador">Recrutador</option>
                  </select>
                </span>
                <span className="px-3 py-[6px]">
                  <input
                    className={`${inputCls} py-[5px]`}
                    defaultValue={p.nome_recrutador ?? ""}
                    onBlur={(e) => {
                      const v = e.target.value.trim() || null;
                      if (v !== p.nome_recrutador) void alterar(p, { nome_recrutador: v });
                    }}
                  />
                </span>
                <span className="px-3 py-[8px] text-subtle">
                  {p.ultimo_acesso ? dataHoraBR(p.ultimo_acesso) : p.user_id ? "nunca" : "ainda não entrou"}
                </span>
                <span className="px-3 py-[6px]">
                  <Botao tipo={p.ativo ? "link" : "secundario"} onClick={() => void alterar(p, { ativo: !p.ativo })}>
                    {p.ativo ? "Bloquear" : "Reativar"}
                  </Botao>
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="glass glass-strong entrar mt-5 p-5" style={{ animationDelay: "70ms" }}>
        <h2 className="mb-4 text-[15px] font-bold tracking-[-0.02em]">Cadastrar novo usuário</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1.2fr_1.4fr_.8fr_1fr_auto] md:items-end">
          <Rotulo texto="Nome" obrigatorio>
            <input className={inputCls} value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />
          </Rotulo>
          <Rotulo texto="E-mail corporativo" obrigatorio>
            <input
              className={inputCls}
              type="email"
              placeholder={`nome@${DOMINIO_EMAIL}`}
              value={novo.email}
              onChange={(e) => setNovo({ ...novo, email: e.target.value })}
            />
          </Rotulo>
          <Rotulo texto="Papel" obrigatorio>
            <select
              className={inputCls}
              value={novo.papel}
              onChange={(e) => setNovo({ ...novo, papel: e.target.value as Papel })}
            >
              <option value="recrutador">Recrutador</option>
              <option value="admin">Admin</option>
            </select>
          </Rotulo>
          <Rotulo texto="Nome nas vagas">
            <input
              className={inputCls}
              placeholder="ex.: Fernanda"
              value={novo.nome_recrutador}
              onChange={(e) => setNovo({ ...novo, nome_recrutador: e.target.value })}
            />
          </Rotulo>
          <Botao tipo="primario" carregando={salvando} onClick={() => void incluir()}>
            Cadastrar
          </Botao>
        </div>
        <p className="mt-3 text-[11.5px] leading-[1.5] font-medium text-subtle">
          Admin: vê e edita tudo, inclusive salário, usuários, listas e auditoria. Recrutador: cadastra e atualiza
          vagas, sem acesso a salário. "Nome nas vagas" é como a pessoa aparece na coluna Recrutador.
        </p>
      </section>
    </Pagina>
  );
}

/* ------------------------------------------------------------------ */
/* LISTAS (domínios)                                                   */
/* ------------------------------------------------------------------ */
export function Listas({ dominios, onRecarregar }: { dominios: Dominio[]; onRecarregar: () => void }) {
  const [novo, setNovo] = useState<Record<string, string>>({});
  const [erro, setErro] = useState("");

  const incluir = async (cat: Categoria) => {
    setErro("");
    const valor = (novo[cat] || "").trim();
    if (!valor) return;
    const ordem = Math.max(0, ...dominios.filter((d) => d.categoria === cat).map((d) => d.ordem)) + 1;
    const { error } = await supabase.from("dominios").insert({ categoria: cat, valor, ordem });
    if (error) return setErro(mensagemErro(error));
    setNovo({ ...novo, [cat]: "" });
    onRecarregar();
  };

  const alternar = async (d: Dominio) => {
    setErro("");
    const { error } = await supabase.from("dominios").update({ ativo: !d.ativo }).eq("id", d.id);
    if (error) return setErro(mensagemErro(error));
    onRecarregar();
  };

  return (
    <Pagina
      titulo="Listas de opções"
      sub="Valores aceitos nos campos de seleção. Desativar esconde a opção para vagas novas, sem alterar o histórico."
    >
      {erro && (
        <div className="mb-3">
          <Aviso>{erro}</Aviso>
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {CATEGORIAS.map((c, i) => (
          <section
            key={c.key}
            className="glass glass-strong glass-sm entrar p-4"
            style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
          >
            <h2 className="mb-3 text-[14px] font-bold tracking-[-0.02em]">{c.label}</h2>
            <div className="flex flex-wrap gap-[6px]">
              {dominios
                .filter((d) => d.categoria === c.key)
                .map((d) => (
                  <button
                    key={d.id}
                    onClick={() => void alternar(d)}
                    title={d.ativo ? "Clique para desativar" : "Clique para reativar"}
                    className={`btn rounded-full border px-[10px] py-[4px] text-[11.5px] font-semibold ${
                      d.ativo ? "border-input bg-card" : "border-dashed border-input bg-muted text-subtle line-through"
                    }`}
                  >
                    {d.valor}
                  </button>
                ))}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                className={`${inputCls} py-[6px]`}
                placeholder="Nova opção"
                maxLength={60}
                value={novo[c.key] || ""}
                onChange={(e) => setNovo({ ...novo, [c.key]: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void incluir(c.key);
                }}
              />
              <Botao onClick={() => void incluir(c.key)}>Incluir</Botao>
            </div>
          </section>
        ))}
      </div>
    </Pagina>
  );
}

/* ------------------------------------------------------------------ */
/* AUDITORIA                                                           */
/* ------------------------------------------------------------------ */
type Evento = {
  id: number;
  em: string;
  tabela: string;
  registro_id: string;
  acao: string;
  usuario_email: string | null;
  campos: string[] | null;
  antes: Record<string, unknown> | null;
  depois: Record<string, unknown> | null;
};

const NOME_TABELA: Record<string, string> = {
  vagas: "Vaga",
  vagas_salario: "Salário",
  perfis: "Usuário",
  dominios: "Lista",
  exportacao: "Exportação",
};

export function Auditoria() {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [tabela, setTabela] = useState("");
  const [usuario, setUsuario] = useState("");
  const [limite, setLimite] = useState(200);
  const [erro, setErro] = useState("");
  const [aberto, setAberto] = useState<number | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    setCarregando(true);
    let q = supabase
      .from("auditoria")
      .select("id,em,tabela,registro_id,acao,usuario_email,campos,antes,depois")
      .order("em", { ascending: false })
      .limit(limite);
    if (tabela) q = q.eq("tabela", tabela);
    if (usuario.trim()) q = q.ilike("usuario_email", `%${usuario.trim()}%`);
    void q.then(({ data, error }) => {
      if (error) setErro(mensagemErro(error));
      setEventos((data ?? []) as Evento[]);
      setCarregando(false);
    });
  }, [tabela, usuario, limite]);

  const resumo = (e: Evento) => {
    const r = e.depois ?? e.antes ?? {};
    if (e.tabela === "vagas") return `Nº ${e.registro_id} · ${String(r.cargo ?? "")}`;
    if (e.tabela === "vagas_salario") return `Vaga nº ${e.registro_id}`;
    if (e.tabela === "perfis") return String(r.email ?? "");
    if (e.tabela === "exportacao")
      return `${String(r.linhas ?? "")} linhas da tela ${String(r.tela ?? "")}${r.com_salario ? " (com salário)" : ""}`;
    if (e.tabela === "dominios") return `${String(r.categoria ?? "")}: ${String(r.valor ?? "")}`;
    return e.registro_id;
  };

  return (
    <Pagina titulo="Auditoria" sub="Trilha imutável: ninguém, nem administradores, consegue alterar ou apagar estes registros.">
      {erro && (
        <div className="mb-3">
          <Aviso>{erro}</Aviso>
        </div>
      )}
      <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-[220px_1fr]">
        <select className={inputCls} value={tabela} onChange={(e) => setTabela(e.target.value)}>
          <option value="">Tudo</option>
          {Object.entries(NOME_TABELA).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <input
          className={inputCls}
          placeholder="Filtrar por e-mail do usuário"
          value={usuario}
          onChange={(e) => setUsuario(e.target.value)}
        />
      </div>
      <section className="glass glass-strong entrar overflow-hidden">
        {carregando && eventos.length === 0 && <SkLinhas n={10} />}
        <div className="lista-cascata">
        {eventos.map((e) => (
          <div key={e.id} className="border-b border-hairline">
            <button
              className="grid w-full grid-cols-[130px_90px_100px_1fr_1fr] items-center gap-2 px-3 py-[9px] text-left text-[12.5px] font-medium hover:bg-surface-alt"
              onClick={() => setAberto(aberto === e.id ? null : e.id)}
            >
              <span className="tnum text-subtle">{dataHoraBR(e.em)}</span>
              <Pilula texto={NOME_TABELA[e.tabela] ?? e.tabela} />
              <span className="font-semibold">
                {e.acao === "INSERT" ? "Inclusão" : e.acao === "UPDATE" ? "Alteração" : e.acao === "IMPORT" ? "Importação" : e.acao === "EXPORT" ? "Download" : e.acao}
              </span>
              <span className="truncate">{resumo(e)}</span>
              <span className="truncate text-muted-foreground">{e.usuario_email || "sistema"}</span>
            </button>
            {aberto === e.id && (
              <div className="bg-surface-alt px-4 py-3 text-[12px]">
                {e.acao === "UPDATE" && e.campos ? (
                  <ul className="flex flex-col gap-1">
                    {e.campos.map((c) => (
                      <li key={c}>
                        <strong>{ROTULO[c] ?? c}:</strong>{" "}
                        <span className="text-muted-foreground line-through">{String(e.antes?.[c] ?? "(vazio)")}</span> →{" "}
                        {String(e.depois?.[c] ?? "(vazio)")}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <pre className="overflow-auto font-mono text-[11px] whitespace-pre-wrap">
                    {JSON.stringify(e.depois ?? e.antes, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </div>
        ))}
        </div>
        {eventos.length === 0 && !carregando && (
          <p className="px-4 py-8 text-center text-[12.5px] text-muted-foreground">Nenhum registro.</p>
        )}
      </section>
      {eventos.length >= limite && (
        <div className="mt-3">
          <Botao onClick={() => setLimite(limite + 300)}>Carregar mais</Botao>
        </div>
      )}
    </Pagina>
  );
}
