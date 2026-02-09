import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { Parser } from '../src/parser/Parser';

describe('Parser - usage-driven arrays/objects', () => {
  it('extracts array-of-objects props that are rendered in JSX text', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'algb-intl-'));
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });

    const fileAbs = path.join(srcDir, 'Cities.tsx');
    const code = `
type City = {
  name: string;
  country: string;
  mapLocation: string;
};

export default function Cities() {
  const cities: City[] = [
    { name: "New York", country: "USA", mapLocation: "https://example.com/ny" },
    { name: "Paris", country: "France", mapLocation: "https://example.com/paris" },
  ];

  return (
    <div>
      {cities.map((city) => (
        <a href={city.mapLocation}>
          {city.name} ({city.country})
        </a>
      ))}
    </div>
  );
}
`.trim();
    fs.writeFileSync(fileAbs, code, 'utf-8');

    const prevCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      const parser = new Parser({ outputDir: '.intl' });
      const scopeMap = parser.parseProject();

      const relFile = path.relative(tmpDir, fileAbs).split(path.sep).join('/');
      const scopes = scopeMap.files[relFile]?.scopes || {};

      const contents = Object.values(scopes).map((s) => s.content);
      expect(contents).toContain('New York');
      expect(contents).toContain('USA');
      expect(contents).toContain('Paris');
      expect(contents).toContain('France');

      // Should NOT extract href/mapLocation targets by default.
      expect(contents).not.toContain('https://example.com/ny');
      expect(contents).not.toContain('https://example.com/paris');
    } finally {
      process.chdir(prevCwd);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
