import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { PRDDetail } from '../../../../_components/prd-detail'
import { generatePRD } from '@/lib/ai/generate-prd'

export default async function PRDPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  let { data: item } = await supabase
    .from('roadmap_items')
    .select('*')
    .eq('id', id)
    .single()

  if (!item) notFound()

  // Auto-generate PRD if missing
  if (!item.prd_content) {
    try {
      await generatePRD(id)
      const { data: updated } = await supabase
        .from('roadmap_items')
        .select('*')
        .eq('id', id)
        .single()
      if (updated) item = updated
    } catch {
      // Show page without PRD — user can trigger manually
    }
  }

  return <PRDDetail item={item} />
}
