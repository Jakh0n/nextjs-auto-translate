'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const scenarios = [
  { path: '/1-direct-rendering', label: '1. Direct Rendering' },
  { path: '/2-expressions', label: '2. Expressions' },
  { path: '/3-visible-attributes', label: '3. Visible Attributes' },
  { path: '/4-components', label: '4. Components' },
  { path: '/5-functions', label: '5. Functions' },
  { path: '/6-conditional-logic', label: '6. Conditional Logic' },
  { path: '/7-loops', label: '7. Loops' },
  { path: '/8-nextjs-specifics', label: '8. Next.js Specifics' },
  { path: '/9-forms', label: '9. Forms' },
  { path: '/10-special-cases', label: '10. Special Cases' },
  { path: '/12-usage-driven-data', label: '12. Usage-driven Data' },
];

export default function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center">
            <Link
              href="/"
              className="text-xl font-bold text-gray-900 dark:text-gray-100"
            >
              String Rendering Patterns
            </Link>
          </div>
          <div className="flex space-x-1">
            {scenarios.map((scenario) => {
              const isActive = pathname === scenario.path;
              return (
                <Link
                  key={scenario.path}
                  href={scenario.path}
                  className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100'
                  }`}
                >
                  {scenario.label.split('.')[0]}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}
