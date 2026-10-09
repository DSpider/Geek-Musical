"""Restore the backup into an isolated, network-disabled development MySQL instance."""
import pathlib, subprocess, json
root=pathlib.Path(__file__).resolve().parents[1]
report=json.loads((root/'artifacts/wordpress/inventory.private.json').read_text(encoding='utf-8'))
ssh=['ssh','-T','-i',str(pathlib.Path.home()/'.ssh/guiaproduto_vps_ed25519'),'-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','root@195.35.18.232']
remote=r'''
import pathlib,subprocess,os,time,json,hashlib,tarfile,datetime,shutil
os.umask(0o077)
guard=pathlib.Path(GUARD)
assert guard.is_relative_to(pathlib.Path('/root/geekmusical-security'))
work=guard/('restore-dev-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'));work.mkdir(exist_ok=False)
data=work/'data'
binary=work/'mysqld-development';shutil.copy2('/usr/sbin/mysqld',binary)
sock=work/'mysql.sock'
log=(work/'restore.private.log').open('ab')
def run(args,stdin=None):
 p=subprocess.run(args,stdin=stdin,stdout=subprocess.PIPE,stderr=log,timeout=300)
 if p.returncode:raise RuntimeError('Isolated DEV restore operation failed.')
 return p.stdout.decode()
run([str(binary),'--no-defaults','--initialize-insecure','--basedir=/usr','--user=root','--datadir='+str(data)])
process=subprocess.Popen([str(binary),'--no-defaults','--basedir=/usr','--user=root','--datadir='+str(data),'--skip-networking','--mysqlx=0','--socket='+str(sock),'--pid-file='+str(work/'mysql.pid'),'--log-error='+str(work/'mysql.private.log'),'--innodb-buffer-pool-size=67108864'],stdout=log,stderr=log)
mysql=['mysql','--no-defaults','--socket='+str(sock),'-uroot','--batch','--skip-column-names']
try:
 for attempt in range(60):
  if sock.exists() and subprocess.run(mysql+['-e','SELECT 1'],capture_output=True).returncode==0:break
  if process.poll() is not None:raise RuntimeError('Isolated server did not start.')
  time.sleep(1)
 else:raise RuntimeError('Isolated server readiness timed out.')
 run(mysql+['-e','CREATE DATABASE geek_restore CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;'])
 # Read the archived SQL, not the active database or an unarchived temporary dump.
 with tarfile.open(guard/'wordpress-full.private.tar.gz') as archive:
  for name in ['database.sql','memory.sql']:
   if name in archive.getnames():
    sql=work/name;sql.write_bytes(archive.extractfile(name).read())
    with sql.open('rb') as stream:run(mysql+['geek_restore'],stream)
 def count(where):return int(run(mysql+['geek_restore','-e','SELECT COUNT(*) FROM wp_posts WHERE '+where]).strip())
 result={'environment':'development','isolation':'private socket; networking disabled; separate datadir; no application connection','tables':int(run(mysql+['-e',"SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='geek_restore'"]).strip()),'publishedArticles':count("post_type='post' AND post_status='publish'"),'pages':count("post_type='page' AND post_status='publish'"),'mediaRecords':count("post_type='attachment'"),'publishedStories':count("post_type='web-story' AND post_status='publish'"),'scheduledStories':count("post_type='web-story' AND post_status='future'"),'memoryRows':int(run(mysql+['geek_restore','-e','SELECT COUNT(*) FROM wp_wfls_role_counts']).strip()),'restoration':str(work)}
 assert result['publishedArticles']==149 and result['pages']==8 and result['mediaRecords']==1299 and result['publishedStories']==96 and result['scheduledStories']==10 and result['tables']==104
 run(mysql+['-e',"CHECK TABLE geek_restore.wp_posts, geek_restore.wp_postmeta, geek_restore.wp_wfls_role_counts;"])
 (work/'result.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
finally:
 if process.poll() is None:
  subprocess.run(['mysqladmin','--no-defaults','--socket='+str(sock),'-uroot','shutdown'],stdout=log,stderr=log,timeout=30)
  process.wait(timeout=30)
 log.close()
'''.replace('GUARD',repr(report['guard']))
p=subprocess.run(ssh+['python3','-'],input=remote.encode(),capture_output=True,timeout=900)
if p.returncode:
 (root/'artifacts/wordpress/restore-error.private.log').write_bytes(p.stderr)
 raise SystemExit('Restore verification failed; restricted diagnostic saved.')
result=json.loads(p.stdout);result['archiveSha256']=report['archiveSha256'];result['serverStoppedAfterVerification']=True
(root/'docs/migration/backup-restoration.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result,indent=2))
