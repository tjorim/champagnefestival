import { createContext, useContext } from "react";
import { Tabs as Primitive } from "@base-ui/react/tabs";
import { cn } from "@/lib/utils";

/**
 * `default` is unstyled apart from layout (runtime themes style it, e.g. the public Schedule);
 * `pills` is a set of bordered, button-like tabs whose active tab takes the primary colour.
 */
type TabsVariant = "default" | "pills";

const TabsVariantContext = createContext<TabsVariant>("default");

function Tabs(props: Primitive.Root.Props) {
  return <Primitive.Root data-slot="tabs" {...props} />;
}
function TabsList({
  className,
  variant = "default",
  ...props
}: Primitive.List.Props & { variant?: TabsVariant }) {
  return (
    <TabsVariantContext.Provider value={variant}>
      <Primitive.List
        activateOnFocus
        data-slot="tabs-list"
        data-variant={variant}
        className={cn("flex flex-wrap", variant === "pills" && "gap-2", className)}
        {...props}
      />
    </TabsVariantContext.Provider>
  );
}
function TabsTrigger({ className, ...props }: Primitive.Tab.Props) {
  const variant = useContext(TabsVariantContext);
  return (
    <Primitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "focus-visible:outline-2 focus-visible:outline-ring",
        variant === "pills" &&
          "rounded-md border border-border bg-muted px-3.5 py-1.5 font-medium text-foreground data-active:border-transparent data-active:bg-primary data-active:text-primary-foreground",
        className,
      )}
      {...props}
    />
  );
}
function TabsContent(props: Primitive.Panel.Props) {
  return <Primitive.Panel data-slot="tabs-content" {...props} />;
}
export { Tabs, TabsList, TabsTrigger, TabsContent };
