import { redirect } from "next/navigation";
import { getSignInUrl } from "@workos-inc/authkit-nextjs";

export async function GET() {
  if (process.env.MOCK_AUTH === "true") {
    redirect("/dashboard");
  }
  const url = await getSignInUrl();
  redirect(url);
}
