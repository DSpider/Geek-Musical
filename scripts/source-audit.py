import pathlib,json,collections
root=pathlib.Path(__file__).resolve().parents[1]
d=json.loads((root/'artifacts/wordpress/export.private.json').read_text(encoding='utf-8'))
widgets=collections.Counter()
def walk(nodes):
 for n in nodes:
  if n.get('widgetType'):widgets[n['widgetType']]+=1
  walk(n.get('elements',[]))
for m in d['metas'].values():
 if isinstance(m,dict) and m.get('_elementor_data'):walk(json.loads(m['_elementor_data']))
print(json.dumps({'widgets':dict(widgets),'offers':sum(len(v) for v in d['offers'].values()),'bodySizes':[(p['id'],len(p['body'])) for p in d['posts'] if p['status']=='publish'],'categoryAssignments':dict(collections.Counter(cid for pid,cid in d['relations'] if pid in {p['id'] for p in d['posts'] if p['status']=='publish'}))},ensure_ascii=False))
