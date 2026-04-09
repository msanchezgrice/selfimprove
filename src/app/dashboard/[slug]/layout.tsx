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

  // Find project by slug
  const { data: project } = await supabase
    .from('projects')
    .select('id, slug')
    .eq('slug', slug)
    .single()

  if (project) {
    // Set the active project cookie
    const cookieStore = await cookies()
    cookieStore.set('selfimprove_project', project.id, { path: '/', maxAge: 31536000 })
  }

  return <>{children}</>
}
