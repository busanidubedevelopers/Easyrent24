import { describe, it, expect } from 'vitest';
import { approvalBlockMessage, needsApproval } from '../lib/auth';

describe('account approval', () => {
  it('requires approval for landlords and agents only', () => {
    expect(needsApproval('landlord')).toBe(true);
    expect(needsApproval('tenant')).toBe(false);
    expect(needsApproval('handyman')).toBe(false);
    expect(needsApproval('admin')).toBe(false);
  });

  it('lets approved accounts (and older rows without a status) sign in', () => {
    expect(approvalBlockMessage('approved')).toBeNull();
    expect(approvalBlockMessage(null)).toBeNull();
  });

  it('blocks pending and rejected accounts with a clear message', () => {
    expect(approvalBlockMessage('pending')).toMatch(/awaiting approval/);
    expect(approvalBlockMessage('rejected', 'Could not verify PPRA registration')).toMatch(
      /not approved.*Reason: Could not verify PPRA registration/
    );
  });
});
