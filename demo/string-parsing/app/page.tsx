import ScenarioCard from '@/components/ScenarioCard';

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <main className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-12 text-center">
          <h1 className="mb-4 text-4xl font-bold text-gray-900 dark:text-gray-100">
            String Rendering Patterns
          </h1>
          <p className="mx-auto max-w-3xl text-lg text-gray-600 dark:text-gray-400">
            This demonstration shows all possible scenarios and patterns of how
            strings can appear in the final DOM in React and Next.js
            applications and be visible to users on screen (without using
            devtools).
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <ScenarioCard href="/1-direct-rendering">
            <h2 className="mb-2 text-xl font-semibold text-gray-900 group-hover:text-blue-600 dark:text-gray-100 dark:group-hover:text-blue-400">
              1. Direct Rendering
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              JSXText between tags (visible text)
            </p>
          </ScenarioCard>

          <ScenarioCard href="/2-expressions">
            <h2 className="mb-2 text-xl font-semibold text-gray-900 group-hover:text-blue-600 dark:text-gray-100 dark:group-hover:text-blue-400">
              2. Expressions
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              JSXExpressionContainer with various expression types returning
              strings
            </p>
          </ScenarioCard>

          <ScenarioCard href="/3-visible-attributes">
            <h2 className="mb-2 text-xl font-semibold text-gray-900 group-hover:text-blue-600 dark:text-gray-100 dark:group-hover:text-blue-400">
              3. Visible Attributes
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              JSXAttribute with title, alt, aria-label, aria-describedby,
              aria-placeholder and other accessibility attributes
            </p>
          </ScenarioCard>

          <ScenarioCard href="/4-components">
            <h2 className="mb-2 text-xl font-semibold text-gray-900 group-hover:text-blue-600 dark:text-gray-100 dark:group-hover:text-blue-400">
              4. Components
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Through props and children that render visible text
            </p>
          </ScenarioCard>

          <ScenarioCard href="/5-functions">
            <h2 className="mb-2 text-xl font-semibold text-gray-900 group-hover:text-blue-600 dark:text-gray-100 dark:group-hover:text-blue-400">
              5. Functions
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Through function calls returning strings for display
            </p>
          </ScenarioCard>

          <ScenarioCard href="/6-conditional-logic">
            <h2 className="mb-2 text-xl font-semibold text-gray-900 group-hover:text-blue-600 dark:text-gray-100 dark:group-hover:text-blue-400">
              6. Conditional Logic
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Through ternary operators and logical expressions returning
              strings
            </p>
          </ScenarioCard>

          <ScenarioCard href="/7-loops">
            <h2 className="mb-2 text-xl font-semibold text-gray-900 group-hover:text-blue-600 dark:text-gray-100 dark:group-hover:text-blue-400">
              7. Loops
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Through map, forEach and other array methods rendering strings
            </p>
          </ScenarioCard>

          <ScenarioCard href="/8-nextjs-specifics">
            <h2 className="mb-2 text-xl font-semibold text-gray-900 group-hover:text-blue-600 dark:text-gray-100 dark:group-hover:text-blue-400">
              8. Next.js Specifics
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Metadata (title, description), Server/Client Components
            </p>
          </ScenarioCard>

          <ScenarioCard href="/9-forms">
            <h2 className="mb-2 text-xl font-semibold text-gray-900 group-hover:text-blue-600 dark:text-gray-100 dark:group-hover:text-blue-400">
              9. Forms
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Placeholder, value, label text, button text, option text
            </p>
          </ScenarioCard>

          <ScenarioCard href="/10-special-cases">
            <h2 className="mb-2 text-xl font-semibold text-gray-900 group-hover:text-blue-600 dark:text-gray-100 dark:group-hover:text-blue-400">
              10. Special Cases
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Portals, Suspense fallback, Error Boundary
            </p>
          </ScenarioCard>

          <ScenarioCard href="/12-usage-driven-data">
            <h2 className="mb-2 text-xl font-semibold text-gray-900 group-hover:text-blue-600 dark:text-gray-100 dark:group-hover:text-blue-400">
              12. Usage-driven Data
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Arrays/objects are extracted when actually rendered in JSX;
              href/src are not translated by default
            </p>
          </ScenarioCard>
        </div>

        <div className="mt-12 rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-4 text-2xl font-semibold text-gray-900 dark:text-gray-100">
            Exclusions (not localized):
          </h2>
          <ul className="list-disc space-y-2 pl-6 text-gray-600 dark:text-gray-400">
            <li>
              Technical attributes:{' '}
              <code className="rounded bg-gray-100 px-1 dark:bg-gray-700 dark:text-gray-300">
                id
              </code>
              ,{' '}
              <code className="rounded bg-gray-100 px-1 dark:bg-gray-700 dark:text-gray-300">
                className
              </code>
              ,{' '}
              <code className="rounded bg-gray-100 px-1 dark:bg-gray-700 dark:text-gray-300">
                htmlFor
              </code>
              ,{' '}
              <code className="rounded bg-gray-100 px-1 dark:bg-gray-700 dark:text-gray-300">
                data-*
              </code>
              ,{' '}
              <code className="rounded bg-gray-100 px-1 dark:bg-gray-700 dark:text-gray-300">
                key
              </code>
              ,{' '}
              <code className="rounded bg-gray-100 px-1 dark:bg-gray-700 dark:text-gray-300">
                ref
              </code>
            </li>
            <li>Pure API responses without UI</li>
            <li>Code comments</li>
            <li>Technical identifiers and CSS classes</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
