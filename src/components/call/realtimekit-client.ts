/**
 * The slice of the RealtimeKit SDK this app actually touches.
 *
 * The shipped types are broad and event-driven; naming only what we use
 * keeps the call component readable and makes an SDK upgrade a
 * compile error here rather than a runtime surprise in the room.
 */
export type RealtimeKitTrack = MediaStreamTrack | null | undefined;

export type RealtimeKitParticipant = {
  videoTrack?: RealtimeKitTrack;
  audioTrack?: RealtimeKitTrack;
};

export type RealtimeKitMeeting = {
  self: {
    videoTrack?: RealtimeKitTrack;
    on: (event: string, handler: (payload: never) => void) => void;
    enableAudio: () => Promise<void>;
    disableAudio: () => Promise<void>;
    enableVideo: () => Promise<void>;
    disableVideo: () => Promise<void>;
  };
  participants: {
    joined: {
      toArray: () => RealtimeKitParticipant[];
      on: (event: string, handler: (payload: never) => void) => void;
    };
  };
  join: () => Promise<void>;
  leave: () => Promise<void>;
};

export type RealtimeKitClientStatic = {
  init: (opts: {
    authToken: string;
    defaults?: { audio?: boolean; video?: boolean };
  }) => Promise<RealtimeKitMeeting>;
};
