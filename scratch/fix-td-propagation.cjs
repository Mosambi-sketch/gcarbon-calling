const fs = require('fs');
let code = fs.readFileSync('components/pages/CallingSheetPage.tsx', 'utf8');

// Replace td tags in the row with stopPropagation
code = code.replace(
  '                    {/* Company name — editable */}\n                    <td>',
  '                    {/* Company name — editable */}\n                    <td onClick={e => e.stopPropagation()}>'
);

code = code.replace(
  '                    {/* Contact person — editable */}\n                    <td>',
  '                    {/* Contact person — editable */}\n                    <td onClick={e => e.stopPropagation()}>'
);

code = code.replace(
  '                    {/* Designation — editable */}\n                    <td>',
  '                    {/* Designation — editable */}\n                    <td onClick={e => e.stopPropagation()}>'
);

code = code.replace(
  '                    {/* Phone — editable */}\n                    <td>',
  '                    {/* Phone — editable */}\n                    <td onClick={e => e.stopPropagation()}>'
);

code = code.replace(
  '                    {/* Sector — editable */}\n                    <td>',
  '                    {/* Sector — editable */}\n                    <td onClick={e => e.stopPropagation()}>'
);

code = code.replace(
  '                    {/* Location — editable */}\n                    <td>',
  '                    {/* Location — editable */}\n                    <td onClick={e => e.stopPropagation()}>'
);

code = code.replace(
  '                    {/* Called by */}\n                    <td>',
  '                    {/* Called by */}\n                    <td onClick={e => e.stopPropagation()}>'
);

fs.writeFileSync('components/pages/CallingSheetPage.tsx', code, 'utf8');
console.log('Added stopPropagation to all interactive table cells');
