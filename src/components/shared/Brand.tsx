import Link from "next/link";
export default function Brand({ staff = false }: { staff?: boolean }) {
  return (
    <Link
      href={staff ? "/staff" : "/"}
      className="brand"
      aria-label={staff ? "Siklab staff workspace" : "Siklab home"}
    >
      <svg viewBox="0 0 32 38" width="28" height="34" aria-hidden="true">
        <path
          fill="currentColor"
          d="M19 0c3 11-8 12-5 21 4-1 7-5 7-10 7 7 12 14 8 21-5 9-22 8-26-2C-2 19 12 14 19 0Z"
        />
        <path fill="#fff" d="M17 21c0 5-7 7-5 12 2 4 9 3 10-2 1-4-3-6-5-10Z" />
      </svg>
      <span>
        SIKLAB <b>2026</b>
        <small>{staff ? "EVENT WORKSPACE" : "CSPC INTRAMURALS"}</small>
      </span>
    </Link>
  );
}
