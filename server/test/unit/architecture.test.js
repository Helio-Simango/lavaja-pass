// Regra de dependências da clean architecture: cada camada só importa camadas mais internas.
//   domain  <-  application  <-  infrastructure / interfaces  <-  container / main
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');

const FORBIDDEN_IMPORTS = {
  domain: ['application', 'infrastructure', 'interfaces', 'container', 'config', 'express', 'node:sqlite'],
  application: ['infrastructure', 'interfaces', 'container', 'config', 'express', 'node:sqlite'],
  interfaces: ['infrastructure/database', 'container', 'node:sqlite'],
};

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

function importsOf(file) {
  const code = fs.readFileSync(file, 'utf8');
  return [...code.matchAll(/^import[^'"]*['"]([^'"]+)['"]/gm)].map(([, specifier]) =>
    specifier.startsWith('.') ? path.relative(SRC, path.resolve(path.dirname(file), specifier)) : specifier,
  );
}

describe('arquitectura', () => {
  for (const [layer, forbidden] of Object.entries(FORBIDDEN_IMPORTS)) {
    it(`a camada ${layer} não depende de ${forbidden.join(', ')}`, () => {
      const violations = sourceFiles(path.join(SRC, layer)).flatMap((file) =>
        importsOf(file)
          .filter((target) => forbidden.some((name) => target === name || target.startsWith(`${name}/`) || target.startsWith(`${name}.`)))
          .map((target) => `${path.relative(SRC, file)} -> ${target}`),
      );
      assert.deepEqual(violations, []);
    });
  }
});
