const { downloadArtifact } = require('@electron/get');
const extract = require('extract-zip');
const path = require('path');
const fs = require('fs');

async function run() {
  console.log('Downloading electron...');
  const zipPath = await downloadArtifact({
    version: '30.0.1',
    artifactName: 'electron',
    platform: process.platform,
    arch: process.arch,
  });
  console.log('Extracting to dist...');
  const distDir = path.join(__dirname, 'node_modules', 'electron', 'dist');
  await extract(zipPath, { dir: distDir });
  
  console.log('Writing path.txt');
  const platformPath = process.platform === 'darwin' ? 'Electron.app/Contents/MacOS/Electron' : 'electron';
  fs.writeFileSync(path.join(__dirname, 'node_modules', 'electron', 'path.txt'), platformPath);
  console.log('Done!');
}
run().catch(console.error);
