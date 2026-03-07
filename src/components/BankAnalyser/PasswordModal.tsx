import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface PasswordModalProps {
  fileName: string;
  onSubmit: (password: string) => void;
  onCancel: () => void;
  error?: string;
  open: boolean;
}

export function PasswordModal({
  fileName,
  onSubmit,
  onCancel,
  error,
  open,
}: PasswordModalProps) {
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);

  const handleSubmit = () => {
    if (pw.trim()) {
      onSubmit(pw.trim());
      setPw("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Password protected PDF</DialogTitle>
          <DialogDescription className="truncate">{fileName}</DialogDescription>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          CSB Bank PDF password = last 4 digits of your registered mobile number
          (e.g. mobile 98401<strong>6733</strong> → password <strong>6733</strong>)
        </p>
        {error && (
          <div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg p-2">
            {error}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            type={show ? "text" : "password"}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder="Enter PDF password"
            autoFocus
            className="flex-1"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShow(!show)}
            className="shrink-0"
          >
            {show ? "Hide" : "Show"}
          </Button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!pw.trim()}>
            Unlock & parse
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
