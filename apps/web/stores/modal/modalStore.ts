// =============================================================================
// モーダル管理用Zustandストア
// =============================================================================

import { create } from 'zustand'

interface ModalState {
  modals: Record<string, boolean>
}

interface ModalActions {
  openModal: (id: string) => void
  closeModal: (id: string) => void
  toggleModal: (id: string) => void
  closeAll: () => void
  isOpen: (id: string) => boolean
}

export const useModalStore = create<ModalState & ModalActions>()((set, get) => ({
  modals: {},
  
  openModal: (id) => set((state) => ({
    modals: { ...state.modals, [id]: true },
  })),
  
  closeModal: (id) => set((state) => ({
    modals: { ...state.modals, [id]: false },
  })),
  
  toggleModal: (id) => set((state) => ({
    modals: { ...state.modals, [id]: !state.modals[id] },
  })),
  
  closeAll: () => set({ modals: {} }),
  
  isOpen: (id) => get().modals[id] || false,
}))

