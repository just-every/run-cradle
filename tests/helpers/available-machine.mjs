import {loadavg} from 'node:os'
import {setTimeout} from 'node:timers/promises'
import {servingLoadThreshold} from '../../scripts/base-cli/cli/server-resources.mjs'

// Follow machine admission before starting a real browser or serving process.
// The CLI retains its own resource guard and is invoked only once.
export async function availableMachine(){
 const threshold=servingLoadThreshold(),deadline=Date.now()+20*60*1000
 while(loadavg()[0]>threshold){
  if(Date.now()>=deadline)throw Error('Machine capacity remained unavailable for 20 minutes.')
  console.log('Waiting for machine capacity before starting the native journey')
  await setTimeout(60000)
 }
}
