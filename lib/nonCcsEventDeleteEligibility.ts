export type CommunityEventDeleteEligibility = {
  canDelete: boolean;
  deleteBlockReason: string | null;
  hasPublishedResults: boolean;
  signupCount: number;
};

export function deleteEligibilityFromChecks(opts: {
  signupCount: number;
  hasPublishedResults: boolean;
  hasNonTestRegistrants?: boolean;
}): CommunityEventDeleteEligibility {
  const { signupCount, hasPublishedResults } = opts;
  const hasNonTestRegistrants = opts.hasNonTestRegistrants ?? signupCount > 0;
  if (hasPublishedResults) {
    return {
      canDelete: false,
      deleteBlockReason:
        "This event cannot be deleted because competition results have been published.",
      hasPublishedResults: true,
      signupCount,
    };
  }
  if (hasNonTestRegistrants) {
    return {
      canDelete: false,
      deleteBlockReason:
        "This event cannot be deleted after dancers have registered.",
      hasPublishedResults: false,
      signupCount,
    };
  }
  return {
    canDelete: true,
    deleteBlockReason: null,
    hasPublishedResults: false,
    signupCount,
  };
}