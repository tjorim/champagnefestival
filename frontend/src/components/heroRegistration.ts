/** What a themed hero shows beyond its title: the visitor's way in. See `App` in main.tsx. */
export interface HeroRegistrationProps {
  /** Date range and venue, repeated here so small screens see them without scrolling. */
  facts?: string[];
  /** Shown as the second action, in place of the schedule link, while registration is open. */
  registration?: { label: string; onRegister: () => void };
  /** Shown under the buttons, for example when registrations open. */
  note?: string | null;
}
