import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

// The workspace is the product; there is no intermediate landing page.
export default async function Home() {
  redirect((await getSession()) ? "/dashboard/feed" : "/auth/sign-in");
}
