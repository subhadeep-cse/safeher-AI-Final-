const fs = require('fs');
const lines = fs.readFileSync('public/js/app.js', 'utf8').split('\n');
const startIndex = 792;
const endIndex = 994;
const toMove = lines.slice(startIndex, endIndex);
lines.splice(startIndex, endIndex - startIndex);

// Find the line where densityMap is initialized, which should be around line 813 after the deletion
const insertIndex = lines.findIndex(l => l.includes("L.control.zoom({ position: 'bottomright' }).addTo(densityMap);")) + 2;

lines.splice(insertIndex, 0, ...toMove);

fs.writeFileSync('public/js/app.js', lines.join('\n'));
console.log("File fixed.");
