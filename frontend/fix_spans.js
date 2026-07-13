
const fs = require('fs');
let content = fs.readFileSync('D:/Vizzy Redesign/Vizzy Redesign/frontend/src/pages/user/CanvasPage.tsx', 'utf8');

// The error is caused by <span> enclosing <div> or <svg>
// We'll replace the specific <span> with flex with <div>
const lines = content.split('\n');
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('<span') && lines[i].includes('flex')) {
    lines[i] = lines[i].replace('<span', '<div');
    // find the corresponding closing span. Usually it's within a few lines.
    for (let j = i; j < Math.min(i + 15, lines.length); j++) {
      if (lines[j].includes('</span>')) {
        lines[j] = lines[j].replace('</span>', '</div>');
        break;
      }
    }
  }
}

fs.writeFileSync('D:/Vizzy Redesign/Vizzy Redesign/frontend/src/pages/user/CanvasPage.tsx', lines.join('\n'));
console.log('Replaced spans with divs successfully');

