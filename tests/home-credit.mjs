import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import ts from 'typescript'
import { renderToStaticMarkup } from 'react-dom/server'
import { contract } from './contract.mjs'
contract('HOME-002', 'actual footer renders static credit by default and configuration can remove it completely',async()=>{
 const source=await readFile('src/core/app/ui/footer-credit.tsx','utf8')
 const code=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS}}).outputText
 const exports={};new Function('require','exports',code)(createRequire(import.meta.url),exports)
 const shown=renderToStaticMarkup(exports.FooterCredit({productName:'Cradle',visible:true}))
 assert.match(shown,/Powered by Cradle/);assert.match(shown,/href="https:\/\/runeditrun.com"/)
 assert.doesNotMatch(shown,/<script|<img|fetch\(/)
 assert.equal(renderToStaticMarkup(exports.FooterCredit({productName:'Cradle',visible:false})),'')
 assert.match(await readFile('src/ext/config.ts','utf8'),/showPoweredByCredit: true/)
})
