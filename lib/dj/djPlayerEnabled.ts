export function computeDjPlayerEnabled(input: {
  hasAuthToken: boolean;
  isControllerMode: boolean;
  pendingTakeover: boolean;
  appleDeck: boolean;
  loading: boolean;
  isAdmin: boolean;
  audioUnlocked: boolean;
}): boolean {
  if (!input.hasAuthToken) return false;
  if (input.isControllerMode || input.pendingTakeover) return true;
  if (input.appleDeck) return !input.loading && input.isAdmin;
  return input.audioUnlocked;
}
