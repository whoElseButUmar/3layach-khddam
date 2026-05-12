import { createServerFn } from '@tanstack/react-start'
import { getRequestHeader } from '@tanstack/react-start/server'
import { env } from 'cloudflare:workers'

import type { Board, BoardNote, NoteColor } from '#/types/board'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const NOTE_COLORS = ['yellow', 'pink', 'blue', 'green'] satisfies NoteColor[]

type D1BoardRow = {
  code: string
  created_at: string
  updated_at: string
}

type D1NoteRow = {
  id: string
  board_code: string
  content: string
  x: number
  y: number
  width: number
  height: number
  color: NoteColor
  created_at: string
  updated_at: string
}

type UpsertNoteInput = {
  boardCode: string
  clientId?: string
  note: {
    id: string
    content: string
    x: number
    y: number
    width: number
    height: number
    color: NoteColor
  }
}

type DeleteNoteInput = {
  boardCode: string
  noteId: string
  clientId?: string
}

export const createBoard = createServerFn({ method: 'POST' }).handler(
  async () => {
    const db = await getDb()
    const actor = await getActorHash()

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const code = createBoardCode()
      const now = new Date().toISOString()
      const result = await db
        .prepare(
          `INSERT OR IGNORE INTO boards (code, created_at, updated_at, created_by)
           VALUES (?, ?, ?, ?)`,
        )
        .bind(code, now, now, actor)
        .run()

      if (result.meta.changes > 0) {
        return toBoard({ code, created_at: now, updated_at: now }, [])
      }
    }

    throw new Error('Could not create a unique board code.')
  },
)

export const getBoard = createServerFn({ method: 'GET' })
  .inputValidator((data: { code: string }) => data)
  .handler(async ({ data }) => {
    const db = await getDb()
    const code = normalizeBoardCode(data.code)
    const actor = await getActorHash()
    const now = new Date().toISOString()

    await db
      .prepare(
        `INSERT OR IGNORE INTO boards (code, created_at, updated_at, created_by)
         VALUES (?, ?, ?, ?)`,
      )
      .bind(code, now, now, actor)
      .run()

    const board = await db
      .prepare(
        `SELECT code, created_at, updated_at
         FROM boards
         WHERE code = ?`,
      )
      .bind(code)
      .first<D1BoardRow>()

    if (!board) {
      throw new Error('Board could not be loaded.')
    }

    const notes = await db
      .prepare(
        `SELECT id, board_code, content, x, y, width, height, color, created_at, updated_at
         FROM notes
         WHERE board_code = ?
         ORDER BY created_at ASC`,
      )
      .bind(code)
      .all<D1NoteRow>()

    return toBoard(board, notes.results ?? [])
  })

export const upsertNote = createServerFn({ method: 'POST' })
  .inputValidator((data: UpsertNoteInput) => data)
  .handler(async ({ data }) => {
    const db = await getDb()
    const boardCode = normalizeBoardCode(data.boardCode)
    const note = normalizeNote(data.note)
    const actor = await getActorHash()
    const now = new Date().toISOString()

    await db
      .prepare(
        `UPDATE boards
         SET updated_at = ?
         WHERE code = ?`,
      )
      .bind(now, boardCode)
      .run()

    const insertResult = await db
      .prepare(
        `INSERT INTO notes (
          id, board_code, content, x, y, width, height, color, created_at, updated_at, updated_by
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          content = excluded.content,
          x = excluded.x,
          y = excluded.y,
          width = excluded.width,
          height = excluded.height,
          color = excluded.color,
          updated_at = excluded.updated_at,
          updated_by = excluded.updated_by`,
      )
      .bind(
        note.id,
        boardCode,
        note.content,
        note.x,
        note.y,
        note.width,
        note.height,
        note.color,
        now,
        now,
        actor,
      )
      .run()

    if (!insertResult.success) {
      throw new Error('Note could not be saved.')
    }

    const savedNote = await getNote(db, boardCode, note.id)

    if (!savedNote) {
      throw new Error('Saved note could not be loaded.')
    }

    await broadcastBoardEvent(boardCode, {
      type: 'note:upserted',
      note: savedNote,
      sourceClientId: normalizeClientId(data.clientId),
    })

    return savedNote
  })

export const deleteNote = createServerFn({ method: 'POST' })
  .inputValidator((data: DeleteNoteInput) => data)
  .handler(async ({ data }) => {
    const db = await getDb()
    const boardCode = normalizeBoardCode(data.boardCode)

    await db
      .prepare(
        `DELETE FROM notes
         WHERE id = ? AND board_code = ?`,
      )
      .bind(data.noteId, boardCode)
      .run()

    await db
      .prepare(
        `UPDATE boards
         SET updated_at = ?
         WHERE code = ?`,
      )
      .bind(new Date().toISOString(), boardCode)
      .run()

    await broadcastBoardEvent(boardCode, {
      type: 'note:deleted',
      boardCode,
      noteId: data.noteId,
      sourceClientId: normalizeClientId(data.clientId),
    })

    return { ok: true }
  })

