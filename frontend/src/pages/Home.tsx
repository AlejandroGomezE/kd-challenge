import { Link } from 'react-router'
import { AuthLayout } from '@/components/AuthLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/lib/auth/use-auth'

// The signed-in landing page: who you are, and a way out. Rendered inside ProtectedRoute, so
// `user` is always set here.
export function Home() {
  const { user } = useAuth()

  return (
    <AuthLayout title="Home">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>
            <h1>Home</h1>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          <p className="font-medium">{user?.displayName ?? user?.username}</p>
          <p className="text-sm text-muted-foreground">@{user?.username}</p>
          <p className="text-sm text-muted-foreground">{user?.email}</p>
        </CardContent>
        <CardFooter>
          <Button asChild variant="outline" className="w-full">
            <Link to="/sign-out">Sign out</Link>
          </Button>
        </CardFooter>
      </Card>
    </AuthLayout>
  )
}
