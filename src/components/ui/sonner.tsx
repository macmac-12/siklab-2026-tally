"use client";
import { useEffect, useState, type CSSProperties } from "react";
import { Toaster, toast } from "sonner";

export { toast };
export function StaffToaster() {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setPhone(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return (
    <Toaster
      className="staff-toaster"
      position={phone ? "bottom-center" : "bottom-right"}
      closeButton
      richColors
      duration={5000}
      style={
        {
          "--normal-bg": "var(--color-raised)",
          "--normal-text": "var(--color-ink)",
          "--normal-border": "var(--color-control-border)",
          "--success-bg": "var(--color-success-soft)",
          "--success-text": "var(--color-success)",
          "--success-border": "var(--color-success)",
          "--error-bg": "var(--color-danger-soft)",
          "--error-text": "var(--color-error)",
          "--error-border": "var(--color-error)",
          "--warning-bg": "var(--color-warning-soft)",
          "--warning-text": "var(--color-warning)",
          "--warning-border": "var(--color-warning)",
        } as CSSProperties
      }
      toastOptions={{ className: "staff-toast" }}
    />
  );
}
