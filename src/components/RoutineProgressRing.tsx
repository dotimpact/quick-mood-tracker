import React from 'react';

export interface RoutineProgressRingProps {
  completed: number;
  total: number;
  size?: number;
}

const RADIUS = 8.5;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Circular daily routine progress indicator matching PhotoMoodWidgetProvider's ring style.
 */
export const RoutineProgressRing: React.FC<RoutineProgressRingProps> = ({
  completed,
  total,
  size = 22,
}) => {
  const progress = total > 0 ? Math.min(1, Math.max(0, completed / total)) : 0;
  const isAllDone = total > 0 && completed >= total;

  const checkStroke = isAllDone
    ? '#68B088'
    : completed > 0
      ? 'rgba(255, 255, 255, 0.85)'
      : 'rgba(255, 255, 255, 0.35)';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 22 22"
      aria-hidden="true"
      className="block shrink-0"
    >
      <circle
        cx="11"
        cy="11"
        r="10.2"
        fill="#14201A"
        className="transition-opacity duration-200 motion-reduce:transition-none"
        style={{ opacity: isAllDone ? 1 : 0 }}
      />
      <circle
        cx="11"
        cy="11"
        r={RADIUS}
        fill="none"
        stroke="rgba(255, 255, 255, 0.14)"
        strokeWidth={2}
      />
      {progress > 0 && (
        <circle
          cx="11"
          cy="11"
          r={RADIUS}
          fill="none"
          stroke="#68B088"
          strokeWidth={2}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
          transform="rotate(-90 11 11)"
          className="transition-[stroke-dashoffset] duration-[420ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none"
        />
      )}
      <path
        d="M8.69 11.11 L10.45 12.87 L13.64 9.35"
        fill="none"
        stroke={checkStroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};
