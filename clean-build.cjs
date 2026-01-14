#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function removeDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    try {
      fs.chmodSync(dirPath, 0o777);
    } catch (e) {
      // Ignore chmod errors
    }
    
    try {
      fs.readdirSync(dirPath).forEach((file) => {
        const filePath = path.join(dirPath, file);
        try {
          const stats = fs.lstatSync(filePath);
          if (stats.isDirectory()) {
            removeDir(filePath);
          } else {
            try {
              fs.chmodSync(filePath, 0o666);
            } catch (e) {}
            fs.unlinkSync(filePath);
          }
        } catch (e) {
          console.log(`Error processing ${filePath}: ${e.message}`);
        }
      });
    } catch (e) {
      console.log(`Error reading ${dirPath}: ${e.message}`);
      return;
    }
    
    try {
      fs.rmdirSync(dirPath);
    } catch (e) {
      console.log(`Warning: Could not remove ${dirPath}: ${e.message}`);
    }
  }
}

const distPath = path.join(__dirname, 'dist');
console.log(`Removing ${distPath}...`);
removeDir(distPath);
console.log('Done!');
