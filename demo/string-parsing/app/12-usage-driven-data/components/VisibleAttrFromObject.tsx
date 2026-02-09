export default function VisibleAttrFromObject() {
  const ui = {
    imageAlt: 'Globe icon',
    inputPlaceholder: 'Enter your name',
    tooltipTitle: 'This title attribute is visible on hover',
    // Not translatable by default:
    href: 'https://example.com',
    src: '/globe.svg',
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-4">
        <code className="rounded bg-gray-100 px-2 py-1 text-sm dark:bg-gray-700">
          {'<img alt={ui.imageAlt} src={ui.src} />'}
          <br />
          {'<input placeholder={ui.inputPlaceholder} />'}
          <br />
          {'<a href={ui.href} title={ui.tooltipTitle}>Link</a>'}
        </code>
      </div>

      <div className="rounded bg-gray-50 p-4 dark:bg-gray-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={ui.src}
              alt={ui.imageAlt}
              width={24}
              height={24}
              className="h-6 w-6"
            />
            <input
              className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 sm:w-64"
              placeholder={ui.inputPlaceholder}
            />
          </div>

          <a
            href={ui.href}
            title={ui.tooltipTitle}
            className="text-sm font-medium text-blue-700 underline hover:text-blue-900 dark:text-blue-300 dark:hover:text-blue-200"
          >
            Link
          </a>
        </div>

        <div className="mt-4 text-xs text-gray-500 dark:text-gray-400">
          href/src are NOT translated by default:{' '}
          <span className="font-mono">{ui.href}</span> ·{' '}
          <span className="font-mono">{ui.src}</span>
        </div>
      </div>
    </div>
  );
}
