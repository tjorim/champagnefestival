import { m } from "@/paraglide/messages";

export interface ManagedExhibitor {
  id: number;
  name: string;
  type: string;
  website: string;
  active: boolean;
}

export default function MyExhibitorsSection({ exhibitors }: { exhibitors: ManagedExhibitor[] }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-medium">{m.manager_title()}</h2>
      <ul>
        {exhibitors.map((row) => (
          <li key={row.id}>{row.name}</li>
        ))}
      </ul>
    </section>
  );
}
