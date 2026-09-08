import { PageHeader } from "@/components/page-header";
import { VideoEventsList } from "@/components/video/video-events-list";

export default function VideoEventsPage() {
  return (
    <div>
      <PageHeader
        title="Video Events"
        description="Driving events captured on camera: harsh braking, acceleration, and manual triggers"
      />
      <VideoEventsList
        category="DRIVING"
        emptyTitle="No video events yet"
        emptyDescription="Harsh driving events and manually triggered clips from your cameras will appear here."
      />
    </div>
  );
}
