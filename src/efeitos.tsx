/*
 * Efeitos de interface do kit Liquid Glass (ver src/efeitos.css), adaptados
 * para React. Tudo aqui é opcional: com movimento reduzido, nada anima.
 */
import {
  cloneElement,
  createContext,
  isValidElement,
  type ReactElement,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

export const reduzMovimento = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export const animar = (el: Element | null | undefined, quadros: Keyframe[], opcoes: KeyframeAnimationOptions) =>
  !el || reduzMovimento() || !("animate" in el) ? null : el.animate(quadros, opcoes);

/** Espera a animação terminar, mas nunca mais que `limite` ms (aba oculta não resolve a promessa). */
export const esperar = (anim: Animation | null | undefined, limite = 220) =>
  anim ? Promise.race([anim.finished.catch(() => undefined), new Promise((r) => setTimeout(r, limite))]) : Promise.resolve();

export const pulsar = (el: Element | null | undefined) =>
  animar(el, [{ transform: "scale(1)" }, { transform: "scale(1.28)" }, { transform: "scale(1)" }], {
    duration: 380,
    easing: "cubic-bezier(.34, 1.56, .64, 1)",
  });

/* ------------------------------------------------------------------------ */
/* 1. Fundo vivo                                                             */
/* ------------------------------------------------------------------------ */
export function FundoVivo() {
  return (
    <div className="bg" aria-hidden="true">
      <div className="gotas">
        <span />
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* 6. Liquid Morph                                                           */
/* ------------------------------------------------------------------------ */
type Pos = { x: number; y: number; w: number; h: number };

/** Última posição do indicador por grupo de abas: ao remontar, ele sai de onde estava. */
const posicaoAbas = new Map<string, Pos>();

/**
 * Indicador único que desliza até a aba ativa. A lista recebe `listaRef` e deve
 * renderizar `<span ref={indRef} className="tab-ind" aria-hidden />` como primeiro
 * filho; a aba ativa é a que tem aria-selected="true" ou aria-current="page".
 *
 * useLayoutEffect no lugar do requestAnimationFrame do kit: posiciona antes da
 * pintura, então não existe o quadro "sem destaque" (armadilha 4 do kit).
 */
export function useAbasLiquidas(chave: string, ativo: string) {
  const listaRef = useRef<HTMLDivElement>(null);
  const indRef = useRef<HTMLSpanElement>(null);
  const iniciado = useRef(false);

  useLayoutEffect(() => {
    const lista = listaRef.current;
    const ind = indRef.current;
    if (!lista || !ind) return;
    const medir = (): Pos | null => {
      const b = lista.querySelector<HTMLElement>('[aria-selected="true"], [aria-current="page"]');
      return b ? { x: b.offsetLeft, y: b.offsetTop, w: b.offsetWidth, h: b.offsetHeight } : null;
    };
    const pousar = (p: Pos) => {
      ind.style.transform = `translate(${p.x}px, ${p.y}px)`;
      ind.style.width = `${p.w}px`;
      ind.style.height = `${p.h}px`;
    };
    const novo = medir();
    if (!novo) {
      ind.classList.remove("pronto");
      return;
    }
    if (!iniciado.current) {
      iniciado.current = true;
      ind.classList.add("parado");
      pousar(posicaoAbas.get(chave) ?? novo);
      void ind.offsetWidth; // fixa o ponto de partida antes de ligar a transição
      ind.classList.remove("parado");
      ind.classList.add("pronto");
    }
    pousar(novo);
    posicaoAbas.set(chave, novo);
  }, [chave, ativo]);

  useEffect(() => {
    const lista = listaRef.current;
    const ind = indRef.current;
    if (!lista || !ind || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const b = lista.querySelector<HTMLElement>('[aria-selected="true"], [aria-current="page"]');
      if (!b) return;
      const p = { x: b.offsetLeft, y: b.offsetTop, w: b.offsetWidth, h: b.offsetHeight };
      ind.style.transform = `translate(${p.x}px, ${p.y}px)`;
      ind.style.width = `${p.w}px`;
      ind.style.height = `${p.h}px`;
      posicaoAbas.set(chave, p);
    });
    ro.observe(lista);
    return () => ro.disconnect();
  }, [chave]);

  return { listaRef, indRef };
}

/* ------------------------------------------------------------------------ */
/* 7. Bubble Reveal: saída                                                   */
/* ------------------------------------------------------------------------ */
/**
 * Mantém o filho na tela por um instante depois de `visivel` virar false, com a
 * classe bolha-saindo (some por opacidade). A entrada é do próprio CSS
 * (@starting-style em .btn). O filho precisa aceitar `className`.
 */
export function Bolha({ visivel, children }: { visivel: boolean; children: ReactElement<{ className?: string }> }) {
  const [montado, setMontado] = useState(visivel);
  const [saindo, setSaindo] = useState(false);

  useEffect(() => {
    if (visivel) {
      setMontado(true);
      setSaindo(false);
      return;
    }
    if (!montado) return;
    if (reduzMovimento()) {
      setMontado(false);
      return;
    }
    setSaindo(true);
    const t = window.setTimeout(() => {
      setMontado(false);
      setSaindo(false);
    }, 240);
    return () => window.clearTimeout(t);
  }, [visivel]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!montado || !isValidElement(children)) return null;
  if (!saindo) return children;
  return cloneElement(children, { className: `${children.props.className ?? ""} bolha-saindo` });
}

/* ------------------------------------------------------------------------ */
/* 8. Scroll Float                                                           */
/* ------------------------------------------------------------------------ */
/** Liga data-rolou no <html> depois de 24 px de rolagem (sem evento de scroll). */
export function useScrollFloat() {
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const s = document.createElement("div");
    s.className = "sentinela-rolagem";
    document.body.prepend(s);
    const io = new IntersectionObserver(([e]) =>
      document.documentElement.toggleAttribute("data-rolou", !e!.isIntersecting),
    );
    io.observe(s);
    return () => {
      io.disconnect();
      s.remove();
      document.documentElement.removeAttribute("data-rolou");
    };
  }, []);
}

