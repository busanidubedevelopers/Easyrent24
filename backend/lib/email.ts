import type { LeaseParties } from './lease';

// ============================================================================
// Transactional email
//
// Sent through Resend's HTTP API (https://resend.com/docs/api-reference/emails/send-email)
// when RESEND_API_KEY is set. Without it, emails are skipped with a log line
// so local dev and demos work without a provider — in-app notifications and
// the copyable links still cover every flow.
//
// Email is best-effort: a failed send is logged and never fails the action
// that triggered it (the invite is created, the lease is still signed).
// ============================================================================

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Returns true if the email was accepted by the provider. */
export async function sendEmail(message: EmailMessage): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    console.info(`email skipped (RESEND_API_KEY/EMAIL_FROM not set): "${message.subject}"`);
    return false;
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [message.to], subject: message.subject, text: message.text, html: message.html }),
    });
    if (!res.ok) {
      // Never log the recipient or body — both are personal information.
      console.error(`email send failed: HTTP ${res.status} for "${message.subject}"`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`email send failed for "${message.subject}":`, err instanceof Error ? err.message : err);
    return false;
  }
}

/** One simple, readable layout for every email: paragraphs plus an optional button. */
function layout(paragraphs: string[], action?: { label: string; url: string }): { text: string; html: string } {
  const text = [...paragraphs, ...(action ? [`${action.label}: ${action.url}`] : []), '— EasyRent24'].join('\n\n');
  const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;line-height:1.5;max-width:560px;margin:0 auto;padding:24px">
${paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('\n')}
${action ? `<p style="margin:28px 0"><a href="${escapeHtml(action.url)}" style="background:#4f46e5;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:bold">${escapeHtml(action.label)}</a></p><p style="font-size:12px;color:#6b7280">Or open this link: ${escapeHtml(action.url)}</p>` : ''}
<p style="color:#6b7280">— EasyRent24</p>
</body></html>`;
  return { text, html };
}

const rand = (n: number) => `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/ /g, ' ')}`;

export function inviteEmail(params: {
  to: string;
  inviteeName: string;
  inviterName: string | null;
  property: { title: string; address: string };
  adminFee: number;
  link: string;
}): EmailMessage {
  const who = params.inviterName ?? 'Your agent or landlord';
  return {
    to: params.to,
    subject: `Register to apply for ${params.property.title}`,
    ...layout(
      [
        `Hi ${params.inviteeName},`,
        `${who} has invited you to apply for ${params.property.title}, ${params.property.address}.`,
        `Create your EasyRent24 account with the link below and pay the once-off admin fee of ${rand(params.adminFee)} via PayFast. You can then complete your rental application.`,
        'This link is personal to your email address and expires in 14 days.',
      ],
      { label: 'Create my account', url: params.link }
    ),
  };
}

export function leaseSentEmail(to: string, parties: LeaseParties, link: string): EmailMessage {
  return {
    to,
    subject: `Your lease for ${parties.property.title} is ready to sign`,
    ...layout(
      [
        `Hi ${parties.tenant.name},`,
        `Good news — your application for ${parties.property.title} has been approved. ${parties.landlord.name} has sent you the lease to review and sign.`,
      ],
      { label: 'Review and sign', url: link }
    ),
  };
}

export function leaseTenantSignedEmail(to: string, parties: LeaseParties, link: string): EmailMessage {
  return {
    to,
    subject: `${parties.tenant.name} signed the lease for ${parties.property.title}`,
    ...layout(
      [`${parties.tenant.name} has signed the lease for ${parties.property.title}. Countersign it to finalise the agreement.`],
      { label: 'Countersign', url: link }
    ),
  };
}

export function leaseExecutedEmail(to: string, recipientName: string, parties: LeaseParties, link: string): EmailMessage {
  return {
    to,
    subject: `Lease signed: ${parties.property.title}`,
    ...layout(
      [
        `Hi ${recipientName},`,
        `The lease for ${parties.property.title} has been signed by both ${parties.tenant.name} and ${parties.landlord.name}. You can download the signed copy at any time.`,
      ],
      { label: 'Download signed lease', url: link }
    ),
  };
}

export function leaseCancelledEmail(to: string, parties: LeaseParties): EmailMessage {
  return {
    to,
    subject: `Lease withdrawn: ${parties.property.title}`,
    ...layout([
      `Hi ${parties.tenant.name},`,
      `The lease for ${parties.property.title} has been withdrawn by ${parties.landlord.name}, and any signature on it is void. If a revised lease is issued you will receive a new email.`,
    ]),
  };
}

export function accountDecisionEmail(params: {
  to: string;
  name: string;
  approved: boolean;
  reason?: string | null;
  signInUrl: string;
}): EmailMessage {
  if (params.approved) {
    return {
      to: params.to,
      subject: 'Your EasyRent24 account is approved',
      ...layout(
        [`Hi ${params.name},`, 'Your EasyRent24 account has been approved. You can now sign in, list properties and invite tenants.'],
        { label: 'Sign in', url: params.signInUrl }
      ),
    };
  }
  return {
    to: params.to,
    subject: 'Your EasyRent24 account application',
    ...layout([
      `Hi ${params.name},`,
      `Your EasyRent24 account was not approved.${params.reason ? ` Reason: ${params.reason}` : ''}`,
      'If you think this is a mistake, reply to this email.',
    ]),
  };
}
