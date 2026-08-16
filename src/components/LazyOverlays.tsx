import { lazy, Suspense } from 'react'
import { useStore } from '../store'

const DetailModal = lazy(() => import('./DetailModal'))
const Lightbox = lazy(() => import('./Lightbox'))
const SettingsModal = lazy(() => import('./SettingsModal'))
const MaskEditorModal = lazy(() => import('./MaskEditorModal'))
const PromptLibraryModal = lazy(() => import('./prompt/PromptLibraryModal'))
const SupportPromptModal = lazy(() => import('./SupportPromptModal'))
const FavoriteCollectionPickerModal = lazy(() =>
  import('./favorites/FavoriteCollectionPickerModal').then((module) => ({ default: module.FavoriteCollectionPickerModal })),
)
const ManageCollectionsModal = lazy(() =>
  import('./favorites/ManageCollectionsModal').then((module) => ({ default: module.ManageCollectionsModal })),
)

/** 只在覆盖层实际打开时下载其代码，避免大型编辑器和设置页阻塞首屏。 */
export default function LazyOverlays() {
  const detailTaskId = useStore((state) => state.detailTaskId)
  const lightboxImageId = useStore((state) => state.lightboxImageId)
  const showSettings = useStore((state) => state.showSettings)
  const maskEditorImageId = useStore((state) => state.maskEditorImageId)
  const promptLibraryTab = useStore((state) => state.promptLibraryTab)
  const supportPromptOpen = useStore((state) => state.supportPromptOpen)
  const favoritePickerTaskIds = useStore((state) => state.favoritePickerTaskIds)
  const isManageCollectionsModalOpen = useStore((state) => state.isManageCollectionsModalOpen)

  return (
    <Suspense fallback={null}>
      {detailTaskId && <DetailModal />}
      {lightboxImageId && <Lightbox />}
      {showSettings && <SettingsModal />}
      {maskEditorImageId && <MaskEditorModal />}
      {promptLibraryTab && <PromptLibraryModal />}
      {supportPromptOpen && <SupportPromptModal />}
      {favoritePickerTaskIds && <FavoriteCollectionPickerModal />}
      {isManageCollectionsModalOpen && <ManageCollectionsModal />}
    </Suspense>
  )
}