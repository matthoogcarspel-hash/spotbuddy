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

  return Array.from(byUser.values()).slice(0, 6);
}

function SummaryAvatar({ uri }: { uri?: string | null }) {
  if (!uri) {
    return (
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
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
        width: 32,
        height: 32,
        borderRadius: 16,
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
        paddingBottom: 20,
        borderBottomLeftRadius: 22,
        borderBottomRightRadius: 22,
        marginBottom: 20,
        borderWidth: 1,
        borderTopWidth: 0,
        borderColor: 'rgba(255,255,255,0.07)',
      }}
    >
      {metrics.map((metric) => {
        const avatars = uniqueSessionsByUser(metric.sessions);

        return (
          <View
            key={metric.label}
            style={{
              flex: 1,
              minHeight: 138,
              backgroundColor: '#071827',
              borderRadius: 20,
              padding: 16,
              borderWidth: 1,
              borderColor: metric.label === 'LIVE' && metric.value > 0 ? metric.color : 'rgba(255,255,255,0.09)',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <View>
                <View
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 28,
                    backgroundColor: `${metric.color}24`,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 10,
                  }}
                >
                  <Text style={{ color: metric.color, fontSize: 28, fontWeight: '900' }}>
                    {metric.icon}
                  </Text>
                </View>

                <Text style={{ color: '#fff', fontSize: 32, fontWeight: '900' }}>
                  {metric.value}
                </Text>

                <Text style={{ color: metric.color, fontSize: 12, fontWeight: '900', marginTop: 2 }}>
                  {metric.label}
                </Text>
              </View>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, maxWidth: 80, justifyContent: 'flex-end' }}>
                {avatars.map((session, index) => (
                  <SummaryAvatar
                    key={`${metric.label}-${session.userId ?? session.user_id ?? session.id ?? index}`}
                    uri={session.userAvatarUrl}
                  />
                ))}
              </View>
            </View>

            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700', marginTop: 10 }}>
              riders
            </Text>

            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 4 }}>
              {metric.helper}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
