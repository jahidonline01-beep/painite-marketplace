import { createFileRoute } from "@tanstack/react-router";
import { MemberShell } from "@/components/member/member-shell";

export const Route = createFileRoute("/market")({ component: MemberShell });
