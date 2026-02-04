import { useState, useRef, useEffect } from 'react';
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
  const iconRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isVisible && iconRef.current && tooltipRef.current) {
      const iconRect = iconRef.current.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      
      let top = 0;
      let left = 0;

      switch (position) {
        case 'top':
          top = iconRect.top - tooltipRect.height - 10;
          left = iconRect.left + (iconRect.width / 2) - (tooltipRect.width / 2);
          break;
        case 'bottom':
          top = iconRect.bottom + 10;
          left = iconRect.left + (iconRect.width / 2) - (tooltipRect.width / 2);
          break;
        case 'left':
          top = iconRect.top + (iconRect.height / 2) - (tooltipRect.height / 2);
          left = iconRect.left - tooltipRect.width - 10;
          break;
        case 'right':
          top = iconRect.top + (iconRect.height / 2) - (tooltipRect.height / 2);
          left = iconRect.right + 10;
          break;
      }

      // Ensure tooltip stays within viewport
      const padding = 10;
      if (left < padding) left = padding;
      if (left + tooltipRect.width > window.innerWidth - padding) {
        left = window.innerWidth - tooltipRect.width - padding;
      }
      if (top < padding) top = padding;
      if (top + tooltipRect.height > window.innerHeight - padding) {
        top = window.innerHeight - tooltipRect.height - padding;
      }

      setTooltipPosition({ top, left });
    }
  }, [isVisible, position]);

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
      {isVisible && (
        <div
          ref={tooltipRef}
          className={`info-tooltip-content ${position}`}
          style={{
            top: tooltipPosition.top,
            left: tooltipPosition.left,
            maxWidth: `${maxWidth}px`,
          }}
        >
          {title && <div className="info-tooltip-title">{title}</div>}
          <div className="info-tooltip-body">{content}</div>
        </div>
      )}
    </>
  );
}
