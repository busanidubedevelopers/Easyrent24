"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, CreditCard, Loader2, Lock, XCircle } from "lucide-react";
import { DEMO_BANKS } from "@backend/lib/demoGateway";

interface PaymentInfo {
  reference: string;
  item_name: string | null;
  amount: number;
  status: "pending" | "complete" | "failed" | "cancelled";
  failure_reason: string | null;
  card_last4: string | null;
  attempts_left: number;
  return_url: string | null;
}

type FieldErrors = Partial<Record<"bank" | "card_number" | "expiry" | "cvv" | "cardholder", string>>;

const rand = (n: number) => `R${n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Groups card digits in fours as the shopper types. */
const formatCardNumber = (v: string) => v.replace(/\D/g, "").slice(0, 19).replace(/(\d{4})(?=\d)/g, "$1 ");
const formatExpiry = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
};

const inputClass =
  "w-full h-11 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand";

/**
 * EasyRent Pay checkout, used instead of PayFast when PAYMENT_PROVIDER=demo.
 * The prototype accepts FNB cards only; cards from other banks are declined.
 */
export default function CheckoutPage() {
  const { reference } = useParams<{ reference: string }>();
  const [payment, setPayment] = useState<PaymentInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [card, setCard] = useState({ bank: "", cardholder: "", card_number: "", expiry: "", cvv: "" });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [declined, setDeclined] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"pay" | "cancel" | null>(null);
  const [approved, setApproved] = useState(false);

  useEffect(() => {
    fetch(`/api/payments/demo/${encodeURIComponent(reference)}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Payment not found.");
        setPayment(body);
        if (body.status === "complete" && body.return_url) window.location.assign(body.return_url);
        if (body.status === "failed") setDeclined(body.failure_reason);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Payment not found."));
  }, [reference]);

  const pay = async (e: FormEvent) => {
    e.preventDefault();
    setBusy("pay");
    setFieldErrors({});
    setDeclined(null);
    setError(null);
    try {
      const res = await fetch(`/api/payments/demo/${encodeURIComponent(reference)}/charge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(card),
      });
      const body = await res.json().catch(() => ({}));
      if (body.outcome === "invalid") return setFieldErrors(body.errors ?? {});
      if (!res.ok) throw new Error(body.error || "The payment could not be processed.");
      if (body.outcome === "approved") {
        setApproved(true);
        setTimeout(() => window.location.assign(body.return_url), 1500);
        return;
      }
      setDeclined(body.reason);
      setPayment((p) => (p ? { ...p, attempts_left: body.attempts_left } : p));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The payment could not be processed.");
    } finally {
      setBusy(null);
    }
  };

  const cancel = async () => {
    setBusy("cancel");
    const res = await fetch(`/api/payments/demo/${encodeURIComponent(reference)}/cancel`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    window.location.assign(body.cancel_url || "/");
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-4 flex items-center justify-between text-sm">
          <span className="font-bold text-lg tracking-tight">
            EasyRent <span className="text-brand">Pay</span>
          </span>
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Lock className="h-3.5 w-3.5" /> Secure checkout
          </span>
        </div>

        <div className="rounded-2xl border border-border bg-card shadow-lg overflow-hidden">
          <div className="rounded-none bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 px-5 py-2 text-xs font-medium">
            Prototype payment. No real money is taken.
          </div>

          {loadError ? (
            <div className="p-8 text-center">
              <XCircle className="mx-auto h-10 w-10 text-red-500 mb-3" />
              <p className="font-semibold">{loadError}</p>
            </div>
          ) : !payment ? (
            <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : approved ? (
            <div className="p-8 text-center" data-testid="demo-pay-approved">
              <CheckCircle2 className="mx-auto h-14 w-14 text-green-600 mb-3" />
              <h1 className="text-xl font-bold">Payment approved</h1>
              <p className="text-sm text-muted-foreground mt-1">{rand(payment.amount)} paid. Taking you back to EasyRent…</p>
            </div>
          ) : payment.status === "cancelled" ? (
            <div className="p-8 text-center">
              <p className="font-semibold">This payment was cancelled.</p>
              <p className="text-sm text-muted-foreground mt-1">Start the payment again from EasyRent.</p>
            </div>
          ) : (
            <form onSubmit={pay} className="p-6 space-y-4" noValidate>
              <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Paying for</p>
                  <p className="font-semibold">{payment.item_name ?? "EasyRent24 payment"}</p>
                  <p className="text-xs text-muted-foreground font-mono mt-1 break-all">{payment.reference}</p>
                </div>
                <p className="text-2xl font-bold whitespace-nowrap">{rand(payment.amount)}</p>
              </div>

              {declined && (
                <div role="alert" data-testid="demo-pay-declined" className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-3 text-sm text-red-700 dark:text-red-300">
                  <p className="font-semibold flex items-center gap-2"><XCircle className="h-4 w-4" /> Payment declined</p>
                  <p>{declined}.</p>
                  <p className="text-xs mt-1 opacity-80">{payment.attempts_left} attempt{payment.attempts_left === 1 ? "" : "s"} left</p>
                </div>
              )}
              {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}

              <label className="block text-sm font-medium">
                Card issued by
                <select
                  name="bank"
                  className={`${inputClass} mt-1`}
                  value={card.bank}
                  onChange={(e) => setCard({ ...card, bank: e.target.value })}
                >
                  <option value="" disabled>Select your bank</option>
                  {DEMO_BANKS.map((b) => (
                    <option key={b.key} value={b.key}>{b.label}</option>
                  ))}
                </select>
                {fieldErrors.bank && <span className="text-xs text-red-600">{fieldErrors.bank}</span>}
              </label>

              <label className="block text-sm font-medium">
                Name on card
                <input
                  name="cardholder"
                  autoComplete="cc-name"
                  className={`${inputClass} mt-1`}
                  value={card.cardholder}
                  onChange={(e) => setCard({ ...card, cardholder: e.target.value })}
                />
                {fieldErrors.cardholder && <span className="text-xs text-red-600">{fieldErrors.cardholder}</span>}
              </label>

              <label className="block text-sm font-medium">
                Card number
                <div className="relative mt-1">
                  <input
                    name="card_number"
                    inputMode="numeric"
                    autoComplete="cc-number"
                    placeholder="1234 5678 9012 3456"
                    className={`${inputClass} pr-10 font-mono`}
                    value={card.card_number}
                    onChange={(e) => setCard({ ...card, card_number: formatCardNumber(e.target.value) })}
                  />
                  <CreditCard className="absolute right-3 top-3 h-5 w-5 text-muted-foreground" />
                </div>
                {fieldErrors.card_number && <span className="text-xs text-red-600">{fieldErrors.card_number}</span>}
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm font-medium">
                  Expiry
                  <input
                    name="expiry"
                    inputMode="numeric"
                    autoComplete="cc-exp"
                    placeholder="MM/YY"
                    className={`${inputClass} mt-1 font-mono`}
                    value={card.expiry}
                    onChange={(e) => setCard({ ...card, expiry: formatExpiry(e.target.value) })}
                  />
                  {fieldErrors.expiry && <span className="text-xs text-red-600">{fieldErrors.expiry}</span>}
                </label>
                <label className="block text-sm font-medium">
                  CVV
                  <input
                    name="cvv"
                    inputMode="numeric"
                    autoComplete="cc-csc"
                    placeholder="123"
                    className={`${inputClass} mt-1 font-mono`}
                    value={card.cvv}
                    onChange={(e) => setCard({ ...card, cvv: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                  />
                  {fieldErrors.cvv && <span className="text-xs text-red-600">{fieldErrors.cvv}</span>}
                </label>
              </div>

              <button
                type="submit"
                disabled={busy !== null || payment.attempts_left === 0}
                className="w-full inline-flex h-11 items-center justify-center gap-2 rounded-md bg-brand px-6 text-sm font-medium text-white hover:bg-gold-600 transition-colors disabled:opacity-50"
              >
                {busy === "pay" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                {busy === "pay" ? "Processing…" : `Pay ${rand(payment.amount)}`}
              </button>
              <button
                type="button"
                onClick={cancel}
                disabled={busy !== null}
                className="w-full text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                Cancel and return to EasyRent
              </button>

              <p className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
                Prototype: only <strong>FNB</strong> cards are accepted. Cards from other banks are declined.
                Test card: <span className="font-mono">4242 4242 4242 4242</span>, any future expiry, any CVV.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
