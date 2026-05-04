import React from 'react';
import { Image, Text, View } from 'react-native';

type SummarySession = {
  id?: string | null;
  userId?: string | null;
  user_id?: string | null;
  userAvatarUrl?: string | null;
};

type Metric = {
  icon: string;
  label: 'LIVE' | 'GOING' | 'MAYBE';
  helper: string;
  value: number;
  color: string;
  sessions?: SummarySession[];
};

function uniqueSessionsByUser(sessions: SummarySession[] = []) {
  const byUser = new Map<string, SummarySession>();

  for (const session of sessions) {
    const key = session.userId ?? session.user_id ?? session.id;
    if (!key) continue;
    if (!byUser.has(key)) byUser.set(key, session);
  }

  return Array.from(byUser.values());
}

function SummaryAvatar({ uri }: { uri?: string | null }) {
  if (!uri) {
    return (
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 19,
          backgroundColor: 'rgba(255,255,255,0.14)',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.22)',
        }}
      />
    );
  }

  return (
    <Image
      source={{ uri }}
      style={{
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: 'rgba(255,255,255,0.14)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.22)',
      }}
    />
  );
}

export function SpotSummaryCards({ metrics }: { metrics: Metric[] }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 12,
        backgroundColor: '#061421',
        paddingHorizontal: 18,
        paddingBottom: 22,
        borderBottomLeftRadius: 22,
        borderBottomRightRadius: 22,
        marginBottom: 20,
        borderWidth: 1,
        borderTopWidth: 0,
        borderColor: 'rgba(255,255,255,0.07)',
      }}
    >
      {metrics.map((metric) => {
        const uniqueAvatars = uniqueSessionsByUser(metric.sessions);
        const visibleAvatars = uniqueAvatars.slice(0, 5);
        const hiddenCount = Math.max(uniqueAvatars.length - visibleAvatars.length, 0);
        const isLive = metric.label === 'LIVE';

        return (
          <View
            key={metric.label}
            style={{
              flex: 1,
              minHeight: 170,
              backgroundColor: '#071827',
              borderRadius: 20,
              padding: 18,
              borderWidth: 1,
              borderLeftWidth: isLive && metric.value > 0 ? 4 : 1,
              borderColor: isLive && metric.value > 0 ? metric.color : 'rgba(255,255,255,0.09)',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View
                style={{
                  width: 58,
                  height: 58,
                  borderRadius: 29,
                  backgroundColor: `${metric.color}22`,
                  borderWidth: 1,
                  borderColor: `${metric.color}55`,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 14,
                }}
              >
                <Text style={{ color: metric.color, fontSize: 30, fontWeight: '900' }}>
                  {metric.icon}
                </Text>
              </View>

              <View>
                <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                  <Text style={{ color: '#fff', fontSize: 34, fontWeight: '900', marginRight: 7 }}>
                    {metric.value}
                  </Text>
                  <Text style={{ color: metric.color, fontSize: 14, fontWeight: '900' }}>
                    {metric.label}
                  </Text>
                </View>
                <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '700', marginTop: -4 }}>
                  riders
                </Text>
              </View>
            </View>

            <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginTop: 18, marginBottom: 12 }} />

            <Text style={{ color: 'rgba(255,255,255,0.72)', fontSize: 13, fontWeight: '600' }}>
              {metric.helper}
            </Text>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16, minHeight: 44 }}>
              {visibleAvatars.map((session, index) => (
                <SummaryAvatar
                  key={`${metric.label}-${session.userId ?? session.user_id ?? session.id ?? index}`}
                  uri={session.userAvatarUrl}
                />
              ))}

              {hiddenCount > 0 ? (
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 19,
                    backgroundColor: 'rgba(255,255,255,0.08)',
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.18)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '900' }}>
                    +{hiddenCount}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}
