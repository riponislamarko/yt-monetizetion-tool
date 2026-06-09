"use client";

import { Check, Copy } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";

interface CopyButtonProps extends Omit<ButtonProps, "onClick" | "children"> {
  value: string;
  label?: string;
}

export function CopyButton({ value, label = "Copy", variant = "outline", size = "sm", ...rest }: CopyButtonProps) {
  const { copied, copy } = useCopyToClipboard();
  return (
    <Button variant={variant} size={size} onClick={() => void copy(value)} {...rest}>
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {copied ? "Copied" : label}
    </Button>
  );
}
