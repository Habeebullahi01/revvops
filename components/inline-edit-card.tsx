"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export interface EditableField {
  key: string;
  label: string;
  kind?: "text" | "textarea" | "email" | "tel" | "number";
  required?: boolean;
  placeholder?: string;
}

export type EditableValues = Record<string, string>;

/**
 * Detail-page information card that edits in place — no /edit route.
 * Display mode shows the stored rows; Edit swaps them for inputs and Save
 * writes through the server action passed as `onSave`.
 */
export function InlineEditCard({
  title,
  description,
  fields,
  values,
  onSave,
  footer,
  notice,
}: {
  title: string;
  description?: string;
  fields: EditableField[];
  values: EditableValues;
  onSave: (
    draft: EditableValues,
  ) => Promise<{ ok: true } | { ok: false; error: string } | void>;
  footer?: React.ReactNode;
  notice?: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EditableValues>(values);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  const startEditing = () => {
    setDraft(values);
    setError("");
    setSaved("");
    setEditing(true);
  };

  const cancel = () => {
    setDraft(values);
    setError("");
    setEditing(false);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();

    const missing = fields.find(
      (field) => field.required && !(draft[field.key] ?? "").trim(),
    );
    if (missing) {
      setError(`${missing.label} is required.`);
      return;
    }

    setSaving(true);
    setError("");
    try {
      const result = await onSave(draft);
      if (result && !result.ok) {
        setError(result.error);
        return;
      }
      setSaved("Changes saved.");
      setEditing(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        {!editing && (
          <CardAction>
            <Button type="button" variant="outline" size="sm" onClick={startEditing}>
              Edit
            </Button>
          </CardAction>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {!editing ? (
          <div className="divide-y divide-rule">
            {fields.map((field) => (
              <div
                key={field.key}
                className="grid gap-1 py-2.5 first:pt-0 last:pb-0 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-baseline sm:gap-4"
              >
                <div className="text-xs text-muted-foreground">{field.label}</div>
                <div className="text-sm break-words">
                  {(values[field.key] ?? "").trim() ? (
                    values[field.key]
                  ) : (
                    <span className="text-muted-foreground">Not set</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <form onSubmit={save} noValidate className="space-y-3">
            {fields.map((field) => (
              <label key={field.key} className="block space-y-1.5">
                <span className="text-sm font-medium">
                  {field.label}
                  {field.required && (
                    <span aria-hidden className="ml-1 text-destructive">
                      *
                    </span>
                  )}
                </span>
                {field.kind === "textarea" ? (
                  <Textarea
                    rows={3}
                    placeholder={field.placeholder}
                    value={draft[field.key] ?? ""}
                    onChange={(e) =>
                      setDraft({ ...draft, [field.key]: e.target.value })
                    }
                  />
                ) : (
                  <Input
                    type={field.kind ?? "text"}
                    placeholder={field.placeholder}
                    value={draft[field.key] ?? ""}
                    onChange={(e) =>
                      setDraft({ ...draft, [field.key]: e.target.value })
                    }
                  />
                )}
              </label>
            ))}

            {error && (
              <p
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={cancel}
                disabled={saving}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}

        {!editing && (saved || error) && (
          <p
            role={error ? "alert" : "status"}
            className={`rounded-lg border px-3 py-2 text-sm ${
              error
                ? "border-destructive/30 bg-destructive/10 text-destructive"
                : "border-positive/30 bg-positive/10 text-positive"
            }`}
          >
            {error || saved}
          </p>
        )}

        {!editing && notice && (
          <p className="text-xs text-muted-foreground">{notice}</p>
        )}
        {footer}
      </CardContent>
    </Card>
  );
}
