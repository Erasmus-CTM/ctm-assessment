// The Pyodide packages that grading uses (SymPy with mpmath, NetworkX), per
// Pyodide version: the files that version's CDN serves, checked against the
// sha256 of its pyodide-lock.json (from the npm package) and cached.
// Source: jsDelivr (https://cdn.jsdelivr.net/pyodide/v<version>/full/), or a
// local folder with the same files (PYODIDE_PARITY_WHEELS=<dir>/<version>/,
// for example extracted from the release archive on GitHub).
'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const PACKAGES = ['mpmath', 'sympy', 'networkx'];

function lock(version) {
  return require(`pyodide-${version}/pyodide-lock.json`);
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

async function download(url, target) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  fs.writeFileSync(target, Buffer.from(await response.arrayBuffer()));
}

// {name: absolute path of the verified wheel} for `version`.
async function ensureWheels(version, cache, local = process.env.PYODIDE_PARITY_WHEELS) {
  const dir = path.join(cache, version);
  fs.mkdirSync(dir, {recursive: true});
  const packages = lock(version).packages;
  const wheels = {};
  for (const name of PACKAGES) {
    const {file_name: file, sha256: expected} = packages[name];
    const target = path.join(dir, file);
    if (!fs.existsSync(target) || sha256(target) !== expected) {
      const copy = local && path.join(local, version, file);
      if (copy && fs.existsSync(copy)) fs.copyFileSync(copy, target);
      else await download(`https://cdn.jsdelivr.net/pyodide/v${version}/full/${file}`, target);
      const found = sha256(target);
      if (found !== expected) {
        fs.rmSync(target, {force: true});
        throw new Error(`${file} for Pyodide ${version}: sha256 ${found} is not the lock file's ${expected}`);
      }
    }
    wheels[name] = target;
  }
  return wheels;
}

module.exports = {PACKAGES, lock, ensureWheels};
