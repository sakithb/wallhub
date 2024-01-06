import { Enum } from "./common.js";

export const SlideshowIntervalUnits = {
    HOURS: "3600",
    MINUTES: "60",
    SECONDS: "1",
} as const;

export type SlideshowIntervalUnits = Enum<typeof SlideshowIntervalUnits>;
