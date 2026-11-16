import type { ReactNode } from "react";

export function Botao({
  children,
  onClick,
  tipo = "secundario",
  disabled,
  type = "button",
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  tipo?: "primario" | "secundario" | "perigo" | "link";
  disabled?: boolean;
  type?: "button" | "submit";
  title?: string;
}) {
  const base =
    "rounded-full px-[14px] py-[8px] text-xs font-semibold tracking-[-0.01em] transition-colors disabled:cursor-not-allowed disabled:opacity-50";
  const estilo = {
    primario: "border border-primary bg-primary text-primary-foreground hover:opacity-90",
    secundario: "border border-input bg-card hover:border-foreground",
    perigo: "border border-[oklch(0.55_0.2_27)] bg-card text-[oklch(0.5_0.2_27)] hover:bg-[oklch(0.97_0.02_27)]",
    link: "border border-transparent text-muted-foreground hover:text-foreground",
  }[tipo];
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title} className={`${base} ${estilo}`}>
      {children}
    </button>
  );
}

export function Rotulo({ texto, obrigatorio, children }: { texto: string; obrigatorio?: boolean; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-[5px]">
      <span className="text-[10.5px] font-bold tracking-[.06em] text-muted-foreground uppercase">
        {texto}
        {obrigatorio ? <span className="text-accent"> *</span> : null}
      </span>
      {children}
    </label>
  );
}

export const inputCls =
  "w-full rounded-sm border border-input bg-card px-3 py-[8px] text-[13px] font-medium outline-none focus:border-ring disabled:bg-muted disabled:text-muted-foreground";

export function Aviso({ tipo = "erro", children }: { tipo?: "erro" | "ok" | "info"; children: ReactNode }) {
  const cls = {
    erro: "border-destructive/40 bg-destructive/10 text-destructive",
    ok: "border-[oklch(0.6_0.12_150)]/40 bg-[oklch(0.96_0.04_150)] text-[oklch(0.4_0.1_150)]",
    info: "border-border bg-surface-alt text-muted-foreground",
  }[tipo];
  return <p className={`rounded-sm border px-4 py-3 text-xs leading-[1.5] font-semibold ${cls}`}>{children}</p>;
}

export function Modal({
  titulo,
  subtitulo,
  onFechar,
  children,
  rodape,
  largura = 920,
}: {
  titulo: string;
  subtitulo?: string;
  onFechar: () => void;
  children: ReactNode;
  rodape?: ReactNode;
  largura?: number;
}) {
  return (
    <div
      className="wap-fade fixed inset-0 z-50 flex items-center justify-center bg-[oklch(0.19_0.01_107_/_0.55)] p-[10px] backdrop-blur-[3px] md:p-8"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onFechar();
      }}
    >
      <div
        className="wap-rise flex max-h-[94vh] w-full flex-col overflow-hidden rounded-md bg-card"
        style={{ maxWidth: largura }}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 pt-5 pb-4">
          <div className="flex min-w-0 flex-col gap-1">
            <h3 className="text-[18px] font-extrabold tracking-[-0.03em]">{titulo}</h3>
            {subtitulo ? <span className="text-[12px] font-medium text-subtle">{subtitulo}</span> : null}
          </div>
          <button
            onClick={onFechar}
            className="rounded-full px-2 text-[20px] leading-none text-muted-foreground hover:text-foreground"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-auto px-6 py-5">{children}</div>
        {rodape ? <div className="border-t border-border px-6 py-4">{rodape}</div> : null}
      </div>
    </div>
  );
}

export function Pilula({ texto, cor }: { texto: string; cor?: string }) {
  return (
    <span
      className="inline-block rounded-full px-[9px] py-[3px] text-[11px] font-bold whitespace-nowrap"
      style={{ background: cor ?? "var(--hairline)" }}
    >
      {texto}
    </span>
  );
}

export const corStatus = (s: string) =>
  /fechad/i.test(s)
    ? "oklch(0.93 0.05 150)"
    : /cancel/i.test(s)
      ? "oklch(0.93 0.01 106)"
      : /stand/i.test(s)
        ? "oklch(0.94 0.07 85)"
        : "oklch(0.92 0.05 264)";
