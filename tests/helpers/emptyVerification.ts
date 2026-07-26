import type { PilotTaskVerification } from '../../src/lib/taskVerification';

export const EMPTY_PILOT_VERIFICATION: PilotTaskVerification = {
  crossings: [],
  sssCrossTime: null,
  assignedStartGate: null,
  assignedStartGateTime: null,
  earlyStart: false,
  earlyStartSeconds: 0,
  essCrossTime: null,
  goalCrossTime: null,
  landingTime: null,
  taskTimeSeconds: null,
  deadline: null,
  cappedAtDeadline: false,
  medianFixIntervalSec: null,
  warnings: [],
};
