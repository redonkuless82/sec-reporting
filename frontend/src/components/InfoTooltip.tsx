import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import './InfoTooltip.css';

interface InfoTooltipProps {
  content: string | React.ReactNode;
  title?: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  maxWidth?: number;
}

export default function InfoTooltip({
  content,
  title,
  position = 'top',
  maxWidth = 300
}: InfoTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const [resolvedPosition, setResolvedPosition] = useState(position);
  const iconRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isVisible && iconRef.current && tooltipRef.current) {
      const iconRect = iconRef.current.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      const viewportPadding = 10;
      
      let top = 0;
      let left = 0;
      let finalPosition = position;

      switch (position) {
        case 'top':
          top = iconRect.top - tooltipRect.height - 10;
          left = iconRect.left + (iconRect.width / 2) - (tooltipRect.width / 2);
          if (top < viewportPadding) {
            top = iconRect.bottom + 10;
            finalPosition = 'bottom';
          }
          break;
        case 'bottom':
          top = iconRect.bottom + 10;
          left = iconRect.left + (iconRect.width / 2) - (tooltipRect.width / 2);
          if (top + tooltipRect.height > window.innerHeight - viewportPadding) {
            top = iconRect.top - tooltipRect.height - 10;
            finalPosition = 'top';
          }
          break;
        case 'left':
          top = iconRect.top + (iconRect.height / 2) - (tooltipRect.height / 2);
          left = iconRect.left - tooltipRect.width - 10;
          if (left < viewportPadding) {
            left = iconRect.right + 10;
            finalPosition = 'right';
          }
          break;
        case 'right':
          top = iconRect.top + (iconRect.height / 2) - (tooltipRect.height / 2);
          left = iconRect.right + 10;
          if (left + tooltipRect.width > window.innerWidth - viewportPadding) {
            left = iconRect.left - tooltipRect.width - 10;
            finalPosition = 'left';
          }
          break;
      }

      // Clamp within viewport bounds
      if (left < viewportPadding) left = viewportPadding;
      if (left + tooltipRect.width > window.innerWidth - viewportPadding) {
        left = window.innerWidth - tooltipRect.width - viewportPadding;
      }
      if (top < viewportPadding) top = viewportPadding;
      if (top + tooltipRect.height > window.innerHeight - viewportPadding) {
        top = window.innerHeight - tooltipRect.height - viewportPadding;
      }

      setTooltipPosition({ top, left });
      setResolvedPosition(finalPosition);
    }
  }, [isVisible, position]);

  const tooltipContent = isVisible ? (
    <div
      ref={tooltipRef}
      className={`info-tooltip-content ${resolvedPosition}`}
      style={{
        top: tooltipPosition.top,
        left: tooltipPosition.left,
        maxWidth: `${maxWidth}px`,
      }}
    >
      {title && <div className="info-tooltip-title">{title}</div>}
      <div className="info-tooltip-body">{content}</div>
    </div>
  ) : null;

  return (
    <>
      <span
        ref={iconRef}
        className="info-tooltip-icon"
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        onClick={() => setIsVisible(!isVisible)}
        role="button"
        tabIndex={0}
        aria-label="More information"
      >
        ℹ️
      </span>
      {tooltipContent && createPortal(tooltipContent, document.body)}
    </>
  );
}
