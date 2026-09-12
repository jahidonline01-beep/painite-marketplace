import { PainiteMark } from "@/components/brand/painite-mark";
import { MemberStats } from "./member-notices";
import { MemberIdentity } from "./member-identity";

export function MemberHeader() {
  return (
    <header className="member-top">
      <div className="member-brand">
        <PainiteMark />
        <div className="min-w-0">
          <p className="member-brand__kicker">Painite</p>
          <h1 className="member-brand__title">Marketplace</h1>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <MemberStats />
        <MemberIdentity />
      </div>
    </header>
  );
}