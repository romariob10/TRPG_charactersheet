import { AuthForm } from "@/components/auth-form";
import { AuthShell } from "@/components/auth-shell";
import { updatePassword } from "@/app/auth/actions";

export default function UpdatePasswordPage() {
  return <AuthShell><AuthForm mode="update" action={updatePassword} /></AuthShell>;
}
