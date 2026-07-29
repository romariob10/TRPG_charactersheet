import { AuthForm } from "@/components/auth-form";
import { AuthShell } from "@/components/auth-shell";
import { signUp } from "@/app/auth/actions";

export default function SignUpPage() {
  return <AuthShell><AuthForm mode="sign-up" action={signUp} /></AuthShell>;
}
