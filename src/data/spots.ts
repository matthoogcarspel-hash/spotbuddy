export const spots = [
  {
    spot: 'Scheveningen KZVS',
    latitude: 52.0890,
    longitude: 4.2810,
  },
  {
    spot: 'Scheveningen Jump Team',
    latitude: 52.1095,
    longitude: 4.2645,
  },
  {
    spot: 'Scheveningen Zuid',
    latitude: 52.0720,
    longitude: 4.2450,
  },
  {
    spot: 'Brouwersdam',
    latitude: 51.7602,
    longitude: 3.8471,
  },
  {
    spot: 'Zandmotor',
    latitude: 52.0527,
    longitude: 4.1953,
  },
  {
    spot: 'Noordwijk KSN',
    latitude: 52.2390,
    longitude: 4.4330,
  },
  {
    spot: 'Wijk aan Zee Wijkiki',
    latitude: 52.4933,
    longitude: 4.5947,
  },
  {
    spot: 'Ijmuiden Zuidpier',
    latitude: 52.4563,
    longitude: 4.5597,
  },
  {
    spot: 'Workum Kitebeach',
    latitude: 52.9797,
    longitude: 5.4471,
  },
  {
    spot: 'Mirns IJsselmeer kitestrand',
    latitude: 52.8528,
    longitude: 5.4728,
  },
  {
    spot: 'Texel Paal 17 kitezone',
    latitude: 53.0995,
    longitude: 4.7628,
  },
  {
    spot: 'Rockanje Strand 1e slag',
    latitude: 51.8760,
    longitude: 4.0520,
  },
  {
    spot: 'Rockanje Strand 2e slag',
    latitude: 51.8690,
    longitude: 4.0570,
  },
  {
    spot: 'Slufter Maasvlakte',
    latitude: 51.9191,
    longitude: 3.9882,
  },
  {
    spot: 'Oostvoorne',
    latitude: 51.9140,
    longitude: 4.0250,
  },
  {
    spot: 'Langebaan',
    latitude: -33.0660,
    longitude: 18.0350,
  },
  {
    spot: 'Dakhla Lagoon',
    latitude: 23.8680,
    longitude: -15.8950,
  },
  {
    spot: 'Sotavento Fuerteventura',
    latitude: 28.1006,
    longitude: -14.2713,
  },
  {
    spot: 'Cabarete',
    latitude: 19.7630,
    longitude: -70.4380,
  },
  {
    spot: 'Cumbuco',
    latitude: -3.6216,
    longitude: -38.7408,
  },
  {
    spot: 'La Ventana',
    latitude: 24.0490,
    longitude: -109.9950,
  },
  {
    spot: 'Hood River',
    latitude: 45.7080,
    longitude: -121.5120,
  },
  {
    spot: 'Boracay Bulabog Beach',
    latitude: 11.9625,
    longitude: 121.9309,
  },
  {
    spot: 'Mui Ne',
    latitude: 10.9349,
    longitude: 108.2969,
  },
  {
    spot: 'Nyang Nyang Bali',
    latitude: -8.8454,
    longitude: 115.1110,
  },
  {
    spot: 'Aruba Hadicurari Beach',
    latitude: 12.5750,
    longitude: -70.0450,
  },
  {
    spot: 'Turks and Caicos Long Bay',
    latitude: 21.7971,
    longitude: -72.1724,
  },
 ] as const;

export type SpotDefinition = (typeof spots)[number];
export type SpotName = SpotDefinition['spot'];
