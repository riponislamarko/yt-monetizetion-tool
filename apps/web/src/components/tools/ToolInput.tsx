"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Search } from "lucide-react";
import { youtubeUrlSchema } from "@yt/validators";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const formSchema = z.object({ url: youtubeUrlSchema });
type FormValues = z.infer<typeof formSchema>;

export function ToolInput({
  onSubmit,
  isLoading,
  placeholder = "Paste a YouTube channel or video URL…",
  buttonLabel = "Check",
  initialUrl = "",
}: {
  onSubmit: (url: string) => void;
  isLoading: boolean;
  placeholder?: string;
  buttonLabel?: string;
  initialUrl?: string;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    mode: "onChange",
    defaultValues: { url: initialUrl },
  });

  return (
    <form
      onSubmit={handleSubmit((v) => onSubmit(v.url.trim()))}
      className="space-y-2"
      noValidate
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          {...register("url")}
          placeholder={placeholder}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-invalid={Boolean(errors.url)}
          aria-label="YouTube URL"
          className="flex-1"
        />
        <Button type="submit" disabled={isLoading || !isValid} className="sm:w-auto">
          <Search className="h-4 w-4" />
          {isLoading ? "Working…" : buttonLabel}
        </Button>
      </div>
      {errors.url ? (
        <p className="text-sm text-destructive">{errors.url.message}</p>
      ) : null}
    </form>
  );
}
