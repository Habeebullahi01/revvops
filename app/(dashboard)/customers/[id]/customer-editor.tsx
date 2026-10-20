"use client";

import { InlineEditCard, type EditableField } from "@/components/inline-edit-card";
import { updateCustomer } from "@/app/actions/directory-actions";

const FIELDS: EditableField[] = [
  { key: "name", label: "Name", required: true },
  { key: "phone", label: "Phone", required: true, placeholder: "0803 000 0000" },
  { key: "email", label: "Email", kind: "email", placeholder: "Optional" },
  { key: "address", label: "Address", placeholder: "Optional" },
  { key: "notes", label: "Notes", kind: "textarea", placeholder: "Optional" },
];

export interface CustomerForEdit {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Inline editor — no /edit route; Save calls the server action directly. */
export function CustomerEditor({ customer }: { customer: CustomerForEdit }) {
  const onSave = (draft: Record<string, string>) =>
    updateCustomer({
      id: customer.id,
      name: draft.name,
      phone: draft.phone,
      email: draft.email,
      address: draft.address,
      notes: draft.notes,
    });

  const added = new Date(customer.created_at).toLocaleDateString("en-NG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <InlineEditCard
      title="Customer details"
      description="Edit in place — there is no separate edit page."
      fields={FIELDS}
      values={{
        name: customer.name,
        phone: customer.phone,
        email: customer.email ?? "",
        address: customer.address ?? "",
        notes: customer.notes ?? "",
      }}
      onSave={onSave}
      notice={`Added ${added}. Last updated ${new Date(customer.updated_at).toLocaleDateString("en-NG", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })}.`}
    />
  );
}
