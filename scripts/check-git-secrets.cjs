const fs = require('node:fs');
const cp = require('node:child_process');
const dotenv = require('dotenv');
const env = dotenv.parse(fs.readFileSync('.env'));
const secrets = Object.entries(env).filter(([k,v]) => /secret|password|credential|token|api_key|jev_key|serp_api|^PWD$|^pdb$/i.test(k) && v.length > 5);
const files = cp.execFileSync('git',['diff','--cached','--name-only','--diff-filter=ACM','-z']).toString().split('\0').filter(Boolean);
if(files.some(f=>f.includes('\n'))) throw new Error('Unsupported staged filename');
const all = cp.execFileSync('git',['cat-file','--batch'],{input:files.map(f=>':'+f+'\n').join(''),maxBuffer:512*1024*1024});
let offset=0, leaks=0;
for(const file of files) {
 const end=all.indexOf(10,offset), header=all.subarray(offset,end).toString(), size=Number(header.split(' ')[2]);
 if(!header.includes(' blob ') || !Number.isFinite(size)) throw new Error('Cannot read staged blob');
 const bytes=all.subarray(end+1,end+1+size);offset=end+size+2;
 if(file.startsWith('artifacts/') || /\.env$|\.sqlite$|\.private\./.test(file)) { console.error('Private file staged: '+file);leaks++; }
 for(const [key,value] of secrets) if(bytes.includes(Buffer.from(value))) {console.error('Sensitive value '+key+' in '+file);leaks++;}
 if(size>99*1024*1024) {console.error('Staged file exceeds GitHub file limit: '+file);leaks++;}
}
console.log(JSON.stringify({stagedFiles:files.length,sensitiveValues:secrets.length,leaks}));if(leaks)process.exitCode=1;
