import {writeFile} from 'node:fs/promises'
import path from 'node:path'
import {sanitizeEvidenceText} from './accessibility-redaction.mjs'

/** Capture the public document state without input values or credential URLs. */
export async function browserFailureDiagnostic(page,output,name){
 const state=await page.evaluate(()=>({path:location.pathname,text:document.body.innerText,busy:[...document.querySelectorAll('[aria-busy]')].map(node=>({busy:node.getAttribute('aria-busy'),role:node.getAttribute('role')})),router:window.__TSR_ROUTER__?.state.status,matches:window.__TSR_ROUTER__?.state.matches.map(match=>({routeId:match.routeId,status:match.status}))}))
 state.text=sanitizeEvidenceText(state.text)
 await writeFile(path.join(output,name+'.json'),JSON.stringify(state,null,2))
}
