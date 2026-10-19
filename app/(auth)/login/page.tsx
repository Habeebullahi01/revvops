import { redirect } from "next/navigation";
import { connection } from "next/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { signOutAction } from "@/app/actions/auth";
import { LoginForm } from "./login-form";

// Reads the session cookie + searchParams → must render at request time.
export const instant = false;

const MESSAGES: Record<string, string> = {
  not_provisioned:
    "Your account exists but has no role yet. Ask the administrator to set up your profile.",
  inactive:
    "Your account has been deactivated. Please contact the administrator.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  const errorKey =
    typeof error === "string" && error in MESSAGES ? error : undefined;
  const nextPath = typeof next === "string" ? next : undefined;

  // Session check is request-time work (Supabase reads Date.now()).
  await connection();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Already signed in with nothing to report → send into the app.
  // (Deliberately does NOT redirect when an error is present — that would
  // bounce between "/" and this page for unprovisioned accounts.)
  if (user && !errorKey) redirect("/");

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Workshop Management System</CardTitle>
        <CardDescription>Sign in to your account</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {errorKey ? (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-destructive">
              {MESSAGES[errorKey]}
            </p>
            <form action={signOutAction}>
              <Button type="submit" variant="outline" className="w-full">
                Sign out
              </Button>
            </form>
          </div>
        ) : (
          <LoginForm next={nextPath} />
        )}
      </CardContent>
    </Card>
  );
}
