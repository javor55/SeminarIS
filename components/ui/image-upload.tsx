"use client";

import * as React from "react";
import Cropper from "react-easy-crop";
import { ImagePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { cropToBlob, prepareForCrop, uploadImage, type CropArea } from "@/lib/image-client";

type Props = {
  /** Adresa, kam se nahraje ořezaný obrázek (POST, vrací `{ id, url }`). */
  uploadUrl: string;
  /** Adresa aktuálního obrázku (náhled), nebo null. */
  currentUrl: string | null;
  onUploaded: (image: { id: string; url: string }) => void;
  onRemove: () => void;
  alt: string;
  onAltChange: (alt: string) => void;
  /** Poměr stran ořezu; výchozí 16:9. */
  aspect?: number;
  id?: string;
  className?: string;
};

/**
 * Nahrání obrázku: přetažení souboru nebo výběr, ořez tažením a zoomem, zmenšení v prohlížeči (max. 1600 px,
 * WebP) a pole pro alternativní text. Obecná komponenta bez vazby na konkrétní modul: server dodává `uploadUrl`.
 */
export function ImageUpload({ uploadUrl, currentUrl, onUploaded, onRemove, alt, onAltChange, aspect = 16 / 9, id = "image-upload", className }: Props) {
  const fileInput = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);
  const [busy, setBusy] = React.useState<null | "prepare" | "upload">(null);
  const [error, setError] = React.useState<string | null>(null);
  const [source, setSource] = React.useState<string | null>(null);
  const [crop, setCrop] = React.useState({ x: 0, y: 0 });
  const [zoom, setZoom] = React.useState(1);
  const [area, setArea] = React.useState<CropArea | null>(null);

  const fail = (e: unknown) => {
    const message = e instanceof Error ? e.message : "Něco se nepovedlo.";
    setError(message);
    toast.error(message);
  };

  function closeCropper() {
    if (source) URL.revokeObjectURL(source);
    setSource(null);
    setZoom(1);
    setCrop({ x: 0, y: 0 });
    setArea(null);
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy("prepare");
    try {
      const prepared = await prepareForCrop(file);
      setSource(prepared.url);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function confirmCrop() {
    if (!source || !area) return;
    setBusy("upload");
    try {
      const blob = await cropToBlob(source, area);
      const uploaded = await uploadImage(uploadUrl, blob);
      onUploaded(uploaded);
      closeCropper();
      toast.success("Obrázek nahrán.");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={cn("space-y-3", className)} data-testid="image-upload">
      <input ref={fileInput} id={id} type="file" accept="image/*" className="sr-only" data-testid="image-file" onChange={(e) => pick(e.target.files?.[0])} />

      {currentUrl ? (
        <div className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={currentUrl} alt={alt} className="w-full max-w-xl rounded-md border object-cover" style={{ aspectRatio: aspect }} data-testid="image-preview" />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => fileInput.current?.click()}>
              <ImagePlus className="mr-1.5 h-4 w-4" /> Změnit obrázek
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={onRemove} data-testid="image-remove">
              <Trash2 className="mr-1.5 h-4 w-4" /> Odebrat
            </Button>
          </div>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          data-testid="image-dropzone"
          onClick={() => fileInput.current?.click()}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), fileInput.current?.click())}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void pick(e.dataTransfer.files?.[0]);
          }}
          className={cn(
            "flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-6 text-center text-sm text-muted-foreground transition-colors hover:bg-accent/50",
            dragging && "border-primary bg-accent/50"
          )}
        >
          <ImagePlus className="h-6 w-6" />
          <span>{busy === "prepare" ? "Zpracovávám obrázek…" : "Přetáhněte sem obrázek nebo klepněte pro výběr souboru"}</span>
          <span className="text-xs">JPEG, PNG nebo WebP, nejvýše 10 MB. Před nahráním se zmenší.</span>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger" data-testid="image-error">
          {error}
        </p>
      )}

      <div className="space-y-1">
        <Label htmlFor={`${id}-alt`} className="text-sm font-medium">Alternativní text obrázku</Label>
        <Input id={`${id}-alt`} value={alt} onChange={(e) => onAltChange(e.target.value)} maxLength={300} placeholder="Stručně popište, co je na obrázku" />
        <p className="text-xs text-muted-foreground">Přečte ho čtečka obrazovky a zobrazí se, když se obrázek nenačte.</p>
      </div>

      <Dialog open={source !== null} onOpenChange={(open) => !open && busy !== "upload" && closeCropper()}>
        <DialogContent className="max-w-xl" data-testid="crop-dialog">
          <DialogHeader>
            <DialogTitle>Ořez obrázku</DialogTitle>
            <DialogDescription>Přetažením posuňte výřez, posuvníkem přiblížíte.</DialogDescription>
          </DialogHeader>
          <div className="relative h-64 w-full overflow-hidden rounded-md bg-muted sm:h-80">
            {source && (
              <Cropper
                image={source}
                crop={crop}
                zoom={zoom}
                aspect={aspect}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_, pixels) => setArea(pixels)}
              />
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${id}-zoom`} className="text-sm">Přiblížení</Label>
            <input id={`${id}-zoom`} type="range" min={1} max={3} step={0.05} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-full accent-primary" />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" disabled={busy === "upload"} onClick={closeCropper}>Zrušit</Button>
            <Button type="button" disabled={busy === "upload" || !area} onClick={confirmCrop} data-testid="crop-confirm">
              {busy === "upload" ? "Nahrávám…" : "Použít výřez"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
