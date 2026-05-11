export type NoteColor = 'yellow' | 'pink' | 'blue' | 'green'

export type BoardNote = {
  id: string
  boardCode: string
  content: string
  x: number
  y: number
  width: number
  height: number
  color: NoteColor
  createdAt: string
  updatedAt: string
}

export type Board = {
  code: string
  createdAt: string
  updatedAt: string
  notes: Array<BoardNote>
}
