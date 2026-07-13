import { redirect } from "next/navigation";
import { signOut } from "@workos-inc/authkit-nextjs";

export async function GET() {
  if (process.env.MOCK_AUTH === "true") {
    redirect("/");
  }
  await signOut({ returnTo: process.env.NEXT_PUBLIC_APP_URL ?? "/" });
}
