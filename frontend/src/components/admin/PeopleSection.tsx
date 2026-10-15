import { useState, type ComponentProps } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { m } from "@/paraglide/messages";
import MembersManagement from "./MembersManagement";
import PeopleManagement from "./PeopleManagement";
import VolunteersManagement from "./VolunteersManagement";

type PeopleTab = "all" | "members" | "volunteers";

interface PeopleSectionProps {
  authHeaders: () => Record<string, string>;
  counts: { all: number; members: number; volunteers: number };
  people: Omit<ComponentProps<typeof PeopleManagement>, "authHeaders">;
  members: Omit<ComponentProps<typeof MembersManagement>, "authHeaders">;
  volunteers: Omit<ComponentProps<typeof VolunteersManagement>, "authHeaders">;
}

/**
 * Everyone the festival knows, as one list with two role-filtered views of it. The tabs carry the
 * counts, so the sidebar needs a single People entry.
 */
export default function PeopleSection({
  authHeaders,
  counts,
  people,
  members,
  volunteers,
}: PeopleSectionProps) {
  const [tab, setTab] = useState<PeopleTab>("all");
  return (
    <Tabs value={tab} onValueChange={(value) => setTab(value as PeopleTab)}>
      <TabsList variant="pills" className="mb-4" aria-label={m.admin_people_tab()}>
        <TabsTrigger value="all">
          {m.admin_directory_tab()} ({counts.all})
        </TabsTrigger>
        <TabsTrigger value="members">
          {m.admin_members_tab()} ({counts.members})
        </TabsTrigger>
        <TabsTrigger value="volunteers">
          {m.admin_volunteers_tab()} ({counts.volunteers})
        </TabsTrigger>
      </TabsList>
      <TabsContent value="all">
        <PeopleManagement authHeaders={authHeaders} {...people} />
      </TabsContent>
      <TabsContent value="members">
        <MembersManagement authHeaders={authHeaders} {...members} />
      </TabsContent>
      <TabsContent value="volunteers">
        <VolunteersManagement authHeaders={authHeaders} {...volunteers} />
      </TabsContent>
    </Tabs>
  );
}
