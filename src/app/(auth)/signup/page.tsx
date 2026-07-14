import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAccount } from "@/lib/auth";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Sign up" };

export default async function SignupPage() {
  const account = await getAccount();
  if (account) redirect(account.kind === "student" ? "/student" : "/schedule");
  return <SignupForm />;
}
