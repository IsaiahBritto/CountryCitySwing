/** CSS class names for comp admin + judge buttons (styles in app/globals.css). */
export const compBtnOutline = "comp-btn-outline";
export const compBtnOutlineSm = "comp-btn-outline comp-btn-outline-sm";
export const compBtnOutlineLg = "comp-btn-outline comp-btn-outline-lg";
export const compBtnSecondary = "comp-btn-secondary";
export const compBtnTabActive =
  "comp-btn-outline comp-btn-outline-sm comp-btn-outline-active";
export const compBtnTabActiveSm = "comp-btn-tab-active-sm";
export const compBtnVoteYes = "comp-btn-vote-yes";
export const compBtnVoteYesSm = "comp-btn-vote-yes-sm";

/** Sticky bars on judge scoring sheets — matched top/bottom so they feel part of the page. */
export const judgeSheetStickyTop =
  "sticky top-16 z-40 -mx-4 mb-4 border-b border-neutral-800 bg-neutral-900/95 px-4 py-3 backdrop-blur";
export const judgeSheetStickyBottom =
  "sticky bottom-0 -mx-4 mt-4 border-t border-neutral-800 bg-neutral-900/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur";

/** @deprecated Use compBtnOutline */
export const compBtnPrimary = compBtnOutline;
/** @deprecated Use compBtnOutlineSm */
export const compBtnPrimarySm = compBtnOutlineSm;
/** @deprecated Use compBtnOutlineLg */
export const compBtnPrimaryLg = compBtnOutlineLg;
