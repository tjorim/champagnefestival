import { useState } from "react";
import { LayoutTemplateIcon, MonitorIcon } from "lucide-react";
import { Icon } from "@/components/Icon";
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
      <TabsList variant="line" className="mb-5" aria-label={m.signage_channels_heading()}>
        <TabsTrigger value="channels">
          <Icon icon={MonitorIcon} />
          {m.signage_tab_channels()}
        </TabsTrigger>
        <TabsTrigger value="templates">
          <Icon icon={LayoutTemplateIcon} />
          {m.signage_tab_templates()}
        </TabsTrigger>
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
