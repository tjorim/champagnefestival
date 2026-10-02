import { Tabs as Primitive } from "@base-ui/react/tabs";
import { cn } from "@/lib/utils";

function Tabs(props: Primitive.Root.Props) {
  return <Primitive.Root data-slot="tabs" {...props} />;
}
function TabsList({ className, ...props }: Primitive.List.Props) {
  return (
    <Primitive.List
      activateOnFocus
      data-slot="tabs-list"
      className={cn("flex flex-wrap", className)}
      {...props}
    />
  );
}
function TabsTrigger({ className, ...props }: Primitive.Tab.Props) {
  return (
    <Primitive.Tab
      data-slot="tabs-trigger"
      className={cn("focus-visible:outline-2 focus-visible:outline-ring", className)}
      {...props}
    />
  );
}
function TabsContent(props: Primitive.Panel.Props) {
  return <Primitive.Panel data-slot="tabs-content" {...props} />;
}
export { Tabs, TabsList, TabsTrigger, TabsContent };
