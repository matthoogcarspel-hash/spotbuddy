import { SafeAreaView, View, Text, Pressable, TextInput, ScrollView } from 'react-native';
import { useState } from 'react';

const spots = [
  'Scheveningen KZVS',
  'Scheveningen Jump Team',
  'Noordwijk KSN',
  'Rockanje 1e Slag',
  'Rockanje 2e Slag',
  'Maasvlakte 2 Slufter',
];

type Session = {
  start: string;
  end: string;
};

type PickerKey = 'startHour' | 'startMinute' | 'endHour' | 'endMinute' | null;

const hours = Array.from({ length: 24 }, (_, index) => index);
const minuteOptions = [0, 15, 30, 45];

const formatTimePart = (value: number) => String(value).padStart(2, '0');

export default function App() {
  const [selectedSpot, setSelectedSpot] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [activePicker, setActivePicker] = useState<PickerKey>(null);
  const [startHour, setStartHour] = useState<number | null>(null);
  const [startMinute, setStartMinute] = useState<number | null>(null);
  const [endHour, setEndHour] = useState<number | null>(null);
  const [endMinute, setEndMinute] = useState<number | null>(null);
  const [formError, setFormError] = useState('');
  const [sessionsBySpot, setSessionsBySpot] = useState<Record<string, Session[]>>({});
  const [messagesBySpot, setMessagesBySpot] = useState<Record<string, string[]>>({});
  const [messageInput, setMessageInput] = useState('');

  const currentSessions = selectedSpot ? sessionsBySpot[selectedSpot] ?? [] : [];
  const currentMessages = selectedSpot ? messagesBySpot[selectedSpot] ?? [] : [];

  const getKiterText = (count: number) => {
    if (count === 1) {
      return '1 kiter vandaag';
    }

    return `${count} kiters vandaag`;
  };

  const resetForm = () => {
    setShowForm(false);
    setActivePicker(null);
    setStartHour(null);
    setStartMinute(null);
    setEndHour(null);
    setEndMinute(null);
    setFormError('');
  };

  const handleSave = () => {
    if (!selectedSpot) {
      return;
    }

    if (startHour === null || startMinute === null || endHour === null || endMinute === null) {
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

    const start = `${formatTimePart(startHour)}:${formatTimePart(startMinute)}`;
    const end = `${formatTimePart(endHour)}:${formatTimePart(endMinute)}`;

    setSessionsBySpot((prev) => ({
      ...prev,
      [selectedSpot]: [...(prev[selectedSpot] ?? []), { start, end }],
    }));

    resetForm();
  };

  const handleSendMessage = () => {
    if (!selectedSpot) {
      return;
    }

    const text = messageInput.trim();

    if (!text) {
      return;
    }

    setMessagesBySpot((prev) => ({
      ...prev,
      [selectedSpot]: [...(prev[selectedSpot] ?? []), text],
    }));
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
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: '#0b0f14',
        paddingHorizontal: 20,
        paddingTop: 20,
      }}
    >
      {!selectedSpot ? (
        <View>
          <View style={{ marginBottom: 20 }}>
            <Text style={{ color: '#ffffff', fontSize: 34, fontWeight: '700' }}>SpotBuddy</Text>
            <Text style={{ color: '#9db0c7', fontSize: 16, marginTop: 6 }}>
              Wie gaat waar vandaag?
            </Text>
          </View>

          <View>
            {spots.map((spot) => {
              const kiterCount = sessionsBySpot[spot]?.length ?? 0;

              return (
                <Pressable
                  key={spot}
                  onPress={() => {
                    setSelectedSpot(spot);
                    resetForm();
                    setMessageInput('');
                  }}
                  style={{
                    backgroundColor: '#121821',
                    borderRadius: 12,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    marginBottom: 10,
                  }}
                >
                  <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '600' }}>{spot}</Text>
                  <Text style={{ color: '#9db0c7', fontSize: 14, marginTop: 4 }}>
                    {getKiterText(kiterCount)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : (
        <ScrollView>
          <Pressable
            onPress={() => {
              setSelectedSpot(null);
              resetForm();
              setMessageInput('');
            }}
            style={{ marginBottom: 18 }}
          >
            <Text style={{ color: '#9db0c7', fontSize: 15 }}>← Terug</Text>
          </Pressable>

          <View
            style={{
              backgroundColor: '#121821',
              borderRadius: 12,
              padding: 16,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: '#ffffff', fontSize: 24, fontWeight: '700' }}>{selectedSpot}</Text>

            <Pressable
              onPress={() => {
                setShowForm(true);
                setActivePicker(null);
                setFormError('');
              }}
              style={{
                marginTop: 14,
                backgroundColor: '#0b0f14',
                borderRadius: 10,
                paddingVertical: 10,
                paddingHorizontal: 12,
              }}
            >
              <Text style={{ color: '#ffffff', fontSize: 15, fontWeight: '600' }}>Ik ga vandaag</Text>
            </Pressable>

            {showForm ? (
              <View style={{ marginTop: 14 }}>
                <Text style={{ color: '#9db0c7', fontSize: 14, marginBottom: 6 }}>Starttijd</Text>
                <PickerField
                  label="Uur"
                  value={startHour === null ? '--' : formatTimePart(startHour)}
                  onPress={() => setActivePicker((prev) => (prev === 'startHour' ? null : 'startHour'))}
                />
                {activePicker === 'startHour' ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
                    {hours.map((hour) => (
                      <Pressable
                        key={`start-hour-${hour}`}
                        onPress={() => {
                          setStartHour(hour);
                          setFormError('');
                        }}
                        style={{
                          backgroundColor: startHour === hour ? '#9db0c7' : '#0b0f14',
                          borderRadius: 8,
                          paddingVertical: 8,
                          paddingHorizontal: 10,
                          marginRight: 8,
                          marginBottom: 8,
                        }}
                      >
                        <Text style={{ color: startHour === hour ? '#0b0f14' : '#ffffff' }}>
                          {formatTimePart(hour)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}

                <PickerField
                  label="Minuut"
                  value={startMinute === null ? '--' : formatTimePart(startMinute)}
                  onPress={() =>
                    setActivePicker((prev) => (prev === 'startMinute' ? null : 'startMinute'))
                  }
                />
                {activePicker === 'startMinute' ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
                    {minuteOptions.map((minute) => (
                      <Pressable
                        key={`start-minute-${minute}`}
                        onPress={() => {
                          setStartMinute(minute);
                          setFormError('');
                        }}
                        style={{
                          backgroundColor: startMinute === minute ? '#9db0c7' : '#0b0f14',
                          borderRadius: 8,
                          paddingVertical: 8,
                          paddingHorizontal: 10,
                          marginRight: 8,
                          marginBottom: 8,
                        }}
                      >
                        <Text style={{ color: startMinute === minute ? '#0b0f14' : '#ffffff' }}>
                          {formatTimePart(minute)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}

                <Text style={{ color: '#9db0c7', fontSize: 14, marginBottom: 6 }}>Eindtijd</Text>
                <PickerField
                  label="Uur"
                  value={endHour === null ? '--' : formatTimePart(endHour)}
                  onPress={() => setActivePicker((prev) => (prev === 'endHour' ? null : 'endHour'))}
                />
                {activePicker === 'endHour' ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
                    {hours.map((hour) => (
                      <Pressable
                        key={`end-hour-${hour}`}
                        onPress={() => {
                          setEndHour(hour);
                          setFormError('');
                        }}
                        style={{
                          backgroundColor: endHour === hour ? '#9db0c7' : '#0b0f14',
                          borderRadius: 8,
                          paddingVertical: 8,
                          paddingHorizontal: 10,
                          marginRight: 8,
                          marginBottom: 8,
                        }}
                      >
                        <Text style={{ color: endHour === hour ? '#0b0f14' : '#ffffff' }}>
                          {formatTimePart(hour)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}

                <PickerField
                  label="Minuut"
                  value={endMinute === null ? '--' : formatTimePart(endMinute)}
                  onPress={() => setActivePicker((prev) => (prev === 'endMinute' ? null : 'endMinute'))}
                />
                {activePicker === 'endMinute' ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
                    {minuteOptions.map((minute) => (
                      <Pressable
                        key={`end-minute-${minute}`}
                        onPress={() => {
                          setEndMinute(minute);
                          setFormError('');
                        }}
                        style={{
                          backgroundColor: endMinute === minute ? '#9db0c7' : '#0b0f14',
                          borderRadius: 8,
                          paddingVertical: 8,
                          paddingHorizontal: 10,
                          marginRight: 8,
                          marginBottom: 8,
                        }}
                      >
                        <Text style={{ color: endMinute === minute ? '#0b0f14' : '#ffffff' }}>
                          {formatTimePart(minute)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}

                {formError ? (
                  <Text style={{ color: '#ff6b6b', fontSize: 14, marginBottom: 10 }}>{formError}</Text>
                ) : null}

                <Pressable
                  onPress={handleSave}
                  style={{
                    backgroundColor: '#0b0f14',
                    borderRadius: 10,
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                  }}
                >
                  <Text style={{ color: '#ffffff', fontSize: 15, fontWeight: '600' }}>Opslaan</Text>
                </Pressable>
              </View>
            ) : null}
          </View>

          <View
            style={{
              backgroundColor: '#121821',
              borderRadius: 12,
              padding: 16,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: '#ffffff', fontSize: 18, fontWeight: '700', marginBottom: 8 }}>
              Sessies
            </Text>
            {currentSessions.length > 0 ? (
              <View>
                {currentSessions.map((session, index) => (
                  <Text
                    key={`${session.start}-${session.end}-${index}`}
                    style={{ color: '#ffffff', fontSize: 15, marginBottom: 6 }}
                  >
                    Jij: {session.start} - {session.end}
                  </Text>
                ))}
              </View>
            ) : (
              <View>
                <Text style={{ color: '#9db0c7', fontSize: 15 }}>Nog niemand ingepland</Text>
                <Text style={{ color: '#9db0c7', fontSize: 15, marginTop: 4 }}>
                  Jij kunt de eerste zijn
                </Text>
              </View>
            )}
          </View>

          <View
            style={{
              backgroundColor: '#121821',
              borderRadius: 12,
              padding: 16,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: '#ffffff', fontSize: 18, fontWeight: '700', marginBottom: 8 }}>
              Chat
            </Text>

            {currentMessages.length > 0 ? (
              <View style={{ marginBottom: 10 }}>
                {currentMessages.map((message, index) => (
                  <Text key={`${message}-${index}`} style={{ color: '#ffffff', fontSize: 15, marginBottom: 6 }}>
                    Jij: {message}
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
              style={{
                backgroundColor: '#0b0f14',
                color: '#ffffff',
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 10,
                marginBottom: 10,
              }}
            />
            <Pressable
              onPress={handleSendMessage}
              style={{
                backgroundColor: '#0b0f14',
                borderRadius: 10,
                paddingVertical: 10,
                paddingHorizontal: 12,
              }}
            >
              <Text style={{ color: '#ffffff', fontSize: 15, fontWeight: '600' }}>Verstuur</Text>
            </Pressable>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
