"""Remove copied TypeScript modules unreachable from portal, admin, CLI and checks."""
from pathlib import Path
import re,json
root=Path(__file__).resolve().parents[1]
files={str(p.relative_to(root)).replace('\\','/'):p for d in ['src','server','shared'] for p in (root/d).rglob('*') if p.suffix in ['.ts','.tsx']}
seeds=['server/index.ts','server/admin/cli.ts','src/editorial.tsx','src/admin/main.tsx']+[str(p.relative_to(root)).replace('\\','/') for d in ['scripts','tests'] for p in (root/d).glob('*.ts')]
used=set();todo=seeds[:]
while todo:
 key=todo.pop()
 if key in used:continue
 used.add(key);p=root/key
 if not p.exists():continue
 for name in re.findall(r'''(?:from\s+|import\s*\(?\s*)["']([^"']+)["']''',p.read_text(encoding='utf-8')):
  if not name.startswith('.'):continue
  candidate=(p.parent/name).resolve()
  for target in [candidate,candidate.with_suffix('.ts'),candidate.with_suffix('.tsx'),candidate/'index.ts']:
   if target.is_file() and target.suffix in ['.ts','.tsx']:
    todo.append(str(target.relative_to(root)).replace('\\','/'));break
unused=sorted(set(files)-used)
(root/'artifacts/unused-source.json').write_text(json.dumps(unused,indent=2),encoding='utf-8')
for name in unused:
 target=(root/name).resolve()
 assert target.is_relative_to(root) and target.suffix in ['.ts','.tsx']
 target.unlink()
print(json.dumps({'removed':len(unused),'files':unused}))
