/** Bootstrap uses the app's actual Base endpoint; the cookie stays in memory. */
export async function claimOwner(context){
 const {origin,vars,input,store,signal}=context;
 await store.step('Preparing the first owner');
 const response=await fetch(new URL('/auth/bootstrap',origin),{method:'POST',redirect:'manual',signal,headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({token:vars.SETUP_TOKEN,displayName:input.OWNER_NAME??'Owner',returnTo:'/setup'})});
 if(response.status===409){
  const body=await response.json();if(body.error!=='already_initialized')throw context.fail('setup');
  await store.step('Keeping the existing owner');return;
 }
 if(response.status!==303)throw context.fail('setup');
 const cookie=response.headers.get('set-cookie')?.split(';')[0];await response.body?.cancel();
 if(!cookie)throw context.fail('setup');
 const home=await fetch(new URL('/setup',origin),{headers:{cookie},redirect:'manual',signal});
 const finished=home.status===303&&new URL(home.headers.get('location')??'',origin).href===new URL('/app',origin).href;
 if(home.status!==200&&!finished){await home.body?.cancel();throw context.fail('setup');}
 await home.body?.cancel();await store.step('First owner and workspace prepared');
}
