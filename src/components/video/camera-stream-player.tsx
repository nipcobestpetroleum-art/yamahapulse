import { useState } from "react";
import { VideoOff } from "lucide-react";
import type { Camera } from "@/types/database";

interface Props {
  camera: Camera;
}

export function CameraStreamPlayer({ camera }: Props) {
  const [errored, setErrored] = useState(false);

  if (!camera.stream_url || camera.status !== "ACTIVE" || errored) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-lg bg-muted text-muted-foreground">
        <VideoOff className="h-8 w-8" />
        <p className="text-xs">
          {!camera.stream_url
            ? "No stream URL configured"
            : camera.status !== "ACTIVE"
              ? "Camera is not active"
              : "Stream unavailable"}
        </p>
      </div>
    );
  }

  return (
    <video
      key={camera.id}
      className="aspect-video w-full rounded-lg bg-black"
      controls
      muted
      autoPlay
      playsInline
      src={camera.stream_url}
      onError={() => setErrored(true)}
    />
  );
}
