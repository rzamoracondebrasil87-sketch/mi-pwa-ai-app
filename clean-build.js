#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function removeDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.readdirSync(dirPath).forEach((file) => {
      const filePath = path.join(dirPath, file);
      if (fs.lstatSync(filePath).isDirectory()) {
        removeDir(filePath);
      } else {
        try {
          fs.chmodSync(filePath, 0o666);
          fs.unlinkSync(filePath);
        } catch (e) {
          console.log(`Failed to delete ${filePath}: ${e.message}`);
        }
      }
    });
    try {
      fs.chmodSync(dirPath, 0o777);
      fs.rmdirSync(dirPath);
    } catch (e) {
      console.log(`Failed to remove dir ${dirPath}: ${e.message}`);
    }
  }
}

const distPath = path.join(__dirname, 'dist');
console.log(`Removing ${distPath}...`);
removeDir(distPath);
console.log('Done!');
