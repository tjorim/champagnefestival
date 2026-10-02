import { Tooltip as Primitive } from "@base-ui/react/tooltip";
import { AdminThemeScope } from "@/components/admin/AdminThemeScope";
import { cn } from "@/lib/utils";
function TooltipProvider(props: Primitive.Provider.Props) {
  return <Primitive.Provider {...props} />;
}
function Tooltip(props: Primitive.Root.Props) {
  return (
    <Primitive.Provider>
      <Primitive.Root {...props} />
    </Primitive.Provider>
  );
}
function TooltipTrigger(props: Primitive.Trigger.Props) {
  return <Primitive.Trigger {...props} />;
}
function TooltipContent({
  admin = false,
  className,
  ...props
}: Primitive.Popup.Props & { admin?: boolean }) {
  const content = (
    <Primitive.Positioner side="top" sideOffset={4} className="z-popup">
      <Primitive.Popup
        role="tooltip"
        data-slot="tooltip-content"
        className={cn(
          "max-w-xs rounded bg-foreground px-3 py-2 text-sm text-background shadow",
          className,
        )}
        {...props}
      />
    </Primitive.Positioner>
  );
  return (
    <Primitive.Portal>
      {admin ? <AdminThemeScope>{content}</AdminThemeScope> : content}
    </Primitive.Portal>
  );
}
export { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent };
