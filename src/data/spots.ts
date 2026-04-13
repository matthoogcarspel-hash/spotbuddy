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
 ] as const;

export type SpotDefinition = (typeof spots)[number];
export type SpotName = SpotDefinition['spot'];
