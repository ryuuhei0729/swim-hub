import { useEffect, useState } from "react";
import { useTeamViewStore } from "@/stores/teamViewStore";

/**
 * チームタブの表示状態 (stores/teamViewStore.ts) を端末から読み終えたか。
 * 読み終える前に「最後に開いたチーム」を決めると、別のチームが一瞬表示されてから切り替わる。
 */
export function useTeamViewHydrated(): boolean {
  const [hydrated, setHydrated] = useState(() => useTeamViewStore.persist.hasHydrated());
  useEffect(() => {
    if (useTeamViewStore.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    return useTeamViewStore.persist.onFinishHydration(() => setHydrated(true));
  }, []);
  return hydrated;
}
