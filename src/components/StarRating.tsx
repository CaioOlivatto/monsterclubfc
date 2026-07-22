import { cn } from "@/lib/utils";

interface StarRatingProps {
  /** Valor de 0 a 5 (aceita meias-estrelas, ex: 3.5) */
  value: number;
  className?: string;
  /** Tamanho em rem para as estrelas (default: 0.85) */
  size?: number;
  /** Mostrar o número também (ex: "3.5") */
  showNumber?: boolean;
}

/**
 * Renderiza 5 estrelas visuais, preenchidas conforme `value`.
 * - Estrela cheia: ★
 * - Meia estrela: ⯨ (fallback: superposição CSS)
 * - Vazia: ☆
 *
 * Regra: arredonda para o meio mais próximo. Ex: 3.24 -> 3.0; 3.25 -> 3.5.
 */
export function StarRating({ value, className, size = 0.85, showNumber = false }: StarRatingProps) {
  const clamped = Math.max(0, Math.min(5, value));
  const halves = Math.round(clamped * 2); // 0..10
  const full = Math.floor(halves / 2);
  const hasHalf = halves % 2 === 1;
  const empty = 5 - full - (hasHalf ? 1 : 0);

  return (
    <span
      className={cn("inline-flex items-center gap-0.5 leading-none text-amber-300", className)}
      style={{ fontSize: `${size}rem` }}
      aria-label={`${(halves / 2).toFixed(1)} de 5 estrelas`}
    >
      {Array.from({ length: full }).map((_, i) => (
        <span key={`f${i}`}>★</span>
      ))}
      {hasHalf && (
        <span className="relative inline-block" style={{ width: `${size}rem` }}>
          <span className="absolute inset-0 text-amber-300/30">★</span>
          <span
            className="absolute inset-0 overflow-hidden"
            style={{ width: "50%" }}
          >
            ★
          </span>
        </span>
      )}
      {Array.from({ length: empty }).map((_, i) => (
        <span key={`e${i}`} className="text-amber-300/30">★</span>
      ))}
      {showNumber && (
        <span className="ml-1 text-xs text-muted-foreground">{(halves / 2).toFixed(1)}</span>
      )}
    </span>
  );
}

/** Converte overall (0-100) para escala de estrelas 0-5. */
export function overallToStars(overall: number): number {
  return Math.max(0, Math.min(5, overall / 20));
}

/** Converte half_stars_earned (0-10) para escala de estrelas 0-5. */
export function halfStarsToStars(halfStars: number): number {
  return Math.max(0, Math.min(5, halfStars / 2));
}
