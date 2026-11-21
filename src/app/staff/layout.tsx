import type { ReactNode } from "react";

// Staff HTML, as well as the authenticated API, must bypass shared caches.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function StaffLayout({ children }: { children: ReactNode }) {
  return children;
}
