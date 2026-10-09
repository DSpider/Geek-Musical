"""Restore Geek Musical's saved WordPress forwarding without changing editable state."""
import pathlib,subprocess,json
root=pathlib.Path(__file__).resolve().parents[1]
ssh=['ssh','-T','-i',str(pathlib.Path.home()/'.ssh/guiaproduto_vps_ed25519'),'-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','root@195.35.18.232']
remote=r'''
import pathlib,subprocess,json,hashlib,os
base=pathlib.Path('/opt/geek-musical');report=json.loads((base/'traffic-state.json').read_text())
guard=pathlib.Path(report['guard']).resolve();assert guard.is_relative_to(pathlib.Path('/root/geekmusical-security'))
vhost=pathlib.Path('/etc/nginx/sites-enabled/www.geekmusical.com.br.conf');current=vhost.read_bytes()
saved=(guard/'vhost-wordpress.conf').read_bytes();assert hashlib.sha256(saved).hexdigest()==report['beforeSha256']
assert hashlib.sha256(current).hexdigest() in [report['beforeSha256'],report['afterSha256']]
vhost.write_bytes(saved)
try:
 subprocess.run(['nginx','-t'],check=True,capture_output=True);subprocess.run(['systemctl','reload','nginx'],check=True,capture_output=True)
except Exception:vhost.write_bytes(current);raise
report.update({'active':'wordpress','adminStateNotRestoredOrReset':True});(base/'traffic-state.json').write_text(json.dumps(report,indent=2));print(json.dumps({'active':'wordpress','statePreserved':True}))
'''
p=subprocess.run(ssh+['python3','-'],input=remote.encode(),capture_output=True,timeout=120)
if p.returncode:raise SystemExit('Rollback failed; inspect restricted remote diagnostics.')
print(p.stdout.decode())
