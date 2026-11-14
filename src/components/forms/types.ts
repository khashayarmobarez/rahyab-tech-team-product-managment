import type { PersonSlug } from "@/lib/constants";

/** A person the forms can offer. Only active people are passed in. */
export type PersonOption = { slug: PersonSlug; name: string };

/** What the answer dialog needs to know about a decision. */
export type DecisionToAnswer = { id: string; title: string; description: string };
