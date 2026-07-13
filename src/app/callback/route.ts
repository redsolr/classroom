import { handleAuth } from "@workos-inc/authkit-nextjs";

// Standard AuthKit callback: exchanges the code, sets the session cookie,
// then lands the teacher on the dashboard.
export const GET = handleAuth({ returnPathname: "/dashboard" });
