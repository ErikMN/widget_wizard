#!/usr/bin/env node
/*
 * License checker script for Node.js dependencies.
 *
 * This script will::
 *   - Recursively scan node_modules for package.json files.
 *   - Read each package's license field.
 *   - Detect strong copyleft licenses (GPL, AGPL, LGPL, etc.) and block them.
 *   - Detect weak copyleft licenses (MPL) and warn about them without blocking.
 *   - Detect missing license declarations.
 *   - Detect dual-licensed or multi-license packages.
 *   - Optionally print each scanned package with --verbose / -v.
 *   - Print a summary of all license types found.
 *
 * This script does not rely on external NPM modules and performs only filesystem
 * inspection and basic string analysis of license fields.
 */
import fs from 'node:fs';
import path from 'node:path';

/*
 * Parse command-line arguments.
 */
const args = process.argv.slice(2);

/*
 * Whether scanned package names and licenses should be printed.
 * Defaults to false, but can be enabled with "--verbose" or "-v".
 */
const SHOW_SCANNED = args.includes('--verbose') || args.includes('-v');

/*
 * Strong copyleft licenses that should be blocked.
 */
const COPLEFT_STRONG = ['GPL', 'LGPL', 'AGPL', 'EUPL', 'CPAL', 'OSL'];

/*
 * Weak copyleft licenses that warn but not fail.
 */
const COPLEFT_WEAK = ['MPL'];

/*
 * Walk through node_modules.
 * Only recurse into:
 *   - Scoped directories (@scope)
 *   - node_modules inside a package
 * For each package.json found, yield its full path.
 */
function* walkNodeModules(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const full = path.join(dir, entry.name);
    const pkgFile = path.join(full, 'package.json');

    if (fs.existsSync(pkgFile)) {
      yield pkgFile;

      const nested = path.join(full, 'node_modules');
      if (fs.existsSync(nested)) {
        yield* walkNodeModules(nested);
      }

      continue;
    }

    if (entry.name.startsWith('@')) {
      yield* walkNodeModules(full);
    }
  }
}

/*
 * Normalize the license field into a single string.
 * Handles:
 *   - "MIT"
 *   - { type: "MIT" }
 *   - [ "MIT", "Apache-2.0" ]
 *   - SPDX expressions like "MIT OR Apache-2.0"
 */
function normalizeLicense(licenseField) {
  if (!licenseField) {
    return null;
  }

  if (typeof licenseField === 'string') {
    return licenseField.trim();
  }

  if (Array.isArray(licenseField)) {
    return licenseField.map((x) => (x.type || x).trim()).join(', ');
  }

  if (typeof licenseField === 'object' && licenseField.type) {
    return licenseField.type.trim();
  }

  return null;
}

/*
 * Determine if a license string appears to contain multiple licenses.
 * Checks:
 *   - "MIT OR Apache-2.0"
 *   - "BSD AND MIT"
 *   - arrays already normalized into "MIT, Apache-2.0"
 */
function isDualLicensed(licenseString) {
  if (!licenseString) {
    return false;
  }

  const upper = licenseString.toUpperCase();

  if (upper.includes(' OR ') || upper.includes(' AND ')) {
    return true;
  }

  if (licenseString.includes(',')) {
    return true;
  }

  return false;
}

/*
 * Main execution routine.
 * Loads all package.json files, extracts licenses,
 * optionally prints each, and checks for license violations.
 * Also collects license summary statistics and dual-license packages.
 */
function main() {
  const nm = path.join(process.cwd(), 'node_modules');
  if (!fs.existsSync(nm)) {
    console.error('node_modules not found.');
    process.exit(1);
  }

  const violations = [];
  const dualLicenses = [];
  const weakCopyleft = [];
  const licenseSummary = {};
  let scannedCount = 0;

  for (const pkgFile of walkNodeModules(nm)) {
    let pkg;

    /*
     * Guard JSON.parse to avoid crashes from corrupted package.json files.
     */
    try {
      pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
    } catch (e) {
      console.error(`Failed to parse ${pkgFile}: ${e.message}`);
      violations.push({
        name: '(unknown)',
        version: '(unknown)',
        license: 'INVALID PACKAGE.JSON'
      });
      continue;
    }

    const name = pkg.name || '(unknown)';
    const version = pkg.version || '(unknown)';
    const license = normalizeLicense(pkg.license || pkg.licenses);

    scannedCount += 1;

    if (SHOW_SCANNED) {
      console.log(`Scanned: ${name}@${version} -> ${license}`);
    }

    if (!license) {
      violations.push({ name, version, license: 'NO LICENSE DECLARED' });
      continue;
    }

    const upper = license.toUpperCase();

    if (isDualLicensed(license)) {
      dualLicenses.push({ name, version, license });
    }

    /*
     * Detect strong copyleft (block).
     */
    if (COPLEFT_STRONG.some((word) => upper.includes(word))) {
      violations.push({ name, version, license });
    }

    /*
     * Detect weak copyleft (warn only).
     */
    if (COPLEFT_WEAK.some((word) => upper.includes(word))) {
      weakCopyleft.push({ name, version, license });
    }

    if (!licenseSummary[license]) {
      licenseSummary[license] = 0;
    }
    licenseSummary[license] += 1;
  }
  console.log(`Total scanned dependencies: ${scannedCount}`);

  /*
   * Print summary of licenses.
   */
  console.log('\nLicense summary:');
  for (const [license, count] of Object.entries(licenseSummary)) {
    console.log(`  ${license}: ${count}`);
  }

  /*
   * Report dual-licensed packages.
   */
  if (dualLicenses.length > 0) {
    console.log('\nDetected dual-licensed packages:\n');
    for (const d of dualLicenses) {
      console.log(`${d.name}@${d.version} -> ${d.license}`);
    }
  }

  /*
   * Report weak copyleft (MPL).
   */
  if (weakCopyleft.length > 0) {
    console.warn('\nWarnings (weak copyleft licenses):\n');
    for (const w of weakCopyleft) {
      console.warn(`${w.name}@${w.version} -> ${w.license}`);
    }
  }

  /*
   * Report blocking violations.
   */
  if (violations.length > 0) {
    console.error(
      '\nBlocked (strong copyleft, missing, or invalid) licenses:\n'
    );
    for (const v of violations) {
      console.error(`${v.name}@${v.version} -> ${v.license}`);
    }
    console.error('\nLicense check failed.\n');
    process.exit(1);
  }

  console.log('\nNo strong copyleft licenses found');
}

main();
