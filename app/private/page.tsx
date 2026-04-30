import { redirect } from "next/navigation";
import { getUser, isAdminEmail } from "@/lib/auth";
import PrivateStatsView from "./PrivateStatsView";

export default async function PrivatePage() {
  const user = await getUser();
  if (!user) redirect("/login?redirect=/private");
  if (!isAdminEmail(user.email)) redirect("/");

  return <PrivateStatsView />;
}
