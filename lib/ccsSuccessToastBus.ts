export const CCS_SUCCESS_TOAST_EVENT = "ccs-success-toast";

type Detail = { message: string };

export function emitCcsSuccessToast(message: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CCS_SUCCESS_TOAST_EVENT, { detail: { message } }));
}

export function isCcsSuccessToastEvent(
  e: Event
): e is CustomEvent<Detail> {
  return e.type === CCS_SUCCESS_TOAST_EVENT;
}
