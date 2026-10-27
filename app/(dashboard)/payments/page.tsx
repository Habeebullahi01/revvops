"use client";

import { useState, useEffect } from "react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { formatNaira } from "@/lib/money";

export default function PaymentsPage() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [method, setMethod] = useState("");

  useEffect(() => {
    async function fetchPayments() {
      const supabase = await createClient();
      let q = query ? "%22 + query + %22" : "";
      let m = method && method in ["cash", "transfer", "card", "other"] ? method : "";
      let req = supabase
        .from("payments")
        .select("id, receipt_number, invoice_id, job_order_id, amount, payment_method, reference_number, notes, created_at, invoice ( customer_id )", { count: "exact" })
        .order("created_at", { ascending: false });
      if (q) {
        req = req.ilike("receipt_number", q);
        req = req.ilike("reference_number", q);
      }
      if (m) {
        req = req.eq("payment_method", m);
      }
      const { data, error } = await req;
      if (!error) setPayments(data ?? []);
      setLoading(false);
    }
    fetchPayments();
  }, [query, method]);

  const total = payments.length;
  const paidAmounts = payments.reduce(
    (sum, p) => sum + Number(p.amount || 0),
    0,
  );

  const methodCounts = { cash: 0, transfer: 0, card: 0, other: 0 };
  for (const p of payments) {
    if (p.payment_method in methodCounts) {
      methodCounts[p.payment_method]++;
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          placeholder="Receipt number, reference, or customer name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-10 rounded-lg border border-input placeholder-text-sm text-sm"
        />
        <Input
          type="text"
          placeholder="cash / transfer / card / other"
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          className="h-10 rounded-lg border border-input placeholder-text-sm text-sm"
        />
        <Button
          onClick={() => setQuery("")}
          variant="outline"
          className={buttonVariants({ size: "sm" })}>Clear
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Payments ({total})</CardTitle>
          <CardDescription>
            {paidAmounts.toLocaleString("en-NG", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })} collected {formatNaira(paidAmounts)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments found.</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {total} payment{total !== 1 && "s"} found. <a href="/invoices" className="underline text-primary">View invoices</a>
            </p>
          )}
        </CardContent>
      </Card>

      {paidAmounts > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Payment summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <div>
                <p className="text-sm text-muted-foreground">Total collected</p>
                <p className="text-xl font-semibold tabular-nums">
                  {formatNaira(paidAmounts)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">By method</p>
                <p className="text-sm font-medium">
                  {methodCounts.cash} cash · {methodCounts.transfer} transfer ·
                  {methodCounts.card} card · {methodCounts.other} other
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
