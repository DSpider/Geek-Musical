"""Prepare a site-scoped release fetched from the official GitHub repository."""
import pathlib,subprocess,json,hashlib,secrets,re
root=pathlib.Path(__file__).resolve().parents[1]
artifacts=root/'artifacts/deploy';artifacts.mkdir(parents=True,exist_ok=True)
repo='https://github.com/DSpider/Geek-Musical.git'
ssh=['ssh','-T','-i',str(pathlib.Path.home()/'.ssh/guiaproduto_vps_ed25519'),'-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','root@195.35.18.232']
sha=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root).decode().strip();assert re.fullmatch('[a-f0-9]{40}',sha)
assert subprocess.check_output(['git','remote','get-url','origin'],cwd=root).decode().strip()==repo
source=subprocess.check_output(['git','archive','--format=tar',sha],cwd=root);source_digest=hashlib.sha256(source).hexdigest()
env=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import fs from 'node:fs';import dotenv from 'dotenv';process.stdout.write(JSON.stringify(dotenv.parse(fs.readFileSync('.env'))))"],cwd=root))
allowed=['AMAZON_CREDENTIAL_ID','AMAZON_CREDENTIAL_SECRET','AMAZON_CREATORS_VERSION','SHOPEE_APP_ID','SHOPEE_SECRET','MERCADOLIVRE_CLIENT_ID','MERCADOLIVRE_CLIENT_SECRET','adminEmail','adminPassword']
values={k:env[k] for k in allowed if env.get(k)}
assert values.get('adminEmail') and values.get('adminPassword')
values.update({'APP_ENV':'production','NODE_ENV':'production','HOST':'127.0.0.1','PORT':'3230','SITE_URL':'https://www.geekmusical.com.br','PUBLIC_SITE':'true','TRUST_PROXY':'loopback','ADMIN_ENABLED':'true','STATE_DIRECTORY':'/var/lib/geek-musical','ADMIN_DATABASE_FILE':'/var/lib/geek-musical/admin/admin.sqlite','ADMIN_CONTENT_ROOT':'/var/lib/geek-musical/content','SESSION_SECRET':secrets.token_urlsafe(48),'EDITORIAL_PREVIEW':'false','ANALYTICS_ENABLED':'false','ANALYTICS_COLLECTION_ENABLED':'false','ANALYTICS_BROWSER_ENABLED':'false','EDITORIAL_SCHEDULER_ENABLED':'false','AMAZON_PARTNER_TAG':'geekmusical-20','SHOPEE_SUB_ID':'geekmusical','MELI_DEFAULT_TAG':'geekmusical','MELI_CATALOG_ENABLED':'false','MELI_API_SEARCH_ENABLED':'false','MERCADOLIVRE_CREDENTIALS_FILE':'/var/lib/geek-musical/private/mercado-livre-production.json'})
for k,v in values.items():assert re.fullmatch('[a-zA-Z_][a-zA-Z_0-9]*',k) and not any(c in v for c in ['\n','\r','\x00'])
environment=''.join(k+'='+json.dumps(v,ensure_ascii=False)+'\n' for k,v in values.items())
envfile=artifacts/'production.private.env';envfile.write_text(environment,encoding='utf-8')
p=subprocess.run(['scp','-i',str(pathlib.Path.home()/'.ssh/guiaproduto_vps_ed25519'),'-o','BatchMode=yes','-o','StrictHostKeyChecking=yes',str(envfile),'root@195.35.18.232:/root/geekmusical-security/production-incoming.env'],capture_output=True,timeout=60)
if p.returncode:raise SystemExit('Private environment transfer failed.')
remote=r"""
import pathlib,subprocess,os,hashlib,shutil,json,time,urllib.request,tarfile,re
os.umask(0o077)
base=pathlib.Path('/opt/geek-musical');base.mkdir(mode=0o755,exist_ok=True);base.chmod(0o755)
state=pathlib.Path('/var/lib/geek-musical');state.mkdir(mode=0o700,exist_ok=True)
log=(pathlib.Path('/root/geekmusical-security')/'prepare.private.log').open('ab')
def run(args,cwd=None,env=None):
 p=subprocess.run(args,cwd=cwd,env=env,stdout=subprocess.PIPE,stderr=log,timeout=900)
 log.write(p.stdout)
 if p.returncode:raise RuntimeError('Release preparation failed: '+args[0])
 return p.stdout.decode()
runtime=base/'runtime'
version='v22.23.1'
if not (runtime/'bin/node').exists():
 archive=base/'node-runtime.tar.xz';name='node-'+version+'-linux-x64.tar.xz';origin='https://nodejs.org/dist/'+version+'/'
 sums=urllib.request.urlopen(origin+'SHASUMS256.txt',timeout=30).read().decode();expected=next(line.split()[0] for line in sums.splitlines() if line.endswith(' '+name))
 with urllib.request.urlopen(origin+name,timeout=60) as response,archive.open('wb') as output:shutil.copyfileobj(response,output)
 assert hashlib.sha256(archive.read_bytes()).hexdigest()==expected
 runtime.mkdir(mode=0o755)
 run(['tar','-xJf',str(archive),'-C',str(runtime),'--strip-components=1'])
runtime_version=run([str(runtime/'bin/node'),'--version']).strip();assert runtime_version==version
release=base/'releases'/SHA
release.parent.mkdir(mode=0o755,exist_ok=True);release.parent.chmod(0o755)
if not release.exists():
 release.mkdir(mode=0o755)
 run(['git','init',str(release)])
 run(['git','remote','add','origin',REPO],cwd=release)
 run(['git','fetch','--depth=1','origin',SHA],cwd=release)
 run(['git','checkout','--detach',SHA],cwd=release)
assert run(['git','rev-parse','HEAD'],cwd=release).strip()==SHA
archive=subprocess.check_output(['git','archive','--format=tar',SHA],cwd=release);assert hashlib.sha256(archive).hexdigest()==DIGEST
prod_env=pathlib.Path('/etc/geek-musical.env')
if not prod_env.exists():
 shutil.copy2('/root/geekmusical-security/production-incoming.env',prod_env);prod_env.chmod(0o600)
env=os.environ.copy();env['PATH']=str(runtime/'bin')+':'+env['PATH'];env.update({'APP_ENV':'production','NODE_ENV':'production','SITE_URL':'https://www.geekmusical.com.br','PUBLIC_SITE':'true','EDITORIAL_PREVIEW':'false'})
run([str(runtime/'bin/npm'),'ci','--include=dev','--no-audit','--no-fund'],cwd=release,env=env)
run([str(runtime/'bin/npm'),'run','build'],cwd=release,env=env)
scan_env={**env,'CHECK_SECRETS_ENV_FILE':str(prod_env)};run([str(runtime/'bin/npm'),'run','check:secrets'],cwd=release,env=scan_env)
if not (state/'content').exists():shutil.copytree(release/'content',state/'content')
for folder in ['admin','private','backups']:(state/folder).mkdir(mode=0o700,exist_ok=True)
private_env={}
for line in prod_env.read_text().splitlines():
 if '=' in line:k,v=line.split('=',1);private_env[k]=json.loads(v)
bootstrap_env={**env,**private_env}
run([str(runtime/'bin/npx'),'tsx','scripts/bootstrap-admin.ts'],cwd=release,env=bootstrap_env)
run([str(runtime/'bin/npx'),'tsx','scripts/seed-affiliate-evidence.ts'],cwd=release,env=bootstrap_env)
if subprocess.run(['id','geek-musical-app'],capture_output=True).returncode:run(['useradd','--system','--home-dir',str(state),'--shell','/usr/sbin/nologin','geek-musical-app'])
run(['chown','-R','geek-musical-app:geek-musical-app',str(state)])
# Files are readable for the isolated service; only state is writable.
run(['chmod','-R','a+rX',str(release),str(runtime)])
current=base/'current'
if not current.exists():current.symlink_to(release,target_is_directory=True)
else:assert current.resolve()==release
unit='''[Unit]
Description=Geek Musical editorial portal
After=network.target

[Service]
Type=simple
User=geek-musical-app
Group=geek-musical-app
WorkingDirectory=/opt/geek-musical/current
EnvironmentFile=/etc/geek-musical.env
ExecStart=/opt/geek-musical/runtime/bin/node /opt/geek-musical/current/dist/server/index.js --production
Restart=on-failure
RestartSec=3
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/geek-musical
TimeoutStopSec=15

[Install]
WantedBy=multi-user.target
'''
pathlib.Path('/etc/systemd/system/geek-musical.service').write_text(unit);run(['systemctl','daemon-reload']);run(['systemctl','enable','--now','geek-musical'])
for attempt in range(30):
 try:
  with urllib.request.urlopen('http://127.0.0.1:3230/api/health',timeout=2) as response:health=json.load(response)
  if health.get('ok'):break
 except Exception:time.sleep(1)
else:raise RuntimeError('Prepared service health failed.')
manifest={'commit':SHA,'github':REPO,'sourceArchiveSha256':DIGEST,'release':str(release),'runtime':runtime_version,'health':health,'state':str(state),'environment':'production','trafficCutOver':False}
(base/'prepared-release.json').write_text(json.dumps(manifest,indent=2));print(json.dumps(manifest));log.close()
""".replace('SHA',repr(sha)).replace('REPO',repr(repo)).replace('DIGEST',repr(source_digest))
p=subprocess.run(ssh+['python3','-'],input=remote.encode(),capture_output=True,timeout=1800)
(artifacts/'prepare-output.private.log').write_bytes(p.stdout+p.stderr)
if p.returncode:raise SystemExit('Release preparation failed; private diagnostic saved.')
report=json.loads(p.stdout);(root/'docs/migration/prepared-release.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report,indent=2))
