import { HTTPException } from 'hono/http-exception'
import type { z } from 'zod'

export const parseJson = async <Schema extends z.ZodType>(request: Request, schema: Schema): Promise<z.output<Schema>> => {
  let input: unknown

  try {
    input = await request.json()
  } catch {
    throw new HTTPException(400, { message: 'Request body must be valid JSON.' })
  }

  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.issues.map((issue) => issue.message).join('; ') })
  }

  return parsed.data
}

export const requirePathParam = (value: string | undefined, name: string) => {
  if (!value) throw new HTTPException(400, { message: `Missing ${name}.` })
  return value
}
