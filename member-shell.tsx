import { useEffect, useState } from "react";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { touchCloudMember } from "@/lib/cloud";
import { watchMemberLock } from "@/lib/member-ops";
import { getLocalMember, hydrateLocalMember } from "@/lib/app-core";
import { UpdateWall, useVersionGate } from "@/components/update-gate";
import { cn } from "@/lib/utils";
import { type DeskId, readDesk, writeDesk } from "@/lib/desks";
import { getDesktop } from "@/lib/desktop";
import { FacebookDesk } from "./facebook-desk";
import { LeadDesk } from "./lead-desk";
import { MemberHeader } from "./member-header";
import { MemberNav } from "./member-nav";
import { MemberNotices } from "./member-notices";
import { PostDesk } from "./post-desk";
import { RentDesk } from "./rent-desk";
import { RobotEngine } from "./robot-engine";

export function MemberShell() {
  const { user, isPending } = useCurrentUserState();
  const local = getLocalMember();
  const member = user ?? (local
    ? {
        id: local.id,
        displayName: local.displayName,
        primaryEmail: local.primaryEmail,
        profileImageUrl: null,
        isDevFallback: false,
      }
    : null);
  const [desk, setDesk] = useState<DeskId>(readDesk);
  const [stopped, setStopped] = useState(false);
  const [hydrated, setHydrated] = useState(() => Boolean(getLocalMember()?.id));
  const gate = useVersionGate();

  useEffect(() => {
    if (hydrated) return;
    void hydrateLocalMember().finally(() => setHydrated(true));
  }, [hydrated]);

  useEffect(() => {
    if (!member) return;
    void touchCloudMember().catch(() => {});
    const phone = local?.phone;
    if (!phone) return;
    return watchMemberLock(phone, setStopped);
  }, [member, local?.phone]);

  useEffect(() => {
    return () => {
      const api = getDesktop();
      void api?.hideRent();
      void api?.hideFacebook();
    };
  }, []);

  useEffect(() => {
    if (!stopped) return;
    const api = getDesktop();
    void api?.hideRent();
    void api?.hideFacebook();
  }, [stopped]);

  function onDesk(next: DeskId) {
    const api = getDesktop();
    if (next !== "rent") void api?.hideRent();
    if (next !== "facebook") void api?.hideFacebook();
    setDesk(next);
    writeDesk(next);
  }

  useEffect(() => {
    function onOpen() {
      onDesk("facebook");
    }
    window.addEventListener("painite:open-facebook", onOpen);
    return () => window.removeEventListener("painite:open-facebook", onOpen);
  }, []);

  if (!member && (isPending || !hydrated)) {
    return (
      <div className="member-app">
        <div className="member-top">
          <div className="h-10 w-48 rounded-md bg-surface" />
          <div className="h-11 w-40 rounded-xl bg-surface" />
        </div>
        <div className="member-nav">
          <div className="h-14 rounded-xl bg-surface" />
          <div className="h-14 rounded-xl bg-surface" />
          <div className="h-14 rounded-xl bg-surface" />
          <div className="h-14 rounded-xl bg-surface" />
        </div>
      </div>
    );
  }

  if (!member) return <RedirectToSignIn to="/login" />;
  if (gate?.blocked) return <UpdateWall gate={gate} />;

  return (
    <div className={cn("member-app is-webview", stopped && "is-locked")}>
      <MemberHeader />
      <MemberNotices />
      <MemberNav desk={desk} onDesk={onDesk} locked={stopped} />
      {stopped ? (
        <p className="member-lock">Work is stopped</p>
      ) : (
        <>
          <RobotEngine />
          <div className="member-stage">
            <div className={deskLayer(desk, "rent")}>
              <RentDesk visible={desk === "rent"} />
            </div>
            <div className={deskLayer(desk, "post")}>
              <PostDesk visible={desk === "post"} />
            </div>
            <div className={deskLayer(desk, "facebook")}>
              <FacebookDesk visible={desk === "facebook"} />
            </div>
            <div className={deskLayer(desk, "lead")}>
              <LeadDesk visible={desk === "lead"} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function deskLayer(active: DeskId, id: DeskId) {
  return `desk-layer${active === id ? " is-on" : ""}`;
}
