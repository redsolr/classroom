import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAccount } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  const account = await getAccount();
  if (account) redirect(account.kind === "student" ? "/student" : "/schedule");
  return <LoginForm />;
}
