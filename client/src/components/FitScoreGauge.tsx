interface Props {
  score: number;
  size?: number;
}

export default function FitScoreGauge({ score, size = 100 }: Props) {
  const radius = (size - 16) / 2;
  const circumference = radius * Math.PI; // half circle
  const progress = Math.min(Math.max(score, 0), 100) / 100;
  const dashOffset = circumference * (1 - progress);

  const getColorClass = (s: number) => {
    if (s >= 70) return 'text-green-500';
    if (s >= 40) return 'text-yellow-500';
    return 'text-red-500';
  };

  const colorClass = getColorClass(score);

  return (
    <div
      className={`flex flex-col items-center gap-1 ${colorClass}`}
      style={{ width: size }}
      role="img"
      aria-label={`Fit score ${score} out of 100`}
    >
      <svg
        width={size}
        height={size / 2 + 8}
        viewBox={`0 0 ${size} ${size / 2 + 8}`}
        className="overflow-visible"
        aria-hidden="true"
      >
        {/* Background arc */}
        <path
          d={`M 8 ${size / 2} A ${radius} ${radius} 0 0 1 ${size - 8} ${size / 2}`}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="8"
          strokeLinecap="round"
          className="dark:stroke-gray-700"
        />
        {/* Progress arc */}
        <path
          d={`M 8 ${size / 2} A ${radius} ${radius} 0 0 1 ${size - 8} ${size / 2}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
        {/* Score text */}
        <text
          x={size / 2}
          y={size / 2 - 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={size * 0.22}
          fontWeight="bold"
          fill="currentColor"
        >
          {score}
        </text>
      </svg>
      <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Fit Score</span>
    </div>
  );
}
