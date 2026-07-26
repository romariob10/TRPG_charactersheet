import { AuthForm } from "@/components/auth-form";
import { AuthShell } from "@/components/auth-shell";
import { requestPasswordReset } from "@/app/auth/actions";

export default function ResetPasswordPage() {
  return <AuthShell><AuthForm mode="reset" action={requestPasswordReset} /></AuthShell>;
}
