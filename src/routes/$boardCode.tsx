import { createFileRoute } from '@tanstack/react-router'

import { StickyBoard } from '#/components/board/sticky-board'
import { getBoard } from '#/server/board-functions'

export const Route = createFileRoute('/$boardCode')({
  loader: async ({ params }) => {
    return getBoard({ data: { code: params.boardCode } })
  },
  component: BoardRoute,
})

function BoardRoute() {
  const board = Route.useLoaderData()

  return <StickyBoard initialBoard={board} />
}
