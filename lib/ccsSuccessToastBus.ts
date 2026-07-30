export const CCS_SUCCESS_TOAST_EVENT = "ccs-success-toast";
export const CCS_WARNING_TOAST_EVENT = "ccs-warning-toast";

type Detail = { message: string };

export function emitCcsSuccessToast(message: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CCS_SUCCESS_TOAST_EVENT, { detail: { message } }));
}

export function emitCcsWarningToast(message: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CCS_WARNING_TOAST_EVENT, { detail: { message } }));
}

export function isCcsSuccessToastEvent(
  e: Event
): e is CustomEvent<Detail> {
  return e.type === CCS_SUCCESS_TOAST_EVENT;
}

export function isCcsWarningToastEvent(
  e: Event
): e is CustomEvent<Detail> {
  return e.type === CCS_WARNING_TOAST_EVENT;
}
