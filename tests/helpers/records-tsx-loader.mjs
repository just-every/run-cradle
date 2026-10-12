import './typescript-loader.mjs'
import {registerHooks} from 'node:module'
import {existsSync,readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import ts from 'typescript'

registerHooks({
 resolve(specifier,context,next){if(specifier.startsWith('.')&&context.parentURL?.startsWith('file:')){const candidate=new URL(specifier,context.parentURL);if(existsSync(fileURLToPath(candidate)+'.tsx'))return next(candidate.href+'.tsx',context)}return next(specifier,context)},
 load(url,context,next){if(url.startsWith('file:')&&url.endsWith('.tsx'))return {format:'module',source:ts.transpileModule(readFileSync(fileURLToPath(url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText,shortCircuit:true};return next(url,context)},
})
