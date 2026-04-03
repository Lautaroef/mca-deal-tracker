"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LoaderCircleIcon } from "lucide-react";

interface DealFormData {
  merchantName: string;
  merchantEmail?: string;
  merchantPhone?: string;
  requestedAmount: number;
  notes?: string;
  assignedUserId?: string;
}

interface DealFormProps {
  mode: "create" | "edit";
  defaultValues?: Partial<DealFormData & { requestedAmount: number | string }>;
  onSubmit: (data: DealFormData) => void;
  isSubmitting?: boolean;
}

export function DealForm({
  mode,
  defaultValues,
  onSubmit,
  isSubmitting,
}: DealFormProps) {
  const [merchantName, setMerchantName] = useState(
    defaultValues?.merchantName ?? "",
  );
  const [merchantEmail, setMerchantEmail] = useState(
    defaultValues?.merchantEmail ?? "",
  );
  const [merchantPhone, setMerchantPhone] = useState(
    defaultValues?.merchantPhone ?? "",
  );
  const [requestedAmount, setRequestedAmount] = useState(
    defaultValues?.requestedAmount != null
      ? String(defaultValues.requestedAmount)
      : "",
  );
  const [notes, setNotes] = useState(defaultValues?.notes ?? "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const amount = parseFloat(requestedAmount);
    if (!merchantName.trim()) return;
    if (isNaN(amount) || amount <= 0) return;

    onSubmit({
      merchantName: merchantName.trim(),
      merchantEmail: merchantEmail.trim() || undefined,
      merchantPhone: merchantPhone.trim() || undefined,
      requestedAmount: amount,
      notes: notes.trim() || undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="merchantName">Merchant Name *</Label>
        <Input
          id="merchantName"
          value={merchantName}
          onChange={(e) => setMerchantName(e.target.value)}
          placeholder="e.g. Joe's Pizza"
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="merchantEmail">Email</Label>
        <Input
          id="merchantEmail"
          type="email"
          value={merchantEmail}
          onChange={(e) => setMerchantEmail(e.target.value)}
          placeholder="merchant@example.com"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="merchantPhone">Phone</Label>
        <Input
          id="merchantPhone"
          value={merchantPhone}
          onChange={(e) => setMerchantPhone(e.target.value)}
          placeholder="(555) 123-4567"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="requestedAmount">Requested Amount *</Label>
        <Input
          id="requestedAmount"
          type="number"
          step="0.01"
          min="0.01"
          value={requestedAmount}
          onChange={(e) => setRequestedAmount(e.target.value)}
          placeholder="50000"
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Additional details..."
        />
      </div>

      <Button type="submit" disabled={isSubmitting} className="self-end">
        {isSubmitting ? (
          <>
            <LoaderCircleIcon className="size-4 animate-spin" />
            {mode === "create" ? "Creating..." : "Saving..."}
          </>
        ) : mode === "create" ? (
          "Create Deal"
        ) : (
          "Save Changes"
        )}
      </Button>
    </form>
  );
}
