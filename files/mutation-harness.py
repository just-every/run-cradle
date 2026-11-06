from pathlib import Path
import datetime,json,subprocess,sys
root=Path('/workspace/run-cradle')
packet=Path.home()/'rer-consolidation/work/sd-cradle-c-f178/packet'
repo=root/'src/core/features/campaigns/repository.ts'
render=root/'src/core/features/portfolio/ui/activity-presentation.ts'
originals={path:path.read_text() for path in (repo,render)}
results=[]
def run(name,command):
 with (packet/(name+'.log')).open('w') as stream:
  result=subprocess.run(command,cwd=root,stdout=stream,stderr=subprocess.STDOUT)
 text=(packet/(name+'.log')).read_text()
 return result.returncode,text
try:
 for name,path,before,after,mode,failure in [
  ('M1-repository-order',repo,'ORDER BY createdAt DESC, id DESC','ORDER BY createdAt ASC, id ASC','native','Public campaign detail returns the authored edits newest first'),
  ('M2-rendered-order',render,'return [...groups.values()].map(facts =>','return [...groups.values()].reverse().map(facts =>','browser','Initially collapsed activity groups already show reverse authored write order'),
 ]:
  assert path.read_text().count(before)==1
  path.write_text(path.read_text().replace(before,after))
  build_exit,_=run(name+'-build',['npx','-y','@runeditrun/rer','build'])
  assert build_exit==0,(name,'build failed')
  code,text=run(name,['timeout','300','node','/tmp/cradle-activity-probe.mjs',mode])
  row={'id':name,'mutation':{'file':str(path.relative_to(root)),'before':before,'after':after},'command':['node','/tmp/cradle-activity-probe.mjs',mode],'buildExit':build_exit,'exit':code,'expectedFailure':failure,'observedExpectedFailure':failure in text,'timestamp':datetime.datetime.now(datetime.timezone.utc).isoformat()}
  results.append(row)
  print(json.dumps(row),flush=True)
  path.write_text(originals[path])
  assert code!=0 and failure in text,(name,'mutation did not fail on the intended assertion')
finally:
 for path,source in originals.items():path.write_text(source)
 restore_exit,_=run('restored-production-build',['npx','-y','@runeditrun/rer','build'])
 receipt={'mutations':results,'productionSourcesRestored':all(path.read_text()==text for path,text in originals.items()),'restoredBuildExit':restore_exit}
 (packet/'MUTATIONS.json').write_text(json.dumps(receipt,indent=2)+'\n')
 print('RESTORE_BUILD exit='+str(restore_exit),flush=True)
