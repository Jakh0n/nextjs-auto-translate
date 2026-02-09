export default function ArrayIndexInJsx() {
  const tabs = ['Playground', 'Examples', 'Settings'];

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-4">
        <code className="rounded bg-gray-100 px-2 py-1 text-sm dark:bg-gray-700">
          {"const tabs = ['Playground','Examples','Settings'];"}
          <br />
          {'<span>{tabs[0]}</span>'}
        </code>
      </div>

      <div className="rounded bg-gray-50 p-4 dark:bg-gray-900">
        <div className="text-sm text-gray-700 dark:text-gray-200">
          First tab: <span className="font-semibold">{tabs[0]}</span>
        </div>
      </div>
    </div>
  );
}
