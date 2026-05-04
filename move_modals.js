import fs from 'fs';

const lines = fs.readFileSync('src/App.tsx', 'utf-8').split('\n');

// 0-indexed: line 1638 is index 1637.
// 2020 lines means index 2019.
const modalsStartIdx = 1637;
const modalsEndIdx = 2019;

const modalsLines = lines.slice(modalsStartIdx, modalsEndIdx + 1);

// Remove the modals from the array
lines.splice(modalsStartIdx, modalsEndIdx - modalsStartIdx + 1);

// Find the line with </main>
const mainCloseIdx = lines.findIndex(line => line.includes('</main>'));

// Insert the modals right before </main>
lines.splice(mainCloseIdx, 0, ...modalsLines);

fs.writeFileSync('src/App.tsx', lines.join('\n'));
console.log('Modals moved successfully');
