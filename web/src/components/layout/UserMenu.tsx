import { ChevronDown, LogOut } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from '@/components/ui/toast'
import { errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'

/** Avatar button with the signed-in account and "Sign out". */
export function UserMenu() {
  const { user, signOut } = useAuth()
  if (!user) return null

  const onSignOut = async () => {
    try {
      await signOut()
    } catch (err) {
      toast.error('Could not sign out cleanly', errorMessage(err))
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={`Account: ${user.name}`} className={cn(buttonVariants({ variant: 'ghost', size: 'md' }), 'gap-1.5 px-1.5 text-foreground')}>
        <Avatar name={user.name} size="sm" />
        <span className="hidden max-w-32 truncate text-sm lg:inline">{user.name}</span>
        <ChevronDown aria-hidden className="hidden text-muted lg:block" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex flex-col gap-0.5 py-2">
          <span className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-medium text-foreground">{user.name}</span>
            <Badge size="sm" tone="outline">
              {user.role === 'admin' ? 'Admin' : 'Member'}
            </Badge>
          </span>
          <span className="truncate">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={<LogOut aria-hidden />} onSelect={onSignOut}>
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
