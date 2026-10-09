"""Copy reusable technology, recording hashes; no reference state or credentials."""
import pathlib, shutil, hashlib, json, secrets
root=pathlib.Path(__file__).resolve().parents[1]
ref=pathlib.Path('D:/MagoDeCasa.com.br')
manifest=[]
def copy(src,dst):
 dst.parent.mkdir(parents=True,exist_ok=True)
 shutil.copy2(src,dst)
 manifest.append({'source':str(src),'destination':str(dst.relative_to(root)).replace('\\','/'),'sha256':hashlib.sha256(src.read_bytes()).hexdigest()})
for folder in ['src','server','shared','config']:
 assert not (root/folder).exists(), 'Bootstrap refuses overwriting source'
 for p in (ref/folder).rglob('*'):
  if p.is_file():copy(p,root/folder/p.relative_to(ref/folder))
for name in ['package.json','package-lock.json','tsconfig.json','tsconfig.server.json','vite.config.ts','vitest.config.ts','.gitattributes']:
 copy(ref/name,root/name)
script_names=['build-content.ts','content-check.ts','content-new.ts','check-secrets.ts','check-git-secrets.cjs','wordpress-convert.ts','wordpress-export.php','migrate-wordpress.ts','verify-preservation.ts','blog-link-audit.ts','bootstrap-admin.ts','start-local.ps1','generate-policies.ts','source-audit.py']
for name in script_names:copy(ref/'scripts'/name,root/'scripts'/name)
for folder in ['fonts','brands']:
 for p in (ref/'public'/folder).rglob('*'):
  if p.is_file():copy(p,root/'public'/folder/p.relative_to(ref/'public'/folder))
copy(ref/'public/theme.js',root/'public/theme.js')
for name in ['wordpress-migration.test.ts','admin-writer-lock.test.ts','legacy-offers.test.ts','theme-bootstrap.test.ts','analytics-consent.test.tsx']:
 copy(ref/'tests'/name,root/'tests'/name)
for p in (ref/'tests/helpers').rglob('*'):
 if p.is_file():copy(p,root/'tests/helpers'/p.relative_to(ref/'tests/helpers'))
replacements=[('Mago de Casa','Geek Musical'),('MAGO DE CASA','GEEK MUSICAL'),('magodecasabusca-20','geekmusical-20'),('magodecasa-20','geekmusical-20'),('magodecasa.com.br','geekmusical.com.br'),('mago-de-casa','geek-musical'),('magodecasa','geekmusical'),('mc-admin','gm-admin'),('mc_admin','gm_admin'),('3220','3230'),('gp-home-','gm-home-'),('gp-analytics-','gm-analytics-')]
for folder in ['src','server','shared','config','scripts','tests','public']:
 for p in (root/folder).rglob('*'):
  if p.suffix not in ['.ts','.tsx','.css','.js','.cjs','.html','.json','.ps1','.php','.py'] or p.name in ['bootstrap-project.py','backup-discover.py']:continue
  value=p.read_text(encoding='utf-8-sig')
  for before,after in replacements:value=value.replace(before,after)
  p.write_text(value,encoding='utf-8')
copy(root/'Geek Musical 12x6.png',root/'public/logo.png')
copy(root/'Geek Musical 512 512.png',root/'public/favicon.png')
values={}
for line in (root/'.env').read_text(encoding='utf-8-sig').splitlines():
 if '=' in line and not line.lstrip().startswith('#'):
  k,v=line.split('=',1);values[k.strip()]=v.strip().strip('"').strip("'")
allow=['adminEmailDev','adminPasswordDev','adminEmail','adminPassword','AMAZON_CREDENTIAL_ID','AMAZON_CREDENTIAL_SECRET','AMAZON_CREATORS_VERSION','AMAZON_MARKETPLACE','SHOPEE_APP_ID','SHOPEE_SECRET','MERCADOLIVRE_CLIENT_ID','MERCADOLIVRE_CLIENT_SECRET','MELI_LINKBUILDER_URL','MELI_CREATE_LINK_URL']
env={k:values[k] for k in allow if values.get(k)}
env.update({'HOST':'127.0.0.1','PORT':'3230','SITE_URL':'https://www.geekmusical.com.br','APP_ENV':'development','PUBLIC_SITE':'false','ADMIN_ENABLED':'true','ADMIN_DATABASE_FILE':'artifacts/admin/admin.sqlite','ADMIN_CONTENT_ROOT':'content','EDITORIAL_PREVIEW':'false','EDITORIAL_SCHEDULER_ENABLED':'false','ANALYTICS_COLLECTION_ENABLED':'false','ANALYTICS_SYNC_ENABLED':'false','GSC_SYNC_ENABLED':'false','GA4_SYNC_ENABLED':'false','AMAZON_PARTNER_TAG':'geekmusical-20','MELI_DEFAULT_TAG':'geekmusical','SHOPEE_SUB_ID':'geekmusical','SESSION_SECRET':secrets.token_urlsafe(48),'MAGALU_ENABLED':'false','PAID_API_MONTHLY_BUDGET_BRL':'0'})
(root/'.env').write_text('\n'.join(k+'='+json.dumps(v,ensure_ascii=False) for k,v in env.items())+'\n',encoding='utf-8')
pkg=json.loads((root/'package.json').read_text());pkg['name']='geek-musical'
keep=['dev','start','build','typecheck','admin:migrate','admin:user','admin:content-init','test','check:secrets','format','lint','content:validate','links:check','blog:audit','seo:check','content:new']
pkg['scripts']={k:v for k,v in pkg['scripts'].items() if k in keep}
pkg['scripts'].update({'migration:import':'tsx scripts/migrate-wordpress.ts','migration:verify':'tsx scripts/verify-preservation.ts --preservation-only','admin:bootstrap':'tsx scripts/bootstrap-admin.ts'})
(root/'package.json').write_text(json.dumps(pkg,indent=2)+'\n')
lock=json.loads((root/'package-lock.json').read_text());lock['name']='geek-musical';lock['packages']['']['name']='geek-musical'
(root/'package-lock.json').write_text(json.dumps(lock,indent=2)+'\n')
(root/'.gitignore').write_text('node_modules/\ndist/\nartifacts/\n.env\n.env.*\n!.env.example\n*.sqlite*\n*.private.*\n__pycache__/\n*.log\ncontent/.writer*\ncontent/.journal*\n')
(root/'docs/migration').mkdir(parents=True,exist_ok=True)
(root/'docs/migration/reuse-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'reusedFiles':len(manifest),'reference':'Mago de Casa','independentSecrets':True}))
