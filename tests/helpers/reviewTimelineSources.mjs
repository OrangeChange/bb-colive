import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

export function readReviewTimelineSources() {
  const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
  const timeline = read("src/components/ReviewSessionTimeline.tsx");
  for (const entry of ["useReviewTimelinePages", "useReviewTimelineReading", "useReviewTimelineRefresh", "createReviewTimelineEntries"]) {
    assert.match(timeline, new RegExp(`\\b${entry}\\(`));
  }
  return [timeline, read("src/archive/useReviewTimelinePages.ts"), read("src/archive/useReviewTimelineReading.ts"), read("src/archive/useReviewTimelineRefresh.ts"), read("src/archive/reviewTimelineEntries.ts")].join("\n");
}
