import { useState } from "react";

import logoUrl from "@/assets/wap-logo.png";
import { DOMINIO_EMAIL, LOGIN_CODIGO_EMAIL, LOGIN_MICROSOFT, mensagemErro, supabase } from "@/lib/supabase";
import { marcarAtividade } from "@/lib/sessao";
import { Aviso, Botao, inputCls, Rotulo } from "@/ui";

const urlRetorno = () => window.location.origin + window.location.pathname;

function traduzErroLogin(e: unknown) {
  const m = mensagemErro(e);
  if (/não autorizado|Database error saving new user|Signups not allowed/i.test(m))
    return "Este e-mail não está autorizado na plataforma. Peça o cadastro ao time de People (R&B).";
  if (/expired|invalid/i.test(m)) return "Código inválido ou expirado. Peça um novo código.";
  if (/rate limit|too many/i.test(m)) return "Muitas tentativas em pouco tempo. Aguarde alguns minutos.";
  return m;
}

export default function Login({ erroInicial }: { erroInicial?: string }) {
  const [email, setEmail] = useState("");
  const [codigo, setCodigo] = useState("");
  const [etapa, setEtapa] = useState<"email" | "codigo">("email");
  const [erro, setErro] = useState(erroInicial || "");
  const [info, setInfo] = useState("");
  const [enviando, setEnviando] = useState(false);

  const entrarMicrosoft = async () => {
    setErro("");
    // Marca o uso antes de sair para a Microsoft, para o retorno não ser tratado como sessão vencida.
    marcarAtividade(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "azure",
      options: {
        scopes: "openid email profile",
        redirectTo: urlRetorno(),
        // Pede a credencial na Microsoft a cada entrada. Sem isso, num computador
        // compartilhado, a próxima pessoa entraria direto com a conta Microsoft que
        // ficou aberta no navegador. Para algo mais leve: "select_account".
        queryParams: { prompt: "login" },
      },
    });
    if (error) setErro(traduzErroLogin(error));
  };

  const pedirCodigo = async () => {
    const e = email.trim().toLowerCase();
    if (!e.endsWith("@" + DOMINIO_EMAIL)) {
      setErro(`Use seu e-mail corporativo @${DOMINIO_EMAIL}.`);
      return;
    }
    setEnviando(true);
    setErro("");
    const { error } = await supabase.auth.signInWithOtp({
      email: e,
      options: { shouldCreateUser: true, emailRedirectTo: urlRetorno() },
    });
    setEnviando(false);
    if (error) {
      setErro(traduzErroLogin(error));
      return;
    }
    setEtapa("codigo");
    setInfo(`Enviamos um e-mail para ${e}. Clique no link de acesso ou digite abaixo o código, se ele vier no e-mail.`);
  };

  const confirmarCodigo = async () => {
    setEnviando(true);
    setErro("");
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: codigo.trim(),
      type: "email",
    });
    setEnviando(false);
    if (error) setErro(traduzErroLogin(error));
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="glass entrar flex w-full max-w-[420px] flex-col gap-6 p-8">
        <div className="flex flex-col gap-3">
          <img src={logoUrl} alt="Wap | Waaw by Alok" className="h-6 w-auto self-start object-contain" />
          <div className="flex flex-col gap-1">
            <h1 className="text-[24px] leading-tight font-black tracking-[-0.03em]">Farol de Vagas</h1>
            <span className="text-[12.5px] font-medium text-muted-foreground">
              Recrutamento &amp; Seleção · acesso restrito ao time de People
            </span>
          </div>
        </div>

        {erro ? <Aviso>{erro}</Aviso> : null}
        {info && !erro ? <Aviso tipo="info">{info}</Aviso> : null}

        {LOGIN_MICROSOFT && (
          <button
            onClick={entrarMicrosoft}
            className="btn flex items-center justify-center gap-3 rounded-full border border-primary bg-primary px-4 py-[11px] text-[13px] font-semibold text-primary-foreground hover:brightness-125"
          >
            <svg width="16" height="16" viewBox="0 0 21 21" aria-hidden="true">
              <rect x="1" y="1" width="9" height="9" fill="#f25022" />
              <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
              <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
              <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
            </svg>
            Entrar com a conta Microsoft da WAP
          </button>
        )}

        {LOGIN_MICROSOFT && LOGIN_CODIGO_EMAIL && (
          <div className="flex items-center gap-3 text-[11px] font-semibold text-subtle">
            <span className="h-px flex-1 bg-border" />
            ou receba um código no e-mail
            <span className="h-px flex-1 bg-border" />
          </div>
        )}

        {LOGIN_CODIGO_EMAIL && etapa === "email" && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void pedirCodigo();
            }}
          >
            <Rotulo texto="E-mail corporativo">
              <input
                className={inputCls}
                type="email"
                autoComplete="email"
                placeholder={`nome.sobrenome@${DOMINIO_EMAIL}`}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Rotulo>
            <Botao type="submit" disabled={!email} carregando={enviando}>
              {enviando ? "Enviando..." : "Enviar código"}
            </Botao>
          </form>
        )}

        {LOGIN_CODIGO_EMAIL && etapa === "codigo" && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void confirmarCodigo();
            }}
          >
            <Rotulo texto="Código recebido">
              <input
                className={`${inputCls} tracking-[.3em]`}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={10}
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
              />
            </Rotulo>
            <Botao type="submit" tipo="primario" disabled={codigo.length < 6} carregando={enviando}>
              {enviando ? "Conferindo..." : "Entrar"}
            </Botao>
            <Botao
              tipo="link"
              onClick={() => {
                setEtapa("email");
                setCodigo("");
                setInfo("");
              }}
            >
              Usar outro e-mail
            </Botao>
          </form>
        )}

        <span className="text-[11px] leading-[1.5] font-medium text-subtle">
          Só entram e-mails cadastrados pelos administradores. Todas as alterações ficam registradas com
          usuário, data e hora.
        </span>
      </div>
    </main>
  );
}
