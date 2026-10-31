"use client";

import React, { useEffect, useState } from "react";
import { useEditor, EditorContent, Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

function MenuBar({ editor }: { editor: Editor | null }) {
  if (!editor) return null;

  return (
    <div className="flex flex-wrap items-center gap-1 p-2 border-b bg-muted/50 rounded-t-md">
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
    </div>
  );
}

export function TiptapEditor({
  value,
  onChange,
}: {
  value: string;
   
  onChange: (_val: string) => void;
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
        }),
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
      <MenuBar editor={editor} />
      <EditorContent
        editor={editor}
        className="tiptap edit-area"
      />
    </div>
  );
}
