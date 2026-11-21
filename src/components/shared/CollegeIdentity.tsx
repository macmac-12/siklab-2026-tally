import Image from "next/image";
import type { CSSProperties } from "react";
import { collegeBrand, displayCode } from "@/lib/branding";

/** Decorative beside a visible college label; dimensions are reserved before load. */
export function CollegeCrest({ id, size = 32 }: { id: string; size?: number }) {
  const brand = collegeBrand(id);
  if (!brand) return null;
  return (
    <Image
      className="college-crest"
      src={brand.logo}
      alt=""
      width={size}
      height={size}
      sizes={`${size}px`}
      draggable={false}
    />
  );
}

export default function CollegeIdentity({
  id,
  variant = "compact",
  label,
}: {
  id: string;
  variant?: "compact" | "participant" | "banner";
  label?: string;
}) {
  const brand = collegeBrand(id);
  const code = displayCode(id);
  const primary = label && label !== id && label !== code ? label : code;
  const size = variant === "banner" ? 72 : variant === "participant" ? 48 : 28;
  return (
    <span
      className={`college-identity college-identity--${variant} college-${brand?.id.toLowerCase() || "unknown"}`}
      style={
        brand
          ? ({
              "--college-accent": `var(${brand.accentToken})`,
            } as CSSProperties)
          : undefined
      }
      title={brand ? `${brand.name} · ${brand.mascot}` : undefined}
    >
      <CollegeCrest id={id} size={size} />
      <span className="college-identity-copy">
        <strong className="college-identity-code">{primary}</strong>
        {variant === "banner" && brand ? (
          <span className="college-identity-name">{brand.name}</span>
        ) : null}
        {variant !== "compact" && brand ? (
          <small className="college-identity-mascot">
            {primary !== code ? `${code} · ` : ""}
            {brand.mascot}
          </small>
        ) : null}
      </span>
    </span>
  );
}

export { CollegeIdentity };
