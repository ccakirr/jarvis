import { RoomContext } from "@livekit/components-react";
import type { Room } from "livekit-client";

import type { VoiceSegment } from "../types";
import { VoiceDock } from "./VoiceDock";

interface VoiceLayerProps {
  room: Room;
  onSegments: (segments: VoiceSegment[]) => void;
  onBusyChange: (busy: boolean) => void;
  onStop: () => void;
}

// LiveKit paketleri ayrı chunk'ta; sesli mod açılınca yükleniyor
export default function VoiceLayer({ room, ...dockProps }: VoiceLayerProps) {
  return (
    <RoomContext.Provider value={room}>
      <VoiceDock {...dockProps} />
    </RoomContext.Provider>
  );
}
