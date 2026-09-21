import { create } from "zustand";

interface CompetitionFormState {
  // 作成中の大会ID
  createdCompetitionId: string | null;

  // フォーム状態
  isLoading: boolean;
  errors: Record<string, string>;
}

interface CompetitionFormActions {
  // データ操作
  setCreatedCompetitionId: (id: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (field: string, message: string) => void;
  clearErrors: () => void;

  // リセット
  reset: () => void;
}

const initialState: CompetitionFormState = {
  createdCompetitionId: null,
  isLoading: false,
  errors: {},
};

export const useCompetitionFormStore = create<CompetitionFormState & CompetitionFormActions>()(
  (set) => ({
    ...initialState,

    // データ操作
    setCreatedCompetitionId: (id) => set({ createdCompetitionId: id }),
    setLoading: (loading) => set({ isLoading: loading }),
    setError: (field, message) =>
      set((state) => ({
        errors: {
          ...state.errors,
          [field]: message,
        },
      })),
    clearErrors: () => set({ errors: {} }),

    // リセット
    reset: () => set(initialState),
  }),
);
