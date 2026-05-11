import * as React from 'react'
import {
  Check,
  Copy,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Unlink,
} from 'lucide-react'

import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Textarea } from '#/components/ui/textarea'
import { cn } from '#/lib/utils'
import { createBoard, deleteNote, upsertNote } from '#/server/board-functions'
import type { Board, BoardNote, NoteColor } from '#/types/board'

type SaveState = 'saved' | 'saving' | 'dirty' | 'error'

type LocalNote = BoardNote & {
  persisted: boolean
}

const NOTE_COLORS: Array<NoteColor> = ['yellow', 'pink', 'blue', 'green']
const NOTE_SIZE = { width: 250, height: 220 }

export function StickyBoard({ initialBoard }: { initialBoard: Board }) {
  const [boardCode, setBoardCode] = React.useState(initialBoard.code)
  const [notes, setNotes] = React.useState<Array<LocalNote>>(() =>
    initialBoard.notes.map((note) => ({ ...note, persisted: true })),
  )
  const [saveState, setSaveState] = React.useState<SaveState>('saved')
  const [copied, setCopied] = React.useState(false)
  const [activeNoteId, setActiveNoteId] = React.useState<string | null>(null)
  const boardRef = React.useRef<HTMLDivElement | null>(null)
  const textAreaRefs = React.useRef(new Map<string, HTMLTextAreaElement>())
  const hasPositionedViewport = React.useRef(initialBoard.notes.length === 0)

  React.useEffect(() => {
    if (!activeNoteId) {
      return
    }

    const frame = requestAnimationFrame(() => {
      textAreaRefs.current.get(activeNoteId)?.focus()
    })

    return () => cancelAnimationFrame(frame)
  }, [activeNoteId])

  React.useLayoutEffect(() => {
    if (hasPositionedViewport.current || notes.length === 0) {
      return
    }

    textAreaRefs.current
      .get(notes[0].id)
      ?.closest('[data-note]')
      ?.scrollIntoView({ block: 'center', inline: 'center' })
    hasPositionedViewport.current = true
  }, [notes])

  const persistNote = React.useCallback(
    async (note: LocalNote) => {
      if (!note.content.trim()) {
        if (note.persisted) {
          await deleteNote({ data: { boardCode, noteId: note.id } })
        }

        setNotes((current) => current.filter((item) => item.id !== note.id))
        setSaveState('saved')
        return
      }

      setSaveState('saving')

      try {
        const savedNote = await upsertNote({
          data: {
            boardCode,
            note: {
              id: note.id,
              content: note.content,
              x: note.x,
              y: note.y,
              width: note.width,
              height: note.height,
              color: note.color,
            },
          },
        })

        setNotes((current) =>
          current.map((item) =>
            item.id === savedNote.id ? { ...savedNote, persisted: true } : item,
          ),
        )
        setSaveState('saved')
      } catch {
        setSaveState('error')
      }
    },
    [boardCode],
  )

  const createNoteAt = React.useCallback((clientX: number, clientY: number) => {
    const board = boardRef.current

    if (!board) {
      return
    }

    const rect = board.getBoundingClientRect()
    const x = clamp(clientX - rect.left - 28, 18, rect.width - 190)
    const y = clamp(clientY - rect.top - 28, 92, rect.height - 150)
    const now = new Date().toISOString()
    const id = crypto.randomUUID()
    const color = NOTE_COLORS[Math.floor(Math.random() * NOTE_COLORS.length)]

    setNotes((current) => [
      ...current,
      {
        id,
        boardCode,
        content: '',
        x,
        y,
        width: NOTE_SIZE.width,
        height: NOTE_SIZE.height,
        color,
        createdAt: now,
        updatedAt: now,
        persisted: false,
      },
    ])
    setActiveNoteId(id)
    setSaveState('dirty')
  }, [boardCode])

  const handleBoardPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return
    }

    const target = event.target as HTMLElement

    if (target.closest('[data-note], [data-board-control]')) {
      return
    }

    const activeElement = document.activeElement

    if (
      activeElement instanceof HTMLTextAreaElement &&
      activeElement.closest('[data-note]')
    ) {
      activeElement.blur()
      return
    }

    createNoteAt(event.clientX, event.clientY)
  }

  const updateNote = (noteId: string, patch: Partial<LocalNote>) => {
    setSaveState('dirty')
    setNotes((current) =>
      current.map((note) =>
        note.id === noteId
          ? { ...note, ...patch, updatedAt: new Date().toISOString() }
          : note,
      ),
    )
  }

  const removeNote = async (note: LocalNote) => {
    setNotes((current) => current.filter((item) => item.id !== note.id))

    if (!note.persisted) {
      setSaveState('saved')
      return
    }

    setSaveState('saving')

    try {
      await deleteNote({ data: { boardCode, noteId: note.id } })
      setSaveState('saved')
    } catch {
      setSaveState('error')
      setNotes((current) => [...current, note])
    }
  }

  const copyBoardLink = async () => {
    const url = `${window.location.origin}/${boardCode}`
    await navigator.clipboard.writeText(url)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  const openFreshBoard = async () => {
    setSaveState('saving')
    const board = await createBoard()
    setBoardCode(board.code)
    setNotes([])
    setSaveState('saved')
    window.history.pushState(null, '', `/${board.code}`)
  }

  return (
    <main className="h-dvh overflow-auto bg-background text-foreground">
      <div
        ref={boardRef}
        className="wood-board board-canvas relative overflow-hidden"
        onPointerDown={handleBoardPointerDown}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_14%,rgba(255,255,255,.23),transparent_28%),radial-gradient(circle_at_80%_20%,rgba(81,47,22,.18),transparent_26%),radial-gradient(circle_at_70%_82%,rgba(12,76,93,.16),transparent_30%)]" />
        <div className="absolute inset-x-0 top-0 z-30 h-24 bg-gradient-to-b from-black/24 to-transparent" />

        <div
          data-board-control
          className="fixed left-1/2 top-4 z-40 flex w-[min(calc(100%-24px),780px)] -translate-x-1/2 items-center justify-between gap-3 rounded-lg border border-white/30 bg-white/64 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,.85),0_18px_42px_rgba(30,18,8,.24)] backdrop-blur-xl"
        >
          <div className="flex min-w-0 items-center gap-2">
            <Badge className="hidden text-wood-ink sm:inline-flex">
              <Sparkles className="size-3.5" />
              {notes.length}
            </Badge>
            <div className="rounded-md border border-amber-950/15 bg-[#fff7c2] px-3 py-1.5 font-mono text-sm font-bold text-amber-950 shadow-[inset_0_1px_0_rgba(255,255,255,.9)]">
              {boardCode}
            </div>
            <SaveIndicator saveState={saveState} />
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="board"
              size="compactIcon"
              onClick={() => createNoteAt(window.innerWidth / 2, 170)}
              title="New note"
            >
              <Plus />
            </Button>
            <Button
              type="button"
              variant="board"
              size="compactIcon"
              onClick={copyBoardLink}
              title="Copy board link"
            >
              {copied ? <Check /> : <Copy />}
            </Button>
            <Button
              type="button"
              variant="board"
              size="compactIcon"
              onClick={openFreshBoard}
              title="New board"
            >
              <Unlink />
            </Button>
          </div>
        </div>

        <div className="absolute inset-0 z-10">
          {notes.map((note, index) => (
            <StickyNote
              key={note.id}
              note={note}
              zIndex={20 + index}
              setTextareaRef={(element) => {
                if (element) {
                  textAreaRefs.current.set(note.id, element)
                } else {
                  textAreaRefs.current.delete(note.id)
                }
              }}
              onChange={(content) => updateNote(note.id, { content })}
              onDelete={() => void removeNote(note)}
              onBlur={() => void persistNote(note)}
              onDragEnd={(x, y) => {
                const updatedNote = { ...note, x, y }
                updateNote(note.id, { x, y })
                void persistNote(updatedNote)
              }}
            />
          ))}
        </div>
      </div>
    </main>
  )
}

