import { TeamEvent } from "@swim-hub/shared/types";

export interface EventGroupedByMonth {
  year: number;
  month: number;
  events: TeamEvent[];
}
