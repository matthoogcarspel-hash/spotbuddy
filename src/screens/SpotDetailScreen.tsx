import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

export type SessionStatus = 'Is er al' | 'Gaat' | 'Uitchecken';

export type Session = {
  start: string;
  end: string;
  status: SessionStatus;
  userName: string;
};

type Message = {
  text: string;
  userName: string;
};

type PickerKey = 'startHour' | 'startMinute' | 'endHour' | 'endMinute' | null;

type SpotDetailScreenProps = {
  selectedSpot: string;
  userName: string;
  sessions: Session[];
  messages: Message[];
  onBack: () => void;
  onAddSession: (session: Session) => void;
  onUpdateSessionStatus: (sessionIndex: number, status: SessionStatus) => void;
  onSendMessage: (message: Message) => void;
};

const minuteOptions = [0, 15, 30, 45];
const timelineVisibleStatuses: SessionStatus[] = ['Gaat', 'Is er al'];
const planningStartMinutes = 8 * 60;
const planningEndMinutes = 21 * 60;
const timelineStartMinutes = planningStartMinutes;
const timelineEndMinutes = planningEndMinutes;
const startHourOptions = Array.from({ length: 13 }, (_, index) => 8 + index);
const endHourOptions = Array.from({ length: 14 }, (_, index) => 8 + index);
const timelineLabels = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '21:00'];
const formatTimePart = (value: number) => String(value).padStart(2, '0');
const parseTimeToMinutes = (time: string) => {
  const [hourPart, minutePart] = time.split(':');
  const hour = Number(hourPart);
  const minute = Number(minutePart);

  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return planningStartMinutes;
  }

  return hour * 60 + minute;
};
export default function SpotDetailScreen({
  selectedSpot,
  sessions,
  messages,
  userName,
  onBack,
  onAddSession,
  onUpdateSessionStatus,
  onSendMessage,
}: SpotDetailScreenProps) {
  const [showForm, setShowForm] = useState(false);
  const [activePicker, setActivePicker] = useState<PickerKey>(null);
  const [startHour, setStartHour] = useState<number | null>(null);
  const [startMinute, setStartMinute] = useState(0);
  const [endHour, setEndHour] = useState<number | null>(null);
  const [endMinute, setEndMinute] = useState(0);
  const [formError, setFormError] = useState('');
  const [messageInput, setMessageInput] = useState('');

  const timelineConfig = useMemo(() => {
    const visibleSessions = sessions
      .filter((session) => timelineVisibleStatuses.includes(session.status))
      .map((session) => ({
        session,
        startMinutes: parseTimeToMinutes(session.start),
        endMinutes: parseTimeToMinutes(session.end),
      }))
      .filter(({ startMinutes, endMinutes }) => startMinutes >= planningStartMinutes && endMinutes <= planningEndMinutes && endMinutes > startMinutes);

    return {
      visibleSessions,
      timelineStartMinutes,
      timelineEndMinutes,
      timelineRangeMinutes: timelineEndMinutes - timelineStartMinutes,
      timelineLabels,
    };
  }, [sessions]);

  const timelineSessions = useMemo(() => {
    const now = new Date();
    const nowTotalMinutes = now.getHours() * 60 + now.getMinutes();

    return timelineConfig.visibleSessions
      .filter(({ endMinutes }) => endMinutes > nowTotalMinutes && endMinutes > planningStartMinutes)
      .sort((first, second) => first.startMinutes - second.startMinutes);
  }, [timelineConfig.visibleSessions]);

  const currentTimeMarker = useMemo(() => {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    if (currentMinutes < timelineStartMinutes || currentMinutes > timelineEndMinutes) {
      return null;
    }

    const totalRange = timelineEndMinutes - timelineStartMinutes;
    const currentPercent = ((currentMinutes - timelineStartMinutes) / totalRange) * 100;

    return {
      currentPercent,
    };
  }, []);

  const resetForm = () => {
    setShowForm(false);
    setActivePicker(null);
    setStartHour(null);
    setStartMinute(0);
    setEndHour(null);
    setEndMinute(0);
    setFormError('');
  };

  const handleSave = () => {
    if (startHour === null || endHour === null) {
      setFormError('Choose a start and end time first.');
      return;
    }

    const startTotalMinutes = startHour * 60 + startMinute;
    const endTotalMinutes = endHour * 60 + endMinute;
    const now = new Date();
    const nowTotalMinutes = now.getHours() * 60 + now.getMinutes();

    if (startTotalMinutes < planningStartMinutes) {
      setFormError('You can only plan from 08:00');
      return;
    }

    if (endTotalMinutes > planningEndMinutes) {
      setFormError('You cannot plan later than 21:00');
      return;
    }

    if (endTotalMinutes <= startTotalMinutes) {
      setFormError('End time must be later than start time');
      return;
    }

    if (startTotalMinutes < nowTotalMinutes) {
      setFormError('Start time cannot be earlier than now.');
      return;
    }

    onAddSession({
      start: `${formatTimePart(startHour)}:${formatTimePart(startMinute)}`,
      end: `${formatTimePart(endHour)}:${formatTimePart(endMinute)}`,
      status: 'Gaat',
      userName,
    });

    resetForm();
  };

  const handleSendMessage = () => {
    const text = messageInput.trim();

    if (!text) {
      return;
    }

    onSendMessage({ text, userName });
    setMessageInput('');
  };

  const PickerField = ({
    label,
    value,
    onPress,
  }: {
    label: string;
    value: string;
    onPress: () => void;
  }) => (
    <Pressable
      onPress={() => {
        onPress();
        setFormError('');
      }}
      style={{
        backgroundColor: '#0b0f14',
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginBottom: 6,
      }}
    >
      <Text style={{ color: '#ffffff', fontSize: 15 }}>
        {label}: {value}
      </Text>
    </Pressable>
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#0b0f14' }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 30 }}>
      <Pressable onPress={onBack} style={{ marginBottom: 18 }}>
        <Text style={{ color: '#9db0c7', fontSize: 15 }}>← Back</Text>
      </Pressable>

      <View style={{ backgroundColor: '#121821', borderRadius: 12, padding: 16, marginBottom: 12 }}>
        <Text style={{ color: '#ffffff', fontSize: 24, fontWeight: '700' }}>{selectedSpot}</Text>

        <Pressable
          onPress={() => {
            setShowForm(true);
            setActivePicker(null);
            setFormError('');
          }}
          style={{ marginTop: 14, backgroundColor: '#2c6cdf', borderRadius: 11, paddingVertical: 9, paddingHorizontal: 12, alignItems: 'center' }}
        >
          <Text style={{ color: '#ffffff', fontSize: 15, fontWeight: '700' }}>Plan session</Text>
        </Pressable>

        {sessions.length > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
            <Pressable onPress={() => onUpdateSessionStatus(sessions.length - 1, 'Is er al')} style={{ flex: 1, marginRight: 8, backgroundColor: '#1f8a4b', borderRadius: 11, minHeight: 40, paddingVertical: 8, paddingHorizontal: 10, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ color: '#ffffff', fontSize: 15, fontWeight: '700' }}>Check in</Text>
            </Pressable>
            <Pressable onPress={() => onUpdateSessionStatus(sessions.length - 1, 'Uitchecken')} style={{ flex: 1, backgroundColor: '#a35a2a', borderRadius: 11, minHeight: 40, paddingVertical: 8, paddingHorizontal: 10, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ color: '#ffffff', fontSize: 15, fontWeight: '700' }}>Check out</Text>
            </Pressable>
          </View>
        ) : null}

        {showForm ? (
          <View style={{ marginTop: 14 }}>
            <Text style={{ color: '#9db0c7', fontSize: 14, marginBottom: 6 }}>Start time</Text>
            <View style={{ flexDirection: 'row' }}>
              <View style={{ flex: 1, marginRight: 4 }}>
                <PickerField label="Hour" value={startHour === null ? '--' : formatTimePart(startHour)} onPress={() => setActivePicker((prev) => (prev === 'startHour' ? null : 'startHour'))} />
              </View>
              <View style={{ flex: 1, marginLeft: 4 }}>
                <PickerField label="Minute" value={formatTimePart(startMinute)} onPress={() => setActivePicker((prev) => (prev === 'startMinute' ? null : 'startMinute'))} />
              </View>
            </View>
            {activePicker === 'startHour' ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
                {startHourOptions.map((hour) => (
                  <Pressable key={`start-hour-${hour}`} onPress={() => setStartHour(hour)} style={{ backgroundColor: startHour === hour ? '#9db0c7' : '#0b0f14', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10, marginRight: 8, marginBottom: 8 }}>
                    <Text style={{ color: startHour === hour ? '#0b0f14' : '#ffffff' }}>{formatTimePart(hour)}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {activePicker === 'startMinute' ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
                {minuteOptions.map((minute) => (
                  <Pressable key={`start-minute-${minute}`} onPress={() => setStartMinute(minute)} style={{ backgroundColor: startMinute === minute ? '#9db0c7' : '#0b0f14', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10, marginRight: 8, marginBottom: 8 }}>
                    <Text style={{ color: startMinute === minute ? '#0b0f14' : '#ffffff' }}>{formatTimePart(minute)}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            <Text style={{ color: '#9db0c7', fontSize: 14, marginBottom: 6 }}>End time</Text>
            <View style={{ flexDirection: 'row' }}>
              <View style={{ flex: 1, marginRight: 4 }}>
                <PickerField label="Hour" value={endHour === null ? '--' : formatTimePart(endHour)} onPress={() => setActivePicker((prev) => (prev === 'endHour' ? null : 'endHour'))} />
              </View>
              <View style={{ flex: 1, marginLeft: 4 }}>
                <PickerField label="Minute" value={formatTimePart(endMinute)} onPress={() => setActivePicker((prev) => (prev === 'endMinute' ? null : 'endMinute'))} />
              </View>
            </View>
            {activePicker === 'endHour' ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
                {endHourOptions.map((hour) => (
                  <Pressable key={`end-hour-${hour}`} onPress={() => setEndHour(hour)} style={{ backgroundColor: endHour === hour ? '#9db0c7' : '#0b0f14', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10, marginRight: 8, marginBottom: 8 }}>
                    <Text style={{ color: endHour === hour ? '#0b0f14' : '#ffffff' }}>{formatTimePart(hour)}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {activePicker === 'endMinute' ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
                {minuteOptions.map((minute) => (
                  <Pressable key={`end-minute-${minute}`} onPress={() => setEndMinute(minute)} style={{ backgroundColor: endMinute === minute ? '#9db0c7' : '#0b0f14', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10, marginRight: 8, marginBottom: 8 }}>
                    <Text style={{ color: endMinute === minute ? '#0b0f14' : '#ffffff' }}>{formatTimePart(minute)}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {formError ? <Text style={{ color: '#ff6b6b', fontSize: 14, marginBottom: 10 }}>{formError}</Text> : null}

            <Pressable onPress={handleSave} style={{ backgroundColor: '#2c6cdf', borderRadius: 11, paddingVertical: 10, paddingHorizontal: 12, width: '100%', alignItems: 'center' }}>
              <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '700' }}>Save</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <View style={{ backgroundColor: '#121821', borderRadius: 12, padding: 16, marginBottom: 12 }}>
        <Text style={{ color: '#ffffff', fontSize: 18, fontWeight: '700', marginBottom: 10 }}>Sessions</Text>

        <View style={{ marginLeft: 104, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between' }}>
          {timelineConfig.timelineLabels.map((label) => (
            <Text key={`timeline-label-${label}`} style={{ color: '#9db0c7', fontSize: 10 }}>
              {label}
            </Text>
          ))}
        </View>

        {timelineSessions.length > 0 ? (
          <View style={{ position: 'relative' }}>
            {currentTimeMarker ? (
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: 104,
                  right: 0,
                  top: -6,
                  bottom: 0,
                  zIndex: 3,
                }}
              >
                <View
                  style={{
                    position: 'absolute',
                    left: `${currentTimeMarker.currentPercent}%`,
                    top: 0,
                    bottom: 0,
                    width: 0,
                    borderLeftWidth: 1,
                    borderLeftColor: 'rgba(182, 216, 255, 0.5)',
                    borderStyle: 'dashed',
                  }}
                />
                <View
                  style={{
                    position: 'absolute',
                    left: `${currentTimeMarker.currentPercent}%`,
                    top: 0,
                    width: 8,
                    height: 8,
                    marginLeft: -4,
                    borderRadius: 4,
                    backgroundColor: '#dcecff',
                    shadowColor: '#cfe6ff',
                    shadowOpacity: 0.35,
                    shadowRadius: 4,
                    shadowOffset: { width: 0, height: 1 },
                  }}
                />
              </View>
            ) : null}

            {timelineSessions.map(({ session, startMinutes, endMinutes }, index) => {
              const clampedStartMinutes = Math.min(Math.max(startMinutes, timelineStartMinutes), timelineConfig.timelineEndMinutes);
              const clampedEndMinutes = Math.min(Math.max(endMinutes, timelineStartMinutes), timelineConfig.timelineEndMinutes);
              const startRatio = (clampedStartMinutes - timelineStartMinutes) / timelineConfig.timelineRangeMinutes;
              const widthRatio = Math.max((clampedEndMinutes - clampedStartMinutes) / timelineConfig.timelineRangeMinutes, 0);
              const leftPercent = startRatio * 100;
              const widthPercent = Math.max(widthRatio * 100, 6);
              const barColor = session.status === 'Is er al' ? '#1f8a4b' : '#375f9b';

              return (
                <View key={`timeline-session-${session.userName}-${session.start}-${session.end}-${index}`} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                  <Text style={{ color: '#ffffff', fontSize: 14, width: 96, marginRight: 8 }} numberOfLines={1}>
                    {session.userName}
                  </Text>
                  <View style={{ flex: 1, height: 30, backgroundColor: '#0b0f14', borderRadius: 8, position: 'relative', justifyContent: 'center', overflow: 'hidden' }}>
                    {timelineConfig.timelineLabels.map((_, labelIndex) => {
                      const leftPercent = (labelIndex / (timelineConfig.timelineLabels.length - 1)) * 100;
                      return (
                        <View
                          key={`timeline-marker-${session.userName}-${session.start}-${labelIndex}`}
                          style={{
                            position: 'absolute',
                            left: `${leftPercent}%`,
                            top: 0,
                            bottom: 0,
                            width: 1,
                            backgroundColor: '#1e2733',
                          }}
                        />
                      );
                    })}
                    <View
                      style={{
                        position: 'absolute',
                        left: `${leftPercent}%`,
                        width: `${widthPercent}%`,
                        minWidth: 24,
                        height: 20,
                        borderRadius: 6,
                        backgroundColor: barColor,
                      }}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <Text style={{ color: '#9db0c7', fontSize: 14 }}>No active sessions for today.</Text>
        )}
      </View>

      <View style={{ backgroundColor: '#121821', borderRadius: 12, padding: 16 }}>
        <Text style={{ color: '#ffffff', fontSize: 18, fontWeight: '700', marginBottom: 8 }}>Chat</Text>

        {messages.length > 0 ? (
          <View style={{ marginBottom: 10 }}>
            {messages.map((message, index) => (
              <Text key={`${message.text}-${index}`} style={{ color: '#ffffff', fontSize: 15, marginBottom: 6 }}>
                {message.userName}: {message.text}
              </Text>
            ))}
          </View>
        ) : (
          <Text style={{ color: '#9db0c7', fontSize: 15, marginBottom: 10 }}>No messages yet</Text>
        )}

        <TextInput
          value={messageInput}
          onChangeText={setMessageInput}
          placeholder="Type a message"
          placeholderTextColor="#9db0c7"
          style={{ backgroundColor: '#0b0f14', color: '#ffffff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10 }}
        />
        <Pressable onPress={handleSendMessage} style={{ backgroundColor: '#0b0f14', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12 }}>
          <Text style={{ color: '#ffffff', fontSize: 15, fontWeight: '600' }}>Send</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
