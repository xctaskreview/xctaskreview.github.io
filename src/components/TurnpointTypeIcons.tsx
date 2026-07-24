interface TurnpointTypeLetterProps {
  className?: string;
}

export function TurnpointStartIcon({ className }: TurnpointTypeLetterProps) {
  return (
    <span className={['welcome-task-edit-type-letter', className].filter(Boolean).join(' ')} aria-hidden="true">
      S
    </span>
  );
}

export function TurnpointGoalIcon({ className }: TurnpointTypeLetterProps) {
  return (
    <span className={['welcome-task-edit-type-letter', className].filter(Boolean).join(' ')} aria-hidden="true">
      G
    </span>
  );
}
