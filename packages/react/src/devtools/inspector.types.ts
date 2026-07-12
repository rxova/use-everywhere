export interface InspectorProps {
  /** Which bus to watch. Defaults to the shared default name. */
  name?: string;
  /** Corner to dock in. Default 'bottom-right'. */
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  /** How many wires to keep in the log. Default 50. */
  limit?: number;
  /** Start expanded. Default false. */
  defaultOpen?: boolean;
  /**
   * How long a leader wire keeps the crown before it is treated as stale.
   * Should match the Leader's leaseMs. Default 3000.
   */
  leaseMs?: number;
}
