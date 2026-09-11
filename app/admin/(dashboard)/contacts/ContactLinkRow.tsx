"use client";

import { useRouter } from "next/navigation";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";

// Contacts list row: clicking anywhere on it (except an inner link/control)
// goes straight to the full profile. Replaces the slide-in shelf.
export function ContactLinkRow({ id, children }: { id: string; children: ReactNode }) {
  const router = useRouter();
  const href = `/admin/contacts/${id}`;

  function hitsInnerInteractive(e: { target: EventTarget; currentTarget: HTMLTableRowElement }) {
    const hit = (e.target as HTMLElement).closest("a,button,input,select,label,[role=button]");
    return !!hit && hit !== e.currentTarget;
  }

  function onClick(e: MouseEvent<HTMLTableRowElement>) {
    if (hitsInnerInteractive(e)) return;
    if (e.metaKey || e.ctrlKey) {
      window.open(href, "_blank");
      return;
    }
    router.push(href);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTableRowElement>) {
    if (e.key !== "Enter" && e.key !== " ") return;
    if (hitsInnerInteractive(e)) return;
    e.preventDefault();
    router.push(href);
  }

  return (
    <tr className="is-clickable" onClick={onClick} onKeyDown={onKeyDown} tabIndex={0} role="link">
      {children}
    </tr>
  );
}
