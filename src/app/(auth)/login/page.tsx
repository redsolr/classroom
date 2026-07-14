import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTeacher } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  const teacher = await getTeacher();
  if (teacher) redirect("/schedule");
  return <LoginForm />;
}
