"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export default function Dialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => { dialog?.close(); };
  }, []);
  return <dialog ref={ref} aria-labelledby="dialog-title" className="dialog" onCancel={event => {
    event.preventDefault();
    onClose();
  }}>
    <div className="dialog-header"><h2 id="dialog-title">{title}</h2>
      <button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={19} /></button>
    </div>
    {children}
  </dialog>;
}
