import type { ActorLabel } from "@/api-types";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { m } from "@/paraglide/messages";

export function actorName(label: ActorLabel | null): string {
  switch (label?.kind) {
    case "integration":
      return label.name
        ? m.admin_actor_named_integration({ name: label.name })
        : m.admin_actor_integration();
    case "visitor":
      return m.admin_actor_visitor();
    case "system":
      return m.admin_system_group();
    default:
      return label?.name || m.admin_actor_unknown();
  }
}

export function ActorName({
  actor,
  label,
  formatLabel = (name) => name,
}: {
  actor: string;
  label: ActorLabel | null;
  formatLabel?: (name: string) => string;
}) {
  const name = formatLabel(actorName(label));
  if (!actor) return name;

  return (
    <Collapsible className="inline">
      <CollapsibleTrigger
        className="cursor-pointer text-left underline decoration-dotted underline-offset-2"
        aria-label={m.admin_actor_id_toggle({ name })}
      >
        {name}
      </CollapsibleTrigger>
      <CollapsibleContent className="break-all text-xs text-subtle">{actor}</CollapsibleContent>
    </Collapsible>
  );
}
