"""Switch only Geek Musical's vhost and rehearse traffic rollback without resetting state."""
import pathlib, subprocess, json, re
root=pathlib.Path(__file__).resolve().parents[1]
ssh=['ssh','-T','-i',str(pathlib.Path.home()/'.ssh/guiaproduto_vps_ed25519'),'-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','root@195.35.18.232']
sha=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root).decode().strip()
assert re.fullmatch('[a-f0-9]{40}',sha)
remote=r"""
import pathlib,subprocess,json,hashlib,datetime,sqlite3,tarfile,os,urllib.request,re
os.umask(0o077)
base=pathlib.Path('/opt/geek-musical');state=pathlib.Path('/var/lib/geek-musical')
prepared=json.loads((base/'prepared-release.json').read_text());assert prepared['commit']==SHA
vhost=pathlib.Path('/etc/nginx/sites-enabled/www.geekmusical.com.br.conf')
def run(args):
 p=subprocess.run(args,capture_output=True,timeout=90)
 if p.returncode:raise RuntimeError('Site operation failed: '+args[0])
 return p.stdout.decode()
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
others={str(p):digest(p) for p in vhost.parent.glob('*') if p.is_file() and p!=vhost}
pids={s:run(['systemctl','show','-p','MainPID','--value',s]).strip() for s in ['guia-produto-production','mago-de-casa']}
assert all(pids.values()) and all(v!='0' for v in pids.values())
assert run(['systemctl','is-active','geek-musical']).strip()=='active'
assert json.load(urllib.request.urlopen('http://127.0.0.1:3230/api/health'))['ok']
before=vhost.read_text()
assert '127.0.0.1:3230' not in before
guard=pathlib.Path('/root/geekmusical-security')/('traffic-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'));guard.mkdir()
(guard/'vhost-wordpress.conf').write_text(before)
conn=sqlite3.connect(state/'admin/admin.sqlite');conn.backup(sqlite3.connect(guard/'admin-before.private.sqlite'));assert conn.execute('PRAGMA integrity_check').fetchone()[0]=='ok';conn.close()
with tarfile.open(guard/'editorial-state.private.tar.gz','w:gz') as archive:archive.add(state/'content',arcname='content')
# Keep the existing canonical redirect and the entire PHP backend unchanged.
start=before.index('server {',before.index('server {')+1);end=before.index('server {',start+1)
proxy='''proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_redirect off;
    proxy_connect_timeout 5s;
    proxy_read_timeout 45s;
'''
node='proxy_pass http://127.0.0.1:3230;\n    '+proxy
wordpress='client_max_body_size 64m;\n    proxy_pass http://127.0.0.1:8080;\n    '+proxy
frontend='''server {
  listen 80;
  listen [::]:80;
  listen 443 ssl http2;
  listen [::]:443 ssl http2;
  ssl_certificate_key /etc/nginx/ssl-certificates/www.geekmusical.com.br.key;
  ssl_certificate /etc/nginx/ssl-certificates/www.geekmusical.com.br.crt;
  server_name www.geekmusical.com.br www1.geekmusical.com.br;
  root /home/geekmusical/htdocs/www.geekmusical.com.br;
  access_log /home/geekmusical/logs/nginx/access.log cloudflare;
  error_log /home/geekmusical/logs/nginx/error.log;
  include /etc/nginx/cloudflare/ips;
  if ($scheme != "https") { return 301 https://www.geekmusical.com.br$request_uri; }
  client_max_body_size 2m;
  set $geek_backend http://127.0.0.1:3230;
  location ^~ /.well-known/ { auth_basic off; allow all; }
  location ~ /\. { deny all; }
  location ^~ /assets/ { NODE }
  location ^~ /fonts/ { NODE }
  location ^~ /brands/ { NODE }
  location = /logo.png { NODE }
  location = /favicon.ico { NODE }
  location = /favicon.png { NODE }
  location ^~ /gm-admin { NODE add_header Cache-Control "no-store" always; }
  location ^~ /api/ { NODE add_header Cache-Control "no-store" always; }
  location = /portal-theme.css { NODE }
  location ^~ /wp-content/ { location ~ \.php(?:/|$) { deny all; } try_files $uri =404; expires 30d; }
  location ^~ /wp-includes/ { location ~ \.php(?:/|$) { deny all; } try_files $uri =404; expires 30d; }
  location ~ ^/(wp-admin(?:/|$)|wp-json(?:/|$)|geeklogin(?:/|$)|web-stories(?:/|$)|web-story(?:/|$)|contato(?:/|$)|geek-musical-inicio(?:/|$)|author(?:/|$)|tag(?:/|$)|wp-sitemap.*|web-story-sitemap.*|author-sitemap.*|attachment(?:/|$)) { WORDPRESS }
  location ~ ^/(cursos|geekmusical|listas)/ { WORDPRESS }
  location ~ \.php$ { WORDPRESS }
  location ~ /feed/?$ { WORDPRESS }
  location / {
    if ($arg_post_type = "web-story") { set $geek_backend http://127.0.0.1:8080; }
    if ($arg_p) { set $geek_backend http://127.0.0.1:8080; }
    if ($arg_page_id) { set $geek_backend http://127.0.0.1:8080; }
    if ($arg_preview) { set $geek_backend http://127.0.0.1:8080; }
    ROOTNODE
  }
}

'''.replace('ROOTNODE',node.replace('proxy_pass http://127.0.0.1:3230;', 'proxy_pass $geek_backend;')).replace('NODE',node).replace('WORDPRESS',wordpress)
after=before[:start]+frontend+before[end:]
(guard/'vhost-node.conf').write_text(after)
def apply(text):
 temp=vhost.with_suffix('.gm-tmp');temp.write_text(text);os.replace(temp,vhost)
 try:run(['nginx','-t']);run(['systemctl','reload','nginx'])
 except Exception:
  vhost.write_text(before);subprocess.run(['nginx','-t'],capture_output=True);subprocess.run(['systemctl','reload','nginx'],capture_output=True);raise
def get(path):return run(['curl','--fail','--silent','--show-error','--max-time','45','--resolve','www.geekmusical.com.br:443:127.0.0.1','https://www.geekmusical.com.br'+path])
try:
 apply(after)
 assert 'musical-hero-gradient' in get('/')
 assert json.loads(get('/api/health'))['environment']=='production'
 assert 'sitemapindex' in get('/sitemap.xml') and 'web-story-sitemap.xml' in get('/sitemap.xml')
 assert 'wp-content' in get('/contato/')
 assert 'wp-content' in get('/web-stories/as-melhores-marcas-de-cavaquinho/')
 # Exercise rollback of traffic only. The Node process and editable state remain active.
 apply(before)
 assert 'musical-hero-gradient' not in get('/') and 'wp-content' in get('/')
 apply(after)
 assert 'musical-hero-gradient' in get('/')
 assert json.loads(get('/api/health'))['ok']
 assert all(digest(pathlib.Path(p))==h for p,h in others.items())
 assert all(run(['systemctl','show','-p','MainPID','--value',s]).strip()==pid for s,pid in pids.items())
except Exception:
 apply(before)
 raise
result={'commit':SHA,'guard':str(guard),'vhost':str(vhost),'beforeSha256':hashlib.sha256(before.encode()).hexdigest(),'afterSha256':hashlib.sha256(after.encode()).hexdigest(),'rollbackTrafficRehearsed':True,'adminStateNotRestoredOrReset':True,'otherVhostsUnchanged':True,'otherServicePidsUnchanged':True,'legacyStoriesAndContactVerified':True,'active':'node','completedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
(base/'traffic-state.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
"""
remote=re.sub(r'\bSHA\b',repr(sha),remote)
p=subprocess.run(ssh+['python3','-'],input=remote.encode(),capture_output=True,timeout=900)
out=root/'artifacts/deploy';out.mkdir(exist_ok=True,parents=True);(out/'cutover.private.log').write_bytes(p.stdout+p.stderr)
if p.returncode:raise SystemExit('Traffic cutover failed and was reverted. Private diagnostics saved.')
result=json.loads(p.stdout);(root/'docs/migration/production-cutover.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8');print(json.dumps(result,indent=2))
