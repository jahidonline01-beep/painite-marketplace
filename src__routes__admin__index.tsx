import { createFileRoute } from "@tanstack/react-router";
import { AdminLogin } from "@/components/admin/admin-login";

export const Route = createFileRoute("/admin/")({ component: AdminLogin });
