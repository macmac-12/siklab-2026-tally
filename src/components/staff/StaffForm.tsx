"use client";
import { useId, useRef, useState } from "react";
import type { FormHTMLAttributes } from "react";

type ConstraintField =
  HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** Keep HTML constraints while presenting validation in the workspace, without browser popups. */
export default function StaffForm({
  children,
  onSubmit,
  onInput,
  ...props
}: FormHTMLAttributes<HTMLFormElement>) {
  const [error, setError] = useState("");
  const errorId = useId();
  const invalid = useRef<{
    field: ConstraintField;
    describedBy: string | null;
  } | null>(null);
  function clearError() {
    if (invalid.current) {
      const { field, describedBy } = invalid.current;
      field.removeAttribute("aria-invalid");
      if (describedBy === null) field.removeAttribute("aria-describedby");
      else field.setAttribute("aria-describedby", describedBy);
      invalid.current = null;
    }
    setError("");
  }
  return (
    <form
      {...props}
      noValidate
      onInput={(event) => {
        if (error) clearError();
        onInput?.(event);
      }}
      onSubmit={(event) => {
        clearError();
        const form = event.currentTarget;
        if (!form.checkValidity()) {
          event.preventDefault();
          const field = Array.from(form.elements).find(
            (element): element is ConstraintField =>
              (element instanceof HTMLInputElement ||
                element instanceof HTMLSelectElement ||
                element instanceof HTMLTextAreaElement) &&
              !element.validity.valid,
          );
          if (field) {
            const label =
              field.getAttribute("aria-label") ||
              field.labels?.[0]?.textContent?.trim() ||
              "This field";
            invalid.current = {
              field,
              describedBy: field.getAttribute("aria-describedby"),
            };
            field.setAttribute("aria-invalid", "true");
            field.setAttribute(
              "aria-describedby",
              [invalid.current.describedBy, errorId].filter(Boolean).join(" "),
            );
            setError(`${label}: ${field.validationMessage}`);
            field.focus();
          }
          return;
        }
        onSubmit?.(event);
      }}
    >
      {error ? (
        <p id={errorId} className="alert form-validation" role="alert">
          {error}
        </p>
      ) : null}
      {children}
    </form>
  );
}
