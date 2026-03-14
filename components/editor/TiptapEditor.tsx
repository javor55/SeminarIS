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

function MenuBar({ editor }: { editor: Editor | null }) {
  if (!editor) return null;

  const btnClass = "p-1.5 rounded-md text-sm text-muted-foreground hover:bg-accent transition-colors disabled:opacity-50";
  const activeClass = "bg-accent text-foreground";

  return (
    <div className="flex flex-wrap items-center gap-1 p-2 border-b bg-muted/50 rounded-t-md">
      <button
        onClick={() => editor.chain().focus().toggleBold().run()}
        disabled={!editor.can().chain().focus().toggleBold().run()}
        className={`${btnClass} ${editor.isActive("bold") ? activeClass : ""}`}
        type="button"
        title="Tučné"
      >
        <Bold size={18} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleItalic().run()}
        disabled={!editor.can().chain().focus().toggleItalic().run()}
        className={`${btnClass} ${editor.isActive("italic") ? activeClass : ""}`}
        type="button"
        title="Kurzíva"
      >
        <Italic size={18} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleStrike().run()}
        disabled={!editor.can().chain().focus().toggleStrike().run()}
        className={`${btnClass} ${editor.isActive("strike") ? activeClass : ""}`}
        type="button"
        title="Přeškrtnuté"
      >
        <Strikethrough size={18} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleCode().run()}
        disabled={!editor.can().chain().focus().toggleCode().run()}
        className={`${btnClass} ${editor.isActive("code") ? activeClass : ""}`}
        type="button"
        title="Kód"
      >
        <Code size={18} />
      </button>
      
      <div className="w-px h-6 bg-border mx-1" />

      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        className={`${btnClass} ${editor.isActive("heading", { level: 1 }) ? activeClass : ""}`}
        type="button"
        title="Nadpis 1"
      >
        <Heading1 size={18} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        className={`${btnClass} ${editor.isActive("heading", { level: 2 }) ? activeClass : ""}`}
        type="button"
        title="Nadpis 2"
      >
        <Heading2 size={18} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        className={`${btnClass} ${editor.isActive("heading", { level: 3 }) ? activeClass : ""}`}
        type="button"
        title="Nadpis 3"
      >
        <Heading3 size={18} />
      </button>

      <div className="w-px h-6 bg-border mx-1" />

      <button
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={`${btnClass} ${editor.isActive("bulletList") ? activeClass : ""}`}
        type="button"
        title="Odrážkový seznam"
      >
        <List size={18} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={`${btnClass} ${editor.isActive("orderedList") ? activeClass : ""}`}
        type="button"
        title="Číslovaný seznam"
      >
        <ListOrdered size={18} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        className={`${btnClass} ${editor.isActive("blockquote") ? activeClass : ""}`}
        type="button"
        title="Citace"
      >
        <Quote size={18} />
      </button>
      <button
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        className={btnClass}
        type="button"
        title="Vodorovná čára"
      >
        <Minus size={18} />
      </button>

      <div className="w-px h-6 bg-slate-300 mx-1" />

      <button
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().chain().focus().undo().run()}
        className={btnClass}
        type="button"
        title="Zpět"
      >
        <Undo2 size={18} />
      </button>
      <button
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().chain().focus().redo().run()}
        className={btnClass}
        type="button"
        title="Vpřed"
      >
        <Redo2 size={18} />
      </button>
      <button
        onClick={() => editor.chain().focus().clearNodes().run()}
        className={btnClass}
        type="button"
        title="Vyčistit formátování"
      >
        <Eraser size={18} />
      </button>
    </div>
  );
}

export function TiptapEditor({
  value,
  onChange,
}: {
  value: string;
  // eslint-disable-next-line no-unused-vars
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
