type City = {
  name: string;
  country: string;
  mapLocation: string;
};

export default function ArrayOfObjectsMap() {
  const cities: City[] = [
    { name: 'New York', country: 'USA', mapLocation: 'https://example.com/ny' },
    {
      name: 'Paris',
      country: 'France',
      mapLocation: 'https://example.com/paris',
    },
  ];

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-4">
        <code className="rounded bg-gray-100 px-2 py-1 text-sm dark:bg-gray-700">
          {
            'const cities = [{ name: "New York", country: "USA", mapLocation: "https://..." }]'
          }
          <br />
          {
            'cities.map(city => <a href={city.mapLocation}>{city.name} ({city.country})</a>)'
          }
        </code>
      </div>

      <div className="rounded bg-gray-50 p-4 dark:bg-gray-900">
        <ul className="space-y-2">
          {cities.map((city) => (
            <li key={city.mapLocation}>
              <a
                href={city.mapLocation}
                className="text-sm font-medium text-blue-700 underline hover:text-blue-900 dark:text-blue-300 dark:hover:text-blue-200"
              >
                {city.name} ({city.country})
              </a>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                href is NOT translated:{' '}
                <span className="font-mono">{city.mapLocation}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
