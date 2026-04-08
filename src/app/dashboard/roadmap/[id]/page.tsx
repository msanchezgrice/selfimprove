import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { PRDDetail } from '../../_components/prd-detail'

export default async function PRDPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: item } = await supabase
    .from('roadmap_items')
    .select('*')
    .eq('id', id)
    .single()

  if (!item) notFound()

  return <PRDDetail item={item} />
}
