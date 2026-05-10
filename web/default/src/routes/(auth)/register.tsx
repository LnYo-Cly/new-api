import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/(auth)/register')({
  beforeLoad: ({ search }) => {
    throw redirect({
      to: '/sign-up',
      search: search as Record<string, unknown>,
    })
  },
})
