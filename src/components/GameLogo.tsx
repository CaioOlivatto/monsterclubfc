export function GameLogo({
  size = "md",
  className = "",
}: {
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = {
    xs: "w-20 sm:w-24",
    sm: "w-28 sm:w-36",
    md: "w-48 sm:w-64",
    lg: "w-64 sm:w-96",
  }[size];

  return (
    <img
      src="/assets/monster-club-logo.webp"
      alt="Monster Club FC"
      className={`h-auto object-contain drop-shadow-[0_3px_10px_rgba(0,0,0,0.75)] ${sizes} ${className}`}
    />
  );
}
