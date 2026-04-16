import { DIFFICULTY_LABELS, DIFFICULTY_COLORS, type DifficultyLevel } from '../types';

interface Props {
  level: DifficultyLevel;
  compact?: boolean;
}

export default function DifficultyBadge({ level, compact }: Props) {
  const colors = DIFFICULTY_COLORS[level];

  if (compact) {
    return (
      <span
        className={`inline-block w-2.5 h-2.5 rounded-full ${colors.dot}`}
        title={DIFFICULTY_LABELS[level]}
      />
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${colors.badge}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
      {DIFFICULTY_LABELS[level]}
    </span>
  );
}
