import type { DeskId } from "@/lib/desks";
import { cn } from "@/lib/utils";
import { FacebookIcon, LeadIcon, PostIcon, RentIcon } from "./desk-icons";

const ITEMS: { id: DeskId; label: string; Icon: typeof RentIcon }[] = [
  { id: "rent", label: "Rent", Icon: RentIcon },
  { id: "post", label: "Post", Icon: PostIcon },
  { id: "facebook", label: "Facebook", Icon: FacebookIcon },
  { id: "lead", label: "Lead", Icon: LeadIcon },
];

export function MemberNav({
  desk,
  onDesk,
  locked,
}: {
  desk: DeskId;
  onDesk: (id: DeskId) => void;
  locked?: boolean;
}) {
  return (
    <nav className={cn("member-nav", locked && "is-locked")} aria-label="Desks">
      {ITEMS.map((item) => (
        <button
          key={item.id}
          type="button"
          data-desk={item.id}
          disabled={locked}
          className={cn("member-nav__btn", desk === item.id && !locked && "is-active")}
          onClick={() => {
            if (!locked) onDesk(item.id);
          }}
        >
          <item.Icon />
          <span className="desk-label">{item.label}</span>
          <span className="desk-lamp" aria-hidden="true" />
        </button>
      ))}
    </nav>
  );
}
