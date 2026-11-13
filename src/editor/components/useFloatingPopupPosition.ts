import {
  useCallback,
  useLayoutEffect,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';

interface UseFloatingPopupPositionOptions {
  anchorRef: RefObject<HTMLElement | null>;
  popupRef: RefObject<HTMLElement | null>;
  align?: 'left' | 'right';
  offset?: number;
  viewportPadding?: number;
}

/**
 * Calcule dynamiquement une position `fixed` bornée à la fenêtre pour éviter
 * tout rognage par un parent `overflow-hidden` ou les bords de l'écran.
 */
export function useFloatingPopupPosition({
  anchorRef,
  popupRef,
  align = 'right',
  offset = 8,
  viewportPadding = 8,
}: UseFloatingPopupPositionOptions): CSSProperties {
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    maxHeight: number;
    ready: boolean;
  }>({
    top: 0,
    left: 0,
    maxHeight: 460,
    ready: false,
  });

  const updatePosition = useCallback(() => {
    const popupEl = popupRef.current;
    const anchorEl = anchorRef.current ?? popupEl?.parentElement ?? null;
    if (!anchorEl || !popupEl) {
      return;
    }

    const anchorRect = anchorEl.getBoundingClientRect();
    const popRect = popupEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const maxAllowedWidth = Math.max(220, vw - viewportPadding * 2);
    const popWidth = Math.min(popRect.width || 360, maxAllowedWidth);
    const desiredLeft =
      align === 'left' ? anchorRect.left : anchorRect.right - popWidth;
    const left = Math.max(
      viewportPadding,
      Math.min(desiredLeft, vw - popWidth - viewportPadding)
    );

    const spaceBelow = vh - anchorRect.bottom - offset - viewportPadding;
    const spaceAbove = anchorRect.top - offset - viewportPadding;
    const popHeight = popRect.height || 320;
    const placeBelow = popHeight <= spaceBelow || spaceBelow >= spaceAbove;

    const maxHeight = Math.max(180, vh - viewportPadding * 2);
    const clampedHeight = Math.min(popHeight, maxHeight);

    let top = placeBelow
      ? anchorRect.bottom + offset
      : anchorRect.top - clampedHeight - offset;
    top = Math.max(
      viewportPadding,
      Math.min(top, vh - clampedHeight - viewportPadding)
    );

    const nextTop = Math.round(top);
    const nextLeft = Math.round(left);
    const nextMaxHeight = Math.round(maxHeight);

    setCoords((prev) => {
      if (
        prev.ready &&
        prev.top === nextTop &&
        prev.left === nextLeft &&
        prev.maxHeight === nextMaxHeight
      ) {
        return prev;
      }
      return {
        top: nextTop,
        left: nextLeft,
        maxHeight: nextMaxHeight,
        ready: true,
      };
    });
  }, [anchorRef, popupRef, align, offset, viewportPadding]);

  useLayoutEffect(() => {
    updatePosition();

    const popupEl = popupRef.current;
    const observer =
      typeof ResizeObserver !== 'undefined' && popupEl
        ? new ResizeObserver(() => updatePosition())
        : null;
    if (observer && popupEl) {
      observer.observe(popupEl);
    }

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, {
      capture: true,
      passive: true,
    });

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [updatePosition, popupRef]);

  return {
    position: 'fixed',
    top: coords.top,
    left: coords.left,
    maxHeight: coords.maxHeight,
    zIndex: 60,
    visibility: coords.ready ? 'visible' : 'hidden',
  };
}
