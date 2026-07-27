import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import {
  REVIEW_WALKTHROUGH_STEPS,
  type ReviewWalkthroughStepId,
} from '../lib/reviewWalkthrough';

const SPOTLIGHT_PADDING = 8;
const TOOLTIP_GAP = 12;
const VIEWPORT_MARGIN = 16;

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface ReviewWalkthroughProps {
  active: boolean;
  onClose: (completed: boolean) => void;
  onStepChange: (stepId: ReviewWalkthroughStepId) => void;
}

function measureTarget(selector: string): SpotlightRect | null {
  const element = document.querySelector(selector);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return {
    top: rect.top - SPOTLIGHT_PADDING,
    left: rect.left - SPOTLIGHT_PADDING,
    width: rect.width + SPOTLIGHT_PADDING * 2,
    height: rect.height + SPOTLIGHT_PADDING * 2,
  };
}

export function ReviewWalkthrough({ active, onClose, onStepChange }: ReviewWalkthroughProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null);
  const [skipHintVisible, setSkipHintVisible] = useState(false);

  const step = REVIEW_WALKTHROUGH_STEPS[stepIndex];
  const isLastStep = stepIndex >= REVIEW_WALKTHROUGH_STEPS.length - 1;

  const updateSpotlight = useCallback(() => {
    if (!active || skipHintVisible || !step) {
      setSpotlight(null);
      return;
    }
    setSpotlight(measureTarget(step.target));
  }, [active, skipHintVisible, step]);

  useEffect(() => {
    if (!active) {
      setStepIndex(0);
      setSkipHintVisible(false);
      setSpotlight(null);
      return;
    }
    setStepIndex(0);
    setSkipHintVisible(false);
  }, [active]);

  useEffect(() => {
    if (!active || skipHintVisible || !step) return;
    onStepChange(step.id);
  }, [active, skipHintVisible, step, onStepChange]);

  useLayoutEffect(() => {
    updateSpotlight();
  }, [updateSpotlight, stepIndex, skipHintVisible]);

  useEffect(() => {
    if (!active) return;

    const onLayoutChange = () => updateSpotlight();
    window.addEventListener('resize', onLayoutChange);
    window.addEventListener('scroll', onLayoutChange, true);
    const retry = window.setTimeout(updateSpotlight, 120);
    const retryAgain = window.setTimeout(updateSpotlight, 400);
    const retryLate = window.setTimeout(updateSpotlight, 700);

    return () => {
      window.removeEventListener('resize', onLayoutChange);
      window.removeEventListener('scroll', onLayoutChange, true);
      window.clearTimeout(retry);
      window.clearTimeout(retryAgain);
      window.clearTimeout(retryLate);
    };
  }, [active, updateSpotlight, stepIndex, skipHintVisible]);

  useEffect(() => {
    if (!active) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSkipHintVisible(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active]);

  if (!active) return null;

  const handleNext = () => {
    if (isLastStep) {
      onClose(true);
      return;
    }
    setStepIndex((value) => value + 1);
  };

  const handleBack = () => {
    setSkipHintVisible(false);
    setStepIndex((value) => Math.max(0, value - 1));
  };

  const handleSkipConfirm = () => {
    onClose(false);
  };

  const tooltipStyle = (() => {
    if (!spotlight || skipHintVisible) {
      return undefined;
    }

    const dialogMaxHeight = 280;
    const belowTop = spotlight.top + spotlight.height + TOOLTIP_GAP;
    const fitsBelow = belowTop + dialogMaxHeight <= window.innerHeight - VIEWPORT_MARGIN;
    const top = fitsBelow
      ? belowTop
      : Math.max(VIEWPORT_MARGIN, spotlight.top - dialogMaxHeight - TOOLTIP_GAP);
    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, spotlight.left + spotlight.width / 2 - 180),
      window.innerWidth - 360 - VIEWPORT_MARGIN,
    );

    return { top, left };
  })();

  return createPortal(
    <div className="review-walkthrough-root" role="presentation">
      {(skipHintVisible || (!skipHintVisible && !spotlight)) && (
        <div className="review-walkthrough-backdrop" aria-hidden="true" />
      )}
      {!skipHintVisible && spotlight && (
        <div
          className="review-walkthrough-spotlight"
          style={{
            top: spotlight.top,
            left: spotlight.left,
            width: spotlight.width,
            height: spotlight.height,
          }}
        />
      )}

      <div
        className={`review-walkthrough-dialog${
          skipHintVisible || !tooltipStyle ? ' review-walkthrough-dialog-centered' : ''
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-walkthrough-title"
        style={tooltipStyle}
      >
        {skipHintVisible ? (
          <>
            <h2 id="review-walkthrough-title" className="review-walkthrough-title">
              Tour skipped
            </h2>
            <p className="review-walkthrough-body">
              Open the <strong>XC Task Review</strong> icon in the top-left toolbar, then choose{' '}
              <strong>Walkthrough</strong> in the app menu (above GitHub) to run this tour again.
            </p>
            <div className="review-walkthrough-actions">
              <button type="button" className="review-walkthrough-primary" onClick={handleSkipConfirm}>
                Got it
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="review-walkthrough-step-count" aria-live="polite">
              Step {stepIndex + 1} of {REVIEW_WALKTHROUGH_STEPS.length}
            </p>
            <h2 id="review-walkthrough-title" className="review-walkthrough-title">
              {step.title}
            </h2>
            <p className="review-walkthrough-body">{step.body}</p>
            <div className="review-walkthrough-actions">
              <button
                type="button"
                className="review-walkthrough-link"
                onClick={() => setSkipHintVisible(true)}
              >
                Skip tour
              </button>
              <div className="review-walkthrough-nav">
                <button
                  type="button"
                  className="review-walkthrough-icon-button"
                  disabled={stepIndex === 0}
                  aria-label="Previous step"
                  onClick={handleBack}
                >
                  <Icon icon={ChevronLeft} size="sm" />
                </button>
                <button
                  type="button"
                  className="review-walkthrough-icon-button review-walkthrough-icon-button-primary"
                  aria-label={isLastStep ? 'Finish tour' : 'Next step'}
                  onClick={handleNext}
                >
                  <Icon icon={isLastStep ? Check : ChevronRight} size="sm" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
