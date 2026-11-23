import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { m } from "@/paraglide/messages";
import AnnouncementManagement from "../shared/AnnouncementManagement";
import ComposerManagement from "../shared/ComposerManagement";

type AnnouncementsTab = "announcements" | "compose";

/**
 * One home for everything visitors are told: the in-app announcements, and the composer that
 * writes a message once and sends it to those announcements and/or Web Push.
 */
export default function AnnouncementsSection() {
  const [tab, setTab] = useState<AnnouncementsTab>("announcements");
  return (
    <Tabs value={tab} onValueChange={(value) => setTab(value as AnnouncementsTab)}>
      <TabsList variant="line" className="mb-5" aria-label={m.admin_announcements_section()}>
        <TabsTrigger value="announcements">{m.admin_announcements_section()}</TabsTrigger>
        <TabsTrigger value="compose">{m.admin_composer_section()}</TabsTrigger>
      </TabsList>
      <TabsContent value="announcements">
        <AnnouncementManagement />
      </TabsContent>
      <TabsContent value="compose">
        <ComposerManagement />
      </TabsContent>
    </Tabs>
  );
}
