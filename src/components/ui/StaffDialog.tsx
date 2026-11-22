"use client";

import {
  createContext,
  useContext,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import { X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./alert-dialog";
import { Button } from "./button";

type CloseActions = {
  requestClose: () => void;
  complete: () => void;
  markDirty: () => void;
};
export type StaffDialogHandle = Pick<CloseActions, "complete">;
const CloseContext = createContext<CloseActions | null>(null);
export function useStaffDialogClose() {
  return useContext(CloseContext);
}

/** One modal owner for staff editors, including portal styling and unsaved input. */
export default function StaffDialog({
  title,
  description,
  busy = false,
  error,
  errorId,
  dirty,
  actionRef,
  onClose,
  children,
}: {
  title: string;
  description?: string;
  busy?: boolean;
  error?: string;
  errorId?: string;
  dirty?: boolean;
  actionRef?: Ref<StaffDialogHandle>;
  onClose: () => void;
  children: ReactNode;
}) {
  // Dirty tracking is imperative: a capture handler must not rerender controlled
  // fields before their own change handlers have consumed the input event.
  const changed = useRef(false);
  const dirtyOverride = useRef(dirty);
  dirtyOverride.current = dirty;
  const completing = useRef(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [trigger] = useState(() =>
    typeof document === "undefined"
      ? null
      : (document.activeElement as HTMLElement | null),
  );
  const content = useRef<HTMLDivElement>(null);
  const errorNode = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (completing.current || !(dirtyOverride.current ?? changed.current))
        return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  useEffect(() => {
    if (error) {
      errorNode.current?.focus();
      errorNode.current?.scrollIntoView({ block: "nearest" });
    }
  }, [error]);
  function complete() {
    completing.current = true;
    changed.current = false;
    onClose();
  }
  function requestClose() {
    if (busy) return;
    if (dirty ?? changed.current) setConfirmClose(true);
    else complete();
  }
  useImperativeHandle(actionRef, () => ({ complete }));
  return (
    <CloseContext.Provider
      value={{
        requestClose,
        complete,
        markDirty: () => {
          changed.current = true;
        },
      }}
    >
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) requestClose();
        }}
      >
        <DialogContent
          ref={content}
          className="staff-app staff-dialog"
          showCloseButton={false}
          onOpenAutoFocus={(event) => {
            const field = content.current?.querySelector<HTMLElement>(
              ".staff-dialog-body input:not([type=hidden]), .staff-dialog-body select, .staff-dialog-body textarea",
            );
            if (field) {
              event.preventDefault();
              field.focus();
            }
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (trigger?.isConnected) trigger.focus();
          }}
          onEscapeKeyDown={(event) => {
            event.preventDefault();
            requestClose();
          }}
          onPointerDownOutside={(event) => {
            event.preventDefault();
          }}
        >
          <DialogHeader className="staff-dialog-header">
            <div>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>
                {description ||
                  "Review the details before saving your changes."}
              </DialogDescription>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={busy}
              onClick={requestClose}
              aria-label={`Close ${title}`}
            >
              <X size={18} />
            </Button>
          </DialogHeader>
          <div
            className="staff-dialog-body"
            onInputCapture={() => {
              changed.current = true;
            }}
            onChangeCapture={() => {
              changed.current = true;
            }}
            aria-busy={busy}
          >
            {error ? (
              <p
                ref={errorNode}
                id={errorId}
                className="alert"
                role="alert"
                tabIndex={-1}
              >
                {error}
              </p>
            ) : null}
            {children}
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent className="staff-app staff-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your changes have not been saved. Keep editing or discard them and
              close this editor.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={complete}>
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CloseContext.Provider>
  );
}
