#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const pkgPath = path.join(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const name = pkg.name;

// Strip any existing -rc suffix to get the base version
const baseVersion = pkg.version.replace(/-rc\d+$/, '');

function findVersion() {
    const base = `${name}-${baseVersion}.vsix`;
    if (!fs.existsSync(path.join(__dirname, '..', base))) {
        return baseVersion;
    }
    let rc = 1;
    while (true) {
        const candidate = `${name}-${baseVersion}-rc${rc}.vsix`;
        if (!fs.existsSync(path.join(__dirname, '..', candidate))) {
            return `${baseVersion}-rc${rc}`;
        }
        rc++;
    }
}

const version = findVersion();
if (version !== pkg.version) {
    pkg.version = version;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    console.log(`Bumped version to ${version}`);
}

console.log(`Building ${name}-${version}.vsix...`);
execSync(`vsce package`, { stdio: 'inherit', cwd: path.join(__dirname, '..') });
