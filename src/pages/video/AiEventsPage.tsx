import { PageHeader } from "@/components/page-header";
import { VideoEventsList } from "@/components/video/video-events-list";

export default function AiEventsPage() {
  return (
    <div>
      <PageHeader
        title="AI Events"
        description="AI-detected safety events: distraction, drowsiness, collision warnings and lane departure"
      />
      <VideoEventsList
        category="AI_SAFETY"
        emptyTitle="No AI safety events yet"
        emptyDescription="AI-detected driver safety events from AI-enabled cameras will appear here."
      />
    </div>
  );
}
