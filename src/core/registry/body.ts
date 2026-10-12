import { ApiError } from './errors'
export async function readJsonBody(request: Request, maximumBytes = 1048576): Promise<unknown> {
  if (Number(request.headers.get('content-length') ?? 0) > maximumBytes) throw new ApiError('upload_rejected', 'Request body exceeds its byte limit.')
  if (!request.body) throw new ApiError('validation', 'A JSON request body is required.')
  const reader=request.body.getReader(),parts:Uint8Array[]=[]
  let bytes=0
  try {
    while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>maximumBytes){await reader.cancel();throw new ApiError('upload_rejected','Request body exceeds its byte limit.')}parts.push(part.value)}
  } finally { reader.releaseLock() }
  const joined=new Uint8Array(bytes);let position=0
  for(const part of parts){joined.set(part,position);position+=part.byteLength}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(joined))}catch{throw new ApiError('validation','A valid UTF-8 JSON request body is required.')}
}
