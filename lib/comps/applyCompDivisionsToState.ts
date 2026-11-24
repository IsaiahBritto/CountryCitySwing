import type { CompDivisionOption } from "@/components/comps/CompDivisionRadioList";

export function applyCompDivisionsToState(
  list: CompDivisionOption[],
  setters: {
    setCompDivisions: (v: CompDivisionOption[]) => void;
    setJnJDivisionId: (v: string) => void;
    setStrictlyDivisionId: (v: string) => void;
    setAllAmericanDivisionId: (v: string) => void;
  }
): void {
  setters.setCompDivisions(list);
  const jnj = list.filter((c) => c.comp_type === "jack_and_jill");
  const strict = list.filter((c) => c.comp_type === "strictly");
  const aa = list.filter((c) => c.comp_type === "all_american");
  if (jnj.length === 1) setters.setJnJDivisionId(jnj[0]!.id);
  if (strict.length === 1) setters.setStrictlyDivisionId(strict[0]!.id);
  if (aa.length === 1) setters.setAllAmericanDivisionId(aa[0]!.id);
}
