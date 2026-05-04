import React from 'react';
import { Text, View } from 'react-native';

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
    const key = session.userId ?? session.user_id ?? session.id ?? Math.random().toString();
    if (!byUser.has(key)) {
      byUser.set(key, session);
    }
  }

  return Array.from(byUser.values()).slice(0, 6);
}

function AvatarDot({ uri }: { uri?: string | null }) {
  return (
    <View
      style={{
        width: 26,
        height: 26,
        borderRadius: 13,
        backgroundColor: uri ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.10)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.16)',
      }}
    />
  );
}

export function SpotSummaryCards({ metrics }: { metrics: Metric[] }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 10,
        backgroundColor: '#061421',
        paddingHorizontal: 18,
        paddingBottom: 18,
        borderBottomLeftRadius: 22,
        borderBottomRightRadius: 22,
        marginBottom: 16,
        borderWidth: 1,
        borderTopWidth: 0,
        borderColor: 'rgba(255,255,255,0.06)',
      }}
    >
      {metrics.map((metric) => {
        const avatars = uniqueSessionsByUser(metric.sessions);

        return (
          <View
            key={metric.label}
            style={{
              flex: 1,
              minHeight: 124,
              backgroundColor: '#071827',
              borderRadius: 18,
              padding: 14,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.08)',
            }}
          >
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: 'rgba(255,255,255,0.06)',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 10,
              }}
            >
              <Text style={{ color: metric.color, fontSize: 22, fontWeight: '900' }}>
                {metric.icon}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <Text style={{ color: '#fff', fontSize: 28, fontWeight: '900', marginRight: 6 }}>
                {metric.value}
              </Text>
              <Text style={{ color: metric.color, fontSize: 12, fontWeight: '900' }}>
                {metric.label}
              </Text>
            </View>

            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>riders</Text>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {avatars.map((session, index) => (
                <AvatarDot key={`${metric.label}-${session.userId ?? session.user_id ?? session.id ?? index}`} uri={session.userAvatarUrl} />
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}
