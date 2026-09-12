import { createFileRoute } from "@tanstack/react-router";
import { AuthStage } from "@/components/auth/auth-stage";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <AuthStage mode="login" />;
}
