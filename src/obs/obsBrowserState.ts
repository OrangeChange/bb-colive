export function createObsMessageGate() {
  let identity = "";
  let sequence = 0;
  return {
    reset() {
      identity = "";
      sequence = 0;
    },
    accept(nextIdentity: string, nextSequence: number) {
      if (identity !== nextIdentity) {
        identity = nextIdentity;
        sequence = 0;
      }
      if (nextSequence <= sequence) return false;
      sequence = nextSequence;
      return true;
    },
  };
}
export function obsSamplePreferences<
  T extends { eventExpiry: { enabled: boolean; seconds: number } },
>(settings: T): T {
  return {
    ...settings,
    ...("capacity" in settings ? { capacity: 100 } : {}),
    ...("giftThreshold" in settings ? { giftThreshold: 0 } : {}),
    eventExpiry: { ...settings.eventExpiry, enabled: false },
  };
}

export function createObsGiftEffectGate() {
  let session: string | undefined;
  let sequence = 0;
  return {
    reset() {
      session = undefined;
      sequence = 0;
    },
    baseline(nextSession: string, nextSequence: number) {
      if (session !== nextSession) {
        session = nextSession;
        sequence = nextSequence;
      }
    },
    accept(nextSession: string, nextSequence: number) {
      if (session !== nextSession || nextSequence <= sequence) return false;
      sequence = nextSequence;
      return true;
    },
  };
}

export function obsGiftEffectResource(
  resource: import("../protocol/giftEffects.ts").GiftEffectResource,
  origin: string,
) {
  const address = (source: string, name: string) => {
    const token = btoa(new URL(source).href)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    return new URL(`/gift-effects/${token}/${name}`, origin).href;
  };
  return {
    ...resource,
    webMp4: address(resource.webMp4, "video.mp4"),
    webMp4Json: address(resource.webMp4Json, "config.json"),
  };
}
