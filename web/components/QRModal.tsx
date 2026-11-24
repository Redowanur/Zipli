"use client";
import { Download } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, gradientBtn } from "@/lib/utils";

export function QRModal({ url, code, onClose }: { url: string | null; code: string; onClose: () => void }) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    if (!url) { setSrc(""); return; }
    QRCode.toDataURL(url, { width: 640, margin: 2, errorCorrectionLevel: "M", color: { dark: "#0b0b14", light: "#ffffff" } }).then(setSrc);
  }, [url]);

  return (
    <Dialog open={!!url} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>QR code</DialogTitle>
          <DialogDescription className="truncate">{url}</DialogDescription>
        </DialogHeader>
        <div className="mx-auto size-60 overflow-hidden rounded-xl bg-white p-2">
          {src ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={src} alt={`QR code for ${url}`} className="size-full" /> : <Skeleton className="size-full" />}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button asChild className={cn(gradientBtn)} onClick={() => toast.success("QR code downloaded")}>
            <a href={src} download={`qr-${code}.png`}><Download data-icon="inline-start" />Download PNG</a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
