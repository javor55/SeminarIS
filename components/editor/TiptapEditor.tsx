"use client";

import React, { useEffect, useState } from "react";
import { useEditor, EditorContent, Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";

import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Eraser,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Minus,
  Undo2,
  Redo2,
  Link2,
  ImagePlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function ToolButton({ active, className, ...props }: React.ComponentProps<typeof Button> & { active?: boolean }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("h-8 w-8 text-muted-foreground", active && "bg-accent text-foreground", className)}
      {...props}
    />
  );
}

function MenuBar({ editor, onImageUpload }: { editor: Editor | null; onImageUpload?: ImageUploader }) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInput = React.useRef<HTMLInputElement>(null);
  if (!editor) return null;

  function openLink() {
    setLinkUrl(editor!.getAttributes("link").href ?? "https://");
    setLinkOpen(true);
  }

  function applyLink() {
    const url = linkUrl.trim();
    if (!url || url === "https://") editor!.chain().focus().extendMarkRange("link").unsetLink().run();
    else editor!.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    setLinkOpen(false);
  }

  async function insertImage(file: File | undefined) {
    if (!file || !onImageUpload) return;
    setUploading(true);
    try {
      const url = await onImageUpload(file);
      editor!.chain().focus().setImage({ src: url, alt: "" }).run();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Obrázek se nepodařilo vložit.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <div className="border-b bg-muted/50 rounded-t-md">
    <div className="flex flex-wrap items-center gap-1 p-2">
      <ToolButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        disabled={!editor.can().chain().focus().toggleBold().run()}
        active={editor.isActive("bold")}
        title="Tučné"
      >
        <Bold size={18} />
      </ToolButton>
      <ToolButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        disabled={!editor.can().chain().focus().toggleItalic().run()}
        active={editor.isActive("italic")}
        title="Kurzíva"
      >
        <Italic size={18} />
      </ToolButton>
      <ToolButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        disabled={!editor.can().chain().focus().toggleStrike().run()}
        active={editor.isActive("strike")}
        title="Přeškrtnuté"
      >
        <Strikethrough size={18} />
      </ToolButton>
      <ToolButton
        onClick={() => editor.chain().focus().toggleCode().run()}
        disabled={!editor.can().chain().focus().toggleCode().run()}
        active={editor.isActive("code")}
        title="Kód"
      >
        <Code size={18} />
      </ToolButton>
      
      <div className="w-px h-6 bg-border mx-1" />

      <ToolButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        active={editor.isActive("heading", { level: 1 })}
        title="Nadpis 1"
      >
        <Heading1 size={18} />
      </ToolButton>
      <ToolButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        active={editor.isActive("heading", { level: 2 })}
        title="Nadpis 2"
      >
        <Heading2 size={18} />
      </ToolButton>
      <ToolButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        active={editor.isActive("heading", { level: 3 })}
        title="Nadpis 3"
      >
        <Heading3 size={18} />
      </ToolButton>

      <div className="w-px h-6 bg-border mx-1" />

      <ToolButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive("bulletList")}
        title="Odrážkový seznam"
      >
        <List size={18} />
      </ToolButton>
      <ToolButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive("orderedList")}
        title="Číslovaný seznam"
      >
        <ListOrdered size={18} />
      </ToolButton>
      <ToolButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        active={editor.isActive("blockquote")}
        title="Citace"
      >
        <Quote size={18} />
      </ToolButton>
      <ToolButton
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title="Vodorovná čára"
      >
        <Minus size={18} />
      </ToolButton>

      <div className="w-px h-6 bg-border mx-1" />

      <ToolButton
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().chain().focus().undo().run()}
        title="Zpět"
      >
        <Undo2 size={18} />
      </ToolButton>
      <ToolButton
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().chain().focus().redo().run()}
        title="Vpřed"
      >
        <Redo2 size={18} />
      </ToolButton>
      <ToolButton
        onClick={() => editor.chain().focus().clearNodes().run()}
        title="Vyčistit formátování"
      >
        <Eraser size={18} />
      </ToolButton>

      <div className="w-px h-6 bg-border mx-1" />

      <ToolButton onClick={openLink} active={editor.isActive("link")} title="Odkaz" aria-label="Odkaz" data-testid="editor-link">
        <Link2 size={18} />
      </ToolButton>
      {onImageUpload && (
        <>
          <ToolButton onClick={() => fileInput.current?.click()} disabled={uploading} title="Vložit obrázek" aria-label="Vložit obrázek" data-testid="editor-image">
            <ImagePlus size={18} />
          </ToolButton>
          <input ref={fileInput} type="file" accept="image/*" className="sr-only" data-testid="editor-image-file" tabIndex={-1} onChange={(e) => insertImage(e.target.files?.[0])} />
        </>
      )}
    </div>
    {linkOpen && (
      <div className="flex flex-wrap items-center gap-2 border-t p-2">
        <Input
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          // (editor bývá uvnitř formuláře stránky, proto Enter nesmí odeslat formulář)
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              applyLink();
            }
          }}
          placeholder="https://…"
          aria-label="Adresa odkazu"
          data-testid="editor-link-url"
          className="h-8 min-w-0 flex-1 basis-48"
          autoFocus
        />
        <Button type="button" size="sm" onClick={applyLink} data-testid="editor-link-apply">Použít</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setLinkOpen(false)}>Zrušit</Button>
      </div>
    )}
    </div>
  );
}

/** Nahraje obrázek vložený do textu a vrátí jeho adresu; bez něj editor tlačítko obrázku nenabízí. */
export type ImageUploader = (file: File) => Promise<string>;

export function TiptapEditor({
  value,
  onChange,
  onImageUpload,
}: {
  value: string;
   
  onChange: (_val: string) => void;
  onImageUpload?: ImageUploader;
}) {
  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          heading: {
            levels: [1, 2, 3, 4, 5, 6],
          },
          // Odkazy se v editoru neotevírají klepnutím, upravují se tlačítkem Odkaz
          link: { openOnClick: false },
        }),
        Image.configure({ inline: false }),
      ],
      content: value || "",
      onUpdate({ editor }) {
        onChange(editor.getHTML());
      },
      immediatelyRender: false,
    },
    [isClient]
  );

  if (!isClient || !editor) {
    return (
      <div className="border rounded-md p-3 text-sm text-muted-foreground">
        Načítám editor…
      </div>
    );
  }

  return (
    <div className="tiptap-wrapper border rounded-md bg-background">
      <MenuBar editor={editor} onImageUpload={onImageUpload} />
      <EditorContent
        editor={editor}
        className="tiptap edit-area"
      />
    </div>
  );
}
