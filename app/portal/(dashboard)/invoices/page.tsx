import { redirect } from "next/navigation";
import { firstParam, type SearchParamsObj } from "@/lib/admin/url";

// Folded into The Hub (/portal) as a tab. Kept so old links still land.
export default function Redirect({ searchParams }: { searchParams: SearchParamsObj }) {
  const plan = firstParam(searchParams.plan);
  const kind = firstParam(searchParams.kind);
  redirect(`/portal?tab=invoices${plan ? `&plan=${encodeURIComponent(plan)}` : ""}${kind ? `&kind=${encodeURIComponent(kind)}` : ""}`);
}
