import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const supabase = await createClient()

  // Find project by slug and set cookie
  const { data: project } = await supabase
    .from('projects')
    .select('id, slug')
    .eq('slug', slug)
    .single()

  if (project) {
    try {
      const cookieStore = await cookies()
      cookieStore.set('selfimprove_project', project.id, { path: '/', maxAge: 31536000 })
    } catch {
      // Cookie setting may fail in certain rendering contexts — that's ok,
      // the sidebar client component also sets the cookie
    }
  }

  return <>{children}</>
}
