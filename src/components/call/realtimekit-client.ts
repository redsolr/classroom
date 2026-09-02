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
  screenShareEnabled?: boolean;
  screenShareTracks?: { video?: RealtimeKitTrack; audio?: RealtimeKitTrack };
};

/**
 * One message off the meeting's own chat channel.
 *
 * We send `custom` payloads carrying our OWN message row id (see
 * `lib/call-chat-wire.ts`), so `message` is a string this app wrote, not
 * something a person typed into a provider surface.
 */
export type RealtimeKitChatMessage = {
  id: string;
  userId: string;
  type: string;
  message?: string;
};

export type RealtimeKitMeeting = {
  self: {
    id?: string;
    videoTrack?: RealtimeKitTrack;
    screenShareEnabled?: boolean;
    /** From the preset: `ALLOWED` | `NOT_ALLOWED` | `CAN_REQUEST`. */
    permissions?: { canProduceScreenshare?: string };
    on: (event: string, handler: (payload: never) => void) => void;
    enableAudio: () => Promise<void>;
    disableAudio: () => Promise<void>;
    enableVideo: () => Promise<void>;
    disableVideo: () => Promise<void>;
    enableScreenShare: () => Promise<void>;
    disableScreenShare: () => Promise<void>;
  };
  chat: {
    sendCustomMessage: (payload: {
      type: "custom";
      message?: string;
    }) => Promise<void>;
    on: (
      event: "chatUpdate",
      handler: (payload: {
        action: string;
        message: RealtimeKitChatMessage;
      }) => void,
    ) => void;
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
