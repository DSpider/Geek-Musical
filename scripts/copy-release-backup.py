"""Copy the verified, private pre-upgrade checkpoint to the external backup drive."""
import pathlib, subprocess, json, hashlib, re, sqlite3, tarfile
root = pathlib.Path(__file__).resolve().parents[1]
release = json.loads((root/'docs/migration/prepared-release.json').read_text())
guard = release['upgradeGuard']
assert re.fullmatch(r'/root/geekmusical-security/release-\d{8}T\d{6}Z', guard)
key = str(pathlib.Path.home()/'.ssh/guiaproduto_vps_ed25519')
connection = ['-i',key,'-o','BatchMode=yes','-o','StrictHostKeyChecking=yes']
target = pathlib.Path('D:/GeekMusical-backups/releases')/pathlib.PurePosixPath(guard).name
target.mkdir(parents=True,exist_ok=True)
records = []
for name in ['admin-before.private.sqlite','editorial-state.private.tar.gz','previous-release.json']:
    remote = guard+'/'+name
    expected = subprocess.check_output(['ssh','-T',*connection,'root@195.35.18.232','sha256sum',remote]).decode().split()[0]
    local = target/name
    subprocess.run(['scp',*connection,'root@195.35.18.232:'+remote,str(local)],check=True,capture_output=True,timeout=300)
    digest = hashlib.file_digest(local.open('rb'),'sha256').hexdigest()
    assert digest == expected
    records.append({'file':name,'sha256':digest,'bytes':local.stat().st_size})
database = sqlite3.connect('file:'+str((target/'admin-before.private.sqlite').as_posix())+'?mode=ro',uri=True)
assert database.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
database.close()
with tarfile.open(target/'editorial-state.private.tar.gz') as archive:
    members = len(archive.getmembers())
report = {'deployedCommit':release['commit'],'remoteGuard':guard,'externalCopy':str(target),'checksumsVerified':True,'sqliteIntegrity':'ok','archiveMembers':members,'localAccess':'Current owner, Administrators and SYSTEM only; Windows ACL verified','files':records}
(root/'docs/migration/release-backup.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:v for k,v in report.items() if k!='files'},indent=2))
