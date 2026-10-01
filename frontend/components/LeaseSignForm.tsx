"use client";

import { useState } from "react";
import { Loader2, PenTool } from "lucide-react";

/**
 * Typed-name electronic signature. The server checks the name matches the
 * party's name on the lease and records time, IP and the lease fingerprint.
 */
export function LeaseSignForm({
  leaseId,
  expectedName,
  onSigned,
  submitLabel = "Sign lease",
}: {
  leaseId: string;
  expectedName: string;
  onSigned: () => void;
  submitLabel?: string;
}) {
  const [fullName, setFullName] = useState("");
  const [accept, setAccept] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSigning(true);
    setError(null);
    try {
      const res = await fetch(`/api/leases/${leaseId}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: fullName, accept }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Signing failed.");
      onSigned();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signing failed.");
    } finally {
      setIsSigning(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="signature-name" className="block text-sm font-medium mb-2">
          Type your full name to sign: <strong>{expectedName}</strong>
        </label>
        <input
          id="signature-name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          autoComplete="name"
          placeholder={expectedName}
          className="w-full px-4 py-3 rounded-md border border-input bg-background text-lg font-serif italic focus:outline-none focus:ring-2 focus:ring-brand"
          required
        />
      </div>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} className="mt-1" required />
        <span>
          I have read the full lease and agree to be bound by it. I understand that typing my name here is my electronic signature under the Electronic Communications and Transactions Act.
        </span>
      </label>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={isSigning || !accept || !fullName.trim()}
        className="bg-brand text-white px-6 py-3 rounded-md font-bold flex items-center gap-2 hover:bg-gold-600 transition-all disabled:opacity-50"
      >
        {isSigning ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenTool className="h-4 w-4" />}
        {submitLabel}
      </button>
    </form>
  );
}
