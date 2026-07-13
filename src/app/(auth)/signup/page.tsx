import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTeacher } from "@/lib/auth";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Sign up" };

export default async function SignupPage() {
  const teacher = await getTeacher();
  if (teacher) redirect("/dashboard");
  return <SignupForm />;
}
