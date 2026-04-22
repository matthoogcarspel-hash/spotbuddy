import { getSelectedSpotName } from '../../lib/sessionHelpers';

type ActiveDay = 'today' | 'tomorrow';

type ActionType = 'planSession' | 'joinSession' | 'cancelSession';

type ActionResult = {
  ok: boolean;
  reason?: string | null;
};

type ActionStartContext = {
  type: ActionType;
  selectedSpot: string | { name?: string | null } | null;
  activeDay: ActiveDay;
};

export const logSessionUiActionStart = ({ type, selectedSpot, activeDay }: ActionStartContext) => {
  console.log('SESSION_UI_ACTION_START', {
    type,
    selectedSpot: getSelectedSpotName(selectedSpot),
    activeDay,
  });
};

export const logSessionUiActionResult = (type: ActionType, result: ActionResult | null | undefined) => {
  console.log('SESSION_UI_ACTION_RESULT', {
    type,
    ok: result?.ok ?? false,
    reason: result?.reason ?? null,
  });
};

export const getJoinErrorMessageByReason = (reason: string | null | undefined) => {
  const joinErrorMessageByReason: Record<string, string> = {
    USER_ALREADY_HAS_SESSION_ON_SPOT_DAY: 'You already have a session on this spot today',
    JOIN_NOT_ALLOWED: 'Join is not allowed for this session',
    UNKNOWN_ERROR: 'Session could not be joined. Please try again.',
  };

  return joinErrorMessageByReason[reason ?? ''] ?? 'Session could not be joined. Please try again.';
};

export const getCancelErrorMessage = () => 'Could not cancel session';
