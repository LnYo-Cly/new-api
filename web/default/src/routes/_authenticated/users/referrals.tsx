import { createFileRoute, redirect } from '@tanstack/react-router'
import { UserReferrals } from '@/features/users/referrals'
import { usersSearchSchema } from '@/features/users/search-schema'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

export const Route = createFileRoute('/_authenticated/users/referrals')({
  beforeLoad: () => {
    const { auth } = useAuthStore.getState()

    if (!auth.user || auth.user.role < ROLE.ADMIN) {
      throw redirect({
        to: '/403',
      })
    }
  },
  validateSearch: usersSearchSchema,
  component: UserReferrals,
})
