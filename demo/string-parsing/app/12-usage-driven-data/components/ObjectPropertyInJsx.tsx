export default function ObjectPropertyInJsx() {
  const ui = {
    title: 'Profile',
    subtitle: 'These strings are stored in an object.',
    debugKey: 'DO_NOT_TRANSLATE_THIS_KEY',
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-4">
        <code className="rounded bg-gray-100 px-2 py-1 text-sm dark:bg-gray-700">
          {'const ui = { title: "Profile", subtitle: "..." };'}
          <br />
          {'<h3>{ui.title}</h3> <p>{ui.subtitle}</p>'}
        </code>
      </div>

      <div className="rounded bg-gray-50 p-4 dark:bg-gray-900">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {ui.title}
        </h3>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          {ui.subtitle}
        </p>
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          debugKey (should not be translated unless rendered):{' '}
          <span className="font-mono">{ui.debugKey}</span>
        </p>
      </div>
    </div>
  );
}
