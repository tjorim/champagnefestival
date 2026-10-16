import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { m } from "@/paraglide/messages";
import AnnouncementManagement from "./AnnouncementManagement";
import SignageTemplates from "./SignageTemplates";
import ComposerManagement from "./ComposerManagement";

interface AnnouncementsSectionProps {
  authHeaders: () => Record<string, string>;
}

type AnnouncementsTab = "announcements" | "compose" | "signage";

/**
 * One home for everything visitors are told: the in-app announcements, and the composer that
 * writes a message once and sends it to those announcements and/or Web Push.
 */
export default function AnnouncementsSection({ authHeaders }: AnnouncementsSectionProps) {
  const [tab, setTab] = useState<AnnouncementsTab>("announcements");
  return (
    <Tabs value={tab} onValueChange={(value) => setTab(value as AnnouncementsTab)}>
      <TabsList variant="pills" className="mb-4">
        <TabsTrigger value="announcements">{m.admin_announcements_section()}</TabsTrigger>
        <TabsTrigger value="compose">{m.admin_composer_section()}</TabsTrigger>
        <TabsTrigger value="signage">{m.signage_editor_heading()}</TabsTrigger>
      </TabsList>
      <TabsContent value="announcements">
        <AnnouncementManagement authHeaders={authHeaders} />
      </TabsContent>
      <TabsContent value="signage">
        <SignageTemplates authHeaders={authHeaders} />
      </TabsContent>
      <TabsContent value="compose">
        <ComposerManagement authHeaders={authHeaders} />
      </TabsContent>
    </Tabs>
  );
}
