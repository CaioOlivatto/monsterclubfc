const CRESTS = {
  titas_pedra: { artwork: "/assets/crest-titas.webp", shadow: "drop-shadow-[0_0_10px_rgba(245,158,11,0.35)]" },
  furacoes_vento: { artwork: "/assets/crest-furacoes.webp", shadow: "drop-shadow-[0_0_10px_rgba(59,130,246,0.4)]" },
  chamas_rubras: { artwork: "/assets/crest-chamas.webp", shadow: "drop-shadow-[0_0_10px_rgba(239,68,68,0.4)]" },
  mares_profundas: { artwork: "/assets/crest-mares.webp", shadow: "drop-shadow-[0_0_10px_rgba(14,165,233,0.4)]" },
  laminas_gelo: { artwork: "/assets/crest-laminas.webp", shadow: "drop-shadow-[0_0_10px_rgba(34,211,238,0.4)]" },
  guardioes_mistos: { artwork: "/assets/crest-guardioes.webp", shadow: "drop-shadow-[0_0_10px_rgba(34,197,94,0.4)]" },
} as const;

const NAME_TO_KEY: Record<string, keyof typeof CRESTS> = {
  "titãs de pedra": "titas_pedra",
  "furacões do vento": "furacoes_vento",
  "chamas rubras": "chamas_rubras",
  "marés profundas": "mares_profundas",
  "lâminas de gelo": "laminas_gelo",
  "guardiões mistos": "guardioes_mistos",
};

const ELEMENT_TO_KEY: Record<string, keyof typeof CRESTS> = {
  terra: "titas_pedra",
  ar: "furacoes_vento",
  fogo: "chamas_rubras",
  agua: "mares_profundas",
  água: "mares_profundas",
  gelo: "laminas_gelo",
  mesclado: "guardioes_mistos",
};

export function starterTeamKeyFromName(name?: string | null) {
  return NAME_TO_KEY[String(name ?? "").trim().toLocaleLowerCase("pt-BR")] ?? "guardioes_mistos";
}

export function TeamCrest({
  teamKey,
  teamName,
  teamElement,
  size = "md",
  className = "",
}: {
  teamKey?: string | null;
  teamName?: string | null;
  teamElement?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const normalizedElement = String(teamElement ?? "").trim().toLocaleLowerCase("pt-BR");
  const resolved = (
    teamKey && teamKey in CRESTS
      ? teamKey
      : ELEMENT_TO_KEY[normalizedElement] ?? starterTeamKeyFromName(teamName)
  ) as keyof typeof CRESTS;
  const crest = CRESTS[resolved];
  const sizes = {
    sm: "h-9 w-9",
    md: "h-12 w-12",
    lg: "h-20 w-20",
    xl: "h-28 w-28",
  }[size];

  return (
    <img
      src={crest.artwork}
      alt=""
      aria-hidden="true"
      className={`shrink-0 object-contain ${sizes} ${crest.shadow} ${className}`}
    />
  );
}
