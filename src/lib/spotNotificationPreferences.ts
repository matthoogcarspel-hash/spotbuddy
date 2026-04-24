import { normalizeSpotName } from './sessionHelpers';

export type SpotNotificationMode = 'off' | 'following' | 'everyone';

export const buildSpotNotificationPreferenceKey = (input: {
  userId: string | null | undefined;
  spotName: string | null | undefined;
}) => ({
  userId: (input.userId ?? '').trim() || null,
  spotName: normalizeSpotName(input.spotName),
});

export const normalizeSpotNotificationMode = (value: string | null | undefined): SpotNotificationMode => {
  const normalizedRawMode = typeof value === 'string'
    ? value.trim().toLowerCase()
    : null;
  return normalizedRawMode === 'off' || normalizedRawMode === 'following' || normalizedRawMode === 'everyone'
    ? normalizedRawMode
    : 'off';
};