async function getDb() {
  const db = env.BOARD_DB

  if (!db) {
    throw new Error('Cloudflare D1 binding BOARD_DB is not configured.')
  }

  await ensureSchema(db)

  return db
}

async function ensureSchema(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS boards (
        code TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        created_by TEXT NOT NULL
      )`,
    )
    .run()

  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        board_code TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        x REAL NOT NULL,
        y REAL NOT NULL,
        width INTEGER NOT NULL,
        height INTEGER NOT NULL,
        color TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        updated_by TEXT NOT NULL,
        FOREIGN KEY (board_code) REFERENCES boards(code) ON DELETE CASCADE
      )`,
    )
    .run()

  await db
    .prepare(
      `CREATE INDEX IF NOT EXISTS notes_board_code_idx ON notes(board_code)`,
    )
    .run()
}

function normalizeBoardCode(value: string) {
  const code = value.trim().toUpperCase()

  if (!/^[A-Z]{6}$/.test(code)) {
    throw new Error('Board codes must be six letters.')
  }

  return code
}

function normalizeNote(note: UpsertNoteInput['note']) {
  if (!note.id || note.id.length > 80) {
    throw new Error('Invalid note id.')
  }

  if (!NOTE_COLORS.includes(note.color)) {
    throw new Error('Invalid note color.')
  }

  return {
    id: note.id,
    content: note.content.slice(0, 2000),
    x: clamp(Math.round(note.x), 0, 5000),
    y: clamp(Math.round(note.y), 0, 5000),
    width: clamp(Math.round(note.width), 180, 420),
    height: clamp(Math.round(note.height), 140, 420),
    color: note.color,
  }
}

function createBoardCode() {
  const values = new Uint8Array(6)
  crypto.getRandomValues(values)

  return Array.from(values, (value) => ALPHABET[value % ALPHABET.length]).join(
    '',
  )
}

function toBoard(board: D1BoardRow, notes: Array<D1NoteRow>): Board {
  return {
    code: board.code,
    createdAt: board.created_at,
    updatedAt: board.updated_at,
    notes: notes.map((note) => ({
      id: note.id,
      boardCode: note.board_code,
      content: note.content,
      x: note.x,
      y: note.y,
      width: note.width,
      height: note.height,
      color: note.color,
      createdAt: note.created_at,
      updatedAt: note.updated_at,
    })),
  }
}

async function getNote(db: D1Database, boardCode: string, noteId: string) {
  const note = await db
    .prepare(
      `SELECT id, board_code, content, x, y, width, height, color, created_at, updated_at
       FROM notes
       WHERE board_code = ? AND id = ?`,
    )
    .bind(boardCode, noteId)
    .first<D1NoteRow>()

  return note ? toBoardNote(note) : null
}

function toBoardNote(note: D1NoteRow): BoardNote {
  return {
    id: note.id,
    boardCode: note.board_code,
    content: note.content,
    x: note.x,
    y: note.y,
    width: note.width,
    height: note.height,
    color: note.color,
    createdAt: note.created_at,
    updatedAt: note.updated_at,
  }
}

async function broadcastBoardEvent(
  boardCode: string,
  event:
    | {
        type: 'note:upserted'
        note: BoardNote
        sourceClientId?: string
      }
    | {
        type: 'note:deleted'
        boardCode: string
        noteId: string
        sourceClientId?: string
      },
) {
  const roomNamespace = env.BOARD_ROOM

  if (!roomNamespace) {
    return
  }

  try {
    const roomId = roomNamespace.idFromName(boardCode)
    const room = roomNamespace.get(roomId)

    await room.fetch(`https://board-room/${boardCode}/broadcast`, {
      method: 'POST',
      body: JSON.stringify(event),
    })
  } catch {
    // Realtime fan-out is best-effort; D1 remains the source of truth.
  }
}

async function getActorHash() {
  const ip =
    getRequestHeader('cf-connecting-ip') ??
    getRequestHeader('x-forwarded-for') ??
    'local'
  const agent = getRequestHeader('user-agent') ?? 'unknown'
  const bytes = new TextEncoder().encode(`${ip}|${agent}`)
  const digest = await crypto.subtle.digest('SHA-256', bytes)

  return Array.from(new Uint8Array(digest))
    .slice(0, 8)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function normalizeClientId(value: string | undefined) {
  if (!value || value.length > 80) {
    return undefined
  }

  return value
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}
