const logoSrc = `${import.meta.env.BASE_URL}branding/att.png`;

export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`official-brand-logo ${compact ? "compact" : "full"}`}>
      <img src={logoSrc} alt="Aires Construções" />
    </span>
  );
}
