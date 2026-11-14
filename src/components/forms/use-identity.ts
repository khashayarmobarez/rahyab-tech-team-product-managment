"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { PersonSlug } from "@/lib/constants";
import type { PersonOption } from "./types";

const STORAGE_KEY = "team-reports:person";
const CHANGE_EVENT = "team-reports:person-change";

/** Used when the browser blocks localStorage, so the choice still sticks until reload. */
let memoryValue = "";

function read(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? memoryValue;
  } catch {
    return memoryValue;
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/**
 * Who the visitor is. The password is shared, so each person picks their name
 * once and the browser remembers it. Returns "" until they choose, or when the
 * remembered person is no longer active.
 */
export function useIdentity(people: PersonOption[]): readonly [PersonSlug | "", (slug: string) => void] {
  const stored = useSyncExternalStore(subscribe, read, () => "");
  const slug = people.find((p) => p.slug === stored)?.slug ?? "";

  const choose = useCallback((next: string) => {
    memoryValue = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage is blocked; the in-memory copy above is enough for this visit.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return [slug, choose] as const;
}
