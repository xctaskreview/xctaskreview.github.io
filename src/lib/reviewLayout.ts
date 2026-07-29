export const MOBILE_REVIEW_MAX_WIDTH_PX = 800;

const MOBILE_REVIEW_MEDIA_QUERY = `(max-width: ${MOBILE_REVIEW_MAX_WIDTH_PX}px)`;

export function isMobileReviewLayout(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(MOBILE_REVIEW_MEDIA_QUERY).matches;
}

export function subscribeMobileReviewLayout(onStoreChange: () => void): () => void {
  const mediaQuery = window.matchMedia(MOBILE_REVIEW_MEDIA_QUERY);
  mediaQuery.addEventListener('change', onStoreChange);
  return () => mediaQuery.removeEventListener('change', onStoreChange);
}
