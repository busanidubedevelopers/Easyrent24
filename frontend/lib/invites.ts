export interface ClaimedInvite {
  status: "registered" | "paid";
  admin_fee_amount: number;
  property_id: string | null;
  property: { title: string; address: string } | null;
}

/**
 * Claims the invite for the signed-in tenant (idempotent), returning its
 * current state. Used by the admin fee page, and by the payment-success page
 * to poll until PayFast's ITN has marked the invite paid.
 */
export async function claimInvite(
  token: string
): Promise<{ invite?: ClaimedInvite; error?: string; unauthenticated?: boolean }> {
  const res = await fetch(`/api/invites/${encodeURIComponent(token)}/claim`, { method: "POST" });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) return { unauthenticated: true };
  if (!res.ok) return { error: data.error || "Could not load your registration." };
  return { invite: data.invite };
}
