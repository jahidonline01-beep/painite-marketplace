import type { DeskId } from "@/lib/desks";
import { FacebookIcon, LeadIcon, PostIcon, RentIcon } from "./desk-icons";

const COPY: Record<DeskId, { title: string; Icon: typeof RentIcon }> = {
  rent: { title: "Rent", Icon: RentIcon },
  post: { title: "Post", Icon: PostIcon },
  facebook: { title: "Facebook", Icon: FacebookIcon },
  lead: { title: "Lead", Icon: LeadIcon },
};

export function ColorDesk({ desk }: { desk: Exclude<DeskId, "facebook"> }) {
  const { title, Icon } = COPY[desk];
  return (
    <section className={`color-desk color-desk--${desk}`}>
      <span className="color-desk__orb">
        <Icon />
      </span>
      <h2 className="color-desk__title">{title}</h2>
    </section>
  );
}
