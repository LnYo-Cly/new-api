import { createFileRoute } from '@tanstack/react-router'
import { ReferralProgram } from '@/features/wallet/referral-program'

export const Route = createFileRoute('/_authenticated/wallet/referral')({
  component: ReferralProgram,
})
