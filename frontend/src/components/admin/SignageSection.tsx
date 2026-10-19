import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { m } from "@/paraglide/messages";
import SignageChannels from "./SignageChannels";
import SignageTemplates from "./SignageTemplates";

export default function SignageSection({
  authHeaders,
}: {
  authHeaders: () => Record<string, string>;
}) {
  const [tab, setTab] = useState("channels");
  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList variant="pills" className="mb-4">
        <TabsTrigger value="channels">{m.signage_channels_heading()}</TabsTrigger>
        <TabsTrigger value="templates">{m.signage_editor_heading()}</TabsTrigger>
      </TabsList>
      <TabsContent value="channels">
        <SignageChannels authHeaders={authHeaders} />
      </TabsContent>
      <TabsContent value="templates">
        <SignageTemplates authHeaders={authHeaders} />
      </TabsContent>
    </Tabs>
  );
}
