"""Run the importer twice in isolated DEV resources and compare every output hash."""
import pathlib,subprocess,os,json,hashlib
root=pathlib.Path(__file__).resolve().parents[1]
target=root/'artifacts/repeat-import';target.mkdir(parents=True,exist_ok=True)
env={**os.environ,'GEEK_MIGRATION_CONTENT_ROOT':str(target/'content'),'GEEK_MIGRATION_PUBLIC_ROOT':str(target/'public'),'GEEK_MIGRATION_REPORT_ROOT':str(target/'reports')}
def snapshot():
 return {str(p.relative_to(target)):hashlib.sha256(p.read_bytes()).hexdigest() for name in ['content','public','reports'] for p in (target/name).rglob('*') if p.is_file()}
log=(target/'import.private.log').open('wb')
for iteration in range(2):
 result=subprocess.run(['npx.cmd','tsx','scripts/migrate-wordpress.ts'],cwd=root,env=env,stdout=log,stderr=log,timeout=600)
 if result.returncode:raise SystemExit('Isolated repeat import failed; see private log.')
 hashes=snapshot()
 if iteration==0:first=hashes
 else:assert hashes==first,'Repeated import changed output.'
report={'environment':'development','isolatedContent':str(target/'content'),'iterations':2,'identicalOutputFiles':len(first),'articles':len(list((target/'content/blog').glob('*.md'))),'allOutputHashesIdentical':True}
assert report['articles']==149
(root/'docs/migration/repeat-import.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,indent=2))
