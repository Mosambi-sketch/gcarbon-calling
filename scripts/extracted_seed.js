node -e "
const fs = require('fs');
const XLSX = require('xlsx');
const { v4: uuidv4 } = require('uuid');

const wb = XLSX.readFile('/Users/aadi/Documents/Calling/CRM (1).xlsx');
const sheetNames = wb.SheetNames.filter(n => n.trim().toLowerCase() !== 'connection list');

function parseDate(v) {
  if (!v) return undefined;
  if (typeof v === 'number' && v > 40000 && v < 60000) {
    const d = new Date((v - 25569) * 86400 * 1000);
    return d.toISOString().slice(0, 10);
  }
  if (typeof v === 'string') {
    const s = v.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
    if (m) {
      const year = m[3].length === 2 ? '20' + m[3] : m[3];
      return year + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
    }
  }
  return undefined;
}

function normalizePhones(raw) {
  if (!raw) return [];
  const str = String(raw).trim();
  const parts = str.split(/[\/,\n\r]+/).map(p => p.trim()).filter(Boolean);
  return parts.map(p => {
    let digits = p.replace(/\D/g, '');
    if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
    if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
    return digits;
  }).filter(d => d.length >= 7 && d.length <= 15);
}

function outcomeToStatus(outcome, followUpDate) {
  switch (outcome) {
    case 'Meeting Scheduled': return 'Meeting Scheduled';
    case 'Connected - Interested': return 'Interested';
    case 'Profile / Mail Sent': return 'Proposal Sent';
    case 'Call Back Later': return 'Follow-up Due';
    case 'Not Picked': return 'Attempted';
    case 'Not Reachable / Out of Service':
    case 'Invalid Number':
    case 'Wrong Person / Left Firm':
    case 'Not Interested':
    case 'Already Handled Internally': return 'Dead';
    default: return followUpDate ? 'Follow-up Due' : 'Not Called';
  }
}

function classifyOutcome(remark, hasFollowUp) {
  if (!remark || remark.trim() === '') return hasFollowUp ? 'Call Back Later' : 'Not Called';
  const r = remark.toLowerCase().trim();
  if (r.includes('meeting') && !r.includes('no meeting')) return 'Meeting Scheduled';
  if (r.includes('interested') && !r.includes('not interested')) return 'Connected - Interested';
  if (r.includes('profile') || r.includes('mail sent') || r.includes('shared')) return 'Profile / Mail Sent';
  if (r.includes('not interested')) return 'Not Interested';
  if (r.includes('out of service') || r.includes('not reachable') || r.includes('switched off')) return 'Not Reachable / Out of Service';
  if (r.includes('invalid') || r.includes('wrong number')) return 'Invalid Number';
  if (r.includes('wrong person') || r.includes('left')) return 'Wrong Person / Left Firm';
  if (r.includes('already') && (r.includes('handled') || r.includes('internal'))) return 'Already Handled Internally';
  if (r.includes('pick') || r.includes('no response') || r.includes('disconnected')) return 'Not Picked';
  if (r.includes('call back') || r.includes('call later') || r.includes('ring')) return 'Call Back Later';
  return hasFollowUp ? 'Call Back Later' : 'Not Called';
}

const lists = [];
const companies = [];
const contacts = [];
const call_logs = [];

sheetNames.forEach(sheetName => {
  const cleanName = sheetName.trim();
  const slug = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const listId = slug === 'cold-calling' ? 'cold-calling-all' : slug;

  lists.push({
    id: listId,
    name: cleanName,
    type: 'company',
    created_at: new Date().toISOString(),
  });

  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
  const data = rows.slice(2).filter(r => r && r[0]);

  data.forEach(r => {
    const compName = String(r[0] || '').trim();
    if (!compName) return;

    const compId = uuidv4();
    const contactPerson = r[1] ? String(r[1]).trim() : undefined;
    const designation = r[2] ? String(r[2]).trim() : undefined;
    const phoneRaw = r[3];
    const email = r[4] ? String(r[4]).trim() : undefined;
    const location = r[5] ? String(r[5]).trim() : undefined;
    const refRaw = r[6] ? String(r[6]).toLowerCase().trim() : '';
    const hasReference = refRaw && !refRaw.includes('no reference') && refRaw !== 'no';
    const callerRaw = r[7] ? String(r[7]).trim() : undefined;
    const remark1 = r[8] ? String(r[8]).trim() : '';
    const remark2 = r[9] ? String(r[9]).trim() : '';
    const followUpDate = parseDate(r[10]);

    const combinedRemark = [remark1, remark2].filter(Boolean).join(' | ');
    const outcome = classifyOutcome(combinedRemark, Boolean(followUpDate));
    const status = combinedRemark || followUpDate ? outcomeToStatus(outcome, followUpDate) : 'Not Called';

    const comp = {
      id: compId,
      name: compName,
      list_id: listId,
      workspace_id: listId,
      status: status,
      reference: Boolean(hasReference),
      location: location,
      owner_name: callerRaw,
      created_at: new Date().toISOString(),
    };
    companies.push(comp);

    const phones = normalizePhones(phoneRaw);
    if (contactPerson || phones.length > 0 || email || designation) {
      contacts.push({
        id: uuidv4(),
        company_id: compId,
        name: contactPerson || 'Primary Contact',
        designation: designation,
        phones: phones,
        email: email,
        is_primary: true,
      });
    }

    if (combinedRemark || followUpDate) {
      call_logs.push({
        id: uuidv4(),
        company_id: compId,
        caller_name: callerRaw || 'Caller',
        outcome: outcome,
        remark: combinedRemark || undefined,
        follow_up_date: followUpDate,
        called_at: new Date().toISOString(),
      });
    }
  });
});

const result = {
  lists,
  companies,
  contacts,
  call_logs,
};

fs.mkdirSync('public/data', { recursive: true });
fs.writeFileSync('public/data/crm-calling.json', JSON.stringify(result, null, 2));
console.log('Successfully written public/data/crm-calling.json:');
console.log('Lists:', lists.length);
console.log('Companies:', companies.length);
console.log('Contacts:', contacts.length);
console.log('Call logs:', call_logs.length);
"