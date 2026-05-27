export const spots = [
  {
    spot: 'Scheveningen KZVS',
    latitude: 52.105324,
    longitude: 4.2641603,
  },
  {
    spot: 'Scheveningen Jump Team',
    latitude: 52.1042004,
    longitude: 4.2637769,
  },
  {
    spot: 'Scheveningen Zuid',
    latitude: 52.0985985,
    longitude: 4.248947,
  },
  {
    spot: 'Brouwersdam',
    latitude: 51.7670568,
    longitude: 3.8502863,
  },
  {
    spot: 'Zandmotor',
    latitude: 52.048754,
    longitude: 4.1841425,
  },
  {
    spot: 'Noordwijk KSN',
    latitude: 52.2354036,
    longitude: 4.4194169,
  },
  {
    spot: 'Wijk aan Zee Wijkiki',
    latitude: 52.4916523,
    longitude: 4.5822515,
  },
  {
    spot: 'Ijmuiden Zuidpier',
    latitude: 52.491699,
    longitude: 4.5423397,
  },
  {
    spot: 'Workum Kitebeach',
    latitude: 53.0090731,
    longitude: 5.3348554,
  },
  {
    spot: 'Mirns IJsselmeer kitestrand',
    latitude: 52.8510856,
    longitude: 5.4711431,
  },
  {
    spot: 'Texel Paal 17 kitezone',
    latitude: 53.0833355,
    longitude: 4.7186665,
  },
  {
    spot: 'Rockanje Strand 1e slag',
    latitude: 51.8693123,
    longitude: 4.0511924,
  },
  {
    spot: 'Rockanje Strand 2e slag',
    latitude: 51.8765591,
    longitude: 4.0405649,
  },
  {
    spot: 'Slufter Maasvlakte',
    latitude: 51.9178728,
    longitude: 3.990432,
  },
  {
    spot: 'Oostvoorne',
    latitude: 51.921233,
    longitude: 4.0398344,
  },
  {
    spot: 'Langebaan',
    latitude: -33.0894,
    longitude: 18.0364,
  },
  {
    spot: 'Dakhla Lagoon',
    latitude: 23.7167,
    longitude: -15.9333,
  },
  {
    spot: 'Sotavento Fuerteventura',
    latitude: 28.0501,
    longitude: -14.3247,
  },
  {
    spot: 'Cabarete',
    latitude: 19.7597,
    longitude: -70.4095,
  },
  {
    spot: 'Cumbuco',
    latitude: -3.4936,
    longitude: -38.7289,
  },
  {
    spot: 'La Ventana',
    latitude: 24.0461,
    longitude: -109.9828,
  },
  {
    spot: 'Hood River',
    latitude: 45.7074,
    longitude: -121.5212,
  },
  {
    spot: 'Boracay Bulabog Beach',
    latitude: 11.9674,
    longitude: 121.9282,
  },
  {
    spot: 'Mui Ne',
    latitude: 10.9333,
    longitude: 108.2833,
  },
  {
    spot: 'Nyang Nyang Bali',
    latitude: -8.8258,
    longitude: 115.1014,
  },
  {
    spot: 'Aruba Hadicurari Beach',
    latitude: 12.5992,
    longitude: -70.0549,
  },
  {
    spot: 'Turks and Caicos Long Bay',
    latitude: 21.7992,
    longitude: -72.2310,
  },
 ] as const;

export type SpotDefinition = (typeof spots)[number];
export type SpotName = SpotDefinition['spot'];
