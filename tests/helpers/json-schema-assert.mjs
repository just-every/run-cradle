import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

const validator = new Ajv2020({ allErrors: true, strict: false, strictNumbers: true })
addFormats(validator)
const compile = name => validator.compile(JSON.parse(readFileSync(new URL('../../schemas/'+name, import.meta.url), 'utf8')))
const portable = compile('cradle-base-v1.schema.json')
const correspondence = compile('cradle-csv-correspondence-v1.schema.json')

export function assertPortableJsonSchema(value) {
  assert.ok(portable(value), validator.errorsText(portable.errors))
}
export function assertCorrespondenceSchema(value) {
  assert.ok(correspondence(value), validator.errorsText(correspondence.errors))
}