/* ------------------------------------------------------------------------ */
/* 9. Seleção com pop                                                        */
/* ------------------------------------------------------------------------ */
/** Selo de "selecionado" no canto do cartão. Aparece com pop e o ✓ é desenhado. */
export function Check() {
  return (
    <span className="chk" aria-hidden="true">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M2.5 6.2 5 8.6 9.6 3.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/* ------------------------------------------------------------------------ */
/* 10. Pulso                                                                 */
/* ------------------------------------------------------------------------ */
/** Número que dá um pulso quando muda (não na primeira exibição). */
export function Numero({ valor, className = "" }: { valor: string | number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const anterior = useRef(valor);
  useEffect(() => {
    if (anterior.current !== valor) pulsar(ref.current);
    anterior.current = valor;
  }, [valor]);
  return (
    <span ref={ref} className={`pulsa ${className}`}>
      {valor}
    </span>
  );
}

/* ------------------------------------------------------------------------ */
/* 11. Deslize entre etapas                                                  */
/* ------------------------------------------------------------------------ */
/**
 * Direção da última troca de aba, para os painéis da aba nova entrarem pelo lado
 * do movimento. Nulo = primeira exibição (entrada normal, com zoom).
 */
export const DirecaoCtx = createContext<1 | -1 | null>(null);

/** Classe de entrada de um painel: deslize se houve troca de aba, zoom se não. */
export function useClasseEntrada() {
  const dir = useContext(DirecaoCtx);
  return dir === 1 ? "entra-dir" : dir === -1 ? "entra-esq" : "entrar";
}

/**
 * Tira os painéis atuais para o lado contrário (160 ms) e só então troca a aba.
 * Cada painel de vidro anima a si mesmo, nunca o contêiner (armadilha 2 do kit).
 * Devolve uma função que cancela as animações de saída, para chamar depois da
 * troca: um elemento reaproveitado pelo React não pode ficar preso invisível.
 */
export async function sairParaLado(container: HTMLElement | null, dir: 1 | -1, seletor = ".glass") {
  if (!container) return () => undefined;
  const alvos = Array.from(container.querySelectorAll<HTMLElement>(seletor));
  if (container.matches(seletor)) alvos.unshift(container);
  const anims = alvos
    .map((el) =>
      animar(el, [{ opacity: 1, transform: "none" }, { opacity: 0, transform: `translateX(${-dir * 36}px)` }], {
        duration: 160,
        easing: "cubic-bezier(.4,0,1,1)",
        fill: "forwards",
      }),
    )
    .filter((a): a is Animation => !!a);
  await esperar(anims[0]);
  return () => anims.forEach((a) => a.cancel());
}

/* ------------------------------------------------------------------------ */
/* 12. Confete                                                               */
/* ------------------------------------------------------------------------ */
export function confete({ quantidade = 110, duracao = 1600 } = {}) {
  if (reduzMovimento()) return;
  const css = getComputedStyle(document.documentElement);
  const cores = ["--cat-1", "--cat-2", "--cat-3", "--cat-4", "--accent"]
    .map((v) => css.getPropertyValue(v).trim())
    .filter(Boolean);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const L = window.innerWidth;
  const A = window.innerHeight;
  const cv = document.createElement("canvas");
  cv.className = "confete";
  cv.width = L * dpr;
  cv.height = A * dpr;
  document.body.append(cv);
  const ctx = cv.getContext("2d");
  if (!ctx) {
    cv.remove();
    return;
  }
  ctx.scale(dpr, dpr);
  const ps = Array.from({ length: quantidade }, (_, i) => {
    const esq = i % 2 === 0;
    const ang = ((esq ? -60 : -120) * Math.PI) / 180 + (Math.random() - 0.5) * 0.9;
    const vel = 9 + Math.random() * 8;
    return {
      x: esq ? L * 0.08 : L * 0.92,
      y: A * 0.95,
      vx: Math.cos(ang) * vel,
      vy: Math.sin(ang) * vel * 1.35,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      w: 6 + Math.random() * 6,
      hh: 8 + Math.random() * 8,
      cor: cores[i % cores.length]!,
    };
  });
  const t0 = performance.now();
  const quadro = (t: number) => {
    const p = (t - t0) / duracao;
    ctx.clearRect(0, 0, L, A);
    ctx.globalAlpha = p < 0.7 ? 1 : Math.max(0, 1 - (p - 0.7) / 0.3);
    for (const c of ps) {
      c.vy += 0.32;
      c.vx *= 0.985;
      c.vy *= 0.985;
      c.x += c.vx;
      c.y += c.vy;
      c.r += c.vr;
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.r);
      ctx.fillStyle = c.cor;
      ctx.fillRect(-c.w / 2, -c.hh / 2, c.w, c.hh * Math.abs(Math.cos(c.r * 2)) + 2);
      ctx.restore();
    }
    if (p < 1) requestAnimationFrame(quadro);
    else cv.remove();
  };
  requestAnimationFrame(quadro);
}

/* ------------------------------------------------------------------------ */
/* 13. Skeleton                                                              */
/* ------------------------------------------------------------------------ */
export function Sk({ className = "sk-linha" }: { className?: string }) {
  return <span className={`sk ${className}`} aria-hidden="true" />;
}

/** Linhas de tabela em carregamento. */
export function SkLinhas({ n = 8 }: { n?: number }) {
  return (
    <div className="flex flex-col gap-3 px-4 py-4" role="status" aria-label="Carregando">
      {Array.from({ length: n }, (_, i) => (
        <Sk key={i} className={i % 3 === 2 ? "sk-linha curta" : "sk-linha"} />
      ))}
    </div>
  );
}
