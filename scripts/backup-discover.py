"""Site-scoped WordPress export and verified offsite backup. Never logs secrets."""
import pathlib, subprocess, json, hashlib, tarfile, sys, datetime

root = pathlib.Path(__file__).resolve().parents[1]
checkpoint = '--checkpoint' in sys.argv
suffix = '-precut-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ') if checkpoint else ''
out = root / ('artifacts/wordpress'+suffix)
out.mkdir(parents=True, exist_ok=True)
offsite = pathlib.Path('D:/GeekMusical-backups/wordpress'+suffix)
offsite.mkdir(parents=True, exist_ok=True)
ssh = ['ssh', '-T', '-i', str(pathlib.Path.home()/'.ssh/guiaproduto_vps_ed25519'), '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', 'root@195.35.18.232']
php = (root/'scripts/wordpress-export.php').read_text(encoding='utf-8')
remote = r'''
import pathlib, subprocess, json, hashlib, datetime, tarfile, os
os.umask(0o077)
site=pathlib.Path('/home/geekmusical/htdocs/www.geekmusical.com.br').resolve()
assert site.is_relative_to(pathlib.Path('/home/geekmusical')) and (site/'wp-config.php').is_file()
guard=pathlib.Path('/root/geekmusical-security')/('before-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'));guard.mkdir(parents=True)
def run(args):
 p=subprocess.run(args,capture_output=True,timeout=600)
 with (guard/'operations.private.log').open('ab') as f:f.write(p.stderr)
 if p.returncode:raise RuntimeError('Private backup operation failed: '+args[0])
 return p.stdout
wp=['wp','--allow-root','--path='+str(site),'--skip-plugins','--skip-themes']
# Export with plugins enabled so custom post types, redirects and permalinks resolve.
(guard/'export.php').write_text(PHP)
export=run(['wp','--allow-root','--path='+str(site),'eval-file',str(guard/'export.php')]);data=json.loads(export)
(guard/'wordpress-export.private.json').write_bytes(export)
run(wp+['db','export',str(guard/'database.private.sql'),'--single-transaction','--quick'])
memory=[name.strip() for name in run(wp+['db','query',"SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND ENGINE='MEMORY';",'--skip-column-names']).decode().splitlines() if name.strip()]
if memory:
 assert all(__import__('re').fullmatch(r'[A-Za-z0-9_]+',name) for name in memory)
 run(wp+['db','export',str(guard/'memory.private.sql'),'--tables='+','.join(memory),'--lock-tables'])
vhost=pathlib.Path('/etc/nginx/sites-enabled/www.geekmusical.com.br.conf')
(guard/'vhost-before.conf').write_bytes(vhost.read_bytes())
archive=guard/'wordpress-full.private.tar.gz'
with tarfile.open(archive,'w:gz') as t:
 t.add(site,arcname='wordpress');t.add(guard/'database.private.sql',arcname='database.sql');t.add(guard/'vhost-before.conf',arcname='vhost.conf')
 if memory:t.add(guard/'memory.private.sql',arcname='memory.sql')
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
 return h.hexdigest()
report={'guard':str(guard),'siteRoot':str(site),'vhost':str(vhost),'archive':str(archive),'archiveSha256':sha(archive),'export':str(guard/'wordpress-export.private.json'),'exportSha256':sha(guard/'wordpress-export.private.json'),'posts':len(data['posts']),'publishedPosts':sum(p['status']=='publish' for p in data['posts']),'pages':len(data['pages']),'stories':len(data['stories']),'categories':len(data['categories']),'attachments':len(data['attachments']),'memoryTables':memory,'vhostHashes':{str(p):sha(p) for p in pathlib.Path('/etc/nginx/sites-enabled').glob('*') if p.is_file()},'services':{s:run(['systemctl','show','-p','MainPID','--value',s]).decode().strip() for s in ['guia-produto-production','mago-de-casa']}}
(guard/'inventory.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
'''.replace('PHP', repr(php))
p = subprocess.run(ssh+['python3','-'], input=remote.encode(), capture_output=True, timeout=1800)
if p.returncode:
 (out/'error.private.log').write_bytes(p.stderr)
 raise SystemExit('Backup failed; restricted diagnostic available locally.')
report=json.loads(p.stdout)
def sha(file):
 h=hashlib.sha256()
 with file.open('rb') as f:
  for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
 return h.hexdigest()
for key,name in [('export','export.private.json'),('archive','wordpress-full.private.tar.gz')]:
 target=offsite/name
 p=subprocess.run(['scp','-i',str(pathlib.Path.home()/'.ssh/guiaproduto_vps_ed25519'),'-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','root@195.35.18.232:'+report[key],str(target)],capture_output=True,timeout=1800)
 if p.returncode:raise SystemExit('Offsite transfer failed.')
 assert sha(target)==report[key+'Sha256']
 if key=='export':(out/'export.private.json').write_bytes(target.read_bytes())
with tarfile.open(offsite/'wordpress-full.private.tar.gz') as t:
 names=t.getnames();assert 'wordpress/wp-config.php' in names and 'database.sql' in names
 sql=t.extractfile('database.sql').read();assert b'CREATE TABLE' in sql and b'INSERT INTO' in sql
 if report['memoryTables']:assert 'memory.sql' in names
 uploads=out/'uploads';uploads.mkdir(exist_ok=True)
 for member in t.getmembers():
  if member.isfile() and member.name.startswith('wordpress/wp-content/uploads/'):
   target=(uploads/member.name.removeprefix('wordpress/wp-content/uploads/')).resolve()
   assert target.is_relative_to(uploads.resolve())
   target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(t.extractfile(member).read())
report.update({'offServerCopyVerified':True,'archiveReadable':True,'offsite':str(offsite)})
(offsite/'inventory.private.json').write_text(json.dumps(report,indent=2))
(out/'inventory.private.json').write_text(json.dumps(report,indent=2))
print(json.dumps({k:v for k,v in report.items() if k not in ['vhostHashes','services']},indent=2))
