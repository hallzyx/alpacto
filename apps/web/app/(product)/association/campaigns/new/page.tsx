import { redirect } from "next/navigation";

/** Associations cannot create campaigns — only buyers can. */
export default function AssociationNewCampaignRedirect() {
  redirect("/association/campaigns");
}
