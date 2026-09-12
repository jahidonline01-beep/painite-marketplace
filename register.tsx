import { createFileRoute } from "@tanstack/react-router";
import { AuthStage } from "@/components/auth/auth-stage";

export const Route = createFileRoute("/register")({ component: Register });

function Register() {
  return <AuthStage mode="register" />;
}
