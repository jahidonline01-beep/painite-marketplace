import { createFileRoute } from "@tanstack/react-router";
import { AuthStage } from "@/components/auth/auth-stage";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  return <AuthStage mode="login" />;
}
