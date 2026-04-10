import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

export type SessionStatus = 'Is er al' | 'Gaat' | 'Ik ben geweest';

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

const hours = Array.from({ length: 24 }, (_, index) => index);
const minuteOptions = [0, 15, 30, 45];
const statusOrder: SessionStatus[] = ['Gaat', 'Is er al', 'Ik ben geweest'];
const formatTimePart = (value: number) => String(value).padStart(2, '0');

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

  const sessionsByStatus = useMemo(
    () => ({
      'Is er al': sessions.filter((session) => session.status === 'Is er al'),
      Gaat: sessions.filter((session) => session.status === 'Gaat'),
      'Ik ben geweest': sessions.filter((session) => session.status === 'Ik ben geweest'),
    }),
    [sessions],
  );

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
      setFormError('Kies eerst een start- en eindtijd.');
      return;
    }

    const startTotalMinutes = startHour * 60 + startMinute;
    const endTotalMinutes = endHour * 60 + endMinute;
    const now = new Date();
    const nowTotalMinutes = now.getHours() * 60 + now.getMinutes();

    if (startTotalMinutes < nowTotalMinutes) {
      setFormError('Starttijd kan niet eerder zijn dan nu.');
      return;
    }

    if (endTotalMinutes <= startTotalMinutes) {
      setFormError('Eindtijd moet later zijn dan starttijd.');
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
        <Text style={{ color: '#9db0c7', fontSize: 15 }}>← Terug</Text>
      </Pressable>

      <View style={{ backgroundColor: '#121821', borderRadius: 12, padding: 16, marginBottom: 12 }}>
        <Text style={{ color: '#ffffff', fontSize: 24, fontWeight: '700' }}>{selectedSpot}</Text>

        <Pressable
          onPress={() => {
            setShowForm(true);
            setActivePicker(null);
            setFormError('');
          }}
          style={{ marginTop: 14, backgroundColor: '#0b0f14', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12 }}
        >
          <Text style={{ color: '#ffffff', fontSize: 15, fontWeight: '600' }}>Ik ga vandaag</Text>
        </Pressable>

        {sessions.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Pressable onPress={() => onUpdateSessionStatus(sessions.length - 1, 'Is er al')} style={{ marginTop: 10, marginRight: 8, backgroundColor: '#0b0f14', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12 }}>
              <Text style={{ color: '#ffffff', fontSize: 15, fontWeight: '600' }}>Ik ben er</Text>
            </Pressable>
            <Pressable onPress={() => onUpdateSessionStatus(sessions.length - 1, 'Ik ben geweest')} style={{ marginTop: 10, backgroundColor: '#0b0f14', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12 }}>
              <Text style={{ color: '#ffffff', fontSize: 15, fontWeight: '600' }}>Ik ben geweest</Text>
            </Pressable>
          </View>
        ) : null}

        {showForm ? (
          <View style={{ marginTop: 14 }}>
            <Text style={{ color: '#9db0c7', fontSize: 14, marginBottom: 6 }}>Starttijd</Text>
            <PickerField label="Uur" value={startHour === null ? '--' : formatTimePart(startHour)} onPress={() => setActivePicker((prev) => (prev === 'startHour' ? null : 'startHour'))} />
            {activePicker === 'startHour' ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
                {hours.map((hour) => (
                  <Pressable key={`start-hour-${hour}`} onPress={() => setStartHour(hour)} style={{ backgroundColor: startHour === hour ? '#9db0c7' : '#0b0f14', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10, marginRight: 8, marginBottom: 8 }}>
                    <Text style={{ color: startHour === hour ? '#0b0f14' : '#ffffff' }}>{formatTimePart(hour)}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            <PickerField label="Minuut" value={formatTimePart(startMinute)} onPress={() => setActivePicker((prev) => (prev === 'startMinute' ? null : 'startMinute'))} />
            {activePicker === 'startMinute' ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
                {minuteOptions.map((minute) => (
                  <Pressable key={`start-minute-${minute}`} onPress={() => setStartMinute(minute)} style={{ backgroundColor: startMinute === minute ? '#9db0c7' : '#0b0f14', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10, marginRight: 8, marginBottom: 8 }}>
                    <Text style={{ color: startMinute === minute ? '#0b0f14' : '#ffffff' }}>{formatTimePart(minute)}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            <Text style={{ color: '#9db0c7', fontSize: 14, marginBottom: 6 }}>Eindtijd</Text>
            <PickerField label="Uur" value={endHour === null ? '--' : formatTimePart(endHour)} onPress={() => setActivePicker((prev) => (prev === 'endHour' ? null : 'endHour'))} />
            {activePicker === 'endHour' ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
                {hours.map((hour) => (
                  <Pressable key={`end-hour-${hour}`} onPress={() => setEndHour(hour)} style={{ backgroundColor: endHour === hour ? '#9db0c7' : '#0b0f14', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10, marginRight: 8, marginBottom: 8 }}>
                    <Text style={{ color: endHour === hour ? '#0b0f14' : '#ffffff' }}>{formatTimePart(hour)}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            <PickerField label="Minuut" value={formatTimePart(endMinute)} onPress={() => setActivePicker((prev) => (prev === 'endMinute' ? null : 'endMinute'))} />
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

            <Pressable onPress={handleSave} style={{ backgroundColor: '#0b0f14', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12 }}>
              <Text style={{ color: '#ffffff', fontSize: 15, fontWeight: '600' }}>Opslaan</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <View style={{ backgroundColor: '#121821', borderRadius: 12, padding: 16, marginBottom: 12 }}>
        <Text style={{ color: '#ffffff', fontSize: 18, fontWeight: '700', marginBottom: 8 }}>Sessies</Text>
        {sessions.length > 0 ? (
          statusOrder.map((status) => {
            const sessionsForStatus = sessionsByStatus[status];
            return (
              <View key={status} style={{ marginBottom: 10 }}>
                <Text style={{ color: '#9db0c7', fontSize: 14, marginBottom: 6, fontWeight: '600' }}>{status}</Text>
                {sessionsForStatus.length > 0 ? (
                  sessionsForStatus.map((session, index) => {
                    const sessionIndex = sessions.findIndex((item) => item === session);

                    return (
                      <View key={`${session.start}-${session.end}-${index}`} style={{ marginBottom: 8 }}>
                        <Text style={{ color: '#ffffff', fontSize: 15, marginBottom: 6 }}>
                          {session.userName}: {session.start} - {session.end}
                        </Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                          {statusOrder.map((nextStatus) => (
                            <Pressable
                              key={`${session.start}-${session.end}-${index}-${nextStatus}`}
                              onPress={() => onUpdateSessionStatus(sessionIndex, nextStatus)}
                              style={{
                                backgroundColor: session.status === nextStatus ? '#9db0c7' : '#0b0f14',
                                borderRadius: 8,
                                paddingVertical: 6,
                                paddingHorizontal: 8,
                                marginRight: 6,
                                marginBottom: 6,
                              }}
                            >
                              <Text style={{ color: session.status === nextStatus ? '#0b0f14' : '#ffffff', fontSize: 12 }}>{nextStatus}</Text>
                            </Pressable>
                          ))}
                        </View>
                      </View>
                    );
                  })
                ) : (
                  <Text style={{ color: '#9db0c7', fontSize: 14, marginBottom: 4 }}>Nog niemand</Text>
                )}
              </View>
            );
          })
        ) : (
          <View>
            <Text style={{ color: '#9db0c7', fontSize: 15 }}>Nog niemand ingepland</Text>
            <Text style={{ color: '#9db0c7', fontSize: 15, marginTop: 4 }}>Jij kunt de eerste zijn</Text>
          </View>
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
          <Text style={{ color: '#9db0c7', fontSize: 15, marginBottom: 10 }}>Nog geen berichten</Text>
        )}

        <TextInput
          value={messageInput}
          onChangeText={setMessageInput}
          placeholder="Typ een bericht"
          placeholderTextColor="#9db0c7"
          style={{ backgroundColor: '#0b0f14', color: '#ffffff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10 }}
        />
        <Pressable onPress={handleSendMessage} style={{ backgroundColor: '#0b0f14', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12 }}>
          <Text style={{ color: '#ffffff', fontSize: 15, fontWeight: '600' }}>Verstuur</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
