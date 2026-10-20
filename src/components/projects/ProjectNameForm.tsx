"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api-client";
import { projectNameSchema } from "@/lib/schemas/project";
import { Button, FieldError, Spinner, inputClass } from "../ui";

type Props = {
  id: string;
  label: string;
  submitLabel: string;
  initialName?: string;
  pending: boolean;
  serverError: unknown;
  onSubmit: (name: string) => void;
  onCancel?: () => void;
};

/** Create and rename share one form: client-side Zod validation, server fieldErrors mapped back. */
export function ProjectNameForm({ id, label, submitLabel, initialName = "", pending, serverError, onSubmit, onCancel }: Props) {
  const [name, setName] = useState(initialName);
  const [clientError, setClientError] = useState<string>();
  const serverFieldError = serverError instanceof ApiError ? serverError.fieldErrors?.name?.[0] : undefined;
  const error = clientError ?? serverFieldError;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const result = projectNameSchema.safeParse({ name });
    if (!result.success) {
      setClientError(result.error.issues[0]?.message);
      return;
    }
    setClientError(undefined);
    onSubmit(result.data.name);
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-1">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setClientError(undefined);
          }}
          placeholder={label}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          disabled={pending}
          className={inputClass}
        />
        <Button type="submit" disabled={pending}>
          {pending && <Spinner />}
          {pending ? "Saving…" : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        )}
      </div>
      <FieldError id={`${id}-error`} message={error} />
    </form>
  );
}
