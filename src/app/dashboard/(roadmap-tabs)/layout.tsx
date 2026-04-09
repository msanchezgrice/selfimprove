import { TabNavigation } from '../_components/tab-navigation'

export default function RoadmapTabsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <TabNavigation />
      {children}
    </>
  )
}