function StickyNote({
  note,
  zIndex,
  setTextareaRef,
  onChange,
  onDelete,
  onBlur,
  onDragEnd,
}: {
  note: LocalNote
  zIndex: number
  setTextareaRef: (element: HTMLTextAreaElement | null) => void
  onChange: (content: string) => void
  onDelete: () => void
  onBlur: () => void
  onDragEnd: (x: number, y: number) => void
}) {
  const dragStart = React.useRef<{
    pointerId: number
    startX: number
    startY: number
    noteX: number
    noteY: number
  } | null>(null)
  const [draftPosition, setDraftPosition] = React.useState({
    x: note.x,
    y: note.y,
  })

  React.useEffect(() => {
    setDraftPosition({ x: note.x, y: note.y })
  }, [note.x, note.y])

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    dragStart.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      noteX: draftPosition.x,
      noteY: draftPosition.y,
    }
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStart.current

    if (!drag || drag.pointerId !== event.pointerId) {
      return
    }

    setDraftPosition({
      x: Math.max(12, drag.noteX + event.clientX - drag.startX),
      y: Math.max(72, drag.noteY + event.clientY - drag.startY),
    })
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStart.current

    if (!drag || drag.pointerId !== event.pointerId) {
      return
    }

    dragStart.current = null
    onDragEnd(draftPosition.x, draftPosition.y)
  }

  return (
    <article
      data-note
      className={cn(
        'sticky-note group absolute rounded-[6px] border p-3 pt-2 shadow-note transition-transform duration-150 hover:-translate-y-0.5',
        noteColorClass(note.color),
      )}
      style={{
        left: draftPosition.x,
        top: draftPosition.y,
        width: note.width,
        minHeight: note.height,
        zIndex,
        transform: `rotate(${noteRotation(note.id)}deg)`,
      }}
    >
      <div
        className="mb-2 flex h-7 cursor-grab touch-none items-center justify-between border-b border-amber-950/10 pb-1 active:cursor-grabbing"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div className="flex gap-1">
          <span className="size-2 rounded-full bg-white/70 shadow-[inset_0_1px_1px_rgba(255,255,255,.6),0_1px_2px_rgba(64,31,8,.22)]" />
          <span className="size-2 rounded-full bg-white/45 shadow-[inset_0_1px_1px_rgba(255,255,255,.5),0_1px_2px_rgba(64,31,8,.18)]" />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="compactIcon"
          className="size-7 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          onClick={onDelete}
          title="Delete note"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      <Textarea
        ref={setTextareaRef}
        value={note.content}
        placeholder="Start typing..."
        spellCheck
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
      />
    </article>
  )
}

function SaveIndicator({ saveState }: { saveState: SaveState }) {
  const label = {
    saved: 'Saved',
    saving: 'Saving',
    dirty: 'Unsaved',
    error: 'Retry',
  }[saveState]

  return (
    <Badge
      className={cn(
        'min-w-20 justify-center',
        saveState === 'error' && 'bg-red-50/85 text-red-900',
      )}
    >
      {saveState === 'saving' ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <Check className="size-3.5" />
      )}
      {label}
    </Badge>
  )
}

function noteColorClass(color: NoteColor) {
  return {
    yellow: 'border-[#e4bd4e] bg-note-yellow',
    pink: 'border-[#e8a4bd] bg-note-pink',
    blue: 'border-[#8bbfd6] bg-note-blue',
    green: 'border-[#9bc78d] bg-note-green',
  }[color]
}

function noteRotation(id: string) {
  const code = id.charCodeAt(0) + id.charCodeAt(id.length - 1)

  return (code % 5) - 2
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}
