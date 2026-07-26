import { AuthForm } from "@/components/auth-form";
import { AuthShell } from "@/components/auth-shell";
import { signIn } from "@/app/auth/actions";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <AuthShell><AuthForm mode="sign-in" action={signIn} next={next} /></AuthShell>;
}
