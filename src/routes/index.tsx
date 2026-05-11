import { createFileRoute, redirect } from '@tanstack/react-router'

import { createBoard } from '#/server/board-functions'

export const Route = createFileRoute('/')({
  loader: async () => {
    const board = await createBoard()

    throw redirect({
      to: '/$boardCode',
      params: { boardCode: board.code },
    })
  },
  component: Home,
})

function Home() {
  return null
}
