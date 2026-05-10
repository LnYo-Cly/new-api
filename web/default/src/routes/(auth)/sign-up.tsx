import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { SignUp } from '@/features/auth/sign-up'
import { saveAffiliateCode } from '@/features/auth/lib/storage'

const searchSchema = z.object({
  aff: z.string().optional(),
})

export const Route = createFileRoute('/(auth)/sign-up')({
  component: SignUp,
  validateSearch: searchSchema,
  beforeLoad: ({ search }) => {
    if (search?.aff) {
      saveAffiliateCode(search.aff)
    }
  },
})
