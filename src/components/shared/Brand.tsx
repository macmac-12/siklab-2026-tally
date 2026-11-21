import Link from "next/link";
import Image from "next/image";
import { SIKLAB_LOGO } from "@/lib/branding";

export default function Brand({ staff = false }: { staff?: boolean }) {
  return (
    <Link
      href={staff ? "/staff" : "/"}
      className={`brand${staff ? " brand--staff" : ""}`}
      aria-label={staff ? "Siklab staff workspace" : "Siklab home"}
    >
      <Image
        className="brand-logo"
        src={SIKLAB_LOGO}
        alt=""
        width={48}
        height={77}
        sizes="48px"
        priority
        draggable={false}
      />
      <span className="brand-copy">
        SIKLAB <b>2026</b>
        <small>{staff ? "EVENT WORKSPACE" : "CSPC INTRAMURALS"}</small>
      </span>
    </Link>
  );
}
