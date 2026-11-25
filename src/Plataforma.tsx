import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Auditoria, Listas, Usuarios } from "@/Admin";
import Dashboard from "@/App";
import logoUrl from "@/assets/wap-logo.png";
import {
  type Dominio,
  listarDominios,
  listarPerfis,
  listarVagas,
  paraDashboard,
  type Perfil,
  type PerfilDb,
  type VagaDb,
} from "@/lib/dados";
import { Sk, useAbasLiquidas, useScrollFloat } from "@/efeitos";
import { mensagemErro, supabase } from "@/lib/supabase";
import Login from "@/Login";
import Vagas from "@/Vagas";
import { Aviso, Botao } from "@/ui";

type Tela = "painel" | "vagas" | "usuarios" | "listas" | "auditoria";

/** Sai sozinho depois deste tempo sem uso (boa prática para dados de pessoas). */
const INATIVIDADE_MS = 60 * 60 * 1000;

function erroDaUrl(): string {
  const p = new URLSearchParams(window.location.search + "&" + window.location.hash.replace(/^#/, ""));
  const d = p.get("error_description");
  if (!d) return "";
  if (/Database error saving new user|não autorizado/i.test(d))
    return "Este e-mail não está autorizado na plataforma. Peça o cadastro ao time de People (R&B).";
  return d.replace(/\+/g, " ");
}

export default function Plataforma() {
  const [sessao, setSessao] = useState<Session | null | undefined>(undefined);
  const [perfil, setPerfil] = useState<Perfil | null | undefined>(undefined);
  const [erroLogin] = useState(erroDaUrl);

  useEffect(() => {
    if (erroLogin) window.history.replaceState({}, "", window.location.pathname);
    void supabase.auth.getSession().then(({ data }) => setSessao(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSessao(s));
    return () => data.subscription.unsubscribe();
  }, [erroLogin]);

  useEffect(() => {
    if (!sessao) {
      setPerfil(sessao === null ? null : undefined);
      return;
    }
    void supabase.rpc("registrar_acesso").then(({ data, error }) => {
      if (error || !data || !(data as Perfil[]).length) setPerfil(null);
      else setPerfil((data as Perfil[])[0]!);
    });
  }, [sessao?.user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (sessao === undefined || (sessao && perfil === undefined))
    return (
      <main className="flex min-h-screen items-center justify-center px-4" role="status" aria-label="Carregando">
        <div className="glass entrar flex w-full max-w-[420px] flex-col gap-4 p-8">
          <Sk className="sk-label" />
          <Sk className="sk-titulo" />
          <Sk className="sk-linha" />
          <Sk className="sk-linha curta" />
          <Sk className="sk-botao" />
        </div>
      </main>
    );

  if (!sessao) return <Login erroInicial={erroLogin} />;

  if (!perfil)
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="glass entrar flex max-w-[420px] flex-col gap-4 p-8">
          <Aviso>
            O acesso de {sessao.user.email} não está ativo na plataforma. Peça a um administrador do time de People para
            liberar.
          </Aviso>
          <Botao onClick={() => void supabase.auth.signOut()}>Sair</Botao>
        </div>
      </main>
    );

  return <Area perfil={perfil} />;
}

function Area({ perfil }: { perfil: Perfil }) {
  const admin = perfil.papel === "admin";
  const [tela, setTela] = useState<Tela>(() => {
    const h = window.location.hash.replace("#", "") as Tela;
    return ["painel", "vagas", "usuarios", "listas", "auditoria"].includes(h) ? h : "painel";
  });
  const [vagas, setVagas] = useState<VagaDb[]>([]);
  const [dominios, setDominios] = useState<Dominio[]>([]);
  const [perfis, setPerfis] = useState<PerfilDb[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);
  const ultimaAtividade = useRef(Date.now());
  const timer = useRef<number | undefined>(undefined);

  const recarregarVagas = useCallback(async () => {
    setCarregando(true);
    try {
      setVagas(await listarVagas());
      setAtualizadoEm(new Date());
      setErro("");
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setCarregando(false);
    }
  }, []);

  const recarregarApoio = useCallback(async () => {
    try {
      const [d, p] = await Promise.all([listarDominios(), listarPerfis()]);
      setDominios(d);
      setPerfis(p);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }, []);

  useEffect(() => {
    void recarregarVagas();
    void recarregarApoio();
    // Tempo real: quando qualquer pessoa salva uma vaga, todas as telas abertas atualizam.
    const canal = supabase
      .channel("vagas-tempo-real")
      .on("postgres_changes", { event: "*", schema: "public", table: "vagas" }, () => {
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => void recarregarVagas(), 700);
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(canal);
    };
  }, [recarregarVagas, recarregarApoio]);

  // Encerramento por inatividade
  useEffect(() => {
    const marcar = () => (ultimaAtividade.current = Date.now());
    const eventos = ["mousemove", "keydown", "click", "touchstart"];
    eventos.forEach((e) => window.addEventListener(e, marcar, { passive: true }));
    const id = window.setInterval(() => {
      if (Date.now() - ultimaAtividade.current > INATIVIDADE_MS) void supabase.auth.signOut();
    }, 60 * 1000);
    return () => {
      eventos.forEach((e) => window.removeEventListener(e, marcar));
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (window.location.hash !== "#" + tela) window.location.hash = tela;
    const aoMudar = () => {
      const h = window.location.hash.replace("#", "") as Tela;
      if (["painel", "vagas", "usuarios", "listas", "auditoria"].includes(h)) setTela(h);
    };
    window.addEventListener("hashchange", aoMudar);
    return () => window.removeEventListener("hashchange", aoMudar);
  }, [tela]);

  const rowsPainel = useMemo(() => paraDashboard(vagas), [vagas]);

  useScrollFloat();
  const { listaRef, indRef } = useAbasLiquidas("menu", tela);

  const abas: { k: Tela; l: string; so?: boolean }[] = [
    { k: "painel", l: "Painel" },
    { k: "vagas", l: "Vagas" },
    { k: "usuarios", l: "Usuários", so: true },
    { k: "listas", l: "Listas", so: true },
    { k: "auditoria", l: "Auditoria", so: true },
  ];

  return (
    <div className="min-h-screen text-foreground">
      <header className="barra-fixa no-print sticky top-0 z-40">
        <div className="mx-auto flex max-w-[1680px] flex-wrap items-center gap-x-6 gap-y-2 px-[14px] py-3 md:px-8">
          <div className="flex items-center gap-3">
            <img src={logoUrl} alt="Wap | Waaw by Alok" className="h-[18px] w-auto object-contain" />
            <span className="text-[13px] font-extrabold tracking-[-0.02em]">Farol de Vagas</span>
          </div>
          <nav
            ref={listaRef}
            aria-label="Seções da plataforma"
            className="abas-liquidas flex flex-wrap gap-[2px] rounded-full bg-secondary/70 p-[3px]"
          >
            <span ref={indRef} className="tab-ind" aria-hidden="true" />
            {abas
              .filter((a) => !a.so || admin)
              .map((a) => (
                <button
                  key={a.k}
                  onClick={() => setTela(a.k)}
                  aria-current={tela === a.k ? "page" : undefined}
                  className={`rounded-full px-[14px] py-[6px] text-[12.5px] font-semibold tracking-[-0.01em] ${
                    tela === a.k ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {a.l}
                </button>
              ))}
          </nav>
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-end leading-tight">
              <span className="text-[12.5px] font-bold">{perfil.nome}</span>
              <span className="text-[10.5px] font-semibold tracking-[.06em] text-subtle uppercase">
                {admin ? "Administrador" : "Recrutador"}
              </span>
            </div>
            <Botao tipo="secundario" onClick={() => void supabase.auth.signOut()}>
              Sair
            </Botao>
          </div>
        </div>
      </header>

      {tela === "painel" && (
        <Dashboard
          rows={rowsPainel}
          carregando={carregando}
          erro={erro}
          fonte={
            atualizadoEm
              ? `Plataforma Farol de Vagas · ${rowsPainel.length.toLocaleString("pt-BR")} vagas · atualizado às ${atualizadoEm.toLocaleTimeString("pt-BR")}`
              : "Carregando vagas..."
          }
        />
      )}
      {tela === "vagas" && (
        <>
          {erro && (
            <div className="mx-auto max-w-[1680px] px-[14px] pt-4 md:px-8">
              <Aviso>{erro}</Aviso>
            </div>
          )}
          <Vagas
            vagas={vagas}
            carregando={carregando}
            perfil={perfil}
            dominios={dominios}
            perfis={perfis}
            onRecarregar={() => void recarregarVagas()}
          />
        </>
      )}
      {tela === "usuarios" && admin && <Usuarios perfis={perfis} onRecarregar={() => void recarregarApoio()} />}
      {tela === "listas" && admin && <Listas dominios={dominios} onRecarregar={() => void recarregarApoio()} />}
      {tela === "auditoria" && admin && <Auditoria />}
    </div>
  );
}
