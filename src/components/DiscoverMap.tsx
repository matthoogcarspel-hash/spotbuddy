import { Text, View } from 'react-native';

type SpotMarker = {
  name: string;
  latitude: number;
  longitude: number;
};

type Props = {
  center: {
    latitude: number;
    longitude: number;
  };
  spots: SpotMarker[];
  onOpenSpot: (spotName: string) => void;
};

export default function DiscoverMap(_props: Props) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <Text>Native map coming next</Text>
    </View>
  );
}
