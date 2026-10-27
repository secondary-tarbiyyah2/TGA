"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

/**
 * One "current child" for the whole family area.
 *
 * Every family page used to pick the child its own way (dashboard chips
 * remembered in one storage key, `?child=` on some pages, "first child" on
 * Qur'an/Revision/Reports), so a parent who chose their second child on the
 * dashboard landed back on the first child from the sidebar. All of them now
 * read and write this one choice:
 *
 *   1. `?child=<id>` in the URL wins (deep links from emails and widgets);
 *   2. otherwise the last choice made anywhere in the family area;
 *   3. otherwise the first child.
 */
const KEY = "tga-family-child";

export function readSelectedChild(): string {
  try {
    return window.localStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
}

export function writeSelectedChild(id: string) {
  try {
    window.localStorage.setItem(KEY, id);
  } catch {
    /* fine unremembered */
  }
  window.dispatchEvent(new CustomEvent("tga-family-child", { detail: id }));
}

/**
 * Returns the chosen child id (always one of `childIds` once they are known)
 * and a setter that remembers the choice for every other family page.
 */
export function useSelectedChild(childIds: string[] | null): [string, (id: string) => void] {
  const params = useSearchParams();
  const fromUrl = params.get("child") || "";
  const [stored, setStored] = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the browser's remembered choice once mounted
    setStored(readSelectedChild());
    const onChange = (e: Event) => setStored(String((e as CustomEvent).detail || ""));
    window.addEventListener("tga-family-child", onChange);
    return () => window.removeEventListener("tga-family-child", onChange);
  }, []);

  const choose = useCallback((id: string) => {
    setStored(id);
    writeSelectedChild(id);
  }, []);

  const ids = childIds || [];
  const wanted = fromUrl || stored;
  const chosen = ids.length === 0 ? wanted : ids.includes(wanted) ? wanted : ids[0];
  return [chosen, choose];
}
