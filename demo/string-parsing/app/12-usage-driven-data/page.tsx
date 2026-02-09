import ArrayIndexInJsx from './components/ArrayIndexInJsx';
import ArrayOfObjectsMap from './components/ArrayOfObjectsMap';
import ObjectPropertyInJsx from './components/ObjectPropertyInJsx';
import VisibleAttrFromObject from './components/VisibleAttrFromObject';

export default function UsageDrivenDataPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="mb-8 text-3xl font-bold text-gray-900 dark:text-gray-100">
          12. Usage-driven Data (Arrays & Objects)
        </h1>

        <div className="space-y-8">
          <section>
            <h2 className="mb-4 text-2xl font-semibold text-gray-800 dark:text-gray-200">
              12.1 Object property rendered in JSX
            </h2>
            <ObjectPropertyInJsx />
          </section>

          <section>
            <h2 className="mb-4 text-2xl font-semibold text-gray-800 dark:text-gray-200">
              12.2 Array indexing rendered in JSX
            </h2>
            <ArrayIndexInJsx />
          </section>

          <section>
            <h2 className="mb-4 text-2xl font-semibold text-gray-800 dark:text-gray-200">
              12.3 Array of objects rendered in map()
            </h2>
            <ArrayOfObjectsMap />
          </section>

          <section>
            <h2 className="mb-4 text-2xl font-semibold text-gray-800 dark:text-gray-200">
              12.4 Visible attributes from objects (translated), href/src (not)
            </h2>
            <VisibleAttrFromObject />
          </section>
        </div>
      </main>
    </div>
  );
}
