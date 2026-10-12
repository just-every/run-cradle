import { registerHooks } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
registerHooks({
  resolve(specifier,context,next) {
    if ((specifier.startsWith('.') || specifier.startsWith('/')) && context.parentURL?.startsWith('file:')) {
      const candidate=new URL(specifier,context.parentURL)
      for(const suffix of ['.ts','/index.ts']) if(existsSync(fileURLToPath(candidate)+suffix))return next(candidate.href+suffix,context)
    }
    return next(specifier,context)
  },
  load(url,context,next) {
    if(url.startsWith('file:')&&url.endsWith('.ts'))return {format:'module',source:ts.transpileModule(readFileSync(fileURLToPath(url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ESNext}}).outputText,shortCircuit:true}
    return next(url,context)
  },
})
